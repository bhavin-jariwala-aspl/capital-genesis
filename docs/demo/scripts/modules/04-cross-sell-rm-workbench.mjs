// Cross-sell & RM Workbench: the RM's home page, next-best actions (Accept opens an opportunity, Dismiss asks for a
// reason), a discovery meeting note, the opportunity through the pipeline to Won (and another to Lost, with the gate),
// RM targets, then the manager's RM League Table (user guide §9 Cross-sell & RM Workbench).
import { records, poll, api, API, dashboardId } from '../lib/studio.mjs';

export const title = 'Cross-sell & RM Workbench';

const OPP = 166, NBA = 167;
const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + 4 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const PRODUCT = { 'LND-IBL': 'Investment-Backed Loan' };

// The view toggle only appears once the pipeline metadata has loaded; wait for it before switching.
async function board(S) {
  await S.openObject('fs_opportunity');
  await S.p.locator('button[title="Pipeline"]').first().waitFor({ timeout: 30000 });
  await S.view('Pipeline');
  await S.column('Identified').waitFor({ timeout: 30000 });
  await S.waitCut(() => S.p.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 120000, polling: 300 }).catch(() => {}));
  await S.p.waitForTimeout(800);
}

// Like S.submit, with a longer wait. On this shared dev machine the backend restarts whenever someone saves a backend
// file; a save caught by a restart comes back as a bare 500 (the dev proxy) — wait for the server and press Save again.
async function save(S) {
  const { p } = S;
  const btn = p.locator('form button[type=submit]').last();
  for (let attempt = 1; ; attempt += 1) {
    const resp = p.waitForResponse((r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 240000 });
    if (attempt === 1) await S.moveTo(btn); else await btn.click();
    const r = await S.waitCut(() => resp);
    const body = await r.json().catch(() => null);
    S.log('save', r.status());
    if (r.status() >= 500 && !body?.error && attempt < 3) {
      await S.waitCut(async () => { for (;;) { try { const h = await fetch(`${API}/health`); if (h.status < 500) return; } catch { /* down */ } await new Promise((res) => setTimeout(res, 2000)); } });
      await p.waitForTimeout(1500);
      continue;
    }
    if (r.status() >= 300) throw new Error(`save ${r.status()} ${JSON.stringify(body).slice(0, 400)}`);
    await S.settle(900);
    return body?.data ?? body;
  }
}

const healthy = (S) => S.waitCut(async () => { for (;;) { try { const h = await fetch(`${API}/health`); if (h.status < 500) return; } catch { /* down */ } await new Promise((res) => setTimeout(res, 2000)); } });

// S.drag, retried when the move is caught by a backend restart (a bare 500 from the dev proxy).
async function move(S, card, from, to, opts = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await S.drag(card, from, to, opts); } catch (e) {
      if (attempt >= 3 || !/ 500 \s*$/.test(e.message)) throw e;
      S.log('move hit a backend restart — retrying');
      await healthy(S);
      await board(S);
      if (await S.column(to).getByText(card).count()) return null; // the move went through before the restart
    }
  }
}

// Run a record action (a button on the record panel) and wait for the server's answer.
async function action(S, label, { reason } = {}) {
  const { p } = S;
  const resp = p.waitForResponse((r) => /\/runtime\/records\/\d+\/actions\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 240000 });
  await S.moveTo(p.getByRole('button', { name: label, exact: true }).first());
  if (reason !== undefined) {
    const box = p.locator('textarea[id="action-dismiss_reason"]');
    await box.waitFor({ timeout: 15000 });
    await S.say('Dismiss asks why', 'The reason is kept on the suggestion');
    await S.moveTo(box); await S.type(reason, 24);
    await p.waitForTimeout(800);
    await S.moveTo(p.locator('[role=dialog]').last().getByRole('button', { name: label, exact: true }));
  }
  const r = await S.waitCut(() => resp);
  const body = await r.json().catch(() => ({}));
  S.log(label, r.status(), JSON.stringify(body).slice(0, 300));
  if (r.status() >= 300 || body?.data?.error) throw new Error(`${label} failed ${r.status()} ${JSON.stringify(body).slice(0, 300)}`);
  await p.waitForTimeout(1500);
}

