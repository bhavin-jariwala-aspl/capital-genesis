# Wizards

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Builder guide](README.md)** › 4 of 20 · **For:** Administrators
> ← [Pipeline builder](03-pipeline-builder.md) · [Dashboard builder](05-dashboard-builder.md) →
> New to Genesis? Background: [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md)
<!-- /nav:top -->

> **Builder → Configure** · `/builder/wizard` · Build multi-step, form-driven flows that capture records for an
> object.

## What it is

A wizard is a multi-step flow that guides a user through several screens to create a record for an object. Each
step can attach a form (built in the Form Builder), collect a slice of the data, and run validation rules. Once
linked to an object, the wizard appears as a button on that object's tab and runs at `/wizard/<id>`.

At runtime the wizard uses a modern, engaging stepper: a **vertical progress rail** on desktop (with a gradient
spine, a glowing current step, and green checks on completed steps) that collapses to a compact **segmented
progress bar** on phones. Each step slides into an airy card, a progress line and encouraging message keep the
user oriented, and any completed step in the rail is clickable to jump back. The whole experience stays fully
metadata-driven — everything you see is generated from the steps and rules you configure in the Builder.

## Where to find it

Sidebar → **Builder** → **Configure** → **Wizards**. Requires an **Admin** or **Super Admin** role.

The page lists every wizard with its linked object, submit label, and active status. The Genesis Capital pack
ships eleven, for example **Real Estate Loan Application** (Loan Application) and **Investor Questionnaire**
(Risk Profile). Each of their steps links a form of type `wizard_step` that the pack creates for that step.

## Before you begin

- The object the wizard creates records for should already exist (see
  [Modules & Objects](01-modules-and-objects.md)).
- Build the forms you want to attach to each step first (see [Form Builder](02-form-builder.md)).

## Create a wizard: step by step

1. Go to **Builder → Configure → Wizards** and click **New Wizard**. The **New Wizard** modal opens.
2. Enter a **Name** (required). The internal name is generated automatically from this label.
3. Choose a **Module**, then choose an **Object** from that module. A note confirms the wizard button will appear
   on that object's tab.
4. (Optional) Set a **Submit Label** (the final button text, for example `Submit`), a **Success Message** shown
   after completion, and a **Description**.
5. Click **Save**. The wizard is created and opens in the step editor.

### Add and configure steps

