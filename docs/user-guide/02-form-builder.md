# Form Builder

> **Builder → Configure** · `/builder/form` (and `/builder/form/:formId`) · Visually design the create, edit, view,
> search, and modal forms that users see for an object.

## What it is

The Form Builder is a drag-and-drop editor for laying out the fields of an object into a form. You pick a module and
object, choose which kind of form you are building (for example a **create** form), drag field types onto a canvas,
arrange and configure them, then save. The form you build here is what end users see at runtime when they create or
edit records. This screen depends on Modules & Objects — you must have at least one object before you can build a form
for it.

## Where to find it

Sidebar → **Builder** → **Configure** → **Form Builder**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- Create the module and object you are building the form for. See [Modules & Objects](01-modules-and-objects.md).
- It helps (but is not required) to have created some fields on the object already. You can also add brand-new fields
  directly from the canvas while building.

## How the screen is organized

The Form Builder has a top toolbar and three panels:

- **Left — Field Types palette.** All available field types, grouped (Basic, Select, Date & Time, Numeric, Special).
  Drag any type onto the canvas.
- **Center — Form Canvas.** The two-column grid where your form takes shape. Drag to reorder, click a field to
  configure it.
- **Right — Field configuration panel.** Settings for the field currently selected on the canvas.

## Build a form: step by step

1. In the toolbar, choose a **Module** from the first dropdown.
2. Choose an **Object** from the second dropdown (enabled once a module is selected).
3. Choose a **form type** from the third dropdown: **create**, **edit**, **view**, **search**, or **modal**.
4. Use the form selector to either keep building a **+ New Form** or pick an existing form for the object.
5. From the **Field Types** palette on the left, drag a field type onto the **Form Canvas**. A new field is added to
   the form and selected automatically.
6. Click any field on the canvas to open its settings in the right-hand panel, then adjust the **Field**,
   **Validations**, **Dependencies**, **Functions**, and **Access** tabs as needed.
7. Reorder fields by dragging them by the grip handle. Use the field's width toggle to switch between half and full
   width.
8. Click **Save Form** (top right). For a new form the page reloads at its saved address so you can keep editing.

A counter in the toolbar shows how many fields are on the form. A reminder banner appears until you have selected both
a module and an object.

## Working on the canvas

- **Add a field** — drag a type from the palette onto the canvas (or onto an existing field). It is appended to the
  form.
- **Select a field** — click it. The card highlights and its settings open on the right.
- **Reorder** — drag a field by the **grip** handle (the vertical dots on the left of the card) to a new position.
- **Change width** — hover or select a field and click the **chevron** button to toggle between **half width** and
  **full width**. Half-width fields sit two per row; full-width fields span the whole row.
- **Remove a field** — click the **trash** icon on the field card. This takes the field off the form layout.

## Configuring a selected field

The right panel has six tabs:

| Tab | What it does |
| --- | --- |
| Field | Core settings — Label, API Name, Field Type, Placeholder, Help Text, Default Value, Required, Unique, Read-only |
| Look | How the field appears: label position, size, prefix/suffix, description, character counter, rows, numeric step/decimals, choice display, date bounds |
| Validations | Rules checked live in the form **and** by the server on save — see below |
| Dependencies | Show, hide, enable, or require this field based on the value of another field |
| Functions | Define a computed value for the field based on other fields |
| Access | Set field-level permissions for who can see or edit it |

On the **Field** tab, dropdown-style types (**Dropdown**, **Multi-Select**, **Radio Group**) show an **Options** box.
Enter one option per line as `value: Label`. Saved values must be one of the options unless **Allow values outside the
list** is ticked. The **Currency** type shows a **Currency** picker and **Allow negative amounts**; **Rating** has a
**Maximum rating**.

### Look tab

