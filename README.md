# ReachInbox - Email Job Scheduler

## Overview
Production-quality email scheduling application built with TypeScript, React, Express, PostgreSQL, Redis, BullMQ, and Elasticsearch.

## Architecture

```
React Frontend
       |
       v
Express API Server
   /       \
  v         v
PostgreSQL Redis
             |
             v
          BullMQ Queue
             |
             v
        Email Worker
             |
             v
       Ethereal SMTP

Email Data
    |
    v
Elasticsearch Index

Rate Limiting
    |
    v
Redis Counters
    |
    v
Slack Notifications
```

## Technology Stack

- **Backend**: TypeScript, Express, Prisma ORM, BullMQ, Redis (ioredis), Nodemailer, Zod, Helmet, CORS
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router v6, Axios, Lucide React
- **Database**: PostgreSQL 16
- **Cache/Queue**: Redis 7 + BullMQ
- **Search**: Elasticsearch 8.x
- **Email**: Ethereal SMTP (test emails)
- **Auth**: Google OAuth 2.0, Slack OAuth
- **Dashboard**: Bull Board for queue monitoring
- **Containerization**: Docker Compose

## Installation

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### Quick Start

1. Clone and install dependencies:
```bash
git clone <repo-url>
cd reachinbox-email-scheduler
```

2. Start infrastructure:
```bash
docker compose up -d
```

> **Windows one-click option:** run `powershell -ExecutionPolicy Bypass -File .\start-dev.ps1`
> to start Docker services, the backend (port 4000) and the frontend (5173) in separate
> windows automatically.

3. Setup backend:
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

4. Setup frontend (new terminal):
```bash
cd frontend
npm install
npm run dev
```

5. Open http://localhost:5173

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | - |
| REDIS_URL | Redis connection string | redis://localhost:6379 |
| ELASTICSEARCH_URL | Elasticsearch URL | http://localhost:9200 |
| GOOGLE_CLIENT_ID | Google OAuth client ID | - |
| GOOGLE_CLIENT_SECRET | Google OAuth client secret | - |
| GOOGLE_CALLBACK_URL | Google OAuth callback | http://localhost:4000/api/auth/google/callback |
| SLACK_CLIENT_ID | Slack OAuth client ID | - |
| SLACK_CLIENT_SECRET | Slack OAuth client secret | - |
| SLACK_CALLBACK_URL | Slack OAuth callback | http://localhost:4000/api/slack/callback |
| JWT_SECRET | JWT signing secret | - |
| ETHEREAL_HOST | SMTP host | smtp.ethereal.email |
| ETHEREAL_PORT | SMTP port | 587 |
| ETHEREAL_USER | Ethereal username | - |
| ETHEREAL_PASSWORD | Ethereal password | - |
| MAX_WORKER_CONCURRENCY | Worker parallelism | 5 |
| MIN_EMAIL_DELAY_MS | Minimum delay between sends | 2000 |
| MAX_EMAILS_PER_HOUR | Hourly rate limit | 200 |
| FRONTEND_URL | Frontend origin | http://localhost:5173 |
| BACKEND_URL | Backend origin | http://localhost:4000 |

## Docker Setup

```bash
docker compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- Elasticsearch on port 9200

All with persistent volumes and health checks.

## Google OAuth Setup

1. Go to https://console.cloud.google.com
2. Create a project
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Set authorized redirect URI to `http://localhost:4000/api/auth/google/callback`
6. Copy Client ID and Secret to `.env`

## Ethereal Email Setup

Ethereal provides a fake SMTP server — every email the app "sends" is real SMTP traffic, but
never leaves Ethereal. Each sender gets its own Ethereal inbox with a web preview URL
(`https://ethereal.email/message/<id>`).

**How it works in this app (zero manual setup):**

1. When you create a **Sender** in the UI (`POST /api/senders`), the backend calls
   `nodemailer.createTestAccount()` to generate a throwaway Ethereal mailbox.
2. That account's SMTP credentials are stored on the Sender row in PostgreSQL.
3. The worker sends emails through that Sender's SMTP credentials and stores the preview URL returned by `nodemailer.getTestMessageUrl(info)`.
4. Click **Preview** on a SENT email to open the message in the Ethereal web mail reader.
5. Optional global override: set `ETHEREAL_USER` + `ETHEREAL_PASSWORD` in `.env` to use a
   fixed Ethereal account instead of auto-generated ones.

