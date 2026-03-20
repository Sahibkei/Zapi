import type { FastifyInstance } from "fastify";
import { buildServer } from "../apps/api/src/server";

let serverPromise: Promise<FastifyInstance> | undefined;

async function getServer(): Promise<FastifyInstance> {
  serverPromise ??= buildServer().then(async (server) => {
    await server.ready();
    return server;
  });

  return serverPromise;
}

function extractPayload(method: string, bodyText: string): string | undefined {
  if (method === "GET" || method === "HEAD" || bodyText.length === 0) {
    return undefined;
  }

  return bodyText;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const server = await getServer();
    const url = new URL(request.url);
    const bodyText = await request.text();
    const response = await server.inject({
      method: request.method,
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(request.headers.entries()),
      payload: extractPayload(request.method, bodyText),
      remoteAddress: request.headers.get("x-forwarded-for") ?? undefined
    });

    const headers = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(key, item);
        }
        continue;
      }

      if (typeof value !== "undefined") {
        headers.set(key, String(value));
      }
    }

    return new Response(response.body, {
      status: response.statusCode,
      headers
    });
  }
};
