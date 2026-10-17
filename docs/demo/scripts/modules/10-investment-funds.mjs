// Investment Funds: the fund shelf, a subscription captured with the wizard (KYC and suitability rules), the
// payment-proof gate, maker-checker approval by Operations, the transfer-agent hand-off, the holding and the
// FMB 2029 campaign, and the Investment Funds dashboard.
import { records, poll, obj, api } from '../lib/studio.mjs';

export const title = 'Investment Funds';

const CLIENT = 'Natacha Hardy';        // KYC approved, conservative profile (highest suitable risk 1)
const NO_KYC = 'Amit Lebrasse';        // KYC still in progress
const CLASS = 'Fixed Maturity Bond 2029';
const CAMPAIGN = 'Series 2';

export default async function run(S) {
  const { p } = S;
  const order = await obj('fund_order');

  // ── wizard helpers ──
  const wizardNext = async () => { await S.moveTo(p.getByRole('button', { name: /^Continue/ })); await p.waitForTimeout(900); };
  // Like S.submit, with a longer wait: the shared machine can be slow while several videos record at once.
  const save = async () => {
    const resp = p.waitForResponse((r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 300000 });
    await S.moveTo(p.locator('form button[type=submit]').last());
    const r = await S.waitCut(() => resp);
    S.log('save', r.status());
    if (r.status() >= 300) throw new Error(`save ${r.status()} ${(await r.text()).slice(0, 300)}`);
    await S.settle(900);
  };
  const approve = async (match, comment) => {
    await S.go('/approvals', 1200);
    const card = p.locator('article').filter({ hasText: match }).filter({ has: p.getByRole('button', { name: 'Approve' }) }).first();
    await card.waitFor({ timeout: 120000 });
    await S.highlight(card, 1800);
    await S.moveTo(card.getByPlaceholder(/Comment/)); await S.type(comment, 22);
    const resp = p.waitForResponse((r) => r.url().includes('/workflows/approval') && r.request().method() === 'POST', { timeout: 300000 });
    await S.moveTo(card.getByRole('button', { name: 'Approve' }));
    const r = await S.waitCut(() => resp);
    S.log('approve', r.status());
    if (r.status() >= 300) throw new Error(`approve failed ${r.status()} ${(await r.text()).slice(0, 300)}`);
    await S.settle(1500);
    // The inbox confirms the decision in a dialog — read it, then close it.
    const gotIt = p.getByRole('button', { name: 'Got it' });
    if (await gotIt.isVisible().catch(() => false)) { await p.waitForTimeout(1800); await S.moveTo(gotIt); await p.waitForTimeout(600); }
  };
  const capture = async (expectFail) => {
    const resp = p.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/runtime/records') && r.request().method() === 'POST', { timeout: 300000 });
    await S.moveTo(p.getByRole('button', { name: 'Capture order' }));
    const r = await S.waitCut(() => resp);
    S.log('capture', r.status());
    if ((r.status() < 300) === expectFail) throw new Error(`capture ${r.status()} ${(await r.text()).slice(0, 300)}`);
    await p.waitForTimeout(900);
    return r.json().catch(() => ({}));
  };

  // Housekeeping: remove this tutorial's own unfinished orders from an earlier take, so the board shows one card.
  for (const r of await records('GCPM2', order.id)) {
    if (r.data?.name?.includes(CLIENT) && r.data?.fund_code === 'FND-FMB29' && [undefined, 'captured', 'checked', 'submitted_to_ta', 'confirmed'].includes(r.pipeline_stage?.name) && r.created_by === 'GCPM2' && r.created_at > '2026-10-15') {
      S.log('removing earlier take', r.id); const d = await api('GCPM2', 'DELETE', `/runtime/records/${r.id}`, {}); if (d.status >= 300) S.log('delete failed', d.status);
    }
  }

  // …and the holding an earlier confirmed take booked.
  for (const h of await records('GCPM2', (await obj('fund_holding')).id)) {
    if (String(h.data?.name).includes(`${CLIENT} · FMB29-USD`) && h.created_at > '2026-10-15') {
      S.log('removing earlier holding', h.id); await api('GCPM2', 'DELETE', `/runtime/records/${h.id}`, {});
    }
  }

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 10',
    title: 'Investment Funds',
    text: 'Capture a fund subscription and follow it to the transfer agent, with the controls the regulator expects.',
    bullets: ['Funds, share classes and NAV history', 'Capture a subscription with the wizard', 'KYC and suitability rules', 'Payment proof before checks are complete', 'Operations approval and the TA hand-off', 'Holdings, the FMB 2029 campaign, the dashboard'],
    foot: 'Personas: Vanessa Ah-Kee (Fund Manager) · Ritesh Seewoo (Operations Checker)',
  }, 8000);

  // ── 1. The fund shelf ──
  await S.step(1, 'The fund shelf', 'The fund manager works in Investment Funds', 'Funds, share classes, NAV, orders, holdings, campaigns and distribution notices');
  await S.login('GCPM2', 'Fund Manager — captures and follows client fund orders');
  await S.openObject('fund');
  await S.say('Funds: the Genesis Global Funds range', 'Asset class, horizon, AUM held by our clients and number of share classes');
  await p.waitForTimeout(3500);
  await S.openObject('fund_share_class');
  await S.say('Share classes: what the client actually buys', 'Currency, risk rating 1–5, minimum investment and the latest NAV');
  await p.waitForTimeout(3000);
  const fmbRow = p.locator('tr').filter({ hasText: 'FMB29-USD' }).first();
  if (await fmbRow.count()) {
    await S.moveTo(fmbRow);
    await S.settle(1200);
    await S.say('Each share class holds the dealing rules', 'ISIN, entry and exit fees, dealing frequency and the cut-off time');
    await p.waitForTimeout(3500);
    await S.scroll(350, 2500);
    await p.keyboard.press('Escape');
  }
  await S.openObject('nav_history');
  await S.say('NAV History: one price per share class per dealing date', 'Synced from the transfer agent — holdings are valued at the latest NAV');
  await p.waitForTimeout(3500);

  // ── 2. Capture a subscription (KYC rule) ──
  await S.step(2, 'Capture the order', 'Fund Orders ▸ Fund subscription opens a three-step wizard', 'Investor & fund → amount & payment → suitability');
  await S.openObject('fund_order');
  await p.waitForTimeout(1500);
  await S.moveTo(p.getByRole('button', { name: 'Fund subscription' }));
  await S.settle(1200);
  await S.say('First, a client whose KYC is still in progress', `${NO_KYC} — let's see what the system does`);
  await S.fill('fund_order', { party: NO_KYC, share_class: CLASS, order_type: 'subscription', fund_campaign: CAMPAIGN });
  await wizardNext();
  await S.say('The amount is in the share class currency — here US dollars', 'Minimum subscription USD 50,000 for the FMB 2029');
  await S.fill('fund_order', { amount: '60000', cut_off_date: '2026-10-21' });
  await S.say('Payment not received yet, so "Payment proof received" stays unticked', 'We come back to it before the checks');
  await p.waitForTimeout(2800);
  await wizardNext();
  await capture(true);
  const alert = p.locator('div.rounded-xl').filter({ hasText: /approved KYC/ }).last();
  await S.say('Refused: orders are accepted only for clients with approved KYC', 'The rule is checked on the server — no one can skip it');
  if (await alert.count()) await S.highlight(alert, 3500); else { S.issue('KYC refusal message not visible in the wizard'); await p.waitForTimeout(3500); }

  // ── 3. Suitability ──
  await S.step(3, 'Suitability', `Switch to ${CLIENT} — KYC approved, conservative profile`, 'Her risk profile allows products up to risk 1; the FMB 2029 is rated 2');
  await S.moveTo(p.getByRole('button', { name: 'Investor & fund' }));
  await p.waitForTimeout(900);
  await S.fill('fund_order', { party: CLIENT });
  await wizardNext();
  await wizardNext();
  await capture(true);
  const suit = p.locator('div.rounded-xl').filter({ hasText: /risk is above/ }).last();
  await S.say('Refused again: the fund is riskier than her profile', 'Record why the client still wants it, and that she acknowledged the higher risk');
  if (await suit.count()) await S.highlight(suit, 3800); else { S.issue('Suitability refusal message not visible in the wizard'); await p.waitForTimeout(3800); }
  await S.fill('fund_order', {
    suitability_override: 'Client wants a fixed-maturity USD allocation for her 2029 plans; informed of the higher risk, allocation limited to 10% of investable assets.',
    client_acknowledged: true,
  }, { delay: 14 });
  await S.say('With the override documented, capture the order', 'The fund manager is recorded as the maker');
  await capture(false);
  await S.say('Order captured — an operations checker will authorise it', 'It starts in the Captured stage');
  await p.waitForTimeout(3000);

  const mine = await S.waitCut(() => poll(async () => (await records('GCPM2', order.id).catch(() => [])).filter((r) => r.data?.name?.includes(CLIENT) && r.data?.fund_code === 'FND-FMB29' && r.pipeline_stage?.name === 'captured')
    .sort((a, b) => b.id - a.id)[0], { what: 'the new order' }));
  S.log('order', mine.id, mine.data.order_no);

  // ── 4. Payment proof gate ──
  await S.step(4, 'Checks complete', 'On the pipeline, move the order to Checks complete', 'This is the hand-off to Operations');
  await S.openObject('fund_order', { view: 'Pipeline' });
  await p.waitForTimeout(1500);
  await S.drag(CLIENT, 'Captured', 'Checks complete', { expectFail: true, after: 600 });
  await S.say('Blocked: the payment proof must be received first', 'A stage gate — the order cannot reach Operations without it');
  await p.waitForTimeout(3500);
  await S.say('The client\'s transfer has arrived — tick "Payment proof received"', 'Edit the order');
  await S.editRecord('fund_order', mine.id);
  await S.fill('fund_order', { payment_proof_received: true });
  await save();
  await S.openObject('fund_order', { view: 'Pipeline' });
  await p.waitForTimeout(1200);
  await S.say('Move it again', 'Now the gate lets it through and an approval is raised');
  await S.drag(CLIENT, 'Captured', 'Checks complete');
  await S.say('An approval request goes to the operations checkers', 'Maker-checker: the person who captured the order can never approve it');
  await p.waitForTimeout(3000);
  await S.go('/approvals', 1500);
  await S.say(`${PEOPLE_NAME('GCPM2')} has nothing to approve here`, 'Her own order is routed to Operations, not to her');
  await p.waitForTimeout(3500);

  // ── 5. Operations approves ──
  await S.step(5, 'Operations approval', 'The operations checker reviews and approves', 'Tools ▸ Approvals');
  await S.login('GCOPS1', 'Operations Checker — authorises fund orders');
  await S.openRecord('fund_order', mine.id);
  await S.say('He opens the order first: payment proof, amount, suitability override', 'The checker sees everything the maker recorded — but cannot change it');
  await p.waitForTimeout(4000);
  await S.scroll(400, 2500);
  await approve(`Fund order check: Subscription · FND-FMB29 · ${CLIENT}`, 'Payment matched on the USD account. Approved.');
  await S.say('Approved — the system does the rest', 'Sends the order to the transfer agent, records its reference, confirms, emails the client and books the units');
  const done = await S.waitCut(() => poll(async () => {
    // Tolerate a backend restart while waiting (other work on the shared machine reloads it).
    const r = (await records('GCOPS1', order.id).catch(() => [])).find((x) => x.id === mine.id);
    return r?.pipeline_stage?.name === 'confirmed' && r.data?.ta_reference ? r : null;
  }, { what: 'order confirmed', timeout: 300000 }));
  S.log('confirmed', done.data.ta_reference);
  await p.waitForTimeout(2000);

  // ── 6. The result ──
  await S.step(6, 'Confirmed', 'Back with the fund manager: the order is Confirmed', 'Sent to TA → Confirmed, without anyone typing it in');
  await S.login('GCPM2', 'Fund Manager — checks the outcome');
  await S.openRecord('fund_order', mine.id);
  await S.say(`The transfer agent's reference is on the order: ${done.data.ta_reference}`, 'Units allotted are worked out at the latest NAV');
  const ta = p.getByText(done.data.ta_reference).first();
  if (await ta.count()) {
    // Keep it above the caption box.
    await ta.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
    await S.highlight(ta, 3500);
  } else await p.waitForTimeout(3500);
  await S.tab('Activity');
  await S.say('The client was emailed a confirmation', 'In her own language — logged on the order\'s activity');
  await p.waitForTimeout(3500);
  await S.tab('Audit');
  await S.say('The audit trail: who captured, who approved, every stage change', 'Maker and checker are always two different people');
  await p.waitForTimeout(3500);

  // ── 7. Holdings and campaign ──
  await S.step(7, 'Holding & campaign', 'Fund Holdings: her new FMB 2029 units', 'Units × latest NAV = value, with the gain against book cost');
  await S.openObject('fund_holding');
  const search = p.getByPlaceholder('Search…').first();
  if (await search.count()) { await S.moveTo(search); await S.type(CLIENT, 60); await S.settle(1500); }
  await p.waitForTimeout(3500);
  await S.openObject('fund_campaign', { view: 'Pipeline' });
  await S.say('Fund Campaigns: the FMB 2029 series', 'Planned → Window open → Allocating → Closed');
  await p.waitForTimeout(3000);
  const camps = await records('GCPM2', (await obj('fund_campaign')).id);
  const s2 = camps.find((c) => /Series 2/.test(c.data?.name));
  if (s2) {
    await S.openRecord('fund_campaign', s2.id);
    await S.say('Series 2 is open: target, amount subscribed and progress', 'Every subscription linked to the campaign counts, converted to rupees');
    await p.waitForTimeout(4500);
  }

  // ── 8. Dashboard ──
  await S.step(8, 'Dashboard', 'The Investment Funds dashboard', 'Holdings value, investors, orders awaiting the TA and the campaign raise');
  await S.go('/', 1500);
  const sel = p.locator('main select').first();
  await S.moveTo(sel, { click: false });
  const opt = await sel.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()]));
  const hit = opt.find(([, l]) => l === 'Investment Funds');
  if (hit) { await sel.selectOption(hit[0]); await S.settle(2500); } else S.issue('Investment Funds dashboard not in the dashboard menu for GCPM2');
  await p.waitForTimeout(3500);
  await S.scroll(450, 3000);
  await S.say('Subscriptions vs redemptions, orders by fund and per month', 'Each widget opens the records behind it');
  await S.scroll(450, 3000);
  await S.scroll(450, 2500);
  await S.clear();

  await S.card({
    eyebrow: 'Summary',
    title: 'A fund subscription, end to end',
    bullets: ['KYC must be approved', 'Riskier than the profile → override + acknowledgement', 'Payment proof before Checks complete', 'Operations approves — never the maker', 'TA reference, confirmation email, holding', 'Campaign progress and the dashboard update'],
    foot: 'Genesis CRM · Investment Funds',
  }, 7000);
}

function PEOPLE_NAME(id) { return { GCPM2: 'Vanessa', GCOPS1: 'Ritesh' }[id] || id; }