## Slack OAuth Setup

1. Go to https://api.slack.com/apps
2. Create a new app
3. Under OAuth & Permissions, add `chat:write` scope
4. Set redirect URL to `http://localhost:4000/api/slack/callback`
5. Copy Client ID and Secret to `.env`

## API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Emails
- `POST /api/emails/schedule` - Schedule email campaign
- `GET /api/emails/scheduled` - List scheduled emails (paginated)
- `GET /api/emails/sent` - List sent emails (paginated)
- `GET /api/emails/search?q=...` - Search via Elasticsearch
- `GET /api/emails/:id` - Get email details

### Senders
- `GET /api/senders` - List senders
- `POST /api/senders` - Create sender (auto-generates Ethereal account)
- `DELETE /api/senders/:id` - Delete sender

### Slack
- `GET /api/slack/connect` - Initiate Slack OAuth
- `GET /api/slack/callback` - Slack OAuth callback
- `GET /api/slack/status` - Check Slack connection
- `POST /api/slack/disconnect` - Disconnect Slack

### Admin
- `/admin/queues` - Bull Board dashboard (requires X-Admin-Token header)

## Rate Limiting

- **API**: 200 requests per 15 minutes per IP (express-rate-limit)
- **Email sending**: Configurable hourly limit per sender (default: 200)
- **Redis-backed**: Atomic INCR with TTL, safe across workers/instances
- **Rescheduling**: When limit reached, jobs are rescheduled to the next hour window. Emails are NOT dropped.

## Minimum Delay

Minimum delay between individual email sends (default: 2000ms). This prevents SMTP overload. The delay is enforced at the BullMQ job level via delayed job scheduling.

## Worker Concurrency

Configurable via `MAX_WORKER_CONCURRENCY` (default: 5). The BullMQ worker processes this many jobs in parallel. Rate limiting and delays control throughput.

## Restart Persistence

- Redis stores BullMQ job data with persistence
- PostgreSQL stores all email/campaign records
- On restart, delayed jobs resume from where they left off
- SENT emails are never resent due to idempotency checks
- Docker volumes ensure data survives container restarts

## Idempotency

Each email has a unique `idempotencyKey` and `bullJobId`. Before sending:
1. Fetch email record from PostgreSQL
2. If status is SENT, skip immediately
3. Atomically transition SCHEDULED -> PROCESSING (conditional update)
4. Only the winning worker sends the email
5. Update status to SENT with preview URL

**Limitation**: If a process crashes after SMTP accepts a message but before the database update, duplicate sends are possible. This is inherent to distributed systems without two-phase commit to SMTP.

## 1000+ Email Support

- Each email is a separate BullMQ delayed job stored in Redis
- Worker concurrency controls parallelism
- Rate limiting controls throughput
- Excess jobs are automatically rescheduled to later hour windows
- No in-memory timers or database polling

## Ordering

Emails are scheduled in order with increasing delays. When rate limits cause rescheduling, emails maintain their relative order within the rescheduled batch. With concurrent workers, strict global ordering cannot be guaranteed for simultaneously-eligible jobs, but the general sequence is preserved.

## Retry Behavior

- **Attempts**: 5 per email
- **Backoff**: Exponential with 5s base delay
- **Failed jobs**: Visible in Bull Board dashboard
- **Status tracking**: Failed emails are marked in PostgreSQL

## Known Limitations

- Ethereal email previews are test-only
- Google/Slack OAuth requires valid credentials
- Elasticsearch may need time to index after bulk sends
- SMTP cannot guarantee exactly-once delivery without two-phase commit

## Features Mapped to Requirements

