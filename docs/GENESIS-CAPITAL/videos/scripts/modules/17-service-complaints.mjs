// Service & Complaints: the service catalogue, a simple request, a request that needs the BD head's approval, and a
// complaint from intake to the satisfaction survey (user guide §9 Service & Complaints, journey E).
import { records, poll, api, PEOPLE } from '../lib/studio.mjs';

export const title = 'Service Requests & Complaints';

const SR = 227;
const CANDIDATES = ['Corinne Henry', 'Rohan Beeharry', 'Isabelle Koenig', 'Natacha Hardy', 'Stéphanie Montocchio', 'Kushal Ramsamy',
  'Annabelle Ramful', 'Fabienne Pillay', 'Hemraj Ah-Kye', 'Bhavish Dabee', 'Jayesh Coret', 'Anil Sookun', 'Patricia Jhurry', 'Sophie Martin'];

const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);

// The view toggle only appears once the pipeline metadata has loaded; wait for it before switching.
async function board(S) {
  await S.openObject('service_request');
  await S.p.locator('button[title="Pipeline"]').first().waitFor({ timeout: 30000 });
  await S.view('Pipeline');
  await S.column('New').waitFor({ timeout: 30000 });
  // Wait for the cards, not just the empty lanes.
  await S.waitCut(() => S.p.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 120000, polling: 300 }).catch(() => {}));
  await S.p.waitForTimeout(800);
}

// The record panel's tabs sit at the bottom of the page, under the caption: read the caption, then clear it and
// point at the timeline entries.
async function showTimeline(S, text, sub) {
  await S.say(text, sub);
  await S.p.waitForTimeout(3500);
  await S.clear();
  const list = S.p.getByText('Activity Timeline').first().locator('xpath=..');
  await S.highlight(list, 3000);
}

// Open the record's edit form from its panel (in-app navigation, no full page reload).
async function editFromPanel(S) {
  await S.p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await S.moveTo(S.p.getByRole('button', { name: 'Edit', exact: true }).first());
  await S.p.locator('form button[type=submit]').last().waitFor({ timeout: 120000 });
  await S.settle(800);
}

// Like S.submit, with a longer wait: under load a save that runs the record's automations can take over a minute.
async function save(S) {
  const { p } = S;
  const btn = p.locator('form button[type=submit]').last();
  const resp = p.waitForResponse((r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 240000 });
  await S.moveTo(btn);
  const r = await S.waitCut(() => resp);
  const body = await r.json().catch(() => ({}));
  S.log('save', r.status());
  if (r.status() >= 300) throw new Error(`save ${r.status()} ${JSON.stringify(body).slice(0, 400)}`);
  await S.settle(900);
  return body?.data ?? body;
}

// S.drag scrolls the SOURCE column to the left edge, so a move to an earlier column ends near the board's left edge,
// where the drag auto-scrolls and drops the card one lane too far. For backward moves, centre the DESTINATION lane.
async function dragBack(S, cardText, from, to) {
  const { p } = S;
  const src = S.column(from), dst = S.column(to);
  await dst.waitFor({ timeout: 30000 });
  // Centre the destination lane: near the board's edge the drag auto-scrolls and the card lands one lane further.
  await dst.evaluate((col) => { const c = col.parentElement; const a = col.getBoundingClientRect(), b = c.getBoundingClientRect(); c.scrollBy({ left: a.left - (b.left + b.width / 2 - a.width / 2), behavior: 'smooth' }); });
  await p.waitForTimeout(800);
  const card = src.getByText(cardText).first();
  await card.waitFor({ timeout: 30000 });
  const cb = await card.boundingBox(); const db = await dst.boundingBox();
  const sx = cb.x + Math.min(cb.width / 2, 120), sy = cb.y + cb.height / 2;
  await p.mouse.move(sx, sy, { steps: 12 }); await p.waitForTimeout(300);
  const resp = p.waitForResponse((r) => r.url().includes('/stage') && r.request().method() === 'PATCH', { timeout: 120000 });
  await p.mouse.down();
  await p.mouse.move(sx - 20, sy + 6, { steps: 5 });
  await p.mouse.move(db.x + db.width / 2, Math.min(db.y + 120, db.y + db.height - 20), { steps: 28 });
  await p.waitForTimeout(350);
  await p.mouse.up();
  const r = await S.waitCut(() => resp);
  S.log(`move back ${from} -> ${to}:`, r.status());
  if (r.status() >= 300) throw new Error(`move back ${from}->${to} ${r.status()}`);
  await p.waitForTimeout(1800);
}