1. In the wizard's step editor, click the **+** button (top right of the step list) or **Add first step**.
2. Type a **Step name** and press **Enter** (or click **Add**). The step is added to the bottom of the list.
3. Click a step to open the **Step Configuration** panel on the right and set:
   - **Step Name** — the step's display title.
   - **Description** — a short note about what the step collects.
   - **Linked Form** — the form shown on this step (or **— None —**).
   - **Validation Rules** — an optional, structured list of rules applied to the step (see
     [Step validation rules](#step-validation-rules) below). No JSON required.
4. Click **Save** in the step panel to store your changes.
5. Reorder steps by dragging the grip handle on a step row up or down; the step numbers update automatically.
6. Delete a step with the **trash** icon on its row.

Back on the wizard list, use the **shield** (Permissions) icon to control which roles can run the wizard, the
**pencil** icon to edit the wizard's details, and the **trash** icon to delete it.

## Reference: fields & options

### Wizard details (New / Edit Wizard modal)

| Field | What it does | Notes |
| --- | --- | --- |
| Name | The wizard's display label | Required; internal name is auto-generated |
| Module | Narrows the object list to one module | Determines which module page shows the wizard |
| Object | The object the wizard creates records for | The wizard button appears on this object's tab |
| Submit Label | Text on the final submit button | Optional; defaults to `Submit` |
| Success Message | Message shown after the wizard finishes | Optional |
| Description | Free-text notes about the wizard | Optional |

### Step configuration

| Field | What it does | Notes |
| --- | --- | --- |
| Step Name | The step's display title | Shown in the step list and at runtime |
| Description | Short note about the step | Optional |
| Linked Form | The form rendered on this step | Pick a form, or **— None —** |
| Validation Rules | Extra validation enforced before the user can continue | Built visually — see below |
| Drag handle | Reorders the step | Step numbers update automatically |

### Step validation rules

Each step can enforce its own rules **on top of** the field-level validation defined in the linked form
(required, type, etc.). This is where you add checks that span more than one field or need a specific range or
format. Rules are built visually — no JSON.

In the **Step Configuration** panel, under **Validation Rules**:

1. Leave **Block Continue until every rule on this step passes** ticked to stop the user advancing while any
   rule fails (untick it to make the rules advisory only).
2. Click **Add rule** and set:
   - **Field** — the field the rule checks. If the step has a **Linked Form**, this is a dropdown of that form's
     fields; otherwise type the field name.
   - **Operator** — what to check (see the table below).
   - **Value / comparison field** — the number, text/pattern, or other field the operator compares against
     (hidden for operators like *Is required* that need no value).
   - **Message** — an optional friendly error to show; a sensible default is generated if you leave it blank.
3. Add as many rules as you need, then click **Save**. Remove a rule with its trash icon.

At runtime, when the user clicks **Continue**, every rule is evaluated. Failing rules appear in a summary at the
top of the step and the wizard stays put until they pass (when *Block Continue* is on). Cross-field operators can
reference values the user entered on **earlier** steps too.

| Operator | Checks that the field… | Needs |
| --- | --- | --- |
| Is required | Has a value | — |
| Minimum (number ≥) | Is a number at least the given value | A number |
| Maximum (number ≤) | Is a number at most the given value | A number |
| Min length | Has at least N characters | A number |
| Max length | Has at most N characters | A number |
| Matches pattern (regex) | Matches the regular expression | A pattern |
| Equals value | Exactly equals the given text | Text |
| Must match another field | Equals another field's value (e.g. confirm email) | A field |
| Date after another field | Is a later date than another field | A field |
| Date before another field | Is an earlier date than another field | A field |
| Greater than field | Is numerically greater than another field | A field |
| Less than field | Is numerically less than another field | A field |

## Tips

- Build your forms first in the [Form Builder](02-form-builder.md), then attach one per step via **Linked Form**.
- Keep each step focused on a single slice of data (for example one step for the applicant, one for income, one
  for the property) so the flow feels short and clear.
- The order of steps in the editor is the order users walk through at runtime, so arrange them logically.
- Add **Validation Rules** only when you need step-level checks beyond what the linked form's fields already
  enforce — for example a loan amount range, or an end date that must fall after a start date.
- Completed steps are clickable in the runtime progress rail, so users can hop back to review or edit — keep step
  names short and specific so that rail reads clearly.

## How it works at runtime

- Once linked to an object, the wizard surfaces as a button on that object's tab.
- Opening it navigates to `/wizard/<id>`, where the steps run in order.
- Each step renders its linked form inside the stepper (vertical rail on desktop, segmented bar on mobile). The
  user moves forward with **Continue**; any step **Validation Rules** are checked first and block advancing if
  they fail. Completed steps show a green check and can be revisited from the rail.
- The final step's button uses the wizard's **Submit Label**, and on success the **Success Message** is shown on
  a celebratory completion screen.

## Related guides

- [Modules & Objects](01-modules-and-objects.md)
- [Form Builder](02-form-builder.md)
- [Pipeline Builder](03-pipeline-builder.md)

## Troubleshooting

- **The wizard button does not appear on a tab** — the wizard must be linked to an object. Edit the wizard and
  confirm a **Module** and **Object** are selected, then save.
- **A step shows no fields** — the step has no **Linked Form**, or the form is empty. Open the step and pick a
  form, or add fields to that form in the Form Builder.
- **Validation Rules do not take effect** — check that **Block Continue until every rule on this step passes** is
  ticked, that each rule has a **Field** and (where required) a value/comparison field selected, and that the
  field names match those on the linked form. Re-open the step and **Save** after any change.
- **Steps run in the wrong order** — reorder them by dragging the grip handle in the step list; the numbers and
  runtime order update automatically.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Dashboard builder](05-dashboard-builder.md) — Widgets, charts and role home dashboards |
| **Previous** | [Pipeline builder](03-pipeline-builder.md) |
| **Background** | [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Builder guide](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
