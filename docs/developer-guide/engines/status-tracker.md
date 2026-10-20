# Status Tracker — How to Create the Stepper

<!-- nav:top -->
> **[Docs roadmap](../../README.md)** › **[Engine references](README.md)** › 12 of 12 · **For:** Engineers, administrators
> ← [Application settings](application-settings.md) · [Ask Genesis (what is built)](../ai-reporting/ask-genesis.md) *(AI reporting)* →
> New to Genesis? Background: [Understanding Genesis › The building blocks](../../understanding/02-building-blocks.md)
<!-- /nav:top -->

The `status_tracker` is a **display-only fieldtype** that renders a
logistics-style status timeline (Amazon / UPS / Bluedart package tracking) for a
record. It has three layers:

1. **Milestone stepper** — the whole lifecycle at a glance, with the date/time
   each milestone was reached shown under each step.
2. **Current-status banner** — the latest event, highlighted (status, time,
   location).
3. **Dated event log** — every event, newest first, grouped by day, each with
   time, location, and description.

It is wired generically into the metadata-driven form pipeline, so you add it to
any object's form and it renders on that object's **edit** screen with no
per-screen code.

---

## How it fits together

| Piece | File | Role |
| --- | --- | --- |
| Fieldtype registration | `frontend/src/utils/constants.js` | Adds `status_tracker` to `FIELD_TYPES` |
| Renderer dispatch | `frontend/src/components/runtime/FieldRenderer.jsx` | Maps `status_tracker` → `<StatusTracker>` |
| Component | `frontend/src/components/ui/StatusTracker.jsx` | Stepper + banner + dated log |
| Stepper | `frontend/src/components/ui/StatusStepper.jsx` | Milestone steps with per-step `subLabels` |
| API client | `frontend/src/services/statusEvent.service.js` | `GET` / `POST` status events |
| Events table | `backend/prisma/schema.prisma` → `StatusEvent` | One row per timeline event |
| Service | `backend/src/services/record.service.js` | `listStatusEvents`, `addStatusEvent`, auto-capture |
| Routes | `backend/src/routes/runtime/index.js` | `/records/:id/status-events` |

The component reads events from `GET /api/runtime/records/:id/status-events`; the
milestones come from the field's `config.stages`. `FormRenderer` threads
`recordId` into `FieldRenderer`, so the timeline shows in **edit** mode and falls
back to a "saved record required" placeholder during create.

---

## Steps to add a stepper to an object

These steps assume the platform pieces above already exist (they do). You are
configuring a `status_tracker` field on a specific object.

### 1. Define the milestones

Decide the ordered lifecycle stages. Ideally each `value` matches a pipeline
stage `name` on the object so auto-capture lines up (see step 4). Example for a
support case:

```js
const stages = [
  { value: 'new',             label: 'New',             color: '#6366f1' },
  { value: 'in_progress',     label: 'In Progress',     color: '#f59e0b' },
  { value: 'waiting',         label: 'Waiting on Customer', color: '#a855f7' },
  { value: 'resolved',        label: 'Resolved',        color: '#10b981' },
  { value: 'closed',          label: 'Closed',          color: '#0ea5e9' },
];
```

### 2. Create the `status_tracker` field on the object

Create a `ui_fields` row. Key values:

- `field_type`: `status_tracker`
- `data_type`: `none` (it captures no input)
- `is_searchable` / `is_sortable`: `false`
- `config`: `{ stages, variant: 'steps', title: 'Application Tracking' }`

`config` options:

- `stages` — the ordered milestone array from step 1 (required to draw the
  stepper).
- `variant` — `steps` (default, recommended), `bar`, or `pills`.
- `title` — heading shown above the tracker; falls back to the field label.

### 3. Attach the field to the object's form(s)

Create a `ui_form_field_layout` row linking the field to the form. Use a full
width column span and a high `order_index` so it renders at the bottom:

- `col_span`: the form's `columns` value (so it spans the full grid)
- `row` / `order_index`: high (e.g. `99` / `999`)
- `is_visible`: `true`

The field renders only on the object's **edit** form (it needs a saved
`recordId`). On the create form it shows the placeholder.

### 4. Populate timeline events

Events drive everything below the stepper. There are two sources:

- **Automatic** — `RecordService.updateRecordStage` appends a `milestone` event
  on every pipeline stage change. Bulk stage moves (`bulkUpdateStage`) behave
  exactly like a single move and write the event too. So once a record moves through its pipeline, the timeline fills in
  by itself. This is why milestone `value`s should match
  pipeline stage `name`s.
- **Manual** — `POST /api/runtime/records/:id/status-events` with a body of
  `{ status, title?, description?, location?, event_type?, occurred_at? }`. Use
  this for richer events (a courier-style scan with a location, an exception,
  etc.).

`event_type` is one of `milestone | scan | note | exception` (controls the
timeline icon).

### 5. View it

Open a record of the object → **Edit** → scroll to the tracker section. The
current status is derived from the most recent event.

---

## API reference

```text
GET  /api/runtime/records/:id/status-events
     → 200 { success: true, data: [ ...events ] }   // newest-first

POST /api/runtime/records/:id/status-events
     body: { status, title?, description?, location?, event_type?, occurred_at? }
     → 200 { success: true, data: <created event> }
```

Both require authentication and enforce that the caller can access the record.
`POST` additionally requires edit permission on the object.

The `StatusEvent` row shape:

| Column | Notes |
| --- | --- |
| `status` | Milestone key — should match a `config.stages` value |
| `title` | Human label, e.g. "Out for delivery" |
| `description` | Free-text detail |
| `location` | Optional, e.g. "Mumbai Hub, IN" |
| `event_type` | `milestone` \| `scan` \| `note` \| `exception` |
| `occurred_at` | Drives timeline ordering and the displayed time |
| `changed_by` | Employee id (resolved to a name on read) |

---

## Troubleshooting

- **Stepper shows but no dates / empty log.** The record has no status events
  yet. The stepper draws from static `config.stages`, but the banner, dated log,
  and per-step dates all need events. Move the record through a pipeline stage
  (auto-capture) or `POST` an event.
- **Tracker not showing at all.** It only renders in **edit** mode. In create
  mode it shows the "saved record required" placeholder.
- **Field renders as a text box.** The form metadata predates the field — clear
  the server metadata cache (it is tenant-scoped under `genesis:t<id>:*`) or
  restart, then reload the browser's metadata store (it is persisted in
  `localStorage` under `genesis-metadata`; signing out and in clears it).
- **Changes not visible in the browser.** Hard-refresh (Cmd+Shift+R) to clear
  the cached bundle and the React Query cache (`staleTime` is 5 minutes).

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Ask Genesis (what is built)](../ai-reporting/ask-genesis.md) *(AI reporting)* — Natural-language reporting on a local model: how it works and how to run it |
| **Previous** | [Application settings](application-settings.md) |
| **Background** | [Understanding Genesis › The building blocks](../../understanding/02-building-blocks.md) |
| **Lost?** | [Docs roadmap](../../README.md) · [Engine references](README.md) · [Understanding Genesis](../../understanding/README.md) |
<!-- /nav:bottom -->
