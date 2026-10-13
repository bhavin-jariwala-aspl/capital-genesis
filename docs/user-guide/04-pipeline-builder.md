# Pipeline Builder

> **Builder → Configure** · `/builder/pipeline` · Define ordered stages for an object so users get a Kanban board
> view.

## What it is

A pipeline links a set of ordered, colored stages to an **Object** (for example Lead or Deal). Once a pipeline is
linked to an object, a **Table / Pipeline toggle** automatically appears on that object's module page, letting
users switch between the flat table and a Kanban board. Each stage becomes a column on the board, and dragging a
record between columns changes its stage.

## Where to find it

Sidebar → **Builder** → **Configure** → **Pipeline**. Requires an **Admin** or **Super Admin** role.

The page lists every pipeline with its linked object, stages, and active status.

## Before you begin

- The object you want to attach the pipeline to must already exist (see
  [Modules & Objects](01-modules-and-objects.md)).
- Decide on the stage names and their left-to-right order before you start.

## Create a pipeline: step by step

1. Go to **Builder → Configure → Pipeline** and click **New Pipeline**. The **New Pipeline** modal opens.
2. Enter a **Pipeline Name** (required). The internal name is generated automatically from this label.
3. Choose a **Module**, then choose an **Object** from that module (both required). A confirmation note tells you
   the **Table / Pipeline toggle** will appear on that object's tab.
4. (Optional) Add a **Description**.
5. Build the **Pipeline Stages**. Three starter stages (**New**, **In Progress**, **Done**) are added for you:
   - For each stage, pick a **color** from the swatch dropdown and type a **Stage label** (for example
     `Qualified`).
   - Click **Add Stage** to add more. Stages run left to right in the order shown, which is the order columns
     appear on the board.
   - Click the **X** on a stage row to remove it.
6. Set **Deletion behaviour** with the toggle. **Soft delete** (on, the default) sends deleted records to the
   Trash for admin recovery; turn it **off** for **hard delete** (permanent). See
   [Trash: recovering deleted records](#trash-recovering-deleted-records).
7. Watch the **Preview** strip update as you edit, showing the stage chips in their colors and order.
8. (Optional) Open a stage's **Entry rules** to stop records entering it until they are ready:
   - Required fields: the API names, comma-separated, of fields that must be filled before a record may
     move into the stage.
   - A formula that must be true, such as `security_complete AND kyc_status = 'approved'`, and the message
     users see when it is not.

   The rules apply however the record moves: dragging on the board, a bulk stage change, the API or a
   workflow.
9. Click **Save Pipeline**. The button is disabled until at least one stage has a label and an object is selected.

To edit later, click the **pencil** icon on a pipeline row. To set who can use it, click the **shield**
(Permissions) icon. To review who changed the pipeline and when, click the **history** (clock) icon. To remove
it, click the **trash** icon.

Every action on a pipeline and its records — create, edit, stage moves, deletes, restores, and permanent
deletes — is recorded in an audit trail against the logged-in user. Pipeline-configuration changes are visible
in the **History** modal; a record's own history is on its detail page.

## Reference: fields & options

| Field / Option | What it does | Notes |
| --- | --- | --- |
| Pipeline Name | The display label for the pipeline | Required; internal name is auto-generated |
| Module | Narrows the object list to one module | Required; changing it resets the Object |
| Object | The object the pipeline attaches to | Required; drives where the toggle appears |
| Description | Free-text notes about the pipeline | Optional |
| Stage color | The color of the stage chip and its board column | Chosen from a fixed swatch palette |
| Stage label | The stage's display name | At least one labeled stage is required to save |
| Add Stage | Appends a new empty stage row | New stages get the next palette color |
| Stage order | Left-to-right order of stages | Reorder by their position in the list |
| Entry rules | Required fields and a formula rule a record must satisfy to enter the stage | Optional; enforced by the server for every kind of move |
| Save Pipeline | Creates or updates the pipeline and its stages | Disabled until a labeled stage exists |

## Tips

- The internal stage name is derived from the label (lowercased, spaces become underscores), so keep labels
  clear and concise.
- Stages are ordered left to right exactly as they appear in the editor; arrange them in the natural flow of your
  process (for example New → Qualified → Won).
- Removing a stage from a pipeline affects the board columns for that object. Plan stage changes carefully if
  records already sit in those stages.
- Use the **Permissions** (shield) icon to control which roles can use the pipeline at runtime.

## How it works at runtime

- Once a pipeline is linked to an object, users see a **Table / Pipeline toggle** on that object's module page.
- The **Pipeline** view renders a Kanban board with one column per stage, in your configured order and colors.
- Users move a record between columns to change its stage; the new stage is saved on the record.

## Trash: recovering deleted records

When a user deletes a record from a list or board (for example a **Lead** or **Prospect**), what happens
depends on that object's **pipeline** — each pipeline has its own **Deletion behaviour** toggle, set in the
pipeline editor (see [Create a pipeline](#create-a-pipeline-step-by-step)):

- **Soft** (default, toggle on) — the record is moved to the **Trash**. It disappears from every user's lists
  and boards, but is kept in the database so an admin can recover it. Users are never shown any "trash" concept;
  from their side the record is simply gone.
- **Hard** (toggle off) — the record is permanently deleted immediately and cannot be recovered.

### Using the Trash (admins)

1. On the **Pipeline Builder** page, click the **Trash** button (top right) to open **Builder → Trash**.
2. You'll see every soft-deleted record with its type (Lead, Prospect, …), a summary (name / email / company),
   its last stage, and when — and by whom — it was deleted. Use the **Filter by type** dropdown to narrow the list.
3. Click **Restore** to return a record to its object's live list, or the **trash** icon to **Delete permanently**
   (irreversible — a record must already be in the Trash before it can be permanently deleted).

> **Admin tip:** set soft vs hard delete per pipeline using the **Deletion behaviour** toggle in the pipeline
> editor. Leave it on **soft** for a recovery safety net; choose **hard** only when deletes must be permanent.

## Related guides

- [Modules & Objects](01-modules-and-objects.md)
- [Form Builder](02-form-builder.md)
- [Dashboard Builder](03-dashboard-builder.md)

## Troubleshooting

- **A user deleted a record by mistake** — if that object's pipeline is on **soft delete**, open
  **Builder → Trash**, find the record, and click **Restore**. If the pipeline is on **hard delete**, the
  record is gone permanently.
- **The Trash is always empty** — the pipeline for that object is set to **hard delete**, so records are removed
  permanently rather than kept. Edit the pipeline and turn **Deletion behaviour** back to soft to enable recovery.
- **The Table / Pipeline toggle does not appear** — the pipeline must be linked to an object. Edit the pipeline
  and confirm a **Module** and **Object** are selected, then save.
- **Save Pipeline is greyed out** — you need at least one stage with a label, and an object must be selected. Add
  a labeled stage and pick an object.
- **A stage column is missing on the board** — the stage probably had a blank label and was skipped on save.
  Re-open the pipeline, give the stage a label, and save again.
