// Products & Services: the catalogue, a product sheet, the checklist an application gets, an administrator's
// update, "Rate from" = Genesis PLR + margin, product routing, and the website's product cards → pre-filled enquiry.
import { records, obj, poll } from '../lib/studio.mjs';

export const title = 'Products & Services';

const PERSON = { first: 'Kavya', last: 'Ramphul', email: 'kavya.ramphul@example.com', mobile: '+230 5712 3456' };
const FEE_TEXT = 'Arrangement fee 0.5%, waived for applications received before 31 December 2026.';

export default async function run(S) {
  const { p } = S;
  // Under load a full page load shows the app's boot spinner for a while: wait it out off-camera (trimmed).
  const spinGone = () => S.waitCut(() => p.waitForFunction(
    () => !document.querySelector('.animate-spin') && (document.body?.innerText || '').length > 150,
    null, { timeout: 90000, polling: 250 },
  ).catch(() => {}));
  const go0 = S.go.bind(S);
  S.go = async (...args) => { await go0(...args); await spinGone(); };
  const login0 = S.login.bind(S);
  S.login = async (...args) => { await login0(...args); await spinGone(); };
  // Lookups before anything is on screen: trimmed out of the video.
  const [product, enquiry, all, lastEnquiry] = await S.waitCut(async () => {
    const prod = await obj('financial_product');
    const enq = await obj('enquiry');
    return [prod, enq, await records('GCADMIN', prod.id), Math.max(0, ...(await records('GCADMIN', enq.id, { limit: 500 })).map((r) => r.id))];
  });
  const byCode = (c) => all.find((r) => r.data?.code === c);
  const realEstate = byCode('LND-RE');
  const income = byCode('FND-INC');
  if (!realEstate || !income) throw new Error('demo products LND-RE / FND-INC not found');

  // A field on the record panel, located by its label (the panel shows labels in capitals via CSS).
  const panelField = (label) => p.locator('dt').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().locator('xpath=..');
  const tableSearch = () => p.locator('main input[placeholder="Search…"]').first();

  await S.go('/login');
  await S.waitCut(() => p.waitForSelector('input[name=employee_id]', { timeout: 120000 }));
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 1',
    title: 'Products & Services',
    text: 'The catalogue of Genesis products and services: one product sheet per product, the source for pricing, checklists and the website.',
    bullets: [
      'Browse and filter the 22 products by legal entity',
      'Read a product sheet: terms, eligibility, security, fees',
      'See the document checklist applications get',
      '"Rate from" = Genesis PLR + the product margin',
      'An administrator updates a product sheet',
      'Website product cards open a pre-filled enquiry',
    ],
    foot: 'Personas: Priya Ramdin (Relationship Manager) · Kevin Lam (CRM Administrator) · a prospect on the website',
  }, 8000);

  // ── 1. The catalogue ───────────────────────────────────────────────────────
  await S.step(1, 'The catalogue', 'Relationship managers use the catalogue to answer client questions', 'Read-only for them; administrators keep it up to date');
  await S.login('GCRM1', 'Relationship manager: looks up products while talking to clients');
  await S.say('Products & Services is the first module under Client 360', '22 products and services across six Genesis legal entities');
  await S.moveTo(p.getByRole('link', { name: 'Products & Services' }).first());
  await S.settle(1200);
  await p.waitForTimeout(1500);
  await S.say('Each row is one product: code, name, business unit, category, risk rating and "Rate from"', 'The business unit names the legal entity that provides it');
  await p.waitForTimeout(1800);
  await S.say('Filter by legal entity: type part of its name in the search box', 'Here: Genesis Global Funds, the funds entity');
  await S.moveTo(tableSearch());
  await S.type('Global Funds', 70);
  await p.waitForTimeout(3200);
  await S.say('Six investment funds are provided by Genesis Global Funds', 'Search matches what the table shows, not only the codes');
  await p.waitForTimeout(2600);
  await S.moveTo(tableSearch());
  await p.keyboard.press('Meta+A'); await p.keyboard.press('Backspace');
  await S.type('Genesis Life', 70);
  await p.waitForTimeout(2200);
  await S.say('Genesis Life Ltd provides the four loans', 'Real Estate, Personal, Investment-Backed and Commercial');
  await p.waitForTimeout(2800);

  // ── 2. A lending product sheet ─────────────────────────────────────────────
  await S.step(2, 'A product sheet', 'Open Real Estate Loan to see its product sheet', 'Click the row');
  await S.moveTo(p.locator('main tr').filter({ hasText: 'Real Estate Loan' }).first());
  await S.settle(1500);
  await S.say('Details: code, French name, business unit and the legal entity that provides it', 'Provided by: Genesis Life Ltd (Loans business line)');
  await S.highlight(panelField('Provided by'), 3000);
  await S.say('Terms: the margin over the Genesis PLR, maximum tenure, age at maturity and financing (LTV)', 'Loan applications check these limits and read the margin for pricing');
  await S.highlight(panelField('Margin vs Genesis PLR (% points)'), 3000);
  await S.say('Rate from = the current Genesis PLR (6.825%) + the margin (−0.675%) = 6.15% a year', 'Calculated by the CRM — it is greyed and cannot be typed');
  await S.highlight(panelField('Rate from (% p.a.)'), 4200);
  await S.say('The product sheet: features, eligibility, security & insurance', 'The same text as the product page on the Genesis website');
  await S.highlight(panelField('Features & benefits'), 3200);
  await S.highlight(panelField('Security & insurance'), 2200);
  await S.say('Documents required, fees & charges and how to apply', 'Use it to answer a client accurately on the phone');
  await S.highlight(panelField('Documents required'), 2600);
  await S.highlight(panelField('How to apply'), 2400);
  await S.say('Docs tab: the document checklist for applications for this product', 'Each new application gets this list on its own Docs tab, with what is in and what is missing');
  await S.tab('Docs');
  await p.waitForTimeout(800);
  await S.scroll(350, 1200);
  await S.highlight(p.getByText('Document checklist for applications').first().locator('xpath=..'), 4200);

  // ── 3. A fund product ──────────────────────────────────────────────────────
  await S.step(3, 'A fund product', 'Funds have the same product sheet', 'Income Fund, provided by Genesis Global Funds');
  await S.openRecord('financial_product', income.id);
  await p.waitForTimeout(1500);
  await S.say('Business unit Funds, category Funds, risk rating on a 1–5 scale', 'The risk rating is compared with the client\'s risk profile when they invest');
  await S.highlight(panelField('Risk rating (1 low – 5 high)'), 3200);
  await S.say('No PLR margin, so no "Rate from": that applies to loans only', 'Fund prices (NAV) are kept in Investment Funds');
  await p.waitForTimeout(2800);
  await S.say('Its applications use the "Fund subscription" checklist', 'Docs tab');
  await S.tab('Docs');
  await S.scroll(350, 1000);
  await S.highlight(p.getByText('Document checklist for applications').first().locator('xpath=..'), 3500);

  // ── 4. The administrator updates a product ─────────────────────────────────
  await S.step(4, 'Update a product', 'Product terms change: the CRM administrator updates the sheet', 'Only administrators may edit the catalogue');
  await S.login('GCADMIN', 'CRM administrator: keeps the catalogue up to date');
  await S.openObject('financial_product');
  await S.moveTo(tableSearch());
  await S.type('Real Estate', 70);
  await p.waitForTimeout(1200);
  await S.say('Edit opens the product form', 'Every field of the product sheet is on it');
  await S.moveTo(p.locator('main tr').filter({ hasText: 'Real Estate Loan' }).first().getByRole('button', { name: 'Edit' }));
  await S.settle(1200);
  await S.say('Rate from stays greyed: it is calculated, never typed', 'Change the margin and it follows');
  await S.highlight(p.locator('[id="rate_from"]'), 2800);
  await S.say('Update Fees & charges with the new arrangement fee', 'Type the new text over the old one');
  await S.fill('financial_product', { fees_and_charges: FEE_TEXT }, { delay: 12 });
  await p.waitForTimeout(800);
  await S.say('Save: the change is recorded in the product\'s Audit tab', 'Who changed what, and when');
  await S.submit();
  await S.openRecord('financial_product', realEstate.id);
  await S.say('Everyone now sees the new fee on the product sheet', 'Including relationship managers answering clients');
  await S.highlight(panelField('Fees & charges'), 4000);
  await S.say('The Audit tab shows the change: who made it and when', 'Old and new values are kept');
  await S.tab('Audit');
  await p.waitForTimeout(800);
  await S.scroll(350, 2600);

  // ── 5. PLR and routing (Masters) ───────────────────────────────────────────
  await S.step(5, 'PLR and routing', 'Masters ▸ Genesis PLR History: the prime lending rate in force', 'Rate from on every loan product reads the latest rate already in effect');
  const plr = await obj('plr_rate');
  await S.go(`/module/${plr.module_id}/object/${plr.id}`, 1200);
  await p.waitForTimeout(2500);
  await S.say('When ALCO changes the PLR, the administrator adds a row: rate, effective date, approver', 'Every loan product\'s Rate from is then recalculated at once; a future date waits for that day');
  await p.waitForTimeout(4800);
  await S.say('Running loans are repriced through Loan Servicing ▸ PLR Change Campaigns', 'We don\'t change the PLR in this video: the demo loans rely on it');
  await p.waitForTimeout(3800);
  const routing = await obj('product_routing');
  await S.say('Masters ▸ Website Product Routing: which business unit and queue receives an enquiry', 'One rule per product');
  await S.go(`/module/${routing.module_id}/object/${routing.id}`, 1200);
  await S.moveTo(p.locator('main input[placeholder="Search…"]').first());
  await S.type('Real Estate', 70);
  await p.waitForTimeout(1500);
  await S.say('Real Estate Loan enquiries go to Lending, queue Retail Loans', 'First contact target: 4 business hours');
  await S.highlight(p.locator('main tr').filter({ hasText: 'Real Estate Loan' }).first(), 4000);

  // ── 6. On the website ──────────────────────────────────────────────────────
  await S.step(6, 'On the website', 'The website shows the catalogue straight from the CRM', 'Website preview: /site/genesis-capital (no sign-in needed)');
  await S.go('/site/genesis-capital', 1500);
  await p.waitForTimeout(1500);
  await S.say('The prime lending rate comes from the PLR History', 'Exchange rates and fund prices are fed from the CRM too');
  await S.highlight(p.getByText('Prime lending rate').first().locator('xpath=ancestor::section[1]'), 2800);
  const catalogue = p.getByText('Products & services', { exact: true }).first().locator('xpath=ancestor::section[1]');
  await catalogue.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await p.waitForTimeout(1400);
  await S.say('Products & services: one card per active product, with its legal entity', 'Pick a category to narrow the list');
  await S.moveTo(catalogue.getByRole('button', { name: 'Financing', exact: true }));
  await p.waitForTimeout(1500);
  const card = catalogue.locator('article[data-product="LND-RE"]');
  await S.say('Rates from 6.15% p.a.: the same Rate from as in the CRM', 'Change the PLR or the margin and the website follows');
  await S.highlight(card, 3800);
  await S.say('"Request more information" opens the enquiry form for this product', 'The link carries the product code (?prod=LND-RE)');
  await S.moveTo(card.getByRole('link', { name: /Request more information/ }));
  await S.settle(1500);

  // ── 7. The prospect's enquiry ──────────────────────────────────────────────
  await S.step(7, 'A pre-filled enquiry', 'The form opens with Real Estate Loan already chosen', 'The prospect only adds their needs and contact details');
  await S.highlight(p.locator('[id="f-product_code"]'), 3000);
  await S.moveTo(p.locator('[id="estimated_amount"]'));
  await S.type('6500000', 60);
  await S.moveTo(p.locator('[id="requested_tenure_months"]'));
  await S.type('240', 80);
  await S.moveTo(p.locator('[id="message"]'));
  await S.type('We are buying a house in Moka and would like to know the rate and documents needed.', 18);
  await S.moveTo(p.getByRole('button', { name: /Continue/ }));
  await p.waitForTimeout(800);
  await S.say('Step 2: who is asking', 'Name, email, mobile and consent');
  for (const [id, v] of [['first_name', PERSON.first], ['last_name', PERSON.last], ['email', PERSON.email], ['mobile', PERSON.mobile]]) {
    await S.moveTo(p.locator(`[id="${id}"]`));
    await S.type(v, 40);
  }
  const consent = p.locator('input[type=checkbox]').first();
  if (await consent.count()) await S.moveTo(consent);
  const sent = p.waitForResponse((r) => /\/public\/forms\//.test(r.url()) && r.request().method() === 'POST', { timeout: 60000 });
  await S.moveTo(p.locator('button[type=submit]').last());
  const resp = await S.waitCut(() => sent);
  if (resp.status() >= 300) throw new Error(`public form ${resp.status()} ${(await resp.text()).slice(0, 300)}`);
  await S.settle(1200);
  await S.say('Sent: the enquiry is created in the CRM and routed by the product', 'No re-typing by staff');
  await p.waitForTimeout(3200);

  // ── 8. Routed in the CRM ───────────────────────────────────────────────────
  await S.step(8, 'Routed in the CRM', 'Back in the CRM, the enquiry is already in Enquiries & Leads', 'Routed by Website Product Routing');
  const rec = await S.waitCut(() => poll(async () => (await records('GCADMIN', enquiry.id))
    .filter((r) => r.id > lastEnquiry && r.data?.email === PERSON.email && r.data?.product_code === 'LND-RE')[0], { what: 'the website enquiry', timeout: 60000 }));
  await S.openRecord('enquiry', rec.id);
  await S.say(`${PERSON.first} ${PERSON.last}: Real Estate Loan, MUR 6,500,000 over 240 months`, 'The product came from the link; the client never had to pick it');
  await S.highlight(panelField('I am interested in'), 3400);
  await S.say('Business unit Lending and queue Retail Loans come from the routing rule', 'and handed to a loans executive automatically');
  await S.highlight(panelField('Queue'), 3400);
  await S.say('The indicative rate is the same PLR + margin as Rate from', 'The instalment is calculated from it');
  await S.highlight(panelField('Indicative rate %'), 3600);
  await S.clear();

  await S.card({
    eyebrow: 'Summary',
    title: 'Products & Services',
    text: 'One product sheet drives what staff say, what applications need and what the website shows.',
    bullets: [
      'Filter the catalogue by legal entity',
      'Product sheet = terms, eligibility, fees, how to apply',
      'Docs tab = the checklist applications get',
      'Rate from = Genesis PLR + margin, recalculated on a PLR change',
      'Only administrators edit; every change is audited',
      'Website cards open the enquiry pre-filled and routed',
    ],
    foot: 'Next: Tutorial 2 · Clients (Client 360)',
  }, 7000);
}
