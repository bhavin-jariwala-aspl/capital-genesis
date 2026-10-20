# Modules & Objects

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Builder guide](README.md)** › 1 of 20 · **For:** Administrators
> ← [Products & Services catalogue](../using-the-crm/products-and-services.md) *(Using the CRM)* · [Form builder](02-form-builder.md) →
> New to Genesis? Background: [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md)
<!-- /nav:top -->

> **Builder → Configure** · `/builder/modules` · Define the data structure of your CRM — modules, the objects
> inside them, and the fields each object holds.

## What it is

Modules and Objects are the foundation of Genesis CRM. A **Module** is a top-level area that appears in the left
sidebar (for example "Clients" or "Retail Lending" in Genesis Capital). An **Object** lives inside a module and
represents a type of record you want to store (for example "Party", "Enquiry", or "Loan Application"). **Fields** are the individual pieces of data each
object record captures. Use this screen first, before building forms, pipelines, or wizards — everything else in the
Builder references the objects and fields you create here.

## Where to find it

Sidebar → **Builder** → **Configure** → **Modules & Objects**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- Decide on the high-level areas of your CRM (these become modules) and the record types within each (these become
  objects).
- Have a naming plan ready. Each module, object, and field needs a human-friendly **Label** and a **Name (Key)** in
  `snake_case` that the system uses internally.

## How the screen is organized

The page is a three-level drill-down. You start on the **Modules** list, click **Objects** on a module to see its
objects, then click **Fields** on an object to manage its fields. Use the breadcrumb links at the top
(**← Modules**, **← Objects**) to go back up a level.

## Create a Module: step by step

1. On the **Modules** list, click **New Module** (top right).
2. In the **New Module** dialog, fill in the fields:
   - **Label (Display Name)** — required. This is what users see in the sidebar.
   - **Name (Key)** — required. Use `snake_case` (for example `genesis_lending`).
   - **Icon** — optional. Type a Lucide icon name such as `Users`.
   - **Category** — pick or type the sidebar section the module groups under (see Reference below). Defaults to
     `crm` (**Modules**).
   - **Description** — optional free text.
   - **Status** — **Active** or **Inactive**. Inactive modules are hidden from normal use.
3. Click **Save**. The new module appears in the list.

To edit a module, click the **pencil** icon on its row. To manage who can see it, click the **shield** (Permissions)
icon. To remove it, click the **trash** icon and confirm.

## Create an Object: step by step

1. On the **Modules** list, click **Objects** on the module that will contain the object.
2. Click **New Object** (top right).
3. In the **New Object** dialog, fill in:
   - **Label (Display Name)** — required.
   - **Name (Key)** — required, `snake_case`.
   - **Description** — optional.
4. (Optional) Fill in **Record settings**:
   - **Title field**: the field shown as each record's name in lookups, related lists and search.
   - **Business unit field**: a field holding a business-unit code. Records are then visible only to that
     unit's members.
   - **Information barrier**: every record of the object sits behind this zone.
   - **Barrier zone field**: a field holding a zone code, so only some records are walled off.

   See [22. Business Units & Information Barriers](10-business-units-and-barriers.md).
5. Click **Save**. The object is created inside the current module.

Edit, Permissions, and Delete work the same way as for modules (pencil, shield, and trash icons). To protect your
data, an object **cannot be deleted** while it holds any records (live or in the Trash) or while another object
links to it (a lookup or formula that points at it, or a dashboard widget that reads it). The message names what
is in the way. Changing an object's **Name (Key)** is refused for the same reasons, when the name is already
taken, and when the old or new name is one of the built-in CRM names (lead, prospect, lead_intake, contact,
account, opportunity, case). Those names store their records in separate `crm_*` tables (see
[How data is stored](../understanding/03-how-data-is-stored.md)); Genesis Capital uses none of them. The **Label**
can always be changed.

## Create a Field: step by step

1. From an object's row, click **Fields**.
2. Click **New Field** (top right).
3. In the **New Field** dialog, fill in:
   - **Label** — required. The visible name of the field.
   - **Name (Key)** — required, `snake_case`.
   - **Field Type** — required. Choose from the full list of supported types (see Reference below).
   - **Placeholder** — optional hint text shown inside the input.
   - **Default Value** — optional value used when a record is first created.
   - **Col Span (1-12)** — how wide the field is on a 12-column grid. Defaults to 6 (half width).
   - **Position** — the numeric order of the field.
   - The checkboxes: **Required**, **Read-only**, **Active**, and **Show in List**.
4. Click **Save**. The field appears in the object's field table.

To change a field, click the **pencil** icon; to remove it, click the **trash** icon and confirm.

### Where a field is used

**Edit Field** lists everything that uses the field, so you can see the impact of a change before you make it. A
field counts as used by:

- formulas on its object, and formulas or roll-ups on other objects that read it through a lookup;
- validation rules of other fields on the object;
- pipeline stage entry rules and the pipeline's mirrored status field;
- the object's title, business unit and barrier zone settings;
- workflows and assignment rule conditions;
- dashboard widgets that read the object.

The list errs on the side of caution: it may show a usage that turns out to be harmless, but it never misses one.

