import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sender = await prisma.sender.findFirst();
  if (!sender) { console.log("no sender"); return; }

  const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: { user: sender.etherealUser, pass: sender.etherealPassword },
  });

  const info = await transporter.sendMail({
    from: `"${sender.displayName}" <${sender.email}>`,
    to: "reviewer-check@gmail.com",
    subject: "Fresh preview test",
    html: "<p>Hello, testing fresh preview link.</p>",
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log("PREVIEW URL:", previewUrl);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); });