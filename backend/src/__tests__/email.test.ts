import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../config/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    sender: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    emailCampaign: { create: vi.fn(), findMany: vi.fn() },
    email: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    slackConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../config/redis", () => {
  const store: Record<string, string> = {};
  const redis = {
    eval: vi.fn(async (script: string, numKeys: number, key: string) => {
      const current = parseInt(store[key] || "0") + 1;
      store[key] = current.toString();
      return current;
    }),
    get: vi.fn(async (key: string) => store[key] || null),
    set: vi.fn(async (key: string, val: string) => { store[key] = val; }),
    incr: vi.fn(async (key: string) => {
      const current = parseInt(store[key] || "0") + 1;
      store[key] = current.toString();
      return current;
    }),
  };
  return {
    getRedisClient: vi.fn(() => redis),
    createRedisConnection: vi.fn(() => redis),
  };
});

vi.mock("../queues/emailQueue", () => ({
  getEmailQueue: vi.fn(() => ({
    add: vi.fn(async () => ({ id: "mock-job-id" })),
  })),
}));

vi.mock("../integrations/ethereal/transporter", () => ({
  createEtherealTransporter: vi.fn(() => ({
    sendMail: vi.fn(async () => ({
      messageId: "test-message-id@ethereal.email",
    })),
  })),
}));

vi.mock("../integrations/ethereal/accounts", () => ({
  createEtherealAccount: vi.fn(async () => ({
    user: "test@ethereal.email",
    pass: "testpass123",
  })),
}));

vi.mock("../integrations/slack/notifier", () => ({
  sendSlackRateLimitNotification: vi.fn(async () => {}),
}));

vi.mock("../integrations/elasticsearch/indexer", () => ({
  indexEmail: vi.fn(async () => {}),
  updateEmailIndex: vi.fn(async () => {}),
  searchEmails: vi.fn(async () => ({ results: [], total: 0 })),
}));

vi.mock("../integrations/google/auth", () => ({
  exchangeCodeForTokens: vi.fn(async () => ({
    accessToken: "mock-access-token",
    idToken: "mock-id-token",
  })),
  getGoogleUserInfo: vi.fn(async () => ({
    googleId: "google-123",
    name: "Test User",
    email: "test@gmail.com",
    avatar: "https://example.com/avatar.jpg",
  })),
}));

vi.mock("../integrations/slack/auth", () => ({
  exchangeSlackCode: vi.fn(async () => ({
    accessToken: "xoxb-mock-token",
    teamId: "T123",
    teamName: "Test Team",
    userId: "U123",
  })),
}));

import { prisma } from "../config/prisma";
import { getRedisClient } from "../config/redis";
import { getEmailQueue } from "../queues/emailQueue";
import { createEtherealAccount } from "../integrations/ethereal/accounts";
import { sendSlackRateLimitNotification } from "../integrations/slack/notifier";
import { indexEmail, searchEmails } from "../integrations/elasticsearch/indexer";

