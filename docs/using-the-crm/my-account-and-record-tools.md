# My Account, Record Tools and the Client Portal

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Using the CRM](README.md)** › 5 of 6 · **For:** All staff
> ← [Documents](documents.md) · [Products & Services catalogue](products-and-services.md) →
> New to Genesis? Background: [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md)
<!-- /nav:top -->

> Everyday features for every user: securing your account, subscribing to your calendar, reading the CRM in
> French, working with protected personal data, cleaning up duplicates, and what your clients see in the portal.

## My account

Click your avatar (top right) to open **My account ▸ Security**.

| Card | What you can do |
|---|---|
| **Change password** | Enter your current password and a new one. Every device you are signed in on is signed out, including this one. |
| **Two-factor authentication** | Choose **Set up two-factor authentication**. Add the key to an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password, Authy), then enter the 6-digit code it shows and choose **Turn on**. Save the ten recovery codes somewhere safe: each works once if you lose your phone, and they are shown only once. To turn it off, enter a current code and choose **Turn off**. Your organisation may require it, in which case you are asked to set it up when you sign in. |
| **Calendar feed** | Choose **Show my calendar link**, then **Copy**. In Outlook, Google Calendar or Apple Calendar, add a calendar *from the internet* / *by URL* and paste the link. Your scheduled meetings and calls, task due dates, reminders and the dated records you own (for example meeting notes and reviews due, where your administrator has enabled them) appear and refresh about every hour. Keep the link private. |
| **Sessions** | **Sign out everywhere** ends every session on every device, and makes your old calendar link stop working (copy the new one). Use it if a device is lost or shared. |

When two-factor authentication is on, signing in asks for the 6-digit code after your password. You can type a
recovery code there instead.

## Reading the CRM in French

Use the **EN | FR** switch in the header. The page reloads in the chosen language. Module, object, field, stage and
picklist names appear in French wherever your administrator has provided a translation. Buttons and menus stay in
English. Your choice is remembered on this browser.

Administrators add translations in **Builder ▸ Modules & Objects ▸ field ▸ Label (French)**.

## Protected personal data

Some fields, such as national ID numbers, appear masked (`•••• 1234`, with a lock) if your role does not have the
*View personal data* permission. Users who have the permission see a **Reveal** link next to the value. In Genesis
Capital the Compliance Officer, MLRO, Credit Analyst and Operations (checker) roles hold it. It comes with the
workspace configuration; the Permissions page has no tab for it. Every
reveal is recorded in the tamper-evident audit trail with your name and the time, so reveal only when you need to.

Saving a record never overwrites the real value with the mask.

On some records, related lists show **"N restricted — contact Compliance"**. These rows exist but sit behind an
information barrier you are not inside. Ask Compliance if you need access (see
[Business Units & Information Barriers](../builder-guide/10-business-units-and-barriers.md)).

## Merging duplicate records

Managers and administrators see **Merge into…** on a record's panel.

1. Open the duplicate, the record that should disappear.
2. Choose **Merge into…** and pick the record to keep.
3. Confirm.

Empty fields on the record you keep are filled from the duplicate. Every record linked to the duplicate (its
applications, cases, documents and so on) is moved to the record you keep, together with its activities, tasks,
reminders and email history. Totals on related records are recalculated. The duplicate goes to the Trash.

Changed your mind? Within 30 days, an administrator can open **Builder ▸ Trash**, find the duplicate and choose
**Reverse merge**. The links and fields are put back, and the moved activities, tasks, reminders, documents and
emails return to the duplicate.

## Reassigning many records

Managers and administrators can select records in a list, pick a person in **Reassign to…** and choose
**Reassign**. Use it when a relationship manager leaves or a portfolio moves. Each change is audited.

## The client and introducer portal

Your clients and introducers have their own sign-in at `/portal/<your-workspace>`. It is separate from the staff
sign-in.

- **Signing in.** They enter their email address and receive a 6-digit code. Only addresses that are on a client
  record (or on an introducer's *portal email*) can sign in.
- **What a client sees.** Only their own records, in the sections your administrator has enabled. For example:
  loan applications and their status, loans, fund holdings and orders, mandates, requests and complaints, and
  consents.
- **What a client can do.** Raise requests or complaints, place fund orders, grant or withdraw consent, upload
  documents (PDF, JPEG or PNG), download documents shared to the portal, and send you a message.
- **Messages and uploads.** A message appears on the client's record as an activity and notifies the record
  owner. Uploaded documents are filed on the record.
- **Introducers.** They submit referrals, which arrive as enquiries. They follow the referral's progress (only
  when the client agreed to share it) and see their commissions.

Administrators choose which objects and fields appear (see
[Platform Builder Extensions §13](../developer-guide/engines/platform-builder-extensions.md#13-client-and-introducer-portal)).

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Products & Services catalogue](products-and-services.md) — Genesis Capital's product catalogue (the financial_product object) and how rates are set |
| **Previous** | [Documents](documents.md) |
| **Background** | [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md) |
| **Related** | [21 — Client & Introducer Portal](../genesis-capital/process-flows/21-client-and-introducer-portal.md) |
| **On these journeys** | [Genesis Capital staff](../README.md#genesis-capital-staff) (step 9 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Using the CRM](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
