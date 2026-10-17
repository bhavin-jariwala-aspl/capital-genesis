// Retail Lending: a home loan from the client's enquiry to disbursement (user guide §10 journey A).
import { records, poll, obj, api, PEOPLE } from '../lib/studio.mjs';

export const title = 'Retail Lending — enquiry to disbursed home loan';

// RL_CLIENT="First Last" lets test runs use a fresh client; the published video uses the default.
const [FIRST, LAST] = (process.env.RL_CLIENT || 'Kavita Ramchurn').split(' ');
const CLIENT = `${FIRST} ${LAST}`;
const CARD = `${CLIENT} · Real Estate Loan`;
const EMAIL = `${FIRST}.${LAST}`.toLowerCase().normalize('NFD').replace(/[^a-z.]/g, '') + '@example.com';

export default async function run(S) {
  const { p } = S;
  const [enqObj, la, kyc] = await S.waitCut(() => Promise.all([obj('enquiry'), obj('loan_application'), obj('kyc_case')]));

  // Lookups only (ids to open, automation to wait for) — every change happens in the UI.
  const find = async (o, pred, as = 'GCADMIN') => (await records(as, o.id, { limit: 500 })).filter(pred).sort((a, b) => b.id - a.id)[0];
  const data = async (o, id, as = 'GCADMIN') => (await records(as, o.id, { limit: 500 })).find((r) => r.id === id)?.data ?? {};

  // Scroll the open record to the section holding `text` (a heading or a field label) and frame it.
  const showSection = async (text, ms = 3500) => {
    const h = p.getByText(text, { exact: true }).last();
    await S.waitCut(() => h.waitFor({ timeout: 120000 }));
    await h.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await p.waitForTimeout(900);
    await S.highlight(h.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), ms);
  };
  // Switch the open list to its pipeline board (waits for the toggle — pages load slowly under load).
  const pipeline = async () => {
    await p.locator('button[title="Pipeline"]').first().waitFor({ timeout: 60000 });
    await S.view('Pipeline');
    await p.locator('div.min-w-\\[260px\\]').first().waitFor({ timeout: 60000 });
  };
  // Approve in Tools ▸ Approvals and close the confirmation the page shows afterwards.
  const approve = async (match, comment) => {
    // The request is raised by a workflow just after the stage move — wait until it is in the approver's inbox.
    await S.waitCut(() => poll(async () => {
      const r = await api(S.who, 'GET', '/runtime/workflows/approvals?scope=mine');
      return (Array.isArray(r.data) ? r.data : []).some((x) => String(x.title).includes(match));
    }, { timeout: 400000, what: `approval ${match}` }));
    await S.approve(match, comment);
    const ok = p.getByRole('button', { name: 'Got it' });
    if (await ok.isVisible().catch(() => false)) await S.moveTo(ok);
  };
  // Sign out (the wait for the sign-in page is trimmed), then the visible sign-in as the next persona.
  const signIn = async (id, why) => {
    await S.waitCut(async () => {
      const out = p.locator('button[aria-label="Sign out"]');
      if (await out.count()) {
        await out.first().click();
        await p.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {});
      }
      await p.waitForSelector('input[name=employee_id]', { timeout: 60000 });
    });
    await S.login(id, why);
  };
  const board = (name) => S.waitCut(async () => { await S.openObject(name); await pipeline(); });
  const openRec = (name, id) => S.waitCut(() => S.openRecord(name, id));
  const editRec = (name, id, form) => S.waitCut(() => S.editRecord(name, id, form));

  // Frame the message the board shows when it refuses a move.
  const showRefusal = async (ms = 4500) => {
    const msg = p.getByText(/before moving to|needs perfected security/).first().locator('xpath=ancestor::div[contains(@class,"gap-3")][1]');
    if (await msg.count()) await S.highlight(msg, ms); else { S.issue('no visible message for a refused move'); await p.waitForTimeout(ms); }
  };

  await S.waitCut(() => S.go('/login'));
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 5',
    title: 'Retail Lending',
    text: 'A home loan from the client\'s first call to disbursement — every hand-off, check and approval in one record.',
    bullets: [
      'Convert an enquiry into a loan application',
      'Rate, EMI, LTV and DSR calculated for you',
      'Stage gates, the document checklist and upload link',
      'Credit appraisal and four-eyes credit approval',
      'Offer letter, security and the KYC gate',
      'Disbursement checker, LMS booking and loan account',
    ],
    foot: 'Sophie Lagesse (Loans Executive) · Nadia Peerbux (Credit) · Rajiv Doorgakant (Loans Manager) · Fatima Hossenbux (Compliance) · Ritesh Seewoo (Operations)',
  }, 8000);

  // ── 1. The enquiry ────────────────────────────────────────────────────────
  await S.step(1, 'Enquiry', `${CLIENT} calls about a home loan`, 'The loans executive logs the enquiry while on the phone', 3200);
  await signIn('GCLOAN1', 'Loans executive — takes the client’s call');
  await S.waitCut(() => S.newRecord('enquiry'));
  await S.fill('enquiry', { party_type: 'individual', channel: 'phone', first_name: FIRST, last_name: LAST, email: EMAIL, mobile: '+230 5791 4826' });
  await S.say('What she wants: a real-estate loan of MUR 4.5 million over 20 years');
  await S.fill('enquiry', { preferred_language: 'en', country_of_residence: 'MU', product_code: 'LND-RE', estimated_amount: '4500000', currency_code: 'MUR', requested_tenure_months: '240' });
  await S.submit();
  const enq = await S.waitCut(() => poll(() => find(enqObj, (r) => r.data?.email === EMAIL && r.assigned_to), { timeout: 400000, what: 'routed enquiry' }));
  // Routing picks the owner from the lending pool; the video follows whoever gets it.
  const OWNER = enq.assigned_to;
  const [ownerName] = PEOPLE[OWNER] || [OWNER];
  S.log('owner', OWNER);
  if (OWNER !== 'GCLOAN1') {
    await S.say(`Routing gives the enquiry to the next loans executive in the pool: ${ownerName}`, 'Lending enquiries go round the loans team; the SLA clock starts now');
    await p.waitForTimeout(4500);
    await signIn(OWNER, 'Loans executive — now owns the enquiry and the loan that follows');
  } else {
    await S.say('Routing assigns lending enquiries round the loans team — this one stays with Sophie', 'The first-contact SLA clock starts now');
    await p.waitForTimeout(5500);
  }
  await board('enquiry');
  await S.say('She qualifies on the call — drag the enquiry to Qualified, then Converted', 'Converting creates the client, the KYC case and the loan application');
  await S.drag(CLIENT, 'New', 'Qualified', { after: 900 });
  await S.drag(CLIENT, 'Qualified', 'Converted');
  const app = await S.waitCut(() => poll(() => find(la, (r) => r.data?.enquiry === enq.id || r.data?.enquiry?.id === enq.id), { timeout: 400000, what: 'loan application' }));
  const appId = app.id;
  S.log('application', appId, 'party', app.data?.party);

  // ── 2. Capture the application (and the first gate) ───────────────────────
  await S.step(2, 'Application', 'The loan application is waiting in Retail Lending', 'Already at Pre-qualified, with the amount and tenure from the enquiry');
  await board('loan_application');
  await p.waitForTimeout(1200);
  await S.say('Application captured needs the client\'s income and the property value', 'The board refuses the move and says what is missing');
  await S.drag(CLIENT, 'Pre-qualified', 'Application captured', { expectFail: true, after: 500 });
  await showRefusal(4500);

  await S.say('Open the record from the message and complete it', 'Purpose, income, existing repayments and property value');
  await S.moveTo(p.getByRole('button', { name: 'Open record to complete' }));
  await S.settle(900);
  await S.fill('loan_application', { purpose: 'purchase_residential', repayment_type: 'amortising', employment_type: 'salaried' });
  await S.fill('loan_application', { monthly_income: '145000', existing_obligations: '8500', property_value: '6000000' });
  await S.say('Tick the client\'s consent to the MCIB credit bureau check', 'No consent, no credit report');
  await S.fill('loan_application', { mcib_consent: true });
  await S.submit();

  await openRec('loan_application', appId);
  await S.say('The CRM prices the loan and checks eligibility by itself', 'Genesis PLR + product margin = interest rate · monthly instalment · total interest');
  await showSection('Pricing & eligibility (calculated)', 4200);
  await S.say('Loan-to-value, debt-service ratio and eligibility', 'And the approval authority — up to MUR 5 million, the Loans Manager');
  await p.waitForTimeout(3500);

  await board('loan_application');
  await S.say('Now Application captured is accepted', 'The MCIB report is pulled and the client gets a status email');
  await S.drag(CLIENT, 'Pre-qualified', 'Application captured');

  // ── 3. Documents ──────────────────────────────────────────────────────────
  await S.step(3, 'Documents', 'Documents pending: the client is emailed the document checklist');
  await S.drag(CLIENT, 'Application captured', 'Documents pending');
  await openRec('loan_application', appId);
  await S.tab('Docs');
  await S.say('The Docs tab shows the checklist for a real-estate loan', 'What is in and what is still missing');
  await S.highlight(p.getByText('Checklist', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]'), 3500);
  await S.say('Send the client a secure upload link', 'No sign-in — she only sees the documents still needed');
  await S.clickText('Email link to client');
  await p.waitForTimeout(1200);
  await S.moveTo(p.getByRole('button', { name: 'Send link' }));
  await S.settle(1200);
  await S.say('Her uploads land on this application and tick off the checklist');
  await p.waitForTimeout(1500);
  const done = p.getByRole('button', { name: 'Done' });
  if (await done.count()) await S.moveTo(done);

  await board('loan_application');
  await S.say('Documents in: Documents complete, then on to credit', 'Credit appraisal only accepts an eligible application — or one with its policy exceptions recorded');
  await S.drag(CLIENT, 'Documents pending', 'Documents complete', { after: 900 });
  await S.drag(CLIENT, 'Documents complete', 'Credit appraisal');

  // ── 4. Credit appraisal ───────────────────────────────────────────────────
  await S.step(4, 'Credit appraisal', 'The credit analyst picks up the application', 'Same record — another person, another form', 3200);
  await signIn('GCCRED1', 'Credit analyst — appraises the risk and recommends a decision');
  await openRec('loan_application', appId);
  await S.say('The MCIB credit report is already on the application', 'Score, rating and reference came back from the credit bureau');
  await showSection('Income & obligations', 3500);
  await editRec('loan_application', appId);
  await S.say('Switch to the Credit appraisal workbench form', 'Risk grade, recommendation and conditions');
  await S.moveTo(p.getByRole('tab', { name: 'Credit appraisal workbench' }));
  await S.settle(900);
  await S.fill('loan_application', { risk_grade: 'B', analyst_recommendation: 'approve_conditions' });
  await S.fill('loan_application', { conditions: 'First-rank fixed charge on the property. Life and building insurance assigned to Genesis Life before disbursement.' }, { delay: 8 });
  await S.submit();
  await S.say('Credit approval: the request goes to the right authority for the amount');
  await board('loan_application');
  await S.drag(CLIENT, 'Credit appraisal', 'Credit approval');

  // ── 5. Credit approval ────────────────────────────────────────────────────
  await S.step(5, 'Credit approval', 'MUR 4.5 million: the Loans Manager decides', 'Four eyes — whoever sent it can never approve it', 3200);
  await signIn('GCLMGR', 'Manager, Loans & Fixed Income — approves loans up to MUR 5 million');
  await S.say('Tools ▸ Approvals: grade, DSR, LTV and the analyst\'s recommendation on one card');
  await approve(`Credit approval: ${CARD}`, 'Approved on the conditions proposed by credit.');
  await S.waitCut(() => poll(async () => (await data(la, appId, 'GCLMGR')).credit_decision === 'approved', { timeout: 400000, what: 'credit decision' }));
  await openRec('loan_application', appId);
  await S.say('Approved — the application moved itself to Offer issued', 'Decision, date and the PLR the offer is priced on are recorded');
  await p.waitForTimeout(1800);
  await S.tab('Docs');
  await S.say('The offer letter was generated and filed here', 'The client is emailed; an offer not accepted in 30 days lapses');
  const letter = p.getByText(/Offer letter/).first();
  await letter.waitFor({ timeout: 30000 }).catch(() => S.issue('offer letter not on the Docs tab'));
  await letter.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
  await p.waitForTimeout(900);
  await S.highlight(letter.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3500);

  // ── 6. Offer accepted, security & insurance ───────────────────────────────
  await S.step(6, 'Offer & security', 'The client signs the offer — back to the loans executive', 'Record the signature, the security and the amount to disburse', 3200);
  await signIn(OWNER, 'Loans executive');
  await editRec('loan_application', appId, 'Credit appraisal workbench');
  await S.fill('loan_application', { offer_accepted: true });
  await S.say('Valuation, notary, fixed charge, life and building insurance');
  await S.fill('loan_application', { valuation_received: true, notary_appointed: true, charge_registered: true, life_insurance_assigned: true, building_insurance_assigned: true });
  await S.fill('loan_application', { disbursement_amount: '4500000' });
  await S.submit();

  await board('loan_application');
  await S.say('Signed offer: move to Offer accepted, then Security & insurance', 'The client gets a status email at each milestone');
  await S.drag(CLIENT, 'Offer issued', 'Offer accepted', { after: 900 });
  await S.drag(CLIENT, 'Offer accepted', 'Security & insurance', { after: 900 });
  await S.say('Ready for disbursement needs perfected security and an approved KYC', 'Her KYC case is still open — the move is refused');
  await S.drag(CLIENT, 'Security & insurance', 'Ready for disbursement', { expectFail: true, after: 500 });
  await showRefusal(4500);

  // ── 7. KYC ────────────────────────────────────────────────────────────────
  await S.step(7, 'KYC', 'Finish the KYC case that was opened at conversion', 'Clients ▸ KYC & Compliance ▸ KYC Cases');
  const kc = await S.waitCut(() => poll(() => find(kyc, (r) => r.data?.party === app.data?.party || r.data?.party?.id === app.data?.party), { timeout: 400000, what: 'KYC case' }));
  await editRec('kyc_case', kc.id);
  await S.say('ID, proof of address and source of funds are on file', 'Tick the checks and the FATCA status');
  await S.fill('kyc_case', { documents_complete: true, source_of_funds_verified: true, fatca_status: 'non_us' });
  await S.submit();
  await pipeline();
  await S.say('Move it to Screening: sanctions and PEP lists are checked automatically', 'The result and its reference are written on the case');
  await S.drag(CLIENT, 'Initiated', 'Under verification', { after: 700 });
  await S.drag(CLIENT, 'Under verification', 'Screening');
  await S.waitCut(() => poll(async () => (await data(kyc, kc.id)).screening_result, { timeout: 400000, what: 'screening result' }));
  await S.say('Clear — Pending approval sends the case to Compliance', 'High-risk clients go to the MLRO instead');
  await S.drag(CLIENT, 'Screening', 'Pending approval');

  await S.say('Compliance signs off the KYC case', 'Four eyes again: the loans executive cannot approve her own client', 3000);
  await signIn('GCCOMP1', 'Compliance officer — signs off KYC');
  await S.say('Tools ▸ Approvals: the KYC case with its risk score and rating');
  await approve(`KYC approval: KYC · ${CLIENT}`, 'Clear screening, low risk. Approved.');
  await S.waitCut(() => poll(async () => (await data(la, appId, 'GCCOMP1')).kyc_status === 'approved', { timeout: 400000, what: 'KYC approved on the application' }));

  // ── 8. Disbursement ───────────────────────────────────────────────────────
  await S.step(8, 'Disbursement', 'KYC approved — the loans executive tries again', 'Now the gate lets it through', 3200);
  await signIn(OWNER, 'Loans executive');
  await board('loan_application');
  await S.drag(CLIENT, 'Security & insurance', 'Ready for disbursement');
  await S.say('An approval request goes to the operations checker', 'Maker-checker: whoever requests a disbursement cannot approve it');
  await p.waitForTimeout(2500);

  await signIn('GCOPS1', 'Operations checker — the second pair of eyes before money moves');
  await S.say('Tools ▸ Approvals: the disbursement request, with security and KYC status');
  await approve(`Disbursement check: ${CARD}`, 'Security and KYC verified. Disburse.');
  const lms = await S.waitCut(() => poll(async () => (await data(la, appId, 'GCOPS1')).lms_reference, { timeout: 400000, what: 'LMS reference' }));
  S.log('LMS', lms);
  await openRec('loan_application', appId);
  await S.say('The loan is booked in the core loan system', 'The LMS account number is written back on the application');
  await showSection('LMS account number', 4000);

  // ── 9. Disbursed ──────────────────────────────────────────────────────────
  await S.step(9, 'Disbursed', 'The loans executive closes the application as Disbursed', '', 3000);
  await signIn(OWNER, 'Loans executive');
  await board('loan_application');
  await S.drag(CLIENT, 'Ready for disbursement', 'Disbursed');
  await S.waitCut(() => poll(async () => (await data(la, appId, OWNER)).outcome === 'disbursed', { timeout: 400000, what: 'outcome' }));
  await openRec('loan_application', appId);
  await S.tab('Related');
  await S.say('Related: the loan account was opened automatically', 'Loan Servicing now follows instalments, arrears and the balance');
  const acct = p.getByText('via Origination').first().locator('xpath=ancestor::div[1]');
  await acct.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => S.issue('loan account not listed under Related'));
  await p.waitForTimeout(900);
  await S.highlight(acct, 3500);

  await S.card({
    eyebrow: 'Summary',
    title: 'One record, the whole journey',
    text: 'Five people worked the same loan application — no re-keying, every step audited.',
    bullets: [
      'Enquiry converted into client, KYC case and application',
      'Pricing, EMI, LTV, DSR and eligibility calculated',
      'Gates stopped incomplete moves with a clear message',
      'Credit approval routed by amount, four eyes',
      'Offer letter, LMS booking and loan account automatic',
      'Disbursement only with security and approved KYC',
    ],
  }, 6000);
}
