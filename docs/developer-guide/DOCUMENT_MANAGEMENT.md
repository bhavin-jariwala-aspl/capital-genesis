# Document Management System (DMS)

> Status: **Implemented — standalone module**
> Storage backends: local disk · Amazon S3 (and S3-compatible) · Azure Blob · Google Cloud Storage
> Scope: a domain-neutral document platform used by the whole CRM — generic attachments,
> auto-archived reports, generated documents, and e-signed documents.

The DMS started life inside the former INSURANCE domain (removed 2026-10-13) and is now a
**standalone, configurable, top-level module** with its own navigation, an admin **builder**, pluggable multi-cloud
storage, folders, full-text search, public sharing with engagement analytics, merge
templates, and native e-signature.

The DMS is assembled by the following migrations:

| Migration | Adds |
|---|---|
| `20260702120000_unify_document_storage` | The unified `documents` table + storage abstraction |
| `20260713120000_add_document_builder_config` | `ui_document_categories`, `ui_document_checklists` |
| `20260713140000_add_document_folders_and_fulltext` | `document_folders`, `documents.folder_id`, `documents.content_text` + FULLTEXT index |
| `20260713160000_add_document_share_tracking` | `document_share_links`, `document_view_events` |
| `20260713180000_add_document_templates` | `document_templates` |
| `20260713200000_add_document_signatures` | `document_signature_requests`, `document_signatories` |

---

## 1. Architecture

```text
   Navigation / UI                Route layer                    Service layer                     Storage layer
 ┌──────────────────┐   ┌────────────────────────────┐   ┌───────────────────────────┐   ┌──────────────────────────┐
 │ /documents        │   │ /api/documents/*            │   │ DocumentService            │   │ StorageProvider          │
 │  (standalone)     │──▶│  upload/list/get/download   │──▶│  atomic upload, dedup,     │──▶│  (interface)             │
 │ /builder/documents│   │  folders, shares, analytics │   │  versioning, soft-delete,  │   │   ├ LocalStorageProvider │
 │  (admin builder)  │   │  templates, e-signature     │   │  review, full-text extract │   │   ├ S3StorageProvider    │
 │ /share/:token     │   │  public share + sign        │   │ DocumentFolderService      │   │   ├ AzureBlobStorage…    │
 │ /sign/:token      │   │ /api/builder/document-*      │   │ DocumentConfigService      │   │   └ GcsStorageProvider   │
 │  (public)         │   │  categories/checklists/tpl  │   │ DocumentShareService       │   └──────────────────────────┘
 └──────────────────┘   └────────────────────────────┘   │ DocumentTemplateService    │              │
                                                          │ DocumentSignatureService   │   {tenant}/{entity}/{id}/
                                                          └───────────────────────────┘   {category}/{uuid}_{file}
```

**Design rule (unchanged):** nothing outside the storage layer ever calls `fs` or a cloud
SDK directly, or builds a path. All byte I/O goes through a `StorageProvider`; all metadata
goes through the document services. Callers only ever handle **relative keys**.

### Key components