| Requirement | Implementation |
|-------------|----------------|
| Backend: scheduler | `bull:email-queue` BullMQ **delayed jobs** — each email is an independent job with `delay` computed from `startTime + index × delayBetweenEmails`. No cron, no in-memory timers. |
| Backend: persistence | Redis persists job data across worker restarts; PostgreSQL persists all emails/campaigns/senders. On boot, the worker restores delayed jobs from Redis and resumes automatically. |
| Backend: rate limiting | Redis `INCR` with hourly TTL per sender (default 200/hr, `MAX_EMAILS_PER_HOUR`). When the counter hits the cap the job is **rescheduled** to the next hour window with backoff — emails are never dropped. |
| Backend: concurrency | BullMQ worker concurrency `MAX_WORKER_CONCURRENCY` (default 5) + per-job exponential backoff + `MIN_EMAIL_DELAY_MS` minimum spacing between sends. Idempotent `SCHEDULED → PROCESSING → SENT` state machine prevents duplicate sends. |
| Frontend: login | Google OAuth button (`LoginPage.tsx`) → JWT cookie from `/api/auth/google/callback` → `AuthContext` guards routes. |
| Frontend: dashboard | `DashboardPage.tsx` with campaign creation, Scheduled/Sent tabs, search bar (Elasticsearch-backed), sender management, create-sender inline form in the compose modal. |
| Frontend: compose | `ComposeEmailModal.tsx` — CSV/TXT upload (parsed/valid/duplicate counts), recipient paste, subject/body templating, start time (`datetime-local`), delay + hourly limit controls. |
| Frontend: tables | `EmailTable.tsx` — paginated Scheduled & Sent lists with status chips (`SCHEDULED`/`PROCESSING`/`SENT`/`FAILED`), preview links, sent timestamps. |
| Cross-cutting | Bull Board at `/admin/queues` for live queue monitoring; Slack rate-limit notifications; Elasticsearch search; idempotency keys + atomic conditional updates. |

## Assumptions, Shortcuts & Trade-offs

- **Ethereal instead of a real SMTP provider** — required by the assignment for testing; previews are test-only and messages never reach real recipients.
- **Cron-free scheduling** — scheduling is 100% BullMQ delayed jobs (explicit requirement). Persistence across restart relies on Redis, which must run with `appendonly yes` (set in `docker-compose.yml`).
- **1000+ emails**: each email is its own delayed job in Redis (a few KB each), so large campaigns are supported; throughput is governed by concurrency + hourly rate limit, and excess jobs are deferred rather than dropped.
- **At-least-once delivery**: idempotency (unique `bullJobId` + conditional `SCHEDULED → PROCESSING` transition) prevents most duplicates, but a crash between SMTP `accept` and the DB status update can still produce a duplicate — inherent without two-phase commit to SMTP.
- **Single `email` step ordering**: relative order is preserved via increasing delays, but two simultaneously-eligible jobs may send out of order under concurrency.
- **Ethereal preview caveat**: the preview URL must come from `nodemailer.getTestMessageUrl(info)` (parses the SMTP `MSGID` response) — constructing it from `info.messageId` produces a 404 `Invalid or unknown message identifier`.
- **Slack rate-limit alerts**: Slack OAuth wiring exists and connects, but sending requires a workspace token; the notification path is exercised only when Slack creds are configured.
- **Local dev port**: PostgreSQL runs on host port **5433** in `docker-compose.yml` to avoid clashing with a locally installed PostgreSQL on 5432. Adjust `DATABASE_URL` if your setup differs.

## Demo Video Guide (max 5 min)

Suggested script:

1. **Startup** — `docker compose up -d`, then `cd backend && npm run dev`, `cd frontend && npm run dev` (trim this part).
2. **Login** — click "Sign in with Google", land on dashboard.
3. **Create a sender** (or show existing one) — note it auto-creates an Ethereal mailbox.
4. **Schedule a campaign** — CSV/TXT upload or pasted recipients, subject, **start time ~2 min in the future**, delay + hourly limit.
5. **Show Scheduled tab** — emails listed as `SCHEDULED` with their fire times.
6. **Restart scenario** — stop the backend (Ctrl+C), restart `npm run dev`, show the log restoring jobs from Redis; when the start time passes the emails still send.
7. **Show Sent tab** — emails appear as `SENT` with working **Preview** links (opens Ethereal web mailer).
8. *(Bonus)* Under load — schedule 20+ emails with a small `hourlyLimit`; point the camera at the backend log / Bull Board to show jobs deferring to the next hour window.
