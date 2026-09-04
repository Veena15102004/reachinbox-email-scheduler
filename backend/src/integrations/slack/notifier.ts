import axios from "axios";
import { prisma } from "../../config/prisma";
import { getRedisClient } from "../../config/redis";
import { logger } from "../../config/logger";

export async function sendSlackRateLimitNotification(
  senderEmail: string,
  hourlyLimit: number,
  remaining: number
): Promise<void> {
  try {
    const hourWindow = Math.floor(Date.now() / (60 * 60 * 1000));
    const spamKey = `slack-notify:${senderEmail}:${hourWindow}`;

    const redis = getRedisClient();
    const alreadyNotified = await redis.get(spamKey);
    if (alreadyNotified) {
      return;
    }

    const sender = await prisma.sender.findFirst({ where: { email: senderEmail } });
    if (!sender) return;

    const slackConn = await prisma.slackConnection.findUnique({ where: { userId: sender.userId } });
    if (!slackConn) {
      logger.info("slack", "no slack connection, skipping notification");
      return;
    }

    const message = [
      `*⚠️ Email rate limit reached*`,
      ``,
      `Sender: \`${senderEmail}\``,
      `Hourly limit: ${hourlyLimit}`,
      `Remaining emails have been rescheduled to the next available hour.`,
    ].join("\n");

    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel: slackConn.teamId,
        text: message,
        mrkdwn: true,
      },
      {
        headers: {
          Authorization: `Bearer ${slackConn.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    await redis.set(spamKey, "1", "EX", 7200);

    logger.info("slack", `rate limit notification sent for ${senderEmail}`);
  } catch (err: any) {
    logger.error("slack", `notification failed: ${err.message}`);
  }
}
