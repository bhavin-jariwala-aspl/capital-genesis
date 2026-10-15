# Genesis CRM — Installation & Setup Guide

> **Who is this guide for?**
> New developers and administrators setting up Genesis CRM for the first time.
> Follow this guide step-by-step for your initial setup.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Requirements](#system-requirements)
3. [Installation & Setup](#installation--setup)
4. [First Login & Demo Accounts](#first-login--demo-accounts)
5. [Next Steps](#next-steps)

---

## Project Overview

Genesis CRM is a **fully configurable, metadata-driven CRM platform**. Unlike traditional CRMs with hard-coded screens,
every page, form, field, pipeline, dashboard, and guided wizard is defined in the database and rendered at runtime.
Administrators can change the entire data model from the browser without touching code.

### Technology Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | React 18 + Vite + TailwindCSS + React Query |
| Backend | Node.js + Fastify + Prisma ORM |
| Database | MySQL 8.0+ |
| Cache | Redis (optional) |
| Authentication | JWT with configurable expiry |

The backend listens on **port 3001** by default. The frontend dev server listens on **port 5173** by default.

---

## System Requirements

| Tool | Minimum Version | Check |
| ---- | --------------- | ----- |
| Node.js | 18.0+ | `node --version` |
| npm | 9.0+ | `npm --version` |
| MySQL | 8.0+ | `mysql --version` |
| Git | 2.0+ | `git --version` |

**Optional but recommended:**

- Redis 6.0+ for caching (`redis-cli --version`)
- Docker for containerized services

> **MySQL can be local, a Docker container, AWS RDS, or any other host.**
> **Redis is optional.** The app falls back gracefully when Redis is unavailable.

---

## Installation & Setup

### Step 1: Clone & Install Dependencies

```bash
# 1. Get the code
git clone <repo-url> genesis
cd genesis

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install
```

### Step 2: Configure the Backend

The backend reads its configuration from `backend/.env`. A template is provided at `backend/.env.example`.

```bash
# from the project root
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in your values:

```dotenv
# ── Database ─────────────────────────────────────────────────────────────────
# Replace with your actual MySQL connection string.
# Format: mysql://USER:PASSWORD@HOST:PORT/DATABASE_NAME
DATABASE_URL="mysql://root:password@localhost:3306/genesis_crm"

# ── JWT ───────────────────────────────────────────────────────────────────────
# Must be at least 32 random characters. Keep this secret.
JWT_SECRET="replace-with-a-long-random-secret-key-at-least-32-chars"
JWT_EXPIRY="8h"

# ── Redis (optional) ─────────────────────────────────────────────────────────
# If you have Redis running locally, leave the defaults as-is.
# If you have no Redis, that is fine — the app degrades gracefully.
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
REDIS_PASSWORD=""
REDIS_DB=0

# ── Server ────────────────────────────────────────────────────────────────────
PORT=3001
HOST="0.0.0.0"
NODE_ENV="development"

# ── Cache TTL (in seconds) ────────────────────────────────────────────────────
CACHE_TTL_METADATA=3600
CACHE_TTL_SESSION=28800

# ── Email / password reset (optional) ────────────────────────────────────────
# If SMTP_HOST is unset the backend logs emails instead of sending them
# (preview mode) — fine for local development.
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="noreply@genesis-crm.local"
# Base URL used to build password-reset, shared web-form and client upload links. Defaults to the request's origin;
# set explicitly when running behind a proxy or on a custom domain.
APP_URL="http://localhost:5173"
```

**Minimum required change:** set `DATABASE_URL` to point to your MySQL instance and set a real `JWT_SECRET`.

**Optional — AI reporting ("Ask Genesis").** Natural-language report building on a local model. Off
by default; everything else works without it.

```bash
AI_REPORTING_ENABLED=true
LLM_PROVIDER=ollama                 # ollama | openai-compatible | stub
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.1:8b               # ollama pull llama3.1:8b
LLM_TIMEOUT_MS=90000
LLM_THINKING=false
```

The model only ever produces a report *config* (never SQL) and answers are limited to the data the
user can already see — see [AI_REPORTING.md](../developer-guide/AI_REPORTING.md).

### Step 3: Set Up the Database

Make sure your MySQL server is running and the target database exists.

```bash
# Create the database (if it doesn't exist yet)
mysql -u root -p -e "CREATE DATABASE genesis_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# From the backend directory — run all migrations to create tables
cd backend
npx prisma migrate deploy

# Or, during development, use:
npx prisma migrate dev
```

> If you change `schema.prisma` later, run `npx prisma migrate dev --name <description>` to generate and apply a new migration.

### Step 4: Seed Demo Data

The seed script empties the database, creates the platform layer (plans, feature flags, security policy,
rate limits) and installs the **Genesis Capital** workspace from its vertical pack — 19 modules, 91 objects,
72 workflows, 15 dashboards, 22 staff accounts and about 2,300 demo records. It finishes by creating the
platform administrator `PLATFORM01`.

```bash
# From the backend directory
cd backend
node prisma/seed.js                 # with demo records
node prisma/seed.js --no-demo       # metadata and staff accounts only
```

Expected output (abbreviated):

```text
🌱 Seeding Genesis CRM database...
✅ Database cleared (99 tables)
✅ Platform: role · 4 plans · … feature flags · security policy · rate limits · announcement
🏢 created tenant #1 genesis-capital
▶ installing genesis-capital into tenant #1 (genesis-capital) with demo data
   · business units (0.4s)
   …
✅ Platform administrator PLATFORM01 created
🎉  Seed complete — workspace #1 genesis-capital with demo data
```

> **Warning:** the seed deletes ALL existing data before inserting. It refuses to run when `DATABASE_URL` is
> not a local host (`localhost`, `127.0.0.1`, `mysql`, `db`) unless you pass `--allow-remote` or set
> `SEED_ALLOW_REMOTE=1`. A demo install takes a few minutes locally and 40–60 minutes over a remote database.

Passwords can be set before seeding with `SEED_PLATFORM_PASSWORD` (default `Platform@123`) and
`SEED_STAFF_PASSWORD` (default `GenesisDemo#2026`).

### Step 5: Start the Servers

From the repository root, one command starts both:

```bash
make start
```

```text
  backend    starting on :3001
  frontend   starting on :5173
  waiting.............

  Open        http://localhost:5173
  API         http://localhost:3001  (database connected)
  Logs        make logs        Stop  make stop
```

It waits until both servers answer, so the URLs it prints are ready to open. The
backend retries the database with exponential backoff before it listens, so a
slow or unreachable database can make the first start take up to a minute; it
then runs in degraded mode and `make start` says so.

| Command | What it does |
| ------- | ------------ |
| `make start` | Starts both in the background and waits for them |
| `make stop` | Stops both — the pid tree first, then anything still holding the ports |
| `make restart` | Stops, then starts |
| `make status` | Which services are up, their ports and pids, and whether the database answers |
| `make logs` | Follows both logs; Ctrl-C detaches without stopping the servers |
| `make dev` | Runs both in the foreground with interleaved output; Ctrl-C stops both |
| `make clean` | Removes `.dev/` (logs and pid files) |

`make start` is idempotent: a service that is already running is left alone,
while a stale listener from a crashed run is cleared first. Both ports can be
overridden for one invocation, and the backend port otherwise comes from `PORT`
in `backend/.env`:

```bash
make start BACKEND_PORT=4001 FRONTEND_PORT=5174
```

**Running them by hand instead.** Open two terminal tabs:

```bash
cd backend && npm run dev     # Server listening at http://0.0.0.0:3001
cd frontend && npm run dev    # Local: http://localhost:5173/
```

Open your browser at <http://localhost:5173>.

> The frontend dev server proxies all `/api` requests to `http://localhost:3001` automatically, so you only visit port 5173.

---

## First Login & Demo Accounts

Open <http://localhost:5173>. You will be redirected to the login page automatically.

Enter your **Employee ID** and **Password**, then click **Sign in**.

- **Show password** — click the eye icon inside the password field to reveal or
  hide what you've typed.
- **Remember me** — leave this checked (the default) to stay signed in after you
  close the browser; uncheck it to have the session end when you close the tab.
- **Forgot password?** — click the link to request a reset. Enter your Employee ID
  or email and a reset link (valid for 1 hour) is sent to your account's email
  address. See [Resetting a forgotten password](#resetting-a-forgotten-password) below.

### Demo Accounts (created by the seed script)

Every workspace account uses the demo password **`GenesisDemo#2026`**; the platform administrator uses
`Platform@123`.

| Role | Employee ID | Name | Access |
| ---- | ----------- | ---- | ------ |
| Platform Admin | PLATFORM01 | Platform Super Admin | Platform console (tenants, plans, flags) |
| CRM Administrator | GCADMIN | Kevin Lam | Full workspace access + Builder |
| Chief Operating Officer | GCCOO | Anjali Gopee | Management dashboards, approvals |
| Relationship Manager | GCRM1 | Priya Ramdin | Own client book |
| Loans Executive | GCLOAN1 | Sophie Lagesse | Retail lending |
| Manager, Loans & Fixed Income | GCLMGR | Rajiv Doorgakant | Lending approvals |
| Compliance Officer | GCCOMP1 | Fatima Hossenbux | KYC, screening, barriers |
| Corporate Advisor | GCADV1 | Camille Rivalland | Advisory mandates behind a barrier |

> **Employee ID is case-sensitive** — use uppercase exactly as shown.

All 22 accounts, what each demonstrates, and how to change the demo password:
[GENESIS-CAPITAL/IMPLEMENTATION.md §0](../GENESIS-CAPITAL/IMPLEMENTATION.md#0-signing-in-to-the-genesis-demo).

After login your session is stored in the browser. It expires after
8 hours (configurable via `JWT_EXPIRY` in `.env`). With **Remember me** checked the
session is kept in `localStorage` and survives a browser restart; unchecked, it is
kept in `sessionStorage` and is discarded when the tab or browser closes.

### Resetting a forgotten password

1. On the login page click **Forgot password?**
2. Enter your **Employee ID or email** and click **Send reset link**. To avoid
   revealing which accounts exist, the confirmation message is always the same
   whether or not a match was found.
3. If a matching active account with an email exists, a reset link is emailed to it.
   The link is valid for **1 hour**.
4. Open the link and set a new password (minimum 8 characters). The link is
   single-use — it is cleared once the password is changed.

> **Email delivery** — reset emails are sent through the configured SMTP transport.
> If `SMTP_HOST` is not set, the backend runs in **preview mode**: the email is
> logged (not delivered), which is fine for local development. Set the reset link's
> base URL explicitly with `APP_URL` when running behind a proxy or on a custom domain.

### Test Your Installation

1. **Login** as `GCADMIN` / `GenesisDemo#2026`
2. **Dashboard** should load the Genesis Capital management dashboards
3. **Parties**, **Loan applications** and **Fund orders** should list demo records
4. **Builder** should appear in the sidebar for `GCADMIN`
5. **Platform Admin** (`PLATFORM01`) should see the Platform section

---

## Next Steps

Once your installation is working:

- **Daily Operations** — [user-guide/DAILY_OPERATIONS.md](../user-guide/DAILY_OPERATIONS.md) — Learn to navigate and use
  CRM features
- **Administrator Setup** — [admin-guide/SYSTEM_CONFIGURATION.md](../admin-guide/SYSTEM_CONFIGURATION.md) — Configure
  modules, permissions, and workflows
- **Development** — [developer-guide/ARCHITECTURE_AND_SETUP.md](../developer-guide/ARCHITECTURE_AND_SETUP.md) —
  Technical details and customization

### Quick Links (after setup)

- **Dashboard:** <http://localhost:5173/dashboard>
- **Sales Module:** <http://localhost:5173/module/1>
- **Builder Studio:** <http://localhost:5173/builder> (admin only)

### Common Issues

**Cannot connect to database:**

- Check MySQL server is running
- Verify `DATABASE_URL` in `.env` file
- Ensure database exists and user has permissions

**Frontend won't start:**

- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check port 5173 is available: `lsof -i :5173`

**Login fails:**

- Verify seed script completed successfully
- Check JWT_SECRET is set in `.env`
- Clear browser storage and try again

For more detailed troubleshooting, see [developer-guide/ARCHITECTURE_AND_SETUP.md](../developer-guide/ARCHITECTURE_AND_SETUP.md#troubleshooting).
