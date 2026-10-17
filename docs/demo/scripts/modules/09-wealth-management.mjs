// Wealth Management: a discretionary mandate from first meeting to an active portfolio (user guide §9 Wealth
// Management, process flow 09). The RM opens the mandate with the onboarding wizard, runs the investor questionnaire,
// records suitability (including an above-ceiling recommendation that needs an override and the client's
// acknowledgement) and takes the mandate through its gates; the portfolio manager activates it, records the AUM, runs a
// review to Completed and logs a SAAC decision. Ends on the Wealth dashboard.
import { records, poll, api, obj, API } from '../lib/studio.mjs';

export const title = 'Wealth Management';

const CLIENT = 'Nathalie Ramdin';   // client of Natasha Appadoo (GCRM2): KYC approved, no profile or mandate yet
const CARD = `${CLIENT} · Discretionary`;
const SAAC = 'Shorten bond duration in model portfolios B and C';
const WEB_QUESTIONNAIRE = '28480565717b521b41d7a447876c968e7bf05a847d1d47b0';

const mu = (days = 0) => new Date(Date.now() + 4 * 3600e3 + days * 86400e3).toISOString().slice(0, 10); // Mauritius date

/** Remove what an earlier take created for this client, so every take starts from the same data (lookups only). */
async function cleanup(S) {
  const ids = {};
  for (const n of ['party', 'risk_profile', 'suitability_record', 'wealth_mandate', 'mandate_review', 'aum_snapshot', 'saac_decision']) ids[n] = (await obj(n)).id;
  const party = (await records('GCADMIN', ids.party, { limit: 1000 })).find((r) => r.data?.display_name === CLIENT);
  if (!party) throw new Error(`demo client ${CLIENT} not found`);
  const del = async (r) => { const d = await api('GCADMIN', 'DELETE', `/runtime/records/${r.id}`, {}); S.log('cleanup', r.id, d.status); };
  const mandates = (await records('GCADMIN', ids.wealth_mandate, { limit: 1000 })).filter((r) => Number(r.data?.party) === party.id);
  for (const n of ['mandate_review', 'aum_snapshot']) {
    for (const r of (await records('GCADMIN', ids[n], { limit: 2000 })).filter((x) => mandates.some((m) => m.id === Number(x.data?.wealth_mandate)))) await del(r);
  }
  for (const m of mandates) await del(m);
  for (const n of ['suitability_record', 'risk_profile']) {
    for (const r of (await records('GCADMIN', ids[n], { limit: 1000 })).filter((x) => Number(x.data?.party) === party.id)) await del(r);
  }
  for (const r of (await records('GCADMIN', ids.saac_decision, { limit: 500 })).filter((x) => x.data?.title === SAAC)) await del(r);
  return { party, ids };
}