| Setting | What it does |
| --- | --- |
| Label position | Above the input (default), to the left of it, or hidden (the placeholder does the work) |
| Size | Compact, Default or Large input |
| Description | A longer explanation shown under the input, after the help text |
| Prefix / Suffix | Text inside the input, such as `$` or `%` (percentage fields show `%` automatically) |
| Show character count | Live counter for text fields |
| Rows | Height of a text area |
| Step / Decimals / Input min / Input max | Behaviour of the number spinner (validations still decide what is accepted) |
| Choice display | Dropdown, radio list, chips or a segmented control for single-choice fields; chips for multi-select |
| Earliest / Latest | Date picker bounds |

### Validations tab

Every rule is enforced twice: instantly while the user types, and again by the server when the record is
saved, so a rule cannot be bypassed by a script or an import. Rules are grouped, and the groups that suit the
field's type are listed first.

| Group | Rules |
| --- | --- |
| Presence | Required · Requires another field (if this is filled, that one must be too) |
| Text | Min/Max length · Regex pattern · Email, URL, Phone format · One of (allow list) · Not one of (block list) |
| Number | Min/Max value · Whole number · Greater than zero · Zero or more |
| Date | Not before · Not after — a date, or `today` |
| Compare | Equals / Differs from / Greater than / At least / Less than / At most **another field** (pick it from the list) |
| Data | Unique across records (checked on the server) · Custom JS — browser only, never enforced by the API |

Each rule has an **Error message** the user sees. When the server rejects a save, the messages appear under
the offending fields and the form scrolls to the first one.

## Preview mode

Click the **Preview** button (eye icon) in the toolbar to switch the canvas into a runtime-style preview, hiding the
palette and configuration panel. Click **Edit** to return to editing.

## Reference: toolbar controls

| Control | What it does | Notes |
| --- | --- | --- |
| Module dropdown | Picks the module to work in | Resets the object choice when changed |
| Object dropdown | Picks the object the form belongs to | Enabled after a module is chosen |
| Form type dropdown | create, edit, view, search, or modal | Enabled after an object is chosen |
| Form selector | Switch between existing forms or start a new one | Only shown once an object is selected |
| Shield (Permissions) | Manage form-level access | Shown only after the form has been saved |
| Preview / Edit | Toggle runtime preview | Hides the side panels in preview |
| Save Form | Persists fields, the form record, and the layout | Disabled until an object is selected |

## How saving works

When you click **Save Form**, the builder does three things: it creates any brand-new fields you dragged in and
updates existing ones, it creates or updates the form record (using the selected object and form type), and it stores
the field layout — each field's order and width. After a successful save of a new form, the page navigates to that
form's permanent address so further edits update the same form.

## How the form is used at runtime

The form type determines where the layout is used. A **create** form drives the screen users see when adding a new
record; an **edit** form drives editing an existing record; **view**, **search**, and **modal** drive their matching
screens. Field order, width, validations, dependencies, and access defined here all apply when users fill in the form.

## Tips

- Build a **create** form first, then build a matching **edit** form so adding and editing records feel consistent.
- Set field width thoughtfully — pairs of related half-width fields (such as First Name and Last Name) read well side
  by side, while long text areas usually work best at full width.
- For conditional behavior (for example showing a field only when another has a certain value), use the
  **Dependencies** tab rather than creating separate forms.
- Fields you create on the canvas are added to the object itself, so they also appear in
  [Modules & Objects](01-modules-and-objects.md).

## Related guides

- [Modules & Objects](01-modules-and-objects.md)
- [Pipeline Builder](04-pipeline-builder.md)
- [Wizards](05-wizards.md)

## Troubleshooting

- **The Save Form button is disabled** — you must select both a **Module** and an **Object** first. A reminder banner
  appears until you do.
- **A red "Save failed" banner appears** — the save could not complete. Check that required field settings (such as
  Label and Field Type) are valid, then try again.
- **The object dropdown is empty** — the selected module has no objects yet. Create one in
  [Modules & Objects](01-modules-and-objects.md).
- **Dropdown field shows no choices at runtime** — open the field's **Field** tab and add entries in the **Options**
  box, one per line as `value: Label`.
- **The Permissions (shield) button is missing** — save the form at least once; form-level permissions become
  available only after the form exists.
