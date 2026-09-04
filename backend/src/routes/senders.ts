import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { requireAuth } from "../middleware/auth";
import { createEtherealAccount } from "../integrations/ethereal/accounts";

export const senderRouter = Router();

senderRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const senders = await prisma.sender.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ senders });
  } catch (err: any) {
    logger.error("senders", `list error: ${err.message}`);
    res.status(500).json({ error: "Failed to fetch senders" });
  }
});

senderRouter.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { email, displayName } = req.body;

    if (!email || !displayName) {
      res.status(400).json({ error: "Email and display name are required" });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }

    const existing = await prisma.sender.findFirst({
      where: { userId: req.user!.userId, email },
    });
    if (existing) {
      res.status(409).json({ error: "Sender already exists" });
      return;
    }

    const etherealAccount = await createEtherealAccount();

    const sender = await prisma.sender.create({
      data: {
        userId: req.user!.userId,
        email,
        displayName,
        etherealUser: etherealAccount.user,
        etherealPassword: etherealAccount.pass,
      },
    });

    logger.info("senders", `sender ${email} created for user ${req.user!.userId}`);
    res.status(201).json({ sender });
  } catch (err: any) {
    logger.error("senders", `create error: ${err.message}`);
    res.status(500).json({ error: "Failed to create sender" });
  }
});

senderRouter.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const sender = await prisma.sender.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!sender) {
      res.status(404).json({ error: "Sender not found" });
      return;
    }

    await prisma.sender.delete({ where: { id: sender.id } });
    logger.info("senders", `sender ${sender.email} deleted`);
    res.json({ message: "Sender deleted" });
  } catch (err: any) {
    logger.error("senders", `delete error: ${err.message}`);
    res.status(500).json({ error: "Failed to delete sender" });
  }
});
