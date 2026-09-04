import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4000"),
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  elasticsearchUrl: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || "http://localhost:4000/api/auth/google/callback",
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || "",
    clientSecret: process.env.SLACK_CLIENT_SECRET || "",
    callbackUrl: process.env.SLACK_CALLBACK_URL || "http://localhost:4000/api/slack/callback",
  },
  jwtSecret: process.env.JWT_SECRET || "change-this-secret",
  ethereal: {
    host: process.env.ETHEREAL_HOST || "smtp.ethereal.email",
    port: parseInt(process.env.ETHEREAL_PORT || "587"),
    user: process.env.ETHEREAL_USER || "",
    password: process.env.ETHEREAL_PASSWORD || "",
  },
  maxWorkerConcurrency: parseInt(process.env.MAX_WORKER_CONCURRENCY || "5"),
  minEmailDelayMs: parseInt(process.env.MIN_EMAIL_DELAY_MS || "2000"),
  maxEmailsPerHour: parseInt(process.env.MAX_EMAILS_PER_HOUR || "200"),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  backendUrl: process.env.BACKEND_URL || "http://localhost:4000",
};
