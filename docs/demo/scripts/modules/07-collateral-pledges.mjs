// Collateral & Pledges: a loans executive registers a construction lot as security for a home loan (haircut and
// lending value from the collateral-type master), allocates it to the loan; the credit analyst records the panel
// valuation and the reminders; then an investment-backed loan: the pledge is reduced to the units the loan needs, a
// market-price valuation drops, the LTV passes the call level and a margin call is raised with its notice; the loans
// manager contacts the client, the cure gate, a top-up pledge, and the call is cured.
import { API, api, poll as poll0, records } from '../lib/studio.mjs';

export const title = 'Collateral & Pledges';

// A lookup that fails while the backend restarts (another change reloads it) is retried.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 240000, ...o });

const OBJ = { la: 170, coll: 179, link: 180, val: 181, mc: 182 };
const LINA_APP = 3721; // Lina Chan · Investment-Backed Loan (disbursed, LMS-100204)
const LINA_PLEDGE = 4674; // Pledged units FEQ-MUR
const LOT = 'Construction lot, Morcellement Les Salines, Rivière Noire';
const TOPUP = 'Pledged units MMF-MUR';
const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10); // Mauritius date

/** Remove what an earlier take of this video created, so it can be recorded again. */
export async function cleanup(S) {
  const del = async (id) => { const r = await api('GCADMIN', 'DELETE', `/runtime/records/${id}`); S.log('cleanup delete', id, r.status); };
  const colls = await records('GCADMIN', OBJ.coll, { limit: 500 });
  const mine = colls.filter((c) => c.data?.description === LOT || (c.data?.description === TOPUP && String(c.data?.loan_application) === String(LINA_APP)));
  const ids = new Set([...mine.map((c) => String(c.id)), String(LINA_PLEDGE)]);
  for (const v of await records('GCADMIN', OBJ.val, { limit: 500 })) if (ids.has(String(v.data?.collateral))) await del(v.id);
  for (const l of await records('GCADMIN', OBJ.link, { limit: 500 })) if (ids.has(String(l.data?.collateral))) await del(l.id);
  for (const c of mine) await del(c.id);
  for (const m of await records('GCADMIN', OBJ.mc, { limit: 500 })) if (String(m.data?.loan_application) === String(LINA_APP) && !m.data?.ext_ref) await del(m.id);
  const r = await api('GCADMIN', 'PUT', `/runtime/records/${LINA_PLEDGE}`, { data: { pledged_units: null } });
  S.log('cleanup pledge reset', r.status);
  await poll(async () => Number((await api('GCADMIN', 'GET', `/runtime/records/${LINA_APP}`)).data?.data?.ibl_ltv) < 10, { what: 'LTV reset', timeout: 60000 });
}

// S.submit with a longer server wait: on a busy machine a save that refreshes the client's roll-ups can exceed 60 s.
// While the backend restarts (another change reloads it), the dev proxy answers 5xx with no body or the browser
// gives up after 60 s: wait for the backend and press Save again, as a user would.
async function submit(S, attempt = 1) {
  const { p } = S;
  const btn = p.locator('form button[type=submit]').last();
  const resp = p.waitForResponse((r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 240000 });
  await S.moveTo(btn);
  const invalid = p.locator('.form-error').first().waitFor({ state: 'visible', timeout: 240000 }).then(() => 'invalid').catch(() => null);
  if (await Promise.race([resp.then(() => 'sent'), invalid]) === 'invalid') {
    throw new Error(`form validation: ${(await p.locator('.form-error').allTextContents()).join('; ')}`);
  }
  const failed = p.waitForEvent('requestfailed', { predicate: (q) => /\/runtime\/records/.test(q.url()) && q.method() !== 'GET', timeout: 240000 })
    .then(() => 'failed').catch(() => new Promise(() => {}));
  const r = await S.waitCut(() => Promise.race([resp, failed]));
  if (r === 'failed') {
    S.log('save request failed — waiting for the backend');
    await S.waitCut(() => poll(async () => (await fetch(`${API}/auth/me`)).status < 500, { what: 'backend' }));
    if (/\/edit\/\d+$/.test(p.url()) && attempt < 4) return submit(S, attempt + 1);
    throw new Error('save request failed');
  }
  const body = await r.text().catch(() => '');
  S.log('save', r.status());
  if (r.status() >= 500 && !body.includes('"error"') && attempt < 4) {
    await S.waitCut(() => poll(async () => (await fetch(`${API}/auth/me`)).status < 500, { what: 'backend' }));
    // A timed-out create may still have been written: only retry when nothing was saved.
    if (p.url().match(/\/(new|edit\/\d+)$/)) return submit(S, attempt + 1);
    return;
  }
  if (r.status() >= 300) throw new Error(`save ${r.status()} ${body.slice(0, 300)}`);
  await S.settle(900);
}

