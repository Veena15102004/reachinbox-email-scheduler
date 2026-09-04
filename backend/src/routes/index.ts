import { Router } from "express";
import { authRouter } from "./auth";
import { emailRouter } from "./emails";
import { senderRouter } from "./senders";
import { slackRouter } from "./slack";

export const router = Router();

router.use("/auth", authRouter);
router.use("/emails", emailRouter);
router.use("/senders", senderRouter);
router.use("/slack", slackRouter);
