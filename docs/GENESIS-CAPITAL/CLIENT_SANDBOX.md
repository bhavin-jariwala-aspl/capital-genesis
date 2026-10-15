# Genesis Capital CRM — Client Sandbox: Delivery Checklist

For the delivery team that hosts a sandbox so a prospect's own staff can try the CRM for a few weeks. The
client-facing version of this plan (what testers get, ground rules, tasks per role) is published separately as the
*Sandbox Evaluation Plan*; this document is the internal side: how to build, run, reset and close the environment.

**One rule above all:** the sandbox is a separate installation with its own database. Never give a client access to
a developer laptop, never point a sandbox at the shared development RDS, and never expose a local server through a
tunnel (ngrok or similar).

---

## 1. Why a separate environment

| In the development setup | Risk if shared |
| --- | --- |
| `DATABASE_URL` is the shared development RDS | Client actions (imports, bulk edits) and our re-installs affect each other; their test data sits beside ours |
| Every `GC…` account has the same password, printed in DEMO_PITCH.md | Anyone can sign in as anyone; the audit trail stops meaning anything |
| `PLATFORM01` is the platform super-admin | Full control of every workspace and platform setting |
| Runs on a laptop, far from the database | Only up while the laptop is on; slow pages; the API has stopped on database connection errors |
| Signing keys derive from a development `JWT_SECRET`; no HTTPS; `APP_URL` unset | Weak secrets; emailed links point at `localhost` |

---

## 2. Before the sandbox is built — agree with the client

- [ ] Evaluation agreement or NDA signed (access, confidentiality, feedback, no real data, end date).
- [ ] Dates: kickoff, mid-point check-in, close (2–4 weeks).
- [ ] An evaluation lead on their side, and the tester list: name, work email, which role (§5).
- [ ] Email mode (§4.4) agreed.
- [ ] Whether one of their people gets a Builder (administrator) account.

---

## 3. Build the environment

### 3.1 Hosting

- Use the shipped Docker set-up (`docker-compose.yml`: MySQL, Redis, API, web, uploads volume) on a small cloud
  server, or the same images on a container service. App and database in the **same region**.
- Its **own** MySQL 8 database and Redis. Automated daily backups.
- HTTPS on a sandbox subdomain we control (for example `sandbox.<our-domain>`), never the client's domain and never
  a name that uses the client's brand.
- Document storage on the uploads volume, or an S3 bucket dedicated to this sandbox.

### 3.2 Environment variables

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (sign-in codes are no longer shown on screen; stack traces hidden) |
| `DATABASE_URL` | The sandbox database only |
| `JWT_SECRET` | New random value, 48+ characters |
| `FIELD_ENCRYPTION_KEY` | New 64-hex key; record it in the team password manager |
| `UPLOAD_LINK_SECRET`, `PORTAL_SECRET`, `CALENDAR_FEED_SECRET` | New random values |
| `APP_URL` | `https://sandbox.<our-domain>` |
| `API_URL` | The API's public address, if not served under `APP_URL/api` |
| `ALLOWED_ORIGINS` | The sandbox web address only |
| `SMTP_*` | Per §4.4 |
| `RECAPTCHA_SECRET`, `RECAPTCHA_SITE_KEY` | Recommended: the public forms are reachable from the internet |
| `SEED_STAFF_PASSWORD`, `SEED_PLATFORM_PASSWORD` | Random, used once during the seed, then discarded |

### 3.3 Install

```bash
cd backend
npx prisma migrate deploy
SEED_ALLOW_REMOTE=1 node prisma/seed.js          # empties the SANDBOX database, installs platform + pack + demo data
```

A remote install takes 40–60 minutes; run it on a machine in the same region as the database to cut that to
minutes. Check the public form keys it prints, then sign in once as `GCADMIN` and `PLATFORM01` and change both
passwords.

> The seed empties every table of the database it points at. Read `DATABASE_URL` aloud before running it.

### 3.4 Smoke test (before handing over)

- [ ] `/health` returns 200 (database, cache, queue).
- [ ] Each persona in §5 signs in; dashboards show figures; the Approvals inbox has the waiting items.
- [ ] A public form submits and the enquiry appears, routed.
- [ ] A Docs-tab upload link opens from another device and accepts a PDF.
- [ ] A portal sign-in code arrives in the test inbox (§4.4).
- [ ] `/site/genesis-capital` shows rates, PLR and the NAV chart.

---

## 4. Accounts and access

### 4.1 Testers use the persona accounts

Demo records are owned by the `GC…` staff accounts, so My Workbench, task lists and approvals only make sense for
them. Give each tester **one persona account** rather than a new empty account:

- Set the account's email to the tester's work email (Employees page).
- Issue a temporary password with **Force Password Reset** (§4.2). It is shown once; send the user ID and the
  password through **different channels** (for example email and phone).
