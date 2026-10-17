// Trading Solutions: open a securities account with the wizard and take it through the account-opening gates, log a
// phone order and follow it through the OMS to execution, see an order on a restricted issuer refused, record an
// indication of interest for a bond issue, send a research note to its subscribers, the advisory barrier, and the
// Trading dashboard.
import { API, api, poll as poll0, records, obj } from '../lib/studio.mjs';

// A lookup that fails while the backend restarts (other changes reload it) is retried rather than failing the take.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 240000, ...o });

export const title = 'Trading Solutions';

const CLIENT = 'Corinne Henry';              // KYC approved, subscribed to research notes, no trading account yet
const INSTRUMENT = 'Phoenix Beverages Ltd';
const RESTRICTED = 'Island Agro Industries Ltd';
const NOTE = 'Tourism recovery and SEM hotels — October 2026';
const ISSUE = 'MCB Group 2031 Notes';

const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10); // Mauritius date
const nowMu = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

// S.submit with a longer server wait, retrying once the backend is back if it restarted mid-save.
async function submit(S, { expectFail = false } = {}, attempt = 1) {
  const { p } = S;
  const btn = p.locator('form button[type=submit]').last();
  const resp = p.waitForResponse((r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 240000 });
  await S.moveTo(btn);
  const invalid = p.locator('.form-error').first().waitFor({ state: 'visible', timeout: 240000 }).then(() => 'invalid').catch(() => null);
  if (await Promise.race([resp.then(() => 'sent'), invalid]) === 'invalid') {
    throw new Error(`form validation: ${(await p.locator('.form-error').allTextContents()).join('; ')}`);
  }
  const r = await S.waitCut(() => resp);
  const body = await r.text().catch(() => '');
  S.log('save', r.status());
  if (r.status() >= 500 && !body.includes('"error"') && attempt < 4) {
    await S.waitCut(() => poll(async () => (await fetch(`${API}/auth/me`)).status < 500, { what: 'backend' }));
    if (p.url().match(/\/(new|edit\/\d+)$/)) return submit(S, { expectFail }, attempt + 1);
    return null;
  }
  if ((r.status() < 300) === expectFail) throw new Error(`save ${r.status()} ${body.slice(0, 300)}`);
  if (!expectFail) await S.settle(900);
  return body;
}

// Wait (trimmed from the video) until the page's lists and panels have loaded.
async function ready(S) {
  await S.waitCut(() => S.p.waitForFunction(() => {
    const busy = !!document.querySelector('main .animate-spin, [role=dialog] .animate-spin') || /Loading\.\.\.|Loading…|Searching…/.test(document.querySelector('main')?.innerText || '');
    window.__st_idle = busy ? 0 : (window.__st_idle || 0) + 1;
    return window.__st_idle >= 3;
  }, null, { timeout: 120000, polling: 300 }).catch(() => S.log('ready timeout')));
  await S.p.waitForTimeout(400);
}

// Pick a lookup value; the wait for search results is trimmed from the video.
async function pick(S, name, value) {
  const { p } = S;
  const el = p.locator(`[id="${name}"]`).first();
  await S.moveTo(el);
  const input = p.locator(`input[id="${name}"]`).first();
  await input.waitFor({ timeout: 10000 });
  await input.fill(''); await S.type(value, 45);
  const list = el.locator('xpath=ancestor::div[contains(@class,"relative")][1]').locator('ul');
  const opt = list.locator('button').filter({ hasText: value }).first();
  // The results re-render while the search catches up with the typing: wait for the final list.
  for (let i = 0; ; i++) {
    await S.waitCut(async () => {
      await p.waitForTimeout(400);
      await p.waitForFunction((u) => u && !/Searching/.test(u.innerText), await list.elementHandle({ timeout: 120000 }), { timeout: 120000 }).catch(() => {});
      await opt.waitFor({ timeout: 120000 });
      await p.waitForTimeout(500);
    });
    try { await S.moveTo(opt); break; } catch (e) { if (i >= 3) throw e; S.log('lookup option moved, retrying'); }
  }
  await p.waitForTimeout(300);
}

async function scrollTo(S, loc) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
  await S.p.waitForTimeout(400);
}