export default async function run(S) {
  const { p } = S;

  // Pick three clients with no open request, so each card is unique on the board.
  const all = await records('GCADMIN', SR, { limit: 500 });
  const open = all.filter((r) => r.pipeline_stage?.name !== 'closed');
  const mine = (await records('GCRM1', 157, { limit: 500 })).filter((r) => r.assigned_to === 'GCRM1' && r.data?.party_type === 'individual').map((r) => r.data.display_name);
  const pool = [...CANDIDATES, ...mine].filter((n, i, a) => a.indexOf(n) === i);
  // A client with no open request of that type, so the card is unique in its column.
  const used = new Set();
  const pick = (type) => {
    const n = pool.find((c) => !used.has(c) && !open.some((r) => r.labels?.party === c && r.data?.request_type === type));
    if (!n) throw new Error(`no free client for ${type}`);
    used.add(n); return n;
  };
  const [cStmt, cAppr, cComp] = [pick('statement_request'), pick('partial_prepayment'), pick('complaint')];
  S.log('clients', cStmt, cAppr, cComp);
  const find = async (client, type) => poll(async () => (await records('GCADMIN', SR, { limit: 500 }))
    .filter((r) => r.labels?.party === client && r.data?.request_type === type).sort((a, b) => b.id - a.id)[0], { what: `${type} for ${client}` });

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 17',
    title: 'Service Requests & Complaints',
    text: 'Log a client request or complaint, route it to the right team and resolve it within the service level.',
    bullets: ['The service catalogue: SLA and approvals', 'A simple request from New to Closed', 'A request that needs the BD head\'s approval',
      'A complaint: automatic acknowledgement, Compliance', 'Root cause and final response before Resolved', 'SLA Board and the satisfaction survey'],
    foot: 'Personas: Priya Ramdin (RM) · Loans team · Shalini Ramtohul (BD head) · Fatima Hossenbux (Compliance)',
  }, 8000);

  // ── 1. Catalogue ──
  await S.step(1, 'Service catalogue', 'Every request type comes from the service catalogue', 'Masters ▸ Service Request Catalogue', 3000);
  await S.login('GCRM1', 'Relationship manager — logs requests for her clients');
  await S.openObject('service_catalogue', { view: 'Table' });
  await p.waitForTimeout(1500);
  await S.say('Each type has its business unit, a service level in business hours and an approval flag',
    'Statement request: 16 hours, no approval · Partial prepayment: 40 hours, needs approval');
  const tbl = p.locator('main table').first();
  if (await tbl.count()) await S.highlight(tbl, 4500); else await p.waitForTimeout(4500);
  await S.say('Complaints get 120 business hours — 15 working days for a final response', 'Acknowledged within 1 business day, in line with FSC expectations');
  await p.waitForTimeout(3500);

  // ── 2. Simple request ──
  await S.step(2, 'Log a request', `${cStmt} phones to ask for the last six months of statements`, 'Service & Complaints ▸ New', 3000);
  await S.newRecord('service_request');
  await S.fill('service_request', { party: cStmt, business_unit: 'LND', request_type: 'statement_request', priority: 'medium', channel: 'phone' });
  await S.fill('service_request', { description: 'Client asks for the home loan statements for the last six months, sent by email.' }, { delay: 14 });
  await S.say('Pick the client, the business unit and the request type', 'The form only shows complaint fields when the type is Complaint');
  await p.waitForTimeout(1500);
  const r1 = await save(S);
  const id1 = r1?.id ?? (await find(cStmt, 'statement_request')).id;
  await S.say('Saved: the request is numbered, acknowledged and routed automatically', 'The client gets an acknowledgement email; Lending requests go to the Loans team');
  const rec1 = await S.waitCut(() => poll(async () => { const r = (await records('GCADMIN', SR, { limit: 500 })).find((x) => x.id === id1); return r?.pipeline_stage?.name === 'acknowledged' && r; }, { what: 'request acknowledged' }));
  await S.openRecord('service_request', id1);
  await p.waitForTimeout(2500);
  await S.say('Stage Acknowledged · Catalogue SLA 16 business hours · Needs approval: No', `Owner: ${PEOPLE[rec1.assigned_to]?.[0] ?? 'the Loans team'}, Loans team`);
  await S.scroll(350, 3500);
  await S.tab('Activity');
  await showTimeline(S, 'Activity: the acknowledgement email the client received', 'Sent automatically when the request was logged');

  await S.step(3, 'Work the request', 'The Loans executive who owns the request works it', 'Hand-off from the RM to the Loans team', 3000);
  const owner = rec1.assigned_to?.startsWith('GC') ? rec1.assigned_to : 'GCLOAN1';
  await S.login(owner, 'Owner of the request — Loans team');
  await board(S);
  const t1 = `Statement request · ${cStmt}`;
  await S.say('The board: one column per stage, from New to Closed', 'Drag the card when the work moves on');
  await S.drag(t1, 'Acknowledged', 'In progress');
  await S.say('Statements prepared — try to mark it Resolved', 'A request cannot be resolved without the date it was resolved');
  await S.drag(t1, 'In progress', 'Resolved', { expectFail: true });
  await S.say('Blocked: the Resolved stage needs the "Resolved on" date', 'The card goes back to its column and the board says what is missing');
  await p.waitForTimeout(3500);
  await S.clickText('Open record to complete');
  await S.settle(1000);
  await S.say('Enter the date the request was resolved and save', 'Then go back to the board');
  await S.fill('service_request', { resolved_on: today() });
  await save(S);
  await board(S);
  await S.drag(t1, 'In progress', 'Resolved');
  await S.say('Resolved — the client is emailed a short satisfaction survey', 'One question on satisfaction (1–5), one on likelihood to recommend (0–10)');
  await p.waitForTimeout(2500);
  await S.drag(t1, 'Resolved', 'Closed');
  await S.say('Closed. The service level was met on time', 'The SLA timer stopped when the request was resolved');
  await p.waitForTimeout(2500);

  // ── 4. Approval ──
  await S.step(4, 'Request needing approval', `${cAppr} wants to prepay part of a home loan`, 'Partial prepayment needs the business-unit head\'s approval', 3000);
  await S.login('GCRM1', 'The RM logs the request');
  await S.newRecord('service_request');
  await S.say('Same form, request type Partial prepayment', 'The catalogue marks this type as needing approval');
  await S.fill('service_request', { party: cAppr, business_unit: 'LND', request_type: 'partial_prepayment', priority: 'high', channel: 'email' });
  await S.fill('service_request', { description: 'Client wishes to prepay MUR 500,000 on the home loan and keep the same monthly instalment.' }, { delay: 14 });
  const r2 = await save(S);
  const id2 = r2?.id ?? (await find(cAppr, 'partial_prepayment')).id;
  await S.openRecord('service_request', id2);
  await S.say('Needs approval: Yes — the catalogue sent it to the business-unit head', 'An approval request is waiting in Tools ▸ Approvals');
  await p.waitForTimeout(3500);

  await S.waitCut(() => poll(async () => JSON.stringify((await api('GCBDH', 'GET', '/runtime/workflows/approvals?scope=mine')).data ?? '').includes(`Partial prepayment · ${cAppr}`), { what: 'approval request' }));
  await S.step(5, 'Approve', 'The BD head reviews and approves the request', 'Tools ▸ Approvals — the requester can never approve their own request', 3000);
  await S.login('GCBDH', 'Head of BD — approves requests the catalogue flags');
  await S.say('The request waits in her Approvals inbox', 'Open the linked record to review it, add a comment, then Approve or Reject');
  await S.approve(`Partial prepayment · ${cAppr}`, 'Approved — confirm the prepayment fee with the client.');
  const gotIt = p.getByRole('button', { name: 'Got it' });
  if (await gotIt.count()) { await p.waitForTimeout(1200); await S.moveTo(gotIt.first()); }
  await S.say('Approved: the owner is notified to go ahead', 'The decision and comment are kept on the request\'s Audit tab');
  await p.waitForTimeout(3000);

  // ── 6. Complaint ──
  await S.step(6, 'Log a complaint', `${cComp} writes in to complain about a fee`, 'Anyone can log a complaint — request type Complaint', 3000);
  await S.login('GCRM1', 'The RM receives the complaint letter');
  await S.newRecord('service_request');
  await S.say('New request: the client, the business unit — and request type Complaint');
  await S.fill('service_request', { party: cComp, business_unit: 'LND', request_type: 'complaint' });
  await S.say('Choosing Complaint shows the complaint-handling fields', 'Category, root cause, final response, redress and Ombudsperson referral');
  await p.waitForTimeout(3000);
  await S.fill('service_request', { priority: 'high', channel: 'letter', complaint_category: 'pricing' });
  await S.fill('service_request', { description: 'Client was charged a MUR 2,500 late-payment fee although the instalment was paid on time by standing order.' }, { delay: 12 });
  const r3 = await save(S);
  const id3 = r3?.id ?? (await find(cComp, 'complaint')).id;
  await S.waitCut(() => poll(async () => (await records('GCADMIN', SR, { limit: 500 })).find((x) => x.id === id3)?.pipeline_stage?.name === 'acknowledged', { what: 'complaint acknowledged' }));
  await S.openRecord('service_request', id3);
  await S.say('Acknowledged automatically and routed to Compliance', 'Owner: Fatima Hossenbux, whatever the business unit · the complaints timer has started');
  await S.scroll(400, 3500);
  await S.tab('Activity');
  await showTimeline(S, 'The client already has the complaint acknowledgement', 'In the client\'s language, with the reference number and the next steps');

  await S.step(7, 'Compliance', 'Compliance owns the complaint and is notified', 'Signed in as the Compliance Officer', 3000);
  await S.login('GCCOMP1', 'Compliance Officer — oversees the complaints register');
  await S.moveTo(p.locator('button[title=Notifications]'));
  await p.waitForTimeout(3500);
  await p.keyboard.press('Escape');
  await S.say('The SLA Board shows the complaint\'s timers', 'First response met · resolution due within 15 business days');
  await S.go('/sla', 1500);
  const row = p.locator('a').filter({ hasText: `Complaint · ${cComp}` }).first();
  if (await row.count()) await S.highlight(row, 3500); else { S.issue('SLA Board: complaint timer not listed'); await p.waitForTimeout(3000); }

  const t3 = `Complaint · ${cComp}`;
  await S.say('Compliance investigates', 'Move the complaint to In progress');
  await board(S);
  await S.drag(t3, 'Acknowledged', 'In progress');
  await S.say('A statement copy is needed from the client — Awaiting client', 'While the client has the ball, the SLA clock is paused');
  await S.drag(t3, 'In progress', 'Awaiting client');
  await S.go('/sla', 1500);
  const row2 = p.locator('a').filter({ hasText: `Complaint · ${cComp}` }).first();
  await poll(async () => { await p.reload(); await S.settle(600); return (await row2.count()) && /Paused/.test(await row2.innerText()); }, { timeout: 30000, every: 3000, what: 'paused timer' }).catch(() => S.issue('SLA timer not shown as Paused'));
  await S.say('Paused: the waiting time does not count against the target', 'The clock restarts when the complaint moves on');
  if (await row2.count()) await S.highlight(row2, 3500);

  await S.step(8, 'Resolve', 'The client sent the statement — back to In progress', 'The fee was charged in error');
  await board(S);
  await dragBack(S, t3, 'Awaiting client', 'In progress');
  await S.say('Try to resolve it straight away…');
  await S.drag(t3, 'In progress', 'Resolved', { expectFail: true });
  await S.say('Blocked: a complaint needs a root cause and a final response before it is resolved', 'And the date it was resolved');
  await p.waitForTimeout(4000);
  await S.clickText('Open record to complete');
  await S.settle(1000);
  await S.say('Record the root cause and the final response sent to the client', 'Here: a system error applied the fee — it is refunded');
  await S.fill('service_request', { root_cause: 'system' });
  await S.fill('service_request', { final_response: 'We confirm your instalment was received on time. The late-payment fee was applied in error by our system and has been refunded in full. We apologise for the inconvenience.' }, { delay: 8 });
  await S.fill('service_request', { redress_amount: '2500', resolved_on: today() });
  await S.say('Root cause, final response, redress — and the Ombudsperson box', 'Tick it if the client refers the complaint to the Ombudsperson for Financial Services');
  await S.moveTo(p.locator('[id="ombudsperson_referred"]'), { click: false });
  await p.waitForTimeout(3000);
  await save(S);
  await S.say('Saved — now move the complaint to Resolved');
  await board(S);
  await S.drag(t3, 'In progress', 'Resolved');
  await S.say('Resolved: the timer stops and the satisfaction survey goes to the client');
  await p.waitForTimeout(2500);
  await S.drag(t3, 'Resolved', 'Closed');

  await S.step(9, 'Survey and evidence', 'Everything is on the complaint record', 'Final response, dates, emails and the full audit trail');
  await S.openRecord('service_request', id3);
  await S.scroll(450, 3000);
  await S.tab('Activity');
  await showTimeline(S, 'Activity: the acknowledgement and the satisfaction survey', 'Sent automatically — nobody had to remember');
  await S.tab('Audit');
  await S.scroll(350, 600);
  await S.say('Audit: every stage change, who made it and when', 'The evidence the FSC complaints register asks for');
  await p.waitForTimeout(4000);
  await editFromPanel(S);
  await S.say('When the client answers the survey, the scores are recorded on the request', 'They feed the CSAT and NPS figures on the Service dashboard');
  await S.fill('service_request', { csat_score: '4', nps_score: '8' });
  await p.waitForTimeout(1500);
  await save(S);
  await p.waitForTimeout(2000);

  await S.say('The SLA Board: on-time compliance across requests and complaints', 'Tools ▸ SLA Board');
  await S.go('/sla', 1500);
  await p.waitForTimeout(4000);

  await S.card({
    eyebrow: 'Summary',
    title: 'Service & Complaints',
    text: 'Requests and complaints are acknowledged, routed and timed by the system.',
    bullets: ['The catalogue sets the SLA and the approval', 'Requests route to the business unit\'s team', 'Approvals go to the BD / business-unit head',
      'Complaints: acknowledged, owned by Compliance', 'No resolution without root cause and response', 'Awaiting client pauses the clock; survey on resolve'],
    foot: 'Next: KYC & Compliance',
  }, 7000);
}
