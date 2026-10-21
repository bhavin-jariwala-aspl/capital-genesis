# Genesis Capital CRM — Demo Pitch and Q&A Guide

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Genesis Capital workspace](README.md)** › 4 of 5 · **For:** Presenters
> ← [Implementation](implementation.md) · [Client sandbox](client-sandbox.md) →
> New to Genesis? Background: [Understanding Genesis › What Genesis is](../understanding/01-what-genesis-is.md)
<!-- /nav:top -->

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

All links below assume the app runs on this laptop (`make start`). On another server, replace
`http://localhost:5173` with its address. Record numbers (`record=…`) belong to the current demo install;
after a re-install, open the same screen from the sidebar and use the record named in the scene.

### The day before

- [ ] Restart the application (`make restart`) and sign in once with each account in §4 at
  <http://localhost:5173/login>.
- [ ] As `GCCOO`, open the **Group Executive** dashboard — <http://localhost:5173/?dashboard=28> — and check that every chart
  shows data.
- [ ] As `GCLMGR`, open the **Approvals** inbox — <http://localhost:5173/approvals> — and check that the credit approval for
  **Karine Ruhee · LND-IBL** is waiting (Scene 3).
- [ ] Open the client portal — <http://localhost:5173/portal/genesis-capital> — and sign in as `karine.ruhee@example.mu`. Leave email
  unconfigured in the demo environment, so the one-time code appears on screen.
- [ ] Open the website preview — <http://localhost:5173/site/genesis-capital> — and check that the rate board, the
  prime lending rate and the fund NAV chart show figures.
- [ ] Open the website loan form once — <http://localhost:5173/f/2fe40fb6f0da0570cbe29eb9f465541b5c52897826acc486?prod=LND-RE> — but do not submit it during rehearsal.
- [ ] As `GCLOAN1`, open Anjali Ramgoolam's application
  <http://localhost:5173/module/89/object/170?record=3722> ▸ **Docs**: the checklist shows **4 outstanding**, including
  *Title deed / sale agreement*. Do not upload during rehearsal — or, if you do, reject the test file afterwards so the
  item is outstanding again.
- [ ] Keep a one-page PDF on the desktop (for example `Title deed - SPECIMEN.pdf`) for the upload in Scene 3.
- [ ] Take screenshots of each scene in §5 as a backup if the network fails.

> **Rehearse without using up the demo.** Approving Karine Ruhee's loan (Scene 3) can only be done once. To
> rehearse the Approvals step, sign in as `GCCC1` and use one of the two *Credit Committee* items in
> <http://localhost:5173/approvals> instead, and keep Karine's for the meeting.

### On the day

- Use one browser with a separate **profile or private window per persona**, so you can switch user without
  signing out. Name the windows "Loans", "RM", "Loans manager", "Compliance", "Trader", "COO", plus one
  "Client" private window for the website preview, the upload link and the portal.
- Set browser zoom to 110–125% so the room can read the screen.
- Close email, chat and notifications.
- Have one person present and one person take notes of every question and request.

## 3. Agenda

### 60-minute version

| Time | Part | Who leads |
| --- | --- | --- |
| 0–5 | Introductions; what they want from today | Account lead |
| 5–12 | Their challenges and how we understood them (§3.1) | Account lead |
| 12–44 | Live demo, scenes 1–8 (§5) | Solution consultant |
| 44–53 | How it works underneath: security, integrations, deployment (§6) | Technical lead |
| 53–60 | Questions and next steps (§10) | Account lead |

The extra scene (research to subscribers) is only for when a scene runs short or the client asks about marketing.

### 30-minute version

Show scenes 1, 2, 4, 6 and 8 only. In Scene 6, the portal upload covers documents; skip the upload-link step of
Scene 3. Offer the technical deep-dive as a separate session.

### 3.1 What we heard (say this back to them)

- Client information sits in different systems per business line, so nobody sees the whole relationship.
- Lending work is tracked in email and spreadsheets; it is hard to know where an application is.
- KYC, suitability and conflict checks rely on people remembering to do them.
- Advisory work must be kept away from trading and other desks (Chinese walls).
- Management reporting is assembled by hand every month.