### Renaming, moving and deleting fields

| Change | Rule |
| --- | --- |
| Change the **Label** | Always allowed |
| Change the **Name (Key)** | Refused while the field is used anywhere above, if the name is not a valid key or is already used on the object, and for built-in CRM columns. When allowed, existing record values move to the new name |
| Move to another object | Not allowed |
| Delete | **Delete Field** shows the usages and how many records hold a value; it stays disabled while usages exist. Deactivate the field instead |

When the server refuses a change, its message, naming what is in the way, is shown on screen.

### Removing picklist values

You can remove a **Dropdown** or **Radio Group** option that no record uses at any time. If records still hold a
value you removed, the save is refused ("Values still in use: …", with the number of records) and a **Move to…**
dialog opens. Pick a remaining value for each removed one, and those records are moved to it when the field saves.

### Changes apply immediately

Edits you make in the Builder (new fields, labels, options, objects, forms, pipelines, wizards and dashboards)
reach users' screens straight away.

## Reference: field types

Field types are grouped to make them easier to find. The high-level groups and what they are for:

| Group | Field types | Use for |
| --- | --- | --- |
| Basic | Label, Divider, Text, Text Area, Rich Text, Number, Email, Phone, URL | Plain text, numbers, and layout helpers |
| Select | Dropdown, Multi-Select, Radio Group, Checkbox | Choosing from a fixed set of options |
| Date & Time | Date, Date & Time, Time | Calendar and clock values |
| Numeric | Currency, Percentage, Rating | Money, percentages, and star ratings |
| Special | Color Picker, File Upload, Image, Code Editor, Lookup, Formula, Auto Number, Status Tracker | Advanced or computed values |

Note that **Label** and **Divider** are display-only helpers that hold no data. **Lookup** links to another object,
**Formula** computes a value, **Auto Number** generates a running identifier, and **Status Tracker** shows a record's
progress through stages.

## Reference: key field properties

| Field / Option | What it does | Notes |
| --- | --- | --- |
| Label | The name users see for the field | Required |
| Name (Key) | Internal identifier used by the system | Required, `snake_case`, keep it stable |
| Field Type | Controls the input shown and the data stored | Required, see groups above |
| Placeholder | Hint text inside empty inputs | Optional |
| Default Value | Pre-filled value on new records | Optional |
| Col Span (1-12) | Field width on the 12-column grid | Defaults to 6 |
| Position | Order of the field | Lower numbers appear first |
| Required | Forces a value before saving | Checkbox |
| Read-only | Field cannot be edited by users | Stored on the field's config |
| Active | Whether the field is in use | Inactive fields are hidden |
| Show in List | Adds the field as a column in record list views | Stored on the field's config |

## Reference: module categories

The **Category** on a module decides which sidebar section it falls under.

| Category | Sidebar section |
| --- | --- |
| crm | Modules |
| tools | Tools |

You can also type a category of your own, such as `lending` or `client_360`. It gets its own sidebar section,
titled from the key (`client_360` becomes **Client 360**). No code change is needed. Genesis Capital's 19 modules
use eight such categories: `client_360`, `lending`, `investments`, `advisory`, `growth`, `service`, `compliance`
and `masters`.

## How modules appear in the sidebar

Active modules are grouped under their category heading in the left sidebar. The **Icon** you set is shown next to the
**Label**. Set a module to **Inactive** to hide it without deleting it.

## Tips

- Choose the **Name (Key)** carefully and avoid changing it later, since forms, pipelines, and integrations refer to
  fields and objects by this key. The Builder refuses a rename while anything still uses the key.
- Use **Col Span** and **Position** to get a rough layout right away. For full drag-and-drop layout control, build a
  form for the object in the Form Builder.
- Use **Show in List** to surface the most important fields as columns when users browse records.
- The **Currency** field type lets you pick the currency code when you configure it inside the Form Builder.

## Related guides

- [Form Builder](02-form-builder.md)
- [Pipeline Builder](03-pipeline-builder.md)
- [Wizards](04-wizards.md)

## Troubleshooting

- **Save fails with a validation error** — make sure **Label** and **Name (Key)** are filled in. The Name must be a
  valid `snake_case` key.
- **A module is missing from the sidebar** — confirm its **Status** is **Active** and that your role has permission to
  see it (check the Permissions shield icon).
- **An object or field cannot be deleted** — it still holds records or is used elsewhere; the message says what.
  Move or delete the records (including any in the Trash), or remove the usages, first. For a field, deactivating
  it is usually the better choice.
- **"Values still in use" when saving options** — records still hold a value you removed. Choose a replacement in
  the **Move to…** dialog.
- **A new field does not show on a record screen** — fields you add here are not automatically placed on existing
  forms. Open the object in the Form Builder and add the field to the form layout.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Form builder](02-form-builder.md) — Lay out create/edit forms, validations, dependencies |
| **Previous** | [Products & Services catalogue](../using-the-crm/products-and-services.md) *(Using the CRM)* |
| **Background** | [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md) |
| **Related** | [Platform Builder extensions](../developer-guide/engines/platform-builder-extensions.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Builder guide](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
