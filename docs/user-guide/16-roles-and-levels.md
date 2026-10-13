# Roles & Levels

> **Builder → Manage** · `/builder/roles` · Define custom roles and order them by access level.

## What it is

The Roles & Hierarchy screen lets you create and manage the roles that drive every permission in Genesis CRM.
Each role has an access level, and the system uses an inverted scale: a lower number means more power. Platform
admin is level 1, super admin is level 2, admin is level 3, manager is level 4, and a standard user is level 5.
Custom roles slot in at level 2 or higher. The page also shows how many employees hold each role and includes an
organization chart.

## Where to find it

Sidebar → **Builder** → **Manage** → **Roles**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- Understand the inverted level model: lower number equals more access. Level 1 (platform admin) is reserved and
  cannot be assigned here.
- A higher role inherits the abilities of every role below it.

## Create a role: step by step

1. Click **New Role** in the top right. A "Create Role" dialog opens.
2. Enter a **Name (slug)** such as `team_lead`. Only lowercase letters, numbers, and underscores are kept. This
   is the internal identifier and cannot be changed later.
3. Enter a **Display Label** such as `Team Lead`. This is what users see.
4. Optionally enter a **Description**.
5. Set the **Access Level** (a number, minimum 2). A hint next to the field describes what the level means, for
   example "Admin (configure system)" or "Own records only".
6. If a role already exists at the level you chose, a yellow warning lists the existing roles that will be pushed
   down one level to make room. Review it before saving.
7. Click **Create**. The button is disabled until both Name and Label are filled in.

## Edit or delete a role

- **Edit** — Click the pencil icon on a role card. You can change the Display Label, Description, and Access
  Level. The Name (slug) is locked.
- **Delete** — Click the trash icon and confirm. Delete is only allowed when no employees hold the role; the
  button is disabled while the role is in use. After deletion, roles below the gap shift up one level to close it.
- **See who has a role** — Each card shows an employee count. Click it to expand the list of employees in that
  role and whether each is active.
- **Org chart** — Click **Show Org Chart** at the top to view the full reporting tree. Click **Hide Org Chart**
  to collapse it.

## How level shifting works

Levels behave like rows in a spreadsheet. If you insert a new role at a level that is already taken, that role
and every role below it move down by one to make space. The dialog previews exactly which roles will shift before
you save. When you delete a role, the gap closes automatically: roles below it move up by one.

## Reference: fields & options

| Field / Option | What it does | Notes |
| --- | --- | --- |
| Name (slug) | Internal identifier for the role | Lowercase, numbers, underscores; locked after create |
| Display Label | The name users see | Required |
| Description | Free-text note about the role | Optional |
| Access Level | Position on the inverted scale (lower = more power) | Minimum 2; level 1 is reserved |

Default levels and their meaning:

| Level | Role | What it can do |
| --- | --- | --- |
| 1 | Platform admin | Full system access (reserved; not editable here) |
| 2 | Super admin | Full system access |
| 3 | Admin | Configure modules and forms; manage users and roles |
| 4 | Manager | View and manage team and hierarchy records |
| 5 | User | View own records and create records |
| 6+ | Custom | A restricted level you define |

## Tips

- Pick the level deliberately. Everything in [Permissions](14-permissions.md) keys off the role's level: levels 3
  and below are treated as admin-tier and always get full access.
- Watch the yellow shift preview before saving a new role so you do not accidentally demote existing roles.
- You cannot delete a role that is still assigned to employees. Reassign those employees first, then delete.
- Use the Permission Scope by Level table at the bottom of the page as a quick reference for what each level can
  do out of the box.

## Related guides

- [Permissions](14-permissions.md)
- [Employees](15-employees.md)

## Troubleshooting

- **"level must be 2 or higher"** — Level 1 is reserved for platform admin. Choose 2 or above.
- **Cannot delete a role** — One or more employees still hold it. The trash icon is disabled until the role is
  unused; reassign those employees first.
- **Creating a role unexpectedly changed other roles' levels** — Inserting at an occupied level shifts the
  others down. Check the preview before saving, or edit a role's level afterward to fix it.
- **A new role does not appear when assigning employees** — Roles list immediately after creation. Refresh the
  Employees page if the dropdown looks stale.
