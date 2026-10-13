# Reports — Self-Service Reporting

> **Tools → Reports** · `/reports` (browse, run, share, schedule) · `/reports/new` (build).
> Build any report — table, chart, number tiles or matrix — over your CRM data. No code, no SQL,
> and no help from the CRM team.

## What it is

The reporting module lets **anyone on your team** build reports on the CRM's data — leads,
opportunities, cases, tasks, activities and service-level timers.

It is designed so that a non-technical staff member can go from "I need to know X" to a saved,
shared, automatically-emailed report **on their own**. Every choice in the builder is a dropdown or
a tick-box. There is nothing to type except names and numbers: no field codes, no formulas, no
query language.

Everything about a report is configurable. There are no hard-coded reports, and adding a new one
never requires a release.

## Where to find it

| Place | What it's for |
|---|---|
| **Tools → Reports** (`/reports`) | Your report library — folders, favourites, search |
| **New report** (`/reports/new`) | The template gallery, then the builder |
| **Builder → Dashboard Builder** | Put any saved report onto a dashboard *(admins)* |

**Reports lives under Tools, not under Builder.** That is deliberate: Builder is the
administrators' configuration area, and reporting is meant to be yours. Every logged-in user gets
the full builder — there is no "ask an admin" step.

If you are an administrator you will also see a **Reports** shortcut inside Builder, next to
Dashboard Builder. It opens this same page; it exists because dashboard widgets read saved reports,
so it is a convenient jump when you are wiring one up.

