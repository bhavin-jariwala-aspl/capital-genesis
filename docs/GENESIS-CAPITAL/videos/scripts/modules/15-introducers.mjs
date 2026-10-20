// Introducers & Partners (user guide §9 "Introducers", §11 portal; process flows 15 and 21): the Head of BD onboards
// a new introducer with the wizard through KYC, Agreement and Active (two gates); an active introducer refers a client
// through the introducer portal; the referral creates and routes an enquiry; funding the referral accrues the
// commission; a commission is clawed back; the Marketing dashboard shows the introducer widgets.
import { API, PEOPLE, api, obj, poll as poll0, records } from '../lib/studio.mjs';

export const title = 'Introducers & Partners';

// A lookup that fails while the backend restarts (other agents' changes reload it) is retried, not fatal.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 400000, ...o });

const mu = (days = 0) => new Date(Date.now() + 4 * 3600e3 + days * 86400e3).toISOString().slice(0, 10); // Mauritius date

// The existing, active introducer who refers a client through the portal (demo data).
const PORTAL_INTRODUCER = 'Hemraj Ah-Kye';
const PORTAL_EMAIL = 'hemraj.ahkye@example.mu';

// Fresh names so the video can be re-recorded.
const INTRODUCERS = [['Kavish', 'Doorgah'], ['Anil', 'Bhugaloo'], ['Rakesh', 'Ramlugun'], ['Nitish', 'Callikan'], ['Vinay', 'Ramtohul'], ['Sooraj', 'Mahadeo'], ['Dev', 'Ramgoolam'], ['Ashok', 'Jugnauth']];
const PROSPECTS = [['Aurélie', 'Lagesse'], ['Mélanie', 'Rault'], ['Christelle', 'Duval'], ['Stéphanie', 'Noël'], ['Valérie', 'Hein'], ['Sandrine', 'Tyack'], ['Nathalie', 'Leclézio'], ['Isabelle', 'Maurel']];
const ascii = (s) => s.normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase();

