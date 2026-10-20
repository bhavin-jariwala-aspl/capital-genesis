# Employees

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Builder guide](README.md)** › 8 of 20 · **For:** Administrators
> ← [Roles & levels](07-roles-and-levels.md) · [Org chart](09-org-chart.md) →
> New to Genesis? Background: [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md)
<!-- /nav:top -->

> **Builder → Manage** · `/builder/employees` · Create users, assign roles, and build the reporting hierarchy.

## What it is

The Employee Management screen lists every user in your organization and lets you add new ones, edit their
details, set who they report to, and activate or deactivate them. Each employee has a login (their Employee ID
and password), a role that controls their permissions, and an optional branch, region, and manager. You can also
view any employee's org chart from here.

## Where to find it

Sidebar → **Builder** → **Manage** → **Employees**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- Create the roles you plan to assign first. See [Roles & Levels](07-roles-and-levels.md).
- If you want to attach employees to branches or regions, those should already exist.
- Your plan has a maximum active user limit. Creating an employee fails if you are already at the limit.

## Create an employee: step by step

1. Click **New Employee** in the top right. A dialog titled "Create Employee" opens.
2. Enter an **Employee ID** (for example, `EMP001`). Only uppercase letters, numbers, and underscores are kept;
   the field forces uppercase automatically. This is required and cannot be changed later. Employee IDs and email
   addresses are unique across the whole platform, not just your workspace, so a prefix such as `GC` helps.
3. Enter the **Full Name**. Required.
4. Optionally enter **Email** and **Phone**.
5. Pick a **Role** from the dropdown. The list shows every role except platform admin.
6. Enter a **Password**. Required when creating a new employee.
7. Optionally choose **Reports To** (the manager). The default is "None (top-level)". Pick another employee to
   place this person under them in the org chart.
8. Optionally choose a **Branch**. Selecting a branch auto-fills its region.
9. Click **Create**. The button is disabled until ID, name, and password are filled in.

## Edit, deactivate, or view an employee

- **Edit** — Click the pencil icon on a row. The dialog title shows `Edit <ID>`. The Employee ID is locked.
  Leave the Password blank to keep the current password; type a new one to change it.
- **Deactivate** — Click the person-with-an-X icon and confirm. The employee becomes Inactive and can no longer
  log in. Deactivating frees a slot against your user limit.
- **Reactivate** — For an inactive employee, click the person-with-a-check icon to make them Active again.
- **Org chart** — Click the branch icon to open an "Org Chart" dialog showing that employee and everyone below
  them. Expand and collapse branches with the arrow toggles. To explore the **whole company** interactively — with
  zoom, search, filters, and colour coding — use the dedicated [Org Chart](09-org-chart.md) screen instead.
- **Search** — Use the search box to filter by ID, name, or email.

## Reference: fields & options

| Field / Option | What it does | Notes |
| --- | --- | --- |
| Employee ID | The unique login ID | Uppercase letters, numbers, underscores; cannot be changed after create |
| Full Name | Display name | Required |
| Email | Contact email | Optional |
| Phone | Contact phone | Optional |
| Role | Sets the user's permissions | Required; platform admin is not selectable |
| Password | Login password | Required on create; blank on edit keeps the old password |
| Reports To | The manager in the org chart | Optional; default is top-level (no manager) |
| Branch | The employee's branch | Optional; selecting a branch fills in its region |
| Region | The employee's region | Auto-filled from the chosen branch |
| Status | Active or Inactive | Inactive users cannot log in |

## Tips

- Choose the role carefully — it is what actually grants access. Permissions and scopes are defined per role in
  [Permissions](06-permissions.md).
- Set "Reports To" for everyone you can. The reporting hierarchy is what makes "Team" and "Hierarchy" permission
  scopes work.
- Selecting a branch fills the region for you, so you rarely need to set the region by hand.
- Prefer deactivating over leaving stale accounts active. Deactivating also frees a seat against your user limit.

## Related guides

- [Org Chart](09-org-chart.md) — explore the full reporting hierarchy interactively
- [Roles & Levels](07-roles-and-levels.md)
- [Permissions](06-permissions.md)

## Troubleshooting

- **"User limit reached" when creating** — You have hit your plan's maximum number of active users. Deactivate an
  unused account or upgrade your plan, then try again.
- **"Employee ID … is already taken" or "Email … is already registered"** — IDs and emails are unique across the
  platform. Choose another ID (try a prefix) or another email.
- **"Manager not found" error** — The chosen "Reports To" employee does not exist in your organization. Pick a
  valid manager from the dropdown.
- **Create button stays disabled** — Employee ID, Full Name, and Password are all required for a new employee.
- **The new user cannot log in** — Confirm the account is Active and that you shared the correct Employee ID and
  password.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Org chart](09-org-chart.md) — Reporting lines that drive manager visibility and escalation |
| **Previous** | [Roles & levels](07-roles-and-levels.md) |
| **Background** | [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Builder guide](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
