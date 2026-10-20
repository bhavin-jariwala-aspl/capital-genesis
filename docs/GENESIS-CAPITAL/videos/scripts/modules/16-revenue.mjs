// Revenue (user guide §9 "Revenue", process flow 16): an FX deal posts its spread income to the ledger automatically;
// the Head of BD posts a loan arrangement fee by hand with split credit for the referring RM, reconciles it to the
// finance figure, filters the ledger and exports it; the COO reads revenue on the Group Executive dashboard and the
// RM League Table.
import { API, api, obj, poll as poll0, records, dashboardId } from '../lib/studio.mjs';

export const title = 'Revenue Ledger';

// A lookup that fails while the backend restarts (other agents' changes reload it) is retried, not fatal.
const poll = (fn, o) => poll0(async () => { try { return await fn(); } catch (e) { console.log('lookup retry:', e.message); return null; } }, { timeout: 300000, ...o });
const mu = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10); // Mauritius date

const FX_CLIENT = 'Rodrigues Seafood Exports Ltd';
const FEE_CLIENT = 'Moka Textiles Ltd';
const FEE = 425000;

export default async function run(S) {
  const { p } = S;
  const [revObj, dealObj, rateObj] = await S.waitCut(() => Promise.all(['revenue_entry', 'fx_deal', 'fx_rate'].map(obj)));
  const period = mu().slice(0, 7);
  // Today's USD mid rate: the exporter sells dollars a quarter of a rupee under it.
  const usd = (await records('GCFX1', rateObj.id, { limit: 50 })).filter((r) => r.data.currency_code === 'USD')
    .sort((a, b) => String(b.data.rate_date).localeCompare(String(a.data.rate_date)))[0];
  const mid = Number(usd?.data?.rate_to_mur ?? 47.855);
  const dealRate = (Math.round((mid - 0.25) * 100) / 100).toFixed(2);
  S.log('USD mid', mid, 'deal rate', dealRate);

  // Leftovers from earlier takes: today's USD 50,000 deals for the FX client and the lines they posted.
  const oldDeals = (await records('GCFX1', dealObj.id, { limit: 500 })).filter((x) => x.labels?.party === FX_CLIENT && Number(x.data?.amount) === 50000 && Date.parse(x.created_at) > Date.now() - 2 * 86400e3);
  for (const r of (await records('GCADMIN', revObj.id, { limit: 1000 })).filter((x) => oldDeals.some((d) => String(d.id) === String(x.data?.fx_deal)))) await api('GCADMIN', 'DELETE', `/runtime/records/${r.id}`);
  for (const d of oldDeals) await api('GCADMIN', 'DELETE', `/runtime/records/${d.id}`);
  // Leftovers from a failed take: earlier arrangement-fee lines for the same client this month.
  for (const r of (await records('GCADMIN', revObj.id, { limit: 1000 })).filter((x) => x.labels?.party === FEE_CLIENT && x.data?.revenue_type === 'arrangement_fee' && x.data?.period === period)) {
    await api('GCADMIN', 'DELETE', `/runtime/records/${r.id}`);
  }

  // ── Small UI helpers ───────────────────────────────────────────────────────────────────────────────────────────
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
  const showField = async (label, ms = 2600) => {
    const l = p.getByText(label, { exact: true }).locator('visible=true').first();
    await l.scrollIntoViewIfNeeded().catch(() => {});
    await S.highlight(l.locator('xpath=..'), ms);
  };
  const ledger = async () => {
    await S.waitCut(async () => {
      await S.openObject('revenue_entry');
      await p.waitForFunction(() => /\d+ records?/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 180000, polling: 300 });
    });
    await S.settle(900);
  };
  const search = async (text) => {
    const box = p.locator('main input[placeholder="Search…"]').first();
    await S.moveTo(box);
    await p.keyboard.press('Meta+A'); await p.keyboard.press('Backspace');
    await S.type(text, 70);
    await p.waitForTimeout(900);
  };
  // The ledger is wider than the screen: slide it to show the right-hand columns, then back.
  const slideTable = async (ms = 3200) => {
    const box = p.locator('main table').first().locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]');
    await S.moveTo(p.locator('main table').first(), { click: false, dy: 0.3 });
    await box.evaluate((e) => e.scrollTo({ left: e.scrollWidth, behavior: 'smooth' }));
    await p.waitForTimeout(ms);
    await box.evaluate((e) => e.scrollTo({ left: 0, behavior: 'smooth' }));
    await p.waitForTimeout(900);
  };
  const editFromPanel = async () => {
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await S.moveTo(p.getByRole('button', { name: 'Edit', exact: true }).first());
    await S.waitCut(() => p.locator('form button[type=submit]').last().waitFor({ timeout: 120000 }));
    await S.settle(800);
  };

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 16',
    title: 'Revenue Ledger',
    text: 'One ledger of the revenue every Genesis entity earns: credited to the RM and any referrer, and reconciled to the finance figures.',
    bullets: ['Revenue posted automatically from an FX deal', 'Posting a fee by hand', 'Split credit: RM and referring RM', 'Reconciliation to the finance figure',
      'Filtering the ledger and exporting it', 'Group Executive and RM League Table'],
    foot: 'Personas: Deepak Mungur (Forex dealer) · Shalini Ramtohul (Head of BD) · Anjali Gopee (COO)',
  }, 8000);

  // ── 1. Automatic posting ──
  await S.step(1, 'Revenue from the source', 'Most revenue lines are posted by the business that earns them', 'An FX deal, a paid advisory fee invoice…', 3200);
  await S.login('GCFX1', 'Forex dealer — books client deals');
  await S.waitCut(() => S.newRecord('fx_deal'));
  await p.locator('[id="party"]').first().waitFor({ timeout: 60000 });
  await S.say(`${FX_CLIENT} sells USD 50,000 of export proceeds`, `Booked at ${dealRate} — a quarter of a rupee under today's mid rate`);
  await S.fill('fx_deal', { party: FX_CLIENT, product: 'spot', side: 'sells', currency_code: 'USD' });
  await S.fill('fx_deal', { amount: '50000', deal_rate: dealRate, trade_date: mu(), value_date: mu(), purpose_code: 'EXP' });
  await p.waitForTimeout(800);
  const deal = await submit();
  const dealId = deal?.id ?? (await poll(async () => (await records('GCFX1', dealObj.id, { limit: 50 })).filter((r) => r.labels?.party === FX_CLIENT).sort((a, b) => b.id - a.id)[0], { what: 'deal' })).id;
  await S.say('Saved: the deal works out its spread over the mid rate', 'That spread is the desk\'s income — and it is posted to the Revenue Ledger');
  const auto = await S.waitCut(() => poll(async () => (await records('GCBDH', revObj.id, { limit: 50 })).find((r) => String(r.data?.fx_deal) === String(dealId)), { what: 'revenue line from the deal' }));
  await openPanel('fx_deal', dealId, 'Spread income (MUR)');
  await showField('Mid rate', 2400);
  await showField('Spread income (MUR)', 3400);

  // ── 2. The ledger ──
  await S.step(2, 'The Revenue Ledger', 'Growth ▸ Revenue: every fee and income line, by entity, type and month', 'Finance and the Head of BD post and reconcile it', 3200);
  await S.login('GCBDH', 'Head of BD — posts and reconciles revenue');
  await ledger();
  await S.say('One line per client, product and month — with its source and reconciliation status', 'Monthly summaries come from the loan system, the funds and the brokerage');
  await S.highlight(p.locator('main table').first(), 2600);
  await S.say('Further right: the amount in rupees, the source and the reconciliation status', 'Every column can be sorted');
  await slideTable(3800);
  await S.say('The line the dealer\'s deal just posted', 'Source: FX deal (automatic)');
  await openPanel('revenue_entry', auto.id, 'Source');
  await showField('Client', 2200);
  await showField('Type', 2200);
  await showField('RM credited', 2600);
  await showField('Source', 2600);
  await showField('FX deal', 3000);

  // ── 3. Manual posting with split credit ──
  await S.step(3, 'Post a fee', `A commercial facility for ${FEE_CLIENT} has been arranged`, 'The arrangement fee is posted by hand: Revenue ▸ New Revenue', 3200);
  await S.waitCut(() => S.newRecord('revenue_entry'));
  await p.locator('[id="party"]').first().waitFor({ timeout: 60000 });
  await S.fill('revenue_entry', { party: FEE_CLIENT, business_unit: 'LND', product_code: 'LND-COM', revenue_type: 'arrangement_fee' });
  await S.fill('revenue_entry', { amount: String(FEE), currency_code: 'MUR', period, booked_on: mu() });
  await S.say('Bruno Chan manages the client; Priya Ramdin referred the deal', 'Credit is split: 25% to the referring RM');
  await S.fill('revenue_entry', { rm: 'GCRM3', referrer_rm: 'GCRM1', referrer_split_pct: '25' }, { delay: 60 });
  await p.waitForTimeout(1200);
  const fee = await submit();
  const feeId = fee?.id ?? (await poll(async () => (await records('GCBDH', revObj.id, { limit: 50 })).find((r) => r.labels?.party === FEE_CLIENT && r.data?.period === period), { what: 'fee line' })).id;
  await openPanel('revenue_entry', feeId, 'RM credit (MUR)');
  await S.say('The fee is converted to rupees and the credit split automatically', 'MUR 318,750 to Bruno Chan · MUR 106,250 to Priya Ramdin');
  await showField('RM credited', 2200);
  await showField('Referrer RM (split credit)', 2400);
  await showField('RM credit (MUR)', 2600);
  await showField('Referrer credit (MUR)', 2800);
  await showField('Source', 2200);

  // ── 4. Reconciliation ──
  await S.step(4, 'Reconcile', 'Month end: enter the figure booked in the accounting system', 'Reconciliation: Awaiting finance figure', 3000);
  await showField('Reconciliation', 2400);
  await editFromPanel();
  await S.fill('revenue_entry', { finance_amount: '420000' }, { delay: 60 });
  await submit();
  await openPanel('revenue_entry', feeId, 'Variance vs finance');
  await S.say('Accounting booked MUR 420,000 — a variance of MUR 5,000', 'Reconciliation: Variance to investigate');
  await showField('Variance vs finance', 2600);
  await showField('Reconciliation', 3000);
  await S.say('Finance finds the missing MUR 5,000 posting and corrects its figure', 'Edit the line again');
  await p.waitForTimeout(2800);
  await editFromPanel();
  await S.fill('revenue_entry', { finance_amount: String(FEE) }, { delay: 60 });
  await submit();
  await openPanel('revenue_entry', feeId, 'Reconciliation');
  await S.say('Ledger and accounts agree', 'Reconciliation: Reconciled');
  await showField('Reconciliation', 3200);

  // ── 5. Filter and export ──
  await S.step(5, 'Filter and export', 'Narrow the ledger by entity, type and month', 'Type any words from the columns — every word must match', 3200);
  await ledger();
  await search(`Lending arrangement ${period}`);
  await S.say(`Lending · arrangement fees · ${period}`, 'The count shows how many lines match');
  await S.highlight(p.locator('main table').first(), 2400);
  await slideTable(3000);
  await search(`Forex ${period}`);
  await S.say(`Forex · ${period}: the desk's monthly summary and the deals posted automatically`, 'Entity names, revenue types and months all work');
  await S.highlight(p.locator('main table').first(), 2400);
  await slideTable(3000);
  await S.say('Export gives the lines shown as a spreadsheet', 'For incentive calculations — with names and labels, not codes');
  const dl = p.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await S.moveTo(p.locator('button[title^="Export"]').first());
  const file = await S.waitCut(() => dl);
  if (file) {
    const csv = await file.path().then((f) => import('node:fs').then((fs) => fs.readFileSync(f, 'utf8'))).catch(() => '');
    S.log('csv lines', csv.split('\r\n').length - 1, csv.split('\r\n')[0].slice(0, 200));
    const shown = Number((await p.locator('main').innerText()).match(/(\d+) of \d+ records match/)?.[1]);
    if (csv.split('\r\n').length - 1 !== shown || !/FX spread income/.test(csv)) S.issue(`export did not follow the filter (${shown} shown): ${csv.slice(0, 300)}`);
  } else S.issue('no CSV download');
  await p.waitForTimeout(2000);

  // ── 6. Dashboards ──
  await S.step(6, 'Where revenue shows', 'The ledger feeds the management dashboards', 'Group Executive and RM League Table', 3000);
  await S.login('GCCOO', 'Chief Operating Officer — reads group revenue');
  const toWidget = async (title) => {
    const w = p.getByText(title, { exact: true }).first();
    await w.waitFor({ timeout: 120000 });
    await w.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    await p.waitForTimeout(1200);
    await p.mouse.wheel(0, -90);
    await p.waitForTimeout(900);
    return w;
  };
  const groupExec = await S.waitCut(() => dashboardId('genesis_group_executive'));
  await S.waitCut(() => S.go(`/?dashboard=${groupExec}`, 1500));
  await toWidget('Revenue by entity (MUR, 12 months)');
  await S.say('Group Executive: revenue by entity and by month', 'Lending leads; Forex includes today\'s deal');
  await S.highlight(p.getByText('Revenue by entity (MUR, 12 months)', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3200);
  await S.highlight(p.getByText('Revenue by month (MUR)', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3200);
  await S.say('Next: the RM League Table', 'Pick it from the dashboard menu');
  // Switch dashboards with the picker, as a user does.
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await p.waitForTimeout(900);
  const picker = p.locator('select:has(option:text-is("RM League Table"))').first();
  await S.moveTo(picker, { click: false });
  await picker.selectOption({ label: 'RM League Table' });
  await S.settle(1500);
  await toWidget('Revenue credited by RM (MUR)');
  await S.say('RM League Table: the revenue each RM is credited with', 'Referring RMs get their split in the next chart');
  await S.highlight(p.getByText('Revenue credited by RM (MUR)', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3200);
  await S.highlight(p.getByText('Referral credit by referring RM (MUR)', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3400);

  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 16',
    title: 'Summary',
    text: 'Revenue is posted where it is earned, credited fairly and reconciled before anyone reports on it.',
    bullets: ['FX deals and paid fee invoices post their revenue', 'Manual lines: client, entity, type, month', 'RM and referrer credit split automatically',
      'Finance figure → Reconciled or Variance', 'Search by entity, type and month; export', 'Group Executive and RM League Table'],
    foot: 'Next: Tutorial 17 — Service Requests & Complaints',
  }, 7000);
}