| Component | File | Responsibility |
|---|---|---|
| `StorageProvider` | `backend/src/services/storage/StorageProvider.js` | Abstract blob interface (`put/get/getStream/delete/exists`) |
| `LocalStorageProvider` | `backend/src/services/storage/LocalStorageProvider.js` | Local disk: atomic writes, path containment |
| `S3StorageProvider` | `backend/src/services/storage/S3StorageProvider.js` | Amazon S3 **and** S3-compatible (MinIO, R2, B2, Spaces, Wasabi) |
| `AzureBlobStorageProvider` | `backend/src/services/storage/AzureBlobStorageProvider.js` | Azure Blob Storage |
| `GcsStorageProvider` | `backend/src/services/storage/GcsStorageProvider.js` | Google Cloud Storage |
| Factory + keys | `backend/src/services/storage/index.js`, `objectKey.js` | Driver selection, canonical key builder, SHA-256, shared object-key mapping |
| `DocumentService` | `backend/src/services/document.service.js` | Upload/list/get/review/delete/GC + per-category policy + text extraction + full-text search |
| `DocumentConfigService` | `backend/src/services/document-config.service.js` | Builder config: categories + required-document checklists |
| `DocumentFolderService` | `backend/src/services/document-folder.service.js` | Hierarchical folders (materialised paths) |
| `DocumentShareService` | `backend/src/services/document-share.service.js` | Public share links + engagement events + analytics |
| `DocumentTemplateService` | `backend/src/services/document-template.service.js` | Merge templates + render-to-document |
| `DocumentSignatureService` | `backend/src/services/document-signature.service.js` | Native e-signature + certificate generation |
| Text extraction | `backend/src/services/document-text.js` | pdf/docx/txt → plain text for search |

---

## 2. Storage layer & providers

Every document is stored under a **tenant-first, relative key**:

```text
{tenant_id}/{entity_type}/{entity_id}/{category}/{uuid}_{sanitized_filename}
```

Example: `7/opportunity/42/contract/49f3c13135ba16c0_signed_contract.pdf`

The `stored_key` column holds this **relative** key — never an absolute path or a provider
URL — which is what makes the backend swappable with **no database or code changes**. Object
providers additionally prepend an optional bucket/container prefix via the shared
`toObjectKey()` helper (which also blocks path traversal).

### Supported drivers

| `STORAGE_DRIVER` | Provider | Notes |
|---|---|---|
| `local` (default) | `LocalStorageProvider` | Filesystem under `STORAGE_ROOT`. Atomic temp-file → fsync → rename; path-traversal contained. Works with any mounted NFS/SMB/SAN volume. |
| `s3` | `S3StorageProvider` | Amazon S3. Also **any S3-compatible** store by setting `STORAGE_S3_ENDPOINT` (+ `STORAGE_S3_FORCE_PATH_STYLE=true` for MinIO): Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Wasabi, on-prem MinIO/Ceph. Credentials optional → default AWS credential chain (IAM role). |
| `azure` | `AzureBlobStorageProvider` | Azure Blob. Connection string, or account + account key. |
| `gcs` | `GcsStorageProvider` | Google Cloud Storage. Service-account key file, or Application Default Credentials (Workload Identity). |

The three cloud SDKs (`@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage`)
are **lazily required** — a deployment only needs the one SDK for its selected driver
installed. `@aws-sdk/client-s3` ships as a dependency (AWS is provisioned); Azure/GCS are
drop-in: `npm install` the SDK and set the env. Selecting a driver whose SDK is missing fails
fast with an explicit "run npm install …" message.

### Adding another provider

Implement the five-method `StorageProvider` interface in one new class, add a `case` to the
`getStorage()` factory, and add a config block. No route, service, or DB change — everything
speaks relative keys.

---

## 3. Deployment scenarios

### "The client wants a different cloud provider"

- **S3-compatible (R2, B2, Spaces, Wasabi, Oracle/IBM):** config only — set `STORAGE_DRIVER=s3`
  with `STORAGE_S3_ENDPOINT` and credentials. No new code.
- **Azure Blob / Google Cloud Storage:** set `STORAGE_DRIVER=azure|gcs`, install that SDK,
  set the driver's env block. Providers already ship.

### "The client wants to host on-premise"

| Need | How | Code change |
|---|---|---|
| Files on a local disk / NFS / SAN mount | `STORAGE_DRIVER=local`, point `STORAGE_ROOT` at the mount | none |
| On-prem object storage (MinIO, Ceph RGW) | `STORAGE_DRIVER=s3` + `STORAGE_S3_ENDPOINT=https://minio.internal` + `STORAGE_S3_FORCE_PATH_STYLE=true` | none |
| Whole stack on-prem | Repoint `DATABASE_URL` (MySQL), `REDIS_HOST` (Redis), and storage env — all self-hostable | none |