Ask: *"Is this still right? What would you add?"* Let them talk. Use their words later in the demo.

---

## 4. Demo accounts

Sign in at <http://localhost:5173/login>. Password for every staff account: `GenesisDemo#2026`. Employee IDs are in capitals.

| Persona | Employee ID | Use for |
| --- | --- | --- |
| Loans Executive | `GCLOAN1` (or `GCLOAN2`) | New website enquiries, loan applications, document checklist and client upload link |
| Relationship Manager | `GCRM1` | My Workbench, client view, fund orders |
| Relationship Manager | `GCRM2` | Karine Ruhee's RM — receives her portal message |
| Loans Manager | `GCLMGR` | Approving a loan in the Approvals inbox |
| Operations Checker | `GCOPS1` | Second pair of eyes on fund orders and disbursements |
| Compliance Officer | `GCCOMP1` | Revealing masked data, KYC, barriers |
| Corporate Advisor | `GCADV1` | Confidential advisory mandates |
| Trader | `GCTRD1` | Showing that advisory work is invisible to trading; sending research to subscribers |
| Forex Dealer | `GCFX1` | FX quote to deal |
| Chief Operating Officer | `GCCOO` | Group Executive dashboard |
| CRM Administrator | `GCADMIN` | Builder: changing a field or a stage live |
| Platform Administrator | `PLATFORM01` (password `Platform@123`) | Only if asked about the platform console |

All 22 accounts: [implementation.md §0](implementation.md#0-signing-in-to-the-genesis-demo).

### Links at a glance

| Screen | Link |
| --- | --- |
| Sign in | <http://localhost:5173/login> |
| Website preview (rates, NAVs, forms) | <http://localhost:5173/site/genesis-capital> |
| Website loan enquiry form (Real Estate Loan preselected) | <http://localhost:5173/f/2fe40fb6f0da0570cbe29eb9f465541b5c52897826acc486?prod=LND-RE> |
| Enquiries list | <http://localhost:5173/module/87/object/163> |
| My Workbench dashboard | <http://localhost:5173/?dashboard=42> |
| Group Executive dashboard | <http://localhost:5173/?dashboard=28> |
| Client: Annabelle Ramful | <http://localhost:5173/module/86/object/157?record=3093> |
| Client: Mascarene Capital Partners Ltd | <http://localhost:5173/module/86/object/157?record=3115> |
| Client: Karine Ruhee | <http://localhost:5173/module/86/object/157?record=3091> |
| Loan application: Karine Ruhee · LND-IBL | <http://localhost:5173/module/89/object/170?record=3744> |
| Loan application already disbursed | <http://localhost:5173/module/89/object/170?record=3721> |
| Loan application waiting for documents: Anjali Ramgoolam · LND-RE | <http://localhost:5173/module/89/object/170?record=3722> |
| "Talk to" link: call-back form addressed to Priya Ramdin (`GCRM1`) | <http://localhost:5173/f/cab99175d481635f6bf4fc23480748c9fc975143e6f2f44f?expert=GCRM1> |
| Research note: Weekly market highlights — week 36 | <http://localhost:5173/module/95/object/203?record=4322> |
| Approvals inbox | <http://localhost:5173/approvals> |
| New fund order | <http://localhost:5173/module/94/object/196/new> |
| Advisory mandate: Project Dodo | <http://localhost:5173/module/96/object/204?record=4327> |
| Insider list | <http://localhost:5173/module/96/object/207> |
| FX quotes | <http://localhost:5173/module/97/object/214> |
| Reports | <http://localhost:5173/reports> |
| Builder: pipelines (rename a stage) | <http://localhost:5173/builder/pipeline> |
| Builder: forms (add a field) | <http://localhost:5173/builder/form> |
| Client portal | <http://localhost:5173/portal/genesis-capital> |
| Web forms (share a form with a client; links to the website preview and portal) | <http://localhost:5173/web-forms> |
| Shortcuts to your own workspace's website preview / portal (signed in) | <http://localhost:5173/site> · <http://localhost:5173/portal> |

---

## 5. The demo, scene by scene

Each scene has: **who** signs in, **where** to go, **what** to do, **what to say**, and the **moment** to pause on.
The story follows one client, **Karine Ruhee**, wherever it can.

### Scene 1 — A new client arrives from the website (5 min)

- **Who:** nobody (a member of the public), then `GCLOAN1`.
- **Where:** the website preview <http://localhost:5173/site/genesis-capital> (optional opener: live FX rates, PLR and
  fund prices, all fed by the CRM), then the website form <http://localhost:5173/f/2fe40fb6f0da0570cbe29eb9f465541b5c52897826acc486?prod=LND-RE>, then the Enquiries list <http://localhost:5173/module/87/object/163>.
