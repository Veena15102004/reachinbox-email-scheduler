import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { requireAuth } from "../middleware/auth";
import { exchangeSlackCode } from "../integrations/slack/auth";

export const slackRouter = Router();

slackRouter.get("/connect", requireAuth, (req: Request, res: Response) => {
  const token = jwt.sign({ userId: req.user!.userId }, config.jwtSecret, { expiresIn: "10m" });
  const params = new URLSearchParams({
    client_id: config.slack.clientId,
    redirect_uri: config.slack.callbackUrl,
    scope: "chat:write",
    state: token,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

slackRouter.get("/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query as { code: string; state: string };

    if (!code || !state) {
      res.status(400).json({ error: "Code and state required" });
      return;
    }

    let decoded: { userId: string };
    try {
      decoded = jwt.verify(state, config.jwtSecret) as { userId: string };
    } catch {
      res.status(400).json({ error: "Invalid state" });
      return;
    }

    const slackData = await exchangeSlackCode(code);

    await prisma.slackConnection.upsert({
      where: { userId: decoded.userId },
      update: {
        accessToken: slackData.accessToken,
        teamId: slackData.teamId,
        teamName: slackData.teamName,
      },
      create: {
        userId: decoded.userId,
        accessToken: slackData.accessToken,
        teamId: slackData.teamId,
        teamName: slackData.teamName,
      },
    });

    logger.info("slack", `connected for user ${decoded.userId}`);
    res.redirect(`${config.frontendUrl}/dashboard?slack=connected`);
  } catch (err: any) {
    logger.error("slack", `callback error: ${err.message}`);
    res.redirect(`${config.frontendUrl}/dashboard?slack=error`);
  }
});

slackRouter.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const connection = await prisma.slackConnection.findUnique({
      where: { userId: req.user!.userId },
      select: { teamId: true, teamName: true, createdAt: true },
    });

    res.json({ connected: !!connection, connection });
  } catch (err: any) {
    res.json({ connected: false, connection: null });
  }
});

slackRouter.post("/disconnect", requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.slackConnection.deleteMany({ where: { userId: req.user!.userId } });
    logger.info("slack", `disconnected for user ${req.user!.userId}`);
    res.json({ message: "Slack disconnected" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to disconnect Slack" });
  }
});
