import { elasticsearchClient } from "../../config/elasticsearch";
import { logger } from "../../config/logger";

interface EmailDocument {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  sender: string;
  campaign: string;
  scheduledAt: Date;
  sentAt?: Date;
}

export async function indexEmail(email: EmailDocument): Promise<void> {
  try {
    await elasticsearchClient.index({
      index: "emails",
      id: email.id,
      document: {
        ...email,
        scheduledAt: email.scheduledAt.toISOString(),
        sentAt: email.sentAt?.toISOString(),
      },
    });
    logger.info("elasticsearch", `indexed email ${email.id}`);
  } catch (err: any) {
    logger.error("elasticsearch", `indexing failed: ${err.message}`);
  }
}

export async function updateEmailIndex(
  emailId: string,
  updates: Partial<Pick<EmailDocument, "status" | "sentAt">>
): Promise<void> {
  try {
    const doc: Record<string, any> = { ...updates };
    if (updates.sentAt instanceof Date) {
      doc.sentAt = updates.sentAt.toISOString();
    }
    await elasticsearchClient.update({
      index: "emails",
      id: emailId,
      doc,
    });
    logger.info("elasticsearch", `updated email ${emailId}`);
  } catch (err: any) {
    logger.error("elasticsearch", `update failed: ${err.message}`);
  }
}

export async function searchEmails(
  query: string,
  page: number = 1,
  limit: number = 20
): Promise<{ results: any[]; total: number }> {
  try {
    const from = (page - 1) * limit;
    const response = await elasticsearchClient.search({
      index: "emails",
      body: {
        query: {
          multi_match: {
            query,
            fields: ["recipient", "subject", "body", "status", "sender"],
          },
        },
        from,
        size: limit,
        sort: [{ scheduledAt: { order: "desc" } }],
      },
    });

    return {
      results: response.hits.hits.map((hit: any) => ({
        id: hit._id,
        ...hit._source,
      })),
      total: typeof response.hits.total === "number"
        ? response.hits.total
        : (response.hits.total as any)?.value || 0,
    };
  } catch (err: any) {
    logger.error("elasticsearch", `search failed: ${err.message}`);
    return { results: [], total: 0 };
  }
}
