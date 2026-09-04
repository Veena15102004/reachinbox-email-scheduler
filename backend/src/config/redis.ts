import Redis from "ioredis";
import { config } from "./index";
import { logger } from "./logger";

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });
    client.on("connect", () => logger.info("redis", "connected"));
    client.on("error", (err) => logger.error("redis", `error: ${err.message}`));
  }
  return client;
}

export function createRedisConnection(): Redis {
  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });
}
