import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import {
  PLAN_DEFINITIONS,
  createAuthResolver,
  createInMemoryRateLimiter,
  createStatementService,
  formatMatrixStatement,
  formatNormalizedStatement,
  isZapiError,
  parseServiceKeys,
  requireRegimeAccess,
  StatementRequestSchema,
  type AuthContext,
  type RateLimitResult,
  type StatementQueryInput,
  type StatementSourceRegime
} from "../../../packages/core/src";
import { createCompaniesHouseClient } from "../../../packages/adapters/companies-house/src";
import { createEdinetClient } from "../../../packages/adapters/edinet/src";
import { createIndiaPlaceholderClient } from "../../../packages/adapters/india/src";
import { createSecEdgarClient } from "../../../packages/adapters/sec-edgar/src";

const MARKETING_API_HOME_URL = "https://zedxe.com/api";
const MARKETING_API_DOCS_URL = "https://zedxe.com/api/docs";

function redirectTo(reply: { redirect: (url: string, statusCode?: number) => unknown }, url: string): void {
  reply.redirect(url, 308);
}

function resolveAuthContext(
  request: FastifyRequest,
  authResolver: ReturnType<typeof createAuthResolver>
): AuthContext {
  return authResolver.resolve({
    authorization: typeof request.headers.authorization === "string"
      ? request.headers.authorization
      : undefined,
    apiKey: typeof request.headers["x-zapi-api-key"] === "string"
      ? request.headers["x-zapi-api-key"]
      : undefined,
    remoteAddress: request.ip
  });
}

