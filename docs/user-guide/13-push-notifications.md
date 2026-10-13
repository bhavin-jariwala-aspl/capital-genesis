# Push Notifications

> **Builder → Connect** · `/builder/push-notifications` · Send targeted in-app notifications to users, roles, or the team.

## What it is

Push Notifications let an admin send an ad-hoc, in-app notification to other users. You write a title and optional
message, choose who receives it (everyone, specific roles, or specific employees), and send. Recipients see the
notification in their **notification bell** in the app. The page also keeps a history of everything sent, with
recipient counts and timestamps. These are in-app messages within Genesis CRM, not device or browser push.

## Where to find it

Sidebar → **Builder** → **Connect** → **Push Notifications**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- To target specific people, make sure the relevant employees are active in the system.
- To target by role, know which roles apply: Admin, Manager, or User.

## Send a notification: step by step

1. Click **Send Notification** (top right). The **Send Push Notification** dialog opens.
2. Enter a **Title** (required), for example `Important: Q4 pricing update`.
3. Optionally add a **Message** with more detail.
4. Optionally add a **Link** that opens when the notification is clicked. This can be an in-app path such as `/quotes`
   or a full `https://` URL.
5. Choose the **Target Audience**:
   - **All Users** — every active employee.
   - **By Role** — tick one or more of Admin, Manager, User.
   - **Specific Employees** — tick individual employees from the searchable list.
6. Click **Send Notification**. The dialog closes and the notification appears at the top of the **Sent Notifications**
   history.

## Reference: fields & options

| Field / Option | What it does | Notes |
| --- | --- | --- |
| Title | The headline recipients see | Required. The Send button stays disabled until this is filled. |
| Message | Optional body text under the title | Optional. |
| Link (optional) | Destination opened from the notification | Accepts an in-app path (`/quotes`) or a full URL. |
| Target Audience | Who receives the notification | All Users, By Role, or Specific Employees. |
| Select Roles | Shown when "By Role" is chosen | Admin, Manager, User. At least one must be selected. |
| Select Employees | Shown when "Specific Employees" is chosen | Pick one or more from the list; a count is shown. |

### Audience resolution

| Target | Who it reaches |
| --- | --- |
| All Users | All active employees. |
| By Role | All active employees whose role matches a selected role. |
| Specific Employees | Exactly the employees you select. |

## Where recipients see it

Each targeted user gets an in-app notification of type **system**. It shows in the **notification bell** in the app
header, contributing to their unread count until they open or mark it read. If you set a **Link**, clicking the
notification navigates there.

## Scheduling

Notifications are sent immediately when you click **Send Notification**. There is no built-in scheduling or delayed
send on this page — to deliver at a specific time, send it at that time.

## History and metrics

The page header shows three running totals: **Total Sent**, **Total Recipients**, and the **Latest** send date. The
**Sent Notifications** list shows each notification's title, message, target (with an icon for All / Role / Employee),
recipient count, optional link, and timestamp. History keeps the most recent sends.

## Tips

- Keep titles short and specific; the title is what most users scan first in the bell.
- Use **By Role** for broad announcements (for example, all Managers) instead of selecting people one by one.
- Add a **Link** to a relevant page so recipients can act on the notification in one click.

## Related guides

- [Email Templates](11-email-templates.md) — for outbound customer email instead of internal alerts.
- [Social Media](12-social-media.md) — for external audience messaging.

## Troubleshooting

- **Send Notification button is disabled** — the Title is empty, or you chose By Role / Specific Employees without
  selecting at least one role or employee.
- **"0 recipients" in history** — no active employees matched the chosen target (for example, a role with no members).
- **Recipients didn't get it** — confirm the targeted employees are active; inactive employees are skipped for All and
  By Role targeting.
- **Employee list shows "Loading employees…"** — the list loads when the dialog opens; wait a moment or reopen the
  dialog.
