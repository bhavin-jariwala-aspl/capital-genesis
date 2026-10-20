// Masters: the reference data administrators maintain as ordinary records. The CRM administrator walks through what
// each master drives and makes real changes that take effect without a release: a product's routing (queue and
// first-contact target) followed by a new website enquiry, and a KYC risk weight followed by a case's risk score.
// Every change is put back through the UI at the end, so the demo data stays as it was.
import { PEOPLE, api, poll as poll0, records } from '../lib/studio.mjs';

// A lookup that fails while the backend restarts (other changes reload it) is retried rather than failing the take.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 180000, ...o });

export const title = 'Masters — reference data';

const GET_IN_TOUCH = '2fe40fb6f0da0570cbe29eb9f465541b5c52897826acc486'; // the website "Get in touch" form
const ROUTING_ID = 2924; // Personal Loan (LND-PL)
const ROUTING = { queue: 'Retail Loans', first_contact_hours: 4 };
const NEW_QUEUE = 'Retail Loans — fast track';
const FACTOR_ID = 2979; // Onboarding channel: non face to face
const FACTOR_SCORE = 10;
const KYC_ID = 3260; // Priya Naidoo — South Africa, non face to face, in screening
const LOAN_ID = 3741; // Deepak Seegoolam · Real Estate Loan, MUR 13m
const SERVICE_ID = 5664; // a partial prepayment request
const PRODUCT_ID = 2900; // Real Estate Loan (LND-RE), margin −0.675

const CANDIDATES = [['Laura', 'Chung'], ['Mélissa', 'Bégué'], ['Sandra', 'Rivière'], ['Nadine', 'Thénard'], ['Joëlle', 'Ah-Sing'],
  ['Cindy', 'Labonne'], ['Vanessa', 'Pierre-Louis'], ['Audrey', 'Moutou'], ['Kelly', 'Casimir'], ['Natalie', 'Jolicoeur']];