function applyRateLimitHeaders(reply: { header: (name: string, value: string | number) => unknown }, auth: AuthContext, rateLimit: RateLimitResult): void {
  reply.header("x-zapi-plan", auth.plan.id);
  reply.header("x-ratelimit-limit", rateLimit.limit);
  reply.header("x-ratelimit-remaining", rateLimit.remaining);
  reply.header("x-ratelimit-reset", rateLimit.resetAt);
}

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true
  });

  const secEdgarClient = createSecEdgarClient({
    userAgent: process.env.SEC_USER_AGENT ?? "Zapi Dev dev@zapi.local"
  });
  const companiesHouseClient = createCompaniesHouseClient({
    apiKey: process.env.COMPANIES_HOUSE_API_KEY
  });
  const edinetClient = createEdinetClient();
  const indiaClient = createIndiaPlaceholderClient();
  const statementService = createStatementService({
    secEdgarClient,
    companiesHouseClient,
    edinetClient,
    indiaClient
  });
  const authResolver = createAuthResolver({
    jwtSecret: process.env.ZAPI_JWT_SECRET,
    jwtIssuer: process.env.ZAPI_JWT_ISSUER ?? "zedxe",
    jwtAudience: process.env.ZAPI_JWT_AUDIENCE ?? "zapi-api",
    serviceKeys: parseServiceKeys(process.env.ZAPI_SERVICE_KEYS)
  });
  const rateLimiter = createInMemoryRateLimiter();

  await server.register(cors, {
    origin: true
  });

  await server.register(swagger, {
    openapi: {
      info: {
        title: "Zapi API",
        version: "0.1.0",
        description: "Live-pull fundamentals API with federated adapters, plan-aware auth, and request limits."
      }
    }
  });

  await server.register(swaggerUi, {
    routePrefix: "/docs"
  });

  server.get("/", async (_, reply) => {
    redirectTo(reply, MARKETING_API_HOME_URL);
  });

  server.get("/integration", async (_, reply) => {
    redirectTo(reply, MARKETING_API_DOCS_URL);
  });

  server.get("/auth", async (_, reply) => {
    redirectTo(reply, `${MARKETING_API_DOCS_URL}#auth`);
  });

  server.get("/health", async () => ({
    status: "ok",
    service: "zapi",
    timestamp: new Date().toISOString()
  }));

  server.get("/v1/regimes", async () => ({
    regimes: statementService.listRegimes()
  }));

  server.get(
    "/v1/auth/status",
    {
      schema: {
        summary: "Inspect the current auth context, plan, and region access",
        headers: {
          type: "object",
          properties: {
            authorization: {
              type: "string",
              description: "Bearer site token"
            },
            "x-zapi-api-key": {
              type: "string",
              description: "Server-to-server API key"
            }
          }
        }
      }
    },
    async (request, reply) => {
      const auth = resolveAuthContext(request, authResolver);
      const rateLimit = rateLimiter.consume(auth, "auth_status");
      applyRateLimitHeaders(reply, auth, rateLimit);

      return {
        authMode: auth.mode,
        subject: auth.subject,
        email: auth.email,
        displayName: auth.displayName,
        plan: auth.plan.id,
        limits: {
          requestsPerHour: auth.plan.requestsPerHour,
          remainingThisHour: rateLimit.remaining,
          resetAt: rateLimit.resetAt
        },
        allowedRegimes: auth.plan.regimes,
        features: auth.plan.features
      };
    }
  );

  server.get<{
    Params: { identifier: string };
    Querystring: StatementQueryInput;
  }>(
    "/v1/statements/:identifier",
    {
      schema: {
        summary: "Fetch a canonical statement for an issuer identifier",
        headers: {
          type: "object",
          properties: {
            authorization: {
              type: "string",
              description: "Bearer site token"
            },
            "x-zapi-api-key": {
              type: "string",
              description: "Server-to-server API key"
            }
          }
        },
        params: {
          type: "object",
          required: ["identifier"],
          properties: {
            identifier: {
              type: "string",
              description: "Ticker, company number, or regime-specific issuer identifier"
            }
          }
        },
        querystring: {
          type: "object",
          properties: {
            regime: {
              type: "string",
              enum: ["sec_edgar", "companies_house", "edinet", "india_placeholder"],
              description: "Upstream filing regime"
            },
            statement: {
              type: "string",
              enum: ["income_statement", "balance_sheet", "cash_flow"]
            },
            frequency: {
              type: "string",
              enum: ["annual", "quarterly"]
            },
            view: {
              type: "string",
              enum: ["restated", "as_reported"]
            },
            format: {
              type: "string",
              enum: ["normalized", "matrix"]
            },
            periods: {
              type: "integer",
              minimum: 1,
              maximum: 20
            },
            includeTtm: {
              type: "boolean",
              description: "Append a TTM column for quarterly duration statements when economically valid"
            },
            debug: {
              type: "boolean",
              description: "Include source trace data and canonical facts in the response"
            }
          }
        }
      }
    },
    async (request, reply) => {
      const input = StatementRequestSchema.parse({
        ticker: request.params.identifier,
        regime: request.query.regime,
        statement: request.query.statement,
        frequency: request.query.frequency,
        view: request.query.view,
        format: request.query.format,
        periods: request.query.periods,
        includeTtm: request.query.includeTtm,
        debug: request.query.debug
      });

      const auth = resolveAuthContext(request, authResolver);
      requireRegimeAccess(auth, input.regime as StatementSourceRegime);
      const rateLimit = rateLimiter.consume(auth, "statements");
      applyRateLimitHeaders(reply, auth, rateLimit);

      const statement = await statementService.getStatement(input);
      if (input.format === "matrix") {
        return formatMatrixStatement(statement);
      }

      return formatNormalizedStatement(statement, { debug: input.debug });
    }
  );

  server.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (isZapiError(error)) {
      reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
        details: error.details
      });
      return;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "issues" in error
    ) {
      reply.status(400).send({
        error: "ValidationError",
        message: "Invalid request",
        details: error.issues
      });
      return;
    }

    reply.status(500).send({
      error: "InternalServerError",
      message: "Unexpected server error"
    });
  });

  return server;
}