export default async function run(S) {
  const { p } = S;
  const [introObj, refObj, comObj, kycObj, enqObj] = await S.waitCut(() => Promise.all(['introducer', 'introducer_referral', 'commission_entry', 'kyc_case', 'enquiry'].map(obj)));
  const all = async (o, as = 'GCADMIN') => records(as, o.id, { limit: 1000 });
  const newest = async (o, pred, as) => (await all(o, as)).filter(pred).sort((a, b) => b.id - a.id)[0];
  const data = async (o, id, as = 'GCADMIN') => (await api(as, 'GET', `/runtime/records/${id}`)).data?.data ?? {};

  // ── Small UI helpers (same patterns as the other tutorials) ──────────────────────────────────────────────────────
  // Save the open form; a backend restart (other agents) answers 5xx or drops the request — wait and press Save again.
  async function submit(attempt = 1) {
    const btn = p.locator('form button[type=submit]').last();
    const resp = p.waitForResponse((r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 240000 });
    await S.moveTo(btn);
    const invalid = p.locator('.form-error').first().waitFor({ state: 'visible', timeout: 240000 }).then(() => 'invalid').catch(() => null);
    if (await Promise.race([resp.then(() => 'sent'), invalid]) === 'invalid') throw new Error(`form validation: ${(await p.locator('.form-error').allTextContents()).join('; ')}`);
    const r = await S.waitCut(() => resp);
    const body = await r.text().catch(() => '');
    S.log('save', r.status());
    if (r.status() >= 500 && attempt < 4) {
      await S.waitCut(() => poll(async () => (await fetch(`${API}/auth/me`)).status < 500, { what: 'backend' }));
      if (p.url().match(/\/(new|edit\/\d+)$/)) return submit(attempt + 1);
      return null;
    }
    if (r.status() >= 300) throw new Error(`save ${r.status()} ${body.slice(0, 300)}`);
    await S.settle(900);
    try { return JSON.parse(body).data; } catch { return null; }
  }
  const signIn = async (id, why) => {
    await S.waitCut(async () => {
      const out = p.locator('button[aria-label="Sign out"]');
      if (await out.count()) { await out.first().click(); await p.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}); }
      if (!p.url().includes('/login')) await p.goto(`${S.p.url().split('/').slice(0, 3).join('/')}/login`);
      await p.waitForSelector('input[name=employee_id]', { timeout: 60000 });
    });
    await S.login(id, why);
  };
  const board = (name) => S.waitCut(async () => {
    await S.openObject(name);
    await p.locator('button[title="Pipeline"]').first().waitFor({ timeout: 60000 });
    await S.view('Pipeline');
    await p.locator('div.min-w-\\[260px\\]').first().waitFor({ timeout: 60000 });
  });
  const drag = (card, from, to, o = {}) => S.drag(card, from, to, { after: 1000, ...o });
  const editRec = (name, id) => S.waitCut(() => S.editRecord(name, id));
  // Open a record panel and wait until a label is rendered (a busy server sometimes answers the first load empty).
  const openPanel = async (name, id, label) => {
    for (let i = 0; i < 3; i++) {
      const ok = await S.waitCut(async () => {
        await S.openRecord(name, id);
        return p.getByText(label, { exact: true }).locator('visible=true').first().waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
      });
      if (ok) return;
      S.log('panel not rendered, reloading');
    }
    throw new Error(`panel ${name} #${id} did not render`);
  };
  // Frame a field (label + value) on an open record panel.
  const showField = async (label, ms = 3000) => {
    const l = p.getByText(label, { exact: true }).locator('visible=true').first();
    await l.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await p.waitForTimeout(600);
    await S.highlight(l.locator('xpath=..'), ms);
  };
  // Frame the message the board shows when it refuses a move.
  const showRefusal = async (re, ms = 4500) => {
    const msg = p.getByText(re).first();
    if (await msg.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) await S.highlight(msg.locator('xpath=ancestor::div[contains(@class,"gap-3")][1]'), ms);
    else { S.issue(`no visible message for a refused move (${re})`); await p.waitForTimeout(ms); }
  };
  const approve = async (match, comment) => {
    await S.waitCut(() => poll(async () => {
      const r = await api(S.who, 'GET', '/runtime/workflows/approvals?scope=mine');
      return (Array.isArray(r.data) ? r.data : []).some((x) => String(x.title).includes(match));
    }, { what: `approval ${match}` }));
    await S.approve(match, comment);
    const ok = p.getByRole('button', { name: 'Got it' });
    if (await ok.isVisible().catch(() => false)) await S.moveTo(ok);
  };

  // ── Names and demo records used ──────────────────────────────────────────────────────────────────────────────────
  const parties = (await S.waitCut(() => records('GCADMIN', 157, { limit: 5000 }))).map((r) => `${r.data?.first_name} ${r.data?.last_name}`);
  const [FIRST, LAST] = INTRODUCERS.find(([f, l]) => !parties.includes(`${f} ${l}`));
  const NAME = `${FIRST} ${LAST}`;
  const refs = await all(refObj);
  const [PF, PL] = PROSPECTS.find(([f, l]) => !refs.some((r) => r.data?.prospect_name === `${f} ${l}`));
  const PROSPECT = `${PF} ${PL}`;
  const hemraj = (await all(introObj)).find((r) => r.data?.name === PORTAL_INTRODUCER);
  // The clawback example: Hemraj's paid commission on a personal loan the client has since repaid early.
  const comms = await all(comObj);
  const claw = comms.find((r) => r.data?.introducer === hemraj.id && r.data?.ext_ref === 'COM-8');
  if (claw && claw.data?.status !== 'paid') await api('GCADMIN', 'PUT', `/runtime/records/${claw.id}`, { data: { status: 'paid' } }); // reset after an earlier take
  S.log('introducer', NAME, 'prospect', PROSPECT, 'clawback', claw?.id);

  await S.waitCut(() => S.go('/login'));
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 15',
    title: 'Introducers & Partners',
    text: 'Brokers, agents and professionals who refer clients for a commission — from onboarding to the commission they earn.',
    bullets: [
      'Onboard an introducer with the wizard',
      'Gates: signed agreement, then approved KYC',
      'An introducer refers a client in the portal',
      'The referral creates and routes an enquiry',
      'Funded business accrues the commission',
      'Clawback and the Marketing dashboard',
    ],
    foot: 'Personas: Shalini Ramtohul (Head of BD & Partnerships) · Fatima Hossenbux (Compliance) · Hemraj Ah-Kye (introducer, portal)',
  }, 7000);

  // ── 1. The introducer's party ────────────────────────────────────────────────────────────────────────────────────
  await S.step(1, 'The introducer as a party', `${NAME}, a notary in Port Louis, wants to refer clients to Genesis`, 'Every introducer is first a party — the same record KYC is run on', 2500);
  await signIn('GCBDH', 'Head of BD — onboards and manages introducers');
  await S.waitCut(() => S.newRecord('party'));
  await S.say('Clients ▸ Parties ▸ New: identity and contact details');
  await S.fill('party', {
    salutation: 'Mr', first_name: FIRST, last_name: LAST,
    occupation: 'Notary', email: `${ascii(FIRST)}.${ascii(LAST)}@example.com`, mobile: '+230 5762 1840',
  }, { delay: 10 });
  await submit();
  const party = await S.waitCut(() => poll(async () => (await records('GCBDH', 157, { limit: 5000 })).find((r) => r.data?.last_name === LAST && r.data?.first_name === FIRST), { what: 'party' }));

  // ── 2. Onboarding wizard ─────────────────────────────────────────────────────────────────────────────────────────
  await S.step(2, 'Onboarding wizard', 'Growth ▸ Introducers ▸ Introducer onboarding', 'A two-step wizard: who the introducer is, then the agreement and commission plan');
  await S.waitCut(() => S.openObject('introducer'));
  await S.moveTo(p.getByRole('button', { name: 'Introducer onboarding' }).first());
  await S.settle(900);
  await S.fill('introducer', { party: LAST, introducer_type: 'professional', portal_email: `${ascii(FIRST)}.${ascii(LAST)}@example.com` }, { delay: 18 });
  await S.say('The portal email is how the introducer will sign in to the introducer portal');
  await p.waitForTimeout(1500);
  await S.moveTo(p.getByRole('button', { name: /Continue/ }).first());
  await p.waitForTimeout(1200);
  await S.say('Agreement & commission: the agreement is not signed yet', 'Choose the products the introducer may refer; clawback and protection window keep their defaults');
  await S.fill('introducer', { allowed_products: ['LND-RE', 'LND-PL'] });
  await p.waitForTimeout(1200);
  const created = p.waitForResponse((r) => r.url().includes('/runtime/') && ['POST'].includes(r.request().method()), { timeout: 240000 });
  await S.moveTo(p.getByRole('button', { name: /Create introducer/ }).first());
  await S.waitCut(() => created);
  await S.settle(1500);
  const intro = await S.waitCut(() => poll(async () => (await all(introObj, 'GCBDH')).find((r) => r.data?.party === party.id), { what: 'introducer' }));
  S.log('introducer id', intro.id);
  await S.say('Introducer created at Applied — complete KYC to activate', 'An introducer number is given automatically', 3000);

  // ── 3. KYC and the agreement gate ────────────────────────────────────────────────────────────────────────────────
  await S.step(3, 'Agreement gate', 'Onboarding pipeline: Applied ▸ KYC ▸ Agreement ▸ Active', 'Move the new introducer to KYC while the documents are collected');
  await board('introducer');
  await drag(NAME, 'Applied', 'KYC');
  await S.say('Now try Agreement…', 'The agreement stage needs the signature date and the commission rate');
  await drag(NAME, 'KYC', 'Agreement', { expectFail: true, after: 600 });
  await showRefusal(/Agreement signed|Commission %/);
  await S.say('The agreement is signed: record the date, expiry and commission rate', '0.4% of the funded or disbursed volume');
  await editRec('introducer', intro.id);
  await S.fill('introducer', { agreement_signed_on: mu(), agreement_expires_on: mu(730), commission_pct: '0.4' });
  await submit();
  await board('introducer');
  await S.say('Move to Agreement again — this time it goes through');
  await drag(NAME, 'KYC', 'Agreement');

  // ── 4. The KYC gate on Active ────────────────────────────────────────────────────────────────────────────────────
  await S.step(4, 'KYC gate', 'Activate the introducer…', 'The CRM checks the introducer’s own KYC first');
  await drag(NAME, 'Agreement', 'Active', { expectFail: true, after: 600 });
  await showRefusal(/only after KYC approval/);
  await S.say('Blocked: KYC is not approved yet', 'The legitimate way: a KYC case on the introducer, signed off by Compliance');
  await p.waitForTimeout(1500);

  // ── 5. KYC case ──────────────────────────────────────────────────────────────────────────────────────────────────
  await S.step(5, 'Introducer KYC', 'KYC & Compliance ▸ KYC Cases ▸ New', 'Group-level KYC on the introducer — the same process as for a client (Tutorial 18)');
  await S.waitCut(() => S.newRecord('kyc_case'));
  await S.fill('kyc_case', { party: LAST, business_unit: 'LND' }, { delay: 18 });
  await S.fill('kyc_case', { product_risk: 'low', occupation_risk: 'low', transaction_profile: 'low' });
  await S.say('ID, proof of address and source of funds are on file', 'Tick the checks and the FATCA status');
  await S.fill('kyc_case', { documents_complete: true, source_of_funds_verified: true, fatca_status: 'non_us' });
  await submit();
  const kc = await S.waitCut(() => poll(() => newest(kycObj, (r) => r.data?.party === party.id), { what: 'KYC case' }));
  await board('kyc_case');
  await S.say('Move it to Screening: sanctions and PEP lists are checked automatically');
  await drag(NAME, 'Initiated', 'Under verification', { after: 700 });
  await drag(NAME, 'Under verification', 'Screening', { after: 700 });
  await S.waitCut(() => poll(async () => (await data(kycObj, kc.id)).screening_result, { what: 'screening result' }));
  await S.say('Screening is clear — Pending approval sends the case to Compliance');
  await drag(NAME, 'Screening', 'Pending approval');

  // ── 6. Compliance signs off ──────────────────────────────────────────────────────────────────────────────────────
  await S.step(6, 'Compliance sign-off', 'Compliance approves the introducer’s KYC', 'Four eyes: the Head of BD cannot approve her own introducer');
  await signIn('GCCOMP1', 'Compliance officer — signs off KYC');
  await approve(`KYC approval: KYC · ${NAME}`, 'Notary in practice, clear screening, low risk. Approved.');
  await S.waitCut(() => poll(async () => (await data(introObj, intro.id, 'GCCOMP1')).kyc_status === 'approved', { what: 'introducer KYC approved' }));

  // ── 7. Active ────────────────────────────────────────────────────────────────────────────────────────────────────
  await S.step(7, 'Activate', 'Back to the Head of BD: activate the introducer', 'KYC approved and agreement signed — the gate lets it through');
  await signIn('GCBDH', 'Head of BD');
  await board('introducer');
  await drag(NAME, 'Agreement', 'Active');
  await openPanel('introducer', intro.id, 'Commission % of funded / disbursed volume');
  await S.say(`${NAME} is active: KYC approved, agreement and commission on file`, 'Only an active introducer can sign in to the introducer portal');
  await showField('KYC', 3500);

  // ── 8. The introducer portal ─────────────────────────────────────────────────────────────────────────────────────
  await S.step(8, 'Introducer portal', `Meanwhile, ${PORTAL_INTRODUCER} — an active broker — has a client to refer`, 'He uses the introducer portal: /portal/genesis-capital', 3000);
  await S.waitCut(() => S.go('/portal/genesis-capital'));
  await S.say('Choose Introducer and enter the portal email Genesis holds', 'No password: a one-time code is sent by email');
  await S.moveTo(p.getByRole('button', { name: 'Introducer', exact: true }));
  await S.moveTo(p.locator('input').first()); await S.type(PORTAL_EMAIL, 25);
  await S.moveTo(p.getByRole('button', { name: /sign-in code/ }));
  const codeText = p.getByText(/your code is \d{6}/);
  await S.waitCut(() => codeText.waitFor({ timeout: 60000 }));
  const code = (await codeText.textContent()).match(/(\d{6})/)[1];
  await S.say('Outside production the code is shown on screen', 'In production it arrives by email and expires after 10 minutes');
  await S.highlight(codeText, 2500);
  await S.moveTo(p.locator('input').first()); await S.type(code, 60);
  await S.moveTo(p.getByRole('button', { name: 'Sign in', exact: true }));
  await S.waitCut(() => p.getByText('My referrals').first().waitFor({ timeout: 60000 }));
  await p.waitForTimeout(1200);
  await S.say('His referrals and commissions — only his own', 'A referral’s status is shown only where the prospect agreed to share it');
  await p.waitForTimeout(3000);
  await S.say(`Refer a client: ${PROSPECT} needs a personal loan`);
  await S.moveTo(p.getByRole('button', { name: /Refer a client/ }));
  await p.waitForTimeout(800);
  const dlg = p.getByRole('dialog').last();
  const field = (label) => dlg.locator('label').filter({ hasText: new RegExp(`^${label}`, 'i') }).first().locator('xpath=..').locator('input, select').first();
  for (const [label, value] of [['Prospect first name', PF], ['Prospect last name', PL], ['Prospect email', `${ascii(PF)}.${ascii(PL)}@example.com`], ['Prospect mobile', '+230 5948 2716']]) {
    await S.moveTo(field(label)); await S.type(value, 30);
  }
  await S.moveTo(field('Product'), { click: false });
  await field('Product').selectOption({ label: 'Personal Loan' });
  await S.moveTo(field('Estimated amount')); await S.type('1500000', 50);
  await S.moveTo(dlg.getByText(/Prospect consented/));
  await S.say('She agreed that Hemraj may follow her application', 'So the portal will show him its status');
  await p.waitForTimeout(1500);
  const sent = p.waitForResponse((r) => r.url().includes('/portal/records/introducer_referral') && r.request().method() === 'POST', { timeout: 240000 });
  await S.moveTo(dlg.getByRole('button', { name: 'Submit' }));
  const sr = await S.waitCut(() => sent);
  if (sr.status() >= 300) throw new Error(`portal referral ${sr.status()} ${(await sr.text()).slice(0, 300)}`);
  await p.waitForTimeout(1500);
  await S.say('The referral is in — Submitted', 'It lands in the CRM at once');
  await S.highlight(p.locator('tr').filter({ hasText: PROSPECT }).first(), 3000);
  await S.moveTo(p.getByRole('button', { name: /Sign out/ }).first());
  await p.waitForTimeout(800);

  // ── 9. In the CRM: referral and enquiry ──────────────────────────────────────────────────────────────────────────
  await S.step(9, 'Referral → enquiry', 'Back in the CRM, the Head of BD sees the referral', 'Growth ▸ Introducers ▸ Introducer Referrals');
  const ref = await S.waitCut(() => poll(async () => (await all(refObj, 'GCBDH')).find((r) => r.data?.prospect_name === PROSPECT && r.data?.enquiry), { what: 'referral with its enquiry' }));
  S.log('referral', ref.id, 'enquiry', ref.data.enquiry);
  await openPanel('introducer_referral', ref.id, 'Enquiry created');
  await S.say('The CRM created an enquiry for the prospect, credited to the introducer', 'Attribution is protected for 90 days from submission');
  await showField('Enquiry created', 3000);
  await showField('Attribution protected until', 2500);
  const enq = await S.waitCut(() => poll(async () => { const d = await data(enqObj, ref.data.enquiry); return d.enquiry_no ? d : null; }, { what: 'enquiry' }));
  const enqRec = await S.waitCut(() => poll(async () => { const r = (await api('GCADMIN', 'GET', `/runtime/records/${ref.data.enquiry}`)).data; return r?.assigned_to ? r : null; }, { what: 'enquiry owner' }));
  const [owner, ownerRole] = PEOPLE[enqRec.assigned_to] || [enqRec.assigned_to, ''];
  S.log('enquiry owner', enqRec?.assigned_to, enq.business_unit);
  if (enqRec.assigned_to === 'GCBDH') S.issue('referral enquiry was not routed (assigned to the referral owner)');
  await openPanel('enquiry', ref.data.enquiry, 'Channel');
  await S.say('The enquiry: channel Introducer, linked to Hemraj', 'Credited to him for the attribution window');
  await showField('Channel', 2000);
  await showField('Introducer', 2500);
  await S.say(`Routed by product like any other enquiry: Retail Loans, to ${owner}`, `${ownerRole} — the speed-to-lead clock starts now`);
  await showField('Queue', 3500);

  // ── 10. Working the referral to funded ───────────────────────────────────────────────────────────────────────────
  await S.step(10, 'Referral to funded', 'As the desk works the enquiry, BD moves the referral along', 'Submitted ▸ Accepted ▸ In progress ▸ Funded / disbursed');
  await board('introducer_referral');
  await drag(PROSPECT, 'Submitted', 'Accepted', { after: 800 });
  await drag(PROSPECT, 'Accepted', 'In progress', { after: 800 });
  await S.say('The loan is disbursed — try Funded / disbursed…', 'The CRM needs the funded amount to work out the commission');
  await drag(PROSPECT, 'In progress', 'Funded / disbursed', { expectFail: true, after: 600 });
  await showRefusal(/Funded \/ disbursed \(MUR\)/);
  await editRec('introducer_referral', ref.id);
  await S.say('Record the amount actually disbursed: MUR 1,400,000');
  await S.fill('introducer_referral', { funded_amount: '1400000' });
  await submit();
  await board('introducer_referral');
  await drag(PROSPECT, 'In progress', 'Funded / disbursed');

  // ── 11. Commission accrued ───────────────────────────────────────────────────────────────────────────────────────
  await S.step(11, 'Commission accrued', 'Funded: the commission is accrued automatically', `${PORTAL_INTRODUCER}’s rate 0.5% × MUR 1,400,000 = MUR 7,000`);
  const com = await S.waitCut(() => poll(async () => (await all(comObj, 'GCBDH')).find((r) => r.data?.introducer_referral === ref.id), { what: 'commission' }));
  S.log('commission', com.id, JSON.stringify(com.data));
  await S.waitCut(() => S.openObject('commission_entry'));
  await S.highlight(p.locator('tr').filter({ hasText: '7,000' }).first(), 3500);
  await S.say('Status Accrued — Finance approves and pays it, then marks it Paid', 'The introducer sees it under Commissions in the portal');
  await p.waitForTimeout(3000);

  // ── 12. Clawback ─────────────────────────────────────────────────────────────────────────────────────────────────
  if (claw) {
    await S.step(12, 'Clawback', 'A client repaid a referred personal loan early, within the 12-month clawback period', `The commission paid to ${PORTAL_INTRODUCER} in June is clawed back`);
    await editRec('commission_entry', claw.id);
    await S.fill('commission_entry', { status: 'clawed_back' });
    await submit();
    await openPanel('introducer', hemraj.id, 'Commission earned (MUR)');
    await S.say('Clawed-back commission no longer counts as earned', 'Commission earned on the introducer is recalculated');
    await showField('Commission earned (MUR)', 3500);
  }

  // ── 13. Marketing dashboard ──────────────────────────────────────────────────────────────────────────────────────
  await S.step(13, 'Marketing dashboard', 'Dashboard ▸ Marketing: the introducer channel at a glance', 'Referrals by stage and commission by status');
  await S.waitCut(() => S.go('/'));
  const pick = p.locator('select').filter({ has: p.locator('option', { hasText: 'Marketing' }) }).first();
  await S.moveTo(pick, { click: false });
  await pick.selectOption({ label: 'Marketing' });
  await S.settle(1500);
  const w = p.getByText('Introducer referrals by stage', { exact: true }).first();
  await S.waitCut(() => w.waitFor({ timeout: 60000 }));
  await w.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await p.waitForTimeout(1500);
  await S.say('Referrals by stage — from submitted to funded', 'Commission by status: accrued, approved, paid and clawed back');
  await p.waitForTimeout(4000);
  await S.clear();
  await p.waitForTimeout(3500);

  await S.logout();
  await S.card({
    eyebrow: 'Summary',
    title: 'Introducers & Partners',
    text: 'Partners are onboarded with the same rigour as clients, and every referral is traceable to the commission it earns.',
    bullets: [
      'Wizard creates the introducer at Applied',
      'Agreement needs the signed date and commission %',
      'Active only once the introducer’s KYC is approved',
      'Portal referral → enquiry routed and credited',
      'Funded needs the amount; commission accrues itself',
      'Clawback and the Marketing dashboard',
    ],
  }, 7000);
}