- **Do:** step 1 shows *Real Estate Loan* already chosen — enter an amount and tenure and click **Continue**. In
  step 2 enter a new name and email, choose **Français**, tick consent and click **Send request**: the confirmation
  shows the enquiry reference. Sign in as `GCLOAN1` and open the Enquiries list: the enquiry is at the top, routed to Lending, with a
  French acknowledgement sent and a response-time clock running. Open it and convert it: the client, their KYC
  case and the loan application are created in one step.
- **Note:** lending enquiries go to `GCLOAN1` and `GCLOAN2` in turn. If it is not in `GCLOAN1`'s list, sign in
  as `GCLOAN2`.
- **Say:** "No re-typing. The website, the CRM and the client's language are joined up."
- **Moment:** the response-time (SLA) clock on the enquiry.
- **If asked "can a client ask for a specific person?":** open the "Talk to" link from §4 (call-back form addressed to
  Priya Ramdin). The form says *You'll speak with Priya Ramdin* and the enquiry lands in her list. Staff build these
  links in **Tools ▸ Web forms** with the *Talk to* picker.

### Scene 2 — The whole client on one screen (4 min)

- **Who:** `GCRM1`.
- **Where:** My Workbench <http://localhost:5173/?dashboard=42>, then Annabelle Ramful
  <http://localhost:5173/module/86/object/157?record=3093>, then Mascarene Capital Partners Ltd
  <http://localhost:5173/module/86/object/157?record=3115>.
- **Do:** on My Workbench show today's meetings, tasks, reviews due and next-best actions. Open Annabelle Ramful
  (relationship value about MUR 301 million): products held across business lines, documents, history. Then open
  Mascarene Capital Partners: its advisory work shows as "restricted — contact Compliance".
- **Say:** "Every desk works on the same client record. The RM sees the full relationship, not just their part."
- **Moment:** Annabelle's ID number is **masked** (`••••••••6519`). Click **Reveal**: it shows, and the reveal is
  recorded in the audit trail with the RM's name — Compliance will see it in Scene 4.

### Scene 3 — A loan from application to approval (9 min)

- **Who:** `GCLOAN1` → `GCLMGR` → `GCOPS1`.
- **Where:** Karine Ruhee's application <http://localhost:5173/module/89/object/170?record=3744>, then the Approvals inbox
  <http://localhost:5173/approvals>, then a disbursed loan <http://localhost:5173/module/89/object/170?record=3721>.
- **Do:** as `GCLOAN1`, open Karine Ruhee's investment-backed loan: the stage bar (it is at *Credit approval*), the
  document checklist and the credit-bureau report. As `GCLMGR`, open Approvals: **Credit approval: Karine Ruhee ·
  LND-IBL** is waiting. Approve it with a comment. Back on the application, it has moved to *Offer issued* and a
  PDF offer letter is in its documents, ready for e-signature. As `GCOPS1`, open Approvals: a fund order waits for
  the operations check — the second pair of eyes. Finally open the disbursed loan to show its disbursement and the
  account number returned by the loan system.
- **Then (2 min):** open Anjali Ramgoolam's real-estate application
  <http://localhost:5173/module/89/object/170?record=3722>, scroll down to the record tabs and click **Docs**. The
  checklist shows three documents received and four outstanding. Click **Copy client link** and open it in a private
  window: this is what the client sees — only what is still needed, no sign-in. Upload a PDF against *Title deed*;
  back in the CRM, refresh the Docs tab: it is received and waiting for review, and **3 outstanding** remain. Say:
  "No documents as email attachments, and the client never sees anything but their own list." The same link goes
  out automatically in the *Documents pending* email.
