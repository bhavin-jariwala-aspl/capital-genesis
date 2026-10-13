# Integration Health

> **Builder → Connect** · `/builder/integration-health` · Monitor integration status, execution history, and retry
> failures.

## What it is

Integration Health is a read-only dashboard that shows how the integrations you created in
[Integrations](09-integrations.md) are performing. For each integration it shows success and error counts, average
response time, an error rate, and a colored health indicator. You can expand any integration to see its recent
executions and retry the ones that failed.

## Where to find it

Sidebar → **Builder** → **Connect** → **Integration Health**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- Create at least one integration first in [Integrations](09-integrations.md). If none exist, the page shows a
  message telling you to create one in the Integration Builder.
- Execution history only appears after an integration has run at least once — either a **subscribed CRM event**
  (record created/updated/deleted or a field change) fired it, or you used the manual **Test** button.
- Outbound deliveries retry transient failures automatically (network error, timeout, HTTP 429/5xx). A logged
  failure whose error ends with "(after N attempts)" means Genesis already retried before giving up.

## Reading the dashboard: step by step

1. Open **Integration Health** from the sidebar. The page header shows four summary numbers across the top.
2. Read the summary bar:
   - **Total** — how many integrations exist.
   - **Active** — how many are turned on.
   - **Healthy** — how many have an error rate of zero.
   - **Total Errors** — the combined error count across all integrations (shown in red when above zero).
3. Each integration appears as a card. The card border color reflects its health: green (healthy), amber
   (degraded), red (unhealthy), or grey (unknown / no data yet).
4. On the right of each card, read the per-integration figures: **ok** (success count), **err** (error count), and
   **avg** (average duration in milliseconds). A colored badge shows the error percentage when it is above zero.
5. Click anywhere on a card to expand it and reveal **Recent Executions**. Each row shows a status dot, the
   timestamp, the result or error message, and the duration.
6. For any failed execution, click the small refresh (retry) icon at the end of its row to re-run it.

## Reference: fields & options

| Indicator | What it shows | Notes |
| --- | --- | --- |
| Card border color | Overall health of the integration | Green = healthy, amber = degraded, red = unhealthy, grey = unknown |
| Inactive badge | Integration is turned off | Appears next to the name when the integration is not active |
| ok | Number of successful executions | Counted from the most recent executions |
| err | Number of failed executions | Counted from the most recent executions |
| avg | Average response time in milliseconds | Shows a dash when there is no timing data |
| % err badge | Error rate | Amber below 20%, red at 20% or higher |
| Status dot | Result of a single execution | Green = success, red = failure, grey = other/unknown |
| Retry icon | Re-runs a failed execution | Only shown on rows whose status is failure |

### How health is decided

| Health | Condition | Card color |
| --- | --- | --- |
| Healthy | Error rate is exactly 0% | Green |
| Degraded | Error rate is above 0% but below 20% | Amber |
| Unhealthy | Error rate is 20% or higher | Red |
| Unknown | No statistics available yet | Grey |

## Refreshing

The dashboard loads each integration's stats and logs when you open the page. To pull the latest numbers, reload
the page in your browser. When you retry a failed execution, the stats refresh automatically afterward so the new
result is reflected.

## What to do when an integration is unhealthy

1. Expand the unhealthy (red or amber) card to see **Recent Executions** and read the error messages on the failed
   rows.
2. Common causes and fixes:
   - A timeout means the destination was slow or unreachable — confirm the URL and consider raising the
     **Timeout (ms)** value in [Integrations](09-integrations.md).
   - An authentication error means the destination rejected the credentials — fix the **Headers (JSON)** in the
     integration settings.
   - A connection error means the URL is wrong or the destination is down.
3. After fixing the configuration, click the retry icon on a failed row to re-run that exact request, or use the
   **Test** button on the Integrations page to send a fresh request.

## Tips

- Only failed executions show a retry icon; successful ones cannot be retried.
- A grey card simply means the integration has not run yet, not that something is broken. Run a **Test** from the
  Integrations page to generate history.
- Statistics are based on the most recent executions (up to the latest 200), so very old failures eventually drop
  off the error rate.

## Related guides

- [Integrations](09-integrations.md)

## Troubleshooting

- **No integrations configured yet** — none exist. Create one in [Integrations](09-integrations.md) first.
- **A card stays grey** — the integration has no execution history. Trigger it or run a **Test** to populate stats.
- **Retry does nothing visible** — the retry runs in the background and the stats refresh when it finishes; expand
  the card again to see the new execution row.
- **Numbers look out of date** — reload the page to fetch the latest stats and logs.
