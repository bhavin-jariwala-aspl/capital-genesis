# What's New — Simple How-To Guide

A plain-language guide to the newest features: the **Org Chart**, the **SLA Board**,
the new **Leads** module with **inline lead scoring**, and a bulk-import **sample template**.
No jargon — just what each one does and how to use it in a few clicks.

> Looking for every detail? See the full guides: [Org Chart](17-org-chart.md) · [SLA Engine](18-sla-engine.md) ·
> [Lead Scoring Rules](08-lead-scoring-rules.md) · [Daily Operations](DAILY_OPERATIONS.md).

---

## 1. Org Chart — see who reports to whom

### What it does for you
It draws a picture of your whole company — every person and their manager — so you can understand the team
structure at a glance, without asking around.

### Where to find it
Left sidebar → **Builder** → **Manage** → **Org Chart**. (Admins only.)

### How to use it — in 3 steps

1. **Open it.** You'll see cards for people at the top of the company, with their teams hanging below.
2. **Explore.** Click the little arrow under a card to open or close that person's team. Drag the empty space to move
   around, and use the **+ / −** buttons to zoom.
3. **Look someone up.** Type a name in the search box — the chart jumps to them. Click any card to see their details:
   who they report to, their team, and their contact info.

### Try this

- **"Who does Priya report to?"** → Search "Priya", click her card, read the **Reporting line** at the top of the
  panel.
- **"Show me only the Sales team."** → Click a manager's card, then **Focus team**. Click **Show full org** to go back.
- **"Colour the chart by office."** → Change **Colour by** to *Region* or *Branch*.

### Good to know

- This screen is for **viewing only**. To actually change who someone reports to, use the **Employees** screen (there's
  an **Edit** shortcut in the details panel).
- If someone shows up at the very top unexpectedly, they probably have no manager set — worth fixing on the Employees
  screen.

---

## 2. SLA Board — never miss a deadline

### What it does for you
An **SLA** is simply a promise about time — like "reply to a customer within 1 hour" or "finish this task by Friday".
This feature keeps a live countdown on every case, lead, and task, and warns you **before** you run out of time.

### Where to find it

- A **summary appears automatically at the top of your home Dashboard** every time you log in.
- For the full view: left sidebar → **Tools** → **SLA Board**.

### Reading the colours (this is the whole trick)

- 🟢 **Green = On track** — plenty of time.
- 🟡 **Amber = At risk** — time is running low, look at it soon.
- 🔴 **Red = Breached** — the deadline passed, deal with it now.

The big **percentage** is your on-time score: how often you hit your deadlines. Higher is better.

### How to use it — in 3 steps

1. **Glance at your Dashboard.** The bar at the top shows your score and how many items are breached, at risk, or on
   track. The chips on the right are your most urgent countdowns.
2. **Click a red or amber number** (or open the **SLA Board**) to see the full list.
3. **Work top-down.** The list is sorted with the most urgent first. Each row shows what it is, who owns it, and the
   time left. Handle the red ones, then the amber.

### Try this

- **"What's about to breach for me?"** → Open the **SLA Board**, click the **At risk** filter.
- **"How is my team doing?"** → Managers can switch the scope to **My team**; admins can see **Everyone**.

### Good to know

- The countdowns respect **working hours** — a "4-hour" deadline set on Friday evening won't run out over the weekend
  (once your admin sets up a business-hours calendar).
- When something goes at-risk or breaches, the system can automatically **notify you or your manager**, **bump the
  priority**, or **create a follow-up task** — so nothing slips.

---

## For admins — turning SLAs on (one-time)

The SLA Board is empty until someone sets the rules. It takes about two minutes:

1. Go to **Builder** → **Automate** → **SLA Engine**.
2. Click **Seed starter policies** — this creates sensible defaults for cases, leads, and tasks.
3. (Optional) Open a policy to change the target times, or the **Business hours** tab to set your working days,
   timezone, and holidays.

That's it. Within a minute, everyone's Dashboard starts showing live SLA countdowns.

> Technical note for whoever installs updates: the SLA feature needs a one-time database update. Run
> `npm run db:migrate` in the `backend` folder before seeding. Full details in the [SLA Engine guide](18-sla-engine.md).

---

## 3. Leads — a home for raw inbound (before they're prospects)

### What it does for you
There's now a dedicated **Leads** module for raw, unqualified inbound — the people who just filled a form or landed
on a list. You work them, and when one is ready you **convert it into a Prospect**. This keeps cold/bulk leads from
cluttering your working prospect pipeline (the same way Salesforce, Zoho, and HubSpot separate leads from prospects).

### Where to find it
Left sidebar → **Leads** (top of the CRM section, above Prospects).

### How to use it — in 3 steps

1. **Add a lead.** Click **+ New Lead**, fill in name/email/phone/company/source, and **Save**.
2. **Work it.** Move the lead through **New → Contacted → Qualified** (list or Kanban board).
3. **Convert.** On a qualified lead click **Convert to Prospect** (or drag it to the **Converted** lane) — a Prospect
   is created from the lead's details, and the rest of the journey (Prospect → Client → …) continues as before.

---

## 4. Lead scoring — see your hottest leads at a glance

### What it does for you
Every lead is **scored automatically** against your rules and given a grade from **A (hottest) to F (coldest)**, so
your team knows who to call first. There's no separate screen to visit — the score lives right on the lead.

