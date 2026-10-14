# Genesis Capital CRM — Demo Pitch and Q&A Guide

For the team presenting the Genesis Capital CRM to the client's capital-management and technical teams. It covers
how to run the meeting, what to show, what to say, and how to answer the questions they are likely to ask.

On screen, the product and the demo company are called **Genesis Capital**. All names, people and documents in the
demo are invented. Every sample document is marked SPECIMEN.

---

## 1. The message in one sentence

> "One CRM for every desk — lending, wealth, funds, trading, advisory, forex and compliance — that follows your
> rules (KYC, suitability, Chinese walls, four-eyes approvals) and that your own team can change without
> developers."

Keep coming back to three ideas:

1. **One client view.** Every desk sees the same client, with the right level of detail for their role.
2. **Rules built in.** Compliance controls are part of the workflow, not a separate checklist.
3. **Yours to change.** Screens, fields, stages, workflows and dashboards are settings, not code.

---

## 2. Before the meeting

### The day before

- [ ] Restart the application (`make restart`) and sign in once with each account in §4.
- [ ] Open the **Group Executive** dashboard as `GCCOO` and check that every chart shows data.
- [ ] Open **Tools ▸ Approvals** as `GCLMGR` and check that there is at least one approval waiting.
- [ ] Check the client portal at `/portal/genesis-capital` with `vikash.ramdhony@example.mu`. Leave email
  unconfigured in the demo environment, so the one-time code appears on screen.
- [ ] Note the website form links that the installer printed (`/f/<key>`). You need the *Real Estate Loan* one.
- [ ] Take screenshots of each scene in §5 as a backup if the network fails.

### On the day

- Use one browser with a separate **profile or private window per persona**, so you can switch user without
  signing out. Name the windows "RM", "Loans manager", "Compliance", "Trader", "COO".
- Set browser zoom to 110–125% so the room can read the screen.
- Close email, chat and notifications.
- Have one person present and one person take notes of every question and request.

---

## 3. Agenda

### 60-minute version

| Time | Part | Who leads |
| --- | --- | --- |
| 0–5 | Introductions; what they want from today | Account lead |
| 5–12 | Their challenges and how we understood them (§3.1) | Account lead |
| 12–42 | Live demo, scenes 1–8 (§5) | Solution consultant |
| 42–52 | How it works underneath: security, integrations, deployment (§6) | Technical lead |
| 52–60 | Questions and next steps (§9) | Account lead |

### 30-minute version

Show scenes 1, 2, 4, 6 and 8 only. Offer the technical deep-dive as a separate session.

### 3.1 What we heard (say this back to them)

- Client information sits in different systems per business line, so nobody sees the whole relationship.
- Lending work is tracked in email and spreadsheets; it is hard to know where an application is.
- KYC, suitability and conflict checks rely on people remembering to do them.
- Advisory work must be kept away from trading and other desks (Chinese walls).
- Management reporting is assembled by hand every month.

Ask: *"Is this still right? What would you add?"* Let them talk. Use their words later in the demo.

---

## 4. Demo accounts

Password for every staff account: `GenesisDemo#2026`. Employee IDs are in capitals.

| Persona | Employee ID | Use for |
| --- | --- | --- |
| Relationship Manager | `GCRM1` | My Workbench, client view, enquiries, tasks |
| Loans Executive | `GCLOAN1` | Moving a loan through its stages, document checklist |
| Credit Analyst | `GCCRED1` | Credit appraisal, sending for approval |
| Loans Manager | `GCLMGR` | Approving in the Approvals inbox |
| Operations Checker | `GCOPS1` | Second pair of eyes on disbursements and fund orders |
| Compliance Officer | `GCCOMP1` | KYC sign-off, revealing masked data, barriers |
| Corporate Advisor | `GCADV1` | Confidential advisory mandates |
| Trader | `GCTRD1` | Showing that advisory work is invisible to trading |
| Forex Dealer | `GCFX1` | FX quote to deal |
| Chief Operating Officer | `GCCOO` | Group Executive dashboard |
| CRM Administrator | `GCADMIN` | Builder: changing a field or a stage live |

