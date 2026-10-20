// Clients (Client 360): new individual client with household, address, consent and spouse; a client relationship
// through its lifecycle up to the KYC gate; the Client 360 of an established client; personal-data masking and the
// audited reveal by Compliance; consent withdrawal.
import { api, records, obj, API } from '../lib/studio.mjs';

export const title = 'Clients — Client 360';

const NEW = { first: 'Kavya', last: 'Beeharry' };
const FULL = `${NEW.first} ${NEW.last}`;
const SPOUSE = 'Rohan Beeharry';      // existing client of Priya Ramdin (GCRM1)
const HOUSEHOLD = 'Beeharry household';
const SHOWCASE = 'Christelle Leclézio'; // established client of GCRM1 with holdings, NBAs, KYC, consents…
const CALL = 'Portfolio review call — FMB 2029 maturity';
const today = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10); // Mauritius date

/** Remove what an earlier take of this video created, so every take starts from the same data (lookups only). */
async function cleanup(S) {
  const ids = {};
  for (const n of ['party', 'client_group', 'client_relationship', 'party_relationship', 'contact_point', 'consent_record']) ids[n] = (await obj(n)).id;
  const parties = (await records('GCRM1', ids.party, { limit: 500 })).filter((r) => r.data?.first_name === NEW.first && r.data?.last_name === NEW.last);
  for (const pty of parties) {
    for (const [n, f] of [['client_relationship', 'party'], ['party_relationship', 'from_party'], ['contact_point', 'party'], ['consent_record', 'party']]) {
      for (const r of (await records('GCRM1', ids[n], { limit: 500 })).filter((x) => Number(x.data?.[f]) === pty.id)) await api('GCRM1', 'DELETE', `/runtime/records/${r.id}`, {});
    }
    await api('GCRM1', 'DELETE', `/runtime/records/${pty.id}`, {});
  }
  for (const g of (await records('GCRM1', ids.client_group, { limit: 500 })).filter((r) => r.data?.name === HOUSEHOLD)) await api('GCRM1', 'DELETE', `/runtime/records/${g.id}`, {});
  // The call each take logs on the showcase client.
  const showcase = (await records('GCRM1', ids.party, { limit: 500 })).find((r) => r.data?.display_name === SHOWCASE);
  if (showcase) {
    const acts = (await api('GCRM1', 'GET', `/activities?record_id=${showcase.id}`)).data;
    for (const a of (Array.isArray(acts) ? acts : acts?.items ?? [])) if (a.subject === CALL) await api('GCRM1', 'DELETE', `/activities/${a.id}`, {});
  }
  S.log('cleanup: removed', parties.length, 'earlier take(s)');
}

/**
 * S.fill, one field at a time, retried: on this shared, busy dev machine a lookup search sometimes fails while the
 * backend restarts (another change was saved) and the picker shows "No matches" — typing again then finds it.
 */
async function fill(S, objectName, values) {
  for (const [k, v] of Object.entries(values)) {
    for (let attempt = 1; ; attempt += 1) {
      try { await S.fill(objectName, { [k]: v }); break; } catch (e) {
        if (attempt >= 3) throw e;
        S.log(`fill ${k} retry ${attempt}: ${e.message.split('\n')[0]}`);
        await S.p.waitForTimeout(3000);
      }
    }
  }
}

/**
 * S.submit with a longer wait: saving a client recalculates its Client 360 figures (and its household's), which on
 * this shared, heavily loaded machine can take longer than the toolkit's 60 s. The wait is cut from the video.
 */