export default async function run(S) {
  const { p } = S;
  // Every page waits for its lists to load before the caption moves on (the waits are trimmed).
  const go0 = S.go, view0 = S.view;
  S.go = async (...a) => { await go0(...a); await ready(S); };
  S.view = async (...a) => { await view0(...a); await ready(S); };
  // Waiting for a control to appear (a slow page on a busy server) is trimmed too.
  const move0 = S.moveTo;
  S.moveTo = async (loc, o) => {
    const el = typeof loc === 'string' ? p.locator(loc).first() : loc;
    await S.waitCut(() => el.waitFor({ state: 'visible', timeout: 120000 }).catch(() => {}));
    return move0(el, o);
  };
  S.click = (loc, o) => S.moveTo(loc, o);
  const fill0 = S.fill;
  S.fill = (name, values, o = {}) => fill0(name, values, { delay: 14, ...o });
  const acctObj = await obj('securities_account');
  const orderObj = await obj('client_order');
  const ioiObj = await obj('ioi_entry');
  const resObj = await obj('research_publication');

  // Housekeeping: remove this tutorial's own records from an earlier take.
  const mine = (r) => r.created_by === 'GCTRD1' && r.created_at > '2026-10-16';
  for (const [o, test] of [[orderObj, (r) => [INSTRUMENT, RESTRICTED].includes(r.data?.instrument)], [acctObj, (r) => r.data?.name?.startsWith(CLIENT)],
    [ioiObj, (r) => r.data?.name === `${ISSUE} · ${CLIENT}`], [resObj, (r) => r.data?.title === NOTE]]) {
    for (const r of await poll(() => records('GCTRD1', o.id, { limit: 500 }), { what: 'earlier records' })) {
      if (mine(r) && test(r)) { S.log('removing earlier take', o.name, r.id); await poll(() => api('GCTRD1', 'DELETE', `/runtime/records/${r.id}`, {}), { what: 'delete' }); }
    }
  }

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 11',
    title: 'Trading Solutions',
    text: 'Open a client\'s trading account, take and execute an order, run the bond book and distribute research.',
    bullets: [
      'Open a securities account with the wizard',
      'Agreement and activation gates (CDS number, KYC)',
      'Log a phone order and hand it to the OMS',
      'Orders on restricted issuers are refused',
      'IPO / bond book: indications of interest',
      'Send research to subscribers — sent and opens',
    ],
    foot: 'Persona: Arvind Ramsurrun (Trader)',
  }, 8000);

  // ── 1. Open the account ─────────────────────────────────────────────────────────────────────────────────────────
  await S.step(1, 'Account request', `${CLIENT} wants to trade on the SEM and abroad`, 'The trader opens a securities account for her');
  await S.login('GCTRD1', 'Trader — opens accounts, takes and executes orders');
  await S.openObject('securities_account');
  await S.say('Investments ▸ Trading Solutions ▸ Securities Accounts', 'Each account: client, markets, custodian, CDS and OMS numbers, limits');
  await p.waitForTimeout(3500);
  await S.moveTo(p.getByRole('button', { name: 'Trading account opening' }));
  await S.settle(1200);
  await S.say('The account-opening wizard: three short steps', 'Client & account → custody & settlement → controls');
  await pick(S, 'party', CLIENT);
  await S.fill('securities_account', { account_type: 'individual', markets: 'both' });
  await S.moveTo(p.getByRole('button', { name: /^Continue/ })); await p.waitForTimeout(900);
  await S.say('Where the securities are held and where the money settles', 'And who may give instructions on the account');
  await S.fill('securities_account', {
    custodian: 'Genesis Securities Ltd', settlement_bank: 'MCB 000 451 778 902',
    authorised_instructors: 'Corinne Henry (account holder) only',
  }, { delay: 14 });
  await S.moveTo(p.getByRole('button', { name: /^Continue/ })); await p.waitForTimeout(900);
  await S.say('A trading limit — the agreement and appropriateness come later', 'They are ticked once the client has signed and been assessed');
  await S.fill('securities_account', { trading_limit: '5000000' });
  await p.waitForTimeout(1500);
  const create = p.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/runtime/records') && r.request().method() === 'POST', { timeout: 240000 });
  await S.moveTo(p.getByRole('button', { name: 'Open account' }));
  const cr = await S.waitCut(() => create);
  if (cr.status() >= 300) throw new Error(`open account ${cr.status()} ${(await cr.text()).slice(0, 300)}`);
  await S.settle(900);
  const acct = await poll(async () => (await records('GCTRD1', acctObj.id, { limit: 500 })).find((r) => mine(r) && r.data?.name?.startsWith(CLIENT)), { what: 'account' });
  const card = acct.data.name;
  S.log('account', acct.id, card);
  await S.say('Account request created at Requested', 'An account number is given automatically');
  await p.waitForTimeout(2500);

  // ── 2. Through the gates ────────────────────────────────────────────────────────────────────────────────────────
  await S.step(2, 'KYC & appropriateness', 'On the pipeline, move the account to KYC & appropriateness', 'Check the client\'s KYC and that she understands the products');
  await S.openObject('securities_account', { view: 'Pipeline' });
  await S.drag(card, 'Requested', 'KYC & appropriateness');
  await S.say('Next, Agreement…', 'The CRM checks the signed agreement and the appropriateness test');
  await S.drag(card, 'KYC & appropriateness', 'Agreement', { expectFail: true, after: 600 });
  await S.say('Blocked: the agreement must be signed and appropriateness assessed', 'A stage gate — the account cannot go further without them');
  await p.waitForTimeout(3500);
  await S.say('She has signed and passed the appropriateness test — tick both', 'Edit the account');
  await S.editRecord('securities_account', acct.id);
  await S.fill('securities_account', { appropriateness_ok: true, agreement_signed: true });
  await submit(S);
  await S.openObject('securities_account', { view: 'Pipeline' });
  await S.say('Move to Agreement again — this time it goes through', 'Then CDS opening: Operations requests the CDS account');
  await S.drag(card, 'KYC & appropriateness', 'Agreement');
  await S.drag(card, 'Agreement', 'CDS opening');

  await S.step(3, 'Activate', 'Try to activate the account', 'Trading needs a CDS account number and approved KYC');
  await S.drag(card, 'CDS opening', 'Active', { expectFail: true, after: 600 });
  await S.say('Blocked: the CDS account number is missing', 'Activation also checks that the client\'s KYC is approved');
  await p.waitForTimeout(3500);
  await S.say('The CDS has opened the account — enter its number and the OMS account', 'Edit the account');
  await S.editRecord('securities_account', acct.id);
  await S.fill('securities_account', { cds_account_no: 'CDS-418 207', oms_account_no: 'OMS-62 418' });
  await submit(S);
  await S.openObject('securities_account', { view: 'Pipeline' });
  await S.say('Activate again', `${CLIENT}'s KYC is approved, so the account goes live`);
  await S.drag(card, 'CDS opening', 'Active');
  await p.waitForTimeout(1500);

  // ── 3. Restricted list ──────────────────────────────────────────────────────────────────────────────────────────
  await S.step(4, 'Restricted list', 'Before taking orders: the restricted list', 'KYC & Compliance ▸ Restricted list — kept by Compliance, read by traders');
  await S.openObject('restricted_list_entry', { view: 'Table' });
  const rs = p.locator('input[placeholder="Search…"]').first();
  if (await rs.waitFor({ timeout: 30000 }).then(() => true).catch(() => false)) { await S.moveTo(rs); await S.type('Island Agro', 60); await S.settle(1500); await ready(S); }
  await S.say(`${RESTRICTED} is on the restricted list`, 'Genesis advises on a deal for this issuer — no orders, no trade ideas');
  await p.waitForTimeout(4500);

  // ── 4. Log a phone order ────────────────────────────────────────────────────────────────────────────────────────
  await S.step(5, 'Log the order', `${CLIENT} phones in an order`, 'Order Intake Log ▸ New: every instruction is time-stamped');
  await S.newRecord('client_order');
  await pick(S, 'securities_account', CLIENT);
  await S.fill('client_order', { instrument: INSTRUMENT, market: 'sem', side: 'buy', quantity: '1500' });
  await S.say('A limit order, received by phone', 'The time received and the voice recording reference are best-execution evidence');
  await S.fill('client_order', { price_type: 'limit', limit_price: '362.50', channel: 'phone', received_at: nowMu(), recording_ref: 'REC-604 118' });
  await submit(S);
  const order = await poll(async () => (await records('GCTRD1', orderObj.id, { limit: 500 })).find((r) => mine(r) && r.data?.instrument === INSTRUMENT), { what: 'order' });
  S.log('order', order.id, order.data.order_ref, order.data.name);

  await S.step(6, 'Send to the OMS', 'On the pipeline, move the order to Sent to OMS', 'The CRM hands it to the order management system');
  await S.openObject('client_order', { view: 'Pipeline' });
  await S.drag(INSTRUMENT, 'Received', 'Sent to OMS');
  const sent = await S.waitCut(() => poll(async () => {
    const r = await api('GCTRD1', 'GET', `/runtime/records/${order.id}`);
    return r.data?.data?.oms_reference ? r.data.data : null;
  }, { what: 'OMS reference' }));
  S.log('oms', sent.oms_reference);
  await S.say(`The OMS answered with its reference: ${sent.oms_reference}`, 'Written on the order automatically');
  await p.waitForTimeout(3000);

  await S.step(7, 'Execution', 'The order is filled — move it to Executed', 'The CRM wants the OMS reference and the executed price');
  await S.drag(INSTRUMENT, 'Sent to OMS', 'Executed', { expectFail: true, after: 600 });
  await S.say('Blocked: the executed price is missing', 'An order is never marked executed without the fill details');
  await p.waitForTimeout(3500);
  await S.editRecord('client_order', order.id);
  await S.say('Enter the executed price from the OMS fill', 'The OMS reference is already there');
  await S.fill('client_order', { executed_price: '362.25' });
  await submit(S);
  await S.openObject('client_order', { view: 'Pipeline' });
  await S.drag(INSTRUMENT, 'Sent to OMS', 'Executed');
  await S.openRecord('client_order', order.id);
  await S.say('Executed — consideration and estimated brokerage are calculated', 'Quantity × executed price; the client\'s account counts the order');
  const cons = p.getByText('Consideration', { exact: true }).locator('visible=true').first();
  if (await cons.count()) { await scrollTo(S, cons); await S.highlight(cons.locator('xpath=..'), 3500); } else await p.waitForTimeout(3500);
  await p.keyboard.press('Escape');

  // ── 5. Restricted issuer ────────────────────────────────────────────────────────────────────────────────────────
  await S.step(8, 'Restricted issuer', `Another client call: buy ${RESTRICTED}`, 'Let\'s see what the CRM does');
  await S.newRecord('client_order');
  await pick(S, 'securities_account', CLIENT);
  await S.fill('client_order', { instrument: RESTRICTED, side: 'buy', quantity: '5000', received_at: nowMu() });
  await submit(S, { expectFail: true });
  await p.waitForTimeout(800);
  await S.say('Refused: this issuer is on the restricted list', 'The order cannot be taken — the check runs on the server, no one can skip it');
  const msg = p.getByText(/restricted list/).locator('visible=true').last();
  if (await msg.count()) await S.highlight(msg, 4000); else { S.issue('Restricted-list refusal message not visible on the order form'); await p.waitForTimeout(4000); }

  // ── 6. IPO / bond book ──────────────────────────────────────────────────────────────────────────────────────────
  await S.step(9, 'Bond book', `Genesis is placing the ${ISSUE}`, 'IPO / Bond Book: record each client\'s indication of interest');
  await S.newRecord('ioi_entry');
  await S.fill('ioi_entry', { issue_name: ISSUE });
  await pick(S, 'party', CLIENT);
  await S.fill('ioi_entry', { instrument: 'notes', indicated_amount: '2000000', indicated_on: today() });
  await S.say('Allocated is filled in when the book closes', 'Demand per issue shows on the Trading dashboard');
  await p.waitForTimeout(2500);
  await submit(S);
  await ready(S);
  await S.say('The book for every issue', 'Indicated and allocated amounts per investor');
  await p.waitForTimeout(3500);

  // ── 7. Research ─────────────────────────────────────────────────────────────────────────────────────────────────
  await S.step(10, 'Research note', 'Publish a research note', 'Research & Market Statistics ▸ New');
  await S.newRecord('research_publication');
  await S.fill('research_publication', { title: NOTE, publication_type: 'research', published_on: today() });
  await S.fill('research_publication', { summary: 'Arrivals up 8% year on year; hotel groups on the SEM report higher occupancy and room rates. We stay positive on the sector.' }, { delay: 8 });
  await submit(S);
  const note = await poll(async () => (await records('GCTRD1', resObj.id, { limit: 500 })).find((r) => mine(r) && r.data?.title === NOTE), { what: 'research note' });
  await S.openRecord('research_publication', note.id);
  await ready(S);
  await S.say('Send to subscribers: one click', 'Every active subscriber of research notes is emailed, in English or French');
  const send = p.getByRole('button', { name: 'Send to subscribers' }).first();
  const run = p.waitForResponse((r) => /\/actions\/\d+$/.test(r.url()) && r.request().method() === 'POST', { timeout: 240000 });
  await S.moveTo(send);
  const rr = await S.waitCut(() => run);
  S.log('send', rr.status(), (await rr.text().catch(() => '')).slice(0, 200));
  if (rr.status() >= 300) throw new Error(`send to subscribers ${rr.status()} ${(await rr.text()).slice(0, 300)}`);
  await p.waitForTimeout(800);
  await S.say('The CRM reports how many were emailed and how many skipped', 'Clients who unsubscribed, or have no marketing consent, are never emailed');
  const dlg = p.getByRole('dialog').last();
  if (await dlg.isVisible().catch(() => false)) await S.highlight(dlg, 4500); else await p.waitForTimeout(4500);
  const gotIt = p.getByRole('button', { name: /^(Got it|Done|OK)$/ }).first();
  if (await gotIt.isVisible().catch(() => false)) { await S.moveTo(gotIt); await p.waitForTimeout(600); }
  await S.openRecord('research_publication', note.id);
  await ready(S);
  const dist = p.getByText('Distributed', { exact: true }).locator('visible=true').first();
  await S.say('Distributed is ticked and Opens starts at 0', 'Opens counts up as recipients read it — an estimate, some mail apps block images');
  if (await dist.count()) { await scrollTo(S, dist); await S.highlight(dist.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 4000); } else await p.waitForTimeout(4000);
  await S.tab('Activity');
  await ready(S);
  await S.say('The distribution is kept on the note\'s Activity timeline', 'Who sent it, when, and to how many subscribers');
  await p.waitForTimeout(4000);
  const older = (await records('GCTRD1', resObj.id, { limit: 500 })).find((r) => r.data?.title === 'Banking sector outlook' && Number(r.data?.opens) > 0);
  if (older) {
    await S.openRecord('research_publication', older.id);
    await ready(S);
    await S.say(`An earlier note: ${older.data.opens} opens so far`, 'A simple read on which research clients find useful');
    const op = p.getByText('Opens', { exact: true }).locator('visible=true').first();
    if (await op.count()) { await scrollTo(S, op); await S.highlight(op.locator('xpath=..'), 3500); } else await p.waitForTimeout(3500);
  }

  // ── 8. The advisory barrier ─────────────────────────────────────────────────────────────────────────────────────
  await S.step(11, 'Information barrier', 'Corporate Advisory sits behind the advisory wall', 'Traders cannot see deals Genesis is advising on');
  await S.go('/module/96');
  await p.getByText(/0 records|No advisory mandates|No records/i).first().waitFor({ timeout: 60000 }).catch(() => {});
  await S.say('The trader sees no advisory mandates', 'That is why the restricted list exists: Compliance tells the desk what not to trade');
  await p.waitForTimeout(4500);

  // ── 9. Dashboard ────────────────────────────────────────────────────────────────────────────────────────────────
  await S.step(12, 'Dashboard', 'The Trading dashboard', 'Accounts, portfolio value, orders by market, consideration and the bond book');
  await S.go('/', 1500);
  const sel = p.locator('main select').first();
  await S.moveTo(sel, { click: false });
  const opt = await sel.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()]));
  const hit = opt.find(([, l]) => l === 'Trading');
  if (hit) { await sel.selectOption(hit[0]); await S.settle(2500); } else S.issue('Trading dashboard not in the dashboard menu for GCTRD1');
  await p.waitForTimeout(3500);
  await S.scroll(450, 3000);
  await S.say('Orders by market and consideration per month', 'Each widget opens the records behind it');
  await S.scroll(450, 3000);
  await S.say('The IPO / bond book by issue', 'Including today\'s indication');
  await S.scroll(450, 3000);
  await S.clear();

  await S.logout();
  await S.card({
    eyebrow: 'Summary',
    title: 'Trading Solutions',
    text: 'The CRM keeps the evidence and enforces the rules — the trader serves the client.',
    bullets: [
      'Agreement + appropriateness before Agreement',
      'CDS number + approved KYC before Active',
      'Orders time-stamped, OMS reference recorded',
      'Executed needs the OMS reference and price',
      'Restricted issuers refused automatically',
      'Research emailed to consenting subscribers, opens counted',
    ],
    foot: 'Genesis CRM · Trading Solutions',
  }, 7000);
}
