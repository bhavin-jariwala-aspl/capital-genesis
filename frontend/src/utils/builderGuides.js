/**
 * Configuration guidance for every Builder and Platform section.
 *
 * ── Why this is one registry rather than prose in each page ─────────────────
 * Of the twenty-odd configuration screens, exactly one (Workflows) shipped with
 * an explanatory panel — a bespoke 100-line component used nowhere else. Every
 * other section dropped an admin straight into a form: no statement of what the
 * thing is for, no note on how it is normally set up, and no warning about the
 * mistakes that make a rule silently inert. Configuration screens are where a
 * CRM is won or lost, and the difference between a good one and a bad one is
 * almost entirely whether it tells you *why* before asking you *what*.
 *
 * Putting the content here, as data, means every section gets the same
 * treatment from one component, a new section needs an entry rather than a new
 * panel, and the guidance can be tested — `tests/builderGuides.test.js` checks
 * that every Builder route has one and that none of them are stubs.
 *
 * ── What goes in a guide ────────────────────────────────────────────────────
 * Four parts, each earning its place:
 *
 *   `what`      One sentence: what this section configures. No jargon.
 *   `when`      When to reach for it, and what to use instead when it is the
 *               wrong tool. Choosing the wrong mechanism is the most expensive
 *               configuration mistake and the least documented.
 *   `standards` How this is normally done in a mature CRM. These are practice
 *               notes, not opinions — ordering, naming, scoping, the things
 *               that stop a configuration decaying after six months.
 *   `pitfalls`  The specific ways this section goes wrong *in this product*,
 *               including the engine behaviours that are surprising. Several of
 *               these describe real defects found and fixed; they stay because
 *               the underlying sharp edge is inherent, not because the bug is.
 *
 * Keep every line concrete. "Follow best practices" helps nobody; "a failed
 * condition stops the chain, so put the cheapest check first" is worth reading.
 */

/** @typedef {{ what: string, when?: string, standards?: string[], pitfalls?: string[], docs?: string }} Guide */

