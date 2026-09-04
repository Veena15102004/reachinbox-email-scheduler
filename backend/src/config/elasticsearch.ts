import { Client } from "@elastic/elasticsearch";
import { config } from "./index";
import { logger } from "./logger";

const client = new Client({ node: config.elasticsearchUrl });

export async function initElasticsearch(): Promise<void> {
  try {
    const exists = await client.indices.exists({ index: "emails" });
    if (!exists) {
      await client.indices.create({
        index: "emails",
        body: {
          mappings: {
            properties: {
              recipient: { type: "keyword" },
              subject: { type: "text" },
              body: { type: "text" },
              status: { type: "keyword" },
              sender: { type: "keyword" },
              campaign: { type: "keyword" },
              scheduledAt: { type: "date" },
              sentAt: { type: "date" },
            },
          },
        },
      } as any);
      logger.info("elasticsearch", "index 'emails' created");
    }
    logger.info("elasticsearch", "connected");
  } catch (err: any) {
    logger.error("elasticsearch", `init failed: ${err.message}`);
  }
}

export { client as elasticsearchClient };
