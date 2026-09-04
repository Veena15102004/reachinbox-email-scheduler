import { Worker, Job } from "bullmq";
import nodemailer from "nodemailer";
import { prisma } from "../config/prisma";
import { config } from "../config";
import { logger } from "../config/logger";
import { getRedisClient, createRedisConnection } from "../config/redis";
import { createEtherealTransporter } from "../integrations/ethereal/transporter";
import { sendSlackRateLimitNotification } from "../integrations/slack/notifier";
import { indexEmail, updateEmailIndex } from "../integrations/elasticsearch/indexer";
import { getEmailQueue } from "../queues/emailQueue";

interface SendEmailData {
  emailId: string;
}

function getHourWindow(): number {
  return Math.floor(Date.now() / (60 * 60 * 1000));
}

async function checkAndIncrementRateLimit(senderId: string): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedisClient();
  const hourWindow = getHourWindow();
  const key = `email-rate:${senderId}:${hourWindow}`;

  const luaScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], 3600000)
    end
    return current
  `;

  const count = await redis.eval(luaScript, 1, key) as number;
  const allowed = count <= config.maxEmailsPerHour;
  return { allowed, remaining: Math.max(0, config.maxEmailsPerHour - count) };
}

async function processEmail(job: Job<SendEmailData>): Promise<void> {
  const { emailId } = job.data;
  logger.info("worker", `processing email ${emailId}`);

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) {
    logger.error("worker", `email ${emailId} not found`);
    return;
  }

  if (email.status === "SENT") {
    logger.info("worker", `email ${emailId} already sent, skipping`);
    return;
  }

  const transition = await prisma.email.updateMany({
    where: { id: emailId, status: "SCHEDULED" },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });

  if (transition.count === 0) {
    logger.info("worker", `email ${emailId} already being processed or not schedulable`);
    return;
  }

  const sender = await prisma.sender.findUnique({ where: { id: email.senderId } });
  if (!sender) {
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "FAILED", errorMessage: "Sender not found" },
    });
    return;
  }

  const rateLimit = await checkAndIncrementRateLimit(sender.id);
  if (!rateLimit.allowed) {
    logger.warn("worker", `rate limit reached for sender ${sender.email}`);

    const nextHourMs = (getHourWindow() + 1) * 60 * 60 * 1000;
    const delay = Math.max(0, nextHourMs - Date.now() + 1000);

    await prisma.email.update({
      where: { id: emailId },
      data: { status: "SCHEDULED" },
    });

    const queue = getEmailQueue();
    await queue.add("send-email", { emailId }, {
      jobId: `email-${emailId}`,
      delay,
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false,
    });

    await sendSlackRateLimitNotification(sender.email, config.maxEmailsPerHour, rateLimit.remaining);

    logger.info("worker", `email ${emailId} rescheduled to next hour window`);
    return;
  }

  try {
    const transporter = createEtherealTransporter(sender.etherealUser, sender.etherealPassword);
    const info = await transporter.sendMail({
      from: `"${sender.displayName}" <${sender.email}>`,
      to: email.recipient,
      subject: email.subject,
      html: email.body,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        previewUrl,
      },
    });

    try {
      await indexEmail({
        id: email.id,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        status: "SENT",
        sender: sender.email,
        campaign: email.campaignId,
        scheduledAt: email.scheduledAt,
        sentAt: new Date(),
      });
      logger.info("worker", `email ${emailId} indexed in elasticsearch`);
    } catch (esErr: any) {
      logger.error("worker", `elasticsearch indexing failed for ${emailId}: ${esErr.message}`);
    }

    logger.info("worker", `email ${emailId} sent to ${email.recipient}`);
  } catch (err: any) {
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: "FAILED",
        errorMessage: err.message,
      },
    });

    try {
      await updateEmailIndex(email.id, { status: "FAILED" });
    } catch {}

    logger.error("worker", `email ${emailId} failed: ${err.message}`);
    throw err;
  }
}

let worker: Worker | null = null;

export function startEmailWorker(): void {
  if (worker) return;

  worker = new Worker("email-queue", processEmail, {
    connection: createRedisConnection(),
    concurrency: config.maxWorkerConcurrency,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  worker.on("completed", (job) => {
    logger.info("worker", `job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    logger.error("worker", `job ${job?.id} failed: ${err.message}`);
  });

  logger.info("worker", `started with concurrency ${config.maxWorkerConcurrency}`);
}

export function stopEmailWorker(): void {
  if (worker) {
    worker.close();
    worker = null;
  }
}