The stack (Node/Fastify + Prisma + MySQL + Redis) is fully self-hostable; moving off AWS is a
configuration exercise, not a rewrite.

> **Caveat:** all providers stream bytes *through* the app on download (uniform, works
> everywhere). A per-provider presigned-URL redirect can be added later as an optimisation for
> very large files — additive inside the provider class, nothing else changes.

---

## 4. Guarantees

| Guarantee | How it's enforced |
|---|---|
| Atomic writes | Local: temp-file → fsync → rename. Object stores: `put` only exposes a fully-written object. |
| Atomic create (no orphan rows) | Blob written first, then the row; a failed insert deletes the blob (compensating action). |
| Atomic delete | Soft-delete (`deleted_at`) is source of truth; blob removed best-effort; `purgeDeleted()` reclaims stragglers. |
| Integrity + dedup | SHA-256 per file; identical bytes for the same owner return the existing document. |
| Versioning | Re-uploading a same-named file to the same owner increments `version`. |
| Ownership follows record merge | Merging a duplicate record moves its documents to the surviving record; unmerge moves exactly those back (documents added to the survivor since stay). |
| Path-traversal safe | Local: resolved path asserted under root. Object: `..` segments rejected (`toObjectKey`). |
| Tenant isolation | Prisma tenant extension scopes every query; storage keys are tenant-first. Public share/sign routes carry no tenant context and resolve by **unguessable token**, stamping `tenant_id` explicitly on writes. |

---

## 5. Data model

**`documents`** (core) — adds `folder_id` (organising folder) and `content_text` (extracted
plain text for search; never returned over the API) to the columns already documented: owner
(`entity_type`/`entity_id`), `stored_key`, `file_size`/`mime_type`/`file_hash`,
`category`, `version`, `status`, `is_public`, review + soft-delete + `tenant_id`, plus a
`documents_fulltext` FULLTEXT index over `(original_filename, description, content_text)`.

Configuration and feature tables:

| Table | Purpose |
|---|---|
| `ui_document_categories` | Builder-configured categories: per-category allowed MIME, size cap, retention, `review_required`, `is_required` |
| `ui_document_checklists` | Required-document checklists per entity type (JSON list of category codes) |
| `document_folders` | Self-referential folder tree with a materialised `path` |
| `document_share_links` | Shareable, optionally-expiring public links (token, `allow_download`, `view_count`, `expires_at`) |
| `document_view_events` | Per-open/download engagement events (type, IP, user-agent, timestamp) |
| `document_templates` | Merge templates (`body` with `{{placeholders}}`, `format`, `output_category`) |
| `document_signature_requests` | E-signature requests (status, ordered, expiry, certificate doc id) |
| `document_signatories` | Signers (name, email, order, status, signing token, signature data) |

---

## 6. Features

### Standalone module
A domain-neutral **Documents** page (`/documents`) with its own top-level sidebar section,
built on the generic `/api/documents` API. Stats, category + full-text filters, a folder rail,
and per-row view/download/share/sign/delete actions.

### Document Management builder (`/builder/documents`, admin)
Configure the DMS without code:

- **Categories** — machine code + label, per-category allowed MIME types, max size, retention,
  "requires review" (uploads land in `under_review`), "required document", colour.
- **Checklists** — required-document sets per entity type (e.g. `opportunity`).
- **Merge templates** — see below.

Uploads consult the matching category at write time and enforce its MIME allow-list / size cap
and review policy (`DocumentService.upload`).

### Folders
Hierarchical, per-tenant folders with materialised paths (`/Contracts/2026`). Create, rename,
move (with descendant re-pathing and cycle protection), and delete (children cascade;
documents fall back to *Unfiled*, never destroyed). Filter documents by folder or *Unfiled*.

