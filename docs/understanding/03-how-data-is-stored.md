# Step 3 — How data is stored and read

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Understanding Genesis](README.md)** › 3 of 8 · **For:** Everyone (Part B: engineers)
> ← [Step 2 — The building blocks](02-building-blocks.md) · [Step 4 — How a request travels](04-how-a-request-travels.md) →
<!-- /nav:top -->

> **Track:** both. Part A is for everyone; Part B adds the technical detail.
> **Time:** 20 minutes.

## Part A — The idea in plain terms

### A CRM that has no "clients table"

Most business systems have one database table per thing they track: a `clients` table with a column for each client
detail, a `loans` table with a column for each loan detail, and so on. Adding a new detail ("risk rating") means a
developer changes the table.

Genesis does not work that way, because administrators must be able to invent new things to track, and new details
for them, from the browser (Step 2). So Genesis stores business data the way a **form-filing cabinet** works:

| Cabinet idea | In Genesis | Table |
|---|---|---|
| The **blank form templates** — which forms exist, which boxes each has, which box takes a date | The blueprint: objects and fields | `ui_objects`, `ui_fields` (+ forms, pipelines…) |
| A **folder** for each filled-in form, with a label: what form it is, who owns it, which tray it sits in | The record "envelope" | `records` |
| The **answers written in the boxes**, one slip per box | The field values | `record_field_values` |

### One real example

Here is a client from the demo data, exactly as it sits in the database:

```text
BLUEPRINT                         ENVELOPE (1 row)                 VALUES (1 row per filled-in box)
─────────                         ────────────────                 ───────────────────────────────────────
ui_objects                        records                          record_field_values
  id 12, name "party"      ◄────    id 3055                 ◄────    3055 · display_name         = "Lina Chan"
                                    object = 12 (a party)            3055 · date_of_birth        = 1991-02-18
ui_fields                           tenant = 7                       3055 · aum_mur              = 64,600,000
  party.display_name (text)         owner  = GCRM1                   3055 · country_of_residence = "MU"
  party.date_of_birth (date)        stage, created, deleted?         3055 · do_not_contact       = false
  party.aum_mur (number)                                             … about 40 rows for this client
```

So one client is **one envelope plus one row per filled-in field**. Empty fields have no row at all.

### Saving and opening a record

**When someone saves a form**, Genesis:

