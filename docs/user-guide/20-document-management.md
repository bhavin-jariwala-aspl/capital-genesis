# Document Management — Files, Folders, Sharing & E-Signature

> **Documents** · `/documents` (use) · `/builder/documents` (admin setup).
> One place for every document in the organisation — upload, organise, search, share, generate, and get signed.

## What it is

The Document Management module is a standalone home for all your files. It has its own **Documents** entry in the sidebar and works for any
record type. You can upload and categorise files, organise them into folders, search **inside**
documents (not just by name), share a file via a tracked public link, generate documents from
templates, and collect legally-binding **e-signatures** — all from one page.

## Where to find it

- **Documents** (`/documents`) — the main page: stats, folder rail, filters, and the document
  table. Available to every logged-in user.
- **Builder → Document Management** (`/builder/documents`) — admin setup for categories,
  checklists, and merge templates.

## Everyday tasks

### Upload
Click **Upload Documents**, choose a **category**, drag & drop one or more files (or browse), add
an optional description, and upload. If a folder is selected in the rail, uploads go into it.
Allowed file types and size come from your category settings (defaults: PDF, Office, images, up
to 25 MB).

### Organise with folders
Use the **folder rail** on the left: **All Documents**, **Unfiled**, or any folder you create
(click the **＋** to add one; nest by creating while a folder is selected). Deleting a folder
keeps its documents — they move to **Unfiled**, never deleted.

### Search
The search box matches the **filename, reference, and the text inside** PDF/Word/text documents.
So searching "indemnity" finds documents that *contain* that word, not just ones named it.

### Preview / download / view / delete
Each row has quick actions to view details, **preview**, download, share, request signatures, or
delete.

**Preview** opens the document right in the app — no download needed. PDFs and images show as-is;
Word and Excel files are converted for on-screen viewing; other file types offer a **Download** button
instead. The Preview button appears everywhere a Download button does (the Documents list, the record
document panel, and public share links).
Admins can hide it — see [Admin setup](#admin-setup-builder--document-management).

## Share a document & see engagement

Click the **share** action on a document to open **Share & Analytics**:

- **Create a link** — optionally set an expiry (in days) and whether downloading is allowed.
- **Copy** the link and send it to anyone — no login required to open it (`/share/…`).
- **Track engagement** — see total **views** and **downloads**, active links, and recent
  activity (who opened it and when). Revoke a link any time.

## Generate documents from templates

Admins create **merge templates** in the builder — reusable HTML/text with `{{placeholders}}`
like `{{contact.first_name}}`. When rendered against a record's data, the placeholders are filled
in and the result is saved as a normal document (searchable and shareable like any other). Use
**Preview** in the builder to see a template render with sample values.

## Collect signatures (e-signature)

Click the **pen** action on a document to open **Request Signatures**:

1. Add one or more **signers** (name + email). Optionally tick **Sign in order** to require them
   to sign sequentially.
2. **Send request** — each signer gets a private signing link (`/sign/…`). Copy and send it.
3. On that page a signer can **review the document**, then **draw** or **type** their signature,
   or **decline**.
4. When everyone has signed, a **signature certificate** (an audit trail of who signed, when, and
   from where) is generated and stored alongside the document.

Track each signer's status (pending / viewed / signed / declined) right in the modal.

## Admin setup (Builder → Document Management)

- **Display & Preview** — the **Show the "Preview" button** toggle (on by default). Turn it off to
  hide the Preview button everywhere, including on public share links.
- **Categories** — name/code, allowed file types, max size, retention, whether uploads **require
  review**, and whether the category is a **required document**.
- **Checklists** — the set of documents required for an entity type (e.g. an application).
- **Merge templates** — the document-generation templates described above.

## Where files are stored

Storage is configurable and works with **AWS S3, Azure Blob, Google Cloud Storage, S3-compatible
stores (MinIO, Cloudflare R2, …), or a local/on-prem disk** — set once by your administrator via
`STORAGE_DRIVER`. Nothing in day-to-day use changes with the backend. See the developer guide's
[DOCUMENT_MANAGEMENT.md](../developer-guide/DOCUMENT_MANAGEMENT.md) for deployment details.