### Full-text search
On upload, text is extracted from **PDF** (`pdf-parse`), **DOCX** (`mammoth`), and **text/csv**
into `documents.content_text` (best-effort, capped, never blocks the upload). Search matches
both metadata (filename/reference/description, `LIKE`) and document **contents** via a MySQL
`FULLTEXT` `MATCH … AGAINST` query (tenant-scoped explicitly, since the raw query bypasses the
Prisma extension).

### Sharing & engagement analytics
Mint shareable, optionally-expiring **public links** (`/share/:token`); optional
download-disable. Every open and download is recorded as an event with IP/user-agent/time; the
Share & Analytics modal shows view/download counts, active links, and recent activity.

### In-app preview
A **Preview** action sits next to every Download, rendering a document inline before download.
`document-preview.js` classifies by MIME into four render kinds: **native** (pdf/image → original
bytes served inline), **text** (text/csv/json → UTF-8), **convert** (`.docx` → mammoth HTML;
`.xlsx`/`.xls` → SheetJS HTML tables), and **unsupported** (e.g. `.pptx` → a graceful notice page).
Heavy parsers are lazy-required; any conversion failure degrades to the notice rather than 500ing.
Converted/text/notice responses are served with `Content-Security-Policy: sandbox` and rendered in
a sandboxed iframe, so converted or user-supplied markup can never execute script. The public
preview endpoint is usable directly as an `<iframe src>`; the authenticated one is fetched as a
blob (a CSP header can't ride a `blob:` URL, so the client applies the iframe `sandbox` attribute).
A tenant toggle — **BUILDER › Document Management → Show the "Preview" button**
(`documents.show_preview_button`, default on, stored in `tenant_configs`) — gates the button
everywhere and is surfaced to public links as `allow_preview` in the share metadata.

### Merge templates
Reusable HTML/text templates with `{{placeholder}}` and `{{dot.path}}` tokens. A logic-free,
injection-safe merge engine fills them from a context object. **Preview** renders without
storing; **render** stores the merged output as a first-class Document (versioned, searchable,
shareable). Managed in the builder with live placeholder detection.

### Native e-signature
Create a signature request with one or more signers (optional signing order). Each signer gets
an unguessable link (`/sign/:token`) to review the document and sign by **drawing** (canvas) or
**typing** their name, or to decline. When all have signed, an HTML **signature certificate**
(audit trail of signers, timestamps, IPs, signature images) is generated as a Document — inside
the request's tenant context so it stays tenant-scoped even though signing is public. Track
per-signer status and copy signing links from the "Request Signatures" modal. No external
provider or account required; a certified provider (DocuSign/Dropbox Sign) can be added later
behind the same request/signatory model.

---

## 7. API surface

### Generic — `/api/documents` (auth required)

| Method | Path | Notes |
|---|---|---|
| POST | `/upload` | `{ filename, mime_type, data(base64), category?, description?, folder_id?, related_record_id?, related_type? }` |
| GET | `/` | filter by `related_record_id`, `related_type`, `category`, `folder_id`, `search`, `limit`, `offset` |
| GET | `/:id` · `/:id/download` · `/:id/preview` · PUT `/:id` · DELETE `/:id` · GET `/record/:recordId` | metadata / stream / inline preview / update / soft-delete / by-record |

### Folders
`GET/POST /folders` · `PUT/DELETE /folders/:id`

### Sharing & analytics
`POST /:id/share` · `GET /:id/shares` · `DELETE /shares/:linkId` · `GET /:id/analytics` ·
**public:** `GET /public/:token` (returns `allow_preview`) · `GET /public/:token/download` · `GET /public/:token/preview`

### Merge templates
`GET/POST/PUT/DELETE /api/builder/document-templates[/:id]` (admin) ·
`POST /api/documents/templates/:id/preview` · `POST /api/documents/templates/:id/render`

### E-signature
`POST /:id/signature-requests` · `GET /:id/signature-requests` · `DELETE /signature-requests/:reqId` ·
**public:** `GET /sign/:token` · `GET /sign/:token/document` · `POST /sign/:token` · `POST /sign/:token/decline`

### Builder config — `/api/builder` (read: auth · write: admin)
`document-categories[/:id]` · `document-checklists[/:id]` · `document-templates[/:id]`

---

## 8. Configuration

| Env var | Default | Meaning |
|---|---|---|
| `STORAGE_DRIVER` | `local` | `local` · `s3` · `azure` · `gcs` |
| `STORAGE_ROOT` | `backend/uploads` | Local driver root |
| `STORAGE_MAX_FILE_SIZE` | `26214400` (25 MB) | Global per-file ceiling (per-category caps override) |
| `STORAGE_S3_BUCKET` / `_REGION` / `_ENDPOINT` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_FORCE_PATH_STYLE` / `_PREFIX` | — | S3 & S3-compatible |
| `STORAGE_AZURE_CONTAINER` / `_CONNECTION_STRING` / `_ACCOUNT` / `_ACCOUNT_KEY` / `_PREFIX` | — | Azure Blob |
| `STORAGE_GCS_BUCKET` / `_PROJECT_ID` / `_KEY_FILE` / `_PREFIX` | — | Google Cloud Storage |

See `backend/.env.example` for the full list.

Tenant-level document settings live in the `documents` group of the app settings
(`tenant_configs`, editable in BUILDER › Document Management and Settings › Documents): `max_upload_mb`,
`retention_days`, `allow_public_sharing`, and `show_preview_button` (default `true` — hides/shows the
in-app and public Preview button).

---

## 9. Benchmark vs. top 5 CRM platforms

Compared against **Salesforce**, **HubSpot**, **Dynamics 365**, **Zoho CRM**, and **Pipedrive**
(publicly documented capabilities, 2026). Legend: ✅ full · 🟡 partial · ⚪ not yet.

| Capability | **Genesis DMS** | SF | HubSpot | Dyn365 | Zoho | Pipedrive |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Multi-tenant isolation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pluggable storage (S3/Azure/GCS/on-prem) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Content hashing + dedup | ✅ SHA-256 | 🟡 | ⚪ | 🟡 | 🟡 | ⚪ |
| Versioning | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| Review / approval workflow | ✅ | 🟡 | 🟡 | ✅ | 🟡 | 🟡 |
| Configurable categories + checklists | ✅ (builder) | 🟡 | 🟡 | ✅ | 🟡 | 🟡 |
| Folders / hierarchy | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Full-text / in-document search | ✅ (pdf/docx/txt) | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| Public sharing + view tracking | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ |
| Merge templates / doc generation | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ |
| E-signature | ✅ (native) | ✅ | 🟡 | ✅ | ✅ | ✅ |
| Retention policy | ✅ (per-category) | ✅ | 🟡 | ✅ | ✅ | ⚪ |
| Audit trail / certificate | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |

Genesis now matches or leads the field on governance (dedup, review, retention, audit,
compliance checklists) and has closed the previous gaps in storage maturity, folders, search,
sharing/analytics, templates, and e-signature.

**Remaining enhancements (optional):** presigned-URL downloads for very large files;
image/PDF thumbnails; retention **scheduler** wiring `purgeDeleted()` to cron; embedding
signatures into source PDFs (pdf-lib); a certified e-sign provider integration.

---

## 10. Operational notes

- **Security surface** — the public `/share/:token` and `/sign/:token` routes are intentionally
  unauthenticated and gated by unguessable tokens; worth a periodic security review.
- **GC / retention** — `DocumentService.purgeDeleted(cutoff)` hard-deletes soft-deleted rows and
  their blobs; per-category `retention_days` is configurable in the builder. Wire `purgeDeleted`
  to a scheduler for automated enforcement.
- **Extracted text** — `documents.content_text` powers search only and is **omitted from all API
  responses** (it can be ~200 KB/doc).
