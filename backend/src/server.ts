import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import { config } from "./config";
import { logger } from "./config/logger";
import { initElasticsearch } from "./config/elasticsearch";
import { startEmailWorker } from "./workers/emailWorker";

async function main() {
  await initElasticsearch();
  startEmailWorker();

  app.listen(config.port, () => {
    logger.info("server", `started on port ${config.port}`);
  });
}

main().catch((err) => {
  logger.error("server", `failed to start: ${err.message}`);
  process.exit(1);
});
