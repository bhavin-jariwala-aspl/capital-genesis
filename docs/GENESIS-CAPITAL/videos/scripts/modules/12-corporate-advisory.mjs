// Corporate Advisory: a fund-raising mandate behind the advisory information barrier — code name, conflict check
// cleared by Compliance, engagement letter, deal team (→ insider list), investor bookbuilding with the NDA gate and a
// secure IM share link, a deliverable whose delivery raises the milestone fee invoice, time logging, the barrier seen
// from the trading desk, and the Corporate Advisory dashboard.
import fs from 'node:fs';
import path from 'node:path';
import { API, api, poll as poll0, records } from '../lib/studio.mjs';

// A lookup that fails while the backend restarts (other changes reload it) is retried rather than failing the take.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 240000, ...o });

export const title = 'Corporate Advisory';

const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10); // Mauritius date

const OBJ = { mandate: 204, check: 205, team: 206, insider: 207, investor: 208, deliverable: 209, time: 210, invoice: 211 };
const CLIENT = 'Port Louis Logistics Ltd';
const TARGET = 'Doorga Trading Ltd';
const INVESTOR = 'Sunrise Pension Fund';

// Mauritian code names — the first one not used yet, so the video can be re-recorded.
const CODES = ['Flamboyant', 'Ravenala', 'Trochetia', 'Chamarel', 'Bois Cheri', 'Cardinal', 'Benitier', 'Ile aux Cerfs', 'Coin de Mire', 'Tamarind Falls', 'Rochester', 'Pieter Both'];
async function freshCode() {
  const used = new Set((await poll(() => records('GCADV1', OBJ.mandate), { what: 'mandates' })).map((r) => r.data?.code_name));
  const c = CODES.map((x) => `Project ${x}`).find((x) => !used.has(x));
  if (!c) throw new Error('no fresh code name left');
  return c;
}

// Small specimen PDF for the Docs tab.
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

// S.submit with a longer server wait and a retry while the backend restarts (another agent's change reloads it).
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
    const ok = await S.p.getByText(label, { exact: true }).locator('visible=true').first().waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    if (ok) return;
    S.log('panel not rendered, reloading');
  }
  throw new Error(`record panel ${object} #${id} did not render`);
}

// Highlight the box around a visible field label on the record panel.
async function showField(S, label, ms = 3000) {
  const el = S.p.getByText(label, { exact: true }).locator('visible=true').first();
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
  await S.p.waitForTimeout(500);
  await S.highlight(el.locator('xpath=..'), ms);
}

// The trader's wall-crossing from an earlier take: reject anything pending and take him off the advisory wall,
// so the barrier step shows an empty list again (admin, through the access API).
async function resetCrossing() {
  const zones = (await api('GCADMIN', 'GET', '/access/barrier-zones')).data ?? [];
  const adv = zones.find((z) => z.code === 'ADV_PRIVATE');
  if (!adv) return;
  const list = (await api('GCADMIN', 'GET', '/access/wall-crossings')).data ?? [];
  for (const c of list.filter((x) => x.employee_id === 'GCTRD1' && x.status === 'pending')) {
    await api('GCADMIN', 'POST', `/access/wall-crossings/${c.id}/decide`, { approve: false });
  }
  await api('GCADMIN', 'DELETE', `/access/barrier-zones/${adv.id}/members/GCTRD1`, {});
}

