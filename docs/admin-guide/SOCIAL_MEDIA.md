# Genesis CRM — Social Media Integration Guide

For: All users (runtime), System Administrators (configuration).

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture — Split Model](#architecture--split-model)
3. [Runtime Page — All Users](#runtime-page--all-users)
4. [Admin Control Panel — Builder](#admin-control-panel--builder)
5. [Background Automation](#background-automation)
6. [Managing Accounts](#managing-accounts)
7. [Posts](#posts)
8. [Campaigns](#campaigns)
9. [Mentions & Brand Monitoring](#mentions--brand-monitoring)
10. [Routing Rules](#routing-rules)
11. [Social Listening Keywords](#social-listening-keywords)
12. [WhatsApp Business Integration](#whatsapp-business-integration)
    - [Registering a client's business with Meta](#registering-a-clients-business-with-meta)
    - [Multi-tenant model](#multi-tenant-model--decide-this-before-writing-code)
    - [Opt-in and compliance](#opt-in-and-compliance-not-optional)
13. [WHATSAPP INTEGRATION](#whatsapp-integration) — engineering
    - [What the existing schema cannot carry](#what-the-existing-schema-cannot-carry)
    - [Bulk and targeted messaging](#bulk-and-targeted-messaging)
    - [UI/UX — what to build and what to reuse](#uiux--what-to-build-and-what-to-reuse)
14. [MAJOR PLATFORM INTEGRATIONS](#major-platform-integrations) — organic publishing
15. [META ADS & CAMPAIGN ANALYTICS](#meta-ads--campaign-analytics) — paid campaigns
16. [RBAC & Permissions](#rbac--permissions)
17. [API Reference](#api-reference)
18. [Benchmark](#benchmark)

---

## Overview

Genesis CRM's Social Media module allows organizations to connect and manage
their corporate social media presence across Facebook, Instagram, LinkedIn,
WhatsApp, X (Twitter), YouTube, and TikTok — all from within the CRM.

**Key design principle:** One corporate account per platform per tenant.
Employees share access through the existing RBAC system — they do NOT
connect individual accounts.

---

## Architecture — Split Model

Genesis CRM follows the same pattern as Salesforce, HubSpot, and Zoho:
social media is split into a **runtime page** (daily use for all users)
and an **admin control panel** (configuration for admins).

### Account Model

```text
Tenant (e.g., "Acme Corp")
├── Facebook Page "Acme Corp"      (business token, managed by admin)
├── Instagram "@acmecorp"          (same Meta business token)
├── LinkedIn Company "Acme Corp"   (LinkedIn org token)
├── WhatsApp Business +1-800-XXX   (single registered number)
│
├── Employee A (admin)   → manage connections + post + view analytics
├── Employee B (manager) → post + approve campaigns + view analytics
└── Employee C (user)    → draft posts + respond to mentions
```

### Why Shared Corporate Accounts?

- Meta's Business API and LinkedIn's Marketing API are designed around
  **Page/Company access tokens**, not individual user tokens.
- Individual tokens expire frequently and create maintenance overhead.
- Unified analytics and campaign tracking requires a single data source.
- RBAC provides granular control over who can do what.

---

## Runtime Page — All Users

Available to every authenticated user at `/social-media` (Sidebar > Tools).

```text
http://localhost:5173/social-media
```

**Required role:** any authenticated user

| Tab | User | Manager | Admin |
| --- | ---- | ------- | ----- |
| **Feed** | View stats | View stats | View stats |
| **Posts** | View only | Create, edit, schedule, publish, retry | Full access |
| **Campaigns** | View only | Draft campaigns | Full access |
| **Inbox** | View, reply, convert to lead | View, reply, convert to lead | View, reply, convert to lead |
| **Accounts** | View (read-only), sync now | View (read-only), sync now | View (read-only), sync now |

Admins see an **Admin Settings** link that opens the Builder panel.

---

## Admin Control Panel — Builder

Full configuration panel at **Builder > Social Media**:

```text
http://localhost:5173/builder/social-media
```

**Required role:** `admin`, `super_admin`, or `platform_admin`

The admin control panel has 7 tabs:

| Tab | Purpose |
| --- | ------- |
| **Overview** | Stats (open mentions, scheduled/failed posts, expiring tokens, engagement), breakdowns, connector modes, and buttons to run the publish sweep or a full sync now |
| **Accounts** | Connect/disconnect accounts, Authorize (OAuth), refresh tokens, set sync frequency and account manager |
| **Posts** | Full post CRUD including delete (a live post is removed from the platform first) |
| **Campaigns** | Full campaign lifecycle including cancel; live performance roll-up |
| **Inbox** | Re-route conversations and change their priority |
| **Routing** | Inbound assignment rules (fixed / round robin / load balanced / rule based), per channel |
| **Listening** | Configure monitoring keywords |

---

## Connector Architecture

Genesis CRM uses a **platform connector framework** matching the
pattern used by Salesforce, HubSpot, and Zoho. Each platform has a
connector that implements a standard interface (`publish`, `sync`,
`getMentions`, `refreshToken`, etc.).

### Connector Modes

| Mode | When | Behavior |
| ---- | ---- | -------- |
| **Simulation** | Default — no live connector registered for the platform | Realistic simulated responses for every operation (publish, delete, mentions, engagement, metrics, token refresh, OAuth) |
| **Live** | A connector is registered in `LIVE_CONNECTORS` **and** all of its `requiredEnv` variables are set | Real API calls to the platform |

**No live connector ships with Genesis today.** Setting platform API keys on their own does nothing — a
platform stays on simulation until a connector class is registered (see
[MAJOR PLATFORM INTEGRATIONS](#major-platform-integrations) for how). The Overview shows each platform's
mode as **Live** or **Demo**.

### Key Operations

| Operation | What It Does |
| --------- | ------------ |
| **Publish** | Claims the post, sends it to the platform, records the platform id/URL, marks `published`; on rejection marks `failed` and notifies the author |
| **Delete** | For a live post, removes it from the platform first, then soft-deletes |
| **Reply** | Delivers the reply to the channel, then marks the mention responded |
| **Sync Engagement** | Pulls likes/comments/shares/views for the 50 most recent published posts |
| **Pull Mentions** | Fetches new mentions since the last sync, matches keywords, routes them, notifies assignees |
| **Sync Metrics** | Updates follower/following/post counts |
| **Refresh Token** | Exchanges the stored refresh token for a new access token |
| **Authorize** | Runs the platform's OAuth consent flow and stores the returned tokens |

---

## Background Automation

Two server-side jobs run inside the API process. Neither needs a browser open. Both are safe to run on
several pods at once: each post or account is claimed with an atomic update before any platform call.

| Job | Every | What it does |
| --- | ----- | ------------ |
| **Scheduled publishing** | 1 minute | Publishes every post whose **Publish at** time has passed. A post the platform rejects becomes **failed** and its author receives an in-app notification with the reason; fix and click **Retry**. |
| **Account sync** | 5 minutes | For each account that is **due** under its own **Sync Frequency** (hourly / daily / weekly): refreshes an expiring token, updates profile metrics, pulls new mentions (keyword-matched, routed, assignees notified), refreshes post engagement. Accounts with **Auto-monitor mentions** off skip the mention pull. Afterwards, engagement is rolled up onto active campaigns. |

The Overview tab has **Run publish sweep now** and **Sync all accounts now** (the latter ignores each
account's frequency). Operators can see every loop's last run, duration and last error on `GET /health`
under `schedulers`.

**Token lifecycle.** An account whose token expires within 24 hours is refreshed automatically when it has a
refresh token. Without one it keeps working until expiry, then becomes **expired** and is skipped by the sync
until an admin clicks **Authorize** (OAuth) or pastes a new token via **Edit**. The Overview counts tokens
expiring within 7 days; each account card shows its token state.

---

## Managing Accounts

### Connecting a New Account

1. Go to **Accounts** tab
2. Click **Connect Account**
3. Fill in the required fields:
   - **Platform** — Facebook, Instagram, LinkedIn, WhatsApp, X, YouTube, or TikTok
   - **Account Name** — Handle or page name (e.g., `@acmecorp`)
   - **Platform Account ID** — The platform-specific identifier
   - **Display Name** — Friendly name shown in the CRM
   - **Account Type** — Business, Organization, or Personal
4. Configure sync settings:
   - **Sync Frequency** — Hourly, Daily, or Weekly. This is how often the background sync pulls mentions and
     metrics for this account.
   - **Account manager** — the default recipient of inbound mentions when no routing rule applies
   - **Auto-monitor mentions** — Enable/disable the mention pull for this account
5. Provide credentials, either way:
   - paste an **Access Token** (and optional **Refresh Token**) from the platform's developer console, or
   - click **Connect Account** first, then **Authorize** on the account card to run the platform's OAuth
     consent flow. Genesis receives the tokens on its callback and stores them.
6. Click **Connect Account**

Tokens are never returned by the API; account cards show a token state badge (set / expires in N days /
expired / none) instead.

### Account Status

| Status | Meaning |
| ------ | ------- |
| `active` | Connected and syncing normally |
| `expired` | Token expired and could not be refreshed — click **Authorize** or paste a new token. Skipped by the sync. |
| `error` | The last sync failed on a platform call — the card keeps this state until an admin clicks **Enable** or the next successful sync |
| `disabled` | Manually disabled by admin |

### Editing / Disabling

- Click **Edit** on any account card to update settings or rotate tokens (leave the token fields blank to keep them)
- Click **Authorize** to run the OAuth consent flow; **Refresh token** (shown when a refresh token is stored) forces a refresh now
- Click **Disable/Enable** to toggle the connection without deleting it
- Click the trash icon to soft-delete (sets status to `disabled`; posts and mentions are kept)

---

## Posts

### Creating a Post

1. Go to **Posts** tab
2. Click **Create Post**
3. Select the target **Account** (must be connected first)
4. Choose **Post Type** — Post, Story, Reel, Video, Carousel, or Live
5. Write the post **Content**
6. Set **Status**:
   - `Draft` — Not published, visible only in the CRM
   - `Scheduled` — published automatically by the server within a minute of **Publish at** (content and a
     date are required)
7. Click **Create**. Use **Publish now** on any draft, scheduled or failed post to publish immediately.

`Published` cannot be chosen by hand — it is set by the engine once the platform has accepted the post, so
it always means "live". A published post's content is locked (only promotion settings can change); delete it
to remove it from the platform.

### Post Lifecycle

```text
Draft ─────────┐
Scheduled ─────┼─► Publishing ─► Published ─► (Delete: removed from platform first) ─► Deleted
Failed ────────┘        └──────► Failed (author notified; edit and Retry)
```

The **Posts** tab filter shows the **Scheduled queue** in publish order, drafts, published or failed posts.

---

## Campaigns

### Creating a Campaign

1. Go to **Campaigns** tab
2. Click **New Campaign**
3. Fill in:
   - **Campaign Name** and **Objective**
   - **Campaign Type** — Brand Awareness, Lead Generation, Promotion, Engagement, or Traffic
   - **Start/End Dates**
   - **Budget** (total and/or daily)
   - **Target Platforms** — Select which platforms to include
4. Click **Create**

### Campaign Status Flow

```text
Planning → Active → Paused → Completed
                  → Cancelled
```

### Editing Campaigns

- Click **Edit** to modify campaign details or change status
- Budget, dates, platforms, and status can all be updated mid-campaign

### Campaign Performance

After every account sync, engagement (likes, comments, shares, views) on posts that were **published inside
the campaign window** to one of the campaign's **target platforms** is summed onto the campaign and shown on
its card as **Performance** with the time it was computed. There is no manual post-to-campaign link: the
window and the platform list are the association.

> **Read this figure as a window total, not as per-campaign engagement.** Because the association is
> "same platform, same dates", two campaigns that overlap in time on the same platform will each report
> the **combined** engagement of both. With one campaign running it is accurate; with two it is not.
> Linking a campaign to a real platform campaign id is tracked in
> [META ADS & CAMPAIGN ANALYTICS](#meta-ads--campaign-analytics).
>
> This figure also covers **organic** engagement only — it is not ad spend, CTR or conversions, and
> `performance_summary` keeps no history, so it cannot show a trend.

---

## Mentions & Brand Monitoring

The **Mentions** tab shows social media mentions detected by the monitoring system.

### Automatic Assignment (all channels)

Every inbound conversation that **requires a response** — across Facebook,
Instagram, LinkedIn, X, and WhatsApp — is automatically routed to an employee
as it is ingested. This is the same model WhatsApp uses (see
[WhatsApp Business Integration](#whatsapp-business-integration)), now applied
uniformly to every platform.

Routing has two layers, in precedence order:

1. **Configured assignment rules** (see below). If any active rule applies to
   the mention's platform, those rules govern routing.
2. **Default team routing.** When no rule applies, the mention is load-balanced
   across the **social team** — the active employees set as `managed_by` on any
   active social account, always including the manager of the account the
   mention arrived on. The eligible employee with the fewest *open* mentions
   (requires-response, not yet responded) wins; ties break deterministically.

**What is skipped?** Passive mentions that do not require a response are left
unassigned (nothing to action). If neither a rule nor a `managed_by` team
resolves an assignee, the mention is left unassigned for manual pickup.

Assignment runs inside the mention sync (the 5-minute background cycle and the
manual `POST /accounts/:id/sync`). It is best-effort: a routing failure never
blocks mention ingestion. Each sync result reports `mentions_assigned`
alongside `mentions_created`.

### Configurable Assignment Rules

See [Routing Rules](#routing-rules) below — the **Routing** tab in the builder is where these are edited.

---

## Routing Rules

Admins define routing rules on **Builder → Social Media → Routing** (or the `/assignment-rules` API). Rules
are evaluated in order (use the ▲▼ arrows); the first that produces an assignee wins, otherwise the last
rule's **Fallback Assignee** is used. A rule with **All channels** applies everywhere; otherwise it is scoped
to one platform. When no rule applies at all, the mention is load-balanced across the account managers.

| Rule type | Behavior |
| --------- | -------- |
| `fixed` | Always assigns to `assignee_id`. |
| `round_robin` | Cycles through `pool_ids` in order (cursor persisted on the rule). |
| `load_balanced` | Assigns to the `pool_ids` member with the fewest open mentions. |
| `rule_based` | If all `conditions` match the mention, assigns via `assignee_id` (or load-balances the `pool_ids`); otherwise the rule is skipped. |

`rule_based` conditions evaluate against the mention's own fields — `platform`,
`mention_type`, `sentiment`, `sentiment_score`, `response_priority`,
`follower_count`, `influence_score`, `reach_estimate`, `requires_response`,
`author_handle`, `content`, `keywords_matched` (comma-joined) — using the same operators as record assignment
(`equals`, `not_equals`, `contains`, `starts_with`, `ends_with`, `gt`, `gte`,
`lt`, `lte`, `in`, `not_in`, `is_empty`, `is_not_empty`).

Example — escalate negative WhatsApp messages to a senior rep, round-robin the
rest:

```json
[
  { "platform": "whatsapp", "rule_type": "rule_based", "order_index": 0,
    "conditions": [{ "field": "sentiment", "operator": "equals", "value": "negative" }],
    "assignee_id": "E_SENIOR" },
  { "platform": "whatsapp", "rule_type": "round_robin", "order_index": 1,
    "pool_ids": ["E1", "E2", "E3"] }
]
```

### Filtering Mentions

- Filter by **Platform** (Facebook, Instagram, etc.)
- Filter by **Sentiment** (Positive, Neutral, Negative)

### Responding to Mentions

Mentions marked "Needs reply" show a **Reply** button in the runtime **Inbox**. The reply is **delivered to
the originating channel through the platform connector first**; only then is the mention marked
**Responded**. If the platform rejects it, the error is shown and nothing is recorded. A mention can be
replied to once.

### Converting a Mention to a Lead

Every user can click **Convert to lead** on a mention. Genesis creates a CRM lead (source *social media*,
name from the author, the mention text and link in the description, owned by the mention's assignee or the
converter) and shows a **Lead #** badge on the mention. Converting the same mention twice is refused.

### Notifications

The employee a mention is routed to receives an in-app notification linking straight to their inbox
(**Assigned to me** + **Needs reply** filters on). Re-assigning a mention notifies the new assignee.

### Keyword matching on ingest

Every new mention is matched against the active **Listening** keywords for its platform. Matched terms are
stored on the mention (shown as a keyword chip in the inbox), a mention that only matched a keyword gets type
`keyword`, and a **high**-priority keyword raises the mention's response priority to *high*. Negative
sentiment always flags the mention as needing a reply at *high* priority. Mentions authored by the account
itself are dropped; a mention whose link was already ingested is not stored twice.

### Mention Data

Each mention includes:

- Author name, handle, and follower count
- Sentiment score (-1.0 to 1.0)
- Influence score (1-100)
- Mention type (mention, hashtag, keyword, tag, comment, review)
- Response priority (low, medium, high, urgent)

---

## Social Listening Keywords

Configure keywords to monitor across social platforms.

### Adding a Keyword

1. Go to **Listening** tab
2. Click **Add Keyword**
3. Configure:
   - **Keyword** — The term to monitor (e.g., `acme`, `#acmecorp`)
   - **Type** — Brand, Competitor, Industry, Product, or Hashtag
   - **Match Type** — Exact, Contains, Starts With, or Ends With
   - **Priority** — Low, Medium, or High
   - **Platforms** — Select which platforms to monitor
4. Click **Add**

### Keyword Types

| Type | Use Case |
| ---- | -------- |
| Brand | Monitor your own brand mentions |
| Competitor | Track competitor activity |
| Industry | Follow industry trends |
| Product | Monitor product-specific discussions |
| Hashtag | Track specific hashtags |

---

## WhatsApp Business Integration

WhatsApp integration follows Meta's WhatsApp Business API model:

### How It Works

- **One registered business number per tenant** — This is a Meta API requirement, not a Genesis limitation
- All employees share this number for customer communication
- Incoming messages land in the CRM and are auto-assigned to the social team,
  load-balanced across eligible employees (see
  [Automatic Assignment](#automatic-assignment-all-channels)). The same routing
  now applies to inbound conversations on every other channel too.
- Outgoing messages are sent from the business number but tracked per employee

### What Users Can Configure

| Setting | Level | Who |
| ------- | ----- | --- |
| WhatsApp Business Number | Tenant | Admin only |
| Message Templates | Tenant | Admin/Manager |
| Auto-assignment rules | Tenant | Admin |
| Response handling | Per employee | Each employee |

### Registering a client's business with Meta

Everything below is **provisioning, not code**, and it is the long pole of a
WhatsApp rollout — business verification and App Review are measured in days to
weeks, not hours. Start it before any development begins.

| # | Step | Who does it | Notes |
| - | ---- | ----------- | ----- |
| 1 | Create a **Meta Business Portfolio** (business.facebook.com) | Client (or you, with admin access granted) | The container for the Page, the WABA and the ad account |
| 2 | Complete **Business Verification** | Client | Legal name, registered address, phone, and a verification document (incorporation certificate, tax/GST registration, utility bill). Production messaging limits stay capped until this passes |
| 3 | Create or nominate a **Facebook Page** | Client | It is the public identity for both the WhatsApp business profile and any Facebook campaigns |
| 4 | Create a **WhatsApp Business Account (WABA)** and add a phone number | Client | The number must **not** be active on the consumer WhatsApp or WhatsApp Business app — delete that account first. The number is verified by OTP |
| 5 | Submit the **display name** | Client | Reviewed separately against Meta's naming policy; a rejected name blocks sending |
| 6 | Create an **ad account** with a payment method | Client | Only needed for paid-campaign analytics — see [Meta Ads & Campaign Analytics](#meta-ads--campaign-analytics) |
| 7 | Create the **Meta app** and pass **App Review** | You (the platform operator) | See the permission table below |
| 8 | Submit **message templates** for approval | Client admin / manager | Per-WABA; every business-initiated message outside the 24-hour window needs one |

**Permissions to request in App Review**, grouped by what they unlock:

| Capability | Permissions |
| ---------- | ----------- |
| Send and receive WhatsApp messages | `whatsapp_business_messaging`, `whatsapp_business_management` |
| Publish to and read a Facebook Page | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content` |
| Read ad campaign performance | `ads_read` (add `ads_management` only if campaigns will be created or edited from Genesis) |

App Review expects a screencast of the real flow and a written use case.
Rejections are common; budget for at least one round.

> **Verify two things against Meta's current documentation rather than this
> guide: per-message conversation pricing and the messaging tier limits** (the
> ramp from 250 → 1K → 10K → unlimited unique recipients per 24 hours). Both
> have been restructured more than once, and both directly constrain what
> "bulk" means for a given client on day one.

### Multi-tenant model — decide this before writing code

Genesis is multi-tenant, so there are two ways to hold client WhatsApp accounts:

| Model | How it works | Use when |
| ----- | ------------ | -------- |
| **Embedded Signup** (recommended) | You register **one** Meta app as a **Tech Provider**. Each tenant clicks *Connect WhatsApp* in Genesis, completes Meta's hosted signup popup, and their own WABA is created under **their** Business Portfolio with your app installed on it. Genesis receives a per-tenant token. The client owns the number, the templates and the billing | Any real multi-client rollout. This is the model Twilio, Wati and Zoko use |
| **Manual per-client setup** | An operator creates each WABA by hand and pastes a System User token into Genesis | A first pilot tenant or two. It does not scale, and it leaves you holding the client's messaging bill |

Build for Embedded Signup even if the first client is onboarded by hand — the
per-tenant credential storage and the tenant-resolution logic are the same
either way, and retrofitting them later is expensive.

### Connecting WhatsApp in Genesis

1. Connect as a new account with **Platform = WhatsApp**
2. Use the **Account ID** from the client's WhatsApp Business Account in Meta
3. Paste the API access token from Meta's developer console
4. The account name should be the registered phone number

Genesis must also be able to map an inbound Meta `phone_number_id` back to the
owning tenant — see [Step 6](#integration-steps) in the engineering section.
That mapping is what keeps one client's conversations out of another's CRM.

### Opt-in and compliance (not optional)

Meta polices WhatsApp far more tightly than email, and the penalty lands on the
client's number, not on Genesis:

- **Record explicit opt-in per contact** — the source and the timestamp — and
  check it at send time.
- **Honour STOP / unsubscribe replies** by clearing that flag automatically.
- **Quality rating** is driven by user blocks and reports. A number with a poor
  rating loses its messaging tier and can be suspended.
- Sending to a purchased or scraped list gets the client's number **banned**,
  not merely rate-limited.

---

## WHATSAPP INTEGRATION

This section is the engineering companion to
[WhatsApp Business Integration](#whatsapp-business-integration) above: it covers
how to wire a **live** WhatsApp channel into Genesis and how to build a
**WhatsApp-native CRM chatbot** that exposes CRM features over chat.

> **Current status:** WhatsApp is a registered platform across the stack, served
> by `SimulationConnector` like every other channel — `getConnector('whatsapp')`
> in `backend/src/connectors/social/index.js` returns simulation until a real
> connector is registered. The steps below build that connector.

### What Already Exists

Three existing patterns do most of the work — WhatsApp is an *extension* of them,
not new architecture:

| Building block | Where | Reused for |
| -------------- | ----- | ---------- |
| Connector framework (`SocialConnector` base + `LIVE_CONNECTORS` registry) | `backend/src/connectors/social/base.js`, `.../index.js` | Outbound send + OAuth/token model |
| Public inbound webhook (raw-body capture, HMAC verify, rate-limit, idempotency) | `backend/src/routes/integration-inbound/index.js` | WhatsApp inbound webhook |
| CRM service layer (`crm.service`, `record.service`, `task.service`, `search.service`, `report.service`) | `backend/src/services/` | Every action the chatbot performs |

### What the existing schema cannot carry

The connector work is the easy half. The half that is easy to underestimate is
that **the social schema is post-and-mention shaped, not message shaped**, and
two of the three common WhatsApp requirements do not fit it at all.

| Requirement | Closest existing model | Why it does not fit |
| ----------- | ---------------------- | ------------------- |
| Bulk / targeted sends | `SocialMediaPost` | A post is broadcast-to-the-world with one engagement blob. It cannot represent "this template went to these 4,000 people" or track a delivery state per person |
| Two-way chat | `SocialMediaMention` | One flat row with a single `response_content` string. It models "someone mentioned us, we replied once" — not a thread of twenty messages with media, receipts and an SLA clock |
| Approved templates | `EmailTemplate` | Right shape, wrong channel: no language code, no Meta approval status, no per-WABA scoping |

Stretching `SocialMediaMention` into a conversation is the wrong call — it
breaks the inbox, the routing rules and the campaign roll-up, all of which
assume one row is one complete item. Add tables instead.

**Outbound / broadcast (requirement: bulk and targeted messages):**

```text
WhatsAppTemplate            name, language, category, body, variables,
                            meta_status (approved|pending|rejected),
                            waba_id, tenant_id
                            -- peer of EmailTemplate; copy its shape

WhatsAppBroadcast           name, template_id, audience (saved segment id OR
                            explicit id list), scheduled_for, status,
                            per-status counts, created_by, tenant_id

WhatsAppBroadcastRecipient  broadcast_id, contact_id?/lead_id?, phone (E.164),
                            variable values, status (queued|sent|delivered|
                            read|failed|opted_out), wamid, error_code,
                            timestamps
```

`WhatsAppBroadcastRecipient` is the table teams skip and regret. Without a row
per recipient there are no delivery receipts, no retry, no per-person audit,
and no way to answer *"did this customer actually get the renewal reminder?"*

**Inbound / conversational (requirement: chat with the business team):**

```text
WhatsAppConversation        tenant_id, contact_id?/lead_id?, phone,
                            status (open|pending|resolved), assigned_to,
                            last_inbound_at, window_expires_at, unread_count,
                            source_campaign_id?

WhatsAppMessage             conversation_id, direction (in|out),
                            type (text|image|document|template|interactive|
                            location), body, media_url, wamid,
                            status (sent|delivered|read|failed),
                            sent_by (employee, outbound only), created_at
```

`window_expires_at` is worth calling out: it is `last_inbound_at + 24h` and it
decides whether an agent may type freely or must fall back to an approved
template. Surface it in the UI as a countdown, or agents will hit send failures
they cannot explain.

**Feature gating.** Add a catalogue key for the channel —
`eng_whatsapp` alongside the existing `eng_social` in
[`feature-catalogue.js`](../../backend/src/services/platform/feature-catalogue.js) —
so WhatsApp is a plan-gated entitlement rather than on for every tenant. See
[PLANS_AND_FEATURES.md](PLANS_AND_FEATURES.md).

### Recommended API

Use the **WhatsApp Cloud API** (Meta-hosted), following the Meta Graph API
conventions documented under [Meta — Facebook + Instagram](#meta--facebook--instagram). A BSP such as Twilio is a valid fallback — the
connector abstraction makes swapping providers a one-file change.

### Integration Steps

**Step 1 — Provision on Meta (no code).**
Create a Meta App → add the **WhatsApp** product → obtain a **Phone Number ID**,
**WABA ID**, a permanent **System User access token**, the **App Secret**, and a
**webhook verify token**. Register message **templates** (Meta requires
pre-approved templates for business-initiated messages sent outside the 24-hour
customer-service window).

**Step 2 — Add env vars and wire the connector.**
Add to `backend/.env`:

```text
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_APP_SECRET=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_API_VERSION=v19.0
```

Create `backend/src/connectors/social/whatsapp.js` extending `SocialConnector`
(`base.js` defines the full interface), adding one method the base does not
have — `sendMessage(to, payload)` — that POSTs to
`https://graph.facebook.com/{version}/{phoneNumberId}/messages`. Then register
it in `LIVE_CONNECTORS` in `connectors/social/index.js` with
`requiredEnv: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']`; the
registry falls back to simulation until every one of those vars is set.

**Step 3 — Outbound sending service.**
Add `backend/src/services/whatsapp.service.js` (peer of `email-send.service.js`)
exposing `sendText`, `sendTemplate`, and `sendInteractive` (buttons / lists). It
calls the connector, writes an `IntegrationLog`-style record, and enforces the
24-hour window rule (template vs. free-form). Reuse the SSRF-safe `request()`
helper in `integration.service.js` for the HTTP call.

**Step 4 — Inbound webhook (two endpoints).**
Register `backend/src/routes/whatsapp/index.js` in `app.js` at `/api/whatsapp`:

- **`GET /webhook`** — the verification handshake: echo `hub.challenge` when
  `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`. (This GET is the one
  genuinely new piece; the existing inbound route is POST-only.)
- **`POST /webhook`** — receives messages. Reuse the `preParsing` raw-body
  capture, Redis rate-limit, and idempotency from
  `integration-inbound/index.js`, but verify Meta's **`X-Hub-Signature-256`**
  header. Idempotency matters — WhatsApp retries aggressively.

**Step 5 — Route inbound messages into the CRM.**
On each inbound message: resolve tenant and sender, match the phone number
against `CrmContact` / `CrmLead`, and create a lead when unknown (via
`crm.service.createLead` + `assignment.service`). Then **find or create the
`WhatsAppConversation` and append a `WhatsAppMessage`** — the thread is the
record of the interaction; an `Activity` alone cannot hold one. Assign the
conversation through
[`social-assignment.service.js`](../../backend/src/services/social-assignment.service.js),
*also* log an `Activity` (`activity.service`) so the exchange appears on the
record timeline, and emit an event on the bus (`events.service`) so workflows,
SLA and lead-scoring react — that last step is what makes WhatsApp a
first-class channel rather than a silo.

**Step 5b — Handle status callbacks.** Delivery receipts (`sent` / `delivered`
/ `read` / `failed`) arrive on the *same* webhook, keyed by `wamid`. One
handler updates both `WhatsAppMessage.status` and
`WhatsAppBroadcastRecipient.status`. Without it, a broadcast reports "sent" and
nothing further.

**Step 6 — Multi-tenancy (do not skip).**
Tenant isolation runs off `AsyncLocalStorage` (`backend/src/middleware/tenant-scope.js`).
The webhook is **public / unauthenticated**, so nothing sets the tenant
automatically. Resolve tenant *inside* the handler — map the incoming
`phone_number_id` to a tenant via a per-tenant WhatsApp config row — and run all
CRM writes inside that tenant's `AsyncLocalStorage` context. **This is the
highest-risk part of the integration:** getting it wrong is a cross-tenant data
leak.

**Step 7 — Frontend and ops.**

- A WhatsApp channel/settings screen (mirror the social-media settings UI) to
  store the per-tenant phone-number ID / token and show live-vs-simulation status
  via `getConnectorStatus()`.
- A conversation view and a broadcast composer — see
  [UI/UX: what to build and what to reuse](#uiux--what-to-build-and-what-to-reuse).
  Starting headless (messages logged as Activities only) is a valid first step,
  but it is not a usable agent experience.
- Tests: the Jest suite uses mocks and needs no DB — add connector unit tests
  plus a webhook signature/idempotency test following the existing inbound test.
  **Add one test that asserts a webhook for tenant A's `phone_number_id` cannot
  write a record under tenant B** (see Step 6).

**Suggested build order** — sequenced so each phase ships something usable:

| # | Phase | Delivers |
| - | ----- | -------- |
| 1 | Meta provisioning + App Review ([above](#registering-a-clients-business-with-meta)) | Nothing works in production without it, and it is calendar time rather than developer time — start in week one |
| 2 | Connector + outbound send service (Steps 2–3) | Templates sendable from workflows; value before any UI |
| 3 | Template registry + broadcast tables + broadcast scheduler | Bulk and targeted sends, headless |
| 4 | Inbound webhook + tenant hardening + conversation tables (Steps 4–6) | Two-way messaging landing in the CRM |
| 5 | Conversation UI + broadcast composer (Step 7) | The agent-facing experience |
| 6 | [Meta Ads connector + insights](#meta-ads--campaign-analytics) | Paid-campaign analytics — **independent of 2–5**, so a second developer can run it in parallel |

### Bulk and targeted messaging

With the tables from [What the existing schema cannot
carry](#what-the-existing-schema-cannot-carry) in place, the send path follows
a pattern the module already uses — do not invent a new one.

**Audience selection.** Do not build a second segment builder. Genesis already
has a report/filter engine over `CrmContact` / `CrmLead`. Let a broadcast's
audience be **either** a saved report/segment id **or** an explicit id list,
resolved to recipients at send time. See
[REPORTING.md](../developer-guide/REPORTING.md).

**Sending.** Mirror the scheduled-publish sweep in
[`social-media.service.js`](../../backend/src/services/social-media.service.js):
a `whatsapp-broadcast` job registered on the [scheduler
registry](../developer-guide/SOCIAL_ENGINE.md#the-scheduler-registry) claims
queued recipients in batches with a conditional `updateMany` before calling
Meta. The same invariant applies as for posts — **claim before you call the
platform**, or two pods will double-send.

Three constraints the job must respect:

- **The tenant's messaging tier** as a hard rate cap, not an afterthought.
- **Meta's rate-limit responses** — back off and requeue rather than burn the
  recipient row.
- **Opt-in state**, re-checked at send time, not only at audience build time. A
  contact who sent STOP between scheduling and sending must be skipped
  (`status = opted_out`).

**Targeted (one-to-one) sends** use the same connector call without a broadcast
row — from a record page, a workflow step, or the conversation view. Inside the
24-hour window they can be free-form; outside it they must use an approved
template.

### UI/UX — what to build and what to reuse

A frequent question is whether this needs a separate application for managing
clients and their conversations. It does not. Most of the surface already
exists; one genuinely new screen is required.

| Surface | Verdict |
| ------- | ------- |
| Client / tenant list | **Already exists.** Platform console + tenant management. Build nothing |
| Contact or lead list for picking a broadcast audience | **Reuse.** Existing CRM list views and report filters; add a *Send WhatsApp broadcast* action rather than a parallel list |
| Individual WhatsApp conversations | **Build new.** The Inbox tab (`MentionsTab` in [`SocialMediaPage.jsx`](../../frontend/src/pages/runtime/SocialMediaPage.jsx)) is a card list with a single reply box — correct for mentions, unusable for live chat |
| Broadcast composer + delivery report | **Build new.** Nothing resembles it today |
| WhatsApp channel config (number, token, templates) | **Extend.** Add a tab to the existing Builder panel |
| Campaign analytics | **Reuse.** Feed the insights table into dashboards and reports rather than hand-rolling charts |

The conversation surface should be its **own route** (`/conversations`), not a
sixth tab on the social page — it is a different job with a different layout,
and the existing tab shell will fight it. The three-pane pattern every
competitor converges on:

```text
+-------------+-------------------------+--------------+
| Conversation|   Message thread        | Context      |
| list        |                         | panel        |
|             |  <- inbound bubbles     |              |
| [Mine]      |  -> outbound bubbles    | Contact card |
| [Unassigned]|     vv read receipts    | Open deals   |
| [All]       |                         | Recent cases |
|             | ----------------------- | Assign  v    |
| . Rajesh  2 | [type...] [template] [+]| Tags         |
| . Priya     | (!) window: 19h left    | [Resolve]    |
+-------------+-------------------------+--------------+
```

Two notes on building it:

- **Also embed the thread on the record.** A read-only conversation panel on the
  Contact / Lead / Case detail page is arguably worth more than the standalone
  inbox, because it is where reps already work. Ship the inbox first, then the
  embed.
- **Real time.** The existing page uses React Query polling. For chat, polling
  every 3–5 s is an acceptable v1 and costs nothing; move to SSE or WebSocket
  when concurrent agent count makes polling expensive. Do not block v1 on it.

### WhatsApp-Native CRM Chatbot

The service layer *is* the API surface, so a chatbot is a natural-language (or
menu-driven) front-end that maps intents to existing service calls, scoped to the
user's permissions.

**Identity and security first.** Bind each WhatsApp number to either an
**Employee** (internal reps operating the CRM by phone) or a **Contact / Lead**
(customer self-service) — two different permission worlds. Reps authenticate once
(OTP over WhatsApp, or a magic link → JWT bound to the number). Every command then
runs through `permission.service` and tenant scope; the bot must **never** bypass
row-level or operational permissions.

**Two interaction modes (offer both):**

1. **Menu-driven** using WhatsApp interactive messages (buttons + list pickers) —
   deterministic, no LLM required, ideal for structured CRM ops.
2. **Natural-language** using Claude as an intent router (tool use): each CRM
   service method is registered as a tool; Claude selects the tool and extracts
   parameters, and Genesis executes it under the user's permissions. "Expose all
   features" becomes "register each service method as a tool" — incremental and
   safe.

**Feature mapping — internal reps:**

| Capability | Backed by | Example |
| ---------- | --------- | ------- |
| Leads / Contacts / Accounts — create, look up, update, reassign | `crm.service` | "Show hot leads assigned to me" |
| Opportunities / Pipeline — advance stage, update amount, view by stage | `crm.service`, `forecast.service` | "Move Acme deal to Negotiation" |
| Tasks & Reminders — due today, create/complete, snooze; proactive push | `task.service`, `reminder.service` | "What's due today?" |
| Activities — log calls/notes, incl. voice-note → transcribe | `activity.service` | Voice-note call logging in the field |
| Global search | `search.service` | "Find contact Rajesh Kumar" |
| Reports & Dashboards — summary or chart image | `report.service`, `dashboard.service` | "Send me this week's numbers" |
| Approvals — pending workflow steps as approve/reject buttons | `workflow.service` (`WorkflowPendingStep`) | Approve a discount from your phone |
| Notifications & SLA breaches | `notification.service`, `sla.service` | Breach alerts pushed to WhatsApp |

**Feature mapping — customer self-service:**

| Capability | Backed by |
| ---------- | --------- |
| Lead capture from an unknown number (auto-create + assign + score) | `crm.service`, `assignment.service`, `lead-scoring.service` |
| Case status (scoped to the customer's own records) | `CrmCase` lookups |
| KYC / document collection via WhatsApp media | `document.service` |
| Appointment booking (creates a Task/Reminder for the agent) | `task.service`, `reminder.service` |

**Chatbot architecture:**

```text
WhatsApp <-> /api/whatsapp/webhook <-> Conversation Orchestrator
                                        |- session/state (Redis / ioredis)
                                        |- intent router (menu OR Claude tool use)
                                        |- permission + tenant guard  (reused)
                                        `- CRM service calls          (reused)
```

- **Session state in Redis** (ioredis is already wired) for multi-turn flows.
- **Claude tool use** as the router: each CRM operation is a tool schema; Claude
  picks the tool and params, Genesis executes under the caller's permissions.
- **Confirmation gates** (WhatsApp buttons: Confirm / Cancel) for writes and
  destructive actions, since NL intent can misfire.
- **Audit everything** — bot-initiated changes flow through the same `AuditLog`
  the services already write, so phone-driven edits stay fully traceable.

**Phased rollout:**

1. **Outbound-only** — reminders, SLA alerts, approval requests pushed to reps.
   Fast, high-value, low-risk (no NL, no inbound).
2. **Menu-driven inbound** — interactive buttons/lists for the top rep actions.
3. **NL chatbot** — layer Claude tool use over the same service tools.
4. **Customer self-service** — lead capture, status checks.

### Key Risks

- **Tenant resolution on a public webhook** (Step 6) — the real engineering risk
  given the `AsyncLocalStorage` isolation model. Getting it wrong is a
  cross-tenant data leak, not a bug report. Test it explicitly.
- **App Review is the schedule risk, not the code.** Nothing reaches production
  without it and rejections are routine. Start in week one with a real
  screencast.
- **Meta's 24-hour session window + template approval** — shapes what proactive
  messaging is permitted, and is the single most common source of "why did this
  send fail?" tickets.
- **Number bans from poor opt-in hygiene.** Quality rating is driven by user
  blocks; a bad list costs the client their number. See [Opt-in and
  compliance](#opt-in-and-compliance-not-optional).
- **Meta's policy surface moves fast.** Pricing model, messaging tiers and
  template category rules have each changed more than once. Verify against
  current Meta documentation before quoting numbers to a client.

---

## MAJOR PLATFORM INTEGRATIONS

This section is the engineering companion for the **publishing** platforms —
Facebook, Instagram, LinkedIn, and X (Twitter) — on the same lines as
[WHATSAPP INTEGRATION](#whatsapp-integration).

> **Current status:** No live platform connector ships with Genesis. Every
> platform resolves to `SimulationConnector`, which implements the full
> `SocialConnector` interface and returns realistic simulated data, so the whole
> feature is usable for demo, development and testing.
>
> Throw-only Meta/LinkedIn/X scaffolds were removed on 2026-08-27. They
> implemented nothing but `getAuthUrl()`, and the registry switched to them the
> moment their API keys appeared — so setting `META_APP_ID` turned working
> simulated publishing into a hard error. Setting platform credentials is now
> inert: simulation stays until a connector is actually registered in
> `LIVE_CONNECTORS` (see `backend/src/connectors/social/index.js`).
>
> This mirrors the wider market. Salesforce retired Social Studio in November
> 2024 and now partners with Sprout Social; Zoho ships social as a separate
> product rather than inside CRM; Pipedrive has no native social publishing at
> all. Of the five largest CRM vendors only HubSpot still ships it natively.
> The per-platform notes below remain the implementation reference for anyone
> adding a live channel.

### How Publishing Platforms Differ from WhatsApp

WhatsApp is a **conversational** channel: inbound-push (public webhook) plus
outbound messaging. The platforms here are **publishing + engagement** channels,
so the integration shape is different:

| Aspect | WhatsApp | FB / IG / LinkedIn / X |
| ------ | -------- | ---------------------- |
| Auth | Permanent System User token | OAuth 2.0 authorization-code flow, per corporate account |
| Inbound | Public webhook (`X-Hub-Signature-256`) | **Polling** — the 5-minute sync cycle pulls mentions/metrics |
| Primary verbs | `sendText`, `sendTemplate` | `publish`, `getPostEngagement`, `getMentions`, `sendReply` |
| Tenant model | One business number per tenant | One corporate account per platform per tenant |

Because inbound arrives by polling, these platforms do **not** need the public
webhook, tenant-on-webhook, or idempotency work that WhatsApp requires. The OAuth
callback route **is wired**: `GET /api/social-media/oauth/:id/authorize` (admin)
returns the platform consent URL with a signed `state`, and the public
`GET /api/social-media/oauth/callback` exchanges the code through the connector's
`handleCallback`, stores the tokens and redirects to the builder. Accounts can
also still be connected by pasting tokens (see [Managing Accounts](#managing-accounts)).

### Shared Integration Steps (all four platforms)

**Step 1 — Register a developer app** on the platform's console and obtain a
client ID + secret (see per-platform table below).

**Step 2 — Set env vars** in `backend/.env` and register the connector in
`LIVE_CONNECTORS` with those names as `requiredEnv`. `getConnector()` switches the
platform from simulation to live only when the entry exists **and** every var is set:

| Platform | Required Env Vars | Optional Redirect URI Override |
| -------- | ----------------- | ------------------------------ |
| Meta (Facebook + Instagram) | `META_APP_ID`, `META_APP_SECRET` | `META_REDIRECT_URI` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `LINKEDIN_REDIRECT_URI` |
| X (Twitter) | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | `TWITTER_REDIRECT_URI` |

The redirect URI Genesis registers with the platform is
`{API_URL}/api/social-media/oauth/callback` (`API_URL` env, else the request origin).
Register exactly that URI in the platform's developer console.

**Step 3 — OAuth is already wired.** `getAuthUrl(account, { redirectUri, state })`
must forward both values to the platform's consent page; the callback verifies the
signed `state`, calls `handleCallback(code, account)` and persists `access_token`,
`refresh_token`, `token_expires_at` (from `expires_in`) on the `SocialMediaAccount` row.

**Step 4 — Implement the connector methods.** Subclass `SocialConnector` with real
HTTP calls (reuse the SSRF-safe `request()` helper in `integration.service.js`):
`getAuthUrl`, `handleCallback`, `refreshToken`, `publish`, `deletePost`,
`getPostEngagement`, `getMentions`, `sendReply`, `getProfileMetrics`. In
`getMentions`, populate each mention's `post_url` with the platform's canonical
URL or object id — it is what dedupes re-pulled mentions and what `sendReply`
receives as the target.

**Step 5 — Rely on the existing schedulers.** The publish sweep and the 5-minute
sync cycle (see [Background Automation](#background-automation)) already call every
connector method, refresh tokens 24 h before expiry, and route new mentions — no
new plumbing once the methods return real data.

**Step 6 — Connect the account** (admin) via **Accounts → Connect Account** with
the matching **Platform**, then either run the OAuth flow (Step 3) or paste the
tokens directly.

**Step 7 — Tests.** Add per-connector unit tests (mocked HTTP) covering the OAuth
exchange, `publish`, and `getMentions` mapping — the Jest suite uses mocks and
needs no DB.

### Per-Platform Notes

#### Meta — Facebook + Instagram

- **One connector, both networks.** A single connector should serve `facebook`
  and `instagram` via the Meta Graph API (`v19.0`); Instagram publishing runs
  through a linked Facebook Page.
- **Scopes:** `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
  `pages_read_user_content`, `instagram_basic`, `instagram_content_publish`.
- **Key endpoints:** token exchange `POST /oauth/access_token`; publish
  `POST /{page-id}/feed`; engagement
  `GET /{post-id}?fields=likes.summary(true),comments.summary(true),shares`;
  mentions `GET /{page-id}/tagged`; reply `POST /{comment-id}/comments`.
- **Note:** Page access tokens (not user tokens); exchange short-lived for
  long-lived tokens in `handleCallback`. Meta App Review is required for the
  publishing scopes before production use.
- **Paid campaigns are a different integration.** The scopes and endpoints above
  cover **organic** page content only. Ad spend, CTR, conversions and
  per-campaign performance come from the Marketing API with `ads_read` — see
  [META ADS & CAMPAIGN ANALYTICS](#meta-ads--campaign-analytics).

#### LinkedIn

- **API:** LinkedIn Marketing API v2.
- **Scopes:** `w_member_social`, `r_organization_social`,
  `w_organization_social`, `r_organization_admin`.
- **Key endpoints:** authorize
  `https://www.linkedin.com/oauth/v2/authorization`; token
  `POST https://www.linkedin.com/oauth/v2/accessToken`; publish
  `POST https://api.linkedin.com/v2/ugcPosts`.
- **Note:** posts target an **Organization URN**, not a personal profile; the
  corporate account must grant the app admin access to the Company Page.

#### X (Twitter)

- **API:** X API v2, OAuth 2.0 with **PKCE**.
- **Scopes:** `tweet.read`, `tweet.write`, `users.read`, `offline.access`
  (`offline.access` is what yields a refresh token).
- **Key endpoints:** authorize `https://twitter.com/i/oauth2/authorize`; publish
  `POST /2/tweets`.
- **Note:** implement real PKCE — generate a verifier per authorization, store it
  against the account `state`, and send the verifier in `handleCallback`. Mind
  the API access-tier rate limits.

#### YouTube & TikTok

Registered in `PLATFORMS` and selectable as a **Platform**, backed by simulation
like every other channel. To add either, follow the shared steps above
(YouTube Data API v3 / TikTok Content Posting API).

### Risks & Gotchas

- **Register the exact callback URI** with each platform; set `API_URL` when the
  API sits behind a proxy so the URI Genesis generates matches.
- **App review / approval** — Meta (App Review) and X (access tier) gate the
  publishing and read scopes; budget lead time before go-live.
- **Token encryption** — `access_token` / `refresh_token` columns are documented
  as encrypted; ensure the encryption path is applied when persisting tokens from
  the callback.

---

## META ADS & CAMPAIGN ANALYTICS

This section covers **paid** campaign performance — running Facebook /
Instagram ad campaigns and measuring customer engagement per campaign. It is a
different integration from the organic publishing covered in [MAJOR PLATFORM
INTEGRATIONS](#major-platform-integrations), and conflating the two is the most
common planning mistake here.

> **Current status:** not implemented. Genesis has no Marketing API connector,
> no ad-account model, and no insights time series. `SocialMediaCampaign` is a
> **planning** record only.

### Read this first — `SocialMediaCampaign` is not a Meta Ads campaign

`SocialMediaCampaign` ([schema](../../backend/prisma/schema.prisma), `social_media_campaigns`)
holds budget, objective, themes, hashtag strategy and a posting schedule. It is
a plan the team writes down. It has **no `platform_campaign_id`**, so it is not
linked to anything on Meta.

Consequently `refreshCampaignPerformance()` in
[`social-media.service.js`](../../backend/src/services/social-media.service.js)
is an **approximation**: it sums the engagement of *every published post on a
matching platform inside the campaign's date window*. It does not know which
posts belong to which campaign. With a single campaign running, the number
looks right. **With two campaigns overlapping in time on the same platform,
both report the combined total.** Do not present that figure as per-campaign
engagement to a client until the linkage below exists.

### Two different APIs

| | Organic engagement | Paid campaign performance |
| - | ------------------ | ------------------------- |
| **What it measures** | Likes, comments, shares, reach on posts you published | Spend, impressions, CTR, CPC, conversions, per-audience breakdowns |
| **API** | Graph API (page endpoints) | **Marketing API / Ads Insights** |
| **Token** | Page access token | Ad-account token |
| **Permissions** | `pages_*` | `ads_read` (+ `ads_management` to create or edit) |
| **Object model** | Page → Post | Campaign → Ad Set → Ad |
| **In Genesis today** | Connector contract exists (simulation) | Nothing |

They need separate App Review submissions. Plan them as two pieces of work.

### What to build

1. **Link the campaign.** Add `platform_campaign_id` and `ad_account_id` to
   `SocialMediaCampaign`, so a Genesis campaign points at the real Meta campaign
   instead of being inferred from dates.
2. **Link the posts.** Optionally add a `campaign_id` FK on `SocialMediaPost` so
   the organic roll-up stops guessing.
3. **Add a daily insights time series** — the single most valuable addition
   here. `performance_summary` is one JSON blob overwritten on every sync, so it
   carries **no history**: it cannot chart a trend or compare week over week.
   Store one row per `(campaign, ad_set, date)` with the metrics pulled:

   ```text
   MetaAdInsight   campaign_id, ad_set_id?, ad_id?, date,
                   impressions, reach, clicks, spend, ctr, cpc,
                   conversions, breakdown (age|gender|placement|...),
                   tenant_id
                   -- unique on (ad_id, date, breakdown)
   ```

4. **Add a `MetaAdsConnector`**, separate from the publishing connector, with
   `listCampaigns()` and `getInsights(objectId, dateRange, breakdowns)`. Call it
   from the existing 5-minute sync cycle, pulling insights daily and
   **backfilling roughly three days on every run** — Meta restates recent
   numbers, so a single-shot pull goes permanently stale.
5. **Attribute campaigns to CRM outcomes.** Engagement counts are the shallow
   answer; the valuable one is which campaign produced closed business.
   - **Lead Ads** — subscribe to the page's `leadgen` webhook field. Every form
     submission arrives as a webhook you convert into a `CrmLead` carrying
     `campaign_id` and `ad_id`. Reuse the inbound-webhook hardening already
     described in [Step 4](#integration-steps).
   - **Click-to-WhatsApp ads** — the inbound message payload carries a referral
     object with the source ad id. This is what ties this section to
     [WHATSAPP INTEGRATION](#whatsapp-integration): a conversation can be
     attributed to the ad that started it (`source_campaign_id` on
     `WhatsAppConversation`).

Once the time-series table exists, **do not build bespoke charts.** Register it
as a report data source and let the existing reporting and dashboard engines
handle it — see [REPORTING.md](../developer-guide/REPORTING.md) and
[DASHBOARD_ANALYTICS.md](../developer-guide/DASHBOARD_ANALYTICS.md).

### Risks

- **Separate App Review** for ads permissions, on top of the pages and WhatsApp
  submissions. Business verification is a prerequisite for all of them.
- **Insight restatement** — numbers for the last few days change after the fact;
  design for idempotent upserts, not appends.
- **Attribution windows** are configurable on Meta and change what "conversions"
  means. Record which window a pull used alongside the numbers.

---

## RBAC & Permissions

Social media uses a three-tier permission model matching industry CRM
patterns (Salesforce, HubSpot, Zoho):

| Action | `user` | `manager` | `admin+` |
| ------ | ------ | --------- | -------- |
| View accounts, posts, campaigns | Yes | Yes | Yes |
| View mentions + respond + convert to lead | Yes | Yes | Yes |
| Sync one account now | Yes | Yes | Yes |
| Create/edit/publish/retry posts | No | Yes | Yes |
| Draft campaigns | No | Yes | Yes |
| Delete posts/campaigns | No | No | Yes |
| Connect/disconnect accounts | No | No | Yes |
| Manage OAuth tokens | No | No | Yes |
| Listening keywords CRUD | No | No | Yes |
| Routing rules CRUD | No | No | Yes |
| Run publish sweep / sync all | No | No | Yes |

| Page | URL | Roles |
| ---- | --- | ----- |
| Runtime (daily use) | `/social-media` | All users |
| Admin (configuration) | `/builder/social-media` | Admin+ |

### What a `user` (USR) account can do with posts

A standard `user` account has **read-only** access to posts:

| Action | Allowed for `user`? | Enforced by |
| ------ | ------------------- | ----------- |
| **View** posts | Yes | `GET /posts`, `/posts/:id` (`authenticate`) — the runtime **Posts** tab renders for everyone |
| **Create / edit / schedule / publish** posts | No | `POST` / `PUT /posts`, `POST /posts/:id/publish` (`requireManager`); the UI hides these buttons (`canWrite = isAdmin \|\| isManager`) |
| **Delete** posts | No | `DELETE /posts/:id` (`requireAdmin`) |
| **"React" to** posts (like / comment) | Not a feature | The CRM has no post-reaction endpoint — posts are the org's *outbound* content. The "N engagements" figure is a **read-only metric synced from the external platform's audience**, not an in-app action |

**Reacting to inbound activity is separate.** A `user` *can* respond to
**mentions** (incoming @-mentions, comments, DMs) via `PUT /mentions/:id`
(`authenticate`) — see [Responding to Mentions](#responding-to-mentions). That
is inbound conversation handling, distinct from the organisation's own posts,
which a `user` may only view.

Both layers enforce this independently (defence in depth): the runtime UI hides
write actions behind `canWrite`, and the API rejects them with `requireManager`
/ `requireAdmin` even when called directly.

---

## API Reference

All endpoints are prefixed with `/api/social-media`.

### Accounts

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/accounts` | User | List accounts (filterable by platform, status) |
| `GET` | `/accounts/:id` | User | Get account details |
| `POST` | `/accounts` | Admin | Connect new account |
| `PUT` | `/accounts/:id` | Admin | Update account |
| `DELETE` | `/accounts/:id` | Admin | Soft-delete account |
| `POST` | `/accounts/:id/toggle` | Admin | Enable/disable account |
| `POST` | `/accounts/:id/refresh-token` | Admin | Body with `access_token` = manual rotation; empty body = connector refresh |
| `GET` | `/oauth/:id/authorize` | Admin | `{ url }` — platform consent page (signed `state`) |
| `GET` | `/oauth/callback` | public | Completes the OAuth flow, redirects to the builder |

### Posts API

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/posts` | User | List posts (filterable) |
| `GET` | `/posts/:id` | User | Get post details |
| `POST` | `/posts` | Manager | Create post |
| `PUT` | `/posts/:id` | Manager | Update post |
| `DELETE` | `/posts/:id` | Admin | Soft-delete (removes a live post from the platform first) |
| `POST` | `/posts/publish-due` | Admin | Run the scheduled-publishing sweep now |

### Campaigns API

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/campaigns` | User | List campaigns |
| `GET` | `/campaigns/:id` | User | Get campaign details |
| `POST` | `/campaigns` | Manager | Create campaign |
| `PUT` | `/campaigns/:id` | Manager | Update campaign |
| `DELETE` | `/campaigns/:id` | Admin | Cancel campaign |

### Mentions API

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/mentions` | User | List mentions (`platform`, `sentiment`, `open=true`, `assigned_to=me`, …) |
| `PUT` | `/mentions/:id` | User | Triage (`assigned_to`, `response_priority`, `requires_response`) or reply (`response_content`, delivered to the channel) |
| `POST` | `/mentions/:id/convert-to-lead` | User | Create a CRM lead from the mention |

### Keywords API

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/keywords` | User | List listening keywords |
| `POST` | `/keywords` | Admin | Add keyword |
| `PUT` | `/keywords/:id` | Admin | Update keyword |
| `DELETE` | `/keywords/:id` | Admin | Delete keyword |

### Assignment Rules API

Configurable routing for inbound conversations (see
[Configurable Assignment Rules](#configurable-assignment-rules)).

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/assignment-rules` | User | List rules (filter by `platform`, `is_active`) |
| `GET` | `/assignment-rules/:id` | User | Get a rule |
| `POST` | `/assignment-rules` | Admin | Create a rule |
| `PUT` | `/assignment-rules/:id` | Admin | Update a rule |
| `DELETE` | `/assignment-rules/:id` | Admin | Delete a rule |
| `POST` | `/assignment-rules/reorder` | Admin | Reorder rules (`{ ordered_ids: [...] }`) |

### Overview API

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/overview` | User | Dashboard stats + connector status |

### Connector Operations API

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/connector-status` | User | Live vs simulation per platform |
| `POST` | `/posts/:id/publish` | Manager | Publish post via platform API |
| `POST` | `/accounts/:id/sync` | User | Sync one account now (token check → metrics → mentions → engagement) |
| `POST` | `/sync-all` | Admin | Sync every account now, ignoring each account's sync frequency |

---

## Benchmark

Native social publishing inside a CRM is rarer than it looks. Salesforce retired Social Studio in
November 2024 and partners with Sprout Social; Microsoft retired Dynamics 365 Social Engagement; Zoho sells
Zoho Social as a separate product integrated with Zoho CRM; Pipedrive has none. HubSpot Marketing Hub is the
one top-5 vendor with native scheduling, monitoring and an inbox.

Genesis now matches or exceeds those products on the engine: server-side scheduled publishing with failure
notifications, per-account sync cadence, automatic token refresh, replies delivered to the channel,
rule-based inbox routing with four strategies per channel, keyword-driven priority, mention-to-lead capture,
campaign roll-ups and automation events. It lags on shipped live connectors (simulation only — the contract and
OAuth flow are complete), post approval workflows, a visual publishing calendar / best-time suggestions, and
AI drafting. The developer reference has the feature-by-feature table:
[SOCIAL_ENGINE.md](../developer-guide/SOCIAL_ENGINE.md#benchmark-against-the-top-5-crms).

## Related Guides

- **Engine internals**: [../developer-guide/SOCIAL_ENGINE.md](../developer-guide/SOCIAL_ENGINE.md)
- **System Configuration**: [SYSTEM_CONFIGURATION.md](SYSTEM_CONFIGURATION.md)
- **Permissions & Roles**: [PERMISSIONS_AND_ROLES.md](PERMISSIONS_AND_ROLES.md)
- **Roadmap**: [../project/ROADMAP.md](../project/ROADMAP.md)
- **Changelog**: [../project/CHANGELOG.md](../project/CHANGELOG.md)
