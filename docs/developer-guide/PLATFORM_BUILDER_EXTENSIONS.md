# Platform Builder Extensions

October 2026. These are the generic platform capabilities added so that a complete industry vertical — the SWAN Capital financial-services CRM ([SWAN implementation](../SWAN-CAPITAL/IMPLEMENTATION.md)) — could be built **entirely as Builder metadata**, with no per-object pages or code. Every feature below works for any tenant and any object.

| Capability | What it gives an admin | Code |
|---|---|---|
| [Formula language](#1-formula-language) | Computed fields, formula validation rules, formula workflow conditions, stage entry rules | `services/formula.js`, `services/record-compute.js` |
| [Lookup fields & related lists](#2-lookup-fields-and-related-lists) | Record-to-record links, a picker, titles in lists, a Related tab on every record | `RecordService` (`searchLookup`, `relatedRecords`), `RecordPicker`, `RelatedPanel` |
| [Record actions](#3-record-actions) | Buttons on the record panel that run a workflow | `POST /api/runtime/records/:id/actions/:workflowId`, `RecordActions` |
| [Stage gates](#4-stage-gates) | Required fields / a formula before a record may enter a stage | `RecordService.#assertStageGate` |
| [Business units & information barriers](#5-business-units-and-information-barriers) | Legal-entity scope and private-side walls, enforced at the data layer | `services/access-scope.service.js`, `services/segmentation.service.js`, `/api/access` |
| [Tamper-evident audit chain](#6-tamper-evident-audit-chain) | Hash-chained log of access and permission changes | `services/audit-chain.service.js` |
| [Public web forms](#7-public-web-forms) | Publish any form as an unauthenticated web-to-record form | `services/public-form.service.js`, `/api/public/forms/:key`, `/f/:key` |
| [Object analytics](#8-object-analytics) | Dashboard widgets over any object | `services/object-analytics.service.js`, `POST /api/analytics/object` |
| [Record SLAs](#9-record-slas) | SLA timers on any object's pipeline | `SlaService.#reconcileRecords` |
| [Workflow additions](#10-workflow-additions) | `send_email`, `generate_document`, linked `create_record`, formula conditions, maker-checker | `services/workflow.service.js` |
| [Vertical packs](#11-vertical-packs) | Install an industry configuration into a tenant, idempotently | `services/vertical-installer.service.js`, `scripts/install-vertical.js` |

---

## 1. Formula language

A safe expression language, parsed into an AST and evaluated by a whitelist of functions — **never** `eval`/`new Function`, because formulas are typed by tenant admins on a shared server.

```text
literals     12  3.5  'text'  "text"  true  false  null
fields       loan_amount        party.date_of_birth   (follow a lookup with a dot)
operators    + - * / % ^    = == != <> < <= > >=    AND OR NOT  && || !
functions    IF  AND  OR  NOT  CASE  IN  COALESCE  IFBLANK  ISBLANK
             ROUND FLOOR CEIL ABS MIN MAX SUM NUMBER PMT
             CONCAT UPPER LOWER LEN CONTAINS TEXT
             TODAY NOW YEAR AGE YEARS_BETWEEN MONTHS_BETWEEN DAYS_BETWEEN ADD_DAYS ADD_MONTHS ADD_YEARS
             LOOKUP(object, match_field, value, return_field[, date_field])
             LATEST(object, return_field, date_field)
             COUNT_RELATED(object, link_field[, where_field, where_value])
             SUM_RELATED(object, link_field, field[, where_field, where_value])
```

- Blank inputs propagate as blank (no invented zeros); division by zero is blank.
- `LOOKUP` with a `date_field` returns the newest row already in effect (rate tables). `LOOKUP(…, 'id')` returns the matched record's id (duplicate detection).
- `id` is the record's own id (so a parent can `LOOKUP('kyc_case', 'party', id, …)`).
- Every cross-record read goes through the tenant-scoped client.

### Where formulas run

| Use | Configure | Evaluated |
|---|---|---|
| Formula field | field type `formula`, `config.expression`, `config.format` (`currency`/`percent`/`date`/`number`/`checkbox`), `config.precision` | Server, on every create/update, in field order (later formulas see earlier ones) |
| Formula validation | rule type `expression` (value = formula, message) | Server, against the stored record overlaid with the submission; skipped while its field is blank |
| Workflow condition | operator `expression`, value = formula | When the step runs |
| Stage entry rule | `stage.config.entry_rule.expression` | On every move into the stage |

**Roll-ups stay current.** When a record with lookup fields is saved (or a workflow writes to one), its parents' formulas are recomputed (`RecordService.recompute` / `#refreshParents`), so `SUM_RELATED` totals follow their children.

The Builder validates a formula as it is typed (`POST /api/builder/formula/check`) and refuses to save a formula field that does not parse or a lookup without a target.

> The old `custom` validation type ran admin-typed JavaScript in other users' browsers through `new Function` — shadowing `window` does not stop `globalThis` or the `Function` constructor, so it was a stored-XSS vector. It is retired: legacy `custom` rows are inert everywhere, and the `expression` type replaces it, enforced on the server.

## 2. Lookup fields and related lists

A `lookup` field stores the id of a record of `config.target_object` (an object **name**). Lookups are stored as numbers in the typed field table, so they are indexable and filterable.

- **Picker** — `GET /api/runtime/lookup/:objectName?q=` searches the target's records by title; `?id=` resolves one. Both are scoped to what the viewer may see.
- **Titles** — list and detail payloads carry `labels: { field: title }`. An object's title is `config.title_field`, else the first of `display_name, name, full_name, title, subject, code, reference`.
- **Related tab** — `GET /api/runtime/records/:id/related` returns every record pointing at this one, grouped by the object and field it came through. No configuration: adding a lookup field creates the related list. On a party this is the Client 360.
- **Deep links** — `/module/:m/object/:o?record=:id` opens a record's panel.

List cells, the record panel and related lists all render values through one component, `components/runtime/FieldValue.jsx`, driven by field metadata (the previous list renderer special-cased field names such as `annual_revenue`).

## 3. Record actions

Every active workflow with the **Manual** trigger on an object becomes a button on that object's record panel. `POST /api/runtime/records/:id/actions/:workflowId` re-checks that the caller can see and edit the record and that the workflow is a manual workflow of the record's own object.

## 4. Stage gates

A pipeline stage's `config` may declare:

```json
{ "required_fields": ["disqualify_reason"],
  "entry_rule": { "expression": "security_complete AND kyc_status = 'approved'",
                  "message": "Disbursement needs perfected security and an approved KYC." } }
```

`RecordService.updateRecordStage` and `bulkUpdateStage` enforce it, so Kanban drags, API calls, bulk moves and workflow `stage` actions all obey the same rule. A bulk move is all-or-nothing. Edit gates in **Builder ▸ Pipeline Builder ▸ stage ▸ Entry rules**.

## 5. Business units and information barriers

Two access layers on top of owner/hierarchy scope:

| Layer | Data | Who sees a tagged record |
|---|---|---|
| Business unit | `records.business_unit_id`; `business_units`, `employee_business_units` | Members of the unit; employees with no unit memberships and admins are unrestricted. Records without a unit (e.g. a group-level party) are visible to all. |
| Information barrier | `records.barrier_zone_id`; `barrier_zones`, `barrier_members` (standing or time-bound) | Zone members, and roles with the `barrier_override` operational permission. **Admins are bound by barriers.** |

Which unit and zone a record lands in is object config (Builder ▸ Modules & Objects ▸ object ▸ Record settings):

- `business_unit_field` — a field holding a unit code (may be a formula);
- `barrier_zone` — a zone code for every record of the object;
- `barrier_zone_field` — a field holding a zone code (e.g. a formula `IF(list_type = 'watch', 'COMPLIANCE_ONLY', '')`).

Enforcement points: record list/get/bulk, related lists, lookups, global search, object analytics, documents attached to records (download, preview, share, e-sign, list, search), record actions. A record outside the viewer's scope answers **404**, never 403, so its existence does not leak. A database error while resolving scope **fails closed** (the request errors); only a client without the models (an old build or a test double) means "feature not in use".

**Wall-crossings** — anyone may request (`POST /api/access/wall-crossings`); Compliance approves for 1–365 days (default 30). The requester can never approve their own crossing. An approval never shortens a standing membership. Admin UI: **Tools ▸ Access & Barriers**.

Leak tests: `tests/access-scope.test.js`.

## 6. Tamper-evident audit chain

`audit_chain_events` is append-only and hash-chained per tenant: each event's SHA-256 covers its canonical content **and the previous event's hash**, so editing, inserting or deleting any event breaks verification from that point. `GET /api/access/audit-chain/verify` reports the first broken sequence number.

Appended for: business-unit and barrier membership changes, wall-crossing requests and decisions, UI and operational permission changes (PRD CMP-FR-07 / E-08), public-form publishing. A failed append is logged loudly and never fails the business action.

## 7. Public web forms

Any Builder form can be published (Form Builder ▸ Public web form):

- `POST /api/builder/forms/:id/publish` — `{ success_message, consent_field, consent_text_version, capture_fields, result_fields, stage, captcha, channel, rotate }`. The key is always random (48 hex chars); `config` and `public_key` are not writable through the ordinary form update.
- `GET /api/public/forms/:key` — the renderable field list; `POST` — a submission. Hosted page: `/f/:key` (iframe-able).

A submission becomes a record **through the normal record path**, in the form's tenant — formulas, validation, unit stamping, assignment, SLA timers and `on_create` workflows all run. Guard rails: only laid-out fields (plus UTM/`page_url`/`referrer`/`language` where the object has fields of those names) are accepted; consent is enforced and time-stamped; honeypot `_hp`; per-IP and per-form rate limits; optional reCAPTCHA (`RECAPTCHA_SECRET`, `RECAPTCHA_SITE_KEY`); JSON schema and a 64 KB body limit. `result_fields` lets the website show computed values (a calculator's EMI, a questionnaire's model portfolio).

## 8. Object analytics

`POST /api/analytics/object` with a widget `data_source` of type `object`:

```json
{ "type": "object", "object": "loan_application", "metric": "sum", "field": "loan_amount_mur",
  "group_by": "stage", "filters": [{ "field": "stage", "op": "nin", "value": "declined,withdrawn" }] }
```

`metric`: count / sum / avg / min / max. `group_by`: `stage` (pipeline order), `created_month`, or any field (select fields show their option labels). Filter ops: `eq neq in nin gt gte lt lte contains empty notempty`; `stage` filters on the stage's API name. Reads are scoped by the viewer's record access. Dashboard Builder ▸ widget ▸ Data ▸ **Records of an object**.

## 9. Record SLAs

SLA policies with `entity_type = 'record'` time any object: `object_id` plus `config`:

```json
{ "first_response_stages": ["new"], "closed_stages": ["converted", "disqualified"],
  "canceled_stages": ["nurture"], "dimension_field": "priority" }
```

The reconciler builds rows from records and typed field values and runs the same timer, business-hours, pause (`pause_statuses` = stage names) and escalation logic as the built-in case/lead/task entities; `create_task` escalations attach the task to the record. The API rejects stage names the object's pipeline lacks and a policy with no closed stage. SLA Builder ▸ Applies to ▸ **Records of an object**.

## 10. Workflow additions

| Addition | Config |
|---|---|
| `send_email` step | `{ template, to_field? = email, to?, language_field? }` — picks `<template>_<lang>` when it exists (bilingual correspondence) |
| `generate_document` step | `{ template, filename? }` — renders a merge template from the record and files it on the record |
| `create_record` | now runs through `RecordService` (formulas, stamping, assignment, events); `link_field` points the new record back; `store_as` stores its id on the source; `stage` names its starting stage; `{{id}}` interpolates the source id |
| `action` on `stage` | `{ field: 'stage', value: '<stage name>' }` moves the record through the record service, so gates and stage events apply |
| condition operator `expression` | a formula over the whole record |
| context | `{{stage}}` (stage API name), `{{today}}`, `{{id}}` |
| approval `exclude_actor` / `exclude_field` | maker-checker: the person who triggered the step (or the employee named in a field) can never approve |

Fields written by workflow actions and `update_related` trigger formula recomputation.

## 11. Vertical packs

A pack (`backend/prisma/verticals/<name>/`) is plain data: business units, barrier zones, roles, staff, modules/objects/fields/forms/pipelines, dependencies, wizards, document categories/checklists/templates, email templates, workflows, assignment rules, business hours, SLA policies, object permissions, master data, dashboards, public forms and optional demo records.

```bash
node scripts/install-vertical.js swan-capital --create-tenant [--demo] [--password <pw>]
node scripts/install-vertical.js swan-capital --tenant swan-capital      # re-install / upgrade
```

The installer is **idempotent**: every row is matched by its natural key and updated in place; workflows, assignment rules, SLA policies and dashboards are replaced by name; rows the pack does not mention are never touched. Staff accounts are created once and never overwritten (random passwords printed once). Custom roles must sit at level 4 or below. Records referenced as `@object:field=value`; demo/master records keyed by one field or a composite key.

`tests/swan-pack.test.js` resolves every reference in a pack (fields, stages, objects, roles, templates, formulas) so a typo fails CI rather than producing an inert automation.

## 12. Fixes made alongside

| Defect | Effect before | Fix |
|---|---|---|
| Scoped updates trusted `data.tenant_id` | A request body carrying `tenant_id` could move a module/object/field/form row into another tenant | Tenant extension pins `data.tenant_id` (and an upsert's `update`) to the context tenant; module/object/form writes take column whitelists |
| `GET /api/documents/record/:id` and per-document routes ignored record access | Any user could list/download documents of records they could not open | Documents attached to a record inherit its visibility (`docGuard`) |
| Rule-based assignment read only `crm_*` columns | Conditions on custom objects never matched; everything went to the fallback | Assignment reads typed field values too |
| Auto-number padded to 3 digits and ignored `format` | After 999 the string sort reissued numbers; two objects with a same-named field shared a sequence | Width from the format's trailing `N`s; sequence scoped to the object |
| `custom` validation executed admin JavaScript in browsers | Stored XSS across users | Retired; `expression` rules on the server |
| Forged-token test flipped the last base64url character | Flaky (~1 in 12) because padding bits can make the forgery valid | Tampers a middle character |
| `RateLimitedError` lived inside the auth routes | Not reusable; a second limiter would have thrown `undefined` | Moved to `utils/errors` |
