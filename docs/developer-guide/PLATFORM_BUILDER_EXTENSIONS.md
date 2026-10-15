# Platform Builder Extensions

October 2026. These are the generic platform capabilities added so that a complete industry vertical — the Genesis Capital financial-services CRM ([Genesis implementation](../GENESIS-CAPITAL/IMPLEMENTATION.md)) — could be built **entirely as Builder metadata**, with no per-object pages or code. Every feature below works for any tenant and any object.

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
| [Personal data protection](#12-personal-data-protection) | Masked, encrypted and view-audited fields; audited reveal; concealed restricted counts | `services/field-protection.js`, `RecordService.revealField` |
| [Client & introducer portal](#13-client-and-introducer-portal) | An external sign-in realm that shows clients the records `config.portal` names | `services/portal.service.js`, `/api/portal`, `/portal/:workspace` |
| [Record merge & bulk reassign](#14-record-merge-bulk-reassign-and-updated_by) | Merge duplicates with re-pointing and a 30-day reversal; RM-exit reassignment; `updated_by` | `RecordService.mergeRecords` / `unmergeRecord` / `bulkAssign` |
| [Sessions & MFA](#15-sessions-and-two-factor-authentication) | Rotating refresh tokens, revocation, TOTP two-factor | `services/auth.service.js`, `services/session-revocation.js`, `utils/totp.js` |
| [SMS, retries & the job queue](#16-sms-integration-retries-and-the-job-queue) | `send_sms` step; failed integration calls retried from a durable queue | `services/job-queue.service.js`, `workflow.service.js` |
| [Sandbox integrations](#17-sandbox-integrations) | Realistic stand-ins for external systems until credentials exist | `services/integration-simulators.js` |
| [Public data feeds](#18-public-data-feeds) | Read-only JSON of chosen fields for a website (rates, prices) | `services/public-feed.service.js`, `/api/public/feeds/:workspace/:name` |
| [Calendar feed](#19-calendar-feed) | Personal iCalendar subscription of meetings, tasks and reminders | `services/calendar-feed.service.js`, `/api/calendar` |
| [French labels](#20-french-labels) | EN/FR switch for module, object, field, stage and option labels | `utils/localize.js`, `store/languageStore.js` |
| [Daily formula refresh](#21-daily-formula-refresh) | Date-dependent formulas stay true on records nobody edits | `services/formula-refresh.service.js` |
| [Containers & CI](#22-containers-and-ci) | Dockerfiles, compose stack, GitHub Actions | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml` |
| [Approvals inbox](#23-approvals-inbox) | Every workflow approval waits in one inbox; decisions carry a comment and are audited | `WorkflowEngineService.listApprovals`, `/approvals` |
| [Record visibility per role](#24-record-visibility-per-role) | "Own & team" or "All" records per role and object, within units and barriers | `ui_permissions.view_scope`, `RecordService.#ownerOnlyFilter` |
| [PDF documents](#25-pdf-documents) | Merge templates render letterheaded PDFs; picklist labels and formatted amounts | `utils/pdf.js`, `DocumentTemplateService.render` |
| [Defaults and immediate SLAs](#26-server-side-defaults-and-immediate-sla-timers) | Builder defaults on every create path; SLA timers start when the record is created | `RecordService.#withDefaults`, `SlaService.reconcileRecord` |
| [Checklists and client upload links](#27-document-checklists-and-client-upload-links) | Checklist status on any record; signed, expiring links where a client uploads what is missing | `services/document-checklist.service.js`, `services/upload-link.service.js`, `/api/upload-links`, `/upload/:token` |
| [Distribution lists and open tracking](#28-distribution-lists-and-open-tracking) | `email_list` step: one template to every member of a list, in their language, with opens counted | `workflow.service.js`, `services/email-tracking.js` |
| [Website preview](#29-website-preview) | A page showing what a website built on the feeds and forms looks like | `pages/WebsitePreviewPage.jsx`, `/site/:slug` |

---

## 1. Formula language

A safe expression language, parsed into an AST and evaluated by a whitelist of functions — **never** `eval`/`new Function`, because formulas are typed by tenant admins on a shared server.

```text
literals     12  3.5  'text'  "text"  true  false  null
fields       loan_amount        party.date_of_birth   (follow a lookup with a dot)
operators    + - * / % ^    = == != <> < <= > >=    AND OR NOT  && || !
functions    IF  AND  OR  NOT  CASE  IN  COALESCE  IFBLANK  ISBLANK
             ROUND FLOOR CEIL ABS MIN MAX SUM NUMBER PMT
             CONCAT UPPER LOWER LEN CONTAINS TEXT  LABEL(picklist_field)
             TODAY NOW YEAR AGE YEARS_BETWEEN MONTHS_BETWEEN DAYS_BETWEEN ADD_DAYS ADD_MONTHS ADD_YEARS
             LOOKUP(object, match_field, value, return_field[, date_field])
             LATEST(object, return_field, date_field)
             COUNT_RELATED(object, link_field[, where_field, where_value])
             SUM_RELATED(object, link_field, field[, where_field, where_value])
```

- Blank inputs propagate as blank (no invented zeros); division by zero is blank.
- `LABEL(request_type)` returns the display label of a picklist field's current option ("Statement request", not
  `statement_request`); it follows lookups too (`LABEL(party.segment)`). Use it in record titles.
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

- `POST /api/builder/forms/:id/publish` — `{ success_message, consent_field, consent_text_version, capture_fields, result_fields, stage, captcha, channel, rotate }`. The key is always random (48 hex chars); `config` and `public_key` are not writable through the ordinary form update. The settings are merged into `config.public`, so keys a vertical pack set (`field_options`, `expert_roles`) survive a re-publish; they are set by the pack, not through this endpoint.
- `GET /api/public/forms/:key` — the renderable field list; `POST` — a submission. Hosted page: `/f/:key` (iframe-able).

A submission becomes a record **through the normal record path**, in the form's tenant — formulas, validation, unit stamping, assignment, SLA timers and `on_create` workflows all run. Guard rails: only laid-out fields (plus UTM/`page_url`/`referrer`/`language` where the object has fields of those names) are accepted; consent is enforced and time-stamped; honeypot `_hp`; per-IP and per-form rate limits; optional reCAPTCHA (`RECAPTCHA_SECRET`, `RECAPTCHA_SITE_KEY`); JSON schema and a 64 KB body limit. `result_fields` lets the website show computed values (a calculator's EMI, a questionnaire's model portfolio); the response carries each result's label and format (`result_fields: [{ name, label, format, precision }]`). `field_options: { field: [values] }` narrows a picklist on one form only — the Genesis Capital loan calculators offer just the four loan products — and a submitted value outside it is rejected.

**"Talk to an expert" links.** `expert_roles: [role names]` lets a link name the person the client will deal with: `/f/<key>?expert=<employee_id>`. The describe response then carries `expert: { id, name }` (the page shows "You'll speak with …"), and the submission sends `expert` back; the record is created assigned to that person, ahead of the assignment rules. The ID is honoured only for an **active** employee of the form's tenant whose role is in `expert_roles`; anything else is ignored silently and normal routing applies, so a guessed or stale ID never fails a submission or reveals who works there.

**Sharing with clients** (`/web-forms` page, any staff member): `GET /api/web-forms` lists the workspace's published forms (title, description, object, the products each offers, and the `experts` a link may name); `POST /api/web-forms/:id/link { prod?, expert? }` returns a share URL; `POST /api/web-forms/:id/send { to, name?, prod?, expert?, message?, language: en|fr, record_id? }` emails it through `EmailSendService.sendRaw` (logged as `related_type: 'web_form'`), limited to 30 sends per user per hour. Links carry `utm_source=crm`, `utm_medium=link|email`, `utm_campaign=form_share`, which the form stores on the record where the object has those fields. The base URL is `APP_URL`, else the browser's origin. Unlike on the public page, an ineligible `expert` here is a 400, so staff learn at once that the link would not route.

`GET /api/public/workspaces/:slug/forms` lists an active workspace's published forms (title, description, path) for a website menu; it exposes no staff or field details.

**The hosted page** wears the workspace's theme and logo, and its name (`workspace` in the describe response). It puts a brand panel beside the form; splits forms of seven or more fields into two steps (the request, then the person's details and consent) with a progress bar; shows picklists of up to six options as option cards; starts from the fields' Builder defaults and `?prod=`; and ends on a confirmation showing the reference and the computed results.

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
| context | `{{stage}}` (stage API name), `{{today}}`, `{{id}}`; in `send_email`, `{{upload_link}}` — a 14-day client upload link for the record ([§27](#27-document-checklists-and-client-upload-links)) |
| `email_list` step | `{ template, list_object, link_field, match?, active?, email_field? = email, language_field?, suppress_field?, track_field?, limit? = 2000 }` — see [§28](#28-distribution-lists-and-open-tracking) |
| approval `exclude_actor` / `exclude_field` | maker-checker: the person who triggered the step (or the employee named in a field) can never approve |
| `send_sms` step | `{ integration, message, message_<lang>?, to_field? = mobile, to?, language_field?, suppress_field? }` — see [§16](#16-sms-integration-retries-and-the-job-queue) |
| `action` through a lookup | `{ field: 'decision_mandate.conflict_status', value }` writes to the record a lookup points at |
| `integration` `field_map` | `{ recordField: 'path.in.response' }` writes the provider's answer back onto the record; failed calls are queued for retry |

Fields written by workflow actions and `update_related` trigger formula recomputation.

## 11. Vertical packs

A pack (`backend/prisma/verticals/<name>/`) is plain data: workspace settings, business units, barrier zones, roles, staff, modules/objects/fields/forms/pipelines, dependencies, wizards, document categories/checklists/templates, email templates, workflows, assignment rules, business hours, SLA policies, object permissions, master data, dashboards, public forms and optional demo records.

```bash
node scripts/install-vertical.js genesis-capital --create-tenant [--demo] [--password <pw>]
node scripts/install-vertical.js genesis-capital --tenant genesis-capital      # re-install / upgrade
node scripts/install-vertical.js genesis-capital --tenant genesis-capital --recompute[=obj1,obj2]  # also recompute formulas
```

The installer is **idempotent and diff-based**: every row is matched by its natural key and only rows that differ are written; workflows, assignment rules, SLA policies and dashboards are replaced by name; rows the pack does not mention are never touched. Staff accounts are created once and never overwritten (random passwords printed once). Custom roles must sit at level 4 or below. Records referenced as `@object:field=value`; demo/master records keyed by one field or a composite key.

**Speed.** Against a remote database each single-row write costs a network round trip, so the installer batches: fields, validations, stages, permissions and workflow steps go in with `createMany`; metadata reads are memoised during the records phase; demo records are written eight at a time. Records carry `ext_ref` (matched on re-runs), `_stage`, `_owner` and `_created` (back-dated history). Parent roll-ups are deferred during the bulk load and recomputed once at the end in formula-dependency order; a demo set can request an intermediate `{ recompute: ['party'] }` checkpoint when later validations depend on a roll-up. With `--demo`, three more steps run after the records:

- **Ownership.** The pack's assignment rules route unowned demo records, and the rest inherit their parent's
  owner (`pack.referenceObjects` stay unowned).
- **History.** A stage timeline and a realistic `updated_at` are written for back-dated records.
- **Platform demo.** `pack.platformDemo(ctx)` returns activities, tasks, reminders, PDF documents (with review
  status, share links and e-signature requests), wall-crossings and an audit-chain baseline, which are written
  through the platform services.

**Workspace settings.** `pack.settings` is a map of setting keys to values (Genesis Capital: `localization.currency: 'MUR'`, `localization.timezone: 'Indian/Mauritius'`, `localization.date_format: 'DD/MM/YYYY'`, `appearance.app_name`). The `settings` step compares them with the tenant's effective settings and writes only those that differ, through `SettingsService.updateSettings`. A re-run therefore resets these keys if an administrator has changed them; leave a key out of the pack to let administrators own it.

`--reset-passwords --password <pw>` sets one password on every pack staff account (demo environments only). `--skip-records` (with `--demo`) skips master data and demo records that are already loaded and runs only the ownership, history and platform-demo steps. Connection-level database errors (unreachable, closed, pool timeout) are retried with back-off, so a long install survives a network blip.

When a run adds or edits a formula field, the object's existing records are recomputed too, and a checkpoint first recomputes the objects it reads whose formulas changed. `--recompute` forces the same for named objects (or every object with formulas), to repair values left stale by earlier runs or manual edits.

`tests/genesis-capital-pack.test.js` resolves every reference in a pack (fields, stages, objects, roles, templates, formulas) so a typo fails CI rather than producing an inert automation.

## 12. Personal data protection

| Field config | Effect |
|---|---|
| `pii: true` | Masked (`•••• 1234`) for users without the `view_pii` operational permission. *Reveal* returns the value and writes an audit-chain entry. Saving a form never overwrites the stored value with its mask. |
| `encrypt: true` | Stored as `enc:v1:` AES-256-GCM ciphertext (key `FIELD_ENCRYPTION_KEY`); decrypted on typed reads, so formulas and the authorised UI see plain text. `scripts/encrypt-existing-fields.js` encrypts values stored before the flag was set. |
| object `config.audit_views: true` | Opening a record is recorded on the audit chain (PEP, STR, VIP records). |
| object `config.conceal_existence: true` | Related lists do not even count rows the viewer cannot see (no tipping-off for STRs). Otherwise hidden rows show as "N restricted — contact Compliance". |

Grant `view_pii` per role in *Builder ▸ Permissions ▸ Operational*.

## 13. Client and introducer portal

`/portal/<workspace>` is a separate sign-in realm. A one-time code goes to the email on the person's record; the session token (`gp1.`) is signed separately and the staff middleware never accepts it. Rate limits: 30 attempts per IP and 5 codes per email per 15 minutes.

What appears is object configuration:

```js
config.portal = {
  client: {
    title: 'Loan applications',
    link: 'party',                        // lookup that ties a row to the signed-in client
    fields: ['application_no', 'product_code', 'loan_amount', 'emi'],
    order: 'created_on',                  // optional sort field
    uploads: true,                        // documents can be uploaded to these records
    create: {                             // optional: the user can create records
      fields: ['request_type', 'description'],
      defaults: { channel: 'portal', received_on: '{{today}}' },
      stage: 'received',
      lookups: { loan_account: 'loan_account' },  // pickers limited to the user's own records
    },
    row_actions: [{                       // optional: a button on each row
      key: 'redeem', label: 'Redeem',
      object: 'fund_order',               // creates a record in another section of the same realm
      fields: ['units', 'amount'],        // what the user fills in
      prefill: { share_class: 'share_class' },  // target field ← this row's field (never from the request)
      defaults: { order_type: 'redemption' }, stage: 'captured',
    }],
  },
  introducer: {
    title: 'My referrals', link: 'introducer', fields: [ /* … */ ],
    consent_gate: 'consent_share_status', // show the stage only when the prospect agreed
  },
};
```

A row action (`POST /api/portal/records/:object/:id/actions/:key`) runs only on a row the signed-in user owns, and the values in `prefill` and `defaults` are set by the server, so a client cannot redeem another client's holding or change the order type.

Clients can also download documents in categories marked `portal_visible`, upload PDF, JPEG or PNG files (10 MB) against their own records, and message their owner (the message becomes an activity and a notification). In development, when SMTP is not configured, the sign-in code is returned to the page so the flow can be demonstrated.

## 14. Record merge, bulk reassign and `updated_by`

- **Merge** (`POST /api/runtime/records/:id/merge { into }`, managers only): fields empty on the survivor are filled from the duplicate; every lookup pointing at the duplicate is re-pointed; the duplicate goes to Trash. The change set is stored on the audit chain, and *Trash ▸ Reverse merge* undoes it within 30 days.
- **Bulk reassign** (`POST /api/runtime/records/bulk-assign`, managers only): moves records to an active employee; every change is audited.
- **`records.updated_by`**: stamped by edits, stage moves and bulk operations.

## 15. Sessions and two-factor authentication

- Access tokens are short-lived. `POST /api/auth/refresh` exchanges a refresh token for a new pair and retires the old token; replaying a retired token revokes the whole family (theft detection). The web app refreshes once on a 401, shared by concurrent requests.
- `employees.tokens_valid_after` revokes every token issued earlier. It is set by deactivation, password change and *Sign out everywhere*, and checked on every request (30-second cache per instance).
- **TOTP two-factor** (RFC 6238, any authenticator app): set up and turn off under *My account ▸ Security*; ten single-use recovery codes. When the security policy requires MFA, sign-in returns `mfa_required` (or `mfa_setup_required`) and a five-minute challenge token that only `/api/auth/mfa/*` accepts.

## 16. SMS, integration retries and the job queue

`send_sms` sends through an integration, so the gateway is configuration:

```js
{ step_type: 'send_sms', config: {
  integration: 'genesis_sms', to_field: 'party_mobile', language_field: 'preferred_language',
  message: 'Your instalment of MUR {{instalment}} is due on {{next_instalment_date}}.',
  message_fr: 'Votre mensualité de MUR {{instalment}} est due le {{next_instalment_date}}.',
  suppress_field: 'do_not_contact',
} }
```

When an `integration` or `send_sms` call fails for a reason a retry can fix, the engine queues it. The **durable job queue** (`job_queue` table) is worked every 15 seconds by every API instance:

- jobs are claimed atomically, so two instances never run the same job
- a job held by a crashed instance is released after 10 minutes
- failures back off exponentially: 30 s, 1 min, 2 min … up to 1 h
- after six attempts the job is parked as `dead`

When a retried call succeeds, its `field_map` is applied to the record. Configuration errors (unknown or inactive integration) are not retried. Queue depth by status is reported on `/health`.

## 17. Sandbox integrations

Integration type `simulator` with `config.provider` returns deterministic, realistic responses so workflows can be built and demonstrated before contracts exist: `screening` (hits by list), `mcib` (score, grade, report reference), `lms` (account number), `ta` (transfer-agent reference), `oms` (order reference, executed price), `fx_dealing` (deal reference) and `sms` (message id). Switching to the real system is a change of integration type and credentials; the workflows do not change.

## 18. Public data feeds

An object can publish chosen fields as a read-only feed for a website:

```js
config.public_feed = {
  name: 'fx-rates',
  fields: ['currency_code', 'buy_tt', 'sell_tt', 'rate_date'],
  latest_by: { group: 'currency_code', order: 'rate_date' },  // newest row per currency
  sort: { field: 'currency_code', dir: 'asc' },
  limit: 100,
};
```

A feed field may be a lookup path (Genesis Capital's `nav_history` publishes `class_code`, a formula over `share_class.class_code`), so a history feed can be joined to a latest-value feed on the website. Genesis Capital publishes `fx-rates`, `fund-nav`, `nav-history` (500 points, oldest first) and `plr`.

`GET /api/public/feeds/<workspace>/<name>` returns `{ feed, updated_at, items }`. It is cached for a minute on the server and five minutes by browsers, open to any origin, and rate limited per IP. Fields marked `pii` or `encrypt` are never published, even when listed.

## 19. Calendar feed

*My account ▸ Security ▸ Calendar feed* shows a private iCalendar URL (`/api/calendar/feed/<token>.ics`) to subscribe to from Outlook, Google or Apple Calendar. It lists the user's scheduled activities, open tasks with due dates and pending reminders, from 30 days back to 180 days ahead, plus dated records the user owns on any object that opts in:

```js
config.calendar = [
  { date_field: 'meeting_date', time_field: 'meeting_time', duration_min: 60, label: 'Meeting' }, // timed
  { date_field: 'follow_up_date', label: 'Follow up' },                                            // all-day
];
```

`time_field` holds a local `HH:MM` in the tenant's timezone. The token is signed over the user's revocation point, so *Sign out everywhere*, a password change or deactivation invalidates it.

## 20. French labels

Modules, objects, fields, pipelines and stages take `config.label_fr` (objects also `plural_label_fr`), and select options take `label_fr`. The header's **EN / FR** switch sets the user's language; runtime responses (`/api/runtime/*`) are then localised as they arrive, so every metadata-driven screen shows French where a translation exists. Builder screens read `/api/metadata/*` and always edit the English label. *Field ▸ Label (French)* edits the translation. Buttons and menus remain in English.

## 21. Daily formula refresh

Formulas that read the date (`TODAY`, `NOW`, `AGE`, and anything built on them) would go stale on records nobody edits. The `formula-refresh` scheduler recomputes them once a day, so flags such as "review due" or "days to maturity" stay correct and scheduled workflows see current values.

## 22. Containers and CI

| File | Purpose |
|---|---|
| `backend/Dockerfile` | Production API image: non-root, health check, runs `prisma migrate deploy` then starts |
| `frontend/Dockerfile`, `frontend/nginx.conf` | Static build served by nginx; `/api` proxied to the API; SPA fallback |
| `docker-compose.yml`, `.env.docker.example` | MySQL 8.4, Redis 7, API and web on `localhost:8080` |
| `.github/workflows/ci.yml` | Backend tests, frontend lint, tests and build, then both images |

## 23. Approvals inbox

Every `approval` workflow step (credit decisions, KYC sign-off, maker-checker on disbursements and fund orders,
gifts above a threshold…) creates a request that appears under **Tools ▸ Approvals** for the people it names:
*Waiting for me*, *All pending* (managers and administrators) and *My decisions*. Each request shows the record
(with a link), who asked and when, and the step's title and message. **Approve** resumes the workflow; **Reject**
takes its rejection path. Both accept a comment, record who decided and when, and write an entry to the record's
history. The approver list is fixed when the request is created, the maker is excluded (`exclude_actor`,
`exclude_field`), and only a listed approver can decide. The sidebar shows how many requests wait for the user;
notifications open the inbox at the request.

`GET /api/runtime/workflows/approvals?scope=mine|all|decided` · `POST /api/runtime/workflows/approval/:token { action, comment? }`

## 24. Record visibility per role

Object permissions carry a **Records** setting per role (`ui_permissions.view_scope`):

| Setting | The role sees |
|---|---|
| Own & team (default) | Records the user created or owns; managers also see records their team created or owns |
| All | Every record of the object |

Both are still limited by the user's business units and barrier zones, and administrators always see all records
(barriers still apply). Back-office desks — credit, operations, compliance, fund management, dealing — need
**All** on the objects they process; otherwise an approver cannot open the record they are asked to approve.
Reference data (products, funds, rates) is normally **All** for every role. Set it in **Builder ▸ Permissions ▸
object ▸ Records**, or in a pack with `{ object, roles, can_view, can_edit, view_scope: 'all' }`.

## 25. PDF documents

`utils/pdf.js` writes A4 PDFs without external dependencies: letterhead, headings, wrapped paragraphs, bullets,
tables and "Page n of N" footers, in Helvetica with WinAnsi encoding (English and French). Merge templates with
`format: 'pdf'` — or any HTML template whose document category does not accept HTML — render to PDF. The
`generate_document` workflow step passes display values: picklist labels instead of codes, grouped amounts, ISO
dates, `<field>_raw` for the stored value, and a letterhead built from the record's business unit (legal name,
`config.address`, licence).

## 26. Server-side defaults and immediate SLA timers

- Editing a record publishes `record.field_changed` with exactly the fields that changed (old and new values), so
  `field_changed` workflows on any field — not only the stage — run for Builder objects.
- A field's Builder **default value** is applied on every create path — website forms, workflows, imports and the
  API — not only in forms rendered in the browser. `{{today}}` resolves to the current date.
- SLA timers start (and stop) when a record is created or changes stage, through `SlaService.reconcileRecord`;
  the background sweep still runs every minute and now processes records concurrently.
- When a timer is created for a record that is already complete, the completion time is taken from the record's
  stage history (`status_events`) rather than the time the timer was created.

## 27. Document checklists and client upload links

**Checklist status.** `DocumentChecklistService.forRecord(id)` reads the active `ui_document_checklists` whose
`entity_type` is the record's object, the workspace's document categories and the record's documents, and returns each
item as `{ label, category, category_label, required, received, documents }` plus an `outstanding` count of required
items still missing. When an object has several checklists (real-estate, personal and investment-backed loans), the
one whose label shares most words with the record's picklist labels is chosen (`LND-RE` → *Real estate loan*); if
none matches, all are returned. A category used by several items is satisfied one document per item, in order.
Rejected and expired documents do not count as received, so the item reopens and the client's link asks for it again. The record's **Docs** tab shows this above the document list.

**Upload links.** A link is `/upload/gul1.<payload>.<sig>`: the payload is base64url JSON `{ t: tenant, r: record,
c?: checklist, e: expiry (unix seconds) }`, the signature an HMAC-SHA256 with `UPLOAD_LINK_SECRET` (default: derived
from `JWT_SECRET`), compared in constant time. Validity is 14 days by default, 1–60 when issued from the Docs tab.
Nothing is stored server-side, so a link cannot be revoked early; rotating the secret invalidates every link.

- Staff: `GET /api/upload-links/records/:id/checklist`, `POST /api/upload-links/records/:id { days?, checklist_id?,
  email? }`. Both first open the record through `RecordService.getRecord`, so a user can only issue links for
  records they can see. A record with no checklist cannot have a link (400). Emailed links go out in EN or FR,
  logged against the record; 30 per user per hour.
- Client: `GET /api/upload-links/:token` runs in the token's tenant and returns only item labels, categories and
  received flags — never file names, staff notes or other documents. `POST` accepts one file per call
  (`{ filename, mime_type, data: base64, category }`, body limit 15 MB): the category must be one the link requests,
  the type must be PDF, JPEG or PNG **and** the first bytes must match it, and the file must be under 10 MB (the
  category's own limit also applies). The file is stored through `DocumentService.upload` on the record with status
  *uploaded* (*under review* where the category requires review), no uploader and a description saying it came
  through a client link. Identical bytes are deduplicated. Rate limits: 120 reads and 30 uploads per IP per
  10 minutes.
- Workflows: `send_email` adds `{{upload_link}}` to its context, so a template such as `loan_document_request` can
  carry the link (`UploadLinkService.linkFor`, no database call).

The hosted page (`UploadPage.jsx`) wears the workspace theme, lists the items with *Needed* / *Received*, checks type
and size in the browser before sending, and refreshes after each upload.

## 28. Distribution lists and open tracking

The `email_list` workflow step sends one template to every member of a list held in another object — for example
the subscribers of a research publication:

```js
{ step_type: 'email_list', config: {
  template: 'research_publication',       // <template>_<lang> is used when it exists
  list_object: 'subscription',            // the list
  link_field: 'party',                    // list row → the person to email
  match: { topic: '{{publication_type}}' },  // list rows for this record (interpolated)
  active: { status: 'subscribed' },       // and only active rows
  language_field: 'preferred_language',   // on the person
  suppress_field: 'marketing_suppressed', // true → skipped
  track_field: 'opens',                   // integer field on this record counting opens
} }
```

Each person is emailed once even when several list rows point at them; people without an email address or with the
suppression flag set are skipped (a formula suppression flag is computed on read). Template variables are the
record's fields plus the recipient's `first_name` and `display_name`. Each email is logged with
`related_record_id` = the record and `related_type` = `distribution:<track_field>`; the step's log line reports how
many were sent and skipped. At most `limit` (default 2,000) list rows are read.

**Open tracking.** With `track_field`, each email carries a 1×1 image:
`<API_URL or APP_URL>/api/public/email-open/geo1.<payload>.<sig>.gif`. The payload names the tenant, the
record, the field and a truncated SHA-256 of the recipient's address — nothing readable about the person. Loading
it stamps `opened_at` on that recipient's first unopened log row and recounts the opens into the record field. The
endpoint always returns the GIF, valid or not, so it cannot be used to probe tokens; recording is rate limited per IP.
Image blocking and privacy proxies (Apple Mail) make open counts approximate: treat them as a trend, not a fact.

Genesis Capital uses this for **Send to subscribers** on `research_publication` (MKT-FR-04, SEC-FR-05), which then
sets `sent`.

## 29. Website preview

`/site/:slug` (no sign-in) renders what a website built on the public feeds and forms shows: the exchange-rate board
(the base currency's row against itself is left out), the prime lending rate, fund NAVs with a performance chart
from `nav-history` (click a fund to chart it), and cards for every published form. It reads only
`/api/public/feeds/:slug/*` and `/api/public/workspaces/:slug/forms`, and wears the workspace theme. Its purpose is to
show a client's web team what they can embed; it is not a CMS.

## 30. Fixes made alongside

| Defect | Effect before | Fix |
|---|---|---|
| Scoped updates trusted `data.tenant_id` | A request body carrying `tenant_id` could move a module/object/field/form row into another tenant | Tenant extension pins `data.tenant_id` (and an upsert's `update`) to the context tenant; module/object/form writes take column whitelists |
| `GET /api/documents/record/:id` and per-document routes ignored record access | Any user could list/download documents of records they could not open | Documents attached to a record inherit its visibility (`docGuard`) |
| Rule-based assignment read only `crm_*` columns | Conditions on custom objects never matched; everything went to the fallback | Assignment reads typed field values too |
| Auto-number padded to 3 digits and ignored `format` | After 999 the string sort reissued numbers; two objects with a same-named field shared a sequence | Width from the format's trailing `N`s; sequence scoped to the object |
| `custom` validation executed admin JavaScript in browsers | Stored XSS across users | Retired; `expression` rules on the server |
| Forged-token test flipped the last base64url character | Flaky (~1 in 12) because padding bits can make the forgery valid | Tampers a middle character |
| `RateLimitedError` lived inside the auth routes | Not reusable; a second limiter would have thrown `undefined` | Moved to `utils/errors` |
| Dashboard KPI tiles ignored the widget format | Raw numbers, and "$" in a MUR workspace | Tiles use the widget's `format`/`decimals` and the workspace currency, compacted |
| Charts grouped by a text period sorted by value | Months out of order on a revenue trend | Keys shaped `YYYY`, `YYYY-MM`, `YYYY-MM-DD` or `YYYY-Qn` sort by time |
| Fixed-width chart value axis | Long labels ("MUR 28M") clipped | Axis width follows the longest formatted label |
