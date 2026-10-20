// KYC & Compliance: onboard a PEP client through the risk-based KYC case (screening, risk score, EDD gate, MLRO
// sign-off), then the compliance registers: a gift above the threshold, the restricted list, a data subject request
// and the MLRO-only STR register.
import fs from 'node:fs';
import path from 'node:path';
import { API, api, poll as poll0, records } from '../lib/studio.mjs';

// A lookup that fails while the backend restarts (other changes reload it) is retried rather than failing the take.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 240000, ...o });

export const title = 'KYC & Compliance';

const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10); // Mauritius date

// Small specimen PDFs for the Docs tab (written next to the raw recording).
function specimen(dir, name, lines) {
  const content = `BT /F1 14 Tf 60 780 Td 18 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  const f = path.join(dir, name); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, out);
  return f;
}

// A client name not used yet, so the video can be re-recorded.
const CANDIDATES = [['Rohan', 'Seebaluck'], ['Vikram', 'Dookhony'], ['Sanjeev', 'Ramphul'], ['Arvind', 'Bissessur'], ['Kishan', 'Mohabeer'], ['Nitin', 'Lallbeeharry'], ['Ashwin', 'Gungadin'], ['Deven', 'Sookun'],
  ['Rakesh', 'Beeharry'], ['Anand', 'Jhugroo'], ['Sunil', 'Ramdhony'], ['Yogesh', 'Bhoyroo'], ['Pravesh', 'Mungroo'], ['Manish', 'Goburdhun'],
  ['Kailash', 'Ramessur'], ['Hemraj', 'Seechurn'], ['Dinesh', 'Hurry'], ['Vinod', 'Aubeeluck'], ['Satish', 'Bundhoo'], ['Girish', 'Ramkalawon']];
async function freshName() {
  for (const [first, last] of CANDIDATES) {
    const r = await poll(() => api('GCRM1', 'GET', `/runtime/lookup/party?q=${encodeURIComponent(last)}`), { what: 'name check' });
    const hits = Array.isArray(r.data) ? r.data : (r.data?.records ?? []);
    if (!hits.length) return [first, last];
  }
  throw new Error('no fresh client name left');
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

// Open a record panel and make sure it rendered (a busy server sometimes answers the first load empty).
async function openPanel(S, object, id, label) {
  for (let i = 0; i < 3; i++) {
    await S.openRecord(object, id);
    const ok = await S.p.getByText(new RegExp(`^${label.replace(/[/]/g, '\\/')}$`, 'i')).locator('visible=true').first().waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    if (ok) return;
    S.log('panel not rendered, reloading');
  }
  throw new Error(`record panel ${object} #${id} did not render`);
}

