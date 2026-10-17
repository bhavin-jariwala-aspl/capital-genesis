// Loan Servicing (user guide §9): the loans manager reviews the loan book, a PLR change campaign goes from draft to
// approved — the CRM writes a personalised notice and letter for every variable-rate borrower — and is distributed;
// an RM works the collections follow-up of an account in arrears (call, promise to pay, escalation). Ends on the
// Loan Book dashboard.
import { api, records, poll as poll0 } from '../lib/studio.mjs';

export const title = 'Loan Servicing';

// A lookup that fails while the backend restarts (other agents' changes reload it) is retried.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 400000, ...o });

const OLD = '6.825', NEW = '6.575', EFFECTIVE = '2026-11-01';
const CARD = `→ ${NEW}%`;                       // the campaign's card on the board
const PTP_ACCOUNT = 'LMS-100202', PTP_LOAN = 4729, PTP_FOLLOW_UP = 5353; // 45 days in arrears (Bruno Chan)
const LEGAL_ACCOUNT = 'LMS-08810';                                      // 95 days, no contact, disputed demand letter
const NOTICE_ACCOUNT = 'LMS-08821';                                    // the notice opened in the video
const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10); // Mauritius date

// Undo earlier takes: campaigns and their notices made by this video, the promise to pay and the escalation.
async function reset() {
  const camps = (await records('GCADMIN', 184, { limit: 500 })).filter((r) => !r.data?.ext_ref);
  for (const c of camps) {
    const n = (await records('GCADMIN', 185, { limit: 1000 })).filter((r) => String(r.data?.plr_change_event) === String(c.id));
    if (n.length) await api('GCADMIN', 'POST', '/runtime/records/bulk-delete', { ids: n.map((r) => r.id) });
    await api('GCADMIN', 'DELETE', `/runtime/records/${c.id}`);
  }
  const coll = await records('GCADMIN', 186, { limit: 500 });
  for (const r of coll.filter((x) => x.data?.action === 'escalate' && !x.data?.ext_ref)) await api('GCADMIN', 'DELETE', `/runtime/records/${r.id}`);
  await api('GCADMIN', 'PUT', `/runtime/records/${PTP_FOLLOW_UP}`, { data: { outcome: '', ptp_amount: '', ptp_date: '', notes: 'Early warning: 45 days in arrears (31-60).' } });
  await api('GCADMIN', 'PUT', `/runtime/records/${PTP_LOAN}`, { data: { promise_to_pay_date: '' } });
}