- Keep a mapping sheet (persona ID → tester name), so the audit trail can be read.
- One tester per account. If two testers need the same role, use the pairs (`GCRM1`/`GCRM2`/`GCRM3`,
  `GCLOAN1`/`GCLOAN2`).
- Accounts nobody is using: give them random passwords nobody holds, or deactivate them.

### 4.2 Platform console settings

As `PLATFORM01`:

- **Two-factor sign-in for every tester.** The platform console's Security page shows the policies but cannot edit
  them, so set it through the API (platform-admin token):
  `PUT /api/platform/security/policies` with `{ "tenant_id": <sandbox workspace id>, "require_mfa": true }`.
  Testers then enrol an authenticator app at their first sign-in. Check that the Security page shows
  *MFA Required: Yes*.
- **Temporary passwords.** Security page ▸ **Force Password Reset**, one account at a time. Each issues a
  temporary password, shown once, which the tester changes at first sign-in.

`PLATFORM01` and `GCADMIN` stay with our team. If the client wants to try the Builder, give one named person
`GCADMIN` (or a second administrator account) and say that changes they make apply to every tester.

### 4.3 Portal testers

Portal users are clients (parties), identified by email; the demo parties use invented `@example.mu` addresses. For
portal testing either:

- point a demo party (for example Karine Ruhee) at the tester's address, or
- use the test inbox (§4.4) and give the evaluation lead access to it.

### 4.4 Email mode

| Mode | Set-up | Effect |
| --- | --- | --- |
| **Test inbox (recommended)** | `SMTP_*` pointing at a mail-catching service (for example Mailtrap) | Every email (acknowledgements, upload links, research sends, portal sign-in codes) lands in one inbox we share with the evaluation lead; nothing reaches a real person |
| Off | `SMTP_*` unset | Emails are only logged. In production mode the portal sign-in code is then **not** shown on screen, so the portal cannot be tested |
| Real mail server | Not for a sandbox | Demo workflows would email the invented client addresses and anything a tester types |

---

## 5. Roles to hand out

| Role | Account | Main things to try |
| --- | --- | --- |
| Loans executive | `GCLOAN1`, `GCLOAN2` | Website enquiry to application; document checklist and upload link |
| Loans manager | `GCLMGR` | Credit approvals in the Approvals inbox |
| Credit analyst | `GCCRED1` | Appraisal |
| Relationship manager | `GCRM1`, `GCRM2`, `GCRM3` | My Workbench, Client 360, fund orders, "Talk to" links |
| Operations checker | `GCOPS1` | Four-eyes checks on fund orders and disbursements |
| Compliance officer | `GCCOMP1` | KYC, screening hits, masked data, audit chain |
| Corporate advisor | `GCADV1` | Advisory mandates behind the wall |
| Trader | `GCTRD1` | Order log, restricted list, research to subscribers |
| Forex dealer | `GCFX1` | Quote to deal |
| COO | `GCCOO` | Group Executive dashboard, reports |

The full role list is in [IMPLEMENTATION.md §10](IMPLEMENTATION.md#10-roles-and-sign-ins).

---

## 6. During the trial

- **Kickoff (30 minutes):** sign-in and two-factor set-up, the task list, ground rules, where to send feedback.
- **Watch:** `/health`, API error logs, disk and database size. Check the job queue does not grow.
- **Support:** one named contact, answering within a working day.
- **Feedback:** one shared tracker (each item: who, role, screen, what happened, expected). Tag *bug*, *change*,
  *question*.
- **Mid-point check-in:** review feedback, agree fixes, decide whether to reset.
- **Changes:** fix in the pack, re-run the installer on the sandbox (metadata-only runs take seconds). Never edit
  sandbox configuration by hand without putting it back in the pack.

---

## 7. Reset and close

- **Reset** (between phases or after heavy testing): re-run `SEED_ALLOW_REMOTE=1 node prisma/seed.js` against the
  sandbox database, then repeat §4.1–4.2. Tell testers first: their test data is wiped.
- **Close** on the agreed date:
  - deactivate every account and revoke sessions;
  - export the feedback tracker and the email log if the client wants them;
  - destroy the database, Redis, document storage and backups;
  - delete the DNS name and the test inbox;
  - confirm deletion to the client in writing.

---

## 8. Do not

- Load real client data. Real data needs the production hosting, a data-processing agreement and a Data Protection
  Act review.
- Connect live providers (screening, MCIB, LMS, TA, OMS, FX dealing, SMS). Integrations stay on the sandbox
  simulator.
- Share `PLATFORM01`, the demo password, or this document.
- Use the client's name or brand in the sandbox address, workspace or data. The demo company is Genesis Capital.
