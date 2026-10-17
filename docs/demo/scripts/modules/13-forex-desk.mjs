// Forex Desk (user guide §9 Forex Desk, §10 journey C, process flow 13). The dealer onboards a corporate client's FX
// profile with the wizard, quotes a forward (best-execution timer, the Quoted and Accepted gates), the accepted quote
// books the FX deal in the dealing system with its improvement against the board rate and a maturity reminder; the
// client's rate alert triggers when the dealer publishes the day's board rate. Ends on the Forex Desk dashboard.
import { api, obj, poll as poll0, records } from '../lib/studio.mjs';

// A lookup that fails while the shared backend restarts is retried rather than failing the take.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 240000, ...o });

export const title = 'Forex Desk';

const CLIENT = 'Le Morne Resorts Ltd'; // tourism corporate, EUR revenue, no FX profile yet
const mu = (days = 0) => new Date(Date.now() + 4 * 3600e3 + days * 86400e3).toISOString().slice(0, 10); // Mauritius date
const muNow = (min = 0) => new Date(Date.now() + 4 * 3600e3 + min * 60e3).toISOString().slice(0, 16).replace('T', ' ');

/** Remove what an earlier take created, so every take starts from the same data (API used for clean-up only). */
async function cleanup(S) {
  const ids = {};
  for (const n of ['party', 'fx_profile', 'fx_quote', 'fx_deal', 'fx_rate_alert', 'fx_rate']) ids[n] = (await obj(n)).id;
  const party = (await records('GCADMIN', ids.party, { limit: 2000 })).find((r) => r.data?.display_name === CLIENT);
  if (!party) throw new Error(`demo client ${CLIENT} not found`);
  const del = async (r) => { const d = await api('GCADMIN', 'DELETE', `/runtime/records/${r.id}`, {}); S.log('cleanup', r.id, d.status); };
  for (const n of ['fx_deal', 'fx_quote', 'fx_rate_alert', 'fx_profile']) {
    for (const r of (await records('GCADMIN', ids[n], { limit: 2000 })).filter((x) => Number(x.data?.party) === party.id)) {
      if (n === 'fx_deal') {
        const rem = await api('GCADMIN', 'GET', `/reminders?record_id=${r.id}`);
        for (const x of [].concat(rem.data ?? [])) await api('GCADMIN', 'DELETE', `/reminders/${x.id}`);
      }
      await del(r);
    }
  }
  // The board rate this video publishes (today's EUR row added by the dealer).
  for (const r of (await records('GCADMIN', ids.fx_rate, { limit: 500 })).filter((x) => x.data?.currency_code === 'EUR' && String(x.data?.rate_date).slice(0, 10) === mu() && x.created_by === 'GCFX1')) await del(r);
  return { party, ids };
}