const data = async (id) => (await api('GCCRED1', 'GET', `/runtime/records/${id}`)).data?.data ?? {};

export default async function run(S) {
  const { p } = S;
  S.submit = () => submit(S);
  // Under load the form can re-render after it appears: wait for it to settle before typing.
  const newRecord0 = S.newRecord.bind(S);
  S.newRecord = async (name) => { const o = await newRecord0(name); await S.waitCut(() => p.locator('form button[type=submit]').last().waitFor({ timeout: 60000 })); await p.waitForTimeout(1200); return o; };
  const editRecord0 = S.editRecord.bind(S);
  S.editRecord = async (...a) => { await editRecord0(...a); await S.waitCut(() => p.locator('form button[type=submit]').last().waitFor({ timeout: 60000 })); await p.waitForTimeout(1200); };
  await S.waitCut(() => cleanup(S));
  const lina = await data(LINA_APP);
  S.log('Lina before', lina.ibl_ltv, lina.ibl_ltv_status, lina.margin_call_open);

  // ── helpers ──
  // Open a record panel and wait until it shows `label` (a busy server sometimes answers the first load empty).
  async function openPanel(object, id, label) {
    for (let i = 0; i < 3; i++) {
      await S.openRecord(object, id);
      const ok = await S.waitCut(() => p.getByText(label, { exact: true }).locator('visible=true').first().waitFor({ timeout: 45000 }).then(() => true).catch(() => false));
      if (ok) return;
      S.log('panel not rendered, reloading');
    }
    throw new Error(`record panel ${object} #${id} did not render`);
  }
  // Scroll a field of the open panel into view and outline it.
  async function field(label, ms = 3000) {
    const el = p.getByText(label, { exact: true }).locator('visible=true').first();
    await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await p.waitForTimeout(700);
    await S.highlight(el.locator('xpath=..'), ms);
  }
  // Lookup: search with `query`, pick the option that also contains `want`.
  async function pick(name, query, want) {
    const el = p.locator(`[id="${name}"]`).first();
    await S.moveTo(el);
    const input = p.locator(`input[id="${name}"]`).first();
    await input.fill(''); await S.type(query, 22);
    const opt = el.locator('xpath=ancestor::div[contains(@class,"relative")][1]').locator('ul button').filter({ hasText: want }).first();
    await S.waitCut(() => opt.waitFor({ timeout: 30000 }));
    await S.moveTo(opt);
  }
  async function section(label, ms = 3500) {
    const el = p.getByText(label, { exact: true }).locator('visible=true').first();
    await el.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' })).catch(() => {});
    await p.waitForTimeout(800);
    await S.highlight(el.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), ms);
  }

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 7',
    title: 'Collateral & Pledges',
    text: 'The security behind every loan — what it is worth, what it lends, and what happens when its value falls.',
    bullets: [
      'Register property as security for a loan',
      'Haircut and lending value from the master',
      'Allocate collateral to loans and record valuations',
      'Insurance-expiry and revaluation reminders',
      'Pledged fund units and live LTV monitoring',
      'Automatic margin call, notice and cure',
    ],
    foot: 'Personas: Sophie Lagesse (Loans Executive) · Nadia Peerbux (Credit Analyst) · Ritesh Seewoo (Operations) · Rajiv Doorgakant (Manager, Loans)',
  }, 7000);

  // ── 1. Register the property ─────────────────────────────────────────────────────────────────────────────
  await S.step(1, 'Register the security', 'Jean-Marc Lagesse is borrowing MUR 9.45M to buy a construction lot', 'The lot itself will secure the loan — the loans executive registers it', 4500);
  await S.login('GCLOAN1', 'The loans executive handles the loan and its security');
  await S.newRecord('collateral');
  await S.say('Collateral & Pledges ▸ Collateral Register ▸ New', 'Link it to the loan application — leave Owner empty when the borrower owns it');
  await pick('loan_application', 'Lagesse', 'Jean-Marc Lagesse');
  await S.fill('collateral', { collateral_type: 'land', description: LOT, title_reference: 'TV 4512/38', charge_rank: 'first' }, { delay: 9 });
  await S.say('The value from the sale agreement — the bank\'s own valuation follows', 'Leave Haircut empty: the standard haircut for the type applies');
  await S.fill('collateral', { value: '10500000' });
  await p.waitForTimeout(800);
  const created = await S.submit();
  const coll = await poll(async () => (await records('GCLOAN1', OBJ.coll, { limit: 500 })).find((c) => c.data?.description === LOT), { what: 'collateral' });
  S.log('collateral', coll.id, created?.id);

  await openPanel('collateral', coll.id, 'Lending value (MUR)');
  await S.say('Land carries a standard 10% haircut, from Masters ▸ Collateral types', 'The master also sets the revaluation frequency and the LTV levels');
  await field('Standard haircut %', 4500);
  await S.say('Lending value = market value less the haircut: MUR 9.45M', 'Exactly the loan amount');
  await field('Lending value (MUR)', 3000);

  // ── 2. Allocate ──────────────────────────────────────────────────────────────────────────────────────────
  await S.step(2, 'Allocate to the loan', 'Collateral Allocations: how much of the security backs which loan', 'One property can secure several loans or facilities — each gets its share', 4500);
  await S.newRecord('collateral_link');
  await pick('collateral', 'Les Salines', 'Morcellement Les Salines');
  await pick('loan_application', 'Lagesse', 'Jean-Marc Lagesse');
  await S.fill('collateral_link', { allocated_value: '9450000' });
  await S.submit();
  await openPanel('loan_application', 3746, 'Security lending value (MUR)');
  await S.say('On the loan application, the security lending value now shows MUR 9.45M', 'It adds up the lending value of every collateral registered for the loan');
  await field('Security lending value (MUR)', 3500);
  await section('Security & insurance perfection', 1500);
  await S.say('At Security & insurance the team completes valuation, notary, charge and insurance', 'Ready for disbursement stays blocked until “Security complete” is Yes');
  await field('Security complete', 4500);

  // ── 3. Valuation and reminders ───────────────────────────────────────────────────────────────────────────
  await S.step(3, 'Record the valuation', 'The bank\'s panel valuer reports — the credit analyst records it', 'Collateral Valuations ▸ New: date, market value, forced-sale value, valuer', 4500);
  await S.login('GCCRED1', 'The credit analyst checks the security');
  await S.newRecord('collateral_valuation');
  await pick('collateral', 'Les Salines', 'Morcellement Les Salines');
  await S.fill('collateral_valuation', { valuation_date: today(), market_value: '10800000', forced_sale_value: '8100000', valuer: 'Ramlackhan & Associates', method: 'full' }, { delay: 9 });
  await S.submit();
  await S.waitCut(() => poll(async () => Number((await data(coll.id)).market_value) === 10800000, { what: 'market value' }));
  await openPanel('collateral', coll.id, 'Lending value (MUR)');
  await S.say('The latest valuation becomes the market value — lending value is now MUR 9.72M', 'The loan stays covered with room to spare');
  await field('Current market value (MUR)', 2600);
  await field('Lending value (MUR)', 3000);
  await S.say('Next revaluation: three years for land, from the master', 'A reminder goes to the owner of the record on the day it falls due');
  await field('Next revaluation', 3000);

  await openPanel('collateral', 4672, 'Insurance lapses within 30 days');
  await S.say('Insured property: 30 days before the cover lapses, a reminder goes out', 'Here the building policy expires on 1 November — flagged as lapsing');
  await field('Insurance expiry', 2000);
  await field('Insurance lapses within 30 days', 3000);

  // ── 4. Investment-backed loan ────────────────────────────────────────────────────────────────────────────
  await S.step(4, 'Pledged fund units', 'Investment-backed loan: Lina Chan borrowed against her fund units', 'MUR 1.14M outstanding — secured by a pledge of Genesis Foreign Equity Fund units', 4500);
  await openPanel('loan_application', LINA_APP, 'Current LTV %');
  await section('Investment-backed loan — LTV monitoring', 1200);
  await S.say('LTV = drawn exposure ÷ market value of the registered pledges', 'Today 7.3% — her whole holding is pledged');
  await field('Current LTV %', 4000);
  await S.say('Margin-call level 80%, liquidation 90% — per asset class, from the master', 'Checked again every time a pledge is revalued');
  await field('Margin-call level %', 4200);

  await S.login('GCOPS1', 'Operations registers and releases pledges with the transfer agent');
  await openPanel('collateral', LINA_PLEDGE, 'Lending value (MUR)');
  await S.say('Lina is redeeming most of her units — the pledge keeps only 3,600', 'Enough to cover the loan after the 30% haircut');
  await field('Current market value (MUR)', 2200);
  await S.editRecord('collateral', LINA_PLEDGE);
  await S.fill('collateral', { pledged_units: '3600' });
  await S.submit();
  await S.waitCut(() => poll(async () => Number((await data(LINA_APP)).ibl_ltv) > 60, { what: 'LTV after partial release' }));
  await S.say('3,600 units at the latest NAV: MUR 1.62M', 'The loan\'s LTV is recalculated at once: 70.8% — still within limits', 3500);

  // ── 5. Valuation drop → margin call ──────────────────────────────────────────────────────────────────────
  await S.step(5, 'Market falls', 'A month later equity markets fall — the units lose 14%', 'Operations records the monthly market-price valuation of the pledge', 4500);
  await S.newRecord('collateral_valuation');
  await pick('collateral', 'FEQ-MUR', 'Pledged units FEQ-MUR');
  await S.fill('collateral_valuation', { valuation_date: today(), market_value: '1390000', valuer: 'Genesis Fund Services — NAV', method: 'market' }, { delay: 9 });
  await S.submit();
  await S.say('The LTV is now above 80% — the CRM raises a margin call by itself', 'No one has to spot it: the check runs the moment the pledge is revalued');
  const call = await S.waitCut(() => poll(async () => (await records('GCOPS1', OBJ.mc, { limit: 500 }))
    .find((m) => String(m.data?.loan_application) === String(LINA_APP) && !m.data?.ext_ref && m.data?.cure_by), { what: 'margin call' }));
  S.log('margin call', call.id, call.data?.call_no, call.data?.ltv_at_call, call.data?.shortfall);
  await p.waitForTimeout(2500);
  await openPanel('loan_application', LINA_APP, 'Current LTV %');
  await section('Investment-backed loan — LTV monitoring', 1200);
  await S.say('LTV 82.2% — margin call, with the shortfall to restore cover', 'Shortfall = drawn exposure less the pledges\' lending value');
  await field('LTV status', 2800);
  await field('Shortfall to restore cover (MUR)', 3200);

  await openPanel('margin_call', call.id, 'Shortfall (MUR)');
  await S.say(`Margin call ${call.data?.call_no}: LTV at call, shortfall, cure within five business days`, 'Assigned to the loans manager · Lina is emailed and texted');
  await field('LTV at call %', 2600);
  await field('Cure by', 2800);
  await S.tab('Docs');
  await p.getByText(/Margin call MC-/).first().waitFor({ timeout: 60000 }).catch(() => {});
  await S.say('Docs: the margin-call notice letter, generated in Lina\'s language', 'The same notice was emailed to her');
  await S.highlight(p.getByText(/Margin call MC-/).first().locator('xpath=ancestor::*[self::li or self::tr or contains(@class,"rounded")][1]'), 4000);

  // ── 6. Loans manager works the call ──────────────────────────────────────────────────────────────────────
  await S.step(6, 'Contact the client', 'The loans manager calls Lina', 'Margin Calls pipeline: Issued ▸ Client contacted ▸ Cured / Liquidation', 4500);
  await S.login('GCLMGR', 'Margin calls are routed to the loans manager');
  await S.openObject('margin_call', { view: 'Pipeline' });
  const card = call.data?.call_no;
  await S.waitCut(() => p.getByText(card).first().waitFor({ timeout: 60000 }).catch(() => {}));
  await S.drag(card, 'Issued', 'Client contacted');
  await S.say('Lina will pledge more units rather than repay — try closing the call now…', 'Cured needs to know how the call was cured', 3500);
  await S.drag(card, 'Client contacted', 'Cured', { expectFail: true, after: 600 });
  await S.say('Blocked: record how the call was cured first', 'Additional collateral or a partial repayment');
  await p.waitForTimeout(3200);

  // ── 7. Top-up and cure ───────────────────────────────────────────────────────────────────────────────────
  await S.step(7, 'Top up the pledge', 'Operations registers the extra pledge: units of her money-market fund', 'Collateral Register ▸ New — fund units, pledge registered with the transfer agent', 4500);
  await S.login('GCOPS1', 'Operations registers the new pledge');
  await S.newRecord('collateral');
  await S.say('Collateral Register ▸ New: fund units, linked to Lina\'s loan', '4,000 units of her money-market fund, pledge registered');
  await pick('loan_application', 'Lina Chan', 'Investment-Backed');
  await S.fill('collateral', { collateral_type: 'fund_units', description: TOPUP }, { delay: 10 });
  await pick('fund_holding', 'Lina Chan', 'MMF-MUR');
  await S.fill('collateral', { pledged_units: '4000', pledge_status: 'registered' });
  await S.submit();
  await S.waitCut(() => poll(async () => Number((await data(LINA_APP)).ibl_ltv) < 70, { what: 'LTV after top-up' }));
  await openPanel('loan_application', LINA_APP, 'Current LTV %');
  await section('Investment-backed loan — LTV monitoring', 1200);
  await S.say('LTV back to 63% — within limits, no shortfall', 'The extra units restored the cover');
  await field('Current LTV %', 2800);
  await field('Shortfall to restore cover (MUR)', 2600);

  await S.say('Operations records the cure on the margin call', 'Cure: Additional collateral');
  await S.editRecord('margin_call', call.id);
  await S.waitCut(() => p.locator('[id="cure"]').first().waitFor({ timeout: 60000 }));
  await S.fill('margin_call', { cure: 'top_up' });
  await S.submit();
  await S.openObject('margin_call', { view: 'Pipeline' });
  await S.waitCut(() => p.getByText(card).first().waitFor({ timeout: 60000 }).catch(() => {}));
  await S.say('Now the call can move to Cured', 'The cure is recorded, so the gate lets it through');
  await S.drag(card, 'Client contacted', 'Cured');
  await S.say('Cured within the deadline — the call is closed', 'A new call is raised if the LTV passes the call level again');
  await p.waitForTimeout(3000);

  await S.logout();
  await S.card({
    eyebrow: 'Summary',
    title: 'Collateral & Pledges',
    text: 'Staff register and value the security — the CRM keeps lending value and LTV current and raises the alarms.',
    bullets: [
      'Haircut and lending value from the collateral-type master',
      'Allocations: one collateral can back several loans',
      'Latest valuation sets market value and next revaluation',
      'Reminders before insurance lapses and revaluations fall due',
      'Pledge revalued → LTV checked → margin call and notice',
      'Cure gate: additional collateral or repayment, then Cured',
    ],
  }, 7000);
}
