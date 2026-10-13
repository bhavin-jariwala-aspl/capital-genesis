# Integrations

> **Builder → Connect** · `/builder/integrations` · Configure outbound webhooks and external service connectors.

## What it is

Integrations let Genesis CRM exchange data with other systems automatically. The most common type is an **outbound
webhook**: you tell Genesis which CRM **events** to listen for (a record being created, updated, deleted, or a field
changing), and whenever one of those events happens, Genesis sends an HTTP request carrying a standard JSON payload
to a URL you choose. You define each integration once, choose its events, turn it on, and it fires automatically —
no workflow is required. You can also send a test request and review a history of past executions.

Genesis also supports **inbound webhooks** so other systems can push data *into* the CRM, optionally triggering a
workflow when a matching event arrives.

Key behaviours (benchmarked to the way Salesforce, HubSpot, Dynamics, Zoho, and Pipedrive handle webhooks):

- **Event subscriptions** — an outbound integration only fires for the events it subscribes to.
- **Signed payloads** — set a signing secret and every request carries an `X-Signature-256` HMAC-SHA256 header the
  receiver can verify.
- **Automatic retries** — a failed delivery (network error, timeout, or an HTTP 429/5xx response) is retried a few
  times with exponential backoff, so transient blips don't lose the event.
- **SSRF protection** — requests to private, loopback, or link-local addresses are blocked.

## Where to find it

Sidebar → **Builder** → **Connect** → **Integrations**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- Have the destination URL ready (for example, a Slack incoming webhook or your own API endpoint).
- Know any custom HTTP headers the destination requires, such as an `Authorization` token or API key.
- Decide whether the request should use `POST`, `PUT`, or `PATCH`.
- Decide **which events** should trigger it — Record created, Record updated, Record deleted, Field changed, or
  All events.
- Optionally, agree a **signing secret** with the destination so it can verify each request's `X-Signature-256`
  header.

## Create / configure an integration: step by step

1. Click **New Integration** in the top-right of the page header. A dialog titled **New Integration** opens.
2. In **Name (unique slug)**, enter a short identifier with no spaces, for example `slack-notify`. This is the
   integration's stable identifier.
3. In **Label**, enter a friendly display name, for example `Slack Notification`. This is shown in lists. If you
   leave it blank, the name is used.
4. Choose a **Type**. The available options are **Outbound Webhook**, **Inbound Webhook**, **Email Sync (coming
   soon)**, **Enrichment (coming soon)**, and **Custom**. **Outbound Webhook** and **Inbound Webhook** have
   configuration forms today.
5. Set the **Status** toggle. It starts as **Inactive**. Click it to switch to **Active** when you are ready for the
   integration to fire. You can also leave it inactive and activate it later from the list.
6. Under **Configuration** (for **Outbound Webhook**), fill in:
   - **Webhook URL** — the full destination URL, for example `https://example.com/webhook`.
   - **HTTP Method** — choose `POST`, `PUT`, or `PATCH`.
   - **Timeout (ms)** — how long to wait for a response before giving up, in milliseconds (default `10000`).
   - **Trigger on events** — tick the CRM events this integration should fire on (Record created / updated /
     deleted, Field changed, or All events). If you leave this empty the integration never fires automatically and
     can only be exercised with the **Test** button.
   - **Signing secret (optional)** — a shared secret. When set, each request carries an `X-Signature-256`
     HMAC-SHA256 header computed over the exact request body, so the receiver can confirm it came from Genesis.
   - **Headers (JSON)** — a JSON object of custom headers, for example `{"Authorization": "Bearer TOKEN"}`. Leave
     it as `{}` if you do not need any. `Content-Type: application/json` is always sent automatically.
   For an **Inbound Webhook**, fill in:
   - **Signing secret (optional)** — if set, inbound requests must carry a valid `X-Signature-256` header or they
     are rejected with `401`.
   - **Event field (optional)** — the field in the incoming payload that names the event (defaults to `event`,
     then `type`, then `action`).
   - **Event → Workflow map (JSON)** — maps an inbound event name to a workflow ID to run automatically, for
     example `{"payment.succeeded": 12}`. The public endpoint is `POST /api/integrations/inbound/{name}`.
7. Click **Create Integration** to save. The dialog closes and the new integration appears in the list.

To edit later, click **Edit** on any integration card, change the fields, then click **Save Changes**.

## Reference: fields & options

| Field / Option | What it does | Notes |
| --- | --- | --- |
| Name (unique slug) | Stable identifier used internally | Required. Use lowercase with dashes; cannot be changed easily |
| Label | Friendly display name shown in lists | Defaults to the name if left blank |
| Type | Selects which connector runs | **Outbound Webhook**, **Inbound Webhook**, **Enrichment**, and **Custom** are all configurable |
| Status | Active or Inactive | The toggle governs **automatic** event firing. A workflow can still invoke an integration explicitly even when it is inactive |
| Webhook URL | Destination the request is sent to | Required for outbound webhooks; must be a full `http`/`https` URL. Private/loopback URLs are blocked (SSRF protection) |
| HTTP Method | Request verb | `POST`, `PUT`, or `PATCH` |
| Timeout (ms) | Wait time before the request is abandoned | Default `10000` (10 seconds) |
| Trigger on events | The CRM events an outbound integration subscribes to | Generic — `record.created`, `record.updated`, `record.deleted`, `record.field_changed`, `*` — **or per-object** like `lead.created`, `opportunity.updated` (picked from your objects). Empty = never fires automatically |
| Signing secret | Signs the payload with HMAC-SHA256 | Optional. Adds an `X-Signature-256` header the receiver can verify. For inbound, verifies the incoming signature |
| Headers (JSON) | Custom HTTP headers as a JSON object | `Content-Type: application/json` is added for you |
| Event → Workflow map | (Inbound) runs a workflow when a mapped event arrives | JSON `{ "eventName": workflowId }` |

