# Assignment Rules

> **Builder → Automate** · `/builder/assignment` · Auto-assign new records to the right employees.

## What it is

Assignment Rules decide who a new record is automatically given to. For each object you can create one or more
rules, and they are evaluated in order — the first rule that produces an assignee wins. Rules support four
strategies: always assign one person, cycle through a pool (round robin), match conditions, or pick the least-busy
team member (load balanced). Every assignment is recorded in an audit log.

## Where to find it

Sidebar → **Builder** → **Automate** → **Assignment Rules**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- You need at least one object whose records you want to assign. See
  [Modules & Objects](01-modules-and-objects.md).
- The employees you want to assign to must already exist and be active so they appear in the people pickers.

## Create a rule: step by step

1. (Optional) Use **Filter by object** at the top to narrow the list to one object.
2. Click **New Rule** in the top-right corner.
3. In the rule form, enter a **Rule Name** (for example, "Enterprise Lead Rule").
4. Choose the **Object** the rule applies to (required).
5. Pick a **Rule Type** by clicking one of the four cards (see the table below):
   - **Fixed** — always assign to one person.
   - **Round Robin** — cycle through a pool of reps.
   - **Rule Based** — match conditions to decide the assignee.
   - **Load Balanced** — the rep with the fewest open records wins.
6. Fill in the fields that appear for the chosen type:
   - **Fixed** — choose an **Assignee**.
   - **Round Robin** or **Load Balanced** — choose **Pool Members**.
   - **Rule Based** — choose an **Assignee (when conditions match)** and add **Conditions** (all must match). For
     each condition set a **field name**, an **operator**, and a **value**.
7. (Optional) Set a **Fallback Assignee** — used if no rule matches any record.
8. Set the **Order Index** (a number). Lower numbers are evaluated first.
9. Leave **Active** checked so the rule is evaluated on new records (uncheck to pause it).
10. Click **Save Rule**.

To change a rule later, click **Edit** on its row. To remove it, click the trash icon.

## Reference: rule types

| Rule Type | What it does | Fields you set |
| --- | --- | --- |
| Fixed | Always assigns matching records to one person. | Assignee. |
| Round Robin | Distributes records evenly by cycling through a pool in order. | Pool Members. |
| Rule Based | Assigns when all conditions match; otherwise this rule is skipped. | Conditions, Assignee (optional). If no assignee is set, it round-robins the pool. |
| Load Balanced | Assigns to the pool member with the fewest **open** records of this object. Closed, trashed and other objects' records are not counted. | Pool Members. |

## Reference: condition operators (Rule Based)

| Operator | Meaning |
| --- | --- |
| `equals` | Field equals the value (as text). |
| `not_equals` | Field does not equal the value. |
| `contains` | Field text contains the value. |
| `starts_with` | Field text starts with the value. |
| `ends_with` | Field text ends with the value. |
| `gt`, `gte`, `lt`, `lte` | Numeric greater / less than (or equal). |
| `in` | Value is in a comma-separated list. |
| `not_in` | Value is not in a comma-separated list. |
| `is_empty` | Field has no value. |
| `is_not_empty` | Field has a value. |

## Reference: other fields

| Field / Option | What it does | Notes |
| --- | --- | --- |
| Fallback Assignee | Person used when no rule produces an assignee. | The last matching rule's fallback is used. |
| Order Index | Sets evaluation order for the object. | Lower numbers run first; first match wins. |
| Active | Whether the rule is evaluated on new records. | Uncheck to pause a rule without deleting it. |

## Tips

- Rules are evaluated **in order by Order Index, lowest first** — and the **first match wins**. Put your most
  specific rules at the top and broad catch-all rules lower down.
- A **Rule Based** rule only assigns when **all** its conditions match. If you want an "any of" behavior, create
  several separate rules instead.
- **Round Robin** remembers its position per rule, so reps get an even share across many records over time.
- **Load Balanced** counts each pool member's current open records of this rule's own object and gives the new
  record to the lightest one. A record in a terminal stage (won, lost, closed — or any stage flagged
  `is_closed` in the Pipeline Builder) does not count, so a long-serving rep is not permanently penalised for
  work they have already finished. Mark your terminal stages, or every closed record keeps counting as load.
- **Deactivated pool members are skipped** by both Round Robin and Load Balanced, and the rule falls through to
  its fallback. If an entire pool is deactivated and the rule has no fallback, nothing is assigned at all — so
  always set a fallback on your last rule.
- **Duplicates in a pool are removed when you save.** Listing somebody twice to give them a double share does
  not work; give them their own Fixed rule above the round-robin instead.
- The condition **field name** must match the underlying CRM field name on the record (for example,
  `lead_source`).
- Set a **Fallback Assignee** on at least one rule so records are never left unassigned.

## Related guides

- [Modules & Objects](01-modules-and-objects.md)
- [Pipeline Builder](04-pipeline-builder.md)
- [Workflows](06-workflows.md)
- [Lead Scoring Rules](08-lead-scoring-rules.md)

## Troubleshooting

- **Records are not being assigned** — Confirm the rule is **Active** and that its **Object** matches the records
  being created. Rules only run for the object they target.
- **The wrong person is assigned** — Another rule with a lower Order Index probably matched first. Reorder your
  rules so the more specific one runs earlier.
- **Round robin keeps picking the same person** — Make sure the Pool Members list has more than one active
  employee.
- **No assignee at all** — No rule matched and no Fallback Assignee was set. Add a fallback to a catch-all rule.
- **An employee is missing from the picker** — They may be inactive. Activate the employee, then reopen the rule
  form.
