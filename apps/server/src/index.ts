import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MemoryStore } from "./store/memory.js";
import { PostgresStore } from "./store/postgres.js";
import type { Store } from "./store/types.js";

const config = loadConfig();
const store: Store = config.databaseUrl ? new PostgresStore(config.databaseUrl) : new MemoryStore();
await store.init();

const { app } = await buildApp(config, store);
await app.listen({ port: config.port, host: config.host });
app.log.info(`QuickPlay server on :${config.port} (store: ${config.databaseUrl ? "postgres" : "memory"})`);

const shutdown = async () => {
  await app.close();
  await store.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