Failed outbound deliveries are retried automatically with exponential backoff (default 3 attempts); a log entry
marked with "(after N attempts)" shows retries occurred.

**Per-object events (metadata-driven).** The event picker offers both generic `record.*` events (any object) and
per-object events derived from your actual objects — e.g. `lead.created`, `opportunity.updated`. Subscribe to
`lead.created` to fire only for leads, or `record.created` to fire for every object. This mirrors how HubSpot,
Pipedrive, and Zoho scope webhook subscriptions to a specific object.

### Type options explained

| Type | Status | What it does |
| --- | --- | --- |
| Outbound Webhook | Available | Subscribes to CRM events and sends a signed JSON payload to your URL via HTTP |
| Inbound Webhook | Available | Exposes `POST /api/integrations/inbound/{name}` so external systems push data in; can trigger a workflow |
| Enrichment | Available | POSTs the record to a data-enrichment provider (Clearbit/Apollo/custom) and returns the data; a workflow's **Integration** step can map the response back onto record fields |
| Custom | Available | A user-defined generic outbound destination — behaves like an outbound webhook (SSRF-guarded, signed, retried) |
| Email Sync | Planned | Mailbox sync (IMAP/OAuth); not yet offered |

### Using an integration from a workflow

Integrations and workflows are one system. In the **Workflow Builder** you can:

- **Reference an integration by name** from a **Webhook** step (`{ "integration": "slack-notify", "body": {…} }`) — the
  endpoint, secret, headers and retry policy are configured once on the integration and reused, and every call shows
  up in that integration's health dashboard. This is the "named connection / named credential" pattern.
- **Run an integration** from an **Integration** step, optionally mapping an enrichment provider's response back onto
  the record (`field_map`).
- **Emit a custom event** from an **Integration** step (`{ "event": "lead.qualified" }`) that other integrations
  subscribe to — letting a workflow broadcast a business event to external systems.

## Tips

- Enter the **Headers** field as valid JSON. If the JSON cannot be parsed when you save, headers are stored as an
  empty object `{}` instead, so the destination may reject the request. Double-check brackets and quotes.
- Use the **Test** button on a card to fire a sample payload and confirm the connection works before relying on it.
  Test is only available when the integration is **Active**; activate it first.
- Click the chevron (down arrow) on a card to expand **Recent Executions** and see the latest results, durations,
  and any error messages. This list refreshes automatically.
- The **Timeout** is in milliseconds, not seconds. `10000` means 10 seconds.

## Testing a connection

1. Make sure the integration is **Active** (the **Test** button is disabled while it is inactive).
2. Click **Test** on the integration card. A spinner appears, then either a green **OK** or a red error message.
3. Expand the card to view the new entry in **Recent Executions**, including the status, duration, and any error.

A test sends a small payload and records the result the same way a real execution does, so it also appears in the
logs and updates the "Last run" timestamp.

## Enabling and disabling

- Toggle an integration on or off directly from its card using the toggle switch on the right.
- A green toggle and **Active** badge mean it is live and will fire automatically. A grey toggle and **Inactive**
  badge mean it will not fire and cannot be tested.
- To remove an integration entirely, click the trash icon on its card.

## Related guides

- [Integration Health](10-integration-health.md)

## Troubleshooting

- **Test button is greyed out** — the integration is **Inactive**. Switch the **Status** toggle to **Active**, then
  try again.
- **Test fails with a timeout** — the destination did not respond within the **Timeout (ms)** window. Increase the
  timeout, or confirm the URL is reachable.
- **Test fails with an authentication error** — the destination needs credentials. Add the required header (for
  example `{"Authorization": "Bearer TOKEN"}`) in **Headers (JSON)**.
- **Headers are ignored** — the **Headers (JSON)** value was not valid JSON, so it was saved as empty. Re-open the
  integration, fix the JSON, and save again.
- **Integration does not fire automatically** — confirm it is **Active** *and* that it subscribes to the event you
  expect under **Trigger on events**. An outbound integration with no events selected never fires on its own (it can
  still be exercised with **Test**).
- **Deliveries fail with a blocked-URL error** — the destination resolves to a private, loopback, or link-local
  address, which is blocked for security (SSRF protection). Use a publicly reachable URL.
- **Receiver rejects the request as unsigned/invalid** — a **Signing secret** is set but the receiver isn't
  verifying `X-Signature-256` with the same secret, or the secrets differ. Align both sides.