export default async function run(S) {
  const { p } = S;
  const { party, ids } = await cleanup(S);

  // ── helpers ──
  const fill = async (name, values, o) => {
    for (const [k, v] of Object.entries(values)) {
      for (let attempt = 1; ; attempt += 1) {
        try { await S.fill(name, { [k]: v }, o); break; } catch (e) {
          if (attempt >= 3) throw e;
          S.log(`fill ${k} retry ${attempt}: ${e.message.split('\n')[0]}`);
          await p.waitForTimeout(3000);
        }
      }
    }
  };
  const isSave = (r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.request().method());
  const save = async ({ button } = {}) => {
    const btn = button || p.locator('form button[type=submit]').last();
    const resp = p.waitForResponse(isSave, { timeout: 300000 });
    await S.moveTo(btn);
    const invalid = p.locator('.form-error').first().waitFor({ state: 'visible', timeout: 300000 }).then(() => 'invalid').catch(() => null);
    const first = await S.waitCut(() => Promise.race([resp.then((r) => r), invalid]));
    if (first === 'invalid') throw new Error(`form validation: ${(await p.locator('.form-error').allTextContents()).join('; ')}`);
    const body = await first.json().catch(() => ({}));
    S.log('save', first.status());
    if (first.status() >= 300) throw new Error(`save ${first.status()} ${JSON.stringify(body).slice(0, 400)}`);
    await S.settle(900);
    return body?.data ?? body;
  };
  const wizardNext = async () => { await S.moveTo(p.getByRole('button', { name: /^Continue/ })); await p.waitForTimeout(900); };
  const board = async (name, column) => {
    await S.openObject(name, { view: 'Pipeline' });
    await S.column(column).waitFor({ timeout: 60000 });
    await p.waitForTimeout(800);
  };
  const blocked = async (text, sub, ms = 4500) => {
    await S.say(text, sub);
    const alert = p.getByRole('button', { name: 'Open record to complete' }).first().locator('xpath=..');
    if (await alert.count()) await S.highlight(alert, ms); else { S.issue('stage gate message not visible'); await p.waitForTimeout(ms); }
  };
  /** Open a record panel and wait until a label in it is visible. */
  const panel = async (name, id, label) => {
    for (let i = 0; i < 3; i++) {
      await S.openRecord(name, id);
      if (await p.getByText(label, { exact: true }).locator('visible=true').first().waitFor({ timeout: 45000 }).then(() => true).catch(() => false)) return;
      S.log('panel not rendered, reloading');
    }
    throw new Error(`record panel ${name} #${id} did not render`);
  };
  /** Highlight a field (label + value) on an open record panel. */
  const showField = async (label, ms = 3000) => {
    const el = p.getByText(label, { exact: true }).locator('visible=true').first();
    await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await p.waitForTimeout(500);
    await S.highlight(el.locator('xpath=..'), ms);
  };

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 13',
    title: 'Forex Desk',
    text: 'Genesis Forex: from a client\'s FX profile to a booked deal — quotes, forwards and rate alerts.',
    bullets: [
      'Onboard a corporate client\'s FX profile',
      'Quote with a best-execution timer',
      'Quoted and Accepted gates',
      'The deal is booked for you, with its improvement on the board',
      'Forward maturity on the dealer\'s reminders',
      'Rate alerts and the daily board · the dashboard',
    ],
    foot: 'Persona: Deepak Mungur (Forex Dealer, Genesis Forex Ltd)',
  }, 8000);

  // ── 1. FX profile ──
  await S.step(1, 'FX client profile', `${CLIENT}, a hotel group, earns euros and pays its costs in rupees`, 'It wants to sell its euro receipts forward — first, an FX profile');
  await p.waitForTimeout(2000);
  await S.login('GCFX1', 'Forex dealer — quotes, books deals, manages forwards and alerts');
  await S.openObject('fx_profile');
  await S.say('Forex Desk ▸ FX Client Profiles: one profile per FX client', 'Purpose, volumes, currency pairs, approved products and limits');
  await p.waitForTimeout(3000);
  await S.say('“Forex client onboarding” opens a two-step wizard', 'The FX need, then products and limits');
  await S.moveTo(p.getByRole('button', { name: 'Forex client onboarding', exact: true }));
  await S.settle(1200);
  await fill('fx_profile', { party: 'Le Morne Resorts' });
  await fill('fx_profile', { purpose: 'exports' });
  await fill('fx_profile', { monthly_volume: '9500000', currency_pairs: 'EUR/MUR, USD/MUR' }, { delay: 30 });
  await wizardNext();
  await S.say('Approved products and the settlement limit', 'The limit is checked against the open forwards — the utilisation is calculated');
  await fill('fx_profile', { approved_products: ['spot', 'forward'] });
  await fill('fx_profile', { settlement_limit: '60000000' });
  await fill('fx_profile', { settlement_accounts: 'EUR account 000981 · MUR operating account 004417' }, { delay: 16 });
  await p.waitForTimeout(600);
  await save({ button: p.getByRole('button', { name: 'Create profile' }) });
  const profile = await S.waitCut(() => poll(async () => (await records('GCFX1', ids.fx_profile)).find((r) => Number(r.data?.party) === party.id), { what: 'fx profile' }));
  S.log('profile', profile.id);
  await S.say('Profile created', 'Its deals, open forwards and limit utilisation will build up here');
  await p.waitForTimeout(2500);

  // ── 2. Quote request ──
  await S.clear();
  await S.newRecord('fx_quote');
  await S.step(2, 'Quote request', 'The client calls: sell EUR 300,000 forward, in six weeks', 'FX Quotes ▸ New — client, profile, product, side, currency, amount', 2500);
  await fill('fx_quote', { party: 'Le Morne Resorts' });
  await fill('fx_quote', { fx_profile: 'Le Morne Resorts' });
  await fill('fx_quote', { product: 'forward', side: 'sells', currency_code: 'EUR' });
  await fill('fx_quote', { amount: '300000', value_date: mu(45) });
  await S.say('“Requested at” is stamped with the time of the call', 'The quote timer starts from it — best execution');
  await S.highlight(p.locator('[id="requested_at"]').first().locator('xpath=ancestor::div[1]'), 2800);
  await save();
  const quote = await S.waitCut(() => poll(async () => (await records('GCFX1', ids.fx_quote)).find((r) => Number(r.data?.party) === party.id), { what: 'quote' }));
  const qno = quote.data.quote_no;
  S.log('quote', quote.id, qno);

  await S.say('The FX quote timer: answer within 15 business minutes', 'Tools ▸ SLA Board · it counts business hours only, so a weekend request is due Monday');
  await S.go('/sla', 1500);
  const slaRow = p.locator('a').filter({ hasText: qno }).first();
  // The timer is started just after the save: reload until it is listed.
  const listed = await S.waitCut(() => poll(async () => { if (await slaRow.count()) return true; await p.reload(); await S.settle(600); return (await slaRow.count()) > 0; }, { timeout: 45000, every: 2000, what: 'SLA row' }).catch(() => false));
  if (listed) await S.highlight(slaRow, 3500);
  else { S.issue('SLA Board: FX quote timer not listed'); await p.waitForTimeout(3000); }

  // ── 3. Quoted (gate) ──
  await S.clear();
  await board('fx_quote', 'Requested');
  await S.step(3, 'Quote the rate', 'FX Quotes on the pipeline board', 'Requested ▸ Quoted ▸ Accepted / Rejected / Expired', 3000);
  await S.say('Move the quote to Quoted…', 'before entering a rate');
  await S.drag(qno, 'Requested', 'Quoted', { expectFail: true, after: 600 });
  await blocked('Blocked: a quote needs the quoted rate and the time it was given', 'No rate, no quote — the audit trail stays complete');

  await S.say('The board buys EUR at 52.64 — Deepak quotes the client 52.90', 'Enter the quoted rate and the time');
  await S.editRecord('fx_quote', quote.id);
  await fill('fx_quote', { quoted_rate: '52.90', quoted_at: muNow() });
  await save();
  await board('fx_quote', 'Requested');
  await S.drag(qno, 'Requested', 'Quoted');
  await S.say('Quoted — the first-response timer is met', 'The improvement on the board rate is calculated on the quote');
  await p.waitForTimeout(2500);

  // ── 4. Accepted (gate) ──
  await S.step(4, 'Client accepts', 'The client agrees to the rate', 'Move the quote to Accepted');
  await S.drag(qno, 'Quoted', 'Accepted', { expectFail: true, after: 600 });
  await blocked('Blocked: record when the client responded', 'The time-stamped trail: requested → quoted → client response');
  await S.editRecord('fx_quote', quote.id);
  await fill('fx_quote', { responded_at: muNow(2) });
  await save();
  await board('fx_quote', 'Quoted');
  await S.drag(qno, 'Quoted', 'Accepted');
  await S.say('Accepted: the CRM books the deal for you', 'An FX deal is created and sent to the dealing system');
  await p.waitForTimeout(2500);

  // ── 5. The deal ──
  const deal = await S.waitCut(() => poll(async () => {
    const r = (await records('GCFX1', ids.fx_deal)).find((x) => Number(x.data?.fx_quote) === quote.id);
    return r?.data?.dealing_reference ? r : null;
  }, { what: 'fx deal with dealing reference' }));
  S.log('deal', deal.id, deal.data.deal_no, deal.data.dealing_reference);
  await S.step(5, 'The FX deal', 'Forex Desk ▸ FX Deals: the deal booked from the quote', `${deal.data.deal_no} — forward, EUR 300,000 at 52.90`);
  await panel('fx_deal', deal.id, 'Dealing-system reference');
  await p.waitForTimeout(1500);
  await S.say('The dealing system\'s reference is recorded on the deal', 'Booked automatically when the deal was created');
  await showField('Dealing-system reference', 3500);
  await S.say(`Board rate 52.64 · quoted 52.90 — the client gets MUR ${Number(deal.data.improvement_vs_board ?? 78000).toLocaleString('en-GB')} more`, 'Improvement against the board rate — best-execution evidence');
  await showField('Improvement vs board (MUR)', 4000);
  await S.say('An open forward until it settles', 'Days to the value date count down; the amount counts against the profile\'s limit');
  await showField('Days to value date', 3500);

  // ── 6. Maturity reminder ──
  await S.step(6, 'Forward maturity', 'Reminders tab: the CRM reminds the dealer a week before the value date', 'Confirm settlement with the client or offer a roll-over');
  await S.tab('Reminders');
  await p.waitForTimeout(1200);
  const rem = p.getByText(`Forward maturity — ${deal.data.deal_no}`).first();
  if (await rem.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) await S.highlight(rem.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 4000);
  else { S.issue('forward maturity reminder not on the deal'); await p.waitForTimeout(3000); }
  await S.say('On that day the client is also emailed and a roll-over offered', 'The value date shows in the dealer\'s calendar feed too');
  await p.waitForTimeout(3500);

  // ── 7. Rate alert ──
  await S.clear();
  await S.newRecord('fx_rate_alert');
  await S.step(7, 'Rate alert', 'The client also wants to sell more euros if EUR/MUR rises to 53.60', 'FX Rate Alerts ▸ New — the client is told by email when the board reaches it', 2500);
  await fill('fx_rate_alert', { party: 'Le Morne Resorts' });
  await fill('fx_rate_alert', { currency_code: 'EUR', direction: 'above', target_rate: '53.60', channel: 'email', expires_on: mu(60) });
  await save();
  const alert = await S.waitCut(() => poll(async () => (await records('GCFX1', ids.fx_rate_alert)).find((r) => Number(r.data?.party) === party.id), { what: 'rate alert' }));
  S.log('alert', alert.id);
  await panel('fx_rate_alert', alert.id, 'Current board rate');
  await S.say('Active: today\'s board is 53.43 — below the target', 'Alerts are checked every hour, and whenever a new board rate is published');
  await showField('Current board rate', 3500);

  // ── 8. Daily board ──
  await S.clear();
  await S.newRecord('fx_rate');
  await S.step(8, 'Publish the board', 'Next morning\'s board: the euro is stronger', 'Masters ▸ FX Reference Rates — the dealer publishes the TT buying and selling rates', 2500);
  await fill('fx_rate', { currency_code: 'EUR', rate_to_mur: '53.65', buy_tt: '52.86', sell_tt: '54.44', rate_date: mu() });
  await S.say('The board feeds every MUR conversion, the rate alerts and the website', 'Save it…');
  await p.waitForTimeout(1500);
  await save();
  const hit = await S.waitCut(() => poll(async () => {
    const r = await api('GCFX1', 'GET', `/runtime/records/${alert.id}`);
    return r.data?.pipeline_stage?.name === 'triggered' ? r.data : null;
  }, { what: 'alert triggered' }));
  S.log('alert triggered', hit.data?.triggered_on, hit.data?.current_rate);
  await S.say('53.65 is above the client\'s 53.60 — the alert fires at once', 'The client is emailed, the alert closed as Triggered, the dealer notified');
  await p.waitForTimeout(2500);
  await panel('fx_rate_alert', alert.id, 'Triggered on');
  await showField('Triggered on', 3000);
  await S.tab('Activity');
  await p.waitForTimeout(1500);
  const mail = p.getByText(/rate alert has been reached|alerte de change/i).first();
  await S.say('The email to the client is on the alert\'s timeline', 'Sent in the client\'s language (French here) — SMS when the client prefers it');
  if (await mail.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) {
    await mail.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await p.waitForTimeout(2500);
    await S.clear(); // the timeline entry sits where the caption is
    await S.highlight(mail.locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3500);
  }
  else { S.issue('rate alert email not on the alert timeline'); await p.waitForTimeout(3000); }
  await S.say('Deepak is notified to call the client and deal', 'Notifications bell');
  await S.moveTo(p.locator('button[title=Notifications]'));
  await p.waitForTimeout(3500);
  await p.keyboard.press('Escape');

  // ── 9. Dashboard ──
  await S.step(9, 'Forex Desk dashboard', 'The Forex Desk dashboard', 'Deals, volume, spread income and open forwards');
  await S.go('/', 1500);
  const sel = p.locator('main select').first();
  await S.moveTo(sel, { click: false });
  const opt = await sel.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()]));
  const dash = opt.find(([, l]) => l === 'Forex Desk');
  if (dash) { await sel.selectOption(dash[0]); await S.settle(2500); } else S.issue('Forex Desk dashboard not in the dashboard menu for GCFX1');
  await p.waitForTimeout(3500);
  await S.scroll(450, 3000);
  await S.say('Volume by currency and by month, top clients', 'Quote outcomes and rate alerts');
  await S.scroll(450, 3000);
  await S.scroll(450, 2500);
  await S.clear();

  await S.logout();
  await p.waitForSelector('input[name=employee_id]', { timeout: 60000 }).catch(() => {});
  await S.card({
    eyebrow: 'Summary',
    title: 'Forex Desk',
    text: 'The dealer quotes and decides — the CRM keeps the trail, books and reminds.',
    bullets: [
      'FX profile: products, limits, settlement accounts',
      'Quote timer: 15 business minutes',
      'Gates: rate and time to quote, client response to accept',
      'Accepted → deal booked, reference and improvement',
      'Forwards: reminder a week before the value date',
      'New board rate → alerts reached are sent at once',
    ],
  }, 7000);
}