/** @type {Record<string, Guide>} */
export const BUILDER_GUIDES = {
  // ══════════════════════════════════════════════════════════════════════════
  // AUTOMATE
  // ══════════════════════════════════════════════════════════════════════════

  '/builder/workflow': {
    what: 'Sequences of steps that run automatically when a record changes, on a schedule, or on demand.',
    when:
      'Reach for a workflow when something should happen *because* a record changed — stamp a field, notify '
      + 'someone, create follow-up work, call another system. Use Assignment Rules instead when the only '
      + 'question is "who owns this?", and the SLA Engine instead when the question is "how long may this take?". '
      + 'Both of those are purpose-built and far easier to reason about than a workflow doing the same job.',
    standards: [
      'Name the outcome, not the mechanism: "notify_manager_on_large_deal" beats "workflow_3".',
      'Put the cheapest, most selective condition first. A failed condition stops the chain, so an early gate '
      + 'is what stops a workflow doing work it will discard.',
      'Build with the "manual" trigger, run it against a real record, read the run log, and only then switch it '
      + 'to an automatic trigger. Every mature CRM team works this way because an automation that fires on '
      + 'live data is expensive to debug.',
      'Prefer "when a specific field changes" over "when a record is updated" whenever you can name the field — '
      + 'on_update fires on every save, including saves that changed nothing you care about.',
      'Notify a role or a field, never a hard-coded employee id. An id breaks silently the day that person '
      + 'changes team, and is the usual reason an alert quietly stops reaching anyone.',
    ],
    pitfalls: [
      'A record-triggered workflow is matched by (object, trigger). Without an object it can never fire — the '
      + 'Object field is required for exactly that reason, and the list flags older workflows that lack one.',
      'An on_update workflow that writes a field can re-trigger itself, or a second workflow watching that '
      + 'field. Two workflows that each set a field the other watches will loop.',
      'A delay or an approval persists the rest of the chain and hands it to the scheduler, so it needs a step '
      + 'to resume into. A delay at the end of a chain simply stops.',
      'An approval with no resolvable approver waits forever — the engine only accepts a decision from the '
      + 'approvers it recorded when the step ran.',
    ],
  },

  '/builder/assignment': {
    what: 'Rules that decide who owns a record the moment it is created.',
    when:
      'Use these for routing ownership. If you need to react to ownership changing, or to do anything beyond '
      + 'setting an owner, that is a Workflow. If you need to guarantee a response time once assigned, that is '
      + 'the SLA Engine.',
    standards: [
      'Rules are evaluated in order and the first match wins, so put the specific rules above the general ones. '
      + 'A catch-all rule at the top makes everything below it dead.',
      'Always give the last rule a fallback owner. An unassigned record belongs to nobody and is the single '
      + 'most common way inbound work goes stale.',
      'Round-robin distributes evenly by count; load-balanced distributes by current open work. Use round-robin '
      + 'for lead distribution where fairness matters, and load-balanced for casework where capacity matters.',
      'Keep pools small and role-based. A pool listing twenty individuals needs editing every time somebody '
      + 'joins or leaves; a pool per team does not.',
    ],
    pitfalls: [
      'A deactivated employee is skipped automatically, and the rule falls through to its fallback. If a whole '
      + 'pool is deactivated and there is no fallback, nothing is assigned at all.',
      'Load-balanced counts *open* records of this rule\'s own object. Closed, trashed, and other objects\' '
      + 'records do not count — otherwise a long-serving rep would look permanently busier than a new joiner '
      + 'and the balance would never recover.',
      'Duplicates in a pool are removed on save. Listing somebody twice to give them a double share does not '
      + 'work; give them their own fixed rule above the round-robin instead.',
      'A rule_based rule with no conditions never matches — ALL conditions must hold, and an empty list is '
      + 'treated as "no rule", not "always".',
    ],
  },

  '/builder/lead-scoring': {
    what: 'Rules that add or subtract points from a lead, producing a score and a grade.',
    when:
      'Use scoring to rank a queue — who to call first. Use a Workflow when crossing a threshold should *do* '
      + 'something, reading the score in a condition.',
    standards: [
      'Score fit and interest separately. Demographic rules say whether a lead is the right kind of customer; '
      + 'behavioural and engagement rules say whether they are ready. A single blended number hides the '
      + 'difference between a perfect-fit lead who is cold and a poor-fit lead who is keen.',
      'Use negative points deliberately. Disqualifiers (a competitor domain, a student job title) are what stop '
      + 'a score from drifting upward for everybody, which is how scoring models lose their meaning.',
      'Keep the total meaningful: if every rule adds points, every lead eventually scores highly. Review the '
      + 'distribution after a month and re-weight.',
      'Start with five to ten rules you can explain to a salesperson. A model nobody can explain is a model '
      + 'nobody trusts, and untrusted scores get ignored.',
    ],
    pitfalls: [
      'Rules apply to leads only, not contacts or opportunities, and they read the lead\'s own columns.',
      'A rule on a field that is usually empty scores nothing. Check how often the field is actually populated '
      + 'before giving it weight.',
      'A rule already used in a calculated score is deactivated rather than deleted, so historic scores stay '
      + 'explainable. Deactivated rules remain in this list — that is deliberate.',
      'Scores are calculated on demand and cached, not recalculated on every edit. A newly added rule affects a '
      + 'lead when its score is next recalculated.',
    ],
  },

  '/builder/sla': {
    what: 'Response and resolution targets, measured against a working calendar, with escalation when they slip.',
    when:
      'Use an SLA when a commitment has a clock — first response within an hour, resolution within two days. '
      + 'Use a Workflow with a delay when you want a nudge after a fixed wait but there is no commitment '
      + 'being measured. Only the SLA engine gives you breach reporting.',
    standards: [
      'Measure against business hours, not wall-clock. A four-hour target that expires overnight is not a '
      + 'target anyone can meet, and it is the fastest way to make a breach report worthless.',
      'Warn before you breach. The warning threshold exists so somebody can still act; 75–80% of the target is '
      + 'the usual setting.',
      'Order policies from specific to general and give the last one a catch-all (no conditions). The first '
      + 'matching policy wins, so an unconditional policy at the top makes everything below it unreachable.',
      'Set targets per priority. One target for everything means either your urgent work is too slow or your '
      + 'routine work is permanently in breach.',
      'Escalate to a person, then to their manager — in that order, with a gap. An escalation that pages three '
      + 'people at once trains everybody to ignore it.',
    ],
    pitfalls: [
      'Each entity is measured on the metrics it supports: cases on first response and resolution, leads on '
      + 'first response, tasks on resolution. Other combinations are rejected on save rather than accepted and '
      + 'silently ignored.',
      'A condition whose operator is not recognised never matches, so a policy with a broken condition applies '
      + 'to nothing rather than to everything.',
      'A task with its own due date uses that date as the resolution target, and the policy\'s minutes are only '
      + 'the fallback.',
      'Removing a target cancels the live timers that depend on it. The history stays, but those records stop '
      + 'being measured.',
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURE
  // ══════════════════════════════════════════════════════════════════════════

  '/builder/modules': {
    what: 'The data model: modules group objects, objects hold fields, and the whole UI is generated from them.',
    when:
      'Add a field here when you need to *store* something. If you only need to show existing data differently, '
      + 'that is the Form or Dashboard builder — adding a field to solve a layout problem is how a data model '
      + 'becomes unmaintainable.',
    standards: [
      'Name fields in snake_case and never rename them afterwards: reports, workflows and integrations all '
      + 'reference the name. Change the label freely — that is what it is for.',
      'Prefer a picklist over free text for anything you will filter, group or report on. Free text cannot be '
      + 'aggregated, and cleaning it up later means touching every existing record.',
      'Make a field required only when a record is genuinely invalid without it. A required field on an early-'
      + 'stage object is how users learn to type "n/a".',
      'Index the fields you filter and sort by, and only those — every index costs write throughput.',
    ],
    pitfalls: [
      'Deleting a field deletes its data. Deactivate first, confirm nothing depends on it, then delete.',
      'Changing a field\'s type does not convert existing values.',
      'A field added here does not appear on a form until the Form Builder places it — that separation is '
      + 'deliberate, so adding storage never disturbs a layout.',
    ],
  },

  '/builder/form': {
    what: 'Which fields appear on a record\'s create and edit forms, in what order and grouping.',
    standards: [
      'Put the fields needed to save the record first, and everything else below. A form ordered by how the '
      + 'data is captured beats one ordered by how the database stores it.',
      'Group related fields into sections of five to seven. Longer sections get skimmed.',
      'Keep the create form short and let the edit form be long. Asking for everything up front is the main '
      + 'reason records get created outside the CRM.',
      'Use field dependencies to reveal detail rather than showing every branch at once.',
    ],
    pitfalls: [
      'A required field left off a form makes that record impossible to save through the UI — validation runs '
      + 'on the server whether the field is displayed or not.',
      'Removing a field from a form hides it; it does not delete the data.',
    ],
  },

  '/builder/appearance': {
    what: 'Theme, brand colour, logo, density and the look of the pre-login page.',
    standards: [
      'Set one brand colour and let the ramp derive from it. Hand-picking each shade produces a palette that '
      + 'fails contrast somewhere.',
      'Check both light and dark. Users pick their own, so a theme that only works in one is broken for half '
      + 'the workspace.',
      'Upload an SVG or a 2× PNG logo; a 1× raster logo looks soft on every modern display.',
    ],
    pitfalls: [
      'Appearance is per workspace, and individual users may still override density and dark mode for '
      + 'themselves. Do not rely on it for anything that must look identical for everyone.',
    ],
  },

  '/builder/dashboard': {
    what: 'Widget dashboards over the analytics datasets and saved reports.',
    standards: [
      'One question per widget, and put the answer in the title. "Premium by month" is a label; "Is premium '
      + 'growing?" is a dashboard.',
      'Five to nine widgets per board. Past that, nobody reads any of them — build a second board.',
      'Lead with the number that matters, then the trend, then the breakdown. Readers scan top-left first.',
      'Restrict a board by role only when it carries something a wider audience should not see; every extra '
      + 'restriction is a board somebody cannot find when they need it.',
    ],
    pitfalls: [
      'The visibility setting names the *least* senior role admitted: set it to Manager and managers, admins '
      + 'and super admins all see it, while ordinary users do not.',
      'Widgets read live data under the viewer\'s own permissions, so two people can legitimately see different '
      + 'numbers on the same board.',
    ],
  },

  '/builder/pipeline': {
    what: 'The stages a record moves through, and what happens when it reaches one.',
    standards: [
      'Name stages after what has been *verified*, not what the team intends to do next: "needs approved" is '
      + 'checkable, "following up" is not. Unverifiable stages are why forecasts drift.',
      'Five to seven stages. More than that and users pick whichever one is nearest.',
      'Mark the terminal stages (won, lost, closed) explicitly. Reporting, forecasting and load-balanced '
      + 'assignment all need to know which stages mean "finished".',
      'Every stage should have an exit criterion somebody could disagree with. If it does not, it is a label.',
    ],
    pitfalls: [
      'Reordering stages does not move the records already in them.',
      'Deleting a stage leaves its records with no stage; move them first.',
    ],
  },

  '/builder/wizard': {
    what: 'Multi-step guided capture for a single record.',
    when:
      'Use a wizard when capture is long, conditional, or done by someone who does it rarely. A short form is '
      + 'better served by the Form Builder — a two-step wizard is just a form with extra clicks.',
    standards: [
      'One decision per step. Steps that ask two unrelated things are where users abandon.',
      'Put the qualifying questions first so a bad-fit record can be abandoned early.',
      'Tell the user how many steps there are. An unbounded wizard feels endless.',
    ],
    pitfalls: [
      'A wizard step reuses a form, so changing that form changes the wizard.',
    ],
  },

  '/builder/documents': {
    what: 'Document categories, required-document checklists, and merge templates.',
    standards: [
      'Make a category required only when the record genuinely cannot proceed without it — required documents '
      + 'that are routinely skipped train everyone to ignore the checklist.',
      'Set retention per category, not globally. Identity documents and marketing collateral do not belong '
      + 'under the same rule.',
      'Restrict the accepted file types per category. "Any file" categories accumulate screenshots of documents '
      + 'rather than documents.',
    ],
    pitfalls: [
      'A checklist is scoped to one entity type, and the entity type is free text — a typo produces a checklist '
      + 'attached to nothing.',
      'Deleting a category does not delete documents filed under it; they become uncategorised.',
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONNECT
  // ══════════════════════════════════════════════════════════════════════════

  '/builder/integrations': {
    what: 'Inbound and outbound connections to other systems, with signing and retries.',
    standards: [
      'Register an integration and reference it by name from workflows, rather than pasting URLs into steps. '
      + 'The integration holds the secret, retries with backoff, and appears in Integration Health.',
      'Always set a signing secret on both directions. An unsigned inbound webhook is an open write endpoint.',
      'Make inbound handlers idempotent — every provider redelivers eventually, and a duplicate that creates a '
      + 'second record is worse than one that is ignored.',
    ],
    pitfalls: [
      'Outbound delivery retries a few times and then gives up; it is at-most-once, not guaranteed. Anything '
      + 'that must not be lost needs reconciliation on the receiving side.',
      'A stored secret is never shown again — it is masked on read. Rotate it rather than trying to recover it.',
    ],
  },

  '/builder/integration-health': {
    what: 'Delivery outcomes for every integration: successes, retries and failures.',
    standards: [
      'Check this after any workflow change that calls out. A step that silently fails looks identical to one '
      + 'that never ran.',
      'Investigate a rising retry count before it becomes a failure count — retries usually mean the far end is '
      + 'slowing down, not broken.',
    ],
  },

  '/builder/email-templates': {
    what: 'Reusable email bodies with merge fields, resolved against a record when sent.',
    standards: [
      'Give every merge field a sensible fallback. "Hi ," is the classic tell of an untested template.',
      'Send yourself a preview against a real record before activating. Merge fields resolve differently per '
      + 'object, and a field that does not exist renders empty rather than failing.',
      'Write a plain-text alternative. Some clients render nothing else, and text-only is what most spam '
      + 'filters score.',
    ],
    pitfalls: [
      'Templates are scoped to an object; using one against a different object leaves its merge fields blank.',
    ],
  },

  '/builder/social-media': {
    what: 'Connected social accounts, scheduled publishing, inbox routing and listening keywords.',
    standards: [
      'Route inbound mentions to a team pool rather than an individual. Social expectations are measured in '
      + 'minutes, so one person\'s day off should not stall the queue.',
      'Keep listening keywords narrow. A broad keyword floods the inbox and the team stops reading it.',
    ],
    pitfalls: [
      'Tokens expire. A silently stalled account looks the same as a quiet one — check Integration Health.',
    ],
  },

  '/builder/push-notifications': {
    what: 'Browser and device push for assignments, mentions and breaches.',
    standards: [
      'Push only what needs acting on now. Anything informational belongs in the in-app list, where it can be '
      + 'read later.',
      'Every push should deep-link to the thing it is about. A notification that opens the home page wastes the '
      + 'interruption it just cost.',
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MANAGE
  // ══════════════════════════════════════════════════════════════════════════

  '/builder/permissions': {
    what: 'What each role may see and edit, per object and per field.',
    standards: [
      'Grant by role, never by person. Per-person exceptions are invisible six months later and are how access '
      + 'reviews fail.',
      'Start from the least access that lets someone do their job and add, rather than starting open and '
      + 'removing. Removing access after the fact tends to break work in ways nobody reports.',
      'Field-level restrictions cost the most to maintain — use them for genuinely sensitive fields '
      + '(compensation, medical, bank details), not for tidiness.',
    ],
    pitfalls: [
      'Admins and above bypass these checks. Testing as an admin proves nothing — test as the role itself.',
      'An object with no explicit rows falls back to the role\'s default scope, which may be wider than you '
      + 'expect. Set rows explicitly for anything sensitive.',
    ],
  },

  '/builder/employees': {
    what: 'User accounts, their roles, and who they report to.',
    standards: [
      'Deactivate rather than delete. Deleting breaks the audit trail and orphans everything the person owned.',
      'Reassign open work *before* deactivating. Assignment rules skip deactivated people, but records they '
      + 'already own stay with them.',
      'Set the reporting line as you create the account — manager-scoped visibility and SLA escalation both '
      + 'read it, and both fail quietly when it is missing.',
    ],
    pitfalls: [
      'Employee IDs and email addresses are unique across the whole platform, not per workspace.',
      'Changing somebody\'s role changes what they can see immediately, on their next request.',
    ],
  },

  '/builder/org-chart': {
    what: 'The reporting hierarchy, and the visibility and escalation that follow it.',
    standards: [
      'Keep it accurate even when it is inconvenient: manager-scoped record visibility and SLA escalation both '
      + 'derive from this, so a stale line means either missing access or a breach nobody hears about.',
      'Avoid deep chains. Every level adds records a manager can see, and depth is what makes "my team\'s '
      + 'pipeline" slow.',
    ],
    pitfalls: [
      'Moving somebody moves their whole subtree with them.',
    ],
  },

  '/builder/roles': {
    what: 'Roles and their authority level, which is what every permission check compares against.',
    standards: [
      'A lower level number means more authority. Level 1 is reserved for the platform operator; tenant roles '
      + 'start at 2.',
      'Add a role only when a group genuinely needs different access. Roles that differ by nothing but their '
      + 'name make permissions harder to reason about for no benefit.',
      'Name roles after the job, not the person or the team. "underwriter" survives a reorganisation; '
      + '"north_team_lead" does not.',
    ],
    pitfalls: [
      'A role in use cannot be deleted — move its employees first.',
      'Inserting a role at an occupied level shifts the roles below it down. Preview the shift before saving.',
    ],
  },
};

/** Section keys, in a stable order. */
export const GUIDE_KEYS = Object.keys(BUILDER_GUIDES);

/**
 * The guide for a route, matching the most specific prefix.
 *
 * Detail routes (`/builder/form/12`) inherit their section's guide, which is
 * what you want: the advice is about the section, not the record.
 */
export function guideFor(pathname) {
  const path = String(pathname ?? '');
  let best = null;
  for (const key of GUIDE_KEYS) {
    if (path === key || path.startsWith(`${key}/`)) {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best ? { key: best, ...BUILDER_GUIDES[best] } : null;
}