export default async function run(S) {
  const { p } = S;
  S.submit = () => submit(S);
  const rawDir = path.resolve('.raw', S.slug);
  const docs = [
    ['KYC — identity', specimen(rawDir, 'National ID card.pdf', ['Republic of Mauritius - National Identity Card', 'Specimen for demonstration'])],
    ['Proof of address', specimen(rawDir, 'Utility bill - September 2026.pdf', ['Utility bill - September 2026', '12 Royal Road, Quatre Bornes', 'Specimen for demonstration'])],
    ['Source of funds / wealth', specimen(rawDir, 'Source of funds - employer letter.pdf', ['Employer letter - salary and bonus history', 'Specimen for demonstration'])],
  ];
  const [first, last] = await freshName();
  const full = `${first} ${last}`;
  const caseTitle = `KYC · ${full}`;
  S.log('client', full);

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 18',
    title: 'KYC & Compliance',
    text: 'Risk-based client due diligence and the compliance registers — from a new client to an approved KYC.',
    bullets: [
      'Open a KYC case and answer the risk questions',
      'Collect documents against the checklist',
      'Automatic sanctions / PEP screening and risk score',
      'The approval gate, EDD and MLRO sign-off',
      'Gifts, restricted list and data subject requests',
      'The STR register — visible to the MLRO only',
    ],
    foot: 'Personas: Priya Ramdin (Relationship Manager) · Fatima Hossenbux (Compliance Officer) · Olivier Maurel (MLRO)',
  }, 8000);

  // ── 1. New client ────────────────────────────────────────────────────────────────────────────────────────────
  await S.step(1, 'New client', 'A new client wants to open a relationship with Genesis', `${full} — a senior official, so a politically exposed person (PEP)`);
  await S.login('GCRM1', 'The relationship manager onboards the client');
  await S.newRecord('party');
  await S.say('Clients ▸ Parties ▸ New: the client\'s identity and contact details', 'Tick PEP when the client holds a prominent public function');
  await S.fill('party', {
    salutation: 'Mr', first_name: first, last_name: last, date_of_birth: '1971-03-14', nationality: 'MU',
    occupation: 'Deputy Director, public utility', email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`, mobile: '+230 5791 2468',
  }, { delay: 14 });
  await S.fill('party', { pep: true });
  await p.waitForTimeout(800);
  await S.submit();
  const party = await poll(async () => (await records('GCRM1', 157)).find((r) => r.data?.last_name === last), { what: 'party' });

  // ── 2. KYC case & risk questions ────────────────────────────────────────────────────────────────────────────
  await S.step(2, 'Open the KYC case', 'KYC & Compliance ▸ KYC Cases ▸ New', 'A case from a converted enquiry is opened for you automatically — here we open one by hand');
  await S.newRecord('kyc_case');
  await S.fill('kyc_case', { party: last, business_unit: 'LND' });
  await S.say('Answer the risk questions', 'Product, onboarding channel, occupation, ownership structure and expected activity');
  await S.fill('kyc_case', { product_risk: 'medium', occupation_risk: 'medium', transaction_profile: 'medium' });
  await S.say('Add the tax status for FATCA and CRS reporting', 'Group-level scope: one approved KYC can be relied on by every Genesis entity');
  await S.fill('kyc_case', { fatca_status: 'non_us', crs_tax_residencies: 'Mauritius', tin: 'MU-71031455' }, { delay: 14 });
  await S.submit();
  const kyc = await poll(async () => (await records('GCRM1', 228)).find((r) => r.data?.party === party.id || r.data?.party_name === full), { what: 'kyc case' });
  S.log('kyc case', kyc.id);

  await openPanel(S, 'kyc_case', kyc.id, 'Risk score');
  await S.say('The risk score is calculated for you', 'Country + PEP + product + channel + occupation + ownership + activity — weights from the risk-factor master');
  const riskLabel = p.getByText('Risk score', { exact: true }).first();
  await riskLabel.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(600);
  await S.highlight(riskLabel.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3500);
  await S.say('A PEP is always high risk: enhanced due diligence is now required', 'High-risk cases are approved by the MLRO and reviewed every year');
  await p.waitForTimeout(3500);

  // ── 3. Documents ────────────────────────────────────────────────────────────────────────────────────────────
  await S.step(3, 'Collect documents', 'Docs tab: the Individual KYC pack lists what is still missing', 'Upload what the client gave you — or email the client a secure upload link');
  await S.tab('Docs');
  await p.waitForTimeout(2500);
  for (const [cat, file] of docs) {
    const up = p.getByRole('button', { name: 'Upload', exact: true }).last();
    await S.moveTo(up);
    const sel = p.locator('select.form-input.text-xs').last();
    await S.moveTo(sel, { click: false });
    const val = await sel.locator('option').evaluateAll((os, l) => os.find((o) => o.textContent.trim() === l)?.value, cat);
    await sel.selectOption(val);
    await p.waitForTimeout(400);
    await S.moveTo(p.getByText('Choose file', { exact: true }).last(), { click: false });
    const resp = p.waitForResponse((r) => r.url().includes('/documents') && r.request().method() === 'POST');
    await p.locator('input[type=file]').last().setInputFiles(file);
    await S.waitCut(() => resp);
    await S.settle(1200);
  }
  await S.say('All three items are in — the checklist shows nothing outstanding', 'Identity and address documents are reviewed and kept seven years (AML)');
  await S.highlight(p.getByText('Checklist', { exact: true }).first().locator('xpath=..').locator('xpath=..'), 3000);

  await S.say('Edit the case and tick “Document checklist complete”', 'Under verification will not accept the case without it');
  await S.editRecord('kyc_case', kyc.id);
  await S.fill('kyc_case', { documents_complete: true });
  await S.submit();

  // ── 4. Through screening ────────────────────────────────────────────────────────────────────────────────────
  await S.step(4, 'Verification & screening', 'Move the case along the KYC pipeline', 'Initiated ▸ Documents pending ▸ Under verification ▸ Screening');
  await S.openObject('kyc_case', { view: 'Pipeline' });
  await S.drag(full, 'Initiated', 'Documents pending');
  await S.drag(full, 'Documents pending', 'Under verification');
  await S.say('Entering Screening checks the client against sanctions, PEP and adverse-media lists', 'The provider answers in seconds and the result is written on the case');
  await S.drag(full, 'Under verification', 'Screening', { after: 1000 });
  const screened = await S.waitCut(() => poll(async () => {
    const r = await api('GCRM1', 'GET', `/runtime/records/${kyc.id}`);
    const d = r.data?.data ?? {};
    // The result is written first, then the hit is logged: wait for both.
    return d.screening_result && Number(d.screening_hits_open) > 0 ? d : null;
  }, { what: 'screening result' }));
  S.log('screening', screened.screening_result, screened.screening_reference);
  await openPanel(S, 'kyc_case', kyc.id, 'Sanctions / PEP screening');
  const scr = p.getByText('Sanctions / PEP screening', { exact: true }).first();
  await scr.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await S.say('Screening result: potential match — with the provider reference and date', 'The PEP hit is logged for Compliance to triage and Compliance is alerted');
  await S.highlight(scr.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3500);
  const openHits = p.getByText(/^Open screening hits$/i).locator('visible=true').first();
  await openHits.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await p.waitForTimeout(600);
  await S.say('The hit itself sits behind the compliance barrier', 'The RM only sees that one is open — Compliance triages it');
  await S.highlight(openHits.locator('xpath=..'), 3500);

  // ── 5. Gate & EDD ───────────────────────────────────────────────────────────────────────────────────────────
  await S.step(5, 'Risk assessment & approval gate', 'Screening done: move the case to Risk assessed', 'This stage needs a screening result and date — the automation already filled them');
  await S.openObject('kyc_case', { view: 'Pipeline' });
  await S.drag(full, 'Screening', 'Risk assessed');
  await S.say('Now try Pending approval…', 'For a high-risk client the CRM checks the enhanced due diligence first');
  await S.drag(full, 'Risk assessed', 'Pending approval', { expectFail: true, after: 600 });
  await S.say('Blocked: high risk needs verified source of wealth and EDD notes', 'The message tells the RM exactly what is missing');
  await p.waitForTimeout(3500);

  await S.say('Record the enhanced due diligence on the case', 'Source of funds verified + EDD notes (source of wealth, senior management approval)');
  await S.editRecord('kyc_case', kyc.id);
  await S.fill('kyc_case', {
    source_of_funds_verified: true,
    edd_notes: 'Salary confirmed by employer letter; savings over 25 years. Domestic PEP, no adverse media. Head of Lending supports.',
  }, { delay: 8 });
  await S.submit();
  await S.openObject('kyc_case', { view: 'Pipeline' });
  await S.say('Move to Pending approval again', 'This time the gate lets it through');
  await S.drag(full, 'Risk assessed', 'Pending approval');
  await S.say('An approval request is raised automatically', 'Standard or medium risk → Compliance Officer · High risk or PEP → MLRO');
  await p.waitForTimeout(3000);

  // ── 6. Gift declaration (RM) ────────────────────────────────────────────────────────────────────────────────
  await S.step(6, 'Declare a gift', 'Staff declare gifts and hospitality in the Gifts & Hospitality Register', 'Anything above MUR 5,000 needs a compliance decision');
  await S.newRecord('gift_register');
  await S.fill('gift_register', {
    employee_id: 'GCRM1', direction: 'received', counterparty: 'Client — Le Morne property developer',
    description: 'Dinner for two at a hotel restaurant', estimated_value: '8500', event_date: today(),
  }, { delay: 12 });
  await S.submit();
  await S.say('8,500 is above the threshold, so the declaration goes to Compliance for approval');
  await p.waitForTimeout(2800);

  // ── 7. Compliance officer ───────────────────────────────────────────────────────────────────────────────────
  await S.step(7, 'Triage the screening hit', 'Compliance reviews the screening hit', 'True match · False positive · Escalated to MLRO — with a rationale');
  await S.login('GCCOMP1', 'Compliance officer: screening triage, registers, approvals');
  const hit = await poll(async () => (await records('GCCOMP1', 229)).find((r) => String(r.data?.kyc_case) === String(kyc.id)), { what: 'screening hit' });
  await S.editRecord('screening_hit', hit.id);
  await S.say('Set the disposition and record why', 'A domestic PEP is not a sanctions match — escalate it to the MLRO for sign-off');
  await S.fill('screening_hit', { disposition: 'escalated', reviewer: 'GCCOMP1', rationale: 'Domestic PEP by function. Not a sanctions match. Escalated for MLRO sign-off.' }, { delay: 8 });
  await S.submit();
  await S.say('An escalation alerts the MLRO', 'A true match would also stop the case reaching approval');
  await p.waitForTimeout(2500);

  await S.step(8, 'Approve the gift', 'Tools ▸ Approvals: the gift declaration is waiting for Compliance', 'Standard-risk KYC sign-offs arrive here too');
  await S.approve(`GCRM1 · Received · Dinner for two`, 'Within policy — client relationship, no pending decision.');
  await S.say('Approved — the decision is written back to the register', 'Gifts & Hospitality Register ▸ Compliance decision: Approved');

  await S.step(9, 'Restricted list', 'Add an issuer to the restricted list', 'For example while Genesis advises on a deal and holds inside information');
  await S.newRecord('restricted_list_entry');
  await S.fill('restricted_list_entry', {
    issuer: 'Ile Verte Hotels Ltd', isin: 'MU0999X00017', list_type: 'restricted', added_on: today(),
    reason: 'Advisory mandate — inside information.',
  }, { delay: 10 });
  await S.submit();
  await S.say('Traders and portfolio managers are alerted at once', 'Personal-dealing requests in this issuer are refused automatically · watch-list entries stay with Compliance');
  await p.waitForTimeout(3500);

  await S.step(10, 'Data subject request', 'A client asks for a copy of their personal data (DPA 2017)', 'Data Subject Requests: Received ▸ Verifying identity ▸ In progress ▸ Completed — 30 days to respond');
  await S.newRecord('data_subject_request');
  await S.fill('data_subject_request', { party: 'Seegoolam', request_type: 'access', received_on: today(), details: 'Copy of all personal data held.' }, { delay: 10 });
  await S.submit();
  const dsr = await poll(async () => (await records('GCCOMP1', 236)).sort((a, b) => b.id - a.id)[0], { what: 'dsr' });
  const dsrCard = dsr.data?.dsr_no || 'DSR';
  await S.openObject('data_subject_request', { view: 'Pipeline' });
  await S.say('Acknowledged and assigned to Compliance; respond-by date = received + 30 days', 'First step: verify the requester\'s identity');
  await S.drag(dsrCard, 'Received', 'Verifying identity');
  await S.say('Verify identity, prepare the response, record the completion date', 'In progress needs identity verified · Completed needs the response and date');
  await S.editRecord('data_subject_request', dsr.id);
  await S.fill('data_subject_request', { identity_verified: true, response: 'Data copy sent by secure email.', completed_on: today() }, { delay: 10 });
  await S.submit();
  await S.openObject('data_subject_request', { view: 'Pipeline' });
  await S.drag(dsrCard, 'Verifying identity', 'In progress');
  await S.drag(dsrCard, 'In progress', 'Completed');

  await S.step(11, 'STR register', 'Suspicious transaction reports sit behind the MLRO barrier', 'Anyone may raise one — only the MLRO sees them (no tipping-off)');
  await S.openObject('str_report');
  await p.getByText(/No STR register yet|0 records/).first().waitFor({ timeout: 60000 }).catch(() => {});
  await S.say('Even the compliance officer sees no reports here', 'The records are concealed: not listed, not searchable, not counted');
  await p.waitForTimeout(4000);

  // ── MLRO ────────────────────────────────────────────────────────────────────────────────────────────────────
  await S.step(12, 'MLRO sign-off', 'High-risk and PEP cases are signed off by the MLRO', 'Tools ▸ Approvals');
  await S.login('GCMLRO', 'Money Laundering Reporting Officer');
  await S.say('The request shows the risk score and the EDD notes', 'Open the case from the link if more detail is needed — then approve or reject');
  await S.approve(`KYC approval (high risk): ${caseTitle}`, 'EDD satisfactory. Approve — domestic PEP, annual review.');
  await S.say('The case moves to Approved by itself', 'Outcome, decision date and next review (1 year for high risk) are recorded');
  await openPanel(S, 'kyc_case', kyc.id, 'Decision');
  await p.waitForTimeout(1000);
  const dec = p.getByText('Decision', { exact: true }).locator('visible=true').first();
  await dec.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
  await p.waitForTimeout(700);
  await S.highlight(dec.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3000);
  await p.waitForTimeout(3500);
  await S.say('On the client record, KYC status is now approved', 'Loans can be disbursed, accounts funded and relationships activated');
  await openPanel(S, 'party', party.id, 'KYC status');
  const ks = p.locator('dt').filter({ hasText: /^KYC status$/i }).locator('visible=true').first();
  await ks.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await S.highlight(ks.locator('xpath=..'), 3500);

  await S.step(13, 'STR register (MLRO)', 'The MLRO sees the STR register', 'Raised ▸ MLRO review ▸ Filed with FIU (needs the FIU reference and date) / Closed — no filing');
  await S.openObject('str_report', { view: 'Table' });
  await p.waitForTimeout(4500);
  await S.say('Who may see which zone is managed in Tools ▸ Access & Barriers', 'Covered in its own tutorial');
  await p.waitForTimeout(3000);

  await S.logout();
  await S.card({
    eyebrow: 'Summary',
    title: 'KYC & Compliance',
    text: 'The CRM screens, scores and routes — staff answer the questions and make the decisions.',
    bullets: [
      'Risk score and rating calculated from the master weights',
      'Screening on entering Screening, hits logged for triage',
      'Gate: checklist, screening and EDD before approval',
      'Compliance or MLRO approves — client KYC status follows',
      'Gifts above MUR 5,000 approved by Compliance',
      'STR register concealed from everyone but the MLRO',
    ],
  }, 7000);
}
