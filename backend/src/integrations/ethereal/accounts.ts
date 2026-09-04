import nodemailer from "nodemailer";
import { logger } from "../../config/logger";

export async function createEtherealAccount(): Promise<{
  user: string;
  pass: string;
}> {
  try {
    const testAccount = await nodemailer.createTestAccount();
    logger.info("ethereal", `created account: ${testAccount.user}`);
    return { user: testAccount.user, pass: testAccount.pass };
  } catch (err: any) {
    logger.error("ethereal", `failed to create account: ${err.message}`);
    throw err;
  }
}
