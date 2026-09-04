import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { createRedisConnection } from "../src/config/redis";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

const USER_ID = "e3f1727e-f049-4d4e-8ede-9bc643321785";
const SENDER_ID = "5d74605f-0302-4d4b-9c26-df413b739d38";
const RECIPIENTS = [
  "john@example.com",
  "alice@example.com",
  "rahul@example.com",
  "sarah@example.com",
];

async function main() {
  const startTime = new Date(Date.now() + 2 * 60 * 1000);
  const delayBetweenEmails = 2000;
  const subject = "Test Campaign - Sent Soon";
  const body = "Hello {{email}},\n\nThis is a test email from ReachInbox.";

  const campaign = await prisma.emailCampaign.create({
    data: {
      userId: USER_ID,
      subject,
      body,
      startTime,
      delayBetweenEmails,
      hourlyLimit: 200,
    },
  });

  const emails = [];
  for (let i = 0; i < RECIPIENTS.length; i++) {
    const scheduledAt = new Date(startTime.getTime() + i * delayBetweenEmails);
    emails.push({
      campaignId: campaign.id,
      senderId: SENDER_ID,
      recipient: RECIPIENTS[i],
      subject,
      body: body.replace(/\{\{email\}\}/gi, RECIPIENTS[i]),
      scheduledAt,
      idempotencyKey: uuidv4(),
    });
  }

  await prisma.email.createMany({ data: emails });

  const created = await prisma.email.findMany({ where: { campaignId: campaign.id } });

  const queue = new Queue("email-queue", { connection: createRedisConnection() });
  const now = Date.now();

  for (const email of created) {
    const delay = Math.max(0, new Date(email.scheduledAt).getTime() - now);
    await queue.add("send-email", { emailId: email.id }, {
      jobId: `email-${email.id}`,
      delay,
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false,
    });
  }

  console.log(`Campaign created: ${campaign.id}`);
  console.log(`Emails scheduled: ${created.length}`);
  console.log(`First email fires at: ${startTime.toISOString()}`);
  console.log(`Delay in ms: ${Math.max(0, startTime.getTime() - now)}`);

  await queue.close();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});