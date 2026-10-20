// Commercial Lending: a corporate term loan from the RM's request to an active facility, then covenant monitoring
// (user guide §9 "Commercial Lending"). Corporate RM originates, credit analyst spreads and grades, the approval
// matrix routes the decision, the RM perfects security and activates; a covenant test in breach raises the alert.
import { api, records, poll as poll0, obj } from '../lib/studio.mjs';

export const title = 'Commercial Lending';

// A lookup that fails while the backend restarts is retried rather than failing the take.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 400000, ...o });

const BORROWER = 'Port Louis Logistics Ltd';
const GROUP = 'Doorga Group';
const CARD = `${BORROWER} · Revolving / working capital`;
const PICK = `${BORROWER} · Revolving`; // the facility picker searches by facility name
const AMOUNT = 15000000; // MUR 15m: above the Loans Manager's MUR 5m band → Credit Committee
const year = new Date().getFullYear();

export default async function run(S) {
  const { p } = S;
  const [cf, fs, cov, ct] = await Promise.all([obj('credit_facility'), obj('financial_spread'), obj('covenant'), obj('covenant_test')]);
  const find = async (o, pred, as = 'GCADMIN') => (await records(as, o.id, { limit: 500 })).filter(pred).sort((a, b) => b.id - a.id)[0];
  const data = async (o, id, as = 'GCADMIN') => (await api(as, 'GET', `/runtime/records/${id}`)).data?.data ?? {};

  // Housekeeping before the take (not filmed): trash the facility a previous take created, with its spreads,
  // covenants and tests, so the board shows one card for this borrower and the group exposure is not doubled.
  await S.waitCut(async () => { for (const old of (await records('GCADMIN', cf.id, { limit: 500 })).filter((r) => r.data?.name === CARD)) {
    for (const o of [ct, cov, fs]) {
      for (const r of (await records('GCADMIN', o.id, { limit: 500 })).filter((x) => String(x.data?.credit_facility) === String(old.id))) await api('GCADMIN', 'DELETE', `/runtime/records/${r.id}`);
    }
    await api('GCADMIN', 'DELETE', `/runtime/records/${old.id}`);
    S.log('trashed previous take', old.id);
  } });

  // Text and number fields typed briskly: a short visible move, a click, then the value (keeps the take within
  // length on a busy machine; lookups and selects still go through S.fill).
  const quick = async (values) => {
    for (const [name, value] of Object.entries(values)) {
      const el = p.locator(`[id="${name}"]`).first();
      await el.waitFor({ state: 'visible', timeout: 30000 });
      const b0 = await el.boundingBox();
      if (b0 && (b0.y < 70 || b0.y + b0.height > 750)) { await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(150); }
      const b = await el.boundingBox();
      await p.mouse.move(b.x + Math.min(b.width / 2, 160), b.y + b.height / 2, { steps: 5 });
      await el.click();
      await p.keyboard.press('Meta+A'); await p.keyboard.press('Backspace');
      await p.keyboard.insertText(String(value));
      await p.waitForTimeout(260);
    }
  };
  const showSection = async (text, ms = 3500) => {
    const h = p.getByText(text, { exact: true }).locator('visible=true').last();
    await S.waitCut(() => h.waitFor({ timeout: 120000 }));
    await h.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await p.waitForTimeout(900);
    await S.highlight(h.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), ms);
  };
  const showField = async (label, ms = 3000) => {
    const dt = p.locator('dt').filter({ hasText: new RegExp(`^${label.replace(/[()/]/g, '\\$&')}$`, 'i') }).locator('visible=true').first();
    await S.waitCut(() => dt.waitFor({ timeout: 60000 }));
    await dt.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await p.waitForTimeout(700);
    await S.highlight(dt.locator('xpath=..'), ms);
  };
  // A stage move answered 5xx without a decision is a backend restart (other changes reload it):
  // wait for the backend, reopen the board and move the card again.
  const drag = async (card, from, to, o = {}) => {
    for (let i = 0; ; i++) {
      let r, err;
      try { r = await S.drag(card, from, to, o); } catch (e) { err = e; }
      const s = r ? r.status() : Number((/ (5\d\d) /.exec(err?.message || '') || [])[1]);
      if (!(s >= 500) || i >= 3) { if (err) throw err; return r; }
      S.log('backend restart during move, retrying');
      await S.waitCut(async () => { await poll(async () => (await fetch('http://localhost:3001/health').catch(() => ({ ok: false }))).ok, { what: 'backend' }); await S.openObject('credit_facility', { view: 'Pipeline' }); });
    }
  };
  const board = (name) => S.waitCut(async () => { await S.openObject(name); await S.view('Pipeline'); });
  const openRec = (name, id) => S.waitCut(() => S.openRecord(name, id));
  const editRec = (name, id, form) => S.waitCut(() => S.editRecord(name, id, form));
  const showRefusal = async (ms = 4500) => {
    const msg = p.getByText(/before moving to|Only an approved|Activate only/).first().locator('xpath=ancestor::div[contains(@class,"gap-3")][1]');
    if (await msg.count()) await S.highlight(msg, ms); else { S.issue('no visible message for a refused move'); await p.waitForTimeout(ms); }
  };

  await S.waitCut(() => S.go('/login'));
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 6',
    title: 'Commercial Lending',
    text: 'A corporate facility from the RM\'s request to an active, monitored loan — memo, spreading, approval and covenants on one record.',
    bullets: [
      'Request a facility with the guided wizard',
      'Credit memo — and the stage gates that need it',
      'Financial spreading with calculated ratios (CSV import too)',
      'Group exposure against the group limit',
      'Approval routed by the approval matrix',
      'Term sheet, security, KYC gate and covenants',
    ],
    foot: 'Bruno Chan (Corporate RM) · Nadia Peerbux (Credit Analyst) · Jean-Marc Desvaux (Credit Committee) · Rajiv Doorgakant (Loans Manager)',
  }, 9000);

  // ── 1. Origination ───────────────────────────────────────────────────────
  await S.step(1, 'Origination', `${BORROWER} needs a MUR 15 million working-capital line`, 'A bigger fleet and new contracts — the corporate RM opens the request', 3200);
  await S.login('GCRM3', 'Corporate relationship manager — owns the facility');
  await S.waitCut(() => S.openObject('credit_facility'));
  await S.say('Commercial Lending ▸ Commercial facility request', 'A two-step guided form for the RM');
  await S.clickText('Commercial facility request');
  await S.settle(900);
  await S.fill('credit_facility', { borrower: 'Port Louis Logistics', borrower_group: 'Doorga', facility_type: 'revolving' });
  await S.fill('credit_facility', { purpose: 'Revolving line to fund fuel, spare parts and customs duties for 18 additional trucks serving two new port-handling contracts.' }, { delay: 5 });
  await S.clickText('Continue →');
  await S.settle(600);
  await S.say('Amount, tenor and pricing', 'Margin over the Genesis PLR, arrangement and commitment fees');
  await S.fill('credit_facility', { amount: String(AMOUNT), currency_code: 'MUR', tenor_months: '12', margin: '2', arrangement_fee_pct: '0.75', commitment_fee_pct: '0.25', expiry_date: `${year + 1}-10-31` });
  const created = p.waitForResponse((r) => /\/runtime\/records$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 240000 });
  await S.clickText('Submit to credit');
  const cr = await S.waitCut(() => created);
  if (cr.status() >= 300) throw new Error(`create ${cr.status()} ${(await cr.text()).slice(0, 300)}`);
  await S.settle(1500);
  const fac = await S.waitCut(() => poll(() => find(cf, (r) => r.data?.name === CARD), { what: 'facility' }));
  const facNo = fac.data.facility_no;
  S.log('facility', fac.id, facNo);

  await openRec('credit_facility', fac.id);
  await S.say(`${facNo} is created at Origination and assigned to the corporate RM`, 'Interest rate = Genesis PLR + margin · approval authority from the amount');
  await showSection('Analysis (calculated)', 4000);
  await S.say(`Group exposure: every facility of the ${GROUP} — now including this one`, 'Checked against the group lending limit before credit takes it on');
  await showField('Group exposure (MUR)', 3500);
  await showField('Group limit headroom (MUR)', 3500).catch(() => S.issue('group limit not shown on the facility'));

  // ── 2. RM assessment and the credit memo gate ────────────────────────────
  await S.step(2, 'RM assessment', 'The RM moves the request to RM assessment', 'Then tries to send it on to Credit memo…');
  await board('credit_facility');
  await drag(CARD, 'Origination', 'RM assessment', { after: 900 });
  await drag(CARD, 'RM assessment', 'Credit memo', { expectFail: true, after: 500 });
  await S.say('Blocked: the credit memo needs the company background and the security package', 'The board says exactly what is missing');
  await showRefusal(4500);

  await S.step(3, 'Credit memo', 'Write the memo on its own form', 'Edit ▸ Credit memo tab — the same record, a focused form');
  await editRec('credit_facility', fac.id, 'Credit memo');
  await quick({
    company_background: 'Port haulage since 1998; 64 trucks, 310 staff; experienced management. Part of the Doorga Group.',
    swot: 'S: long-term port contracts. W: top 3 clients = 44%. O: two new contracts. T: fuel prices, MUR/USD.',
    projections: 'Revenue +8%; EBITDA margin 11–12%; DSCR above 1.6x.',
    security_package: 'Fixed charge on 18 new trucks; floating charge on receivables; guarantee from Doorga Trading Ltd.',
  });
  await S.submit();
  await board('credit_facility');
  await S.say('Memo written — Credit memo now accepts the facility');
  await drag(CARD, 'RM assessment', 'Credit memo');

  // ── 4. Financial spreading (credit analyst) ──────────────────────────────
  await S.step(4, 'Financial spreading', 'The credit analyst spreads two years of audited accounts', 'Commercial Lending ▸ Financial Spread ▸ New — one row per financial year', 3000);
  await S.login('GCCRED1', 'Credit analyst — spreads the financials and grades the risk');
  const spread = async (fy, v) => {
    await S.waitCut(() => S.newRecord('financial_spread'));
    await S.fill('financial_spread', { credit_facility: PICK, period_end: `${fy}-06-30`, basis: 'audited' });
    await quick(v);
    await S.submit();
  };
  await spread(year - 2, { revenue: '612000000', ebitda: '64000000', tax: '7200000', total_debt: '150000000', cash: '38000000', annual_debt_service: '31000000' });
  await S.say(`FY ${year - 1}: the latest audited year`);
  await spread(year - 1, { revenue: '655000000', ebitda: '73500000', interest_expense: '9800000', tax: '8900000', total_debt: '142000000', cash: '45000000', equity: '262000000', annual_debt_service: '33500000' });
  const sp = await S.waitCut(() => poll(() => find(fs, (r) => String(r.data?.credit_facility) === String(fac.id) && r.data?.dscr != null && String(r.data?.period_end).startsWith(String(year - 1)), 'GCCRED1'), { what: 'spread ratios' }));
  await openRec('financial_spread', sp.id);
  await S.say('The ratios are calculated for every year', 'EBITDA margin · DSCR · net debt / EBITDA · gearing · interest cover');
  await showSection('Ratios (calculated)', 4500);

  // ── 5. Grade and recommend, then Credit approval ─────────────────────────
  await S.step(5, 'Risk grade & recommendation', 'Back on the facility: the latest DSCR and leverage are read from the spread', 'The analyst sets the internal risk grade and writes the recommendation');
  await openRec('credit_facility', fac.id);
  await showField('DSCR (latest year)', 3000);
  await S.say('Credit approval needs a recommendation and a risk grade', 'Try it first…');
  await board('credit_facility');
  await drag(CARD, 'Credit memo', 'Credit approval', { expectFail: true, after: 500 });
  await showRefusal(4000);
  await editRec('credit_facility', fac.id, 'Credit memo');
  await S.fill('credit_facility', { risk_grade: '2' });
  await quick({ recommendation: 'Approve MUR 15m for 12 months at PLR + 2. DSCR 1.93x. Covenant: DSCR ≥ 1.25x, tested annually.' });
  await S.submit();

  await S.say('Who approves? Masters ▸ Approval Matrices', 'Lending bands: up to MUR 5m Loans Manager · up to MUR 20m Credit Committee · above, the Board Credit Committee');
  await S.waitCut(() => S.openObject('approval_matrix', { view: 'Table' }));
  await p.waitForTimeout(1500);
  const band = p.getByText('Credit Committee', { exact: true }).locator('visible=true').first();
  if (await band.count()) await S.highlight(band.locator('xpath=ancestor::tr[1]'), 3500); else await p.waitForTimeout(3500);
  await board('credit_facility');
  await S.say('MUR 15 million falls in the Credit Committee band', 'Moving to Credit approval raises the approval request');
  await drag(CARD, 'Credit memo', 'Credit approval');

  // ── 6. Credit committee ──────────────────────────────────────────────────
  await S.step(6, 'Credit approval', 'The Credit Committee decides', 'Tools ▸ Approvals — the request carries amount, grade and DSCR', 3000);
  await S.login('GCCC1', 'Credit committee member — approves facilities up to MUR 20 million');
  await S.approve(`Credit Committee: ${CARD}`, 'Approved. Strong cash cover and security; covenants as recommended.');
  await S.waitCut(() => poll(async () => (await data(cf, fac.id)).credit_decision === 'approved', { what: 'credit decision' }));
  await openRec('credit_facility', fac.id);
  await S.say('Approved — the facility moved itself to Term sheet / offer', 'Credit decision: Approved');
  await showField('Credit decision', 3000);
  await S.tab('Docs');
  await S.say('The term sheet was generated and filed on the Docs tab', 'Amount, tenor, pricing, fees and the security package — ready to send to the borrower');
  const ts = p.getByText(/^Term sheet CF-/).locator('visible=true').first();
  if (await S.waitCut(() => ts.waitFor({ timeout: 60000 }).then(() => true).catch(() => false))) {
    await ts.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await p.waitForTimeout(700);
    await S.highlight(ts.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 2000);
    // Open it: the preview shows the PDF above the caption.
    const prev = ts.locator('xpath=ancestor::div[contains(@class,"rounded")][1]').locator('button[title="Preview"]').first();
    if (await prev.count()) {
      await S.say('Preview the term sheet', 'Facility, amount, tenor, pricing and fees — filled in from the record');
      await S.moveTo(prev);
      await S.waitCut(() => p.waitForTimeout(7000)); // the PDF viewer takes a few seconds to render
      await p.waitForTimeout(5000);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(600);
    }
  } else S.issue('term sheet not on the Docs tab');

  // ── 7. Security perfection and Active ────────────────────────────────────
  await S.step(7, 'Security & activation', 'The borrower signs the term sheet', 'The RM registers the charges and guarantee — Security perfection', 3000);
  await S.login('GCRM3', 'Corporate relationship manager');
  await board('credit_facility');
  await drag(CARD, 'Term sheet / offer', 'Security perfection', { after: 1200 });
  await S.say('Active: the CRM checks the borrower\'s KYC is approved', `${BORROWER}'s KYC is approved — the facility goes live`);
  await drag(CARD, 'Security perfection', 'Active', { after: 2500 });

  // ── 8. Covenants ─────────────────────────────────────────────────────────
  await S.step(8, 'Covenants', 'Record the covenants the committee set', 'Commercial Lending ▸ Covenant ▸ New');
  await S.waitCut(() => S.newRecord('covenant'));
  await S.fill('covenant', { credit_facility: PICK, covenant_type: 'financial', metric: 'dscr', threshold: '1.25', frequency: 'annual', next_test_date: `${year}-12-31` });
  await S.submit();
  const c1 = await S.waitCut(() => poll(() => find(cov, (r) => String(r.data?.credit_facility) === String(fac.id), 'GCRM3'), { what: 'covenant' }));

  await S.step(9, 'Covenant test', 'A year on: management accounts show DSCR at 1.08x', 'Covenant Test ▸ New — record the actual value');
  await S.waitCut(() => S.newRecord('covenant_test'));
  await S.fill('covenant_test', { covenant: facNo, credit_facility: PICK, test_date: `${year}-12-31`, certificate_received: true, actual_value: '1.08' });
  await S.submit();
  const t1 = await S.waitCut(() => poll(() => find(ct, (r) => String(r.data?.covenant) === String(c1.id) && r.data?.result, 'GCRM3'), { what: 'covenant test' }));
  S.log('test result', t1.data.result);
  await openRec('covenant_test', t1.id);
  await S.say('1.08 is below the 1.25 threshold: the result is Breach', 'The RM and the Loans Manager are alerted at once');
  await showField('Result', 3500);
  await openRec('credit_facility', fac.id);
  await S.say('The facility counts its covenants in breach', 'Watch-list reporting and the Loan Book dashboard read the same figure');
  await showField('Covenants in breach', 3500);

  // ── 10. Waiver ───────────────────────────────────────────────────────────
  await S.step(10, 'Breach & waiver', 'The Loans Manager gets the breach alert', 'He decides on a waiver or a remedy', 3000);
  await S.login('GCLMGR', 'Manager, Loans & Fixed Income — decides covenant waivers');
  // The bell is only wired up once the workspace has loaded (branding and menu).
  await S.waitCut(() => p.getByText('Genesis Capital').first().waitFor({ timeout: 120000 }));
  await S.settle(1200);
  await S.moveTo(p.locator('button[title="Notifications"]').first());
  await p.waitForTimeout(1200);
  await S.say('Notifications: “Covenant breach” with the actual value and threshold');
  const alert = p.getByText(/Covenant breach/).locator('visible=true').first();
  if (await alert.count()) { await alert.evaluate((e) => e.scrollIntoView({ block: 'center' })); await S.highlight(alert.locator('xpath=..'), 3500); } else { S.issue('breach alert not in the notification list'); await p.waitForTimeout(2500); }
  await p.keyboard.press('Escape');
  await editRec('covenant_test', t1.id);
  await S.fill('covenant_test', { waiver: 'granted' });
  await quick({ waiver_terms: 'One-off waiver: fleet ramp-up. 25% cash sweep until DSCR is back above 1.25x; retest at half-year.' });
  await S.submit();
  await openRec('covenant_test', t1.id);
  await S.say('Waiver granted and the terms recorded on the test', 'The next test date stays in the calendar for the RM');
  await showField('Waiver', 3500);

  await S.logout();
  await S.card({
    eyebrow: 'Summary',
    title: 'Commercial Lending',
    text: 'Four people worked one facility — the CRM checked every gate and routed every decision.',
    bullets: [
      'Guided facility request by the corporate RM',
      'Credit memo gate before Credit memo and Credit approval',
      'Two years spread with DSCR, leverage and gearing',
      'Group exposure against the group limit',
      'Approval by the matrix band, term sheet generated',
      'KYC gate on Active; covenant breach alert and waiver',
    ],
  }, 7000);
}