- **Say:** "Every stage, document and decision is recorded. The person who prepares a payment or an order can
  never be the person who approves it."
- **Moment:** the application moving to *Offer issued* with the offer letter attached.

### Scene 4 — Compliance built into the work (4 min)

- **Who:** `GCRM1`, then `GCCOMP1`.
- **Where:** New fund order <http://localhost:5173/module/94/object/196/new>, then Annabelle Ramful
  <http://localhost:5173/module/86/object/157?record=3093>, then Access & Barriers <http://localhost:5173/access>.
- **Do:** as `GCRM1`, create a fund order for **Sophie Martin** (a conservative client), share class **Genesis
  Global Private Equity Fund — USD class**, order type *Subscription*, amount 100,000: it is **refused** because
  the fund's risk is above her profile, until an override reason and her acknowledgement are recorded. As
  `GCCOMP1`, open Annabelle Ramful: Compliance has the "view personal data" permission, so her ID number is shown in
  full. Then open **Access & Barriers ▸ Audit chain**: the RM's reveal from Scene 2 is there, with who and when.
- **Say:** "The rules run inside the process. Nobody has to remember them."
- **Moment:** the refused order.

### Scene 5 — Chinese walls (3 min)

- **Who:** `GCADV1`, then `GCTRD1`.
- **Where:** Project Dodo <http://localhost:5173/module/96/object/204?record=4327>, the Insider list
  <http://localhost:5173/module/96/object/207>, then the search box at the top of any page.
- **Do:** as `GCADV1`, open **Project Dodo** and add a deal-team member: they appear on the insider list. As
  `GCTRD1`, type **Dodo** in the search box at the top of the page: nothing is found. (As `GCADV1`, the same search
  finds the mandate and its deal team.)
- **Say:** "Confidential work is invisible outside the wall — not hidden behind a button, simply not there."
- **Moment:** the trader's empty search.

### Scene 6 — The client portal (3 min)

- **Who:** the client, Karine Ruhee, then her RM `GCRM2`.
- **Where:** <http://localhost:5173/portal/genesis-capital>, then Karine Ruhee's record
  <http://localhost:5173/module/86/object/157?record=3091>.
- **Do:** sign in as `karine.ruhee@example.mu` with the one-time code shown on screen. Show the loan application
  approved in Scene 3, her loans, her fund holdings (each with a **Redeem** button), fund orders (**+ Invest** for a
  new subscription) and consents. Upload a document and send a message to her RM. Sign in as `GCRM2` and open her
  record: the message is in her activity timeline.
- **Say:** "Clients follow their own business and send documents securely. Fewer phone calls and emails."

### Scene 7 — French and forex (2 min)

- **Who:** `GCFX1`.
- **Where:** FX quotes <http://localhost:5173/module/97/object/214>.
- **Do:** switch the header to **FR**: module names, record tabs, field and column names, stages and picklists turn
  French. Switch back to **EN**, then click **New** to create an FX quote, accept it, and see the deal booked with a
  dealing reference.
- **Say:** "Your business vocabulary — modules, fields, stages, picklists — and every client letter and email are
  bilingual. Translating the remaining interface text (buttons, menus, dashboards) is on the roadmap."
- **Careful:** show French on a **record screen**, not on the dashboard. Buttons, sidebar headings and dashboard
  titles stay English, so the dashboard looks mixed in French.

### Scene 8 — Management view, and changing it live (4 min)

- **Who:** `GCCOO`, then `GCADMIN`.
- **Where:** Group Executive <http://localhost:5173/?dashboard=28>, then the Builder's pipelines
  <http://localhost:5173/builder/pipeline>.
- **Do:** as `GCCOO`, open the **Group Executive** dashboard: relationship value, AUM, loan book, revenue by entity,
  cross-sell. As `GCADMIN`, open the Builder's pipelines, rename a stage of the *Enquiry* pipeline, and show the new name on
  the Enquiries list <http://localhost:5173/module/87/object/163>. Rename it back afterwards.
- **Say:** "Your monthly pack is live, every day. When you need a change, your own administrator makes it in
  minutes — no release, no developer."
