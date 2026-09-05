import { prisma } from "../config/prisma";
import { logger } from "../config/logger";

function isPreviewLive(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  return fetch(url, {
    method: "GET",
    headers: { "User-Agent": "ReachInbox-HealthCheck/1.0" },
    redirect: "follow",
    signal: controller.signal,
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => clearTimeout(timer));
}

export async function cleanupExpiredPreviews(): Promise<number> {
  const emails = await prisma.email.findMany({
    where: { status: "SENT", previewUrl: { not: null } },
    select: { id: true, previewUrl: true },
  });

  const dead: string[] = [];
  for (const email of emails) {
    if (!email.previewUrl) continue;
    const live = await isPreviewLive(email.previewUrl);
    if (!live) dead.push(email.id);
  }

  if (dead.length > 0) {
    await prisma.email.updateMany({
      where: { id: { in: dead } },
      data: { previewUrl: null },
    });
    logger.info("worker", `cleared ${dead.length} dead preview url(s)`);
  }
  return dead.length;
}

export function runPreviewCleanupOnce(): void {
  cleanupExpiredPreviews().catch((err: any) =>
    logger.error("worker", `preview cleanup failed: ${err.message}`)
  );
}