export default async function run(S) {
  const { p } = S;
  const { party, ids } = await cleanup(S);

  // ── helpers ──
  /** S.fill one field at a time, retried: a lookup search can miss while the shared backend restarts. */
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
  /** Press a submit button and wait for the save; with expectFail a refusal (server or form) is expected. */
  const save = async ({ button, expectFail = false } = {}) => {
    const btn = button || p.locator('form button[type=submit]').last();
    const resp = p.waitForResponse(isSave, { timeout: 300000 });
    await S.moveTo(btn);
    const invalid = p.locator('.form-error').first().waitFor({ state: 'visible', timeout: 300000 }).then(() => 'invalid').catch(() => null);
    const first = await S.waitCut(() => Promise.race([resp.then((r) => r), invalid]));
    if (first === 'invalid') {
      if (!expectFail) throw new Error('form validation refused the save');
      S.log('save refused by the form');
      return null;
    }
    const body = await first.json().catch(() => ({}));
    S.log('save', first.status());
    if ((first.status() < 300) === expectFail) throw new Error(`save ${first.status()} ${JSON.stringify(body).slice(0, 400)}`);
    await S.settle(900);
    return body?.data ?? body;
  };
  /** S.login, retried: a sign-in that hits a backend restart on this shared machine fails with a 500. */
  const login = async (id, why) => {
    for (let attempt = 1; ; attempt += 1) {
      try { await S.login(id, why); return; } catch (e) {
        if (attempt >= 4) throw e;
        S.log(`login retry ${attempt}: ${e.message.split('\n')[0]}`);
        await S.waitCut(async () => { await p.waitForTimeout(5000); await p.goto(`${p.url().split('/login')[0]}/login`); await p.waitForSelector('input[name=employee_id]'); });
        await p.fill('input[name=employee_id]', ''); await p.fill('input[name=password]', '');
      }
    }
  };
  const wizardNext = async () => { await S.moveTo(p.getByRole('button', { name: /^Continue/ })); await p.waitForTimeout(900); };
  /** Open an object's pipeline board and wait for its cards. */
  const board = async (name, column) => {
    await S.openObject(name, { view: 'Pipeline' });
    await S.column(column).waitFor({ timeout: 60000 });
    await S.waitCut(() => p.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 120000, polling: 300 }).catch(() => {}));
    await p.waitForTimeout(800);
  };
  const mandate = async (stage) => S.waitCut(() => poll(async () => {
    const r = (await records('GCADMIN', ids.wealth_mandate, { limit: 1000 }).catch(() => [])).find((x) => Number(x.data?.party) === party.id);
    return r && (!stage || r.pipeline_stage?.name === stage) ? r : null;
  }, { what: `mandate ${stage || ''}`, timeout: 180000 }));
  const blocked = async (text, sub, ms = 4000) => {
    await S.say(text, sub);
    const alert = p.getByRole('button', { name: 'Open record to complete' }).first().locator('xpath=..');
    if (await alert.count()) await S.highlight(alert, ms); else await p.waitForTimeout(ms);
  };

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 9',
    title: 'Wealth Management',
    text: 'Take a discretionary mandate from the first meeting to an active, reviewed portfolio — with suitability built in.',
    bullets: ['Open the mandate with the onboarding wizard', 'The investor questionnaire: model portfolio and risk ceiling', 'Suitability records — and the override rule', 'Stage gates: risk profile, KYC approved', 'Portfolio manager: AUM and a mandate review', 'SAAC decisions and the Wealth dashboard'],
    foot: 'Personas: Natasha Appadoo (Senior Relationship Manager) · Laurent Koenig (Portfolio Manager)',
  }, 8000);

  // ── 1. The mandate ──
  await S.step(1, 'Open the mandate', `${CLIENT}, an existing client, wants Genesis to manage her portfolio`, 'Natasha, her relationship manager, opens a discretionary mandate');
  await p.waitForTimeout(2500);
  await login('GCRM2', 'Senior Relationship Manager — owns the client and the mandate');
  await S.openObject('wealth_mandate', { view: 'Pipeline' });
  await S.say('Wealth Management ▸ Wealth Mandates: one card per mandate', 'Prospect ▸ Discovery ▸ Risk profiling ▸ Proposal ▸ Signed ▸ Funded ▸ Active ▸ Closed');
  await p.waitForTimeout(3500);
  await S.say('The “Wealth mandate” button opens a two-step onboarding wizard', 'Client & profile, then the terms');
  await S.moveTo(p.getByRole('button', { name: 'Wealth mandate', exact: true }));
  await S.settle(1200);
  await fill('wealth_mandate', { party: CLIENT, mandate_type: 'discretionary' });
  await S.say('No risk profile yet — she has not done the questionnaire', 'We leave it empty for now');
  await p.waitForTimeout(2500);
  await wizardNext();
  await S.say('The terms: base currency, benchmark, custodian and the portfolio manager', 'Review cycle and fees');
  await fill('wealth_mandate', { base_currency: 'USD', benchmark: '60% global equities / 40% global bonds', custodian: 'Genesis Capital Custody', portfolio_manager: 'GCPM1', review_frequency: 'quarterly' });
  await fill('wealth_mandate', { management_fee_pct: '1', performance_fee_pct: '10', minimum_fee: '25000' });
  await fill('wealth_mandate', { esg_restrictions: 'No tobacco or controversial weapons.' }, { delay: 18 });
  await p.waitForTimeout(800);
  await save({ button: p.getByRole('button', { name: 'Create mandate' }) });
  await S.say('Mandate created at Prospect', 'The agreement and the IPS are generated later from its Docs tab');
  await p.waitForTimeout(3000);
  const m0 = await mandate();
  S.log('mandate', m0.id, m0.data?.mandate_no);

  await S.step(2, 'Discovery', 'The discovery meeting is held — move the card on', 'Drag it on the board');
  await board('wealth_mandate', 'Prospect');
  await S.drag(CLIENT, 'Prospect', 'Discovery meeting');
  await S.say('Next: profile her risk', 'Move to Risk profiling and run the investor questionnaire');
  await S.drag(CLIENT, 'Discovery meeting', 'Risk profiling');

  // ── 3. Questionnaire ──
  await S.step(3, 'Investor questionnaire', 'Wealth Management ▸ Risk Profiles: every client\'s profile', 'Each client with their score and model portfolio');
  await S.openObject('risk_profile');
  await S.waitCut(() => p.locator('main table tbody tr').first().waitFor({ timeout: 90000 }).catch(() => {}));
  await p.waitForTimeout(3500);
  await S.say('“Investor Questionnaire” opens a three-step wizard', 'Done together with the client');
  await S.moveTo(p.getByRole('button', { name: 'Investor Questionnaire', exact: true }));
  await p.getByRole('button', { name: /^Continue/ }).waitFor({ timeout: 60000 });
  await S.settle(800);
  await fill('risk_profile', { party: CLIENT, profiled_on: mu(), age: '42', client_classification: 'retail' });
  await wizardNext();
  await S.say('Horizon and objectives', 'When will she need the money, what is she investing for');
  await fill('risk_profile', { time_horizon: '5_10', objective: 'balanced', liquidity_needs: 'low' });
  await wizardNext();
  await S.say('Attitude to risk and experience', 'If the portfolio fell 20% in a year, she would hold');
  await fill('risk_profile', { risk_tolerance: 'hold', knowledge: 'basic', net_worth: '18000000', esg_preference: true });
  await p.waitForTimeout(800);
  await save({ button: p.getByRole('button', { name: 'Calculate my profile' }) });
  await p.waitForTimeout(2500);
  const rp = await S.waitCut(() => poll(async () => (await records('GCADMIN', ids.risk_profile, { limit: 1000 })).find((x) => Number(x.data?.party) === party.id && x.data?.model_portfolio), { what: 'risk profile' }));
  S.log('profile', rp.id, rp.data.model_portfolio, rp.data.max_product_risk);
  await S.openRecord('risk_profile', rp.id);
  await S.say(`Scored ${rp.data.score}: model portfolio ${rp.data.model_portfolio} — ${rp.data.risk_profile_label}`, `Highest suitable product risk ${rp.data.max_product_risk} on a 1–5 scale · valid two years, until ${rp.data.valid_until?.slice(0, 10)}`);
  await p.waitForTimeout(5500);
  await S.scroll(300, 2500);
  await S.say('Prospects can take the same questionnaire on the website', 'They see their profile at once, and a Wealth enquiry is created for an adviser');
  await S.go(`/f/${WEB_QUESTIONNAIRE}`, 1200);
  await p.waitForTimeout(4000);

  // ── 4. Suitability ──
  await S.step(4, 'Suitability', 'Every recommendation is recorded with its rationale and the risks disclosed', 'Wealth Management ▸ Suitability Records ▸ New');
  await S.newRecord('suitability_record');
  await fill('suitability_record', { party: CLIENT, risk_profile: CLIENT, business_unit: 'WLT', product_code: 'WLT-DPM' });
  await fill('suitability_record', {
    rationale: 'Balanced discretionary portfolio matches her 5–10 year horizon and balanced objective.',
    risks_disclosed: 'Market risk, currency risk on USD assets, no capital guarantee.',
  }, { delay: 10 });
  await S.say(`Discretionary management is rated risk 3 — within her ceiling of ${rp.data.max_product_risk}`, 'It saves straight away');
  await save();
  await p.waitForTimeout(2000);

  await S.say('She also asks about the Emerging Markets Equity Fund', 'Rated risk 5 — above her ceiling');
  await S.newRecord('suitability_record');
  await fill('suitability_record', { party: CLIENT, risk_profile: CLIENT, business_unit: 'FND', product_code: 'FND-EME' });
  await fill('suitability_record', {
    rationale: 'Client wants a small satellite allocation to emerging-market equities.',
    risks_disclosed: 'High volatility, emerging-market and currency risk; losses can be large.',
  }, { delay: 10 });
  await save({ expectFail: true });
  const err = p.getByText(/Product risk exceeds the client/).first();
  await S.say('Refused: the product is riskier than her profile allows', 'Above the ceiling, an override reason and the client\'s signed acknowledgement are required');
  if (await err.count()) await S.highlight(err, 4000); else { S.issue('Suitability override message not visible on the form'); await p.waitForTimeout(4000); }
  await fill('suitability_record', { override_reason: 'Client insists on a satellite allocation capped at 5% of the portfolio; higher risk explained in writing.' }, { delay: 10 });
  await fill('suitability_record', { client_acknowledged: true });
  await S.say('Override reason recorded and the client\'s acknowledgement ticked', 'Now the recommendation can be saved — flagged as a mismatch');
  await save();
  await p.waitForTimeout(2500);

  // ── 5. Gates ──
  await S.step(5, 'Proposal gate', 'Back to the mandate: prepare the proposal (IPS)', 'Move it to Proposal');
  await board('wealth_mandate', 'Risk profiling');
  await S.drag(CLIENT, 'Risk profiling', 'Proposal (IPS)', { expectFail: true, after: 800 });
  await blocked('Blocked: a proposal needs the client\'s risk profile on the mandate', 'Open the record to complete it');
  await S.clickText('Open record to complete');
  await S.settle(1000);
  await fill('wealth_mandate', { risk_profile: CLIENT });
  await S.say('Link the risk profile she just completed', `The mandate takes its model portfolio from it: ${rp.data.model_portfolio}`);
  await p.waitForTimeout(1500);
  await save();
  await board('wealth_mandate', 'Risk profiling');
  await S.drag(CLIENT, 'Risk profiling', 'Proposal (IPS)');
  await S.say('The IPS is agreed and the mandate signed', 'Agreement and IPS are signed electronically from the Docs tab');
  await S.drag(CLIENT, 'Proposal (IPS)', 'Mandate signed');

  await S.step(6, 'Funding gate', 'The client transfers her assets — Account funded', 'Funding is allowed only once the client\'s KYC is approved');
  await S.drag(CLIENT, 'Mandate signed', 'Account funded');
  await S.say(`${CLIENT}'s KYC is approved, so the move goes through`, 'For a client whose KYC is still in progress, the board refuses: “Fund the account only after KYC approval.”');
  await p.waitForTimeout(5000);

  // ── 7. Portfolio manager ──
  await S.step(7, 'Portfolio manager', 'Laurent, the portfolio manager, takes over', 'He runs the portfolio from here');
  await login('GCPM1', 'Portfolio Manager — manages the mandate and its reviews');
  await board('wealth_mandate', 'Account funded');
  await S.say('Investments are in place: the mandate becomes Active');
  await S.drag(CLIENT, 'Account funded', 'Active');
  const mA = await mandate('active');
  const MNO = mA.data.mandate_no;

  await S.step(8, 'AUM snapshot', 'Each month-end the portfolio system sends an AUM snapshot', 'Market value by asset class, performance and net flows');
  await S.newRecord('aum_snapshot');
  await fill('aum_snapshot', { wealth_mandate: CLIENT, as_of: mu() });
  await fill('aum_snapshot', { market_value: '2500000', equities: '1300000', bonds: '900000', cash: '150000', alternatives: '150000', net_flows: '2500000' });
  await fill('aum_snapshot', { mtd_return_pct: '0.4', ytd_return_pct: '0.4', since_inception_pct: '0.4' });
  await S.say('Amounts are in the mandate\'s base currency — US dollars here', 'Snapshots feed the mandate\'s performance and the net flows on the Wealth dashboard');
  await S.highlight(p.locator('[id="market_value"]').first().locator('xpath=ancestor::div[contains(@class,"relative") or contains(@class,"flex")][1]'), 2500);
  await p.waitForTimeout(1500);
  await save();
  await S.say('The mandate\'s AUM is updated from the same feed', 'It rolls up to the client\'s Client 360');
  await S.editRecord('wealth_mandate', mA.id);
  await fill('wealth_mandate', { aum: '2500000', aum_as_of: mu() });
  await save();
  await S.openRecord('wealth_mandate', mA.id);
  await S.say(`Mandate ${MNO}: model portfolio, AUM in USD and MUR, YTD performance, next review`, 'Attrition risk is watched daily: falling AUM, missed reviews or a complaint');
  await p.waitForTimeout(5000);
  await S.scroll(350, 2500);

  // ── 9. Review ──
  await S.step(9, 'Mandate review', 'Reviews follow the mandate\'s cycle — here quarterly', '14 days before one is due, the system opens it at Scheduled; here Laurent opens one now');
  await S.newRecord('mandate_review');
  await fill('mandate_review', { wealth_mandate: CLIENT, review_type: 'quarterly', due_date: mu(10) });
  await save();
  await board('mandate_review', 'Scheduled');
  await S.say('Scheduled ▸ Pack prepared ▸ Meeting held ▸ Completed', 'The pack is ready: the client is invited to the meeting');
  await S.drag(MNO, 'Scheduled', 'Pack prepared');
  await S.say('The meeting took place — move to Meeting held');
  await S.drag(MNO, 'Pack prepared', 'Meeting held', { expectFail: true, after: 800 });
  await blocked('Blocked: Meeting held needs the date it was held', 'Open the record to complete it');
  await S.clickText('Open record to complete');
  await S.settle(1000);
  await fill('mandate_review', { held_on: mu() });
  await save();
  await board('mandate_review', 'Pack prepared');
  await S.drag(MNO, 'Pack prepared', 'Meeting held');
  const rv = await S.waitCut(() => poll(async () => (await records('GCPM1', ids.mandate_review, { limit: 2000 })).find((x) => Number(x.data?.wealth_mandate) === mA.id), { what: 'review' }));

  await S.say('Record the outcome and the minutes', 'Completed needs both — and the client\'s suitability re-confirmed');
  await S.editRecord('mandate_review', rv.id);
  await fill('mandate_review', { outcome: 'no_change' });
  await fill('mandate_review', { minutes: 'Reviewed the first weeks against the benchmark. Allocation in line with model portfolio C. Objectives and horizon unchanged.' }, { delay: 8 });
  await save();
  await board('mandate_review', 'Meeting held');
  await S.drag(MNO, 'Meeting held', 'Completed', { expectFail: true, after: 800 });
  await blocked('Blocked: re-confirm the client\'s profile and suitability before closing the review', 'A rule on the Completed stage');
  await S.editRecord('mandate_review', rv.id);
  await fill('mandate_review', { suitability_confirmed: true });
  await S.say('Profile and suitability re-confirmed with the client');
  await p.waitForTimeout(1200);
  await save();
  await board('mandate_review', 'Meeting held');
  await S.drag(MNO, 'Meeting held', 'Completed');
  await S.say('Review completed — the next one is due in three months', 'Overdue reviews show on the Wealth dashboard and the RM workbench');
  await p.waitForTimeout(3000);

  // ── 10. SAAC ──
  await S.step(10, 'SAAC decision', 'The Strategic Asset Allocation Committee changes the house view', 'Wealth Management ▸ SAAC Decisions ▸ New');
  await S.newRecord('saac_decision');
  await fill('saac_decision', { title: SAAC, meeting_date: mu(), affected_models: 'C' });
  await fill('saac_decision', {
    rationale: 'Rate cuts are largely priced in; reduce interest-rate sensitivity.',
    allocation_change: 'Bonds: move 10% from 7–10 year to 1–3 year maturities; equity weights unchanged.',
  }, { delay: 8 });
  await save();
  await S.say('Saved — every portfolio manager is notified to brief the clients in the affected models');
  await S.waitCut(() => p.waitForTimeout(3000));
  await S.moveTo(p.locator('button[title=Notifications]'));
  await p.waitForTimeout(4000);
  await p.keyboard.press('Escape');

  // ── 11. Dashboard ──
  await S.step(11, 'Wealth dashboard', 'The Wealth dashboard', 'Active mandates, AUM, overdue reviews, attrition risk');
  await S.go('/', 1500);
  const sel = p.locator('main select').first();
  await S.moveTo(sel, { click: false });
  const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()]));
  const hit = opts.find(([, l]) => l === 'Wealth');
  if (hit) { await sel.selectOption(hit[0]); await S.settle(2500); } else S.issue('Wealth dashboard not in the dashboard menu for GCPM1');
  await p.waitForTimeout(4000);
  await S.scroll(450, 3000);
  await S.say('AUM by model portfolio, the mandate pipeline and net flows by month', 'Each widget opens the records behind it');
  await S.scroll(450, 3500);
  await S.say('Reviews by status, suitability mismatches that were overridden, profiles by model');
  await S.scroll(450, 3500);
  await S.clear();

  await S.card({
    eyebrow: 'Summary',
    title: 'Wealth Management',
    text: 'Suitability and the regulator\'s controls are built into every step.',
    bullets: ['Onboarding wizard opens the mandate', 'Questionnaire → model portfolio A–E and a ceiling', 'Above the ceiling: override + acknowledgement', 'Proposal needs a profile; funding needs KYC', 'AUM snapshots and reviews with gates', 'SAAC decisions brief the portfolio managers'],
    foot: 'Next: Investment Funds',
  }, 7000);
  void API;
}
