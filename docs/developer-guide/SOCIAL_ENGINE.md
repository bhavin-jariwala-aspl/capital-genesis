# Genesis CRM — Social Engine Technical Reference

For: Developers extending or debugging the social media module and the background schedulers

Everything here reflects the **actual implementation** in
[`backend/src/services/social-media.service.js`](../../backend/src/services/social-media.service.js),
[`backend/src/services/social-assignment.service.js`](../../backend/src/services/social-assignment.service.js),
[`backend/src/routes/social-media/index.js`](../../backend/src/routes/social-media/index.js),
[`backend/src/connectors/social/`](../../backend/src/connectors/social/) and
[`backend/src/utils/scheduler.js`](../../backend/src/utils/scheduler.js). Grep the symbol names if line
numbers drift.

---

## Table of Contents

Part 1 — How the engine works

1. [Mental model](#mental-model)
2. [The two background jobs](#the-two-background-jobs)
3. [Post lifecycle](#post-lifecycle)
4. [Account sync and token refresh](#account-sync-and-token-refresh)
5. [Mention ingest: keywords, dedupe, routing](#mention-ingest-keywords-dedupe-routing)
6. [Replying and converting](#replying-and-converting)
7. [Campaign roll-up](#campaign-roll-up)

Part 2 — Plumbing

1. [The scheduler registry](#the-scheduler-registry)
2. [Tenant context](#tenant-context)
3. [Domain events](#domain-events)
4. [Connector contract and OAuth](#connector-contract-and-oauth)
5. [API surface](#api-surface)

Part 3 — Working on it

1. [Testing](#testing)
2. [Benchmark against the top-5 CRMs](#benchmark-against-the-top-5-crms)
3. [Known gaps](#known-gaps)
4. [Invariants — read before you change anything](#invariants--read-before-you-change-anything)

---

# Part 1 — How the engine works

## Mental model

The social module has three surfaces and two clocks.

The surfaces are the **runtime page** (`/social-media`, every user: feed, posts, campaigns, inbox,
accounts), the **builder** (`/builder/social-media`, admins: everything plus routing rules, listening
keywords and credentials) and the **API** under `/api/social-media`.

The clocks are two background jobs in the API process. Nothing about publishing or syncing depends on a
browser being open:

| Job | Interval | Entry point | What one tick does |
| --- | --- | --- | --- |
| `social-publish` | 60 s | `SocialMediaService.publishDue()` | Publishes every post whose `scheduled_for` has passed. |
| `social-sync` | 5 min | `SocialMediaService.runSyncCycle()` | For each account that is **due** under its own `sync_frequency`: refresh the token if needed, pull profile metrics, ingest mentions, refresh post engagement; then roll engagement up into active campaigns. |

Before September 2026 the module was a form over a table: scheduled posts never published, the
`sync_frequency`/`auto_monitoring` fields were stored and ignored, tokens never refreshed, replies were
recorded but never sent, listening keywords matched nothing, and three list endpoints asked Prisma to count
relations that had been dropped from the schema in July (so they returned 500). The engine described here
is what replaced that.

## The two background jobs

Both are registered in `app.js` through the [scheduler registry](#the-scheduler-registry). Both are
**idempotent across pods** because every unit of work is claimed with a conditional `updateMany`:

- a post is claimed by flipping `status` from its current value to `publishing` (`WHERE id = ? AND status = ?`);
- an account is claimed by stamping `last_sync_at = now` (`WHERE id = ? AND last_sync_at = <value we read>`).

A claim that affects 0 rows means another worker (or a manual click) got there first, and the job moves on.
This is the same pattern the workflow scheduler uses on `ui_workflows.last_run_at` and the reminder sweep
uses on `reminders.status`.

## Post lifecycle

```text
draft ──────────────┐
                    ├─► publishing ─► published
scheduled ──────────┤        │
                    │        └──────► failed ──► (edit) ──► draft / scheduled
failed ─────────────┘
any non-published ──► deleted (soft)
published ──► [connector.deletePost] ──► deleted
```

- **Authors set only `draft` or `scheduled`.** `AUTHOR_POST_STATUSES` is enforced on create and update.
  `published` is never set by hand, so that status means "exists on the platform".
- **Scheduling requires content and a date.** `#assertSchedulable` runs on create and on every update that
  touches status/content/date.
- **A published or publishing post is locked.** Only promotion fields (`is_promoted`, `promotion_budget`,
  `target_audience`) may change; anything else is a 409.
- **`publishPost(id)`** is the single publish path for the button, the scheduler and the admin sweep. It
  claims the row, checks the account is active, refreshes the token if needed, calls `connector.publish`,
  writes back `platform_post_id`/`post_url`/`published_at`, and emits `social.post.published`. On any failure
  it sets `failed`, creates an in-app **notification for the author** (type `social`, linking to the posts
  tab), emits `social.post.failed` and rethrows as a 502 `PUBLISH_FAILED` so a manual caller sees the reason.
- **`publishDue({ now, limit })`** selects `status = 'scheduled' AND scheduled_for <= now` (oldest first,
  50 per tick), runs `publishPost` for each inside that post's tenant context, and returns
  `{ due, published, failed, skipped, errors }`. A lost claim counts as `skipped`.
- **`deletePost`** on a `published` post calls `connector.deletePost` first; if the platform refuses, the CRM
  row is left untouched (502 `PLATFORM_DELETE_FAILED`) so the two never disagree about what the audience sees.

## Account sync and token refresh

`runSyncCycle({ force, now })`:

1. Load accounts with `is_active` and `connection_status IN ('active','expired')`.
2. Skip `expired` accounts that have no refresh token (they need re-authorization — the card says so).
3. Skip accounts not due: `isSyncDue()` compares `now - last_sync_at` against `SYNC_INTERVAL_MS[sync_frequency]`
   (hourly / daily / weekly) with a 150 s tolerance so a 5-minute tick cannot slip a whole interval.
   `force: true` (the admin's **Sync all accounts now**) ignores this.
4. Claim the account by stamping `last_sync_at`. The **previous** value becomes the `since` for the mention pull.
5. Inside `tenantContext.run({ tenantId })`, `syncAccount(id, { since, stamp: false, now })`:
   `#ensureFreshToken` → `syncAccountMetrics` → `pullMentions` → `syncPostEngagement`.
6. On failure the account is marked `error` (visible on its card) unless the failure was a token problem, in
   which case it is already `expired`. The loop continues with the next account.
7. Finally `refreshCampaignPerformance()`.

`#ensureFreshToken(account, now)`:

- no `token_expires_at` → nothing to do (tokens without expiry, or pasted manually);
- more than 24 h left → nothing to do;
- has `refresh_token` → `connector.refreshToken`, persist `access_token`/`refresh_token`/`token_expires_at`,
  set `active`, emit `social.account.token_refreshed`; on failure set `expired` and throw
  `TOKEN_REFRESH_FAILED` (502);
- no `refresh_token` and already expired → set `expired`, throw 409 with a re-authorize message;
- no `refresh_token` but still valid → proceed (the overview counts it under `expiring_tokens`).

The same helper guards `publishPost` and connector-delivered replies, so no platform call starts with a dead token.

The manual `POST /accounts/:id/sync` runs `syncAccount` **sequentially** (it used to fire the three connector
calls in `Promise.all`, racing each other's `last_sync_at` writes).

## Mention ingest: keywords, dedupe, routing

`pullMentions(accountId, { since })` — skipped entirely when `auto_monitoring` is `false`.

For every mention the connector returns:

1. **Own posts are dropped** when the author handle equals the account handle (case-insensitive, `@` stripped).
2. **Deduplicated on `post_url`** when the connector supplies one (`findFirst` on `account_id + post_url`).
   `post_url` is the only per-mention identifier the schema stores, so a live connector must populate it with
   the platform's canonical URL or object id — it is also what `sendReply` receives later.
3. **Listening keywords are matched** with `SocialMediaService.matchKeywords(content, keywords, platform)`:
   respects `match_type` (exact / contains / starts_with / ends_with), `is_case_sensitive`, `is_active`, and a
   keyword's `platforms` list (empty = all). Hits are written to `keywords_matched`; a mention that only
   matched via keyword gets `mention_type = 'keyword'`.
4. **Priority and response flag**: `requires_response` defaults to `true` for negative sentiment;
   `response_priority` defaults to `high` for negative sentiment, and any **high-priority keyword** hit raises
   it to `high` (never lowers `urgent`).
5. **Routing** (`#assignInboundMentions`) for mentions that require a response: active
   `SocialAssignmentRule`s for the platform (or with `platform = null`) run in `order_index` order through
   `SocialAssignmentService.route()`; if none exist, the mention is load-balanced across the **social team**
   (active employees who are `managed_by` on any active account, always including this account's manager).
   Load = open mentions (`requires_response && !response_sent`) per employee.
6. **The assignee is notified** in-app (type `mention`, deep link `/social-media?tab=mentions&assigned=me`).
7. `social.mentions.received` is emitted once per pull with the count.

Routing rule types (`fixed`, `round_robin` with a row-locked cursor, `load_balanced`, `rule_based` over the
mention field map — `platform, mention_type, sentiment, sentiment_score, response_priority, follower_count,
influence_score, reach_estimate, requires_response, author_handle, content, keywords_matched`) share operator
semantics with record assignment via `AssignmentService.matchesConditions`. Admins edit them on the builder's
**Routing** tab.

## Replying and converting

`updateMention(id, data, actor)`:

- `assigned_to`, `requires_response`, `response_priority` (validated) are plain triage updates; a changed
  assignee is notified unless they made the change themselves.
- `response_content` **sends the reply through the connector first** (`sendReply(account, mention.post_url ??
  id, text)`), then marks `response_sent`, `response_content`, `response_sent_at`, and assigns the mention to the
  actor if it was unassigned. A platform rejection is a 502 `REPLY_FAILED` and nothing is written — "Responded"
  in the inbox means the audience saw it. Organic mentions (`account_id = null`) are recorded without a
  connector call. Double replies are a 409.

`convertMentionToLead(id, actor)` — social lead capture without a schema change:

- creates a CRM lead through `CrmService.createLead` (`lead_source = 'social_media'`, name split from the
  author, description carrying platform, handle, link and the mention text, `rating = 'warm'` for positive
  sentiment) owned by the mention's assignee or the actor;
- the lead's `external_id` is `social:<platform>:<mention id>`, which makes the conversion **idempotent** (409 on
  a second attempt) and lets `listMentions` decorate each mention with `lead_id`, `lead_record_id`,
  `lead_status` through one `crm_leads.external_id IN (...)` lookup;
- emits `social.mention.converted`.

`CrmService.createLead` reads the tenant from AsyncLocalStorage, so this must run inside a tenant context —
every social route handler does (see [Tenant context](#tenant-context)).

## Campaign roll-up

`refreshCampaignPerformance({ now })` runs at the end of each sync cycle. For every `active` campaign it sums
`engagement_metrics` (likes, comments, shares, views) over posts that are `published`, were published inside
`[start_date, end_date + 1 day)`, and belong to an account on one of the campaign's `platforms`, and writes
`{ posts, likes, comments, shares, views, computed_at }` to `performance_summary`. Both pages render it on the
campaign card. There is no post → campaign foreign key; the window + platform rule is the association.

**Know what that number is before you surface it anywhere new.** Because the association is positional
rather than explicit, two campaigns that overlap in time on the same platform each receive the *combined*
engagement of both — the roll-up cannot tell their posts apart. It is also organic-only (no ad spend, CTR
or conversions), and `performance_summary` is a single blob overwritten every cycle, so there is no history
to trend or compare against. Closing this needs `platform_campaign_id` on the campaign, a `campaign_id` FK
on the post, and a dated insights table; the design is in
[SOCIAL_MEDIA.md → Meta Ads & Campaign Analytics](../admin-guide/SOCIAL_MEDIA.md#meta-ads--campaign-analytics).

---

# Part 2 — Plumbing

## The scheduler registry

`backend/src/utils/scheduler.js` replaces five hand-rolled `setTimeout`/`setInterval` blocks in `app.js`.

```js
const schedulers = new SchedulerRegistry();
schedulers.add({ name: 'social-publish', intervalMs: 60_000, startDelayMs: 10_000, log: fastify.log,
                 run: () => socialMediaSvc.publishDue() });
fastify.addHook('onReady', async () => schedulers.startAll());
fastify.addHook('onClose', async () => schedulers.stopAll());
```

Each job gets: a staggered start delay, an **overlap guard** (a tick that finds the previous one still running
is counted in `skipped_overlaps`, never queued), error capture (`failures`, `last_error`), and a status snapshot
(`runs`, `last_started_at`, `last_finished_at`, `last_duration_ms`, `last_result`). `GET /health` returns
`schedulers: { workflow, sla, social-publish, social-sync, reminder, report-schedule }` with those snapshots —
the operator's view of every automation loop. Timers are `unref()`ed so they never keep a shutting-down process alive.

The registry deliberately does **not** solve multi-pod coordination; each job claims its own rows.

## Tenant context

`authenticate()` awaits the JWT before calling `tenantContext.enterWith()`, and Fastify does not carry that
async context into the handler, so `getTenantId()` reads `null` inside route handlers and the Prisma
tenant-scope extension skips scoping (see hardening follow-up #1). Social tables all carry `tenant_id` and the
service relies on automatic scoping, so every social route handler is wrapped with
`scopedHandler()` from `middleware/tenant-scope.js`, which runs the handler inside
`tenantContext.run({ tenantId: req.user.tenant_id })`. The reporting routes did the same first with a local
helper; this is the shared version.

Background jobs run with **no** tenant (they read across tenants), then enter each row's own tenant
context before doing per-row work — the same shape as the SLA reconciler and the workflow scheduler.

## Domain events

The service publishes on the app-wide `DomainEventBus`, so workflows and outbound webhook integrations can react:

| Event | Payload (all include `tenant_id`) |
| --- | --- |
| `social.post.published` | `post`, `account_id`, `platform` |
| `social.post.failed` | `post_id`, `account_id`, `error` |
| `social.post.deleted` | `post` |
| `social.mentions.received` | `account_id`, `platform`, `count` |
| `social.mention.responded` | `mention`, `actor_id` |
| `social.mention.converted` | `mention_id`, `lead_id`, `record_id` |
| `social.account.connected` | `account_id`, `platform` |
| `social.account.token_refreshed` | `account_id`, `platform` |

`IntegrationService` subscribes to `*`, so any active outbound integration subscribed to these names receives them.

## Connector contract and OAuth

`connectors/social/base.js` defines the interface; `simulation.js` implements all of it; `index.js` resolves
`getConnector(platform)` — a platform gets a live connector only when its `LIVE_CONNECTORS` entry exists **and**
every `requiredEnv` variable is set, otherwise simulation. `PLATFORMS` (the one list of channel names) is
exported from here and imported by both services, so adding a platform is a one-line change.

Every connector method is now reachable from the product:

| Method | Called from |
| --- | --- |
| `getAuthUrl(account, { redirectUri, state })` | `GET /oauth/:id/authorize` |
| `handleCallback(code, account)` | `GET /oauth/callback` |
| `refreshToken(account)` | `#ensureFreshToken`, `POST /accounts/:id/refresh-token` (empty body) |
| `publish(account, post)` | `publishPost` (button, sweep) |
| `deletePost(account, platformPostId)` | `deletePost` on a published post |
| `getPostEngagement(account, platformPostId)` | `syncPostEngagement` |
| `getMentions(account, since)` | `pullMentions` |
| `sendReply(account, mentionId, content)` | `updateMention` with `response_content` |
| `getProfileMetrics(account)` | `syncAccountMetrics` |

**OAuth.** Genesis owns the callback URL. `getOAuthAuthorizeUrl(accountId, redirectUri)` signs a `state`
(`base64url(JSON{account_id, tenant_id, exp}) . HMAC-SHA256(JWT_SECRET)`, 15-minute TTL) and asks the connector
for the consent URL. The public `GET /oauth/callback` verifies the state with a constant-time compare, enters
the tenant from it, calls `handleCallback`, persists the tokens, sets `active`, and redirects the browser to
`${APP_URL}/builder/social-media?oauth=success|error`. The simulation connector's "consent page" is the
callback itself with a fake code, so the demo flow completes in one click. `API_URL` overrides the redirect URI
the platform is given (defaults to the request's own origin).

**Credentials never leave the server.** Every account response passes through `#publicAccount`, which strips
`access_token`/`refresh_token` and adds `has_access_token`/`has_refresh_token`. Before this change tokens were
returned to any authenticated user on `GET /accounts`.

## API surface

See [API_REFERENCE.md → Social Media](API_REFERENCE.md#social-media--apisocial-media) for the full table.
Additions in this pass:

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /oauth/:id/authorize` | Admin | `{ url, state }` — start the platform consent flow. |
| `GET /oauth/callback` | public | Completes the flow; redirects to the builder. |
| `POST /posts/publish-due` | Admin | Run the scheduled-publishing sweep now. |
| `POST /mentions/:id/convert-to-lead` | JWT | Social lead capture. |
| `GET /mentions?assigned_to=me&open=true` | JWT | Inbox filters (`me` resolves to the caller). |
| `POST /accounts/:id/refresh-token` (empty body) | Admin | Connector-driven refresh (body with `access_token` = manual). |
| `POST /sync-all` | Admin | Now `runSyncCycle({ force: true })` — ignores per-account frequency. |

Query changes: `GET /posts` hides `deleted` unless `status` or `include_deleted=true`; `status=scheduled`
sorts by `scheduled_for`. `GET /campaigns` hides `cancelled` unless asked. `GET /accounts` hides inactive
accounts unless `include_inactive=true`. `GET /overview` gained `scheduled_posts`, `failed_posts`,
`open_mentions`, `expiring_tokens`, `posts_by_status` and an `engagement` block.

---

# Part 3 — Working on it

## Testing

The Jest suite uses mocks and needs no database.

- `tests/social-media-service.test.js` — lifecycle validation, publish claim/failure/notification, the
  publish sweep, sync-frequency gating and account claim, token refresh and expiry, keyword matching, ingest
  (own-post skip, dedupe, priority), connector-delivered replies, lead conversion, OAuth state signing, overview.
  The connector is mocked inside the `jest.mock` factory and re-exported as `_connector` for assertions.
- `tests/social-media-assignment.test.js` — inbound routing precedence (rules vs default team).
- `tests/social-assignment.test.js` — rule validation and each rule type.
- `tests/scheduler.test.js` — start delay, interval, overlap guard, error capture, registry.
- `frontend/tests/SocialMediaPage.test.jsx` — engagement from metrics, failed-post hint, inbox deep link and
  filters, convert-to-lead, author status options.

When adding a connector, add a unit test with mocked HTTP for `handleCallback`, `publish`, `getMentions`
(asserting `post_url` is populated) and `sendReply`.

## Benchmark against the top-5 CRMs

Native social publishing inside a CRM is rarer than it looks: Salesforce retired Social Studio (Nov 2024) and
partners with Sprout Social; Microsoft retired Dynamics 365 Social Engagement; Zoho ships it as a separate
product (Zoho Social) integrated with Zoho CRM; Pipedrive has none. HubSpot Marketing Hub is the one top-5
vendor with native scheduling, monitoring and an inbox.

| Capability | HubSpot | Zoho Social | Salesforce (via partner) | Genesis |
| --- | --- | --- | --- | --- |
| Scheduled publishing that fires server-side | Yes | Yes | Partner | **Yes** (`social-publish`, claim-safe) |
| Failure notification to the author | Yes | Yes | Partner | **Yes** (in-app notification) |
| Per-account sync cadence | Fixed | Fixed | Partner | **Yes** (hourly / daily / weekly) |
| Token refresh / expiry handling | Yes | Yes | Partner | **Yes** (auto-refresh, `expired` state, expiring count) |
| Inbox with reply posted to the channel | Yes | Yes | Partner | **Yes** (reply delivered before marked) |
| Rule-based inbox routing (round robin, load balance, conditions) | Limited | Limited | Partner | **Yes** (four rule types, per channel) |
| Listening keywords driving priority | Yes | Yes | Partner | **Yes** (keyword hit → priority, `keywords_matched`) |
| Mention → CRM lead | Yes | Yes | Yes | **Yes** (idempotent, linked back to the inbox) |
| Campaign performance roll-up | Yes | Yes | Partner | **Yes** (window + platform rule) |
| Automation events for workflows/webhooks | Yes | Yes | Yes | **Yes** (`social.*` on the event bus) |
| Live platform connectors shipped | Meta, LinkedIn, X | Meta, LinkedIn, X, more | Partner | **Simulation only** (contract + OAuth wired; see gaps) |
| Post approval workflow | Yes | Yes | Partner | No |
| Visual publishing calendar / best time to post | Yes | Yes | Partner | No |
| AI post drafting | Yes | Yes | Yes | No |

Genesis is at parity or ahead on the engine (routing rules, per-channel cadence, event integration) and
behind on the two things that need either a platform contract or a UI investment: live connectors and
authoring conveniences (approvals, calendar, AI drafts).

## Known gaps

- **No live connector ships.** The contract and the OAuth round-trip are complete; each platform still needs
  its HTTP implementation and app review (see the per-platform notes in
  [SOCIAL_MEDIA.md](../admin-guide/SOCIAL_MEDIA.md#major-platform-integrations)).
- **Failure reason is delivered as a notification, not stored on the post.** `social_media_posts` has no
  `last_error` column and this pass added no migration (the shared database was unreachable). Add
  `last_error TEXT NULL` + `publish_attempts INT` when a migration is next scheduled, and write them in `publishPost`'s catch.
- **Mention identity relies on `post_url`.** A `platform_mention_id` column with a unique index per account
  would make dedupe and replies robust for connectors that do not expose a URL.
- **No post approval flow, calendar view, or best-time suggestion.**
- **`alert_threshold` on keywords is stored but not evaluated** (volume alerts).
- **Engagement metrics are refreshed for the 50 most recent published posts per account** per sync.
- **Campaign roll-up is positional, not linked.** No `platform_campaign_id`, no post → campaign FK, and no
  dated insights table — so overlapping campaigns double-count and no trend is possible. See
  [Campaign roll-up](#campaign-roll-up).
- **No paid-campaign data at all.** Ad spend, CTR, conversions and per-audience breakdowns come from Meta's
  Marketing API, which is a separate connector, token type and app-review submission from the page
  publishing scopes. Nothing in the module touches it.
- **The schema has no message-level model.** `SocialMediaMention` is one flat row with a single
  `response_content`, which cannot represent a two-way conversation (thread, media, delivery receipts,
  24-hour window). A live WhatsApp channel needs `WhatsAppConversation` + `WhatsAppMessage`; stretching
  `SocialMediaMention` breaks the inbox, the routing rules and the roll-up, all of which assume one row is
  one complete item.
- **No bulk-send model.** `SocialMediaPost` is broadcast-to-the-world with one engagement blob; it cannot
  track per-recipient delivery state. Bulk messaging needs template / broadcast / broadcast-recipient
  tables. Both gaps are designed out in
  [SOCIAL_MEDIA.md → What the existing schema cannot carry](../admin-guide/SOCIAL_MEDIA.md#what-the-existing-schema-cannot-carry).

## Invariants — read before you change anything

1. **`published` is written only by `publishPost`.** Never let a client set it; the inbox, overview and
   campaign roll-up all assume it means "live on the platform".
2. **Claim before you call the platform.** Any new path that publishes, deletes or replies must win a
   conditional `updateMany` first, or two pods (or a click racing the sweep) will double-post.
3. **Write success only after the connector succeeds.** Replies, deletes and publishes must never mark the
   CRM row as done when the platform said no.
4. **Stamp `last_sync_at` once, up front, in `runSyncCycle`.** The pre-claim value is the `since` window; the
   sub-steps must not stamp it themselves or a failed sync silently loses the window.
5. **Every route handler is `scopedHandler`-wrapped.** Adding an unwrapped social route leaks across tenants
   until the ALS bug is fixed globally.
6. **Tokens go through `#publicAccount`.** New account-returning methods must not leak `access_token`.
7. **`PLATFORMS` lives in the connector registry.** Do not re-declare the platform list in a service or the UI.
