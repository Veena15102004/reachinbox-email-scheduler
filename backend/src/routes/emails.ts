import { Router, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { config } from "../config";
import { logger } from "../config/logger";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getEmailQueue } from "../queues/emailQueue";
import { v4 as uuidv4 } from "uuid";

export const emailRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const scheduleSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid start time"),
  delayBetweenEmails: z.number().min(config.minEmailDelayMs, `Minimum delay is ${config.minEmailDelayMs}ms`),
  hourlyLimit: z.number().min(1).max(10000),
  senderId: z.string().min(1, "Sender is required"),
  recipients: z.array(z.string().email("Invalid email")).min(1, "At least one recipient required"),
});

emailRouter.post("/schedule", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  try {
    let recipients: string[] = [];

    if (req.body.recipients) {
      if (typeof req.body.recipients === "string") {
        try {
          recipients = JSON.parse(req.body.recipients);
        } catch {
          recipients = req.body.recipients.split(/[,\n]/).map((e: string) => e.trim()).filter(Boolean);
        }
      } else {
        recipients = req.body.recipients;
      }
    }

    if (req.file) {
      const content = req.file.buffer.toString("utf-8");
      const parsed = parseEmailFile(content);
      recipients = [...recipients, ...parsed];
    }

    const uniqueEmails = [...new Set(recipients.map((e) => e.toLowerCase().trim()))];
    const validEmails = uniqueEmails.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (validEmails.length === 0) {
      res.status(400).json({ error: "No valid email addresses found" });
      return;
    }

    const subject = req.body.subject;
    const body = req.body.body;
    const startTime = new Date(req.body.startTime);
    const delayBetweenEmails = parseInt(req.body.delayBetweenEmails) || config.minEmailDelayMs;
    const hourlyLimit = parseInt(req.body.hourlyLimit) || config.maxEmailsPerHour;
    const senderId = req.body.senderId;

    const sender = await prisma.sender.findFirst({
      where: { id: senderId, userId: req.user!.userId },
    });
    if (!sender) {
      res.status(400).json({ error: "Invalid sender" });
      return;
    }

    const campaign = await prisma.emailCampaign.create({
      data: {
        userId: req.user!.userId,
        subject,
        body,
        startTime,
        delayBetweenEmails,
        hourlyLimit,
      },
    });

    const now = Date.now();
    const emailsToCreate: Array<{
      campaignId: string;
      senderId: string;
      recipient: string;
      subject: string;
      body: string;
      scheduledAt: Date;
      idempotencyKey: string;
    }> = [];

    const emailRecords = [];

    for (let i = 0; i < validEmails.length; i++) {
      const recipient = validEmails[i];
      const scheduledAt = new Date(startTime.getTime() + i * delayBetweenEmails);
      const idempotencyKey = uuidv4();

      emailsToCreate.push({
        campaignId: campaign.id,
        senderId,
        recipient,
        subject,
        body: body.replace(/\{\{email\}\}/gi, recipient),
        scheduledAt,
        idempotencyKey,
      });
    }

    const createdEmails = await prisma.email.createMany({ data: emailsToCreate });
    const allEmails = await prisma.email.findMany({
      where: { campaignId: campaign.id },
      orderBy: { scheduledAt: "asc" },
    });

    const queue = getEmailQueue();

    const jobPromises = allEmails.map((email, index) => {
      const delay = Math.max(0, new Date(email.scheduledAt).getTime() - now);
      return queue.add("send-email", { emailId: email.id }, {
        jobId: `email-${email.id}`,
        delay,
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
      });
    });

    await Promise.all(jobPromises);

    logger.info("emails", `campaign ${campaign.id} created with ${validEmails.length} emails`);

    res.status(201).json({
      campaign,
      emailsCreated: validEmails.length,
      duplicatesRemoved: uniqueEmails.length - validEmails.length + (recipients.length - uniqueEmails.length),
    });
  } catch (err: any) {
    logger.error("emails", `schedule error: ${err.message}`);
    res.status(500).json({ error: "Failed to schedule emails" });
  }
});

emailRouter.get("/scheduled", requireAuth, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where: {
          campaign: { userId: req.user!.userId },
          status: { in: ["SCHEDULED", "PROCESSING"] },
        },
        include: { campaign: true, sender: true },
        orderBy: { scheduledAt: "asc" },
        skip,
        take: limit,
      }),
      prisma.email.count({
        where: {
          campaign: { userId: req.user!.userId },
          status: { in: ["SCHEDULED", "PROCESSING"] },
        },
      }),
    ]);

    res.json({ emails, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    logger.error("emails", `fetch scheduled error: ${err.message}`);
    res.status(500).json({ error: "Failed to fetch scheduled emails" });
  }
});

emailRouter.get("/sent", requireAuth, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where: {
          campaign: { userId: req.user!.userId },
          status: { in: ["SENT", "FAILED"] },
        },
        include: { campaign: true, sender: true },
        orderBy: { sentAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.email.count({
        where: {
          campaign: { userId: req.user!.userId },
          status: { in: ["SENT", "FAILED"] },
        },
      }),
    ]);

    res.json({ emails, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    logger.error("emails", `fetch sent error: ${err.message}`);
    res.status(500).json({ error: "Failed to fetch sent emails" });
  }
});

emailRouter.get("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!q) {
      res.status(400).json({ error: "Search query required" });
      return;
    }

    const { searchEmails } = await import("../integrations/elasticsearch/indexer");
    const results = await searchEmails(q, page, limit);

    res.json(results);
  } catch (err: any) {
    logger.error("emails", `search error: ${err.message}`);
    res.status(500).json({ error: "Search failed" });
  }
});

emailRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const email = await prisma.email.findFirst({
      where: {
        id: req.params.id,
        campaign: { userId: req.user!.userId },
      },
      include: { campaign: true, sender: true },
    });

    if (!email) {
      res.status(404).json({ error: "Email not found" });
      return;
    }

    res.json({ email });
  } catch (err: any) {
    logger.error("emails", `fetch email error: ${err.message}`);
    res.status(500).json({ error: "Failed to fetch email" });
  }
});

function parseEmailFile(content: string): string[] {
  const lines = content.split(/[\r\n]+/);
  const emails: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (i === 0 && /^[a-zA-Z]/.test(line) && !line.includes("@")) continue;

    const parts = line.split(/[,\t;|]+/);
    for (const part of parts) {
      const cleaned = part.trim().replace(/^["']|["']$/g, "");
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
        emails.push(cleaned.toLowerCase());
      }
    }
  }

  return [...new Set(emails)];
}
