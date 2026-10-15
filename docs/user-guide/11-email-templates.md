# Email Templates

> **Builder → Connect** · `/builder/email-templates` · Reusable, mergeable email content organized by object.

## What it is

Email Templates let you save standardized email content (subject plus an HTML and/or plain-text body) so your team
can send consistent, on-brand emails without retyping them. Each template is assigned to a Module and Object (for
example, Sales > Prospect) and can include merge variables such as `{{first_name}}` that are filled in automatically
from the record's data when the email is sent. Templates are reused from the Activity Timeline email composer on a
record and from automated Workflows.

## Where to find it

Sidebar → **Builder** → **Connect** → **Email Templates**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- You should already have at least one Module and Object set up, since every template must be assigned to an object.
- Know which fields exist on that object — those field names become the merge variables you can insert.

## Create a template: step by step

1. Click **New Template** (top right). The **New Email Template** dialog opens.
2. Under **Assign to Object**, pick the target from the **Select Module > Object…** dropdown. This is required and
   determines which object fields are available as variables.
3. A **variable picker** appears below the dropdown. It lists **Object Fields** and **System Variables**. Click any
   field chip to insert its token (for example `{{first_name}}`) into whichever field you last had focused.
4. Enter a **Template Name** (required), for example `Lead Follow-up`.
5. Choose a **Category** (Sales, Marketing, Support, Onboarding, Welcome, Newsletter, Follow Up, or Other).
6. Type the **Subject Line** (required). You can insert variables here too, for example
   `Thank you for your interest, {{first_name}}`.
7. Pick a **Language** (English, Spanish, French, German, or Portuguese) and tick **Active** to make the template
   usable.
8. Fill in the **Email Body (HTML)** for the rich version and, optionally, the **Email Body (Plain Text)** fallback.
   Click a variable chip first, then click into the body, to drop tokens at the cursor.
9. Click **Create Template**. The template is saved and grouped under its Module > Object section in the list.

To change a template later, expand its row and click **Edit**; the same dialog reopens showing **Update Template**.

## Reference: fields & options

| Field / Option | What it does | Notes |
| --- | --- | --- |
| Assign to Object | Links the template to a Module > Object | Required. Drives which fields appear as variables. |
| Variable picker | Click a chip to insert a `{{token}}` | Inserts at the cursor of the last focused field (subject or body). |
| Template Name | The internal label shown in the list | Required. |
| Category | Groups templates by purpose | Sales, Marketing, Support, Onboarding, Welcome, Newsletter, Follow Up, Other. |
| Subject Line | The email subject; supports variables | Required. |
| Language | Tags the template's language | English, Spanish, French, German, Portuguese. |
| Active | Whether the template can be used | Inactive templates cannot be rendered or sent. |
| Email Body (HTML) | The rich formatted body | Optional but recommended. Plain HTML, type tokens manually if needed. |
| Email Body (Plain Text) | A fallback for plain-text mail clients | Optional. |

### Variable types

| Variable group | Examples | Where values come from |
| --- | --- | --- |
| Object Fields | `{{first_name}}`, `{{company}}`, `{{opportunity_name}}` | Auto-filled from the linked record when sending. |
| System Variables | `{{sender_name}}`, `{{sender_email}}`, `{{company_name}}`, `{{help_center_url}}` | Filled from sender and tenant settings. |
| Workflow emails | `{{upload_link}}` | A secure link (valid 14 days) where the client uploads the documents the record still needs. |

System fields such as `id`, `record_id`, `owner_id`, `created_by`, `created_at`, `updated_at`, and `external_id`
are intentionally excluded from the picker.

## Preview and test

1. Expand a template row and click **Preview** to open the **Preview** dialog.
2. If the template has variables, fill in sample values under **Preview Variables**, then click **Render Preview**
   to see the rendered subject and body with your sample data.
3. The HTML version is shown when present; otherwise the plain-text body is displayed.

There is no separate "test send" button on this page. To send a real email, open a record and use the email composer
on its Activity Timeline, which renders the template with that record's actual field values and logs the send.

## How variables get filled

- Tokens are written as `{{variable_name}}` and matched case-sensitively against the values you supply.
- When sending against a record, the system auto-resolves object-field tokens from that record's data.
- Any token that has no matching value is removed from the final email (it renders as empty rather than literal text).

## Tips

- Each template tracks a **usage count** (shown on the row as "N uses") so you can see which templates are popular.
- Deleting a template that has already been used does not hard-delete it — it is deactivated instead, preserving the
  email history. A template never used is removed completely.
- Templates with no object appear under an **Unassigned** section; assign them to an object so variables resolve.
- Keep both an HTML and a plain-text body for the best deliverability across email clients.

## Related guides

- [Workflows](06-workflows.md) — automated workflows can send emails using these templates as part of their actions.

## Troubleshooting

- **The variable picker says "Select an object above"** — you have not chosen a Module > Object yet. Pick one first.
- **My token printed as blank in the preview** — the variable name had no value supplied, or it does not match a
  field on the linked object. Check spelling and that the field exists on that object.
- **"Template is not active" when sending** — the template's **Active** checkbox is off. Edit it and re-enable.
- **Create button stays disabled** — Template Name, Subject Line, and Assign to Object are all required.
