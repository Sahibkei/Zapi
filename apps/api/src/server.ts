import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createStatementService,
  formatNormalizedStatement,
  formatMatrixStatement,
  isZapiError,
  StatementRequestSchema,
  type StatementQueryInput
} from "../../../packages/core/src";
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
        <span class="eyebrow">Zapi / SEC-first MVP</span>
        <h1>Live fundamentals without a warehouse.</h1>
        <p class="lede">
          Zapi pulls official filing data on demand, normalizes it into a stable house contract,
          and returns either machine-first JSON or a Morningstar-style matrix for direct site use.
        </p>
        <div class="actions">
          <a class="button" href="/docs">Open API docs</a>
          <a class="button secondary" href="/integration">Integration guide</a>
          <a class="button secondary" href="/v1/statements/AAPL?statement=income_statement&format=normalized">Try AAPL income statement</a>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Endpoints</h2>
          <ul class="list">
            <li><code>GET /health</code></li>
            <li><code>GET /docs</code></li>
            <li><code>GET /v1/statements/:ticker</code></li>
          </ul>
        </article>
        <article class="card">
          <h2>MVP support</h2>
          <ul class="list">
            <li>SEC EDGAR live pull</li>
            <li>Annual and quarterly statements</li>
            <li>Optional TTM on income and cash flow</li>
            <li><code>restated</code> and <code>as_reported</code> views</li>
            <li><code>normalized</code> and <code>matrix</code> formats</li>
          </ul>
        </article>
        <article class="card">
          <h2>Contract example</h2>
          <p>Try <code>?statement=income_statement&frequency=quarterly&includeTtm=true</code> or <code>?view=as_reported</code>. Add <code>&debug=true</code> only when you need source trace facts.</p>
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
        <p>Use the normalized endpoint for app logic and the matrix endpoint for Morningstar-style rendering.</p>
      </section>
      <section class="panel">
        <h2>Recommended endpoint patterns</h2>
        <pre><code>GET /v1/statements/AAPL?statement=income_statement&frequency=annual&format=normalized&periods=5&includeTtm=true
GET /v1/statements/AAPL?statement=income_statement&frequency=annual&format=normalized&periods=5&view=as_reported
GET /v1/statements/JPM?statement=income_statement&frequency=quarterly&format=normalized&periods=4&includeTtm=true
GET /v1/statements/MSFT?statement=cash_flow&frequency=annual&format=matrix&periods=3&includeTtm=true</code></pre>
      </section>
      <section class="panel">
        <h2>React usage</h2>
        <pre><code>const response = await fetch(
  "/v1/statements/AAPL?statement=income_statement&frequency=annual&format=normalized&periods=5&includeTtm=true"
);
const statement = await response.json();

statement.columns;
statement.rows;
statement.periods["2025"].revenue_total;</code></pre>
      </section>
      <section class="panel">
        <h2>Debug trace</h2>
        <p>Add <code>debug=true</code> only when you need source concepts and accession trace data for inspection or QA.</p>
      </section>
      <section class="panel">
        <h2>View selection</h2>
        <p><code>view=restated</code> returns the latest filing for a period. <code>view=as_reported</code> returns the earliest filing for that same period, which is useful when later amendments changed the numbers.</p>
      </section>
      <section class="panel">
        <p><a href="/">Back to landing page</a> · <a href="/docs">Open Swagger docs</a></p>
      </section>
    </main>
  </body>
</html>`;
}

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true
  });

  const secEdgarClient = createSecEdgarClient({
    userAgent: process.env.SEC_USER_AGENT ?? "Zapi Dev dev@zapi.local"
  });
  const statementService = createStatementService({ secEdgarClient });

  await server.register(cors, {
    origin: true
  });

  await server.register(swagger, {
    openapi: {
      info: {
        title: "Zapi API",
        version: "0.1.0",
        description: "Live-pull fundamentals API with SEC-first coverage."
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

  server.get("/health", async () => ({
    status: "ok",
    service: "zapi",
    timestamp: new Date().toISOString()
  }));

  server.get<{
    Params: { ticker: string };
    Querystring: StatementQueryInput;
  }>(
    "/v1/statements/:ticker",
    {
      schema: {
        summary: "Fetch a canonical statement for a ticker",
        params: {
          type: "object",
          required: ["ticker"],
          properties: {
            ticker: { type: "string", description: "Exchange ticker symbol" }
          }
        },
        querystring: {
          type: "object",
          properties: {
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
              maximum: 10
            },
            includeTtm: {
              type: "boolean",
              description: "Append a TTM column when economically valid"
            },
            debug: {
              type: "boolean",
              description: "Include source trace data and canonical facts in the response"
            }
          }
        }
      }
    },
    async (request) => {
      const input = StatementRequestSchema.parse({
        ticker: request.params.ticker,
        statement: request.query.statement,
        frequency: request.query.frequency,
        view: request.query.view,
        format: request.query.format,
        periods: request.query.periods,
        includeTtm: request.query.includeTtm,
        debug: request.query.debug
      });

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
