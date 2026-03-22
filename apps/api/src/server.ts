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

function renderLandingPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zapi</title>
    <style>
      :root {
        --bg: #09131d;
        --panel: rgba(12, 28, 43, 0.82);
        --text: #eef5ff;
        --muted: #9db3cb;
        --line: rgba(170, 202, 235, 0.18);
        --accent: #2bc5b4;
        --accent-2: #f3b14c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(43, 197, 180, 0.18), transparent 32%),
          radial-gradient(circle at 85% 15%, rgba(243, 177, 76, 0.2), transparent 24%),
          linear-gradient(180deg, #071019 0%, #0b1724 100%);
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 48px 24px 72px;
      }
      .hero {
        display: grid;
        gap: 24px;
        padding: 36px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        backdrop-filter: blur(12px);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.3);
      }
      .eyebrow {
        display: inline-flex;
        width: fit-content;
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid rgba(43, 197, 180, 0.35);
        color: var(--accent);
        font-size: 0.84rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.8rem, 8vw, 5.3rem);
        line-height: 0.96;
        max-width: 10ch;
      }
      .lede {
        max-width: 62ch;
        color: var(--muted);
        font-size: 1.05rem;
        line-height: 1.7;
      }
      .grid {
        display: grid;
        gap: 18px;
        margin-top: 24px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .card {
        padding: 20px;
        border-radius: 22px;
        background: rgba(16, 36, 58, 0.72);
        border: 1px solid var(--line);
      }
      .card h2 {
        margin: 0 0 10px;
        font-size: 1.1rem;
      }
      .card p, .card li {
        color: var(--muted);
        line-height: 1.6;
      }
      .list {
        margin: 0;
        padding-left: 18px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px 18px;
        border-radius: 999px;
        text-decoration: none;
        font-weight: 700;
        color: #06131b;
        background: var(--accent);
      }
      .button.secondary {
        color: var(--text);
        background: transparent;
        border: 1px solid rgba(243, 177, 76, 0.45);
      }
      code {
        font-family: "Courier New", monospace;
        color: var(--accent-2);
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="eyebrow">Zapi / Plans And Access</span>
        <h1>Live fundamentals with plan-aware access.</h1>
        <p class="lede">
          Zapi is now structured for site-linked auth, plan tiers, region gating, and request limits.
          Anonymous traffic can use the public SEC layer, while signed site users can unlock higher
          limits and more regimes.
        </p>
        <div class="actions">
          <a class="button" href="/docs">Open API docs</a>
          <a class="button secondary" href="/auth">Auth and plans</a>
          <a class="button secondary" href="/integration">Integration guide</a>
          <a class="button secondary" href="/v1/regimes">Inspect regime status</a>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Endpoints</h2>
          <ul class="list">
            <li><code>GET /v1/regimes</code></li>
            <li><code>GET /v1/auth/status</code></li>
            <li><code>GET /v1/statements/:identifier</code></li>
          </ul>
        </article>
        <article class="card">
          <h2>Plan model</h2>
          <ul class="list">
            <li><code>public</code>: anonymous SEC access</li>
            <li><code>free</code>: signed US starter access</li>
            <li><code>plus</code>: paid US access with a higher cap</li>
            <li><code>pro</code>: full configured regime access</li>
          </ul>
        </article>
        <article class="card">
          <h2>Site integration</h2>
          <p>Use a signed site bearer token or a service key for your backend. The API returns limit headers so your site can show current usage and upgrade paths.</p>
        </article>
      </section>
    </main>
  </body>
</html>`;
}

function renderIntegrationPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zapi Integration</title>
    <style>
      :root {
        --bg: #0a1018;
        --panel: #101c2b;
        --text: #eef5ff;
        --muted: #9bb0c9;
        --line: rgba(163, 190, 216, 0.15);
        --accent: #d8bf67;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at top right, rgba(216, 191, 103, 0.12), transparent 28%),
          linear-gradient(180deg, #071019 0%, #0b1622 100%);
        color: var(--text);
        font-family: Georgia, "Times New Roman", serif;
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 40px 24px 72px;
      }
      .panel {
        background: rgba(16, 28, 43, 0.86);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 28px;
        margin-bottom: 18px;
      }
      h1, h2 { margin-top: 0; }
      p, li { color: var(--muted); line-height: 1.65; }
      pre {
        overflow: auto;
        padding: 16px;
        border-radius: 16px;
        background: #08121d;
        border: 1px solid var(--line);
      }
      code, pre {
        font-family: "Courier New", monospace;
      }
      a { color: var(--accent); }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Integration Guide</h1>
        <p>Use the normalized endpoint for app logic and the matrix endpoint for Morningstar-style rendering. Signed site users can be mapped to free, plus, or pro without changing the statement contract.</p>
      </section>
      <section class="panel">
        <h2>Recommended endpoint patterns</h2>
        <pre><code>GET /v1/statements/AAPL?regime=sec_edgar&statement=income_statement&frequency=annual&format=normalized&periods=5&includeTtm=true
GET /v1/statements/AAPL?regime=sec_edgar&statement=income_statement&frequency=annual&format=normalized&periods=5&view=as_reported
GET /v1/auth/status
GET /v1/regimes</code></pre>
      </section>
      <section class="panel">
        <h2>Frontend flow</h2>
        <pre><code>const response = await fetch(
  "/v1/statements/AAPL?regime=sec_edgar&statement=income_statement&format=normalized",
  {
    headers: {
      Authorization: \`Bearer \${siteToken}\`
    }
  }
);

const statement = await response.json();
const plan = response.headers.get("x-zapi-plan");
const remaining = response.headers.get("x-ratelimit-remaining");</code></pre>
      </section>
      <section class="panel">
        <h2>Region gating</h2>
        <p><code>public</code>, <code>free</code>, and <code>plus</code> stay on <code>sec_edgar</code>. <code>pro</code> unlocks all configured regimes as source readiness improves.</p>
      </section>
      <section class="panel">
        <h2>Rate-limit headers</h2>
        <p>Statement responses include <code>x-ratelimit-limit</code>, <code>x-ratelimit-remaining</code>, <code>x-ratelimit-reset</code>, and <code>x-zapi-plan</code>.</p>
      </section>
      <section class="panel">
        <p><a href="/">Back to landing page</a> | <a href="/auth">Auth and plans</a> | <a href="/docs">Open Swagger docs</a></p>
      </section>
    </main>
  </body>
</html>`;
}

function renderAuthPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zapi Auth</title>
    <style>
      :root {
        --bg: #0b1320;
        --panel: #132032;
        --text: #f1f7ff;
        --muted: #a7b9cf;
        --line: rgba(166, 192, 222, 0.18);
        --accent: #48d4a3;
        --warn: #e6b86a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(72, 212, 163, 0.14), transparent 28%),
          linear-gradient(180deg, #08111b 0%, #0c1725 100%);
        font-family: Georgia, "Times New Roman", serif;
      }
      main {
        max-width: 1180px;
        margin: 0 auto;
        padding: 40px 24px 72px;
      }
      .panel {
        background: rgba(19, 32, 50, 0.9);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 28px;
        margin-bottom: 18px;
      }
      .grid {
        display: grid;
        gap: 18px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid var(--line);
        color: var(--muted);
      }
      th {
        color: var(--text);
      }
      pre {
        overflow: auto;
        padding: 16px;
        border-radius: 16px;
        background: #08121d;
        border: 1px solid var(--line);
      }
      code, pre {
        font-family: "Courier New", monospace;
      }
      h1, h2 { margin-top: 0; }
      p, li { color: var(--muted); line-height: 1.65; }
      .tag {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(72, 212, 163, 0.12);
        color: var(--accent);
      }
      a { color: var(--warn); }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <span class="tag">Site-linked auth</span>
        <h1>Auth and plans</h1>
        <p>Zapi is structured so your site can sign users in, mint a bearer token with the user plan, and let the API enforce request limits and region access without duplicating billing logic inside every route.</p>
      </section>
      <section class="panel">
        <h2>Plan matrix</h2>
        <table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Requests/hour</th>
              <th>Regions</th>
              <th>Use case</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>public</td>
              <td>60</td>
              <td>SEC</td>
              <td>Anonymous discovery traffic</td>
            </tr>
            <tr>
              <td>free</td>
              <td>100</td>
              <td>SEC</td>
              <td>Signed starter access</td>
            </tr>
            <tr>
              <td>plus</td>
              <td>500</td>
              <td>SEC</td>
              <td>Paid US-only access</td>
            </tr>
            <tr>
              <td>pro</td>
              <td>2000</td>
              <td>All configured regimes</td>
              <td>Paid users with broader coverage</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Bearer token contract</h2>
        <p>Use an HS256 JWT from your site backend. Required claims are <code>sub</code>, <code>plan</code>, <code>iss</code>, <code>aud</code>, and <code>exp</code>.</p>
        <pre><code>{
  "sub": "user_123",
  "email": "user@example.com",
  "name": "Example User",
  "plan": "free",
  "iss": "zedxe",
  "aud": "zapi-api",
  "exp": 1767225600
}</code></pre>
      </section>
      <section class="panel">
        <h2>Backend service key</h2>
        <p>Your site backend can also call Zapi with <code>x-zapi-api-key</code> for server-to-server traffic. Configure keys with <code>ZAPI_SERVICE_KEYS</code>. Internal service keys can still use a separate <code>scale</code> plan if you want a non-user backend tier.</p>
      </section>
      <section class="panel">
        <h2>Environment</h2>
        <ul>
          <li><code>ZAPI_JWT_SECRET</code>: shared secret used to verify site JWTs</li>
          <li><code>ZAPI_JWT_ISSUER</code>: expected issuer from your site backend</li>
          <li><code>ZAPI_JWT_AUDIENCE</code>: expected audience for Zapi tokens</li>
          <li><code>ZAPI_SERVICE_KEYS</code>: JSON object of backend service keys and plans</li>
        </ul>
      </section>
      <section class="panel">
        <p><a href="/">Back to landing page</a> | <a href="/integration">Integration guide</a> | <a href="/docs">Open Swagger docs</a></p>
      </section>
    </main>
  </body>
</html>`;
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
    reply.type("text/html").send(renderLandingPage());
  });

  server.get("/integration", async (_, reply) => {
    reply.type("text/html").send(renderIntegrationPage());
  });

  server.get("/auth", async (_, reply) => {
    reply.type("text/html").send(renderAuthPage());
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
