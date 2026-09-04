import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { requireAuth } from "../middleware/auth";
import { exchangeCodeForTokens, getGoogleUserInfo } from "../integrations/google/auth";
import { v4 as uuidv4 } from "uuid";

export const authRouter = Router();

authRouter.get("/google", (_req: Request, res: Response) => {
  const state = jwt.sign({ nonce: uuidv4() }, config.jwtSecret, { expiresIn: "10m" });
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

authRouter.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query as { code: string; state: string };

    if (!code) {
      res.status(400).json({ error: "Authorization code required" });
      return;
    }

    try {
      jwt.verify(state, config.jwtSecret);
    } catch {
      res.status(400).json({ error: "Invalid or expired state parameter" });
      return;
    }

    const tokens = await exchangeCodeForTokens(code);
    const googleUser = await getGoogleUserInfo(tokens.accessToken);

    let user = await prisma.user.findUnique({ where: { email: googleUser.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: googleUser.googleId,
          name: googleUser.name,
          email: googleUser.email,
          avatar: googleUser.avatar,
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: googleUser.googleId },
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    logger.info("auth", `user ${user.email} authenticated via Google`);

    res.redirect(`${config.frontendUrl}/dashboard`);
  } catch (err: any) {
    logger.error("auth", `google callback error: ${err.message}`);
    res.redirect(`${config.frontendUrl}?error=auth_failed`);
  }
});

authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, email: true, avatar: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (err: any) {
    logger.error("auth", `me error: ${err.message}`);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.json({ message: "Logged out" });
});