### Where to find it
Open the **Leads** module. You'll see a **Score** number and a colored **Grade** badge on each lead — in the list, on
the Kanban card, and on the lead's detail panel. At the top of the module, the **Lead Scoring Insights** panel shows
the grade distribution and your top-scoring leads.

### Good to know

- Scores update on their own whenever a lead is created or edited.
- If leads show no score, an admin needs to set up scoring rules first: **Builder → Automate → Lead Scoring Rules →
  Setup Defaults**. With no rules, every lead scores 0. See [Lead Scoring Rules](08-lead-scoring-rules.md).

---

## 5. Bulk import — download a ready-made template

### What it does for you
When importing records from a spreadsheet, you no longer have to guess the columns. The import wizard can hand you a
**sample CSV** built from that object's own fields, with an example row — so you just fill it in and upload.

### How to use it — in 2 steps

1. Go to **Import** (the **Import** button on any module's toolbar), and pick the object to import into.
2. Click **Download sample CSV**, open it (it opens cleanly in Excel), fill in your rows under the provided headers,
   then upload it back in the same wizard.

---

## 6. Trash — deleted records can be recovered

### What it does for you
When someone deletes a record (a **Lead**, **Prospect**, or any other item), it no longer vanishes forever.
By default it moves to a **Trash** that admins can recover from — a safety net against accidental deletes.
Regular users don't see or manage the Trash; for them, a deleted record simply disappears as before.

### Where to find it
**Builder → Configure → Pipeline**, then the **Trash** button at the top right (admins only).

### How to use it — in 3 steps

1. A user deletes a record as usual. If the workspace is on the default **soft delete**, it goes to the Trash
   instead of being erased.
2. An admin clicks the **Trash** button to open the recovery bin, and can **Filter by type** (Lead, Prospect, …).
3. Click **Restore** to bring a record back to its list, or the **trash** icon to **delete it permanently**.

### For admins — choosing soft vs hard delete (per pipeline)

Open the pipeline in **Builder → Configure → Pipeline** and use the **Deletion behaviour** toggle. Leave it on
**soft** to keep the recovery safety net, or turn it **off** for **hard** delete (permanent and immediate). Each
pipeline is independent, so you can, say, keep Leads recoverable while making a scratch object hard-delete.

### Good to know

- Restoring returns the record to exactly where it was, including its pipeline stage.
- A permanent delete can't be undone — a record must already be in the Trash before it can be purged.
- End users are never shown the soft/hard setting; it's an admin-only control.

---

## 7. Reports — build your own, no help needed

### What it does for you

You can build any report you need yourself — and share it, have it emailed to you on a schedule, and put it on a
dashboard — without asking anyone technical. Nothing in the builder needs typing except a name and the occasional
number; every other choice is a dropdown.

### Where to find it

**Tools → Reports**. Click **New report** to start.

### How to use it — in 5 steps

1. Click **New report**. You land on a **gallery of ready-made reports**, each labelled with the question it
   answers ("How much value sits in each stage of our pipeline right now?"). Pick the closest one — don't start
   from a blank page unless nothing fits.
2. It opens already working. Work down the numbered steps on the left: **what to report on → how it should look →
   how to group it → what to measure → which records to include**. Each step gets a green tick, and the preview on
   the right updates as you go.
3. Click any bar, slice or row in the preview to see **the records behind that number**. This is the quickest way
   to check a report is telling you the truth.
4. Give it a name, choose who can see it (**Only me / My team / Specific roles / Everyone**), and **Save**.
5. Open it and click **Email me this** to have it arrive automatically — every Monday at 8am, say. Press
   **Send now** to get one straight away and confirm it works.

### Put it on a dashboard

**Builder → Dashboard Builder → reports tab** → click your report. It becomes a widget. Change the report later
and the dashboard follows on its own.

### Good to know

- **Sharing lets people view, not edit.** Only you (and admins) can change your report; anyone else can make their
  own copy from it.
- **Sharing never shows anyone more data than they're allowed.** The same report shows each person only the records
  their role permits — so your totals and your manager's totals can legitimately differ.
- **"Other" and "—" mean *no value recorded*, not zero.**
- If you see **"Only the first 20,000 records were included"**, add a filter — usually a date range — before
  trusting the numbers.
- Everything exports to **CSV, Excel or PDF**.

---

## Quick answers

**Do I need to install anything?** No. These features are already in the app — just look in the sidebar.

**Who can see these?** The **Org Chart** is for admins. The **SLA Board**, **Reports** and the Dashboard summary
are for **everyone** (you only see your own items unless you're a manager or admin).

**Do I need an admin to create a report?** No — that's the point. You build, share and schedule reports yourself.
Admins only get involved if you want a *new kind of record* added to the list of things you can report on.

**Will the SLA numbers update on their own?** Yes — the countdowns tick every second and the data refreshes
automatically. No need to reload the page.

**I don't see any SLA data.** An admin needs to set up SLA policies first (see the admin section above).

## Related guides

- [Org Chart — full guide](17-org-chart.md)
- [SLA Engine — full guide](18-sla-engine.md)
- [Reports — full guide](19-reports.md) (includes a suggested 90-minute training run)
- [Dashboard Builder — full guide](03-dashboard-builder.md)
- [Daily Operations](DAILY_OPERATIONS.md)
