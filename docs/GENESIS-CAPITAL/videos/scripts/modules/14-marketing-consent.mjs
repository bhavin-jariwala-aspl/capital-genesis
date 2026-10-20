// Marketing & Consent: a segment and a campaign, suppression when adding members, Compliance sign-off in Approvals,
// a web enquiry attributed through the campaign's tracking code, an event with attendance follow-up by the RM, a
// research subscription, and a consent withdrawal that stops marketing (user guide §9 Marketing & Consent).
import fs from 'node:fs';
import { records, poll, api, obj } from '../lib/studio.mjs';

export const title = 'Marketing & Consent';

const CAMPAIGN = 'First home 2026 — young professionals';
const SEGMENT = 'Young professionals without a home loan';
const EVENT = 'First-home buyers evening — Ebène';
const CODE = 'first-home-2026';
const GET_IN_TOUCH = '2fe40fb6f0da0570cbe29eb9f465541b5c52897826acc486';
const PROSPECT = { first: 'Kevin', last: 'Rampersad', email: 'kevin.rampersad@example.com', mobile: '57412263' };
const STATE = new URL('../.raw/14-state.json', import.meta.url);
const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);

export default async function run(S) {
  const { p } = S;
  const ids = {};
  await S.waitCut(async () => { for (const n of ['party', 'campaign', 'campaign_member', 'segment', 'marketing_event', 'event_registration', 'subscription', 'consent_record', 'enquiry', 'loan_application']) ids[n] = (await obj(n)).id; });
  // Open an edit form and wait until it shows the record's values (the page draws empty first).
  const edit = async (name, id, field) => {
    await S.editRecord(name, id);
    await S.waitCut(() => p.waitForFunction((f) => { const el = document.querySelector(`input[id="${f}"]`); return el && el.value; }, field, { timeout: 120000, polling: 300 }).catch(() => {}));
    await p.waitForTimeout(600);
  };

  // Preparation (cleanup and client picks) happens before the title card; the wait is cut from the video.
  const { X, xName, xConsent, members, complainer } = await S.waitCut(async () => {
    // ── Clean up leftovers of earlier takes (only records this video created or changed) ──
    try {
      const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
      if (st.consent) await api('GCADMIN', 'PUT', `/runtime/records/${st.consent}`, { data: { status: 'granted', withdrawn_on: null } });
    } catch { /* first take */ }
    const del = async (rows) => { for (const r of rows) await api('GCADMIN', 'DELETE', `/runtime/records/${r.id}`); };
    const oldCamps = (await records('GCADMIN', ids.campaign, { limit: 500 })).filter((r) => r.data?.name === CAMPAIGN);
    const oldEvents = (await records('GCADMIN', ids.marketing_event, { limit: 500 })).filter((r) => r.data?.name === EVENT);
    await del((await records('GCADMIN', ids.campaign_member, { limit: 2000 })).filter((r) => oldCamps.some((c) => String(c.id) === String(r.data?.campaign))));
    await del((await records('GCADMIN', ids.event_registration, { limit: 2000 })).filter((r) => oldEvents.some((c) => String(c.id) === String(r.data?.marketing_event))));
    const oldEnq = (await records('GCADMIN', ids.enquiry, { limit: 2000 })).filter((r) => r.data?.email === PROSPECT.email);
    await del(oldEnq);
    await del(oldEvents); await del(oldCamps);
    await del((await records('GCADMIN', ids.segment, { limit: 500 })).filter((r) => r.data?.name === SEGMENT));

    // ── Pick the clients ──
    const parties = (await records('GCADMIN', ids.party, { limit: 1000 })).filter((r) => r.data?.party_type === 'individual' && r.data?.primary_rm === 'GCRM1');
    const fine = (r) => r.data.marketing_consent && !r.data.do_not_contact && !(r.data.open_complaints > 0);
    const cons = await records('GCADMIN', ids.consent_record, { limit: 3000 });
    const mkConsent = (pid) => cons.filter((c) => Number(c.data?.party) === pid && c.data?.purpose === 'marketing');
    const X = parties.find((r) => r.data.display_name === 'Shamim Noël' && fine(r) && mkConsent(r.id).length === 1)
      ?? parties.find((r) => fine(r) && mkConsent(r.id).length === 1 && r.data.display_name !== 'Christelle Leclézio');
    if (!X) throw new Error('no client with a single marketing consent');
    const xName = X.data.display_name;
    const xConsent = mkConsent(X.id)[0];
    const members = parties.filter((r) => fine(r) && r.id !== X.id && r.data.display_name !== 'Christelle Leclézio').slice(0, 2).map((r) => r.data.display_name);
    const complainer = parties.find((r) => r.data.marketing_consent && !r.data.do_not_contact && r.data.open_complaints > 0)?.data.display_name;
    if (members.length < 2 || !complainer) throw new Error(`clients: ${members} / ${complainer}`);
    S.log('clients', xName, members, complainer);
    const subsX = (await records('GCADMIN', ids.subscription, { limit: 3000 })).filter((r) => Number(r.data?.party) === X.id && r.data?.topic === 'research');
    await del(subsX);
    return { X, xName, xConsent, members, complainer };
  });

  // Board with its cards loaded.
  async function board() {
    await S.openObject('campaign');
    await p.locator('button[title="Pipeline"]').first().waitFor({ timeout: 60000 });
    await S.view('Pipeline');
    await S.waitCut(() => S.column('Planning').waitFor({ timeout: 60000 }));
    await S.waitCut(() => p.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 120000, polling: 300 }).catch(() => {}));
    await p.waitForTimeout(800);
  }
  async function bell() {
    await S.moveTo(p.locator('button[title=Notifications]'));
    await p.waitForTimeout(3500);
    await p.keyboard.press('Escape');
  }
  const findCampaign = () => poll(async () => (await records('GCADMIN', ids.campaign, { limit: 500 })).find((r) => r.data?.name === CAMPAIGN), { what: 'campaign' });

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 14',
    title: 'Marketing & Consent',
    text: 'Plan campaigns, reach only clients who agreed to it, and measure what each campaign brings in.',
    bullets: ['A segment and a campaign with budget and dates', 'Suppression: who can never be added', 'Compliance sign-off in Approvals',
      'Web enquiries attributed by tracking code', 'Events, attendance and RM follow-up', 'Subscriptions, consent withdrawal, dashboard'],
    foot: 'Personas: Emilie Fanchette (Marketing) · Fatima Hossenbux (Compliance) · Priya Ramdin (RM)',
  }, 8000);

  // ── 1. Segment ──
  await S.step(1, 'Segment', 'Emilie plans a first-home campaign for young professionals', 'Growth ▸ Marketing & Consent', 3000);
  await S.login('GCMKT1', 'Marketing Executive — plans and runs campaigns');
  await S.openObject('segment', { view: 'Table' });
  await S.say('A segment describes the audience: who should hear about the offer', 'Existing segments: HNW without a mandate, FMB 2029 holders, Francophone affluent…');
  await p.waitForTimeout(2500);
  await S.newRecord('segment');
  await S.fill('segment', { name: SEGMENT, base_object: 'party', estimated_size: '120' });
  await S.fill('segment', { description: 'Individual clients aged 25 to 40 with a salary account and no home loan yet.' }, { delay: 14 });
  await S.fill('segment', { criteria: "party_type = 'individual' AND AGE(date_of_birth) <= 40 AND loan_exposure_mur = 0" }, { delay: 12 });
  await S.say('The criteria are a filter over the client master', 'Build the matching list with the same filter in Reports');
  await p.waitForTimeout(2500);
  await S.submit();

  // ── 2. Campaign ──
  await S.step(2, 'Plan the campaign', 'New campaign: objective, product, channels, audience', 'It starts in Planning');
  await S.newRecord('campaign');
  await S.fill('campaign', { name: CAMPAIGN, objective: 'acquisition', business_unit: 'LND', product_code: 'LND-RE', channels: ['email', 'social', 'web'], segment: 'Young professionals' });
  await S.say('Budget and dates — the budget is the cost ROI is measured against', 'Actual cost is entered when the invoices come in');
  await S.fill('campaign', { budget: '350000', start_date: '2026-11-01', end_date: '2026-12-31' });
  await S.say('The tracking code goes into every website link of the campaign', 'An enquiry arriving through such a link is credited to this campaign');
  await S.fill('campaign', { utm_code: CODE });
  await S.fill('campaign', { content: 'Your first home at 6.15%: Real Estate Loan with no arrangement fee until 31 December. Talk to us.' }, { delay: 12 });
  await p.waitForTimeout(1200);
  await S.submit();
  const camp = await findCampaign();

  // ── 3. Members and suppression ──
  await S.step(3, 'Add members', 'Add the clients who will receive it', 'Marketing & Consent ▸ Campaign Members ▸ New', 3000);
  for (const [k, m] of members.slice(0, 1).entries()) {
    await S.newRecord('campaign_member');
    await S.fill('campaign_member', { campaign: 'First home 2026', party: m, channel: 'email' });
    if (k === 0) { await S.say(`${m} has given marketing consent — accepted`); await p.waitForTimeout(1500); }
    await S.submit();
  }
  await S.say(`Now ${complainer}…`, 'A client with a complaint that is still open');
  await S.newRecord('campaign_member');
  await S.fill('campaign_member', { campaign: 'First home 2026', party: complainer, channel: 'email' });
  await S.submit({ expectFail: true });
  await S.say('Refused: the client is suppressed from marketing', 'No consent, “do not contact”, or an open complaint — the CRM never lets these through');
  await p.waitForTimeout(5000);
  const cancel = p.getByRole('button', { name: 'Cancel', exact: true });
  if (await cancel.count()) await S.moveTo(cancel.first());

  // ── 4. Sign-off ──
  await S.step(4, 'Send for sign-off', 'A campaign is a financial promotion', 'Compliance signs it off before it can be approved or go live', 3000);
  await board();
  await S.say('Try to approve it straight away…');
  await S.drag(CAMPAIGN, 'Planning', 'Approved', { expectFail: true });
  await S.say('Blocked: Compliance must sign it off first', 'Move it to Compliance review instead');
  await p.waitForTimeout(4000);
  await S.drag(CAMPAIGN, 'Planning', 'Compliance review');
  await S.say('Compliance review: the sign-off request is now in Compliance\'s Approvals inbox', 'Segment, budget, dates and the message must be filled before this move');
  await p.waitForTimeout(3500);
  await S.waitCut(() => poll(async () => JSON.stringify((await api('GCCOMP1', 'GET', '/runtime/workflows/approvals?scope=mine')).data ?? '').includes(`Campaign sign-off: ${CAMPAIGN}`), { what: 'sign-off request' }));

  // ── 5. Compliance ──
  await S.step(5, 'Compliance sign-off', 'Fatima checks the message and approves it', 'Tools ▸ Approvals — the requester can never approve her own campaign', 3000);
  await S.login('GCCOMP1', 'Compliance Officer — signs off marketing material');
  await S.say('The request shows the budget, the dates and the message', 'Open the record to review it, comment, then Approve or Reject');
  await S.approve(`Campaign sign-off: ${CAMPAIGN}`, 'Approved. Keep the rate footnote in the final artwork.');
  const gotIt = p.getByRole('button', { name: 'Got it' });
  if (await gotIt.count()) { await p.waitForTimeout(1200); await S.moveTo(gotIt.first()); }
  await S.waitCut(() => poll(async () => (await records('GCADMIN', ids.campaign, { limit: 500 })).find((r) => r.id === camp.id)?.pipeline_stage?.name === 'approved', { what: 'campaign approved' }));
  await S.say('Approved: the campaign moves to Approved by itself', 'Rejecting it would send it back to Planning with the comment');
  await p.waitForTimeout(3000);

  // ── 6. Live and a web enquiry ──
  await S.step(6, 'Go live', 'Emilie launches the campaign', 'She is told it was approved', 3000);
  await S.login('GCMKT1', 'Marketing Executive');
  await bell();
  await board();
  await S.drag(CAMPAIGN, 'Approved', 'Live');
  await S.say('Live: the emails and the social posts go out', 'Each member\'s sent date, opens and responses are tracked');
  await p.waitForTimeout(3000);

  await S.step(7, 'An enquiry arrives', `${PROSPECT.first} ${PROSPECT.last} clicks the campaign ad`, 'The link opens the website enquiry form with the campaign\'s tracking code', 3500);
  await S.go(`/f/${GET_IN_TOUCH}?prod=LND-RE&utm_source=facebook&utm_medium=social&utm_campaign=${CODE}`, 1500);
  const pf = async (id, value) => {
    const el = p.locator(`[id="${id}"], [id="f-${id}"]`).first();
    if ((await el.evaluate((e) => e.tagName.toLowerCase())) === 'select') { await S.moveTo(el, { click: false }); await el.selectOption(value); } else { await S.moveTo(el); await S.type(value, 38); }
    await p.waitForTimeout(200);
  };
  const prod = p.locator('[id="product_code"], [id="f-product_code"]').first();
  if (await prod.count() && !(await prod.inputValue().catch(() => ''))) await pf('product_code', 'LND-RE');
  await pf('estimated_amount', '4500000');
  await pf('message', 'Saw your first-home offer. I would like to buy an apartment in Moka.');
  await S.clickText('Continue');
  await p.waitForTimeout(900);
  await pf('first_name', PROSPECT.first); await pf('last_name', PROSPECT.last);
  await pf('email', PROSPECT.email); await pf('mobile', PROSPECT.mobile);
  await S.moveTo(p.getByText('I agree to be contacted', { exact: false }).first());
  const sub = p.waitForResponse((r) => r.url().includes('/public/forms/') && r.request().method() === 'POST', { timeout: 120000 });
  await S.clickText('Send request');
  const subR = await S.waitCut(() => sub);
  if (subR.status() >= 300) throw new Error(`public submit ${subR.status()} ${(await subR.text()).slice(0, 300)}`);
  await S.settle(1200);
  await S.say('Sent — he has a reference number and his consent to be contacted is recorded');
  await p.waitForTimeout(3000);
  const enq = await S.waitCut(() => poll(async () => (await records('GCADMIN', ids.enquiry, { limit: 2000 })).find((r) => r.data?.email === PROSPECT.email && r.data?.campaign), { what: 'attributed enquiry' }));
  S.log('enquiry', enq.id, enq.data.campaign);

  await S.openRecord('enquiry', enq.id);
  await S.waitCut(() => p.getByText(`${PROSPECT.first} ${PROSPECT.last}`).first().waitFor({ timeout: 60000 }).catch(() => {}));
  await p.waitForTimeout(800);
  await S.say('The enquiry kept the tracking code and is credited to the campaign', 'Routing and scoring work as for any enquiry — the Lending team calls him back');
  // The record page can be busy drawing for a while: wait until the caption is actually on screen (cut from the video).
  await S.waitCut(() => p.waitForFunction(() => document.getElementById('__st_cap')?.textContent.includes('kept the tracking code'), null, { timeout: 120000, polling: 250 }).catch(() => {}));
  await p.waitForTimeout(1500);
  const utm = p.getByText('UTM campaign', { exact: true }).first();
  if (await utm.count()) await S.highlight(utm.locator('xpath=..'), 3500); else await S.scroll(600, 3500);
  await S.openObject('campaign');
  const tableBtn = p.locator('button[title="Table"]').first();
  await S.waitCut(() => tableBtn.waitFor({ timeout: 60000 }).catch(() => {}));
  await S.moveTo(tableBtn); await S.settle(800);
  const row = p.locator('main tr').filter({ hasText: CAMPAIGN }).first();
  await S.waitCut(() => row.waitFor({ timeout: 60000 }));
  await S.say('Across campaigns: budget, audience, enquiries, revenue and ROI', 'Home loans Q3 earned more than it cost; a negative ROI means no revenue yet');
  await p.waitForTimeout(4500);
  await S.moveTo(row.getByText(CAMPAIGN).first());
  await S.waitCut(() => p.getByText('Attributed enquiries').first().waitFor({ timeout: 60000 }).catch(() => {}));
  await p.waitForTimeout(800);
  await S.say('Our campaign: its audience and 1 attributed enquiry', 'Loans that follow and their revenue roll up here too — that is what ROI is measured on');
  await S.scroll(350, 4500);

  // ── 8. Event ──
  await S.step(8, 'Event', 'A seminar for the campaign\'s audience', 'Events & Seminars ▸ New', 3000);
  await S.newRecord('marketing_event');
  await S.fill('marketing_event', { name: EVENT, business_unit: 'LND', campaign: 'First home 2026', event_date: today(), venue: 'Genesis Centre, Ebène', capacity: '60' });
  await S.submit();
  const ev = await poll(async () => (await records('GCADMIN', ids.marketing_event, { limit: 500 })).find((r) => r.data?.name === EVENT), { what: 'event' });
  await S.say('Guests register — from the website or added by staff', 'Event Registrations ▸ Register guest');
  for (const g of [xName]) {
    await S.newRecord('event_registration');
    await S.fill('event_registration', { marketing_event: 'First-home buyers', party: g, registered_on: today() });
    await S.submit();
  }
  const reg = await poll(async () => (await records('GCADMIN', ids.event_registration, { limit: 3000 })).find((r) => String(r.data?.marketing_event) === String(ev.id) && Number(r.data?.party) === X.id), { what: 'registration' });
  await S.say(`On the evening, ${xName} attends — tick Attended`, 'Her relationship manager is told to follow up');
  await edit('event_registration', reg.id, 'party');
  await S.fill('event_registration', { attended: true });
  await p.waitForTimeout(1200);
  await S.submit();
  await S.openRecord('marketing_event', ev.id);
  await S.say('The event counts registrations, attendance and the attendance rate');
  await p.waitForTimeout(4000);

  // ── 9. Subscription ──
  await S.step(9, 'Subscription', `At the event ${xName.split(' ')[0]} asks for the research notes`, 'Newsletter & Research Subscriptions ▸ New', 3000);
  await S.newRecord('subscription');
  await S.fill('subscription', { party: xName, topic: 'research', status: 'subscribed', subscribed_on: today(), source: 'event' });
  await S.say('Subscribers of a topic receive each publication when it is sent', '“Send to subscribers” on a research note emails them in their language');
  await p.waitForTimeout(2000);
  await S.submit();

  // ── 10. RM follow-up and withdrawal ──
  await S.step(10, 'RM follow-up', 'Priya, her RM, was notified to follow up', 'Signed in as the relationship manager', 3000);
  await S.login('GCRM1', 'Relationship Manager — follows up event guests');
  await bell();
  await S.say('She calls to thank her and records the follow-up', 'Tick “Follow-up done” on the registration');
  await edit('event_registration', reg.id, 'party');
  await S.fill('event_registration', { follow_up_done: true });
  await S.submit();
  await S.say(`On the call ${xName.split(' ')[0]} says: no more marketing, please`, 'Open her marketing consent and record the withdrawal');
  await p.waitForTimeout(3000);
  fs.writeFileSync(STATE, JSON.stringify({ consent: xConsent.id }));
  await edit('consent_record', xConsent.id, 'party');
  await S.fill('consent_record', { status: 'withdrawn', withdrawn_on: today() });
  await S.submit();
  await S.waitCut(() => poll(async () => (await records('GCADMIN', ids.party, { limit: 1000 })).find((r) => r.id === X.id)?.data?.marketing_suppressed, { what: 'suppressed' }));
  await S.openRecord('party', X.id);
  await S.say('Marketing consent: No — she is now suppressed from marketing', 'The withdrawal takes effect at once, as in the Clients tutorial');
  await S.scroll(900, 4500);

  // ── 11. Withdrawal stops marketing ──
  await S.step(11, 'Consent stops marketing', `Emilie tries to add ${xName} to the campaign`, 'Signed in as Marketing', 3000);
  await S.login('GCMKT1', 'Marketing Executive');
  await S.newRecord('campaign_member');
  await S.fill('campaign_member', { campaign: 'First home 2026', party: xName, channel: 'email' });
  await S.submit({ expectFail: true });
  await S.say('Refused — she withdrew her consent', 'Research mailings sent to subscribers skip her too');
  await p.waitForTimeout(5000);

  // ── 12. Dashboard ──
  await S.step(12, 'Marketing dashboard', 'The Marketing dashboard sums it all up', 'Live campaigns, attributed enquiries, attendance, subscribers, ROI', 2500);
  await S.go('/', 1500);
  const sel = p.locator('main select').first();
  await S.moveTo(sel, { click: false });
  const opt = await sel.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()]));
  const dash = opt.find(([, l]) => l === 'Marketing');
  if (dash) { await sel.selectOption(dash[0]); await S.settle(2500); } else S.issue('Marketing dashboard not in the dashboard menu for GCMKT1');
  await p.waitForTimeout(4000);
  await S.scroll(450, 3500);
  await S.say('ROI and attributed revenue by campaign, engagement, subscriptions by topic');
  await S.scroll(450, 3500);
  await S.scroll(450, 3000);
  await S.clear();

  await S.card({
    eyebrow: 'Summary',
    title: 'Marketing & Consent',
    text: 'Campaigns reach only clients who agreed, and every result is credited back to them.',
    bullets: ['Segments define the audience', 'Suppressed clients can never be added', 'Compliance signs off before Approved / Live',
      'Tracking codes attribute web enquiries', 'Attendees are followed up by their RM', 'A consent withdrawal takes effect at once'],
    foot: 'Next: Introducers',
  }, 7000);
}
