# Lead Scoring Rules

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Builder guide](README.md)** › 13 of 20 · **For:** Administrators
> ← [Workflows](12-workflows.md) · [SLA engine](14-sla-engine.md) →
> New to Genesis? Background: [Understanding Genesis › What happens automatically](../understanding/06-what-happens-automatically.md)
<!-- /nav:top -->

> **Builder → Automate** · `/builder/lead-scoring` · Score and qualify leads automatically.

## What it is

Lead Scoring Rules automatically score and qualify your leads. Each rule looks at one lead field, compares it to a
value, and adds (or subtracts) points when it matches. A lead's total score is the sum of all matching rules. The
score then maps to a letter grade (A to F) so your team can quickly see which leads are hottest. You can build
rules from scratch or start from a ready-made default set.

> **Which object this applies to.** The scoring engine scores only records of an object whose API name is
> `lead_intake` (the raw "Lead" object, stored in the `crm_lead_intake` table). It scores nothing else.
> **Genesis Capital has no `lead_intake` object, so these rules have no effect there.** Genesis Capital's
> **Enquiry** carries its own **Lead score** (0–100) and **Grade** (A–F) as formula fields, worked out from the
> amount, whether the enquirer is an existing client, the contact details given, marketing consent and the
> channel. To change that scoring, edit the `score` and `grade` formulas on the Enquiry object in
> [Modules & Objects](01-modules-and-objects.md).

## Where to find it

Sidebar → **Builder** → **Automate** → **Lead Scoring Rules**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- Scoring works only on records of the `lead_intake` object, so the workspace needs that object and some leads in
  it.
- Decide which lead fields signal a good lead — for example job title, industry, annual revenue, or rating.

## Quick start: load the defaults

If you have no rules yet, click **Setup Defaults** (top-right of the header). This creates a starter set of ten
rules across the three rule types — for example "High-value prospect" (+20, annual revenue), "Referred or
introduced" (+25, lead source), "Cold outbound" (−10), "Ruled out" (−30, lead status), "Owner rates it hot" (+15)
and "Reachable by email" (+10). You can then edit or delete any of them. The **Setup Defaults** button only appears
while there are no rules.

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
| equals | Field equals the value (as text). |
| does not equal | Field does not equal the value. |
| contains | Field text contains the value. |
| does not contain | Field text does not contain the value. |
| starts with / ends with | Field text starts or ends with the value. |
| is greater than / is greater than or equal to | Field number is above (or at least) the value. |
| is less than / is less than or equal to | Field number is below (or at most) the value. |
| is one of / is not one of | Field matches (or does not match) one item in a comma-separated list. |
| is empty | Field has no value. |
| is not empty | Field has a value. |

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

- **Scoring runs automatically on `lead_intake` records.** Whenever one is created or updated, the engine
  re-scores it in the background against your active rules. You do not run scoring by hand.
- **Scores appear on the lead itself.** In the module that holds the `lead_intake` object, each lead shows a
  **Score** and a colored **Grade** (A–F) in the list, on the Kanban card and on the lead's detail panel. There is
  no separate "Lead Scoring" screen; the score lives with the lead.
- **Scoring insights.** That module also shows a collapsible **Lead Scoring Insights** panel at the top — grade
  distribution (how many A/B/C/D/F), your top-scoring leads, and headline numbers (total scored, average, highest).
- **Rules must exist first.** If you have no active rules, every lead scores 0 — load **Setup Defaults** or create
  your own before expecting meaningful scores.
- **Back-filling existing leads.** Leads created before scoring was enabled show a score once they are next saved, or
  after an admin calls the bulk re-score API (`POST /api/lead-scoring/bulk-score`).

> **Note:** once a lead is converted to a Prospect it is no longer re-scored automatically (its last lead score
> stays visible for reference).

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
- [Pipeline Builder](03-pipeline-builder.md)
- [Assignment Rules](11-assignment-rules.md)
- [Workflows](12-workflows.md)

## Troubleshooting

- **A lead's score looks too low** — Confirm the relevant rules are **Active** and that each rule's **Lead Field**,
  **Operator**, and **Value** match the data on the lead.
- **A number comparison never matches** — Greater Than and Less Than treat values as numbers. Make sure the lead
  field holds a number (for example `annual_revenue`).
- **Nothing is scored at all** — check that the object is named `lead_intake`. Records of any other object,
  including Genesis Capital's Enquiry, are never scored by these rules.
- **In List never matches** — Enter the list as comma-separated values, for example `Technology, Finance,
  Healthcare`, and check spelling and case.
- **Setup Defaults button is missing** — It only shows when there are no rules yet. Delete your rules or add rules
  manually instead.
- **Deleting a rule did not remove it** — Rules used in existing scores are deactivated rather than deleted by
  design. This is expected.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [SLA engine](14-sla-engine.md) — Service-level policies, targets, business hours and escalations |
| **Previous** | [Workflows](12-workflows.md) |
| **Background** | [Understanding Genesis › What happens automatically](../understanding/06-what-happens-automatically.md) |
| **Related** | [Lead scoring engine](../developer-guide/engines/lead-scoring.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Builder guide](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
