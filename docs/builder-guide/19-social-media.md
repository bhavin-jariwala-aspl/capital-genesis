# Social Media

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Builder guide](README.md)** › 19 of 20 · **For:** Administrators
> ← [Integration health](18-integration-health.md) · [Appearance & branding](20-appearance.md) →
> New to Genesis? Background: [Understanding Genesis › What happens automatically](../understanding/06-what-happens-automatically.md)
<!-- /nav:top -->

> **Tools → Social Media** · `/social-media` (everyone) · **Builder → Connect → Social Media** · `/builder/social-media` (admins) · Schedule posts, run campaigns, and work the inbox of mentions routed to you.

## What it is

The Social Media workspace lets your organization manage its social presence from inside Genesis CRM. Admins
connect one corporate account per platform (such as a Facebook Page or LinkedIn Company Page). Managers and
admins then write and schedule posts and plan campaigns. Everyone can see what is going out, reply to the
mentions routed to them, and turn a promising mention into a CRM lead.

Two things happen on their own in the background:

- **Scheduled posts publish themselves.** Give a post a **Publish at** time and the server publishes it within
  a minute of that time. If the platform rejects it, the post is marked **failed** and you get a notification
  telling you why.
- **Accounts sync themselves.** Each account is refreshed on its own schedule (hourly, daily or weekly): new
  mentions arrive in the inbox already assigned to someone, and engagement numbers on your posts update.

By default the app runs in **Demo** mode with a simulation connector, so you can try every step before real
platform connectors are configured.

### Who can do what

| Action | Regular user | Manager | Admin |
| ------ | ------------ | ------- | ----- |
| View posts, campaigns, accounts | Yes | Yes | Yes |
| Create / edit / schedule / publish / retry posts | No | Yes | Yes |
| Delete posts | No | No | Yes |
| Reply to mentions, convert a mention to a lead | Yes | Yes | Yes |
| Sync an account now | Yes | Yes | Yes |
| Connect accounts, routing rules, listening keywords | No | No | Yes |

A regular **user** sees posts but no Create/Edit/Publish buttons (they are hidden, and the API blocks the actions
even if called directly). The engagement count on a post is a read-only figure pulled from the platform; the only
inbound interaction a user performs is replying to **mentions**.

## Where to find it

- Everyone: Sidebar → **Tools** → **Social Media**. Tabs: **Feed**, **Posts**, **Campaigns**, **Inbox**, **Accounts**.
- Admins: Sidebar → **Builder** → **Connect** → **Social Media**. Tabs: **Overview**, **Accounts**, **Posts**,
  **Campaigns**, **Inbox**, **Routing**, **Listening**. Requires an **Admin** or **Super Admin** role.

Notifications about assigned mentions and failed posts link straight to the right tab.

## Before you begin

- To connect a real account you need its platform Account ID, and either an access token from the platform's
  developer console or the ability to complete the platform's authorization (OAuth) screen.
- Connect at least one account before creating posts — the **Create Post** button is disabled until an account exists.

## Connect a social account (admins): step by step

1. Open **Builder → Social Media → Accounts** and click **Connect Account**.
2. Choose the **Platform**: Facebook, Instagram, LinkedIn, X (Twitter), WhatsApp, YouTube, or TikTok.
3. Choose the **Account Type**: Business, Organization, or Personal.
4. Enter the **Account Name / Handle** (for example `@genesiscapital`), the **Platform Account ID**, and a **Display
   Name**. These three are required.
5. Optionally add a **Profile URL**.
6. Set the **Sync Frequency** (Hourly, Daily, or Weekly) — how often the background sync pulls mentions and
   metrics for this account — and pick an **Account manager**, who receives inbound mentions when no routing rule
   applies. Tick **Auto-monitor mentions** to collect mentions automatically.
7. Provide credentials one of two ways: paste the **Access Token** (and optional **Refresh Token**), or click
   **Connect Account** now and then **Authorize** on the account card to go through the platform's consent screen.
8. Click **Connect Account**. The card shows followers, posts, mentions, connection status, sync time, and a
   **token state** badge (set / expires in N days / expired). Tokens themselves are never displayed.

On each account card you can **Edit**, **Authorize** (OAuth), **Refresh token** (when a refresh token is
stored), **Enable/Disable**, open the **profile link**, or **disconnect**. Tokens that are about to expire are
refreshed automatically when a refresh token is stored; otherwise the account shows **expired** and stops
syncing until you re-authorize.