- **Moment:** the live change.
- **Careful:** do not open **Reports** here. The report builder covers tasks, activities and service levels only;
  it cannot report on Genesis Capital's own objects (clients, loans, funds). Show figures on the dashboards.

### Extra scene, if time — Research to subscribers (2 min)

- **Who:** `GCTRD1`.
- **Where:** the research note <http://localhost:5173/module/95/object/203?record=4322>.
- **Do:** click **Send to subscribers**. All 34 active *weekly highlights* subscribers are emailed in their own
  language (English or French); clients who opted out of marketing are skipped. *Sent* is ticked on the note. Show **Email logs**: one email per subscriber. As clients open it,
  the publication's *Opens* count rises.
- **Say:** "Your weekly highlights go out from the CRM, respecting consent, and you see who reads them."
- **Careful:** in the demo environment email is not configured, so nothing leaves the laptop and the opens count
  stays at zero. Say so.

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
  - Client upload links are signed and expire; they show the client only what is requested, and accept only
    genuine PDF, JPEG or PNG files.
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
| Can we get our monthly management pack from it? | Yes. 15 dashboards ship, including Group Executive, Loan Book, Wealth, Funds, Compliance and an RM league table. Dashboard widgets read every Genesis Capital object. The self-service report builder does not yet cover these objects (§9). |
| How long until we are live? | It depends on integrations and data migration. The CRM itself is already configured; we propose a discovery workshop to agree scope and a plan (§10). |
| Can our own staff try it? | Yes. We host a private sandbox for 2–4 weeks: a personal account per tester with two-factor sign-in, the demo company and data, and a test inbox for every email it sends. No real client data goes in. |
| Is it built for us or a generic CRM? | Both: a general CRM platform with a ready financial-services setup that matches your business lines and products. It is changed through settings, not custom code. |

### Lending

| Question | Answer |
| --- | --- |
| Does it calculate eligibility and pricing? | Yes. Rates are linked to the prime lending rate; debt-service ratio, loan-to-value and product limits are calculated and checked. |
| What happens when the prime lending rate changes? | A rate-change campaign finds the affected loans and produces client notices. |
| Can it handle staged disbursements and conditions? | Yes. Conditions precedent, security perfection, tranches and a four-eyes disbursement check. |
| Does it connect to our loan management system and credit bureau? | The connections are built and running on the sandbox. We need your provider credentials to go live. |
| Can clients apply online? | Yes, through website forms (with a calculator). Staff can also email any form to a client, or copy its link, from **Tools ▸ Web forms**. Clients then follow progress and upload documents in the portal. |
| How do clients send documents? | Through the portal, or through a secure upload link emailed from the application's **Docs** tab — no sign-in, only the requested items, valid for 14 days by default. The loan-documents email sends one automatically. |

### Wealth, funds and securities