export default async function run(S) {
  const { p } = S;
  S.submit = () => submit(S);
  // A sign-in that lands while the backend restarts answers 500: wait for it and sign in again, as a user would.
  const login0 = S.login;
  S.login = async (id, why) => {
    for (let i = 0; ; i++) {
      try { return await login0(id, why); } catch (e) {
        if (i >= 2 || !p.url().includes('/login')) throw e;
        S.log('sign-in failed, retrying:', e.message.split('\n')[0]);
        await S.waitCut(() => poll(async () => (await fetch(`${API}/auth/me`)).status < 500, { what: 'backend' }));
        await p.goto(`${p.url().split('/login')[0]}/login`);
      }
    }
  };
  // A stage move that lands while the backend restarts answers 5xx with no message: wait, reload the board, move again.
  const drag0 = S.drag;
  S.drag = async (card, from, to, o = {}) => {
    for (let i = 0; ; i++) {
      try { return await drag0(card, from, to, o); } catch (e) {
        if (i >= 2 || !/ 5\d\d \s*$/.test(e.message.split('\n')[0] + ' ')) throw e;
        S.log('move failed on a restart, retrying');
        await S.waitCut(() => poll(async () => (await fetch(`${API}/auth/me`)).status < 500, { what: 'backend' }));
        await S.waitCut(async () => { await p.reload(); await S.settle(800); await S.view('Pipeline'); });
      }
    }
  };
  const rawDir = path.resolve('.raw', S.slug);
  const CODE = await freshCode();
  const short = CODE.replace('Project ', '');
  const im = specimen(rawDir, `Information memorandum - ${CODE}.pdf`, [`${CODE} - Information memorandum`, 'Strictly private and confidential', 'Specimen for demonstration']);
  S.log('code name', CODE);
  await S.waitCut(() => resetCrossing());

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 12',
    title: 'Corporate Advisory',
    text: 'Run a corporate finance mandate behind the advisory information barrier — from pitch to investor commitments.',
    bullets: [
      'A mandate under a project code name',
      'Conflict check cleared by Compliance',
      'Engagement letter and the stage gates',
      'Deal team — added to the insider list',
      'Investor bookbuilding: NDA, IM, commitments',
      'Deliverables, time, fees — and the barrier',
    ],
    foot: 'Personas: Camille Rivalland (Corporate Advisor) · Fatima Hossenbux (Compliance Officer) · Arvind Ramsurrun (Trader)',
  }, 8000);

  // ── 1. New mandate ──────────────────────────────────────────────────────────────────────────────────────────
  await S.step(1, 'New mandate', `${CLIENT} wants to raise MUR 600 million to buy ${TARGET}`, 'The advisor opens the mandate under a code name — the deal is never named in the CRM');
  await S.login('GCADV1', 'Corporate advisor — Genesis Corporate Advisors');
  await S.openObject('advisory_mandate');
  await S.say('Corporate Advisory ▸ Advisory Mandates: every deal is known by its code name', 'Only the advisory team and Compliance can open this module\'s records');
  await p.waitForTimeout(3000);
  await S.newRecord('advisory_mandate');
  await S.say('Code name, client, target and service line', 'Fees: a retainer plus a success fee on the amount raised');
  await S.fill('advisory_mandate', { code_name: CODE, client: 'Port Louis Logistics', counterparty: 'Doorga Trading' }, { delay: 20 });
  await S.fill('advisory_mandate', { service_line: 'fund_raising', service: 'capital_raising' });
  await S.fill('advisory_mandate', { deal_value: '600000000', retainer_fee: '1500000', success_fee_pct: '2', stage_probability: 'high', mandate_date: today(), expected_close: '2027-03-31' }, { delay: 10 });
  await S.submit();
  const mandate = await poll(async () => (await records('GCADV1', OBJ.mandate)).find((r) => r.data?.code_name === CODE), { what: 'mandate' });
  S.log('mandate', mandate.id);

  // ── 2. Pitch → Conflict check ───────────────────────────────────────────────────────────────────────────────
  await S.step(2, 'Pitch and conflict check', 'Move the mandate along its pipeline', 'Origination ▸ Pitch ▸ Conflict check');
  await S.openObject('advisory_mandate', { view: 'Pipeline' });
  await S.drag(CODE, 'Origination', 'Pitch');
  await S.say('Pitch won — before any engagement, Compliance must check for conflicts', 'Moving to Conflict check opens a conflict check for Compliance automatically');
  await S.drag(CODE, 'Pitch', 'Conflict check', { after: 1000 });
  const check = await S.waitCut(() => poll(async () => (await records('GCADV1', OBJ.check)).find((r) => String(r.data?.advisory_mandate) === String(mandate.id)), { what: 'conflict check' }));
  S.log('conflict check', check.id, check.data?.check_no);
  await S.say('Try to go straight to Engagement letter…', 'The CRM checks the conflict-check result first');
  await S.drag(CODE, 'Conflict check', 'Engagement letter', { expectFail: true, after: 600 });
  await S.say('Blocked: Compliance must clear the conflict check first', 'No engagement letter can be issued on an unchecked deal');
  await p.waitForTimeout(3500);
  await S.openObject('conflict_check', { view: 'Table' });
  await S.say(`The conflict check ${check.data?.check_no || ''} is waiting for Compliance`, 'Compliance is notified and has two business days to decide');
  await S.highlight(p.locator('tr').filter({ hasText: CODE }).first(), 4200);

  // ── 3. Compliance clears it ─────────────────────────────────────────────────────────────────────────────────
  await S.step(3, 'Compliance decision', 'Compliance reviews the conflict check', 'Compliance sits inside the advisory barrier — it sees every deal', 2800);
  await S.login('GCCOMP1', 'Compliance officer — decides conflict checks');
  await openPanel(S, 'conflict_check', check.id, 'Restricted / watch list');
  await S.say('The CRM has already searched the group for conflicts', 'The client\'s and target\'s Genesis relationships, loans outstanding and other advisory mandates');
  await showField(S, 'Counterparty: Genesis relationships', 3500);
  await S.say('…and the restricted and watch lists', 'A match here would need controls — or a decline');
  await showField(S, 'Restricted / watch list', 3000);
  await showField(S, 'Potential conflicts found', 2500);
  await S.say('Take it into review, then record the decision', 'Requested ▸ Compliance review');
  await S.openObject('conflict_check', { view: 'Pipeline' });
  await S.drag(check.data?.check_no || CODE, 'Requested', 'Compliance review');
  await S.say('Record the decision and the rationale', 'Cleared · Cleared with controls · Declined');
  await S.editRecord('conflict_check', check.id);
  await S.fill('conflict_check', {
    decision: 'cleared',
    controls: 'Target banks with Genesis Lending only. No restricted or watch-list match. No staff holdings declared. Cleared.',
  }, { delay: 8 });
  await S.submit();
  await S.waitCut(() => poll(async () => (await api('GCCOMP1', 'GET', `/runtime/records/${mandate.id}`)).data?.data?.conflict_check === 'cleared', { what: 'cleared on mandate' }));
  await S.waitCut(() => poll(async () => (await api('GCCOMP1', 'GET', `/runtime/records/${check.id}`)).data?.pipeline_stage?.name === 'decided', { what: 'check decided', timeout: 60000 }).catch(() => S.issue('conflict check did not move to Decided')));
  await openPanel(S, 'conflict_check', check.id, 'Compliance decision');
  await S.say('Decided: the check moves to Decided with the date', 'The decision is written back to the mandate and kept as the audit record');
  await showField(S, 'Compliance decision', 3500);

  // ── 4. The barrier from the trading desk ────────────────────────────────────────────────────────────────────
  await S.step(4, 'The information barrier', 'What does the trading desk see?', 'Traders are on the public side of the wall', 2800);
  await S.login('GCTRD1', 'Trader — public side of the wall');
  await S.openObject('advisory_mandate');
  await S.say(`No mandates at all — not even that ${CODE} exists`, 'Deal records, documents and alerts stay inside the barrier');
  await p.waitForTimeout(4000);
  await S.go('/access', 1200);
  await S.say('Someone who needs inside information asks for a wall-crossing', 'Tools ▸ Access & Barriers ▸ Wall-crossings', 1500);
  const zone = p.locator('main select').first();
  await S.moveTo(zone, { click: false });
  const zv = await zone.locator('option').evaluateAll((os) => os.find((o) => o.textContent.trim() === 'Advisory — private side')?.value);
  await zone.selectOption(zv);
  await S.moveTo(p.locator('main textarea').first());
  await S.type('Asked by the advisory team to give a view on pricing a bond for a client raise.', 14);
  await S.say('Approval is time-limited and never by the requester', 'Once approved, the person is added to the insider list until the crossing ends');
  await S.moveTo(p.getByRole('button', { name: 'Submit request' }));
  await S.settle(1500);
  await p.waitForTimeout(2000);

  // ── 5. Compliance decides the crossing ──────────────────────────────────────────────────────────────────────
  await S.step(5, 'Wall-crossing approval', 'Compliance decides the request', 'Compliance runs the control room — it approves crossings without seeing behind the wall', 2800);
  await S.login('GCCOMP1', 'Compliance officer — decides wall-crossings');
  await S.go('/access', 1500);
  const crossRow = p.locator('main tr').filter({ hasText: 'Arvind Ramsurrun' }).filter({ has: p.getByRole('button', { name: /Approve/ }) }).first();
  await crossRow.waitFor({ timeout: 30000 });
  await S.highlight(crossRow, 2500);
  await S.say('Approve for 30 days — the trader joins the advisory insider list until then', 'Nobody can approve their own request, or a crossing for themselves');
  const decided = p.waitForResponse((r) => r.url().includes('/wall-crossings/') && r.request().method() === 'POST', { timeout: 240000 });
  await S.moveTo(crossRow.getByRole('button', { name: /Approve/ }));
  const dr = await S.waitCut(() => decided);
  if (dr.status() >= 300) throw new Error(`crossing decision ${dr.status()}`);
  await S.settle(1200);
  await S.highlight(p.locator('main tr').filter({ hasText: 'Arvind Ramsurrun' }).first(), 2500);
  await S.say('The crossing is recorded on the tamper-evident audit trail', 'It ends automatically on its expiry date');
  await p.waitForTimeout(2500);

  // ── 5. Engagement & execution ──────────────────────────────────────────────────────────────────────────────
  await S.step(6, 'Engagement letter', 'Back to the advisor: the conflict check is cleared', 'Conflict check ▸ Engagement letter', 2800);
  await S.login('GCADV1', 'Corporate advisor');
  await S.openObject('advisory_mandate', { view: 'Pipeline' });
  await S.drag(CODE, 'Conflict check', 'Engagement letter', { after: 1000 });
  await S.say('The engagement letter is generated for you — under the code name', 'Mandate ▸ Docs, ready for e-signature');
  await S.waitCut(() => poll(async () => {
    const d = (await api('GCADV1', 'GET', `/documents/record/${mandate.id}`)).data;
    return (Array.isArray(d) ? d : []).some((x) => /ngagement/.test(x.filename || ''));
  }, { what: 'engagement letter', timeout: 90000 }).catch(() => S.log('no engagement letter found by lookup')));
  await openPanel(S, 'advisory_mandate', mandate.id, 'Conflict check');
  await S.tab('Docs');
  await p.waitForTimeout(1200);
  // The Advisory engagement checklist ticks "Signed engagement letter" as soon as the generated letter is filed.
  const letter = p.getByText('Checklist', { exact: true }).first().locator('xpath=../..');
  if (await letter.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) {
    await letter.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await p.waitForTimeout(600);
    await S.highlight(letter, 3500);
  } else { S.issue('Docs checklist not shown on the mandate'); await p.waitForTimeout(2500); }
  await S.say('Execution needs the signed letter', 'Try to move on before it is signed…');
  await S.openObject('advisory_mandate', { view: 'Pipeline' });
  await S.drag(CODE, 'Engagement letter', 'Execution', { expectFail: true, after: 600 });
  await S.say('Blocked: the engagement letter must be signed first');
  await p.waitForTimeout(3000);
  await S.editRecord('advisory_mandate', mandate.id);
  await S.say('The client has signed: tick "Engagement letter signed"');
  await S.fill('advisory_mandate', { engagement_letter_signed: true });
  await S.submit();
  await S.openObject('advisory_mandate', { view: 'Pipeline' });
  await S.drag(CODE, 'Engagement letter', 'Execution');

  // ── 6. Deal team → insider list ───────────────────────────────────────────────────────────────────────────
  await S.step(7, 'Deal team and insider list', 'Add the analyst to the deal team', 'Corporate Advisory ▸ Deal Team Member ▸ New');
  await S.newRecord('deal_team_member');
  await S.fill('deal_team_member', { advisory_mandate: short, employee_id: 'GCADV2', employee_name: 'Ryan Pillay', deal_role: 'analyst', added_on: today() }, { delay: 30 });
  await S.submit();
  await S.waitCut(() => poll(async () => (await records('GCADV1', OBJ.insider)).find((r) => String(r.data?.advisory_mandate) === String(mandate.id)), { what: 'insider entry' }));
  await S.openObject('insider_list_entry');
  await S.say('Ryan Pillay is on the insider list automatically', 'With the date and the reason — the list the regulator asks for');
  await S.highlight(p.locator('tr').filter({ hasText: CODE }).first(), 4000);

  // ── 7. Investor bookbuilding ──────────────────────────────────────────────────────────────────────────────
  await S.step(8, 'Investor bookbuilding', `Approach an investor: ${INVESTOR}`, 'Targeted ▸ NDA ▸ IM shared ▸ Indication ▸ Committed ▸ Allocated');
  await S.newRecord('investor_target');
  await S.fill('investor_target', { advisory_mandate: short, investor: 'Sunrise Pension', investor_type: 'pension_fund', nda_status: 'sent' }, { delay: 30 });
  await S.submit();
  const target = await poll(async () => (await records('GCADV1', OBJ.investor)).find((r) => String(r.data?.advisory_mandate) === String(mandate.id)), { what: 'investor target' });
  await S.openObject('investor_target', { view: 'Pipeline' });
  await S.say('The NDA has been sent to the investor', 'Targeted ▸ NDA');
  await S.drag(CODE, 'Targeted', 'NDA');
  await S.say('Share the information memorandum already?', 'The CRM checks the NDA first');
  await S.drag(CODE, 'NDA', 'IM shared', { expectFail: true, after: 600 });
  await S.say('Blocked: the IM can only be shared once the NDA is signed', 'Inside information never leaves without a signed NDA');
  await p.waitForTimeout(4500);

  await S.say('The investor signs the NDA: record it with the date the IM is shared');
  await S.editRecord('investor_target', target.id);
  await S.fill('investor_target', { nda_status: 'signed', im_shared_on: today() });
  await S.submit();

  await S.say('Share the IM by secure link', 'Investor ▸ Docs: upload the IM, then Share link');
  await openPanel(S, 'investor_target', target.id, 'NDA');
  await S.tab('Docs');
  await p.waitForTimeout(1500);
  await S.moveTo(p.getByRole('button', { name: 'Upload', exact: true }).last());
  const sel = p.locator('select.form-input.text-xs').last();
  await S.moveTo(sel, { click: false });
  const cat = await sel.locator('option').evaluateAll((os) => (os.find((o) => /Deal documents/.test(o.textContent)) ?? os[0])?.value);
  await sel.selectOption(cat);
  await p.waitForTimeout(400);
  await S.moveTo(p.getByText('Choose file', { exact: true }).last(), { click: false });
  const up = p.waitForResponse((r) => r.url().includes('/documents') && r.request().method() === 'POST');
  await p.locator('input[type=file]').last().setInputFiles(im);
  await S.waitCut(() => up);
  await S.settle(1200);
  const row = p.locator('div.group').filter({ hasText: 'Information memorandum' }).first();
  await S.moveTo(row, { click: false });
  await S.moveTo(row.getByRole('button', { name: 'Share link' }));
  const modal = p.getByRole('dialog').filter({ hasText: 'Share & Analytics' }).first();
  await modal.waitFor({ timeout: 30000 });
  await S.say('A link that expires in 14 days, view-only', 'Every view is counted — you see who has opened the IM');
  await S.moveTo(modal.locator('input[type=number]').first());
  await S.type('14', 80);
  await S.moveTo(modal.getByText('Allow download').first());
  const link = p.waitForResponse((r) => /\/documents\/\d+\/share$/.test(r.url()) && r.request().method() === 'POST');
  await S.moveTo(modal.getByRole('button', { name: /Create link/ }));
  await S.waitCut(() => link);
  await p.waitForTimeout(3500);
  await S.moveTo(modal.getByRole('button', { name: 'Close' }).last());
  await p.waitForTimeout(600);

  await S.openObject('investor_target', { view: 'Pipeline' });
  await S.say('NDA signed and IM shared: the move is accepted now');
  await S.drag(CODE, 'NDA', 'IM shared');
  await S.say('The investor indicates MUR 150 million, then commits MUR 120 million', 'Each stage asks for its figure — indication, commitment, allocation');
  await S.editRecord('investor_target', target.id);
  await S.fill('investor_target', { ioi_amount: '150000000', commitment: '120000000' }, { delay: 18 });
  await S.submit();
  await S.openObject('investor_target', { view: 'Pipeline' });
  await S.drag(CODE, 'IM shared', 'Indication');
  await S.drag(CODE, 'Indication', 'Committed');
  await S.say('Commitments roll up to the mandate and the dashboard');
  await p.waitForTimeout(2500);

  // ── 8. Deliverable → fee invoice ──────────────────────────────────────────────────────────────────────────
  await S.step(9, 'Deliverables and fees', 'The information memorandum is a deliverable with a milestone fee', 'Drafting ▸ In review ▸ Approved ▸ Delivered to client', 2800);
  await S.newRecord('advisory_deliverable');
  await S.say('Name the reviewer: approval needs one', 'A second pair of eyes on everything that goes to the client');
  await S.fill('advisory_deliverable', { advisory_mandate: short, title: 'Information memorandum', deliverable_type: 'information_memorandum', due_date: today(), reviewer: 'GCADV1', milestone_fee: '750000' }, { delay: 16 });
  await S.submit();
  await S.openObject('advisory_deliverable', { view: 'Pipeline' });
  await S.say('Drafted, reviewed and approved', 'Drafting ▸ In review ▸ Approved');
  await S.drag(CODE, 'Drafting', 'In review');
  await S.drag(CODE, 'In review', 'Approved');
  await S.say('Delivered to the client — the milestone fee is invoiced automatically');
  await S.drag(CODE, 'Approved', 'Delivered to client', { after: 1000 });
  await S.waitCut(() => poll(async () => (await records('GCADV1', OBJ.invoice)).find((r) => String(r.data?.advisory_mandate) === String(mandate.id)), { what: 'fee invoice' }));
  await S.openObject('fee_invoice');
  await S.say('Fee invoice raised: MUR 750,000 milestone, sent to accounting', 'Retainer and success-fee invoices are kept here too');
  await S.highlight(p.locator('tr').filter({ hasText: CODE }).first(), 4000);

  // ── 9. Time ──────────────────────────────────────────────────────────────────────────────────────────────
  await S.step(10, 'Time & effort', 'Log the hours spent on the mandate', 'For profitability: hours × internal rate = cost');
  await S.newRecord('time_entry');
  await S.fill('time_entry', { advisory_mandate: short, employee_id: 'GCADV1', work_date: today(), hours: '6', activity: 'Investor meetings and IM review' }, { delay: 20 });
  await S.submit();
  await openPanel(S, 'advisory_mandate', mandate.id, 'Hours logged');
  await S.say('The mandate adds it all up', 'Deal team, insiders, investors, commitments, fees invoiced and hours logged');
  await showField(S, 'Commitments (MUR)', 3000);
  await showField(S, 'Hours logged', 2500);

  // ── 10. Dashboard ────────────────────────────────────────────────────────────────────────────────────────
  await S.step(11, 'Corporate Advisory dashboard', 'The Corporate Advisory dashboard', 'Live mandates, weighted fee pipeline, commitments and fees invoiced');
  await S.go('/', 1500);
  const dsel = p.locator('main select').first();
  await dsel.waitFor({ timeout: 60000 });
  await S.moveTo(dsel, { click: false });
  const opts = await dsel.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()]));
  const hit = opts.find(([, l]) => l === 'Corporate Advisory');
  if (hit) { await dsel.selectOption(hit[0]); await S.settle(2500); } else S.issue('Corporate Advisory dashboard not in the dashboard menu for GCADV1');
  await p.waitForTimeout(4000);
  await S.scroll(450, 3000);
  await S.say('Mandates by stage and service line, bookbuilding and hours by mandate', 'Barrier-aware: the public side sees none of it');
  await S.scroll(450, 4000);
  await S.clear();

  await S.logout();
  await S.card({
    eyebrow: 'Summary',
    title: 'Corporate Advisory',
    text: 'Deals stay discreet and controlled — the CRM enforces the wall and the gates.',
    bullets: [
      'Mandates known only by code name',
      'Conflict check opened and decided by Compliance',
      'Engagement letter generated; signed before execution',
      'Deal team joins the insider list automatically',
      'IM shared by secure link only after a signed NDA',
      'Delivered milestones raise the fee invoice',
    ],
  }, 7000);
}
