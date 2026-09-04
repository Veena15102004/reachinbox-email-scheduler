import nodemailer from "nodemailer";

export function createEtherealTransporter(user: string, pass: string) {
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user,
      pass,
    },
  });
}