async function freshName() {
  const enq = await records('GCADMIN', 163, { limit: 1000 });
  const used = new Set(enq.map((r) => String(r.data?.email ?? '').toLowerCase()));
  for (const [first, last] of CANDIDATES) {
    const email = `${first}.${last}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z.]/g, '').toLowerCase() + '@example.com';
    if (!used.has(email)) return { first, last, email };
  }
  throw new Error('no fresh enquiry name left');
}

/** Put back anything a failed earlier take left changed (cleanup only — the video itself restores through the UI). */
async function cleanup(S) {
  const get = async (id) => (await api('GCADMIN', 'GET', `/runtime/records/${id}`)).data?.data ?? {};
  const r = await get(ROUTING_ID);
  if (r.queue !== ROUTING.queue || Number(r.first_contact_hours) !== ROUTING.first_contact_hours) {
    S.log('cleanup: routing'); await api('GCADMIN', 'PUT', `/runtime/records/${ROUTING_ID}`, { data: ROUTING });
  }
  const f = await get(FACTOR_ID);
  if (Number(f.score) !== FACTOR_SCORE) { S.log('cleanup: factor'); await api('GCADMIN', 'PUT', `/runtime/records/${FACTOR_ID}`, { data: { score: FACTOR_SCORE } }); }
  const k = await get(KYC_ID);
  S.log('kyc score at start', k.risk_score);
  return Number(k.risk_score);
}

export default async function run(S) {
  const { p } = S;
  const base = await cleanup(S);
  let score = base;
  if (base !== 102) {
    // The case was re-scored with a changed weight in a failed take: save it once more so it reads the restored weight.
    await api('GCADMIN', 'PUT', `/runtime/records/${KYC_ID}`, { data: {} });
    score = Number((await api('GCADMIN', 'GET', `/runtime/records/${KYC_ID}`)).data?.data?.risk_score);
    S.log('kyc score after cleanup', score);
  }
  const A = await freshName();
  S.log('enquiry from', A.email);

  const tab = (label) => p.getByRole('button', { name: label, exact: true }).first();
  const row = (text) => p.locator('tr').filter({ hasText: text }).first();
  async function openTab(label) {
    await S.moveTo(tab(label));
    await S.settle(900);
    // The list search box keeps its text from tab to tab: clear it.
    const box = p.getByPlaceholder('Search…').last();
    if (await box.inputValue().catch(() => '')) { await box.fill(''); await p.waitForTimeout(600); }
    await p.locator('tbody tr').first().waitFor({ timeout: 60000 }).catch(() => {});
  }
  /** Narrow the list with its search box (lists show a page at a time). */
  async function find(text) {
    const box = p.getByPlaceholder('Search…').last();
    await S.moveTo(box);
    await p.keyboard.press('Meta+A'); await p.keyboard.press('Backspace');
    await S.type(text, 45);
    await S.waitCut(() => row(text).waitFor({ timeout: 30000 }).catch(() => {}));
    await p.waitForTimeout(800);
  }
  async function editRow(text) {
    const r = row(text);
    await r.waitFor({ timeout: 30000 });
    await S.moveTo(r.getByRole('button', { name: 'Edit' }));
    await S.settle(900);
    await p.locator('form').first().waitFor({ timeout: 30000 });
  }
  /** The panel box around a field label (record panel). */
  const fieldBox = (label) => p.getByText(label, { exact: true }).locator('visible=true').first();
  async function showField(label, ms = 3200) {
    const el = fieldBox(label);
    await S.waitCut(() => el.waitFor({ timeout: 60000 }));
    await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await p.waitForTimeout(700);
    await S.highlight(el.locator('xpath=..'), ms);
  }
  async function readField(label) {
    return (await fieldBox(label).locator('xpath=..').innerText()).replace(label, '').trim();
  }
  async function publicFill(id, value) {
    const el = p.locator(`[id="${id}"], [id="f-${id}"]`).first();
    const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
    if (tagName === 'select') { await S.moveTo(el, { click: false }); await el.selectOption(value); }
    else if ((await el.getAttribute('type')) === 'checkbox') { await S.moveTo(el, { click: false }); if (!(await el.isChecked())) await el.check(); }
    else { await S.moveTo(el); await S.type(value, 40); }
    await p.waitForTimeout(200);
  }

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 19',
    title: 'Masters — reference data',
    text: 'The tables the CRM\'s calculations read: routing, rates, risk weights, approval limits and service levels.',
    bullets: [
      'What each master drives',
      'Re-route a product — a new enquiry follows',
      'Change a KYC risk weight — a case is re-scored',
      'Approval matrix and service catalogue in use',
      'PLR history and the FX board (read only)',
      'Masters are data · the Builder is configuration',
    ],
    foot: 'Persona: Kevin Lam (CRM Administrator)',
  }, 8000);

  // ── 1. The Masters module ──────────────────────────────────────────────────────────────────────────────────────
  await S.step(1, 'The Masters module', 'Masters hold the reference data that formulas and rules read', 'Maintained by administrators — and Compliance for the risk tables');
  await S.login('GCADMIN', 'The CRM administrator maintains the masters');
  await S.go('/module/103', 1200);
  await p.locator('tbody tr').first().waitFor({ timeout: 60000 }).catch(() => {});
  await S.say('One tab per master — each row is an ordinary record', 'Edit, import, export and audit them like any other data');
  await S.highlight(tab('Product Routing').locator('xpath=..'), 3500);
  await S.say('Masters are data: change a row and the next calculation uses it', 'The Builder is configuration: fields, forms, stages and workflows');
  await p.waitForTimeout(4000);

  // ── 2. Product routing ─────────────────────────────────────────────────────────────────────────────────────────
  await S.step(2, 'Product routing', 'Website Product Routing: what the client picks on the website', 'Each product goes to a business unit and a queue, with a first-contact target');
  await p.waitForTimeout(2500);
  await find('Personal Loan');
  await S.highlight(row('Personal Loan'), 3200);
  await S.say('Personal loans get a faster first call from today', 'Edit the Personal Loan rule');
  await editRow('Personal Loan');
  await S.fill('product_routing', { queue: NEW_QUEUE });
  await S.say('New queue name and first contact within 2 business hours', 'The business unit stays Lending, so the same team still gets the enquiries');
  await S.fill('product_routing', { first_contact_hours: '2' });
  await p.waitForTimeout(800);
  await S.submit();
  await S.say('Saved — no release, no restart', 'The next enquiry for a personal loan reads the new rule');
  await p.waitForTimeout(2800);

  // ── 3. A new enquiry follows the new routing ───────────────────────────────────────────────────────────────────
  await S.step(3, 'A new website enquiry', `${A.first} ${A.last} asks about a personal loan on the website`, 'The same "Get in touch" form the website shows');
  await S.go(`/f/${GET_IN_TOUCH}?prod=LND-PL`, 1500);
  await publicFill('estimated_amount', '400000');
  await publicFill('requested_tenure_months', '48');
  await publicFill('message', 'I would like to buy a car. Please call me during lunchtime.');
  await S.clickText('Continue');
  await p.waitForTimeout(900);
  await publicFill('first_name', A.first);
  await publicFill('last_name', A.last);
  await publicFill('email', A.email);
  await publicFill('mobile', '5' + String(7000000 + Math.floor(Math.random() * 999999)).slice(0, 7));
  await S.moveTo(p.getByText('I agree to be contacted', { exact: false }).first());
  const sub = p.waitForResponse((r) => r.url().includes('/public/forms/') && r.request().method() === 'POST', { timeout: 60000 });
  await S.clickText('Send request');
  const subR = await S.waitCut(() => sub);
  if (subR.status() >= 300) throw new Error(`public submit ${subR.status()} ${(await subR.text()).slice(0, 300)}`);
  await S.settle(1200);
  await S.say('Sent — the enquiry is in the CRM', 'Routing, scoring and the speed-to-lead clock run as it arrives');
  await p.waitForTimeout(2600);

  const enq = await S.waitCut(() => poll(async () => (await records('GCADMIN', 163, { limit: 50 })).find((r) => String(r.data?.email).toLowerCase() === A.email), { what: 'enquiry' }));
  S.log('enquiry', enq.id, enq.data?.queue, enq.data?.first_contact_hours, enq.assigned_to);
  if (enq.data?.queue !== NEW_QUEUE) S.issue(`new enquiry queue is "${enq.data?.queue}", expected "${NEW_QUEUE}"`);
  await S.openRecord('enquiry', enq.id);
  await S.say('On the enquiry: the new queue and the 2-hour first-contact target', 'Read from the routing rule at the moment it arrived');
  await showField('Queue', 2600);
  await showField('First contact target (business hours)', 3000);

  // The speed-to-lead timer reads the same field (checked here; the SLA Board shows wall-clock time remaining).
  const timer = await poll(async () => {
    const d = (await api(enq.assigned_to || 'GCADMIN', 'GET', '/sla/dashboard?scope=me')).data;
    return (d?.timers || []).find((t) => t.entity_id === enq.id && t.metric === 'first_response') || null;
  }, { what: 'SLA timer', timeout: 30000 }).catch(() => null);
  S.log('timer', timer && `${timer.started_at} → ${timer.due_at}`);
  await S.say('The speed-to-lead clock now allows 2 business hours, not 4', `${PEOPLE[enq.assigned_to]?.[0] ?? 'The owner'} (Lending) is alerted as the deadline nears`);
  await p.waitForTimeout(3500);
  await S.say('Enquiries that arrived earlier keep the target they were given', 'A routing change applies from the next enquiry on');
  await p.waitForTimeout(3200);

  // ── 4. KYC risk weights ────────────────────────────────────────────────────────────────────────────────────────
  await S.step(4, 'KYC risk weights', 'The KYC risk score adds up weights from the risk-factor master', 'Country risk + PEP + product + channel + occupation + ownership + activity', 3500);
  await S.openRecord('kyc_case', KYC_ID);
  await S.say(`A case under screening: risk score ${score}`, 'South African resident, onboarded without meeting in person');
  await showField('Risk score', 3500);
  await S.say('Country risk 25 comes from the Country master', 'South Africa: FATF increased monitoring (grey list)');
  await showField('Country risk (0–40)', 3500);
  await S.say('Countries (AML risk): a score from 0 to 40 for each country', 'Updated after each FATF plenary or sanctions change — black-listed countries score 40');
  await S.go('/module/103', 1000);
  await openTab('Country');
  await find('South Africa');
  await S.highlight(row('South Africa'), 4000);
  await openTab('KYC Risk Factor');
  await S.say('Compliance decides that remote onboarding carries more risk', 'Onboarding channel “non face to face”: weight 10 → 15');
  await find('channel_non_face_to_face');
  await S.highlight(row('channel_non_face_to_face'), 3000);
  await editRow('channel_non_face_to_face');
  await S.fill('kyc_risk_factor', { score: '15' });
  await p.waitForTimeout(600);
  await S.submit();

  await S.openRecord('kyc_case', KYC_ID);
  await S.say(`The case still shows ${score}`, 'A risk score is worked out when the case is saved — not every time a weight changes');
  await showField('Risk score', 3500);
  await S.say('Re-assess the case: open it and save', 'At the next edit or periodic review the case reads the current weights');
  await S.editRecord('kyc_case', KYC_ID);
  await p.waitForTimeout(1200);
  await S.submit();
  await S.openRecord('kyc_case', KYC_ID);
  const after = await poll(async () => Number((await api('GCADMIN', 'GET', `/runtime/records/${KYC_ID}`)).data?.data?.risk_score), { what: 'rescored' });
  S.log('kyc score after', after);
  if (after !== score + 5) S.issue(`KYC risk score after the weight change is ${after}, expected ${score + 5}`);
  await S.say(`Risk score ${after}: +5 from the new channel weight`, 'Rating, EDD and the approver follow the score');
  await showField('Risk score', 3800);

  // ── 5. Approval matrix and service catalogue ───────────────────────────────────────────────────────────────────
  await S.go('/module/103', 1000);
  await S.step(5, 'Approval matrix', 'Approval Matrices: who approves a loan, by amount', 'Up to MUR 5m Loans Manager · up to 20m Credit Committee · above that the Board');
  await openTab('Approval Matrix');
  await S.highlight(p.locator('tbody'), 4000);
  await S.say('Each application reads its band from these limits', 'MUR 13m → Credit Committee: the approval goes to that committee');
  await S.openRecord('loan_application', LOAN_ID);
  await showField('Approval authority', 3800);

  await S.go('/module/103', 1000);
  await S.step(6, 'Service catalogue', 'Service Request Catalogue: every request type', 'Business unit, service level in business hours, and whether it needs approval');
  await openTab('Service Type');
  await p.waitForTimeout(1500);
  await find('Partial prepayment');
  await S.highlight(row('Partial prepayment'), 3500);
  await S.say('A partial prepayment: 40 business hours, approval required', 'Each request copies these values and routes the approval to the business-unit head');
  await S.openRecord('service_request', SERVICE_ID);
  await showField('Catalogue SLA (business hours)', 3000);
  await showField('Needs approval', 2800);

  // ── 6. Rates (read only) ───────────────────────────────────────────────────────────────────────────────────────
  await S.go('/module/103', 1000);
  await S.step(7, 'Rates and other masters', 'Genesis PLR History: the prime lending rate over time', 'Loan pricing and each product\'s “Rate from” read the latest rate in effect');
  await openTab('Genesis PLR');
  await S.highlight(row('6.825'), 3500);
  await S.say('Real Estate Loan: “Rate from” = latest PLR 6.825% + the product margin −0.675%', 'Products & Services ▸ the product sheet');
  await S.openRecord('financial_product', PRODUCT_ID);
  await showField('Rate from (% p.a.)', 4000);
  await S.say('A new PLR row reprices every variable-rate loan and product', 'Add one only after ALCO approves it, with its effective date — it applies from that day');
  await p.waitForTimeout(3800);
  await S.go('/module/103', 1000);
  await openTab('FX Reference Rate');
  await S.say('FX Reference Rates: the daily TT board', 'Converts amounts to rupees and prices FX quotes — the forex desk publishes it each morning');
  await S.highlight(p.locator('tbody'), 4000);
  await openTab('Collateral Type');
  await S.say('Collateral Types & Haircuts: lending value and LTV alert levels', 'Read by every pledge and by the margin-call checks');
  await S.highlight(p.locator('tbody'), 4000);
  await openTab('Model Portfolio');
  await S.say('Model Portfolios A–E: the target asset mix for each risk profile', 'Conservative A to Aggressive E — used by wealth mandates');
  await S.highlight(p.locator('tbody'), 4000);

  // ── 7. Put the masters back ────────────────────────────────────────────────────────────────────────────────────
  await S.step(8, 'Put it back', 'For this tutorial, restore what we changed', 'Every change to a master is kept in the record\'s history');
  await openTab('KYC Risk Factor');
  await find('channel_non_face_to_face');
  await editRow('channel_non_face_to_face');
  await S.say('Non-face-to-face weight back to 10');
  await S.fill('kyc_risk_factor', { score: String(FACTOR_SCORE) });
  await S.submit();
  await openTab('Product Routing');
  await find('Personal Loan');
  await editRow('Personal Loan');
  await S.say('Personal Loan routing back to Retail Loans, 4 business hours');
  await S.fill('product_routing', { queue: ROUTING.queue, first_contact_hours: String(ROUTING.first_contact_hours) });
  await S.submit();
  await S.say('And save the KYC case once more so it reads the restored weight');
  await S.editRecord('kyc_case', KYC_ID);
  await p.waitForTimeout(1000);
  await S.submit();
  const back = Number((await api('GCADMIN', 'GET', `/runtime/records/${KYC_ID}`)).data?.data?.risk_score);
  if (back !== score) S.issue(`KYC risk score after restoring is ${back}, expected ${score}`);
  await S.openRecord('kyc_case', KYC_ID);
  await S.say(`Back to ${back}`, 'Weights and routing are as they were');
  await showField('Risk score', 3000);

  await S.logout();
  await S.card({
    eyebrow: 'Summary',
    title: 'Masters — reference data',
    text: 'Change the data, not the system: the next calculation uses the new values.',
    bullets: [
      'Routing: business unit, queue and first-contact target',
      'KYC weights and country risk: re-scored on the next save',
      'Approval matrix: who approves, by amount',
      'Service catalogue: service level and approval need',
      'PLR and FX board: pricing and conversion',
      'Builder for structure · Masters for values',
    ],
  }, 7000);
}
