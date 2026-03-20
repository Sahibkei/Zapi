import { buildServer } from "../apps/api/src/server";

async function start(): Promise<void> {
  const server = await buildServer();
  const port = Number(process.env.PORT ?? "3000");
  const host = process.env.HOST ?? "0.0.0.0";

  await server.listen({ port, host });
  server.log.info(`Zapi listening on http://${host}:${port}`);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