What data a report *shows* is still limited by your role — see [Who sees what](#who-sees-what).

---

## Start here: pick a question, not a blank page

Click **New report** and you land on the **template gallery**: about two dozen ready-made reports,
each labelled with the business question it answers.

> *"How much value sits in each stage of our pipeline right now?"*
> *"What is our win rate by lead source?"*
> *"Which open cases are past their service-level target?"*

Pick the closest one, and it opens in the builder already working. Change whatever you like — it is
a draft until you save it, and opening a template never alters the template. Search the gallery by
words like *win rate*, *pipeline*, *overdue*.

If nothing fits, **Start from scratch**.

**Training tip:** have each attendee open a template close to their own job and change one thing —
the grouping, the date range, a filter. That single exercise teaches the whole builder.

---

## The builder, step by step

The left rail is a numbered list of questions. Each gets a green tick when answered, and the
preview on the right updates as you go, so you always see what you are building. A banner tells you
which step still needs attention.

### 1. What do you want to report on?

Choose the kind of record. Each option explains what one row means — *"One row per deal in the
pipeline, with its value, stage and expected close date."*

### Reporting across related records

You can also use fields from **related** records. They are shown with an arrow, and you pick them from
the same list — there is nothing to join and no relationship to set up:

| Looks like | Means | Lets you ask |
|---|---|---|
| **Owner ▸ Name** | The owner's name, not their ID | Pipeline value by owner name |
| **Owner ▸ Branch**, **Owner ▸ Region** | The owner's territory | Won revenue by region |
| **Account ▸ Industry** | The customer's industry | Which industries buy what |

These reach up to two records away — from a deal, through its owner, to that owner's region — so a
question like *"which region closes the most revenue?"* needs no help from anyone.

### 2. How should it look?

| Visualization | Use it to |
|---|---|
| **Table** | List records, or show grouped rows with subtotals |
| **Bar chart** | Compare a measure across categories |
| **Line / Area chart** | Show a trend over time |
| **Pie / Donut chart** | Show each category as a share of the whole |
| **Funnel** | Show drop-off through ordered stages |
| **Number tiles** | One big number per measure — good for dashboards |
| **Matrix** | Cross-tabulate two groupings, with subtotals and totals |

Pick a chart and the builder adds a sensible grouping for you, so you never see an empty chart you
have to diagnose.

When you choose **Table**, the **Which columns?** step opens already ticked with the standard set for
that record type — the same columns the preview is showing. Untick what you don't want, tick anything
else, and **Reset to the standard columns** puts it back. If you untick everything the report falls
back to the standard set, and the step says so.

### 3. How should it be grouped?

Choose the field that becomes your bars, slices or rows. A matrix takes two.

- **Dates** get a period: by day, week, month, quarter or year.
- **Numbers and picklists** can be grouped into **named bands** — click *Group values into bands*.
  For example, turn `amount` into *Under 10k · 10k–50k · 50k–250k · 250k+*. Records with no value
  land in a band you name yourself (default *Other*) — they are never counted as zero.

Bands are the answer to "this chart has 200 bars and tells me nothing".

### 4. What do you want to measure?

Add one or more measures:

- **Number of records** — a count
- **Sum of / Average of / Smallest / Largest** a numeric field
- **Distinct count of** a field

Then, if you want, add a **calculation** that combines two measures you have already added:

| Calculation | Gives you |
|---|---|
| A divided by B | Average deal size (value ÷ deals) |
| A as a % of B | Win rate (won deals ÷ closed deals) |
| A as a % of the total | Each owner's share of total pipeline |
| A minus B / A plus B / A times B | Any simple arithmetic |
| A vs B, % change | A percentage difference |

You pick the two measures and the operation from dropdowns. There is no formula to write, so there
is nothing to get syntactically wrong.

**Show as.** Any measure can be *shown as* a table calculation instead of its plain value — pick it
from the dropdown next to the column heading:

| Show as | Gives you |
|---|---|
| Running total | Cumulative revenue month by month |
| % of total | Each region's share, adding up to 100 |
| Rank | 1 for the largest, 2 for the next… (ties share a rank) |
| Change from previous | This month minus last month |
| % change from previous | The month-on-month growth rate |
| Moving average (3) | A smoothed line over the last three periods |

The calculation follows the order the rows are shown in, and on a matrix it restarts for each column
group — so a running total per owner stays per owner. Totals stay honest: a running total's total is
the plain total, a % of total adds to 100, and a rank has no total.

### 5. Which records should be included?

Build the condition in plain English: **field · is / is not / is any of / contains / is at least /
is within · value**.

Two things make this workable for non-technical staff:

- **The value is a pick-list wherever possible.** Status fields offer their real options; free-text
  fields offer the values that actually exist in your data. You never have to know a status is
  stored as `closed_won`.
- **Dates use named periods** — *Today, Last 7 days, This month, Last quarter, This year, Year to
  date, Last 12 months, This fiscal year, Next 90 days* — so a report stays correct as time passes
  instead of being frozen to fixed dates. The fiscal-year presets follow the **Fiscal Year Start
  Month** in Settings → Localization, so *This fiscal year* means April–March for a company that
  starts in April.

**Ask when running.** Tick *Ask when running* on any condition and the report will prompt whoever
opens it for that value — the value you set here is the default, and leaving the answer blank means
"any". This is how one *Pipeline by stage* report serves every region: the viewer picks the region
at the top instead of you saving one copy per region. Exports and the print view use the answers on
screen.

**Mixing "and" with "or".** Set *Records must match* to **all of these** or **any of these**, and use
**Add group** for anything more involved:

> Stage is Proposal **and** (Owner is Ann **or** Owner is Bob)

Add the two owner conditions inside a group set to *any of these*, and leave the outer level on
*all of these*.

### 6. Totals, comparison and colours

- **Show totals** adds a grand total row, plus a subtotal per group on a matrix. Sums are added up;
  averages and percentages are recalculated over the whole set, so the total row is always truthful
  rather than an average of averages.
- **Compare with** *the previous period* or *the same period last year* adds the previous value and
  the % change to every row, tile and chart. Genesis works out the period on its own if the report is
  **grouped by a date** (by month, quarter, year…) *or* has a **date filter**. Only if it has neither
  does the builder ask you to add one.
  - On a report grouped by month, *previous period* means **the month before** each bar, and
    *same period last year* means **that month a year earlier**.
  - A row with no counterpart in the earlier period reads **"no earlier data"** — not a change from
    zero, which would look like infinite growth.
- **Show top / Row limit** keeps a chart readable. The total row still counts the rows you hid, and
  says so.
- **Colour rules** highlight numbers: *Pipeline value is at least 50000 → green*. Rules are checked
  top-down and the first match wins.

### 7. Name it and choose who can see it

Give it a name, an optional description, a category and a folder — then choose who can see it.

---

## Who sees what

| Setting | Who can view it |
|---|---|
| **Only me** | Nobody else |
| **My team** | You, your manager chain, and everyone who reports to you |
| **Specific roles** | Only the roles you tick |
| **Everyone in my org** | Any signed-in user |

Two rules worth stating in training:

1. **Sharing controls viewing, not editing.** Only you and administrators can change or delete your
   report. Anyone else can use **Save as a copy** and adapt it freely.
2. **Sharing never widens what anyone can see.** A report shared with everyone still shows each
   viewer only the records their role allows. A manager opening your pipeline report sees their
   team's deals; you see yours. Use the **Mine / My team / Everyone** switch in the viewer to move
   between the scopes your role permits.

---

## Run, export and share

Open a report from the library to run it. From the viewer you can:

- **Refresh** — re-run against current data
- **CSV / Excel / PDF** — Excel gives a formatted workbook; PDF opens a print view, then use your
  browser's *Save as PDF*
- **Email me this** — set up an automatic schedule (below)
- **Save as a copy** — your own editable version
- **Run history** — the last 25 runs, including scheduled deliveries
- **Edit / Delete** — if it is yours

### Drill down to the records

Click any bar, slice, row or matrix cell to see **the records behind that number**. The same filters
and the bucket you clicked are re-applied, so what you see is exactly what was counted — and you can
export just those records.

This is the fastest way to answer "why is that number what it is?", and it is worth demonstrating
early: it is what makes people trust the reports.

---

## Have it emailed to you automatically

Open a report and click **Email me this**.

1. **How often** — every hour, every day, every weekday, every week (pick the day), or every month
   (pick the day)
2. **At** — the hour
3. **Send as** — in the email body, an Excel attachment, or a CSV attachment
4. **Also send to** — any extra email addresses, separated by commas (you always receive it)
5. **Note in the email** — optional, e.g. *"Monday pipeline review numbers"*

The dialog echoes the schedule back as a sentence — *"Every Monday at 8:00 AM — Excel attachment"* —
so you can check it at a glance. Press **Send now** to receive one immediately rather than waiting a
week to find out it works.

Schedules can be paused and resumed, and each shows when it will next run and whether the last
attempt succeeded. You can set these up yourself; no administrator is involved.

Each recipient's copy is limited to the data **you** are allowed to see, since the schedule belongs
to you.

### Only send when… (alerts)

Tick **Only send when…** to turn a schedule into an alert. The report still runs on schedule, but
the email only goes out when the condition holds — *Overdue tasks · is greater than · 20*, *Pipeline
value · is less than · 1,000,000*, or *has changed since the last check*. Pick the measure from the
report's own columns (or *Number of rows*). Leave *Email once when it starts being true* ticked and
you will not be emailed every hour for as long as the threshold stays crossed — only when it
crosses again. An alert that fires also appears in your in-app notifications.

The schedule shows *last check: not sent* when the condition was not met, and **Run history** lists
those checks as *not sent*. **Send now** always sends, so you can test the delivery.

---

## What stands out, and over time

Under every report result, **What stands out** lists what the numbers say in plain sentences: which
group leads and by how much, whether the top three make up most of the total, an outlier, the
direction of a trend and its peak, the biggest movers against the previous period, and a warning
when many records have no value for the grouping. These sentences are calculated from the table
you are looking at — nothing is guessed — so every number in them is on screen.

If your administrator has switched on the AI layer, **Explain** writes a fuller summary. It is given
only the table and those findings, and every number it uses is checked against the table before it
is shown; if it strays, you see the calculated findings instead, with a note saying so.

**Over time** appears once a saved report has been run on two or more days. Each run records the
report's totals, so a report that shows *today's* open pipeline also shows how that figure has
moved since you started running it. Scheduled deliveries count as runs, so a daily schedule gives
you a daily point.

---

## Ask Genesis

If the AI layer is switched on you will see **Ask Genesis** in the left rail. Type what you want in
plain English — *"Top 5 owners by won revenue this fiscal year"*, *"Monthly won revenue for
the last 12 months compared with last year"*, *"Open cases by priority and owner"* — and Genesis
builds and runs the report, picks a chart, and tells you what it assumed (*"Won revenue" = total
amount of closed-won opportunities*).

- **It only ever builds reports.** Ask works from the same list of sources, fields and named
  business measures as the builder, and only shows data you are allowed to see. It cannot look
  anything up that the builder cannot.
- **Refine it.** *"Only the top 3"*, *"by month instead"*, *"compare with last year"* — follow-ups
  update the report you are looking at.
- **If it is unsure, it asks** — *"Which sales do you mean?"* with options to click — rather than
  guessing between two different reports. If the data does not exist it says so.
- **Save as report** turns any answer into an ordinary saved report you can edit, share, schedule and
  put on a dashboard.
- **The back arrow goes up one level.** From an answer it returns to the Ask Genesis start screen
  with the suggested questions; from there it takes you back to the report library. Your
  conversation is kept either way — the start screen offers **Back to your last answer** to reopen
  it. Use the eraser (**Start over**) when you actually want to clear it and begin again.
- The little dot next to the model name tells you whether the model is running. Answers take a
  while on a local model — typically half a minute — and the panel says what it is doing.

---

## Organise a growing library

- **Folders** — create your own in the left rail (e.g. *Weekly reviews*, *Board pack*). Deleting a
  folder never deletes reports; they become *Uncategorised*.
- **Favourites** — click the star. Your favourites are yours alone.
- **Created by me** — everything you built.
- **Search** — matches name, description and category.

---

## Put a report on a dashboard

This is the part that used to need a developer, and no longer does.

1. Go to **Builder → Dashboard Builder**.
2. The **Reports** tab lists your saved reports. Click one — it becomes a widget.
3. Genesis picks the widget shape from the report: *Number tiles* → a KPI card, *Table* or *Matrix* →
   a list, any chart → a chart.
4. **Save Dashboard.**

The widget stores only *which report* it shows — not which columns. Refine the report later (rename a
measure, change the grouping, add a filter) and every dashboard using it follows automatically.
Nothing to re-map, nothing that silently breaks.

The **Built-in** tab still offers the ready-made metrics that ship with Genesis, for anything you do
not want to build yourself.

**One date range for the whole dashboard.** A dashboard with report-backed widgets shows a *Date
range for every report widget* picker at the top. Choose *This quarter* and every report widget
re-runs for this quarter on its own primary date — no report is edited, and clearing the picker
returns each widget to how its report was built. Built-in widgets read fixed datasets and are not
affected; the bar says how many widgets it applies to.

---

## Reading a report correctly

Worth covering in training, because these are the things people misread:

- **"Other" / "—" bands** mean *no value recorded*, not zero.
- **A distinct-count total is shown as a dash.** Distinct counts cannot be added up across groups, so
  Genesis leaves the total blank rather than printing a wrong number.
- **"Only the first 20,000 records were included"** means the report needs a filter — usually a date
  range — before its numbers can be trusted.
- **The scope switch changes the numbers.** *Mine* and *Everyone* legitimately give different totals
  for the same report.

---

## Suggested on-site training run (about 90 minutes)

| # | Topic | Time |
|---|---|---|
| 1 | Tour the library: folders, favourites, search | 10 min |
| 2 | Open a template, run it, drill into one bar | 15 min |
| 3 | Change its grouping and date range; save as a copy | 15 min |
| 4 | Build one from scratch: source → chart → group → measure → filter | 20 min |
| 5 | Add a calculation (a ratio or a % of total) and a colour rule | 10 min |
| 6 | Share it, and schedule it with **Send now** to prove it | 10 min |
| 7 | Drop it onto a dashboard | 10 min |

Everyone should leave having saved, shared and scheduled one report of their own.

---

## Troubleshooting

| What you see | What it means |
|---|---|
| *"No records match this report"* | Filters are too narrow — widen the date range or remove a condition |
| *"To compare periods, either group this report by a date… or add a date filter"* | The report has neither, so there is no period to compare against. Group by a date field, or add an **is within** filter |
| *"Pick a period for the date filter…"* | You chose **is within** but left the period on *Choose a period…* |
| *"No matching rows were found in the previous period"* | The earlier period has no data to compare against — widen the range or pick a period that has records |
| A comparison column reads *"no earlier data"* | That row had no counterpart in the earlier period. Expected on the first bar of a series |
| *"Only the first 20,000 records were included"* | Add a filter; the numbers are incomplete until you do |
| *"This report has not been shared with you"* | Ask the owner to change its visibility, or to share it with your role |
| *"Only the person who created this report… can change it"* | Use **Save as a copy** and edit your own version |
| A calculation shows *—* | It divided by zero, or references a measure that is no longer there |
| Territory is grouping by a number | An older report is using the retired *Branch (id)* field. Swap it for **Owner ▸ Branch**, which groups by name |
| A chart has far too many bars | Group the field into bands, or set **Show top** |
| A scheduled email did not arrive | Open **Email me this** — the schedule shows if the last attempt failed. Check your profile has an email address |
| A schedule says *last check: not sent* | It has an **Only send when…** condition and the condition was not met. That is the alert working |
| **Over time** is missing | The report has been run on fewer than two days. Open it again tomorrow, or add a daily schedule |
| **Ask Genesis** is missing from the rail | The AI layer is switched off on the server (`AI_REPORTING_ENABLED`). Everything else works without it |
| Ask says *model offline* | The model server (Ollama by default) is not running or the model is not pulled — the message names the command |
| Ask asked a question instead of answering | Your request could mean two different reports. Pick an option, or say which records and which number you want |
| An Explain summary carries a note about "the numbers check" | The AI's wording used a number that is not in the table, so the calculated findings are shown instead |

---

## Related

- [Dashboard Builder](03-dashboard-builder.md) — put reports on a dashboard
- [AI reporting](../developer-guide/AI_REPORTING.md) — how Ask Genesis works and how to switch it on
- [Roles & Levels](16-roles-and-levels.md) — how data scope is decided
- [Reporting Engine](../developer-guide/REPORTING.md) — how it works under the hood
