# Permissions

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Builder guide](README.md)** › 6 of 20 · **For:** Administrators
> ← [Dashboard builder](05-dashboard-builder.md) · [Roles & levels](07-roles-and-levels.md) →
> New to Genesis? Background: [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md)
<!-- /nav:top -->

> **Builder → Manage** · `/builder/permissions` · Control which roles can see, edit, and act on data and metadata.

## What it is

The Permission Management screen is the central place to decide what each role can do. It covers two kinds of
permission. Operational permissions set how far a role's reach extends over tasks, activities, and records (only
their own, their team's, their whole branch of the org chart, or everything). Entity permissions set whether a
role can view or edit specific metadata entities such as dashboards, workflows, modules, objects, fields, forms,
pipelines, and wizards. Admins and Super Admins always have full access and cannot be locked out.

## Where to find it

Sidebar → **Builder** → **Manage** → **Permissions**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- Create your roles first so they appear in the permission tables. See [Roles & Levels](07-roles-and-levels.md).
- Build the reporting hierarchy (who reports to whom) so that "Team" and "Hierarchy" scopes have meaning. See
  [Employees](08-employees.md).
- Have the relevant dashboards, workflows, or other entities already created so they show up in the lists.

## Configure permissions: step by step

The page opens with three top-level tabs across the top: **Operational (Tasks / Activities / Records)**,
**Dashboards**, and **Workflows**.

### Operational permissions (tasks, activities, records)

1. Open the **Operational** tab (selected by default).
2. Choose a sub-tab: **Task Permissions**, **Activity Permissions**, **Record Permissions**, **Barrier Override** or
   **Wall-crossing Decisions**.
3. You see one card per role. Admin-tier roles (level 3 or lower) are shown as "always full" and are locked.
4. For each configurable role, set a scope for **View**, **Create**, **Edit**, and **Delete** using the
   dropdowns, plus an **Assign to** dropdown.
5. Click **Save** on that role's card. Each role card saves independently. A check mark confirms the save.

**Barrier Override** has one tick box per role: **Can see inside every barrier**. Information barriers bind every
role, administrators included, so nothing is ticked by default and admin roles are not locked here. Tick it only
for roles such as Compliance or the MLRO. Each change is written to the tamper-evident audit chain. See
[22. Business Units & Information Barriers](10-business-units-and-barriers.md).

**Wall-crossing Decisions** works the same way: ticked roles review and decide wall-crossing requests in **Tools →
Access & Barriers**. It does not let them see inside any barrier. Give it to Compliance.

### Dashboard permissions

1. Open the **Dashboards** tab.
2. Pick a dashboard from the list on the left.
3. On the right, the **Role Permissions** table appears with a **Can View** and **Can Edit** checkbox per role.
4. Check or uncheck boxes for each role. Admin-tier roles are locked to full access.
5. Click **Save**.

### Workflow permissions

1. Open the **Workflows** tab.
2. Pick a workflow from the list on the left.
3. Set **Can View** and **Can Edit** per role in the table on the right.
4. Click **Save**.

### Other metadata entities

Permissions for modules, objects, fields, forms, pipelines, and wizards use the same view/edit table, but you set
them from each entity's own builder panel rather than this page. For example, open a module or object in
[Modules & Objects](01-modules-and-objects.md) and use its permission panel.

## Reference: fields & options

| Field / Option | What it does | Notes |
| --- | --- | --- |
| View scope | How many records the role can see | Used by Task, Activity, and Record tabs |
| Create scope | Which records the role may create | "Own" means records they own |
| Edit scope | Which records the role may change | |
| Delete scope | Which records the role may delete | |
| Assign to | Who the role may assign records to | Options: Cannot assign, Team members only, Hierarchy only, Anyone |
| Can View (entity) | Whether the role sees this entity at all | Unchecking hides it from the UI for that role (see Limitations) |
| Can Edit (entity) | Whether the role can change this entity | Requires Can View; off means read-only |

Scope values for View, Create, Edit, and Delete:

| Scope | Meaning |
| --- | --- |
| None (no access) | The role has no access at all for this action |
| Own only | Only records they created or are assigned to |
| Team (direct reports) | Own records plus their direct reports' records |
| Hierarchy (all descendants) | Own records plus everyone below them in the org chart |
| All records | Unrestricted access to every record |

## Tips

- Defaults are deliberately safe. If no permission row exists, a non-admin role can view an entity but not edit
  it. For operational scopes, the default depends on the role's level: admin-tier gets full access, manager-tier
  gets hierarchy-based access, and ordinary users get "own only".
- "Team" means just the direct reports one level down. "Hierarchy" means every descendant at any depth.
- Hiding an entity (Can View off) automatically removes its edit access too. Granting edit automatically turns
  view back on.
- A dashboard is shown only when both its permission here and its **Min Role** setting allow the role.
- **Record Permissions apply only to roles you save.** A saved role is limited to its scopes for every business
  record (all of Genesis Capital's objects): **View** decides which records it sees, and **Create**, **Edit**,
  **Delete** and **Assign to** decide what it may change — including stage moves, merges and bulk actions, which
  skip records outside the scope. A role you have not saved keeps its level's behaviour: admin-tier sees every
  record, manager-tier (level 4) its team's, everyone else the records they created or are assigned. Either way,
  **Records: All** in an object's permission panel still lets a role see every record of that object, and business
  units and information barriers apply on top. A common pattern is *see everything, change only your own*: set the
  object's **Records: All** and the role's record **Edit** to *Own only*. Saved scopes take effect immediately.
  Task Permissions are enforced in full; Activity Permissions are enforced for create, edit and delete (who can
  read a record's activities follows access to the record).
- **Can View off hides on screen only.** For an object or a field, it removes the item from that role's menus,
  pages and forms, but record reads through the API do not check it. To keep data from a role, use record
  visibility, business units or barriers.

## Related guides

- [Roles & Levels](07-roles-and-levels.md)
- [Employees](08-employees.md)
- [Modules & Objects](01-modules-and-objects.md)

## Troubleshooting

- **A role's checkboxes are greyed out** — That role is admin-tier (level 3 or lower). Admins and Super Admins
  always have full access and cannot be restricted here.
- **A user still cannot see a record after I granted "All"** — For records of a Builder object, the Record
  Permissions tab has no effect; set **Records: All** on the object's permission panel instead. For tasks and
  activities, confirm you saved the correct tab and the correct role's card. Each card saves on its own. A business
  unit or an information barrier can also hide the record.
- **"Team" or "Hierarchy" scope shows nothing** — The reporting hierarchy may be empty. Set each employee's
  "Reports To" manager. See [Employees](08-employees.md).
- **A dashboard or workflow is missing from the list** — It has not been created yet, or you lack access to it.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Roles & levels](07-roles-and-levels.md) — Roles and the fixed level ladder |
| **Previous** | [Dashboard builder](05-dashboard-builder.md) |
| **Background** | [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md) |
| **Related** | [Permissions & roles](../administration/permissions-and-roles.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Builder guide](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