1. looks up the blueprint to know which fields this kind of record has and what each must contain;
2. checks the values (required fields, formats, the admin's rules) — if anything fails, nothing is saved;
3. writes the envelope;
4. writes one value row per filled-in field;
5. tells the rest of the system "a record was created" so automations can react (Step 6).

**When someone opens a list** (say, all clients), Genesis:

1. finds the envelopes for that kind of record that this person is allowed to see (Step 5);
2. fetches all their value rows in one go;
3. regroups the rows by record, so the screen gets the familiar "one line per client, one column per field" shape.

### How records link to each other

A link between records is just another field. A KYC case has a field `party`; its value is the id of the client's
envelope (`3055`). Opening the KYC case shows "Lina Chan" because Genesis follows that id and reads the client's name.

### Not everything is stored this way

The cabinet holds **business records** — everything an administrator can define. Things whose shape is fixed and
built into the product have ordinary tables of their own:

| What | Where |
|---|---|
| Staff users, passwords, two-step sign-in | `employees`, `auth_refresh_tokens` |
| Tasks, reminders, logged calls and notes, notifications | `tasks`, `reminders`, `activities`, `notifications` — each points at a record |
| Uploaded documents | `documents` and related tables |
| History of every change | `audit_logs`, `audit_chain_events`, `status_events` |
| Timers, reports, dashboards, rules | their own tables (SLA, reports, dashboards, assignment…) |
| The customer workspaces themselves | `tenants` and the platform tables |

### Why it is built this way — and what it costs

This is a standard design for configurable, multi-customer software. It is how **Salesforce** stores custom objects
(one shared data table with generic value columns, plus separate tables to index values and track relationships), and
the same entity-attribute-value idea is used by Magento for product attributes. Systems that instead create a real
table per object, such as Microsoft Dataverse (Dynamics 365), give each customer its own database to make that safe.

| Gain | Cost |
|---|---|
| Admins add objects and fields instantly, with no database change and no downtime | One record is spread over many rows, so reading or reporting has to regroup them |
| Every customer can have a different data model in the same database | The database cannot enforce links or uniqueness by itself; the application does it |
| One set of engines (forms, workflows, reports, search) works for every object | Ad-hoc SQL is more awkward (see the recipes in Part B) |

At Genesis's current size (about 4,000 records and 63,000 values in the demo) none of the costs is a performance
problem. They matter at millions of rows, which is when systems like Salesforce add their extra index tables.

---

## Part B — Technical detail

### The three layers, precisely

| Layer | Tables | Key columns |
|---|---|---|
| Blueprint | `ui_modules` → `ui_objects` → `ui_fields`; also `ui_forms`, `ui_form_field_layouts`, `ui_validations`, `ui_pipelines`, `ui_pipeline_stages` | `ui_fields.name`, `field_type`, `data_type`, `config` (JSON: lookup target, formula, encryption, auto-number…) |
| Envelope | `records` | `id`, `object_id`, `tenant_id`, `assigned_to`, `pipeline_stage_id`, `created_by/at`, `updated_by/at`, `deleted_at/by`, `business_unit_id`, `barrier_zone_id` |
| Values | `record_field_values` | `record_id`, `field_name`, `str_value`, `num_value`, `bool_value`, `date_value`, `json_value`, `tenant_id`; UNIQUE (`record_id`, `field_name`) |

Notes on values:

- `str_value` is **always** written, also for numbers, dates and booleans; the matching typed column is written as well.
  Read `str_value` when unsure; use the typed column to sort, sum or compare.
- A `lookup` stores the target `records.id` in `num_value` and `str_value`. The target object is
  `ui_fields.config.target_object`. There is no foreign key.
- Fields with `config.encrypt` hold `enc:v1:…` ciphertext in `str_value` (decrypted by `field-protection.js`).
- Formula results and roll-ups are computed by the server when a record is saved (and daily for date-based formulas)
  and **stored** as ordinary value rows, so lists and dashboards read them like any other field.
- `field_name` matches `ui_fields.name` by name; there is no `field_id` column.

### Where the code decides

[`crm-storage-map.js`](../../backend/src/services/crm-storage-map.js) maps an object's `ui_objects.name` to its store:

| Object name | Field values go to |
|---|---|
| `lead`, `prospect` | `crm_leads` (+ extra fields to `record_field_values`) |
| `lead_intake` | `crm_lead_intake` (+ extra fields) |
| `contact`, `account`, `opportunity`, `case` | `crm_contacts`, `crm_accounts`, `crm_opportunities`, `crm_cases` (+ extra fields) |
| **any other name** | `record_field_values` only |

The Genesis Capital workspace has no object with a reserved name, so **all of its business data is in `records` +
`record_field_values`, and the `crm_*` tables are empty.** They are a typed store kept for tenants that define those
standard objects.

### Write path — `RecordService.createRecord`

```text
POST /api/runtime/records { object_id, stage_id?, data }
  1  #assertObjectEditPermission         may this role create on this object?
  2  #withDefaults → applyFormulas → #assertValid     rejected ⇒ nothing written
  3  #generateAutoNumbers (then formulas again)
  4  records.create  { object_id, tenant_id, created_by, assigned_to, first stage, BU/barrier stamps }
  5  #upsertCrmEntity → routes by object name (table above)
        record_field_values: createMany for new fields, then upserts 5 at a time for existing ones
  6  audit log (fire-and-forget) · assignment rules · emit 'record.created' · lead scoring · parent roll-ups
```

Steps 4 and 5 are separate writes with no wrapping transaction; each write is atomic on its own.
`updateRecord` follows the same shape, writing only changed fields. Deleting moves the record to the Trash
(`deleted_at`) unless the object's pipeline is set to hard delete; a hard delete cascades to its value rows.

### Read path — `RecordService.getRecords`

```text
GET /api/runtime/records?object_id=X[&stage_id=&limit=&offset=]
  1  records.findMany { object_id, deleted_at: null, ...owner filter for the viewer }  newest first
  2  #hydrateMany: one parallel batch keyed by those record ids
        record_field_values rows  +  the typed crm_*/product/email_template rows (empty for Genesis Capital)
        data = { ...values, ...non-null typed columns }
  3  #attachLookupLabels   lookup ids → the target record's title
  4  #maskPii              protected fields masked for viewers without access
```

`fromTypedRow` turns each row back into a JavaScript value (`json > date > bool > num > str`). A single record
(`getRecord`) uses the same steps for one id.

### Other readers of the same data

| Reader | How it reads business records |
|---|---|
| Dashboards (object widgets) — `object-analytics.service.js` | Envelopes + value rows in chunks of 1,000, filtered and grouped in memory; capped at 20,000 records |
| Global search — `search.service.js` | `str_value` contains the search text, only on fields marked searchable; same visibility rules as lists |
| Workflows — `workflow.service.js` | Same storage map as the API; field writes go straight to the value rows |
| Self-service report builder — `report-registry.js` | **Does not read them.** Its sources are fixed typed tables (leads, accounts, opportunities, cases, tasks, activities, SLA timers) |
| Portal — `portal.service.js` | Value rows of the objects configured for the portal, linked to the signed-in client |

### Querying it yourself with SQL

```sql
-- Record types and how many live records each has
SELECT o.name, o.label, COUNT(r.id) AS records
FROM ui_objects o JOIN records r ON r.object_id = o.id AND r.deleted_at IS NULL
GROUP BY o.id ORDER BY records DESC;

-- One line per record, fields as columns (add one MAX(CASE …) per field you want)
SELECT r.id, r.assigned_to, s.label AS stage,
  MAX(CASE WHEN v.field_name = 'display_name' THEN v.str_value END) AS name,
  MAX(CASE WHEN v.field_name = 'aum_mur'      THEN v.num_value END) AS aum
FROM records r
JOIN ui_objects o ON o.id = r.object_id AND o.name = 'party'
LEFT JOIN ui_pipeline_stages s ON s.id = r.pipeline_stage_id
LEFT JOIN record_field_values v ON v.record_id = r.id
WHERE r.deleted_at IS NULL
GROUP BY r.id, s.label;

-- Follow a lookup: each KYC case with its client's name
SELECT k.record_id AS kyc_case, p.str_value AS client
FROM record_field_values k
JOIN record_field_values p ON p.record_id = k.num_value AND p.field_name = 'display_name'
JOIN records r ON r.id = k.record_id
JOIN ui_objects o ON o.id = r.object_id AND o.name = 'kyc_case'
WHERE k.field_name = 'party';
```

More recipes and every column: [DATABASE_SCHEMA › Where record data lives](../developer-guide/database-schema.md#where-record-data-lives-and-querying-it-with-sql).

### Known weak spots

These follow from the design, and are the improvements worth making before the data grows (none needs the data to be
split into per-object tables):

| Weak spot | Effect | Suggested fix |
|---|---|---|
| Lookups have no foreign key | Deleting a target leaves dangling ids; the app's merge/delete guards handle the known cases | A `record_links` table with real foreign keys |
| Uniqueness is checked by the app, not the database | Two simultaneous saves could both pass a "must be unique" check | A unique-values table with a database unique index |
| Portal sign-in finds the client by the `email` value | Editing a client's email changes who can sign in; duplicate emails are not prevented | A dedicated portal-identity table with a unique email |
| Lists read every value of every listed record | Fine today; heavy at very large volumes | Value indexes, or reporting tables refreshed from the values |
| The report builder only knows typed tables | Genesis Capital's objects cannot be reported on in Reports, only on dashboards | A report source generated from each object's blueprint |

## Go deeper

| If you are | Read next |
|---|---|
| Administrators | [Modules & objects](../builder-guide/01-modules-and-objects.md) (fields) · [Reports](../using-the-crm/reports.md) (which data reports can use) · [Dashboard builder](../builder-guide/05-dashboard-builder.md) |
| Engineers | [Database schema › record data and SQL](../developer-guide/database-schema.md#where-record-data-lives-and-querying-it-with-sql) · [Data dictionary](../developer-guide/data-dictionary.md) · [Runtime loading pipeline](../developer-guide/architecture-and-setup.md#runtime-data-loading-pipeline) |

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Step 4 — How a request travels](04-how-a-request-travels.md) — Sign-in, tokens, the tenant filter on every query, API groups, caching |
| **Previous** | [Step 2 — The building blocks](02-building-blocks.md) |
| **On these journeys** | [Decision-maker](../README.md#decision-maker) (step 5 of 8) |
| **Lost?** | [Docs roadmap](../README.md) · [Understanding Genesis](README.md) · [Understanding Genesis](README.md) |
<!-- /nav:bottom -->