| Question | Answer |
| --- | --- |
| How do you handle suitability? | Each client has a risk profile; orders above it are blocked unless an override and the client's acknowledgement are recorded (Scene 4). |
| Can clients place fund orders themselves? | Yes, in the portal, subject to cut-off times, KYC and suitability rules. Operations checks them before they go to the transfer agent. |
| Do you show NAVs and holdings? | Yes. NAV history, holdings and order history per client. NAVs with their history, FX rates and the prime lending rate are published as feeds for your website — show <http://localhost:5173/site/genesis-capital>. |
| Can we send our weekly highlights from it? | Yes. **Send to subscribers** on a research note emails every active subscriber of that topic in their language, respects marketing opt-outs, and counts opens (extra scene). |
| Can we run fund campaigns? | Yes. Campaigns, segments, events and consent-aware mailing lists, with attributed enquiries and ROI. |

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
| Can a client ask for me by name? | Yes. In **Tools ▸ Web forms**, pick yourself under *Talk to* and send the link. The form says *You'll speak with* your name and the enquiry comes straight to you (§4, "Talk to" link). |

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
| Do you have an API? | Yes, a REST API for records and metadata, plus read-only public feeds for the website (rates, NAVs and NAV history, prime lending rate, published forms). |
| How are client upload links secured? | Each link is signed (HMAC-SHA256), names one record and expires (14 days by default, at most 60). Anyone without the link sees nothing; with it, only the list of requested documents — no file names. Files are checked by their content, limited to 10 MB, rate-limited, and land as unreviewed. A link cannot be cancelled early, which is why it is short-lived. |
| How do you track email opens? | A tracking image whose address is signed and holds no readable personal data. Counts are approximate (some mail apps block or pre-load images) and only apply to marketing emails sent with consent. |
| How do we migrate our data? | CSV import, matched on an external reference, so loads can be repeated safely. We run trial loads and reconciliation in the project. |
| Where is our data stored? Can we query it directly? | In your MySQL database. Each record is one row in a `records` table, and each filled-in field is one row in `record_field_values`; the object and field definitions are stored alongside. So there is no ready-made `clients` or `loans` table: a direct SQL query joins those tables, and the API or a CSV export is usually simpler. See [How data is stored](../understanding/03-how-data-is-stored.md). |
| Where are documents stored? | Pluggable storage: local disk, Amazon S3 (or compatible), Azure Blob or Google Cloud Storage. Files are de-duplicated and versioned. |
| How do you test it? | About 1,500 automated tests (back end and front end) run on every change in CI, plus end-to-end business-flow scripts for lending and every desk. |
| Backups and disaster recovery? | Uses your managed database's backups and point-in-time recovery; documents follow the storage provider's replication. RPO/RTO are agreed in the hosting design. |
| Scalability? | The API is stateless and runs as several instances behind a load balancer; background jobs are shared safely between instances. |
| Monitoring? | A `/health` endpoint (database, cache, queue depth) and structured JSON logs for your monitoring tools. |
| Can we change it ourselves? | Yes. Administrators use the Builder for fields, forms, stages, workflows, permissions and dashboards. New screens rarely need code. |
| Is there AI? | Optional "ask a question" reporting that turns a plain-English question into a report. It can use a model you host yourself, so data does not leave your environment, and it only sees data the user may already see. Like the report builder, it covers tasks, activities and service levels, not yet the Genesis Capital objects. |
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
| Self-service reports on Genesis Capital's own objects | Dashboards already cover them; extending the report builder to Builder objects is on the roadmap |
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
   - a **sandbox** for their own staff to try for 2–4 weeks: a private hosted installation, one account per tester,
     demo data only (the client-facing *Sandbox Evaluation Plan* explains it; we build it with
     [client-sandbox.md](client-sandbox.md));
   - an **integration list**: which systems, which provider, who owns the credentials;
   - a **phased plan**, for example lending and client view first, then wealth and funds, then advisory and FX.
4. **Agree** a date for the follow-up and who attends.

### Follow-up email (within 24 hours)

- Thank them; list the questions asked and the answers (or the date an answer will follow).
- If they want a sandbox, send the *Sandbox Evaluation Plan* and ask for the signed evaluation agreement, an
  evaluation lead and the tester list (name, work email, role). Sign-in details go to each tester at the kickoff,
  never in the follow-up email.
- Confirm the next meeting.

---

## 11. Do and don't

| Do | Don't |
| --- | --- |
| Tell a story with one client from start to finish | Click through every menu |
| Switch persona to show who sees what | Show everything as the administrator |
| Say "sandbox" when an integration answers | Suggest live connections exist today |
| Offer a hosted sandbox for their staff | Let them use the demo laptop, or hand out the shared demo password |
| Write down every question | Guess at an answer to a technical question |
| Stop and ask "how do you do this today?" | Talk for more than five minutes without a question |

If something fails on screen: stay calm, say "let me show you the screenshot", and move to the next scene.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Client sandbox](client-sandbox.md) — Building, running, resetting and closing a hosted sandbox for a client's testers |
| **Previous** | [Implementation](implementation.md) |
| **Background** | [Understanding Genesis › What Genesis is](../understanding/01-what-genesis-is.md) |
| **Related** | [Tutorial videos](videos/README.md) · [Client sandbox](client-sandbox.md) · [00 — Purpose](process-flows/00-purpose.md) |
| **On these journeys** | [Implementer / presenter](../README.md#implementer--presenter) (step 6 of 7) |
| **Lost?** | [Docs roadmap](../README.md) · [Genesis Capital workspace](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