async function submit(S) {
  const { p } = S;
  const btn = p.locator('form button[type=submit]').last();
  const isSave = (r) => /\/runtime\/records(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT', 'PATCH'].includes(r.method());
  for (let attempt = 1; ; attempt += 1) {
    // A save cut off by a backend restart (other changes being saved on this dev machine) fails without a response:
    // wait for the server to come back and press the button again — the form is still on screen.
    const outcome = Promise.race([
      p.waitForResponse((r) => isSave(r.request()), { timeout: 300000 }).then((r) => ({ r })),
      p.waitForEvent('requestfailed', { predicate: isSave, timeout: 300000 }).then(() => ({ failed: true })),
    ]);
    if (attempt === 1) await S.moveTo(btn); else await btn.click();
    const o = await S.waitCut(() => outcome);
    if (o.failed) {
      if (attempt >= 3) throw new Error('save request failed 3 times');
      S.log('save request failed — retrying');
      await S.waitCut(async () => { for (;;) { try { const h = await fetch(`${API}/health`); if (h.status < 500) return; } catch { /* down */ } await new Promise((res) => setTimeout(res, 2000)); } });
      await p.waitForTimeout(1500);
      continue;
    }
    const body = await o.r.json().catch(() => ({}));
    S.log('save', o.r.status());
    if (o.r.status() >= 300) throw new Error(`save ${o.r.status()} ${JSON.stringify(body).slice(0, 400)}`);
    await S.settle(900);
    return body?.data ?? body;
  }
}

/** Navigation that survives a backend restart mid-load ("Module not found" / error page): wait, then load again. */
async function nav(S, fn) {
  for (let attempt = 1; ; attempt += 1) {
    const r = await fn();
    const broken = S.p.getByText(/^(Module not found\.?|Something went wrong)$/).first();
    if (!(await broken.isVisible().catch(() => false)) || attempt >= 4) return r;
    S.log('page did not load — retrying');
    await S.waitCut(() => S.p.waitForTimeout(8000));
  }
}

const section = (p, heading) => p.locator('h3', { hasText: heading }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]');

export default async function run(S) {
  const { p } = S;
  await cleanup(S);
  const spouse = (await records('GCRM1', (await obj('party')).id, { limit: 500 })).find((r) => r.data?.display_name === SPOUSE);
  const showcase = (await records('GCRM1', (await obj('party')).id, { limit: 500 })).find((r) => r.data?.display_name === SHOWCASE);
  if (!spouse || !showcase) throw new Error('demo clients not found');

  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 2',
    title: 'Clients — Client 360',
    text: 'One golden record per client, shared by every Genesis entity — and everything Genesis does with that client in one place.',
    bullets: ['Create a new client', 'Household, address, consent and spouse', 'Open a relationship with an entity', 'The KYC gate on an active relationship', 'Client 360 figures and the Related tab', 'Masked personal data and the audited reveal'],
    foot: 'Personas: Priya Ramdin (Relationship Manager) · Fatima Hossenbux (Compliance Officer)',
  }, 8000);

  // ── 1. Sign in ──
  await S.step(1, 'Sign in', 'Priya, a relationship manager, meets a new client at the branch', 'Kavya Beeharry, the wife of an existing client, wants to invest with Genesis Wealth');
  await p.waitForTimeout(2500);
  await S.login('GCRM1', 'Relationship manager — she owns the client and the relationship');

  // ── 2. Household ──
  await S.step(2, 'Household', 'First, a household for the family', 'Clients ▸ Households & Groups ▸ New — the family’s value is added up here');
  await nav(S, () => S.newRecord('client_group'));
  await p.waitForTimeout(1200);
  await fill(S, 'client_group', { name: HOUSEHOLD, group_type: 'household', primary_rm: 'GCRM1' });
  await S.say('A household or corporate group adds up its members’ relationship value', 'Members join it from their own client record · a corporate group also has a lending limit');
  await p.waitForTimeout(2500);
  const group = await submit(S);
  S.log('household', group?.id);

  // ── 3. New client ──
  await S.step(3, 'New client', 'Now the client herself: Clients ▸ Parties ▸ New', 'One party per person or company — every entity of the group shares it');
  await nav(S, () => S.newRecord('party'));
  await p.waitForTimeout(1500);
  await S.say('Identity: the form shows the individual fields for a person', 'Choose Organisation instead and it asks for the legal name, BRN and sector');
  await fill(S, 'party', { segment: 'affluent', salutation: 'mrs', first_name: NEW.first, last_name: NEW.last, date_of_birth: '1994-04-12', gender: 'female', nationality: 'MU' });
  await S.say('The ID number is personal data: it is stored encrypted and shown masked', 'Clients must be at least 18 — the date of birth is checked when you save');
  await fill(S, 'party', { id_type: 'nic', id_number: 'B1204941234567', id_expiry_date: '2031-04-11', occupation: 'Financial analyst', employer: 'Ebène Fintech Ventures Ltd', income_band: '1_2m_3m' });
  await S.say('Contact details, preferred language and channel', 'Put her in the household you just created');
  await fill(S, 'party', { email: 'kavya.beeharry@example.com', mobile: '+230 5791 2345', preferred_channel: 'email', address: '12 Avenue des Manguiers, Quatre Bornes', client_group: HOUSEHOLD, primary_rm: 'GCRM1' });
  await p.waitForTimeout(1200);
  const party = await submit(S);
  if (!party?.id) throw new Error('party not created');
  S.log('party', party.id);

  // ── 4. Address, consent, spouse ──
  await S.step(4, 'Address & phone', 'A client can have several addresses and phones', 'Clients ▸ Addresses & Phones ▸ New — mark one as verified and preferred');
  await nav(S, () => S.newRecord('contact_point'));
  await p.waitForTimeout(1000);
  await fill(S, 'contact_point', { party: FULL, point_type: 'correspondence', value: 'PO Box 412, Quatre Bornes', verified: true, verified_on: today, preferred: true });
  await p.waitForTimeout(1000);
  await submit(S);

  await S.step(5, 'Consent', 'Record her marketing consent: one record per purpose and channel', 'Clients ▸ Consents ▸ New — Data Protection Act 2017');
  await nav(S, () => S.newRecord('consent_record'));
  await p.waitForTimeout(1000);
  await fill(S, 'consent_record', { party: FULL, purpose: 'marketing', channel: 'email', status: 'granted', source: 'branch', text_version: 'MKT-2026-v2', captured_on: today });
  await S.say('Marketing campaigns only reach clients with a granted consent', 'No consent, a withdrawal, “do not contact” or an open complaint suppresses her');
  await p.waitForTimeout(2600);
  const consent = await submit(S);

  await S.step(6, 'Spouse', 'Link related people: spouse, director, shareholder, beneficial owner, guarantor…', 'Clients ▸ Party Relationships ▸ New');
  await nav(S, () => S.newRecord('party_relationship'));
  await p.waitForTimeout(1000);
  await fill(S, 'party_relationship', { from_party: FULL, role: 'spouse', to_party: SPOUSE, valid_from: '2021-11-20' });
  await p.waitForTimeout(1500);
  await submit(S);

  // ── 5. Client relationship & the KYC gate ──
  await S.step(7, 'Relationship', 'Open her relationship with the entity she will deal with', 'Clients ▸ Client Relationships ▸ New — one per Genesis entity');
  await nav(S, () => S.newRecord('client_relationship'));
  await p.waitForTimeout(1000);
  await fill(S, 'client_relationship', { party: FULL, business_unit: 'WLT', segment: 'affluent', notes: 'Discretionary portfolio — introduced by her husband Rohan.' });
  await p.waitForTimeout(1500);
  await submit(S);

  await S.say('The relationship lifecycle: Prospect ▸ Onboarding ▸ Active ▸ Dormant ▸ Closed ▸ Exited', 'Drag the card to move it');
  await nav(S, () => S.openObject('client_relationship', { view: 'Pipeline' }));
  await p.waitForTimeout(2800);
  await S.say('She has agreed to go ahead: move her to Onboarding');
  await S.drag(FULL, 'Prospect', 'Onboarding');
  await S.say('Can she become Active straight away?');
  await p.waitForTimeout(1200);
  await S.drag(FULL, 'Onboarding', 'Active', { expectFail: true, after: 600 });
  await S.say('No — the move is refused: her KYC is not approved yet', 'The KYC & Compliance team approves her KYC case; then the move goes through');
  await p.waitForTimeout(5000);
  await S.say('Closing a relationship asks for the closing date; Exited also asks for a note', 'These rules are set in the Builder — no code');
  await p.waitForTimeout(3500);

  // ── 6. The new client's 360 ──
  await S.step(8, 'Her record', 'Back on her client record: everything is linked', 'The header shows her email, phone and address');
  await nav(S, () => S.openRecord('party', party.id));
  await p.waitForTimeout(2500);
  await S.tab('Related');
  await S.say('Related: her relationship, household, address, consent and spouse', 'Click any row to open it');
  await p.waitForTimeout(3500);
  await S.scroll(500, 2200);
  const comp = section(p, 'Compliance & value');
  await comp.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' })).catch(() => {});
  await p.waitForTimeout(1200);
  await S.say('The calculated Client 360 figures fill themselves in', 'KYC: not started yet · Marketing consent: yes');
  await S.highlight(comp, 4000);

  // ── 7. Consent withdrawal ──
  await S.step(9, 'Withdrawal', 'A week later she calls: no more marketing emails', 'Open the consent ▸ Edit ▸ status Withdrawn and the withdrawal date');
  await nav(S, () => S.editRecord('consent_record', consent.id));
  await p.waitForTimeout(1200);
  await fill(S, 'consent_record', { status: 'withdrawn', withdrawn_on: today });
  await p.waitForTimeout(1000);
  await submit(S);
  await nav(S, () => S.openRecord('party', party.id));
  await p.waitForTimeout(1500);
  await comp.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' })).catch(() => {});
  await p.waitForTimeout(1000);
  await S.say('Marketing consent is now No and she is suppressed from marketing', 'The latest decision per purpose wins — campaigns skip her automatically');
  await S.highlight(comp, 4500);

  // ── 8. An established client ──
  await S.step(10, 'Client 360', `Now an established client: ${SHOWCASE}`, 'Start any client conversation on the client record');
  await nav(S, () => S.openRecord('party', showcase.id));
  await p.waitForTimeout(2500);
  await S.say('ID number and income band are masked for a relationship manager', 'No Reveal link: her role may not view personal data');
  await S.highlight(p.getByText('ID number', { exact: true }).first().locator('xpath=..'), 3500);
  const comp2 = section(p, 'Compliance & value');
  await comp2.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'smooth' })).catch(() => {});
  await p.waitForTimeout(1500);
  await S.say('Client 360 figures: wealth AUM, fund holdings, total relationship value in MUR and USD', 'Products held, open applications and complaints, KYC status and AML risk');
  await S.highlight(comp2, 4500);
  await S.scroll(380, 2000);
  await S.say('Next-best actions open, and the suitable product risk ceiling from her risk profile', 'Every figure recalculates when a linked record changes');
  await p.waitForTimeout(3500);

  await S.tab('Related');
  await S.say('Related: everything Genesis does with her, across every entity', 'KYC case, risk profile, fund holdings, next-best actions, consents, meetings, events…');
  await p.waitForTimeout(3500);
  await S.scroll(600, 2500);
  await S.say('Rows owned by another desk that you may not open show as “restricted”', 'Ask Compliance if you need them — nothing is hidden silently');
  await S.scroll(600, 3000);
  await S.scroll(-1400, 900);

  await S.tab('Activity');
  await S.say('Activity: log the call you just had with her', 'Calls, meetings, emails and notes stay on the client record');
  await S.clickText('Log Activity');
  await p.waitForTimeout(600);
  await S.clickText('Call');
  await S.moveTo(p.getByPlaceholder('Subject *'));
  await S.type(CALL, 35);
  await S.moveTo(p.getByPlaceholder('Description (optional)'));
  await S.type('Discussed reinvesting the maturing bond into the income fund.', 25);
  await S.moveTo(p.getByPlaceholder('Outcome'));
  await S.type('Meeting booked for next week', 30);
  await S.clickText('Save');
  await S.settle(1200);
  await S.say('The call is on her timeline, with who logged it and when');
  await p.waitForTimeout(3000);

  // ── 9. Compliance: audited reveal ──
  await S.step(11, 'Reveal', 'Compliance may view personal data — on demand, and audited', 'Sign in as the Compliance Officer');
  await p.waitForTimeout(2500);
  await S.login('GCCOMP1', 'Compliance Officer — her role holds the “view personal data” permission');
  await nav(S, () => S.openRecord('party', party.id));
  await p.waitForTimeout(2000);
  const reveal = p.getByRole('button', { name: 'Reveal' }).first();
  await S.waitCut(() => reveal.waitFor({ timeout: 90000 }));
  await p.waitForTimeout(800);
  await S.say('She also sees the ID number masked — with a Reveal link', 'Personal data is only shown when someone deliberately asks for it');
  await S.highlight(reveal.locator('xpath=ancestor::dd[1]'), 3000);
  const res = p.waitForResponse((r) => r.url().includes('/reveal') && r.request().method() === 'POST', { timeout: 60000 });
  await S.moveTo(reveal);
  const rr = await S.waitCut(() => res);
  if (rr.status() >= 300) throw new Error(`reveal failed ${rr.status()}`);
  await p.waitForTimeout(800);
  await S.say('Revealed — and recorded in the tamper-evident audit trail');
  await S.highlight(p.getByText('B1204941234567').first().locator('xpath=ancestor::dd[1]'), 3000);
  await S.tab('Audit');
  await S.say('The Audit tab shows who revealed which field, and when', 'Alongside every change, stage move and approval on the record');
  await p.waitForTimeout(3000);
  await S.clear(); // the entries sit at the bottom of the panel, under the caption
  await S.highlight(p.getByText(/Revealed ID number/).first().locator('xpath=ancestor::div[1]'), 4000);
  await S.logout();

  await S.card({
    eyebrow: 'Summary',
    title: 'What you learned',
    text: 'The party is the golden record; everything else links to it.',
    bullets: ['Households add up the family’s value', 'Addresses, consents and spouse link to the client', 'Relationships per entity, gated by KYC', 'Client 360 figures calculate themselves', 'Consent withdrawal suppresses marketing', 'Personal data is masked; reveals are audited'],
    foot: 'Next: KYC & Compliance — approving the KYC case that unlocks the relationship',
  }, 7000);
}