export default async function run(S) {
  const { p } = S;
  await reset();

  const field = (label) => p.locator('dt').filter({ hasText: new RegExp(`^${label.replace(/[()%/.+]/g, '\\$&')}$`, 'i') }).locator('visible=true').first().locator('xpath=..');
  const showField = async (label, ms = 2600) => {
    const f = field(label);
    await f.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await p.waitForTimeout(500);
    await S.highlight(f, ms);
  };
  const board = (name) => S.waitCut(async () => {
    await S.openObject(name);
    await p.locator('button[title="Pipeline"]').first().waitFor({ timeout: 60000 });
    await S.view('Pipeline');
    await p.locator('div.min-w-\\[260px\\]').first().waitFor({ timeout: 60000 });
  });
  const table = (name) => S.waitCut(async () => {
    await S.openObject(name);
    await p.locator('main table tbody tr').first().waitFor({ timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(600);
  });
  const row = (text) => p.locator('main table tbody tr').filter({ hasText: text }).first();
  const search = async (text) => {
    const box = p.locator('main input[placeholder="Search..."], main input[placeholder="Search…"]').first();
    await S.moveTo(box);
    await S.type(text, 70);
    await p.waitForTimeout(1200);
  };
  // Save a form the server or the form is expected to refuse; returns once the message is visible.
  const submitRefused = async () => {
    const btn = p.locator('form button[type=submit]').last();
    const resp = p.waitForResponse((r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 60000 }).catch(() => null);
    await S.moveTo(btn);
    const err = p.locator('.form-error, [role=alert]').filter({ hasText: /promise to pay/i }).first();
    await Promise.race([err.waitFor({ timeout: 60000 }), resp]);
    await err.waitFor({ timeout: 15000 }).catch(() => S.issue('no visible message for the refused promise to pay'));
    await err.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
    return err;
  };

  await S.waitCut(() => S.go('/login'));
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 8',
    title: 'Loan Servicing',
    text: 'Looking after loans once they are booked: the loan book, PLR changes and early-warning collections.',
    bullets: [
      'Review the loan book and an account in arrears',
      'Draft a PLR change campaign — and its approval gate',
      'Notices and letters for every variable-rate borrower',
      'Distribute the notices by email',
      'Collections: a call, a promise to pay, an escalation',
      'The Loan Book dashboard',
    ],
    foot: 'Personas: Rajiv Doorgakant (Loans Manager) · Sophie Lagesse (Loans Executive) · Bruno Chan (Relationship Manager)',
  }, 8000);

  // ── 1. Loan book ────────────────────────────────────────────────────────────────────────────────────────────
  await S.step(1, 'Loan book', 'The loan book is a daily snapshot from the loan system (LMS)', 'The LMS stays the system of record — the CRM services from it', 3000);
  await S.login('GCLMGR', 'Loans manager — reviews the book every morning');
  await table('loan_account');
  await S.say('Lending ▸ Loan Servicing ▸ Loan Book: one row per loan account', 'Rate, days in arrears, arrears bucket, maturity and LTV for every account');
  await p.waitForTimeout(3500);
  await S.say('Show only the accounts in arrears: search for “In arrears”', 'Sort by any column — e.g. days in arrears');
  await search('In arrears');
  const daysHdr = p.locator('main th').filter({ hasText: /Days in arrears/i }).first();
  if (await daysHdr.count()) { await S.moveTo(daysHdr); await p.waitForTimeout(500); await S.moveTo(daysHdr); }
  await p.waitForTimeout(2500);
  await S.say(`Open ${PTP_ACCOUNT} — a home loan 45 days in arrears`);
  await S.moveTo(row(PTP_ACCOUNT).locator('td').nth(1));
  await S.waitCut(() => field('Current rate %').waitFor({ timeout: 60000 }));
  await p.waitForTimeout(800);
  await S.say('Outstanding principal and the current rate: PLR minus the product margin', 'Variable (PLR-linked) loans follow every PLR change');
  await showField('Current rate %');
  await S.say('Monthly instalment and the next due date', 'Borrowers get an SMS reminder three days before each instalment, in their language');
  await showField('Monthly instalment', 2200);
  await showField('Next instalment', 2200);
  await S.say('Days and amount in arrears, the bucket, maturity and the current LTV', 'An account entering arrears opens a collections follow-up for its RM automatically');
  await showField('Days in arrears', 2000);
  await showField('Current LTV %', 2400);

  // ── 2. PLR change campaign (maker) ─────────────────────────────────────────────────────────────────────────
  await S.step(2, 'PLR change campaign', `ALCO has decided to cut the Genesis PLR by 25 bps, from ${OLD}% to ${NEW}%`, 'The loans executive drafts the campaign that tells every variable-rate borrower', 3500);
  await S.login('GCLOAN1', 'Loans executive — prepares the campaign');
  await S.waitCut(() => S.newRecord('plr_change_event'));
  await S.say('Loan Servicing ▸ PLR Change ▸ New: old rate, new rate, effective date');
  await S.fill('plr_change_event', { old_rate: OLD, new_rate: NEW, effective_from: EFFECTIVE });
  await S.say('“Approved by” stays empty — the campaign is only a draft', 'A small, realistic change keeps the demo book sensible');
  await p.waitForTimeout(2600);
  await S.submit();
  await board('plr_change_event');
  await S.say('The campaign starts in Draft', 'Draft ▸ Approved ▸ Notices generated ▸ Distributed');
  await p.waitForTimeout(2600);
  await S.say('Try to move it to Approved…');
  await S.drag(CARD, 'Draft', 'Approved', { expectFail: true, after: 600 });
  await S.say('Blocked: an approval must name the approver (the ALCO decision)', 'The loans manager signs the campaign off — not the person who drafted it');
  const refusal = p.getByText(/before moving to Approved/).first();
  if (await refusal.count()) await S.highlight(refusal.locator('xpath=ancestor::div[contains(@class,"gap-3")][1]'), 4000); else { S.issue('no visible message for the refused move'); await p.waitForTimeout(4000); }

  // ── 3. Collections (RM) ────────────────────────────────────────────────────────────────────────────────────
  await S.step(3, 'Collections follow-up', 'Meanwhile, the RM works the early-warning follow-ups', 'Each account in arrears got a call to make, opened by the daily arrears check', 3200);
  await S.login('GCRM3', 'Relationship manager — owns the borrowers in arrears');
  await table('collection_action');
  await S.say('Loan Servicing ▸ Collections: arrears bucket, action, date and outcome', 'History stays on the list: earlier calls, demand letters, disputes');
  await p.waitForTimeout(3500);
  await S.say(`Log the call on ${PTP_ACCOUNT}: the borrower promises to pay`, 'Edit the follow-up the CRM opened and record the outcome');
  await S.waitCut(() => S.editRecord('collection_action', PTP_FOLLOW_UP));
  await S.fill('collection_action', { outcome: 'ptp' });
  await S.fill('collection_action', { ptp_amount: '316583', notes: 'Called Mrs Duval: salary paid late this month. She will clear the arrears in full by 30 October.' }, { delay: 10 });
  await S.say('Save without the promised date…');
  const err = await submitRefused();
  await S.say('Refused: a promise to pay needs the amount and the date', 'So nobody chases a promise without knowing when it is due');
  await S.highlight(err.locator('xpath=..'), 3500);
  await S.say('Add the date she gave and save again');
  await S.fill('collection_action', { ptp_date: '2026-10-30' });
  await S.submit();
  await S.say('The promise is written on the loan account', 'Promise to pay by: the date everyone sees on the loan');
  await S.waitCut(() => poll(async () => {
    const r = await api('GCRM3', 'GET', `/runtime/records/${PTP_LOAN}`);
    return String(r.data?.data?.promise_to_pay_date ?? '').startsWith('2026-10-30');
  }, { what: 'promise to pay on the loan' }));
  await S.waitCut(() => S.openRecord('loan_account', PTP_LOAN));
  await S.waitCut(() => field('Promise to pay by').waitFor({ timeout: 60000 }));
  await showField('Promise to pay by', 3200);

  await S.say(`${LEGAL_ACCOUNT}: 95 days, no contact, and the demand letter is disputed`, 'Time to escalate — log a new collections action');
  await S.waitCut(() => S.newRecord('collection_action'));
  await S.fill('collection_action', { loan_account: LEGAL_ACCOUNT, action: 'escalate', action_date: today() });
  await S.fill('collection_action', { notes: 'No payment since July, demand letter disputed without grounds. Refer to legal for recovery.' }, { delay: 10 });
  await S.submit();
  await S.say('Escalated — the loans manager is alerted at once', 'Bucket 90+: the case now follows the legal recovery route');
  await p.waitForTimeout(2800);

  // ── 4. Approval (checker) ──────────────────────────────────────────────────────────────────────────────────
  await S.step(4, 'Approve the campaign', 'The loans manager signs the PLR change off', 'Four eyes: drafted by the executive, approved by the manager', 3000);
  await S.login('GCLMGR', 'Loans manager — approves the PLR change campaign');
  const bell = p.locator('button[title="Notifications"]').first();
  if (await bell.count()) {
    await S.moveTo(bell);
    const esc = p.getByText(/Escalated to legal/).first();
    if (await esc.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) {
      await S.say('His notifications: the escalation from collections is already there');
      await S.highlight(esc.locator('xpath=ancestor::*[self::a or self::button or self::li][1]'), 3200);
    }
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
  }
  const camp = await poll(async () => (await records('GCLMGR', 184)).find((r) => !r.data?.ext_ref && Number(r.data?.new_rate) === Number(NEW)), { what: 'campaign' });
  await S.waitCut(() => S.editRecord('plr_change_event', camp.id));
  await S.say('Record who approved it — here the ALCO meeting he chaired');
  await S.fill('plr_change_event', { approved_by: 'Rajiv Doorgakant — ALCO meeting of 14 October 2026' }, { delay: 18 });
  await S.submit();
  await board('plr_change_event');
  await S.say('Now move it to Approved', 'This time the gate lets it through');
  await S.drag(CARD, 'Draft', 'Approved', { after: 1200 });
  await S.say('Approving changes no rate by itself', 'The PLR, the website “Rate from” and new loan pricing change when the new rate is entered in Masters ▸ Genesis PLR History');
  await p.waitForTimeout(4500);

  // ── 5. Notices generated ───────────────────────────────────────────────────────────────────────────────────
  await S.step(5, 'Notices generated', 'The CRM now writes a notice for every variable-rate borrower', 'Same balance and remaining term, new rate: the new instalment is calculated for each loan');
  await S.waitCut(() => poll(async () => {
    const r = await api('GCLMGR', 'GET', `/runtime/records/${camp.id}`);
    // The campaign moves itself once every notice is written (several minutes on a busy server — cut from the video).
    return r.data?.pipeline_stage_id === 496 ? r.data : null;
  }, { what: 'notices generated', every: 5000, timeout: 1800000 }));
  await board('plr_change_event');
  await S.say('Done: the campaign moved itself to Notices generated', 'Notices counted on the campaign; the loans manager is told they are ready');
  await S.highlight(S.column('Notices generated').getByText(CARD).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3500);
  await S.say('Open Loan Servicing ▸ PLR Notices');
  await table('plr_notification');
  await search(`${NEW}%`);
  await S.say('PLR Notices: one per loan — borrower, new rate, change in instalment', 'Fixed-rate and settled loans are left out');
  await p.waitForTimeout(4000);
  await S.say(`Open the notice for ${NOTICE_ACCOUNT}`);
  await S.moveTo(row(NOTICE_ACCOUNT).locator('td').nth(1));
  await S.waitCut(() => field('Old instalment').waitFor({ timeout: 60000 }));
  await p.waitForTimeout(600);
  await S.say('Old and new rate, old and new instalment', 'The loan\'s margin is kept: only the PLR part of the rate moves');
  await showField('Old rate %', 1800);
  await showField('New rate %', 1800);
  await showField('Old instalment', 1800);
  await showField('New instalment', 2600);
  await S.tab('Docs');
  const letter = p.getByText(/PLR change notice/).first();
  await S.waitCut(() => letter.waitFor({ timeout: 60000 }).catch(() => S.issue('PLR letter not on the Docs tab')));
  await S.say('The personalised letter was generated and filed on the notice', 'Docs tab — ready to email, print or post');
  await letter.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
  await p.waitForTimeout(700);
  await S.highlight(letter.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 2500);
  await S.moveTo(letter, { click: false });
  const preview = p.locator('button[title="Preview"]').first();
  if (await preview.waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) {
    await S.moveTo(preview);
    await S.waitCut(() => p.locator('iframe').last().waitFor({ timeout: 60000 }).then(() => p.waitForTimeout(2500)).catch(() => S.issue('letter preview did not open')));
    // The studio overlay is injected into every frame: keep the caption and cursor only on the page itself.
    for (const f of p.frames()) if (f !== p.mainFrame()) await f.addStyleTag({ content: '#__st_cap,#__st_cursor,#__st_ring{display:none!important}' }).catch(() => {});
    await S.say('Rate and instalment before and after the effective date', 'The term of the loan does not change');
    await p.waitForTimeout(6000);
    const close = p.getByRole('button', { name: 'Close', exact: true }).last();
    if (await close.count()) await S.moveTo(close); else await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
  } else S.issue('no Preview button on the letter');

  // ── 6. Distributed ─────────────────────────────────────────────────────────────────────────────────────────
  await S.step(6, 'Distribute', 'Notices checked: move the campaign to Distributed', 'Every notice is emailed to its borrower, in English or French');
  await board('plr_change_event');
  await S.drag(CARD, 'Notices generated', 'Distributed', { after: 1000 });
  await S.say('Distributed: the emails go out and each notice is marked Sent');
  await S.waitCut(() => poll(async () => {
    const n = (await records('GCLMGR', 185, { limit: 1000 })).filter((x) => String(x.data?.plr_change_event) === String(camp.id));
    return n.length && n.every((x) => x.data?.status === 'sent') ? n : null;
  }, { what: 'notices sent', timeout: 1200000 }));
  await table('plr_notification');
  await search(`${NEW}%`);
  await S.say('Every notice is now Sent, with the date', 'The delivery log: bounces are flagged for a call or a letter by post');
  await p.waitForTimeout(4000);
  await S.moveTo(row(NOTICE_ACCOUNT).locator('td').nth(1));
  await S.waitCut(() => field('Old instalment').waitFor({ timeout: 60000 }));
  await S.tab('Activity');
  await S.say('The email is on the notice\'s Activity timeline', 'What the borrower was told, and when');
  const mail = p.getByText(/Email sent: Change in the Genesis Prime Lending Rate/).first();
  await mail.waitFor({ timeout: 30000 }).catch(() => S.issue('PLR email not on the Activity tab'));
  await S.highlight(mail.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3500);

  // ── 7. Dashboard ───────────────────────────────────────────────────────────────────────────────────────────
  await S.step(7, 'Loan Book dashboard', 'Dashboard ▸ Loan Book', 'Outstanding by product, arrears buckets, LTV bands, PLR-linked share and collections outcomes');
  await S.moveTo(p.locator('aside a[href="/"], nav a[href="/"]').filter({ hasText: 'Dashboard' }).first());
  await S.settle(1200);
  const pick = p.locator('main select').filter({ has: p.locator('option', { hasText: 'Loan Book' }) }).first();
  await S.waitCut(() => pick.waitFor({ timeout: 60000 }));
  await S.moveTo(pick, { click: false });
  await pick.selectOption({ label: 'Loan Book' });
  await S.waitCut(() => p.getByText('Arrears buckets', { exact: true }).first().waitFor({ timeout: 60000 }));
  await S.settle(1500);
  await p.waitForTimeout(4000);
  await S.scroll(450, 3500);
  await S.say('The promise to pay just logged is in the collections outcomes', 'Click any chart to open the accounts behind it');
  await S.scroll(450, 3500);

  await S.logout();
  await S.card({
    eyebrow: 'Summary',
    title: 'Loan Servicing',
    text: 'The LMS keeps the books; the CRM services the borrowers.',
    bullets: [
      'Loan book: rate, instalment, arrears, maturity, LTV',
      'PLR campaign drafted, then approved by the manager',
      'A notice and letter for every variable-rate loan',
      'Distributed by email — logged on each notice',
      'Arrears open a follow-up; promises and escalations recorded',
      'The PLR itself changes only in Masters',
    ],
  }, 7000);
}