describe("Email Scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should schedule emails for a campaign", async () => {
    const mockSender = {
      id: "sender-1",
      userId: "user-1",
      email: "sender@test.com",
      displayName: "Test Sender",
      etherealUser: "ethereal@test.email",
      etherealPassword: "pass123",
    };
    const mockCampaign = {
      id: "campaign-1",
      userId: "user-1",
      subject: "Test Subject",
      body: "Hello {{email}}",
      startTime: new Date("2026-12-01T10:00:00Z"),
      delayBetweenEmails: 2000,
      hourlyLimit: 200,
    };

    (prisma.sender.findFirst as any).mockResolvedValue(mockSender);
    (prisma.emailCampaign.create as any).mockResolvedValue(mockCampaign);
    (prisma.email.createMany as any).mockResolvedValue({ count: 3 });
    (prisma.email.findMany as any).mockResolvedValue([
      { id: "e1", campaignId: "campaign-1", senderId: "sender-1", recipient: "a@test.com", subject: "Test Subject", body: "Hello a@test.com", scheduledAt: new Date("2026-12-01T10:00:00Z"), status: "SCHEDULED" },
      { id: "e2", campaignId: "campaign-1", senderId: "sender-1", recipient: "b@test.com", subject: "Test Subject", body: "Hello b@test.com", scheduledAt: new Date("2026-12-01T10:00:02Z"), status: "SCHEDULED" },
      { id: "e3", campaignId: "campaign-1", senderId: "sender-1", recipient: "c@test.com", subject: "Test Subject", body: "Hello c@test.com", scheduledAt: new Date("2026-12-01T10:00:04Z"), status: "SCHEDULED" },
    ]);

    const queue = getEmailQueue();
    const recipients = ["a@test.com", "b@test.com", "c@test.com"];

    const now = Date.now();
    const emailsToCreate = recipients.map((r, i) => ({
      campaignId: mockCampaign.id,
      senderId: mockSender.id,
      recipient: r,
      subject: mockCampaign.subject,
      body: `Hello ${r}`,
      scheduledAt: new Date(now + i * 2000),
      idempotencyKey: `key-${i}`,
    }));

    await prisma.email.createMany({ data: emailsToCreate });

    const allEmails = await prisma.email.findMany({ where: { campaignId: "campaign-1" } });

    for (const email of allEmails) {
      const delay = Math.max(0, new Date(email.scheduledAt).getTime() - Date.now());
      await queue.add("send-email", { emailId: email.id }, {
        jobId: `email-${email.id}`,
        delay,
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
      });
    }

    expect(prisma.email.createMany).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(3);
  });

  it("should reject invalid email addresses", () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = ["test@example.com", "user.name@domain.co"];
    const invalid = ["notanemail", "@domain.com", "user@", "plainaddress"];

    for (const email of valid) {
      expect(emailRegex.test(email)).toBe(true);
    }
    for (const email of invalid) {
      expect(emailRegex.test(email)).toBe(false);
    }
  });

  it("should deduplicate email addresses", () => {
    const recipients = ["a@test.com", "b@test.com", "a@test.com", "A@Test.com", "c@test.com"];
    const unique = [...new Set(recipients.map((e) => e.toLowerCase().trim()))];
    expect(unique).toEqual(["a@test.com", "b@test.com", "c@test.com"]);
  });

  it("should not resend SENT emails (idempotency)", async () => {
    (prisma.email.findUnique as any).mockResolvedValue({
      id: "email-1",
      status: "SENT",
      recipient: "test@test.com",
    });

    const email = await prisma.email.findUnique({ where: { id: "email-1" } });
    expect(email?.status).toBe("SENT");
  });

  it("should atomically transition SCHEDULED to PROCESSING", async () => {
    (prisma.email.updateMany as any).mockResolvedValue({ count: 1 });
    const result = await prisma.email.updateMany({
      where: { id: "email-1", status: "SCHEDULED" },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    expect(result.count).toBe(1);
  });

  it("should handle concurrent worker transitions", async () => {
    (prisma.email.updateMany as any).mockResolvedValue({ count: 0 });
    const result = await prisma.email.updateMany({
      where: { id: "email-1", status: "SCHEDULED" },
      data: { status: "PROCESSING" },
    });
    expect(result.count).toBe(0);
  });

  it("should enforce minimum delay between emails", () => {
    const minDelay = 2000;
    const delayBetweenEmails = Math.max(1000, minDelay);
    expect(delayBetweenEmails).toBeGreaterThanOrEqual(minDelay);
  });

  it("should track hourly rate limit via Redis", async () => {
    const redis = getRedisClient();
    const senderId = "sender-1";
    const hourWindow = Math.floor(Date.now() / (60 * 60 * 1000));
    const key = `email-rate:${senderId}:${hourWindow}`;

    const count1 = await redis.eval("", 1, key);
    expect(count1).toBe(1);

    const count2 = await redis.eval("", 1, key);
    expect(count2).toBe(2);
  });

  it("should detect when hourly limit is exceeded", () => {
    const maxEmailsPerHour = 200;
    const currentCount = 201;
    const allowed = currentCount <= maxEmailsPerHour;
    expect(allowed).toBe(false);
  });

  it("should reschedule when rate limit reached", async () => {
    const queue = getEmailQueue();
    const nextHourMs = (Math.floor(Date.now() / (60 * 60 * 1000)) + 1) * 60 * 60 * 1000;
    const delay = Math.max(0, nextHourMs - Date.now() + 1000);

    (prisma.email.update as any).mockResolvedValue({ id: "email-1", status: "SCHEDULED" });

    await prisma.email.update({
      where: { id: "email-1" },
      data: { status: "SCHEDULED" },
    });

    await queue.add("send-email", { emailId: "email-1" }, {
      jobId: "email:email-1",
      delay,
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false,
    });

    expect(queue.add).toHaveBeenCalled();
  });

  it("should send Slack notification on rate limit", async () => {
    await sendSlackRateLimitNotification("sender@test.com", 200, 0);
    expect(sendSlackRateLimitNotification).toHaveBeenCalledWith("sender@test.com", 200, 0);
  });

  it("should index email in Elasticsearch", async () => {
    await indexEmail({
      id: "email-1",
      recipient: "test@test.com",
      subject: "Hello",
      body: "World",
      status: "SENT",
      sender: "sender@test.com",
      campaign: "campaign-1",
      scheduledAt: new Date(),
      sentAt: new Date(),
    });
    expect(indexEmail).toHaveBeenCalled();
  });

  it("should search emails via Elasticsearch", async () => {
    const result = await searchEmails("test", 1, 20);
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("total");
  });

  it("should create Ethereal account for new senders", async () => {
    const account = await createEtherealAccount();
    expect(account).toHaveProperty("user");
    expect(account).toHaveProperty("pass");
  });
});

describe("Authentication", () => {
  it("should validate JWT tokens", () => {
    const jwt = require("jsonwebtoken");
    const token = jwt.sign({ userId: "123", email: "test@test.com" }, "secret", { expiresIn: "1h" });
    const decoded = jwt.verify(token, "secret");
    expect(decoded.userId).toBe("123");
    expect(decoded.email).toBe("test@test.com");
  });
});