Selecting **WhatsApp** shows a notice: this connects one shared business number for the whole organization;
incoming messages are routed to employees via the Routing rules, and individuals cannot connect personal numbers.

> **What WhatsApp can and cannot do here today.** WhatsApp is selectable as a platform and takes part in
> routing, but it is served by the demo simulation like every other channel — there is no live connector yet.
> In particular there is **no bulk or targeted messaging** and **no chat thread**: the Inbox holds one row per
> item with a single reply, not a back-and-forth conversation. Sending campaigns to a contact list and
> chatting with customers are planned work, not current features. Admins can read the plan in
> [social-media.md](../administration/social-media.md#whatsapp-integration).

## Create and schedule a post: step by step

1. Open the **Posts** tab and click **Create Post**.
2. Pick the **Account** and the **Post Type**: Post, Story, Reel, Video, Carousel, or Live.
3. Write the post **Content**.
4. Set the **Status**: **Draft** (kept in the CRM only) or **Scheduled**.
5. For a scheduled post, set **Publish at**. Content and a time are required.
6. Click **Create**.

The server publishes scheduled posts automatically within a minute of the chosen time. To publish sooner, click
**Publish now** on any draft or scheduled post. Use the filter at the top of the Posts tab to see the
**Scheduled queue** in publish order, or only drafts, published or failed posts.

**If a post fails**, it shows a red **failed** badge with a hint, and the author receives a notification with the
platform's reason. Edit the post if needed, then click **Retry**.

A published post cannot be edited (its content is what the audience saw); admins can delete it, which removes it
from the platform first.

## Plan a campaign: step by step

1. Open the **Campaigns** tab and click **Draft Campaign** (or **New Campaign** in the builder).
2. Enter a **Campaign Name** and choose a **Campaign Type**: Brand Awareness, Lead Generation, Promotion,
   Engagement, or Traffic.
3. Enter the **Objective** (required) and an optional **Description**.
4. Set the **Start Date** and **End Date** (both required; the end date must be after the start date).
5. Optionally set **Total Budget** and **Daily Budget**, and pick **Target Platforms**.
6. Click **Create**. When editing an existing campaign you can also change its **Status** (Planning, Active,
   Paused, Completed, or Cancelled). Deleting a campaign marks it as cancelled.

While a campaign is **Active**, engagement on posts published to its target platforms inside its dates is
summed onto the campaign card after every sync, under **Performance**.

> **Performance is a window total.** Posts are matched to a campaign by platform and date, not by an explicit
> link — so if two campaigns run on the same platform at the same time, each shows the engagement of **both**.
> It also counts likes, comments, shares and views only: it is not ad spend, click-through rate or
> conversions, and it keeps no history, so there is no trend to chart.

## Work the inbox

The **Inbox** tab (Feed → **Work the inbox** takes you there) lists incoming mentions with author, sentiment
(Positive, Neutral, Negative), type, priority, and any listening keywords they matched.

- **Assigned to me** shows what has landed in your queue; **Needs reply** hides mentions already handled. Both
  are on when you arrive from a notification.
- Filter further by **Platform** and **Sentiment**.
- Click **Reply**, type your response and press Enter or **Send**. The reply is posted to the originating
  channel; the mention then shows **Responded** with your text. If the platform rejects the reply you see the
  error and can try again.
- Click **Convert to lead** to create a CRM lead from the author, with source *social media*. The mention then
  shows a **Lead #** badge. The lead is written to the built-in `crm_leads` table for an object named `lead`.
  **Genesis Capital has no `lead` object**, so there the converted lead appears on no screen and does not become an
  Enquiry; create the enquiry by hand instead.

Mentions that need a reply are assigned automatically as they arrive — on every channel — following the
admin's routing rules, or balanced across the account managers when there are none. The assignee is notified.

## Routing rules (admins)

**Builder → Social Media → Routing** decides who receives inbound mentions. Rules run in order; the first that
produces a person wins, otherwise the last rule's fallback. Each rule applies to **All channels** or one platform.

| Rule type | Behaviour |
| --------- | --------- |
| Fixed | Always one person |
| Round Robin | Cycle through a pool of team members |
| Load Balanced | The pool member with the fewest open mentions |
| Rule Based | When all conditions on the mention match (platform, sentiment, priority, follower count, keywords matched, …), assign to a person or load-balance a pool |

Use the ▲▼ arrows to reorder. With no rules, mentions go to the least-loaded account manager.

## Add a listening keyword (admins): step by step

1. Open the **Listening** tab and click **Add Keyword**.
2. Enter the **Keyword** (for example `genesis capital` or `#genesiscapital`) and a **Type**: Brand, Competitor, Industry,
   Product, or Hashtag.
3. Choose a **Match Type**: Exact, Contains, Starts With, or Ends With.
4. Choose a **Priority**. A **High** keyword raises the response priority of every mention it matches.
5. Select which platforms to **Monitor on** (none selected means all), and tick **Active**.
6. Click **Add**.

Every incoming mention is checked against the active keywords; matches are shown on the mention in the inbox.

## Reference: fields & options

| Tab | Key options | Notes |
| --- | --- | --- |
| Feed / Overview | Open mentions, scheduled and failed posts, engagement, expiring tokens, connector modes | Admin Overview also has **Run publish sweep now** and **Sync all accounts now**. |
| Accounts | Platform, Account Type, Sync Frequency, Account manager, Auto-monitor, credentials or Authorize | One corporate account per platform per tenant. |
| Posts | Account, Post Type, Content, Status (Draft / Scheduled), Publish at | Scheduled posts publish automatically; failed posts can be retried. |
| Campaigns | Type, Objective, dates, budgets, Target Platforms, Status | Performance rolls up automatically while Active — read it as a window total, not a per-campaign figure. |
| Inbox | Assigned to me, Needs reply, Platform, Sentiment; Reply; Convert to lead | Replies are posted to the channel. |
| Routing | Rule type, channel, assignee / pool / conditions, fallback, order | Admin only. |
| Listening | Keyword, Type, Match Type, Priority, platforms, Active | High priority raises mention priority. |

### Platforms

Facebook, Instagram, LinkedIn, X (Twitter), WhatsApp, YouTube, and TikTok.

## How posting and metrics work

- Posting, replies, deletions and metrics go through a connector. By default a **simulation connector** is
  used (shown as **Demo** on the Feed), so the whole workflow can be exercised without platform API keys.
  A platform switches to **Live** when a connector is registered on the server for it.
- Access tokens are stored encrypted on the server and never shown in the UI. Expiring tokens are refreshed automatically
  when a refresh token is available.

## Tips

- Check the **Feed** first thing: it shows how many mentions need a reply and whether any scheduled post failed.
- Give every account an **Account manager** or add a Routing rule, otherwise new mentions sit unassigned.
- Add **High**-priority listening keywords for terms that must never wait (your brand plus "refund",
  "complaint", "cancel").

## Related guides

- [Assignment Rules](11-assignment-rules.md) — the same routing strategies for CRM records.
- [Email Templates](15-email-templates.md) — for standardized outbound email content.
- [Push Notifications](16-push-notifications.md) — for internal alerts to your team.

## Troubleshooting

- **Create Post is greyed out** — no account is connected. Ask an admin to connect one.
- **A scheduled post did not publish** — check its status. **failed** means the platform rejected it (see your
  notification for the reason; edit and **Retry**). Still **scheduled** past its time means the server sweep has
  not run yet; admins can click **Run publish sweep now** on the Overview.
- **Campaign won't save** — Name, Objective, and both dates are required, and the end date must be after the start.
- **Account shows "expired"** — the token expired and no refresh token was stored. Click **Authorize** or paste
  a new token via **Edit**.
- **Account shows "error"** — the last sync hit a platform error. Click **Enable** to reset it and **Sync Now**.
- **No mentions appear** — make sure the account has **Auto-monitor mentions** on and is **active**; mentions
  arrive at the account's sync frequency (click **Sync Now** to pull immediately).
- **My reply was not recorded** — the platform rejected it; the error is shown above the inbox. Try again.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Appearance & branding](20-appearance.md) — Colours, logo, fonts, density, chart palette |
| **Previous** | [Integration health](18-integration-health.md) |
| **Background** | [Understanding Genesis › What happens automatically](../understanding/06-what-happens-automatically.md) |
| **Related** | [Social media administration](../administration/social-media.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Builder guide](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
