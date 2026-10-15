// Enquiries & Leads: a website enquiry is routed, scored and acknowledged; the loans executive qualifies it, hits the
// conversion gate, completes it and converts it (party, relationship, KYC case, consent, loan application). Then: a
// "Talk to" link, a disqualified enquiry, a cross-entity referral, calculator sessions and the wealth wizard.
import { records, obj, api, poll, PEOPLE } from '../lib/studio.mjs';

export const title = 'Enquiries & Leads';

const GET_IN_TOUCH = '2fe40fb6f0da0570cbe29eb9f465541b5c52897826acc486';
const QUICK_ESTIMATE = '00fef6fbb0ff11d240551a082016481c86216892329143eb';

export default async function run(S) {
  const { p } = S;
  const tag = String(Date.now()).slice(-5);
  const A = { first: 'Aditi', last: 'Ramsahye', email: `aditi.ramsahye.${tag}@example.com`, mobile: `57${tag.slice(0, 2)} ${tag.slice(1, 5)}` };
  const B = { first: 'Yannick', last: 'Lebon', email: `yannick.lebon.${tag}@example.com`, mobile: `59${tag.slice(2, 4)} ${tag.slice(0, 4)}` };
  const enquiryObj = await obj('enquiry');
  const partyObj = await obj('party');

  // ── local helpers ──
  // The success toast after a drag sits under the caption; lift the caption for a moment so it can be read.
  const showToast = async (ms = 2200) => { await S.clear(); await p.waitForTimeout(ms); };
  const findEnquiry = (email) => poll(async () => (await records('GCADMIN', enquiryObj.id, { search: email })).find((r) => r.data?.email === email),
    { what: `enquiry ${email}`, timeout: 60000 });
  // S.drag needs both columns on screen; Disqualified sits off to the right of New. Hold the card at the board's
  // right edge so the board auto-scrolls (as a user would), then drop on the target column.
  async function farDrag(cardText, from, to, { expectFail = false } = {}) {
    const src = S.column(from), dst = S.column(to);
    await src.evaluate((col) => { const c = col.parentElement; c.scrollTo({ left: 0, behavior: 'smooth' }); });
    await p.waitForTimeout(600);
    const card = src.getByText(cardText).first();
    await card.waitFor({ timeout: 30000 });
    const board = await src.evaluate((col) => { const r = col.parentElement.getBoundingClientRect(); return { right: r.right, y: r.top }; });
    const cb = await card.boundingBox();
    const sx = cb.x + Math.min(cb.width / 2, 120), sy = cb.y + cb.height / 2;
    await p.mouse.move(sx, sy, { steps: 12 }); await p.waitForTimeout(300);
    const resp = p.waitForResponse((r) => r.url().includes('/stage') && r.request().method() === 'PATCH', { timeout: 60000 });
    await p.mouse.down();
    await p.mouse.move(sx + 20, sy + 6, { steps: 5 });
    await p.mouse.move(board.right - 12, sy + 40, { steps: 30 });
    const t0 = Date.now(), end = t0 + 15000;
    for (;;) {
      const db = await dst.boundingBox();
      if (db && db.x + db.width <= board.right + 2) break;
      if (Date.now() > end) break;
      await p.mouse.move(board.right - 10 + (Date.now() % 2), sy + 40);
      await p.waitForTimeout(120);
    }
    S.log('auto-scroll took', Date.now() - t0, 'ms');
    const db = await dst.boundingBox();
    await p.mouse.move(db.x + db.width / 2, Math.min(db.y + 120, db.y + db.height - 20), { steps: 20 });
    await p.waitForTimeout(350);
    await p.mouse.up();
    const r = await S.waitCut(() => resp);
    S.log(`move ${from} -> ${to}:`, r.status());
    if ((r.status() < 300) === expectFail) throw new Error(`Unexpected move result ${from}->${to} ${r.status()} ${(await r.text()).slice(0, 300)}`);
    await p.waitForTimeout(1800);
    return r;
  }
  const hl = async (loc, ms = 2800) => { if (await loc.count()) await S.highlight(loc.first(), ms); else { S.log('highlight target missing'); await p.waitForTimeout(ms); } };
  // openObject's view switch checks for the button before the page has drawn it; wait for it first.
  async function openView(name, v) {
    await S.openObject(name);
    const btn = p.locator(`button[title="${v}"]`).first();
    if (!(await S.waitCut(() => btn.waitFor({ timeout: v === 'Table' ? 8000 : 90000 }).then(() => true).catch(() => false)))) return;
    await S.moveTo(btn); await S.settle(800);
    if (v === 'Pipeline') await S.waitCut(() => S.column('New').or(S.column('Submitted')).first().waitFor({ timeout: 90000 }).catch(() => {}));
  }
  const formCard = (name) => p.getByText(name, { exact: true }).first().locator('xpath=ancestor::div[.//button[contains(., "Email to client")]][1]');
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
    eyebrow: 'Genesis CRM · Tutorial 3',
    title: 'Enquiries & Leads',
    text: 'From a website enquiry to a new client with a loan application — routed, scored and timed automatically.',
    bullets: ['Share a web form with a prospect', 'Automatic routing, scoring, rate and acknowledgement', 'Qualify on the pipeline board — and the conversion gate', 'What converting creates', 'Disqualify with a reason · refer to another entity', 'Calculator sessions and the qualification wizard'],
    foot: 'Personas: Priya Ramdin (RM) · the loans executive chosen by routing · Shalini Ramtohul (Head of BD) · the client',
  }, 8000);

  // ── 1. Share a form ──
  await S.step(1, 'Share a web form', 'A prospect calls Priya about a personal loan', 'She emails the website enquiry form instead of typing the details in herself', 4500);
  await S.login('GCRM1', 'Relationship manager — first point of contact');
  await S.go('/web-forms', 1200);
  await S.say('Tools ▸ Web forms lists every form published on the website', 'Email it, copy the link, or open it — answers become CRM records');
  await p.waitForTimeout(2500);
  const card = formCard('Get in touch');
  await S.moveTo(card.locator('select').first(), { click: false });
  await card.locator('select').first().selectOption({ label: 'Personal Loan' });
  await p.waitForTimeout(600);
  await S.moveTo(card.getByRole('button', { name: 'Email to client' }));
  await p.waitForTimeout(900);
  const dlg = p.locator('[role=dialog]').last();
  await S.say('Client email, name, language and a personal note', 'Personal Loan is already chosen for her');
  await S.moveTo(dlg.locator('input[type=email]')); await S.type(A.email, 25);
  await S.moveTo(dlg.getByPlaceholder('Anne Dupont')); await S.type(`${A.first} ${A.last}`, 45);
  await S.moveTo(dlg.locator('textarea')); await S.type('As discussed on the phone today — this takes two minutes.', 22);
  const sent = p.waitForResponse((r) => r.url().includes('/web-forms/') && r.request().method() === 'POST', { timeout: 60000 });
  await S.moveTo(dlg.getByRole('button', { name: 'Send' }));
  const sr = await S.waitCut(() => sent);
  if (sr.status() >= 300) S.issue(`Web form email failed: ${sr.status()} ${(await sr.text()).slice(0, 200)}`);
  const sentUrl = (await sr.json().catch(() => ({})))?.data?.url;
  S.log('emailed link', sentUrl);
  await S.settle(800);
  await S.say('The client gets a short email with a button that opens the form', 'The email is recorded under Email logs');
  await p.waitForTimeout(2500);
  await S.clickText('Done');
  await p.waitForTimeout(500);
  await S.logout();

  // ── 2. The client fills in the form ──
  await S.step(2, 'The client submits', 'Aditi opens the link from the email', 'Same form as on the website — no account needed');
  await S.go(sentUrl ? sentUrl.replace(/^https?:\/\/[^/]+/, '') : `/f/${GET_IN_TOUCH}?prod=LND-PL`, 1500);
  await publicFill('estimated_amount', '650000');
  await S.say('She gives the amount but leaves the tenure empty', 'Not every client knows it yet — we will see why it matters');
  await publicFill('message', 'I would like to renovate my kitchen. Please call me after 4 pm.');
  await S.clickText('Continue');
  await p.waitForTimeout(900);
  await S.say('Next page: contact details and consent to be contacted');
  await publicFill('first_name', A.first);
  await publicFill('last_name', A.last);
  await publicFill('email', A.email);
  await publicFill('mobile', A.mobile);
  await S.moveTo(p.getByText('I agree to be contacted', { exact: false }).first());
  const sub = p.waitForResponse((r) => r.url().includes('/public/forms/') && r.request().method() === 'POST', { timeout: 60000 });
  await S.clickText('Send request');
  const subR = await S.waitCut(() => sub);
  if (subR.status() >= 300) throw new Error(`public submit ${subR.status()} ${(await subR.text()).slice(0, 300)}`);
  await S.settle(1200);
  await S.say('She gets a reference number straight away', 'And an acknowledgement email in her language');
  await p.waitForTimeout(3500);

  const enqA = await S.waitCut(() => findEnquiry(A.email));
  const exec = enqA.assigned_to;
  if (!PEOPLE[exec]) throw new Error(`enquiry assigned to unexpected ${exec}`);
  S.log('assigned to', exec);
  const X = PEOPLE[exec][0].split(' ')[0];

  // ── 3. What the system did ──
  await S.step(3, 'Routed, scored, timed', `Routing gave it to ${PEOPLE[exec][0]} in the Lending team`, 'Personal loans go to the loans executives in turn', 4000);
  await S.login(exec, 'Loans executive — owns the new enquiry');
  await openView('enquiry', 'Pipeline');
  await S.say(`${X} finds it in the New column of the enquiry funnel`, 'New → Contacted → Qualified → Converted, or Nurture / Disqualified');
  await hl(S.column('New').getByText(A.email).first().locator('xpath=../..'));
  await S.openRecord('enquiry', enqA.id);
  await S.waitCut(() => p.getByText('Routing & scoring', { exact: false }).first().waitFor({ timeout: 90000 }));
  await S.say('Everything the client typed is on the record', 'Channel: website form · consent captured with its date and wording');
  await p.waitForTimeout(3000);
  const routing = p.getByText('Routing & scoring', { exact: false }).first();
  await routing.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await p.waitForTimeout(1200);
  await S.say('Calculated for her: entity and queue, lead score and grade, indicative rate', 'Score uses amount, contact details, consent and channel — grade A to F');
  await p.waitForTimeout(6500);
  await S.say('The speed-to-lead clock started too: first contact within 4 business hours', 'Tools ▸ SLA Board shows it with the time remaining');
  await S.waitCut(() => poll(async () => {
    const d = (await api(exec, 'GET', '/sla/dashboard?scope=me')).data;
    return (d?.timers || []).some((t) => t.entity_id === enqA.id);
  }, { what: 'SLA timer', timeout: 90000 }).catch(() => null));
  await S.go('/sla', 1200);
  const timer = p.getByText(`${A.first} ${A.last}`).first();
  if (await timer.count()) await hl(timer.locator('xpath=ancestor::*[self::a or self::div][contains(@class,"grid")][1]'), 3500);
  else { S.issue('SLA Board: new enquiry timer not listed'); await p.waitForTimeout(3000); }

  // ── 4. Qualify ──
  await S.step(4, 'Contact and qualify', `After calling Aditi, ${X} drags the card to Contacted`, 'That stops the first-response clock');
  await openView('enquiry', 'Pipeline');
  await S.drag(A.email, 'New', 'Contacted');
  await showToast();
  await S.say('Need confirmed: on to Qualified', 'Qualified needs an email and a product — both are there');
  await S.drag(A.email, 'Contacted', 'Qualified');
  await showToast();

  // ── 5. The gate ──
  await S.step(5, 'The conversion gate', 'Next: convert it', 'A loan enquiry needs an amount and a tenure — they start the loan application');
  await S.drag(A.email, 'Qualified', 'Converted', { expectFail: true });
  await S.say('Blocked: the card goes back and the message says what is missing', '"Open record to complete" goes straight to the form');
  await hl(p.getByText('Enter the requested amount and tenure', { exact: false }).first().locator('xpath=ancestor::div[1]'), 3500);
  await S.moveTo(p.getByRole('button', { name: 'Open record to complete' }));
  await S.settle(600);
  await S.waitCut(() => p.waitForFunction(() => document.querySelector('input#first_name')?.value, null, { timeout: 90000 }));
  await p.waitForTimeout(600);
  await S.fill('enquiry', { requested_tenure_months: '60' });
  await S.say('Add the tenure Aditi gave on the phone: 60 months');
  await S.submit();
  await openView('enquiry', 'Pipeline');
  await S.say('Now the move to Converted goes through');
  await S.drag(A.email, 'Qualified', 'Converted');
  await showToast();

  // ── 6. What conversion created ──
  await S.step(6, 'What converting created', 'Converting runs the onboarding automatically', 'Client record · entity relationship · KYC case · consent · loan application', 4500);
  const conv = await S.waitCut(() => poll(async () => {
    const r = (await records('GCADMIN', enquiryObj.id, { search: A.email })).find((x) => x.id === enqA.id);
    return r?.data?.party ? r : null;
  }, { what: 'conversion' }));
  const loanObj = await obj('loan_application');
  await S.waitCut(() => poll(async () => (await records('GCADMIN', loanObj.id, { search: `${A.first} ${A.last}` })).some((x) => x.data?.party === conv.data.party || x.data?.enquiry === enqA.id),
    { what: 'loan application', timeout: 90000 }).catch(() => S.issue('Conversion: no loan application seen')));
  await S.openRecord('enquiry', enqA.id);
  await S.waitCut(() => p.getByText('Converted to party', { exact: false }).first().waitFor({ timeout: 90000 }));
  await S.say('The enquiry now points to the new client record', 'Converted to party');
  const convField = p.getByText('Converted to party', { exact: false }).first();
  await convField.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await hl(convField.locator('xpath=..'), 2500);
  await S.say('Related: the loan application, started at Pre-qualified with amount and tenure', 'The loans team continues there (see the Retail Lending tutorial)');
  await S.tab('Related');
  await p.getByRole('button', { name: 'Related', exact: true }).last().evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await p.waitForTimeout(1000);
  await hl(p.getByText(/^Loan Applications$/i).last().locator('xpath=../..'), 3500);
  await S.say('The new client: relationship with the lending entity, KYC case and marketing consent', 'Clients ▸ the client record ▸ Related');
  await S.openRecord('party', conv.data.party);
  await S.waitCut(() => p.getByRole('button', { name: 'Related', exact: true }).last().waitFor({ timeout: 90000 }));
  await S.tab('Related');
  await p.getByRole('button', { name: 'Related', exact: true }).last().evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await p.waitForTimeout(3000);
  for (const sec of [/^KYC Cases$/i, /^Loan Applications$/i]) {
    const h = p.getByText(sec).first();
    if (!(await h.count())) { S.log('party related: missing', String(sec)); continue; }
    await h.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await p.waitForTimeout(700);
    await hl(h.locator('xpath=../..'), 2600);
  }

  // ── 7. Talk to + disqualify ──
  await S.step(7, 'A "Talk to" link, then disqualify', `${X} shares a personal link with another prospect`, 'Web forms ▸ Talk to: the enquiry comes straight back, skipping routing');
  await S.go('/web-forms', 1200);
  const card2 = formCard('Get in touch');
  await S.moveTo(card2.locator('select').nth(1), { click: false });
  await card2.locator('select').nth(1).selectOption({ label: PEOPLE[exec][0] });
  await p.waitForTimeout(600);
  const linkResp = p.waitForResponse((r) => r.url().includes('/web-forms/') && r.url().includes('link'), { timeout: 30000 });
  await S.moveTo(card2.getByRole('button', { name: 'Copy link' }));
  const lj = await (await linkResp).json().catch(() => ({}));
  const link = lj?.data?.url || lj?.url || `/f/${GET_IN_TOUCH}?expert=${exec}`;
  S.log('talk-to link', link);
  await S.say('Copied — pasted into a WhatsApp message to Yannick', '', 2500);
  await S.logout();
  await S.go(link.replace(/^https?:\/\/[^/]+/, ''), 1500);
  await S.say(`The form says "You'll speak with ${PEOPLE[exec][0]}"`);
  await p.waitForTimeout(1500);
  await publicFill('product_code', 'LND-PL');
  await publicFill('estimated_amount', '150000');
  await publicFill('message', 'I am a student and would like a loan to buy a car.');
  await S.clickText('Continue');
  await p.waitForTimeout(800);
  await publicFill('first_name', B.first);
  await publicFill('last_name', B.last);
  await publicFill('email', B.email);
  await publicFill('mobile', B.mobile);
  await S.moveTo(p.getByText('I agree to be contacted', { exact: false }).first());
  const sub2 = p.waitForResponse((r) => r.url().includes('/public/forms/') && r.request().method() === 'POST', { timeout: 60000 });
  await S.clickText('Send request');
  await S.waitCut(() => sub2);
  await S.settle(1000);
  await p.waitForTimeout(1500);
  const enqB = await S.waitCut(() => findEnquiry(B.email));
  if (enqB.assigned_to !== exec) S.issue(`Talk-to enquiry went to ${enqB.assigned_to}, not ${exec}`);
  await S.login(exec, 'Back in the CRM');
  await openView('enquiry', 'Pipeline');
  await S.say('After the call: no income yet, so not eligible', 'Disqualified needs a reason — the move is refused without one');
  await farDrag(B.email, 'New', 'Disqualified', { expectFail: true });
  await p.waitForTimeout(1500);
  await S.moveTo(p.getByRole('button', { name: 'Open record to complete' }));
  await S.settle(600);
  await S.waitCut(() => p.waitForFunction(() => document.querySelector('input#first_name')?.value, null, { timeout: 90000 }));
  await p.waitForTimeout(600);
  await S.say('The form opens with the missing field on top', 'Reason: Not eligible');
  await S.fill('enquiry', { disqualify_reason: 'not_eligible' });
  await p.waitForTimeout(1200);
  await S.submit();
  await openView('enquiry', 'Pipeline');
  await farDrag(B.email, 'New', 'Disqualified');
  await showToast(1800);
  await S.column('New').evaluate((c) => c.parentElement.scrollTo({ left: c.parentElement.scrollWidth, behavior: 'smooth' }));
  await p.waitForTimeout(800);
  await hl(S.column('Disqualified').getByText(B.email).first().locator('xpath=../..'), 1500);
  await S.say('Disqualification reasons feed the Lead Funnel dashboard', 'So marketing sees why leads are lost');
  await p.waitForTimeout(3500);

  // ── 8. Referral ──
  await S.step(8, 'Refer to another entity', 'Aditi also wants to invest — a job for Wealth Management', 'Referrals pass a client from one Genesis entity to another, with credit to the referrer');
  const ref = await obj('referral');
  await S.newRecord('referral');
  await S.fill('referral', { party: `${A.first} ${A.last}`, from_business_unit: 'LND', to_business_unit: 'WLT', product_code: 'WLT-DPM', estimated_value: '2000000', receiving_rm: 'GCRM1', reason: 'Client mentioned savings of about MUR 2m to invest after the renovation.' });
  const refRec = await S.submit();
  await S.say('It goes straight to the receiving RM named on it — Priya in Wealth', 'She has one business day to accept it (referral SLA)');
  await p.waitForTimeout(4000);
  await S.login('GCRM1', 'Wealth RM receiving the referral');
  await openView('referral', 'Pipeline');
  await S.say('The referral is waiting in her Submitted column', 'Accepting it stops the one-day clock; Won or Lost records the outcome');
  await S.drag(`${A.first} ${A.last} →`, 'Submitted', 'Accepted');
  await showToast();
  void refRec; void ref;

  // ── 9. Wizard ──
  await S.step(9, 'Guided qualification', 'For wealth enquiries Priya uses the guided wizard', 'Enquiries ▸ Wealth enquiry — qualify: contact, then needs');
  await openView('enquiry', 'Table');
  await S.clickText('Wealth enquiry — qualify');
  await S.settle(900);
  await S.fill('enquiry', { first_name: A.first, last_name: A.last, email: A.email, mobile: A.mobile, preferred_language: 'en', channel: 'referral' });
  await S.clickText('Continue →');
  await p.waitForTimeout(900);
  await S.say('Investable assets and horizon — what the wealth team needs to qualify');
  await S.fill('enquiry', { product_code: 'WLT-DPM', investable_assets: '2000000', investment_horizon: '5_10', message: 'Referred by Lending after her personal loan.' });
  const wz = p.waitForResponse((r) => /\/runtime\/records$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 60000 });
  await S.clickText('Save enquiry');
  await S.waitCut(() => wz);
  await S.settle(1200);
  const wiz = await S.waitCut(() => poll(async () => (await records('GCADMIN', enquiryObj.id, { search: A.email })).find((x) => x.data?.product_code === 'WLT-DPM'), { what: 'wizard enquiry' }));
  await p.waitForTimeout(1500);
  await S.openRecord('enquiry', wiz.id);
  const rs = p.getByText('Routing & scoring', { exact: false }).first();
  await S.waitCut(() => rs.waitFor({ timeout: 90000 }));
  await rs.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await S.say('Aditi is recognised as an existing client — no duplicate will be created', 'Existing client plus a referral: the lead score jumps to grade A');
  await p.waitForTimeout(5500);

  // ── 10. Calculator sessions ──
  await S.step(10, 'Calculator sessions', 'Shalini, Head of Business Development, watches the top of the funnel', 'Calculator sessions: anonymous loan-calculator visits from the website', 4000);
  await S.login('GCBDH', 'Head of BD & Strategic Partnerships');
  await openView('web_event', 'Table');
  await S.waitCut(() => p.locator('main table tbody tr').first().waitFor({ timeout: 90000 }).catch(() => {}));
  await S.say('Product, amount and indicative instalment each visitor looked at', 'Converted shows whether the visitor later left details as an enquiry');
  await p.waitForTimeout(6000);
  await S.say('Newsletter sign-ups and call-back requests land here too', 'A call-back request creates an enquiry for the right team automatically');
  await p.waitForTimeout(4500);

  await S.card({
    eyebrow: 'Summary',
    title: 'Enquiries & Leads',
    bullets: ['Forms create enquiries — routed, scored, priced and acknowledged', 'The SLA clock starts on arrival', 'Gates stop incomplete conversions and say why', 'Converting opens client, relationship, KYC, consent and loan', 'Disqualify with a reason · refer across entities', 'Next: Clients and Retail Lending tutorials'],
  }, 6000);
  void partyObj; void api; void QUICK_ESTIMATE;
}
