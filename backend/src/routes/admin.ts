import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/BullMQAdapter";
import { Router, Request, Response, NextFunction } from "express";
import { getEmailQueue } from "../queues/emailQueue";
import { logger } from "../config/logger";

let boardAdapter: ExpressAdapter | null = null;

export function createBullBoardRouter(): Router {
  const router = Router();

  const queue = getEmailQueue();
  boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath("/admin/queues");

  (createBullBoard as any)({
    queues: [new BullMQAdapter(queue as any, { readOnlyMode: false })],
    serverAdapter: boardAdapter,
  });

  router.use("/queues", (req: Request, res: Response, next: NextFunction) => {
    const adminToken = req.headers["x-admin-token"] || req.query.token;
    if (adminToken !== "admin-secret-token") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  router.use("/queues", boardAdapter.getRouter());

  logger.info("admin", "bull board mounted at /admin/queues");

  return router;
}
