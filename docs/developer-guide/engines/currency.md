# Genesis CRM — Currency Manager Technical Reference

<!-- nav:top -->
> **[Docs roadmap](../../README.md)** › **[Engine references](README.md)** › 10 of 12 · **For:** Engineers
> ← [Social engine](social-engine.md) · [Application settings](application-settings.md) →
> New to Genesis? Background: [Understanding Genesis › How a request travels](../../understanding/04-how-a-request-travels.md)
<!-- /nav:top -->

For: Developers working on anything that renders, stores, or reports on money

Everything here reflects the **actual implementation** in
[`backend/src/utils/currency.js`](../../../backend/src/utils/currency.js),
[`backend/src/services/currency.service.js`](../../../backend/src/services/currency.service.js),
[`frontend/src/utils/currency.js`](../../../frontend/src/utils/currency.js),
[`frontend/src/store/currencyStore.js`](../../../frontend/src/store/currencyStore.js), and the
`localization.*` keys in [`settings.service.js`](../../../backend/src/services/settings.service.js).
Line references were accurate at the time of writing — grep the symbol name if they drift.

For the admin view of the same feature, see
[administration/system-configuration.md](../../administration/system-configuration.md).

---

## Table of Contents

Part 1 — How it works

1. [Mental model](#mental-model)
2. [What the tenant actually chooses](#what-the-tenant-actually-chooses)
3. [The registry](#the-registry)
4. [Backend resolution](#backend-resolution)
5. [Frontend resolution](#frontend-resolution)
6. [What happens when an admin changes the currency](#what-happens-when-an-admin-changes-the-currency)

Part 2 — Benchmark and roadmap

7. [Benchmark against the top 5 CRM providers](#benchmark-against-the-top-5-crm-providers)
8. [What Genesis does not do yet](#what-genesis-does-not-do-yet)
9. [Extension recipes](#extension-recipes)
10. [Invariants — read before you change anything](#invariants--read-before-you-change-anything)

---

# Part 1 — How it works

## Mental model

Genesis has a **single-currency-per-tenant display manager**. One sentence carries most of the
design:

> The tenant picks one display currency; every surface renders in it; no amount is ever converted.

That is deliberately narrower than what "multi-currency" means in a mature CRM, and the distinction
is the single most important thing to hold in your head:

| | Display currency (what Genesis has) | Transaction currency (what Genesis does not have) |
| --- | --- | --- |
| Scope | one per tenant | one per **record** |
| Stored on the record | no | yes, alongside the amount |
| Exchange rates | none | required, usually dated |
| Effect of changing it | every existing amount **re-renders** with the new symbol | only new records are affected |
| Reporting | trivially consistent — one unit | needs conversion to a corporate currency |

The consequence that trips people up: **switching a tenant from USD to EUR does not convert
anything.** A deal stored as `1000` was `$1,000` before the switch and is `€1,000` after. That is
correct behaviour for a workspace that operates in one currency and was mis-configured, and it is
wrong behaviour for a workspace that genuinely trades in several. Genesis currently serves the
first case only. See [What Genesis does not do yet](#what-genesis-does-not-do-yet).

The Genesis Capital vertical pack works around this in metadata, not in the currency manager. Its
tenant currency is `MUR`; its money objects carry a plain `currency_code` field, a dated `fx_rate`
master object holds rates, and formula fields convert to MUR with
`LOOKUP('fx_rate', 'currency_code', currency_code, 'rate_to_mur', 'rate_date')`
(`backend/prisma/verticals/genesis-capital/objects-growth.js`). Nothing described below reads those
fields.

## What the tenant actually chooses

Three keys under **Settings > Localization** (the admin-only Settings entry in the sidebar), all stored in `tenant_configs` /
`tenants` and read through `SettingsService`:

| Key | Default | Drives |
| --- | --- | --- |
| `localization.currency` | `USD` | the ISO 4217 code, symbol, and number of minor units |
| `localization.locale` | `en` | digit grouping style and symbol placement (`₹12,34,567` vs `1.234,50 €`) |
| `localization.number_format` | `1,234.56` | an **explicit override** of the group/decimal separators |

`number_format` beating the locale is intentional: both controls sit side by side in the same
settings panel, so the one the admin set explicitly wins. Setting Language to German alone gives
`1,234.50 €` — German symbol placement, US separators. Setting Number Format to `1.234,56` as well
gives `1.234,50 €`.

The currency dropdown is generated from the registry (`currencyCodes()`), so the picker, the
server-side validator, and every formatter are fed by one list and cannot disagree.

## The registry

[`backend/src/utils/currency.js`](../../../backend/src/utils/currency.js) holds 47 ISO 4217 currencies
as `{ code, name, symbol, decimals }`, plus pure `formatCurrency()` and `roundToCurrency()`.

`decimals` is ISO minor units, and it is load-bearing rather than cosmetic: JPY, KRW, VND and CLP
have **zero**, and KWD, BHD, OMR and JOD have **three**. `formatCurrency` and `roundToCurrency`
both honour it, which is why `¥1,235` rounds and `KWD 1,234.500` does not.

[`frontend/src/utils/currency.js`](../../../frontend/src/utils/currency.js) is a deliberate mirror —
`backend/` and `frontend/` are separate npm packages with no shared workspace, so the file is
duplicated rather than imported. **Change one, change the other.** Both are pure: no I/O, no state.

## Backend resolution

Money is formatted synchronously deep inside the report HTML
exporter, so threading a currency argument through every signature was not practical.
`CurrencyService` therefore puts the resolved profile in an `AsyncLocalStorage` — the same
mechanism [`tenant-scope.js`](../../../backend/src/middleware/tenant-scope.js) already uses for
`tenant_id`, and safe under concurrency for the same reason.

```text
authenticate (preHandler)
  └─ CurrencyService#getProfile(tenant_id)      ← memoised, 5 min TTL
       └─ currencyContext.enterWith(profile)     ← request-scoped
            └─ template-engine  currency()        ─┐
            └─ report.service   toHtml()          ─┼─ all read CurrencyService.activeProfile()
            └─ any future sync formatter          ─┘
```

Priming happens once, in [`authenticate`](../../../backend/src/middleware/authenticate.js) — the one
place a tenant becomes known — so every authenticated route is currency-correct without touching
individual handlers. Two properties matter:

- **It never throws.** A failed settings read falls through to the USD fallback profile. A
  formatting concern must not turn into a 401 or a 500.
- **It is a Map lookup after the first request.** The profile is memoised per tenant, and
  `SettingsService.updateSettings` calls `CurrencyService.invalidate(tenantId)` on any
  `localization.*` write, so the TTL only bounds staleness for writes that bypass the service
  (seeds, direct SQL).

Scheduled work has no request, so it installs the context itself.
[`report-schedule.service.js`](../../../backend/src/services/report-schedule.service.js) nests
`withProfile()` inside the existing `tenantContext.run()` for exactly this reason — without it, a
scheduled report email would arrive formatted in USD while the same report renders correctly in the
browser.

## Frontend resolution

[`currencyStore.js`](../../../frontend/src/store/currencyStore.js) is a small Zustand store holding the
active profile. It is read two ways, and the split is what kept the change small:

| Read | Use | Re-renders on change? |
| --- | --- | --- |
| `useCurrencyStore.getState()` / `currencyOptions()` | plain functions — `fmtCurrency`, `formatValue`, form defaults | no |
| `useCurrency()` | components — `CurrencyInput` | yes |

Because `fmtCurrency(n)` resolves the currency **at call time** rather than closing over it, every
existing call site kept its signature and none had to become a hook.

Three formatters are exported from
[`utils/formatters.js`](../../../frontend/src/utils/formatters.js):

| Function | Output for `1234567` in USD | Use |
| --- | --- | --- |
| `fmtCurrency` | `$1,234,567` | tables, lists, detail fields |
| `fmtCurrencyPrecise` | `$1,234,567.00` | invoices, prices, anything auditable |
| `fmtCurrencyCompact` | `$1.2M` | stat tiles, chart axes |

`CurrencyInput` takes its symbol from the registry rather than the three-way
`USD/EUR/GBP` ternary it used to have, and pads its left inset for multi-character symbols
(`CHF`, `R$`, `د.إ`). Passing an explicit `currency` prop still overrides the tenant default — that
is the hook a future per-record transaction currency would use.

## What happens when an admin changes the currency

1. `OrganizationSettings` PUTs the changed keys.
2. `SettingsService.updateSettings` validates the code against the registry and writes it.
3. It calls `CurrencyService.invalidate(tenantId)` — the server's memoised profile is dropped.
4. The mutation's `onSuccess` calls `applySettings()` — the browser store updates.
5. Every component using `useCurrency()` re-renders; every subsequent `fmtCurrency()` call returns
   the new format.

No reload, and no stale `$` left anywhere on the page.

---

# Part 2 — Benchmark and roadmap

## Benchmark against the top 5 CRM providers

Feature-by-feature against Salesforce, Microsoft Dynamics 365 Sales, HubSpot, Zoho CRM, and
Pipedrive. ✅ present, ⚠️ partial, ❌ absent.

| Capability | Salesforce | Dynamics 365 | HubSpot | Zoho CRM | Pipedrive | **Genesis** |
| --- | --- | --- | --- | --- | --- | --- |
| Org-level default / corporate currency | ✅ | ✅ base currency | ✅ company currency | ✅ home currency | ✅ default currency | ✅ `localization.currency` |
| Admin can change it after setup | ⚠️ discouraged | ❌ immutable | ✅ | ❌ set once, immutable | ✅ | ✅ **freely, any time** |
| Per-record transaction currency | ✅ | ✅ | ✅ deal currency | ✅ | ✅ per deal | ❌ |
| Stored exchange rates | ✅ | ✅ one per currency | ✅ | ✅ | ✅ | ❌ |
| Automatic rate refresh | ⚠️ via ACM/API | ❌ manual | ✅ monthly/quarterly/yearly | ✅ **live (30 min) or daily**, Open Exchange Rates | ✅ Open Exchange Rates | ❌ |
| Dated / historical rates | ✅ **dated conversion rates** | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dual amount fields (record + corporate) | ✅ | ✅ | ✅ "amount in company currency" | ✅ | ⚠️ reporting only | ❌ |
| Per-user currency preference | ✅ | ✅ | ⚠️ | ✅ | ✅ **user-level default** | ❌ |
| ISO minor units respected (JPY 0, KWD 3) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Locale-aware grouping (`₹12,34,567`) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Separator override independent of language | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ✅ **explicit control** |
| Custom / non-ISO currencies | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ❌ |
| Change takes effect without reload | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **live** |
| Paywalled | Enterprise+ | included | ⚠️ Starter+ | Standard+ | included | included |

### Where Genesis is genuinely competitive

- *Formatting correctness.* Minor units, locale grouping, and compact notation are handled by one
  registry used by both tiers. Many mid-market CRMs treat currency as "symbol + two decimals",
  which silently corrupts JPY and the three-decimal Gulf currencies.
- *An explicit separator control.* Every provider above couples number formatting to the language
  choice. Genesis lets an admin run an English UI with European separators — a real need for
  finance teams that Salesforce and HubSpot both force through a locale change.
- *Live application.* Changing the currency reformats the running app. Every provider surveyed
  requires a reload or a re-login.
- *Mutability.* Dynamics 365 and Zoho make the base/home currency **permanent** — a genuine
  migration hazard their own docs warn about. Genesis has no such trap, precisely because it stores
  no converted values that would need rewriting.

### Where Genesis is behind — honestly

The gap is one feature, and it is the big one: **there is no per-record transaction currency and no
exchange rate table.** All five providers have both. Everything downstream of that follows — dual
amount fields, currency-aware roll-ups, and multi-currency forecasting are all impossible without
it. Two of the five (Zoho, Pipedrive) also refresh rates automatically from Open Exchange Rates,
and Salesforce's dated conversion rates are the strongest implementation in the set: an
opportunity converts at the rate that applied on its close date, which is what makes historical
pipeline reporting auditable.

The honest summary: **Genesis is a correct and unusually ergonomic single-currency system, and it
is not yet a multi-currency system.** For a tenant that operates in one currency it is at parity or
better. For a tenant that closes deals in three, it is not a candidate.

## What Genesis does not do yet

In the order they would need to be built:

1. **Per-record transaction currency.** The `currency` columns already exist on
   `products`, `crm_opportunities`, `quotas` and `social_media_campaigns` — they are written
   and stored but never read back for display. (Builder objects such as Genesis Capital's store
   their own `currency_code` field instead; see [Mental model](#mental-model).) Wiring `CurrencyInput`'s existing `currency` prop to
   those columns is the smallest first step.
2. **An exchange rate table.** `tenant_id, from_code, to_code, rate, effective_from`. Dated from
   the start; retrofitting dates onto a flat rate table is the migration Salesforce customers
   complain about.
3. **A converted companion column.** `amount_in_corporate_currency`, written on save. Reports and
   roll-ups aggregate that column, never the raw one — this is how all five providers make
   mixed-currency reporting work.
4. **Scheduled rate refresh.** A provider adapter behind the existing 60-second scheduler in
   [`app.js`](../../../backend/src/app.js). Zoho's live/daily split is a good model.
5. **Per-user currency preference.** Pipedrive's model: the org has a default, each user overrides
   it for display only.

Steps 1–3 are the ones that change the data model. Nothing in the current design blocks them: the
registry, the profile resolution, and the ALS plumbing are all reusable as-is, and `CurrencyInput`
already accepts an override.

## Extension recipes

**Add a currency to the picker.** Append to `CURRENCIES` in
[`backend/src/utils/currency.js`](../../../backend/src/utils/currency.js) **and** the frontend mirror.
Get `decimals` right — check the ISO 4217 minor unit, do not assume 2. The settings dropdown,
validation, and every formatter pick it up with no further change.

**Render one amount in a non-tenant currency.** Pass the code explicitly:
`formatCurrency(v, { code: 'EUR' })`, or `<CurrencyInput currency="EUR" />`. This is the seam a
per-record transaction currency would use.

**Format money in a new server-side sync path.** Call `CurrencyService.activeProfile().format(v)`.
If the path runs outside a request (a cron, a queue worker), wrap it in
`currencySvc.withProfile(tenantId, fn)` first, or it will silently render USD.

**Format money in a new React component.** Use `fmtCurrency` from `utils/formatters`. Add
`useCurrency()` only if the component must re-render the instant an admin switches currency.

## Invariants — read before you change anything

1. **The two registry files must stay identical.** They are a manual mirror across two npm
   packages.
2. **`decimals` is ISO minor units, not a display preference.** `roundToCurrency` persists at that
   precision. Changing JPY to 2 would start storing sub-yen amounts.
3. **Nothing in the platform converts.** No platform code path multiplies an amount by a rate (a
   vertical pack's own formula fields may, as Genesis Capital's do). If you add one, you have
   started building transaction currency — read
   [What Genesis does not do yet](#what-genesis-does-not-do-yet) first and do it properly.
4. **The formatters must never throw.** An unknown code degrades to `CODE 1234.50`; a null renders
   `—`. A malformed amount must not take down a PDF or a report export.
5. **Server-side sync formatters read the ALS profile.** Any new code path that renders money
   outside a request must install the context, or it will render USD and no test will catch it.
6. **Platform-admin billing screens stay in the platform's own currency.** MRR/ARR in
   `pages/platform/` are the vendor's revenue, not the tenant's, and are deliberately not wired to
   the tenant currency.

## Related documents

- [application-settings.md](application-settings.md) — the settings schema this feature reads from
- [reporting.md](reporting.md) — where `formatValue` and the HTML exporter are used
- [data-dictionary.md](../data-dictionary.md) — the `currency` columns listed in step 1 above
- [administration/system-configuration.md](../../administration/system-configuration.md) — the admin's view

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Application settings](application-settings.md) — Tenant-wide settings model and API |
| **Previous** | [Social engine](social-engine.md) |
| **Background** | [Understanding Genesis › How a request travels](../../understanding/04-how-a-request-travels.md) |
| **Lost?** | [Docs roadmap](../../README.md) · [Engine references](README.md) · [Understanding Genesis](../../understanding/README.md) |
<!-- /nav:bottom -->
