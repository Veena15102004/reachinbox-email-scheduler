import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis";
import { logger } from "../config/logger";

let emailQueue: Queue | null = null;

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue("email-queue", {
      connection: createRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
    logger.info("queue", "email-queue initialized");
  }
  return emailQueue;
}
