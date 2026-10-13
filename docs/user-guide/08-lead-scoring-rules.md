# Lead Scoring Rules

> **Builder → Automate** · `/builder/lead-scoring` · Score and qualify leads automatically.

## What it is

Lead Scoring Rules automatically score and qualify your leads. Each rule looks at one lead field, compares it to a
value, and adds (or subtracts) points when it matches. A lead's total score is the sum of all matching rules. The
score then maps to a letter grade (A to F) so your team can quickly see which leads are hottest. You can build
rules from scratch or start from a ready-made default set.

## Where to find it

Sidebar → **Builder** → **Automate** → **Lead Scoring Rules**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- Scoring works on records in the **Leads** module, so you should already have leads in the system.
- Decide which lead fields signal a good lead — for example job title, industry, annual revenue, or rating.

## Quick start: load the defaults

If you have no rules yet, click **Setup Defaults** (top-right of the header). This creates a starter set of twelve
rules across the three rule types — for example "Senior Job Title" (+20), "Target Industry" (+15), "High Annual
Revenue" (+25), "Hot Rating" (+25), and "Has Email" (+10). You can then edit or delete any of them. The
**Setup Defaults** button only appears while there are no rules.

## Create a rule: step by step

1. Click **New Rule** in the top-right corner.
2. In the **New Scoring Rule** dialog, fill in the fields:
   - **Rule Name** — a clear name such as "Senior Job Title" (required).
   - **Description** — an optional note about the rule.
   - **Rule Type** — choose **Demographic**, **Behavioral**, or **Engagement** (used to group and report scores).
   - **Lead Field** — the lead field to check (see the field list below).
   - **Operator** — how to compare the field to your value (see the operator table below).
   - **Value** — the value to compare against (for example, `VP, Director, Chief`). Leave blank for the empty
     checks.
   - **Points** — how many points to add when the rule matches. Use a negative number to subtract points.
3. Click **Create Rule**.

To change a rule, click the pencil icon on its row and click **Save Changes**. To remove a rule, click the trash
icon and confirm in the **Delete Rule** dialog.

## Reference: rule types

| Rule Type | What it represents | Examples |
| --- | --- | --- |
| Demographic | Who the lead is. | Job title, industry, company present. |
| Behavioral | What the lead does or is worth. | Annual revenue, rating (hot / warm). |
| Engagement | How reachable or sourced the lead is. | Has email, has phone, referral source. |

## Reference: lead fields

The dropdown offers these lead fields: **Job Title**, **Industry**, **Company**, **Email**, **Phone**,
**Website**, **Lead Source**, **Lead Status**, **Rating**, and **Annual Revenue**.

## Reference: operators

| Operator | Meaning |
| --- | --- |
| Equals | Field equals the value (as text). |
| Not Equals | Field does not equal the value. |
| Contains | Field text contains the value. |
| Not Contains | Field text does not contain the value. |
| Greater Than | Field number is greater than the value. |
| Less Than | Field number is less than the value. |
| In List | Field matches one item in a comma-separated list. |
| Is Empty | Field has no value. |
| Is Not Empty | Field has a value. |

## How scores and grades appear

When a lead is scored, every active rule that matches contributes its points, and the totals are added up (the
total never goes below zero). The result is stored with a per-type breakdown (demographic, behavioral, and
engagement scores). The total maps to a grade band:

| Total score | Grade |
| --- | --- |
| 80 and above | A |
| 60 to 79 | B |
| 40 to 59 | C |
| 20 to 39 | D |
| Below 20 | F |

The header of the Lead Scoring Rules page also shows a count of rules for each type (Demographic, Behavioral,
Engagement) so you can see your coverage at a glance.

## When scoring runs, and where results appear

- **Scoring runs automatically on Leads.** Whenever a **Lead** (in the **Leads** module) is created or updated, the
  engine re-scores it in the background against your active rules. You do not run scoring by hand. Scoring targets
  raw Leads so your team can see which inbound to qualify first — the same approach as Salesforce, Zoho, and HubSpot.
- **Scores appear on the lead itself.** Open the **Leads** module: each lead shows a **Score** and a colored **Grade**
  (A–F) badge in the list and on the Kanban card, plus the same read-only values on the lead's detail panel — just like
  Salesforce/HubSpot show a score on the lead record. There is no separate "Lead Scoring" screen; the score lives with
  the lead.
- **Scoring insights.** The Leads module has a collapsible **Lead Scoring Insights** panel at the top — grade
  distribution (how many A/B/C/D/F), your top-scoring leads, and headline numbers (total scored, average, highest).
- **Rules must exist first.** If you have no active rules, every lead scores 0 — load **Setup Defaults** or create
  your own before expecting meaningful scores.
- **Back-filling existing leads.** Leads created before scoring was enabled show a score once they are next saved, or
  after an admin runs a bulk re-score of the Leads module.

> **Note:** scoring applies to the **Leads** module. Once a lead is converted to a Prospect it is being actively
> worked and is no longer re-scored automatically (its last lead score stays visible for reference).

## Tips

- Keep point values consistent so the A-to-F bands stay meaningful — for example reserve big point swings (20 to
  25) for your strongest signals.
- Use the three rule types to organize your rules; the score breakdown reports points per type.
- A rule applies only while it is active. Inactive rules are skipped during scoring and shown with an **Inactive**
  badge.
- Deleting a rule that has already been used in a score does not remove it — it is deactivated instead, so past
  scores stay explainable.
- The **Value** field is ignored for **Is Empty** and **Is Not Empty**, so you can leave it blank for those.

## Related guides

- [Modules & Objects](01-modules-and-objects.md)
- [Pipeline Builder](04-pipeline-builder.md)
- [Assignment Rules](07-assignment-rules.md)
- [Workflows](06-workflows.md)

## Troubleshooting

- **A lead's score looks too low** — Confirm the relevant rules are **Active** and that each rule's **Lead Field**,
  **Operator**, and **Value** match the data on the lead.
- **A number comparison never matches** — Greater Than and Less Than treat values as numbers. Make sure the lead
  field holds a number (for example `annual_revenue`).
- **In List never matches** — Enter the list as comma-separated values, for example `Technology, Finance,
  Healthcare`, and check spelling and case.
- **Setup Defaults button is missing** — It only shows when there are no rules yet. Delete your rules or add rules
  manually instead.
- **Deleting a rule did not remove it** — Rules used in existing scores are deactivated rather than deleted by
  design. This is expected.