async function gotIt(S, ms = 3500) {
  const btn = S.p.getByRole('button', { name: 'Got it' });
  if (await btn.first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) {
    await S.p.waitForTimeout(ms);
    await S.moveTo(btn.first());
  }
}

/** A field value on the record panel (Details card), by its label. */
function detail(S, label) {
  return S.p.locator('dl dt').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\%]/g, '\\$&')}$`) }).first().locator('xpath=..');
}

// Undo earlier takes of this video (only what they created or changed since the first take on 16 Oct 2026):
// opportunities opened by Accept go to the Trash, and the suggestions they accepted or dismissed reopen.
const FIRST_TAKE = '2026-10-16';
async function resetTakes() {
  const opps = (await records('GCADMIN', OPP, { limit: 500 }))
    .filter((r) => r.created_by === 'GCRM1' && r.created_at >= FIRST_TAKE && r.data?.product_code === 'LND-IBL');
  for (const o of opps) await api('GCADMIN', 'DELETE', `/runtime/records/${o.id}`, {});
  const nbas = (await records('GCADMIN', NBA, { limit: 500 }))
    .filter((r) => r.assigned_to === 'GCRM1' && ['accepted', 'dismissed'].includes(r.data?.status)
      && ['ibl_for_fund_holder', 'wealth_for_borrower'].includes(r.data?.rule) && (r.updated_at ?? '') >= FIRST_TAKE);
  for (const n of nbas) await api('GCADMIN', 'PUT', `/runtime/records/${n.id}`, { data: { status: 'open' } });
}

export default async function run(S) {
  const { p } = S;
  await S.waitCut(() => resetTakes());

  // ── Data for this take (lookups only) ──
  const nbas = (await records('GCRM1', NBA, { limit: 500 })).filter((r) => r.assigned_to === 'GCRM1' && r.data?.status === 'open');
  const opps = await records('GCRM1', OPP, { limit: 500 });
  const hasOpp = (party, product) => opps.some((o) => o.labels?.party === party && o.data?.product_code === product);
  const acc = nbas.find((r) => r.data.rule === 'ibl_for_fund_holder' && !hasOpp(r.labels?.party, 'LND-IBL'));
  const dis = nbas.find((r) => r.data.rule === 'wealth_for_borrower' && r.labels?.party !== acc?.labels?.party);
  if (!acc || !dis) throw new Error('no open next-best actions left for GCRM1');
  const client = acc.labels.party, oppName = `${client} · ${PRODUCT['LND-IBL']}`;
  const names = opps.map((o) => o.data?.name);
  const lose = opps.find((o) => ['proposal', 'negotiation'].includes(o.pipeline_stage?.name) && o.assigned_to === 'GCRM1'
    && names.filter((n) => n === o.data?.name).length === 1 && o.labels?.party !== client)
    ?? opps.find((o) => ['proposal', 'negotiation'].includes(o.pipeline_stage?.name) && names.filter((n) => n === o.data?.name).length === 1 && o.labels?.party !== client);
  if (!lose) throw new Error('no opportunity in Proposal / Negotiation to lose');
  const loseStage = lose.pipeline_stage.label ?? (lose.pipeline_stage.name === 'proposal' ? 'Proposal' : 'Negotiation');
  S.log('accept', acc.id, client, '· dismiss', dis.id, dis.labels?.party, '· lose', lose.id, lose.data?.name, loseStage);

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 4',
    title: 'Cross-sell & RM Workbench',
    text: 'Turn what the group knows about a client into the next sale — and see how each RM is doing.',
    bullets: ['My Workbench: the RM\'s home page', 'Next-best actions: Accept or Dismiss', 'A structured discovery meeting note',
      'The opportunity from Identified to Won', 'Lost needs a loss reason', 'Targets, attainment and the RM League Table'],
    foot: 'Personas: Priya Ramdin (Relationship Manager) · Shalini Ramtohul (Head of BD)',
  }, 8000);

  // ── 1. Home ──
  await S.step(1, 'My Workbench', 'The RM\'s day starts on My Workbench', 'Her home page: enquiries, next-best actions, reviews, KYC, pipeline and meetings', 3000);
  await S.login('GCRM1', 'Relationship manager — works her own book of clients');
  await S.waitCut(() => p.getByText('Next-best actions', { exact: true }).first().waitFor({ timeout: 60000 }));
  await S.waitCut(() => p.waitForFunction(() => !document.querySelector('main .animate-spin'), null, { timeout: 60000, polling: 300 }).catch(() => {}));
  await S.scroll(380, 1200);
  await S.say('Next-best actions waiting for her, and her pipeline by stage', 'Each viewer sees only their own book');
  const tile = p.getByText('Next-best actions', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
  await S.highlight(tile, 3000);
  await S.scroll(320, 1000);
  await S.say('The rules run every night across all clients', 'Fund holder without a loan → Investment-Backed Loan · borrower → Wealth · corporate → FX hedging · HNW → wealth discovery · FMB 2029 → reinvestment');
  await p.waitForTimeout(6000);

  // ── 2. Next-best actions ──
  await S.step(2, 'Next-best actions', 'Open the list of next-best actions', 'Cross-sell & RM Workbench ▸ Next-Best Actions', 2500);
  await S.openObject('nba_suggestion');
  await p.waitForTimeout(1200);
  await S.say('Each suggestion: the client, the rule that raised it, the entity and the product', 'Status Open until the RM decides');
  await p.waitForTimeout(3500);
  const row = p.locator('main table tbody tr').filter({ hasText: client }).filter({ hasText: 'Investment-Backed' }).first();
  if (await row.count()) { await S.moveTo(row); await S.settle(1000); } else await S.openRecord('nba_suggestion', acc.id);
  await S.say(`${client} holds funds above MUR 1 million and has no loan`, 'Suggestion: an Investment-Backed Loan — liquidity without selling her funds');
  await p.waitForTimeout(4000);
  await S.say('Accept or Dismiss — buttons on the suggestion', 'She knows the client is planning a purchase: Accept');
  await p.waitForTimeout(2500);
  await action(S, 'Accept');
  await S.say('Accepted: the CRM opens an opportunity for the client', 'At Identified, owned by Priya');
  await gotIt(S, 3000);
  await S.say('Status: Accepted — opportunity opened', 'The Accept and Dismiss buttons are gone: the decision is made');
  await S.highlight(detail(S, 'Status'), 3000);
  await S.tab('Related');
  const link = p.locator('main').getByText(oppName, { exact: true }).first();
  await S.waitCut(() => link.waitFor({ timeout: 60000 }));
  await S.say('The new opportunity is linked to the suggestion', 'Stage Identified · probability 25% · MUR 1,000,000 placeholder value · owner Priya');
  await p.waitForTimeout(4500);
  // The related list sits under the caption: clear it while pointing at the row.
  await S.clear();
  await S.highlight(link.locator('xpath=ancestor::*[self::a or self::button][1]'), 3000);

  // Dismiss another suggestion.
  await S.say(`Now a suggestion that does not fit: ${dis.labels?.party}`, 'Real-estate borrower → Wealth / Money Market');
  await S.openRecord('nba_suggestion', dis.id);
  await p.waitForTimeout(2500);
  await action(S, 'Dismiss', { reason: 'Client keeps his surplus with his bank for now — revisit at the next annual review.' });
  await S.say('Dismissed — the rule will not raise it again for this client');
  await gotIt(S, 3000);
  await S.say('Dismissed, with the reason on record', 'Managers see why suggestions were turned down');
  await S.highlight(detail(S, 'Dismiss reason'), 3500);

  // ── 3. Meeting note ──
  await S.step(3, 'Discovery meeting', `Priya meets ${client} to discuss the loan`, 'Cross-sell & RM Workbench ▸ Meeting Notes ▸ New', 3000);
  await S.newRecord('meeting_note');
  await S.say('A structured note: pick the template — Discovery meeting', 'Templates: discovery, review, credit visit, call, event follow-up');
  await S.fill('meeting_note', { party: client, template: 'discovery', business_unit: 'LND' });
  await S.fill('meeting_note', { meeting_date: today(), meeting_time: '10:30', location: 'office' });
  await S.fill('meeting_note', { attendees: `${client}; Priya Ramdin`, rm: 'GCRM1' }, { delay: 20 });
  await S.say('Objectives, outcomes and next steps', 'The note appears in Priya\'s calendar feed, with the follow-up date');
  await S.fill('meeting_note', { objectives: 'Liquidity for a property deposit without selling the fund holdings.' }, { delay: 10 });
  await S.fill('meeting_note', { outcomes: 'Client wants MUR 6 million against her fund units, drawn within three months.' }, { delay: 10 });
  await S.fill('meeting_note', { next_steps: 'Send the indicative terms and the pledge documents list.', follow_up_date: inDays(7) }, { delay: 10 });
  await p.waitForTimeout(1000);
  await save(S);
  await S.say('Saved — the meeting counts on her workbench and on the RM League Table', 'Meetings by RM');
  await p.waitForTimeout(3000);

  // ── 4. Pipeline ──
  const oppRec = await S.waitCut(() => poll(async () => (await records('GCRM1', OPP, { limit: 500 })).find((o) => o.data?.nba_suggestion === acc.id || String(o.data?.nba_suggestion) === String(acc.id)), { what: 'opportunity' }));
  await S.step(4, 'Work the opportunity', 'Put a real value on the opportunity', 'MUR 6 million, closing in about two months', 3000);
  await S.editRecord('fs_opportunity', oppRec.id);
  await S.fill('fs_opportunity', { amount: '6000000', expected_close: inDays(60) });
  await S.say('Value MUR 6,000,000 · probability 25% at Identified', 'Weighted value = value × probability');
  await p.waitForTimeout(2000);
  await save(S);
  await board(S);
  await S.say('The opportunity board: Identified → Qualified → Proposal → Negotiation → Won / Lost', 'Drag the card as the deal moves on');
  await p.waitForTimeout(3000);
  await move(S, oppName, 'Identified', 'Qualified');
  await S.waitCut(() => poll(async () => Number((await api('GCRM1', 'GET', `/runtime/records/${oppRec.id}`)).data?.data?.probability) === 40, { what: 'probability 40' }));
  await S.openRecord('fs_opportunity', oppRec.id);
  await S.say('Qualified: the stage sets the probability to 40%', 'Weighted value MUR 2,400,000 — the RM can still adjust the probability');
  await S.highlight(detail(S, 'Probability %'), 2500);
  await S.highlight(detail(S, 'Weighted (MUR)'), 3000);

  await board(S);
  await S.say('Terms sent — Proposal (60%, Best case)', 'Then Negotiation (80%, Commit)');
  await move(S, oppName, 'Qualified', 'Proposal');
  await move(S, oppName, 'Proposal', 'Negotiation');
  await S.say('The client signs — Won', '100% · forecast Closed');
  await move(S, oppName, 'Negotiation', 'Won');
  await S.waitCut(() => poll(async () => Number((await api('GCRM1', 'GET', `/runtime/records/${oppRec.id}`)).data?.data?.probability) === 100, { what: 'probability 100' }));
  await S.openRecord('fs_opportunity', oppRec.id);
  await S.say('Won: probability 100%, forecast Closed', 'Won business is what her quarterly target measures');
  await S.highlight(detail(S, 'Forecast'), 2500);
  await S.highlight(detail(S, 'Weighted (MUR)'), 2500);

  // ── 5. Lost needs a reason ──
  await S.step(5, 'Lost needs a reason', `${lose.data?.name}: the client went elsewhere`, 'Move it to Lost', 3000);
  await board(S);
  await move(S, lose.data.name, loseStage, 'Lost', { expectFail: true });
  await S.say('Blocked: a lost opportunity needs a loss reason', 'Price, competitor, timing, no need, not eligible — so the losses can be analysed');
  await p.waitForTimeout(4000);
  await S.clickText('Open record to complete');
  await S.settle(1000);
  await S.fill('fs_opportunity', { loss_reason: 'competitor' });
  await S.say('Loss reason: Competitor', 'Save, then back to the board');
  await p.waitForTimeout(1500);
  await save(S);
  await board(S);
  await move(S, lose.data.name, loseStage, 'Lost');
  await S.say('Lost — with its reason, probability 0%', 'It leaves the open pipeline and the weighted forecast');
  await p.waitForTimeout(3000);

  // ── 6. Targets ──
  await S.clear();
  await S.openObject('rm_target', { view: 'Table' });
  await S.waitCut(() => p.locator('main table tbody tr').first().waitFor({ timeout: 90000 }).catch(() => {}));
  await S.step(6, 'Targets', 'Each RM has quarterly targets', 'Cross-sell & RM Workbench ▸ RM Targets & Quotas — set by the managers', 3500);
  await S.say('New business and revenue targets per quarter, and what was achieved', 'Attainment % = achieved new business ÷ target');
  const tbl = p.locator('main table').first();
  if (await tbl.count()) await S.highlight(tbl, 4000); else await p.waitForTimeout(4000);
  await S.say('Priya sees her own targets; managers see the whole team', 'Attainment is recalculated whenever the achieved figures change');
  await p.waitForTimeout(3500);

  // ── 7. Manager view ──
  await S.step(7, 'Manager view', 'The Head of BD follows the whole team', 'Dashboard ▸ RM League Table', 3000);
  await S.login('GCBDH', 'Head of BD — sets targets, follows the league table');
  const league = await S.waitCut(() => dashboardId('genesis_rm_league'));
  await S.go(`/?dashboard=${league}`, 1500);
  await S.waitCut(() => p.waitForFunction(() => !document.querySelector('main .animate-spin'), null, { timeout: 90000, polling: 300 }).catch(() => {}));
  await S.scroll(250, 800);
  await S.say('Meetings and revenue credited, by RM', 'Activity and results side by side');
  await p.waitForTimeout(4500);
  await S.scroll(330, 800);
  await S.say('Open weighted pipeline and won opportunities, by RM', 'Today\'s win already counts for Priya');
  await p.waitForTimeout(4500);
  await S.scroll(400, 800);
  await S.say('Target attainment by RM', 'Who is ahead of plan and who needs help');
  await p.waitForTimeout(4500);

  await S.say('The forecast: every open opportunity with its forecast category and weighted value', 'Cross-sell & RM Workbench ▸ Opportunities');
  await S.openObject('fs_opportunity', { view: 'Table' });
  await p.waitForTimeout(1500);
  const otbl = p.locator('main table').first();
  if (await otbl.count()) await S.highlight(otbl, 4500); else await p.waitForTimeout(4500);

  await S.card({
    eyebrow: 'Summary',
    title: 'Cross-sell & RM Workbench',
    text: 'The CRM suggests the next sale; the RM decides and works it; managers see the results.',
    bullets: ['My Workbench is the RM\'s home page', 'Accept opens an opportunity; Dismiss needs a reason', 'Structured meeting notes, in the calendar feed',
      'Stage sets probability and forecast', 'Lost needs a loss reason', 'Targets, attainment and the RM League Table'],
    foot: 'Next: Retail Lending',
  }, 7000);
}