All 22 accounts: [IMPLEMENTATION.md §0](IMPLEMENTATION.md#0-signing-in-to-the-genesis-demo).

---

## 5. The demo, scene by scene

Each scene has: **who** to sign in as, **what** to do, **what to say**, and the **moment** to pause on.

### Scene 1 — A new client arrives from the website (5 min)

- **Who:** open the website form, then `GCLOAN1`.
- **Do:** fill the *Real Estate Loan* form (`/f/<key>`) as a member of the public, in French. Switch to `GCLOAN1`:
  the enquiry is already there, routed to Lending, with a French acknowledgement sent and a response-time clock
  running. Convert it: the client, their KYC case and the loan application are created in one step.
- **Say:** "No re-typing. The website, the CRM and the client's language are joined up."
- **Moment:** the response-time (SLA) clock on the enquiry.

### Scene 2 — The whole client on one screen (4 min)

- **Who:** `GCRM1`.
- **Do:** open **My Workbench**: today's meetings, tasks, reviews due and next-best actions. Open a high-value
  client: total relationship value, products held across business lines, documents, history.
- **Say:** "Every desk works on the same client record. The RM sees the full relationship, not just their part."
- **Moment:** the ID number is **masked**. Advisory rows say "restricted — contact Compliance".

### Scene 3 — A loan from application to money paid out (7 min)

- **Who:** `GCLOAN1` → `GCCRED1` → `GCLMGR` → `GCOPS1`.
- **Do:** open a loan application. Show the stage bar, the document checklist and the credit-bureau report. As
  `GCCRED1`, send it to credit approval. As `GCLMGR`, open **Tools ▸ Approvals** and approve with a comment: the
  application moves to *Offer issued* and a PDF offer letter appears, ready for e-signature. As `GCOPS1`, approve
  the disbursement; the loan system returns an account number.
- **Say:** "Every stage, document and decision is recorded. The person who prepares a disbursement can never be
  the person who approves it."
- **Moment:** the maker cannot approve their own request.

### Scene 4 — Compliance built into the work (4 min)

- **Who:** `GCRM1`, then `GCCOMP1`.
- **Do:** try to place a Global Private Equity fund order for a conservative client: it is **refused** until an
  override and the client's acknowledgement are recorded. As `GCCOMP1`, approve a KYC case and reveal a masked ID
  number: the reveal is written to the audit trail.
- **Say:** "The rules run inside the process. Nobody has to remember them."
- **Moment:** the refused order.

### Scene 5 — Chinese walls (3 min)

- **Who:** `GCADV1`, then `GCTRD1`.
- **Do:** as `GCADV1`, open a confidential advisory mandate and add a deal-team member: they appear on the insider
  list. As `GCTRD1`, search for the same mandate: it does not exist for them.
- **Say:** "Confidential work is invisible outside the wall — not hidden behind a button, simply not there."
- **Moment:** the trader's empty search.

### Scene 6 — The client portal (3 min)

- **Who:** `/portal/genesis-capital` as `vikash.ramdhony@example.mu`.
- **Do:** sign in with the one-time code. Show loan status, fund holdings (each with a **Redeem** button), fund
  orders (**+ Invest** for a new subscription) and consents. Upload a document and send a
  message to the RM. Switch back to `GCRM1`: the message is on the client's record.
- **Say:** "Clients follow their own business and send documents securely. Fewer phone calls and emails."

### Scene 7 — French and forex (2 min)

- **Who:** `GCFX1`.
- **Do:** open **Forex Desk ▸ FX quotes**, then switch the header to **FR**: module names, record tabs, field and
  column names, stages and picklists turn French. Switch back to **EN**, then create an FX quote, accept it, and see
  the deal booked with a dealing reference.
- **Say:** "Your business vocabulary — modules, fields, stages, picklists — and every client letter and email are
  bilingual. Translating the remaining interface text (buttons, menus, dashboards) is on the roadmap."
- **Careful:** show French on a **record screen**, not on the dashboard. Buttons, sidebar headings and dashboard
  titles stay English, so the dashboard looks mixed in French.

### Scene 8 — Management view, and changing it live (4 min)

- **Who:** `GCCOO`, then `GCADMIN`.
- **Do:** open the **Group Executive** dashboard: relationship value, AUM, loan book, revenue by entity, cross-sell.
  Open **Reports**, run one of the saved reports and drill down to the records behind a total. As `GCADMIN`, open the **Builder**, add a field to a form or
  rename a stage, and show it appear immediately.
- **Say:** "Your monthly pack is live, every day. When you need a change, your own administrator makes it in
  minutes — no release, no developer."
- **Moment:** the live change.

---

## 6. Technical talk track (10 minutes)

Keep it simple; offer a deep-dive session for detail.

- **How it is built.** A web application: React front end, Node.js API, MySQL database, Redis cache. It runs in
  Docker containers, so it can be hosted in the client's cloud account or data centre.
- **Everything is configuration.** Modules, objects, fields, forms, stages, workflows, approvals, dashboards and
  permissions are stored as settings and edited in the Builder. The financial-services setup is one
  "vertical pack" installed on the platform.
- **Security.**
  - Two-factor sign-in (authenticator app) that the security policy can make compulsory.
  - Sessions can be ended at once: deactivating a user or a password change signs them out everywhere.
  - Sensitive fields (ID numbers, MFA secrets) are encrypted in the database (AES-256-GCM) and masked on screen
    for roles without permission.
  - Business units, information barriers (Chinese walls) and wall-crossings control who sees what.
  - A tamper-evident audit trail records changes, approvals, permission changes and data reveals.
  - Each workspace's data is kept apart by the platform; one workspace can never read another's.
- **Integrations.** Screening, credit bureau, loan system, transfer agent, order management, FX dealing and SMS
  are already wired into the workflows. In the demo they run against a **sandbox** that gives realistic
  answers. Going live means entering each provider's connection details; the workflows do not change. Failed
  calls are retried automatically.
- **Data migration.** Every record has an external reference. CSV imports match on it, so data can be loaded,
  checked and re-loaded safely.

---

## 7. Questions to expect — capital-management teams

Short, honest answers. If you do not know, write the question down and promise an answer by a date.

### Management and strategy

| Question | Answer |
| --- | --- |
| Can I see the whole relationship with a client across all our companies? | Yes. One client record, with roll-ups of loans, holdings, mandates, trading and FX across business units (Scene 2). |
| Can we get our monthly management pack from it? | Yes. 15 dashboards ship, including Group Executive, Loan Book, Wealth, Funds, Compliance and an RM league table. Any saved report can be added to a dashboard. |
| How long until we are live? | It depends on integrations and data migration. The CRM itself is already configured; we propose a discovery workshop to agree scope and a plan (§9). |
| Is it built for us or a generic CRM? | Both: a general CRM platform with a ready financial-services setup that matches your business lines and products. It is changed through settings, not custom code. |

### Lending

| Question | Answer |
| --- | --- |
| Does it calculate eligibility and pricing? | Yes. Rates are linked to the prime lending rate; debt-service ratio, loan-to-value and product limits are calculated and checked. |
| What happens when the prime lending rate changes? | A rate-change campaign finds the affected loans and produces client notices. |
| Can it handle staged disbursements and conditions? | Yes. Conditions precedent, security perfection, tranches and a four-eyes disbursement check. |
| Does it connect to our loan management system and credit bureau? | The connections are built and running on the sandbox. We need your provider credentials to go live. |
| Can clients apply online? | Yes, through website forms (with a calculator). Clients then follow progress and upload documents in the portal. |

### Wealth, funds and securities

| Question | Answer |
| --- | --- |
| How do you handle suitability? | Each client has a risk profile; orders above it are blocked unless an override and the client's acknowledgement are recorded (Scene 4). |
| Can clients place fund orders themselves? | Yes, in the portal, subject to cut-off times, KYC and suitability rules. Operations checks them before they go to the transfer agent. |
| Do you show NAVs and holdings? | Yes. NAV history, holdings and order history per client. NAVs, FX rates and the prime lending rate can also be published to your website. |
| Can we run fund campaigns? | Yes. Campaigns, segments, events and consent-aware mailing lists. |

### Advisory and forex

| Question | Answer |
| --- | --- |
| How do you keep advisory deals confidential? | Information barriers. Mandates behind the wall do not exist for other desks (Scene 5). Wall-crossings are requested, approved and recorded. |
| Do you keep insider lists? | Yes. Adding a person to the deal team adds them to the insider list. |
| Can dealers quote and book FX? | Yes. Quote, accept, deal with a dealing reference; forwards; rate alerts by SMS. |

### Compliance, risk and audit

| Question | Answer |
| --- | --- |
| Does it do KYC and AML screening? | KYC cases with risk scoring, document checklists, periodic reviews and screening at onboarding and daily. Suspicious-transaction reports are visible to the MLRO only. |
| Who can see ID numbers? | Only roles with permission. Revealing one is recorded in the audit trail. |
| Is there four-eyes control? | Yes, on KYC approval, disbursements, fund orders and rate overrides. The maker can never approve their own work. |
| Can the auditor check everything? | Yes. A read-only auditor role, and a tamper-evident audit trail whose integrity can be verified. |
| Data protection: consent and data-subject requests? | Consent per purpose and channel (clients can change it in the portal), marketing suppression, and a data-subject request register. |
| Complaints? | A complaints register with acknowledgement letters, deadlines, root causes and Ombudsperson referrals. |

### Daily users

| Question | Answer |
| --- | --- |
| Is it in French? | Module, field, stage and option names and all client letters and emails are in English and French. Buttons, menus and dashboard titles are English today; translating them is on the roadmap. |
| Does it work with Outlook? | Each user gets a calendar link that shows their CRM meetings in Outlook or Google Calendar. Two-way sync needs your Microsoft 365 connection. |
| Does it work on a phone? | It runs in a mobile browser. There is no separate mobile app or offline mode today. |
| Will it remind me what to do? | Yes. My Workbench, tasks, reminders, notifications and next-best actions. |

---

## 8. Questions to expect — technical teams

| Question | Answer |
| --- | --- |
| What is the technology stack? | React and Vite front end; Node.js (Fastify) API; Prisma; MySQL 8; Redis. |
| Where can it be hosted? | Anywhere that runs Docker: your cloud account (AWS, Azure, GCP) or your data centre. Data residency is your choice. |
| Is it multi-tenant? Is our data separate? | The platform is multi-tenant; each workspace is isolated automatically on every database query. A dedicated installation for you alone is also possible. |
| Single sign-on with Entra ID? | Not yet. Two-factor sign-in is available today; SSO (OIDC/SAML) needs your Entra ID tenant and an app registration. |
| How is data encrypted? | Sensitive fields are encrypted in the database with AES-256-GCM. Encryption in transit (HTTPS) and at rest for the disk and backups is set up in your hosting. |
| How are sessions secured? | Short-lived access tokens with rotating refresh tokens; a replayed refresh token revokes the whole session family. Sessions end at once on deactivation or password change. Sign-in attempts are rate-limited, and repeated failures block further attempts for a while. |
| How do integrations work? | Each external system is an integration in the Builder. Workflows call it; calls are logged; failures are retried with back-off from a durable queue. Inbound webhooks are signed (HMAC). |
| Do you have an API? | Yes, a REST API for records and metadata, plus read-only public feeds for the website. |
| How do we migrate our data? | CSV import, matched on an external reference, so loads can be repeated safely. We run trial loads and reconciliation in the project. |
| Where are documents stored? | Pluggable storage: local disk, Amazon S3 (or compatible), Azure Blob or Google Cloud Storage. Files are de-duplicated and versioned. |
| How do you test it? | About 1,500 automated tests (back end and front end) run on every change in CI, plus end-to-end business-flow scripts for lending and every desk. |
| Backups and disaster recovery? | Uses your managed database's backups and point-in-time recovery; documents follow the storage provider's replication. RPO/RTO are agreed in the hosting design. |
| Scalability? | The API is stateless and runs as several instances behind a load balancer; background jobs are shared safely between instances. |
| Monitoring? | A `/health` endpoint (database, cache, queue depth) and structured JSON logs for your monitoring tools. |
| Can we change it ourselves? | Yes. Administrators use the Builder for fields, forms, stages, workflows, permissions and dashboards. New screens rarely need code. |
| Is there AI? | Optional "ask a question" reporting that turns a plain-English question into a report. It can use a model you host yourself, so data does not leave your environment, and it only sees data the user may already see. |
| Infrastructure as code? | Docker images and CI are ready. Terraform or CDK for your cloud is part of the hosting work. |

---

## 9. Being honest about gaps

Say what is not there yet before they find it. It builds trust.

| Not in the demo yet | What it needs |
| --- | --- |
| Single sign-on (Entra ID / Google) | Your identity tenant and an app registration |
| Live screening, credit bureau, loan system, transfer agent, OMS, FX dealing, SMS | Provider contracts and credentials (the connections run on a sandbox today) |
| Two-way Outlook / Google calendar sync | Microsoft 365 or Google connection |
| WhatsApp | A WhatsApp Business account |
| Full-text search inside every field | Not needed at current volumes; can be added |
| French for buttons, menus and dashboards | Business labels and letters are bilingual; the remaining interface text is a translation task on the roadmap |
| Screen comparing old and new values before approval | Approvals already stop the maker approving their own change |
| e-KYC, OCR, telephony, offline mobile | Vendor selection |

Suggested words: *"This is configured and working against a sandbox. To go live we need your credentials for X;
nothing in the workflow changes."*

---

## 10. Closing and next steps

1. **Recap** the three ideas from §1, using their own words from the opening.
2. **Ask:** *"Which part would make the biggest difference to your team first?"*
3. **Propose:**
   - a **discovery workshop** (half a day per business line) to confirm processes, roles and reports;
   - a **sandbox** environment for their key users to try for two weeks;
   - an **integration list**: which systems, which provider, who owns the credentials;
   - a **phased plan**, for example lending and client view first, then wealth and funds, then advisory and FX.
4. **Agree** a date for the follow-up and who attends.

### Follow-up email (within 24 hours)

- Thank them; list the questions asked and the answers (or the date an answer will follow).
- Attach the sandbox access details if agreed.
- Confirm the next meeting.

---

## 11. Do and don't

| Do | Don't |
| --- | --- |
| Tell a story with one client from start to finish | Click through every menu |
| Switch persona to show who sees what | Show everything as the administrator |
| Say "sandbox" when an integration answers | Suggest live connections exist today |
| Write down every question | Guess at an answer to a technical question |
| Stop and ask "how do you do this today?" | Talk for more than five minutes without a question |

If something fails on screen: stay calm, say "let me show you the screenshot", and move to the next scene.
