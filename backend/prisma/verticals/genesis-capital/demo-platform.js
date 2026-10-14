'use strict';

/**
 * Genesis Capital — demo activity, documents and access history (installed with
 * --demo after the demo records). Reads the live records through `ctx` and
 * returns plain items the installer writes through the platform services:
 *
 *   activity   calls, meetings, emails and notes on clients, enquiries, applications…
 *   task       open, overdue and completed follow-ups for each desk
 *   reminder   birthdays, offer follow-ups, forward maturities…
 *   document   sample PDFs filed against each record's DMS checklist, with review status
 *   share      secure links with view analytics (IMs, monthly reports, factsheets)
 *   signature  e-signature requests (offer letters, mandates, engagement letters)
 *   crossing   wall-crossings into the advisory and VIP walls (four eyes)
 *   chain      audit-chain baseline of the access set-up
 *
 * Every document is a SPECIMEN for demonstration; no real client data.
 */

const DAY = 86400000;
const HOUR = 3600000;

function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000000) / 1000000; };
}
const at = (base, offsetMs) => new Date(new Date(base).getTime() + offsetMs);
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const longDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const money = (n, ccy = 'MUR') => `${ccy} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const slug = (s) => String(s ?? '').replace(/[^A-Za-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

const ENTITY = {
  LND: ['Genesis Life Ltd (Loans business line)', 'Licensed by the Financial Services Commission (FSC IS10000013)'],
  WLT: ['Genesis Wealth Managers Ltd', 'Licensed by the Financial Services Commission'],
  FND: ['Genesis Global Funds Ltd', 'Licensed by the Financial Services Commission (FSC CI11000044)'],
  SEC: ['Genesis CMB Securities Ltd', 'Licensed by the Financial Services Commission (FSC IP16000002)'],
  ADV: ['Genesis Corporate Advisors Ltd', 'Licensed by the Financial Services Commission (FSC IZ19000019)'],
  FX: ['Genesis Forex Ltd', 'Licensed by the Bank of Mauritius (FX Dealer Licence No. 03)'],
  GRP: ['Genesis Capital', 'Compliance & MLRO office'],
};
const ADDRESS = 'Genesis Centre, 10 Intendance Street, Port Louis, Mauritius';
const head = (bu, right) => ({ name: 'Genesis Capital', subtitle: `${ENTITY[bu]?.[0] ?? ENTITY.GRP[0]} · ${ADDRESS}`, right });
const foot = (bu) => `${ENTITY[bu]?.[0] ?? ENTITY.GRP[0]} — ${ENTITY[bu]?.[1] ?? ''} · SPECIMEN DOCUMENT FOR DEMONSTRATION`;
const pdf = (title, bu, blocks, right) => ({ title, letterhead: head(bu, right), footer: foot(bu), blocks: [{ type: 'h1', text: title }, ...blocks] });
const kv = (rows) => ({ type: 'table', rows: rows.filter((r) => r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v]) => [k, String(v)]) });
const p = (text, extra = {}) => ({ type: 'p', text, ...extra });
const h2 = (text) => ({ type: 'h2', text });
const li = (text) => ({ type: 'bullet', text });
const specimen = p('SPECIMEN — generated for the Genesis Capital CRM demonstration. Not a real document.', { grey: true, size: 8.5 });

const LATER = (stages, current) => { const i = stages.indexOf(current); return i < 0 ? -1 : i; };

module.exports = async function platformDemo(ctx) {
  const items = [];
  const push = (kind, x) => items.push({ kind, ...x });
  const now = ctx.now;

  const parties = await ctx.records('party');
  const partyById = new Map(parties.map((r) => [r.id, r]));
  const nameOf = (id) => {
    const r = partyById.get(Number(id));
    if (!r) return 'Client';
    return r.v.party_type === 'organisation' ? (r.v.legal_name || r.v.display_name) : (r.v.display_name || `${r.v.first_name ?? ''} ${r.v.last_name ?? ''}`.trim());
  };
  const emailOf = (id) => partyById.get(Number(id))?.v.email || 'client@example.mu';

  // ── Clients: relationship history and upcoming meetings ──────────────────
  for (const c of parties) {
    if (!c.owner) continue;
    const r = rng(`party${c.id}`);
    const corp = c.v.party_type === 'organisation';
    const name = nameOf(c.id);
    const age = Math.max(now - new Date(c.created_at).getTime(), 20 * DAY);
    const past = corp
      ? [['meeting', `Relationship meeting with the CFO — ${name}`, 'Reviewed funding needs for the next 18 months and the group\'s FX exposure.', 'Agreed to send a term sheet and an FX hedging proposal.'],
        ['call', `Call with ${name} — quarterly check-in`, 'Discussed trading conditions and cash-flow forecast.', 'No new needs; next check-in next quarter.'],
        ['email', `Sent the corporate services pack to ${name}`, 'Commercial financing, FX desk and corporate advisory overview.', null],
        ['meeting', `Site visit — ${name}`, 'Visited operations with the credit analyst ahead of the annual review.', 'Operations in line with projections.']]
      : [['call', `Introductory call — ${name}`, 'Understood objectives, family situation and existing banking relationships.', 'Booked a discovery meeting at Genesis Centre.'],
        ['meeting', `Discovery meeting at Genesis Centre — ${name}`, 'Went through goals, horizon and capacity for loss; explained the investor questionnaire.', 'Client to complete the questionnaire; proposal to follow.'],
        ['email', `Sent product information to ${name}`, 'Fund factsheets and the Investment-Backed Loan product sheet.', null],
        ['note', `Client preference noted — ${name}`, `Prefers ${c.v.preferred_channel || 'phone'} contact in ${c.v.preferred_language === 'fr' ? 'French' : 'English'}; best reached late afternoon.`, null],
        ['call', `Birthday call — ${name}`, 'Birthday wishes; asked about upcoming plans.', 'Mentioned a renovation project next year — potential loan.']];
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i += 1) {
      const [type, subject, description, outcome] = past[(i + Math.floor(r() * 10)) % past.length];
      const when = at(c.created_at, Math.floor(age * ((i + 1) / (n + 1))) + Math.floor(r() * 6) * HOUR);
      push('activity', { record_id: c.id, employee_id: c.owner, type, subject, description, outcome, duration_min: type === 'meeting' ? 60 : type === 'call' ? 15 : null, scheduled_at: when, completed_at: when });
    }
    if (r() < 0.45) {
      const when = new Date(now + (1 + Math.floor(r() * 18)) * DAY);
      when.setUTCHours(5 + Math.floor(r() * 7), r() < 0.5 ? 0 : 30, 0, 0);
      push('activity', { record_id: c.id, employee_id: c.owner, type: 'meeting', subject: corp ? `Annual relationship review — ${name}` : `Portfolio and needs review — ${name}`, description: 'Agenda: performance, changes in circumstances, KYC refresh, next-best actions.', duration_min: 60, scheduled_at: when, completed_at: null });
    }
    if (!corp && c.v.date_of_birth) {
      const dob = new Date(c.v.date_of_birth);
      const next = new Date(Date.UTC(new Date(now).getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate(), 5));
      if (next.getTime() < now) next.setUTCFullYear(next.getUTCFullYear() + 1);
      if (next.getTime() - now < 60 * DAY) push('reminder', { record_id: c.id, employee_id: c.owner, created_by: c.owner, title: `Birthday — ${name}`, note: 'Call or send a card.', remind_at: next, status: 'pending', priority: 'normal' });
    }
  }

  // ── Enquiries: speed to lead ─────────────────────────────────────────────
  for (const e of await ctx.records('enquiry')) {
    if (!e.owner) continue;
    const r = rng(`enq${e.id}`);
    const name = e.v.display_name || `${e.v.first_name ?? ''} ${e.v.last_name ?? ''}`.trim();
    const product = e.v.product_code || 'product';
    if (e.stage && e.stage !== 'new') {
      const when = at(e.created_at, (1 + Math.floor(r() * 3)) * HOUR);
      push('activity', { record_id: e.id, employee_id: e.owner, type: 'call', subject: `First contact — ${name} (${product})`, description: `Called within the first-contact target; confirmed interest in ${product} and the amount.`, outcome: e.stage === 'disqualified' ? 'Not eligible / no current need.' : 'Qualified; next step agreed.', duration_min: 10, scheduled_at: when, completed_at: when });
    } else {
      const due = new Date(now + (r() < 0.4 ? -1 : r() < 0.7 ? 0 : 1) * DAY + 4 * HOUR);
      push('task', { record_id: e.id, assigned_to: e.owner, created_by: e.owner, title: `Call ${name} about ${product}`, description: 'First contact within four business hours (speed-to-lead SLA).', status: 'open', priority: 'high', due_date: due });
    }
  }

  // ── Lending: applications, KYC, facilities, collateral ───────────────────
  const LOAN_FLOW = ['enquiry', 'pre_qualified', 'application_captured', 'documents_pending', 'documents_complete', 'credit_appraisal', 'credit_approval', 'offer_issued', 'offer_accepted', 'security_perfection', 'ready_for_disbursement', 'disbursed'];
  for (const a of await ctx.records('loan_application')) {
    const r = rng(`loan${a.id}`);
    const owner = a.owner || 'GCLOAN1';
    const name = nameOf(a.v.party);
    const appNo = a.v.application_no || `LA-${a.id}`;
    const pos = LATER(LOAN_FLOW, a.stage);
    const amount = Number(a.v.loan_amount || 0);
    const product = a.v.product_code || 'LND-RE';
    const base = new Date(a.created_at).getTime();
    const docs = [];
    if (pos >= 2) docs.push(['kyc_id', `National Identity Card — ${name}.pdf`, pdf('Copy of National Identity Card', 'LND', [kv([['Holder', name], ['Document', 'National Identity Card (copy certified true)'], ['Certified by', `${owner} — Loans executive`], ['Date', longDate(at(base, 2 * DAY))]]), specimen])]);
    if (pos >= 3) docs.push(['proof_of_address', `Proof of address — CEB bill — ${name}.pdf`, pdf('Proof of residential address', 'LND', [kv([['Name', name], ['Address', partyById.get(Number(a.v.party))?.v.address || 'Port Louis'], ['Document', 'Central Electricity Board bill'], ['Bill date', longDate(at(base, -20 * DAY))]]), specimen])]);
    if (pos >= 3) docs.push(['bank_statements', `Bank statements (6 months) — ${name}.pdf`, pdf('Bank statement summary — last six months', 'LND', [kv([['Account holder', name], ['Bank', 'MCB Ltd'], ['Average monthly credits', money(Number(a.v.monthly_income || 120000) * 1.05)], ['Average monthly balance', money(Number(a.v.monthly_income || 120000) * 2.4)], ['Returned items', 'None']]), specimen])]);
    if (pos >= 4) docs.push(['financial_statements', `Payslips (3 months) — ${name}.pdf`, pdf('Salary slips — last three months', 'LND', [{ type: 'table', header: ['Month', 'Gross', 'Net'], rows: [0, 1, 2].map((m) => [new Date(base - (m + 1) * 30 * DAY).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), money(Number(a.v.monthly_income || 120000) * 1.22), money(a.v.monthly_income || 120000)]) }, specimen])]);
    if (pos >= 4 && product !== 'LND-IBL') docs.push(['property_title', `Title deed and sale agreement — ${appNo}.pdf`, pdf('Title deed and sale agreement (extract)', 'LND', [kv([['Purchaser', name], ['Property', 'Residential plot with dwelling house'], ['Transcription', `TV ${3000 + Math.floor(r() * 900)}/${10 + Math.floor(r() * 80)}`], ['Price', money(a.v.property_value || amount * 1.3)], ['Notary', 'Me. J. R. Ollivry, Notary']]), specimen])]);
    if (pos >= 5 && product !== 'LND-IBL') docs.push(['valuation', `Valuation report — ${appNo}.pdf`, pdf('Property valuation report', 'LND', [kv([['Prepared for', 'Genesis Life Ltd — Loans'], ['Property', 'Residential property'], ['Open market value', money(a.v.property_value || amount * 1.3)], ['Forced-sale value', money((a.v.property_value || amount * 1.3) * 0.75)], ['Valuer', 'Noor Dilmohamed & Co, Chartered Surveyors'], ['Date', longDate(at(base, 12 * DAY))]]), h2('Opinion'), p('The property is in good repair, in an established residential area, and readily marketable. Suitable security for a first-rank fixed charge.'), specimen])]);
    if (pos >= 2) docs.push(['credit_bureau', `MCIB credit report — ${appNo}.pdf`, pdf('Mauritius Credit Information Bureau — credit report', 'LND', [kv([['Subject', name], ['Reference', a.v.mcib_reference || `MCIB-${a.id}`], ['Score', a.v.mcib_score || 720], ['Rating', a.v.mcib_rating || 'clean'], ['Facilities reported', 2 + Math.floor(r() * 3)], ['Arrears', 'None']]), p('Report obtained with the applicant\'s written consent.'), specimen])]);
    if (pos >= 9 && product === 'LND-RE') docs.push(['insurance', `Life and building insurance assignment — ${appNo}.pdf`, pdf('Assignment of insurance policies', 'LND', [kv([['Assignor', name], ['Assignee', 'Genesis Life Ltd'], ['Life policy', `SL-LIFE-${100000 + a.id}`], ['Building policy', `SG-HOM-${200000 + a.id}`], ['Sum insured', money(amount)]]), specimen])]);
    if (product === 'LND-IBL' && pos >= 3) docs.push(['fund_forms', `Pledge instruction to the transfer agent — ${appNo}.pdf`, pdf('Pledge instruction', 'LND', [kv([['Pledgor', name], ['Pledgee', 'Genesis Life Ltd'], ['Assets', 'Genesis Income Fund units / securities portfolio'], ['Instruction date', longDate(at(base, 6 * DAY))]]), specimen])]);
    docs.forEach(([category, filename, body], i) => push('document', {
      entity_type: 'loan_application', entity_id: a.id, category, filename, pdf: body, uploaded_by: owner, uploaded_at: at(base, (i + 1) * DAY),
      status: pos >= 5 || i < 2 ? 'approved' : 'under_review', reviewed_by: pos >= 5 || i < 2 ? 'GCCRED1' : null, reviewed_at: at(base, (i + 3) * DAY),
    }));
    if (pos >= 7) {
      const offerName = `Offer letter — ${appNo}.pdf`;
      push('document', {
        entity_type: 'loan_application', entity_id: a.id, category: 'offer_letters', filename: offerName, uploaded_by: owner, uploaded_at: at(base, 18 * DAY), status: 'approved', reviewed_by: 'GCLMGR',
        pdf: pdf(`Offer of facility — ${appNo}`, 'LND', [
          p(`Port Louis, ${longDate(at(base, 18 * DAY))}`, { align: 'right' }), p(`Dear ${name},`),
          p('We are pleased to offer you the facility below, subject to the terms and conditions of this letter and our general conditions.'),
          kv([['Product', product], ['Amount', money(amount, a.v.currency_code || 'MUR')], ['Tenure', `${a.v.tenure_months || 240} months`], ['Interest rate', `${a.v.interest_rate || '6.15'}% p.a. variable (Genesis PLR ${a.v.plr_rate || '6.825'}% ${a.v.margin || '-0.675'}%)`], ['Monthly instalment', money(a.v.emi || amount / 180)], ['Security', product === 'LND-IBL' ? 'Pledge of investments in favour of Genesis Life Ltd' : 'First-rank fixed charge; life and building insurance assigned to Genesis Life Ltd'], ['Valid for', '30 days']]),
          p('The rate is linked to the Genesis PLR and changes when the PLR changes; you will be notified of every change.'),
          p('Yours faithfully,'), p('Genesis Life Ltd — Loans business line'), specimen,
        ]),
      });
      push('signature', { doc: `${a.id}|${offerName}`, title: `Offer letter ${appNo}`, message: 'Please review and sign your offer letter.', signers: [{ name, email: emailOf(a.v.party) }], signed: pos >= 8 ? 1 : 0, created_by: owner });
    }
    if (pos === 3 || pos === 2) push('task', { record_id: a.id, assigned_to: owner, created_by: owner, title: `Chase missing documents — ${appNo}`, description: 'Bank statements and title deed still outstanding.', status: 'open', priority: 'normal', due_date: new Date(now + (r() < 0.5 ? -2 : 2) * DAY) });
    if (pos === 7) push('reminder', { record_id: a.id, employee_id: owner, created_by: owner, title: `Follow up offer acceptance — ${appNo}`, note: 'Offer lapses 30 days after issue.', remind_at: new Date(now + 2 * DAY), status: 'pending', priority: 'high' });
    if (pos >= 3) {
      const w = at(base, 3 * DAY);
      push('activity', { record_id: a.id, employee_id: owner, type: 'call', subject: `Document collection call — ${appNo}`, description: 'Went through the checklist; client to upload missing items on the portal.', outcome: 'Documents promised within a week.', duration_min: 20, scheduled_at: w, completed_at: w });
    }
    if (pos >= 6) {
      const w = at(base, 14 * DAY);
      push('activity', { record_id: a.id, employee_id: 'GCCRED1', type: 'note', subject: `Credit appraisal note — ${appNo}`, description: `DSR ${a.v.dsr || '28'}%, LTV ${a.v.ltv || '70'}%, MCIB ${a.v.mcib_rating || 'clean'}. Recommendation: ${a.v.analyst_recommendation || 'approve'}.`, scheduled_at: w, completed_at: w });
    }
  }

  const KYC_DONE = ['under_verification', 'screening', 'risk_assessed', 'pending_approval', 'approved'];
  for (const k of await ctx.records('kyc_case')) {
    const party = partyById.get(Number(k.v.party));
    if (!party) continue;
    const name = nameOf(party.id);
    const owner = k.owner || 'GCCOMP1';
    const base = new Date(k.created_at).getTime();
    const full = KYC_DONE.includes(k.stage);
    const approved = k.stage === 'approved';
    const set = party.v.party_type === 'organisation'
      ? [['corporate_docs', 'Certificate of incorporation and constitution', [['Company', name], ['BRN', party.v.brn || 'C0712345'], ['Incorporated', party.v.incorporation_date || '2004-03-11'], ['Registrar', 'Corporate and Business Registration Department']]],
        ['corporate_docs', 'Register of directors and shareholders', [['Company', name], ['Directors', '3 (see register)'], ['Shareholders', 'As per the share register at the date of certification']]],
        ['corporate_docs', 'Ultimate beneficial owner declaration', [['Company', name], ['Beneficial owners', 'Natural persons holding 20% or more, as declared'], ['Declared on', longDate(at(base, 2 * DAY))]]],
        ['corporate_docs', 'Board resolution', [['Company', name], ['Resolution', 'To open accounts and enter into facilities with Genesis entities; authorised signatories named']]],
        ['kyc_id', 'Identity documents of directors and UBOs', [['Company', name], ['Documents', 'Certified copies of NIC / passports of directors, signatories and UBOs']]]]
      : [['kyc_id', 'National Identity Card', [['Holder', name], ['Number', 'On file (encrypted field)'], ['Expiry', party.v.id_expiry_date || '2030-01-01'], ['Certified true copy by', owner]]],
        ['proof_of_address', 'Proof of residential address', [['Name', name], ['Address', party.v.address || 'Mauritius'], ['Document', 'Utility bill less than three months old']]],
        ['source_of_funds', 'Source of funds and wealth declaration', [['Name', name], ['Occupation', party.v.occupation || '—'], ['Employer', party.v.employer || '—'], ['Source of wealth', party.v.source_of_wealth || 'Employment income and savings']]],
        ['tax_self_cert', 'FATCA and CRS self-certification', [['Name', name], ['US person', 'No'], ['Tax residencies', party.v.country_of_residence || 'MU']]]];
    const take = full ? set.length : k.stage === 'documents_pending' ? 1 : 0;
    set.slice(0, take).forEach(([category, title, rows], i) => push('document', {
      entity_type: 'kyc_case', entity_id: k.id, category, filename: `${title} — ${slug(name)}.pdf`, uploaded_by: owner, uploaded_at: at(base, (i + 1) * DAY),
      status: approved ? 'approved' : full ? 'under_review' : 'uploaded', reviewed_by: approved ? 'GCCOMP1' : null, reviewed_at: approved ? at(base, (i + 5) * DAY) : null,
      pdf: pdf(title, 'GRP', [kv(rows), specimen]),
    }));
    if (approved) {
      const w = at(base, 6 * DAY);
      push('activity', { record_id: k.id, employee_id: 'GCCOMP1', type: 'note', subject: `KYC reviewed — ${name}`, description: 'Documents verified against originals; screening clear; risk rating confirmed.', scheduled_at: w, completed_at: w });
    } else if (k.stage === 'documents_pending' || k.stage === 'initiated') {
      push('task', { record_id: k.id, assigned_to: owner, created_by: owner, title: `Collect KYC documents — ${name}`, description: 'ID, proof of address and source of funds; send the portal upload link.', status: 'open', priority: 'normal', due_date: new Date(now + 3 * DAY) });
    }
  }

  for (const f of await ctx.records('credit_facility')) {
    const name = nameOf(f.v.borrower);
    const owner = f.owner || 'GCRM3';
    const base = new Date(f.created_at).getTime();
    const docs = [
      ['corporate_docs', `Certificate of incorporation — ${slug(name)}.pdf`, pdf('Certificate of incorporation and constitution', 'LND', [kv([['Company', name], ['Registrar', 'Corporate and Business Registration Department']]), specimen])],
      ['financial_statements', `Audited financial statements 2025 — ${slug(name)}.pdf`, pdf('Audited financial statements — year ended 30 June 2025 (extract)', 'LND', [{ type: 'table', header: ['MUR million', '2025', '2024', '2023'], rows: [['Revenue', '842', '791', '735'], ['EBITDA', '168', '152', '139'], ['Net profit', '71', '64', '55'], ['Total debt', '410', '436', '455'], ['Equity', '623', '574', '531']] }, p('Unqualified audit opinion.'), specimen])],
      ['financial_statements', `Management accounts YTD — ${slug(name)}.pdf`, pdf('Management accounts — year to date', 'LND', [kv([['Revenue YTD', 'MUR 214m'], ['EBITDA YTD', 'MUR 43m'], ['Cash', 'MUR 38m']]), specimen])],
      ['corporate_docs', `Board resolution to borrow — ${slug(name)}.pdf`, pdf('Extract of board resolution', 'LND', [p(`Resolved that the company borrows up to ${money(f.v.amount)} from Genesis Life Ltd on the terms of the facility letter, and that two directors sign the facility documents.`), specimen])],
      ['offer_letters', `Term sheet — ${f.v.facility_no || `CF-${f.id}`}.pdf`, pdf(`Indicative term sheet — ${f.v.facility_no || `CF-${f.id}`}`, 'LND', [kv([['Borrower', name], ['Facility', f.v.facility_type || 'term loan'], ['Amount', money(f.v.amount, f.v.currency_code || 'MUR')], ['Tenor', `${f.v.tenor_months || 60} months`], ['Pricing', `Genesis PLR + ${f.v.margin || 1.25}%`], ['Arrangement fee', `${f.v.arrangement_fee_pct || 0.5}%`], ['Covenants', 'DSCR ≥ 1.25x; net debt / EBITDA ≤ 3.0x; audited accounts within 120 days']]), specimen])],
    ];
    docs.forEach(([category, filename, body], i) => push('document', { entity_type: 'credit_facility', entity_id: f.id, category, filename, pdf: body, uploaded_by: owner, uploaded_at: at(base, (i + 1) * DAY), status: 'approved', reviewed_by: 'GCCRED1', reviewed_at: at(base, (i + 4) * DAY) }));
    const w = at(base, 5 * DAY);
    push('activity', { record_id: f.id, employee_id: owner, type: 'meeting', subject: `Credit visit — ${name}`, description: 'Met the CFO and toured operations with the credit analyst.', outcome: 'Management accounts and projections received.', duration_min: 90, scheduled_at: w, completed_at: w });
  }

  for (const t of await ctx.records('covenant_test')) {
    push('document', { entity_type: 'covenant_test', entity_id: t.id, category: 'covenant_certificates', filename: `Compliance certificate — ${t.v.test_date || iso(t.created_at)}.pdf`, uploaded_by: t.owner || 'GCCRED1', uploaded_at: t.created_at, status: 'approved', reviewed_by: 'GCCRED1',
      pdf: pdf('Covenant compliance certificate', 'LND', [kv([['Test date', t.v.test_date || iso(t.created_at)], ['Covenant', t.v.covenant_name || t.v.name || 'Financial covenant'], ['Actual', t.v.actual_value ?? '—'], ['Result', t.v.result || 'pass']]), p('Certified by two directors of the borrower.'), specimen]) });
  }

  for (const c of await ctx.records('collateral')) {
    const base = new Date(c.created_at).getTime();
    push('document', { entity_type: 'collateral', entity_id: c.id, category: 'valuation', filename: `Valuation report — ${slug(c.v.title_reference || c.v.description || c.id)}.pdf`, uploaded_by: 'GCLOAN1', uploaded_at: at(base, DAY), status: 'approved', reviewed_by: 'GCCRED1',
      pdf: pdf('Valuation report', 'LND', [kv([['Asset', c.v.description], ['Title', c.v.title_reference], ['Market value', money(c.v.value)], ['Valuer', c.v.valuer || 'Approved valuer'], ['Date', c.v.valuation_date]]), specimen]) });
    if (c.v.policy_number) push('document', { entity_type: 'collateral', entity_id: c.id, category: 'insurance', filename: `Insurance policy ${c.v.policy_number}.pdf`, uploaded_by: 'GCLOAN1', uploaded_at: at(base, 2 * DAY), status: 'approved', reviewed_by: 'GCOPS1',
      pdf: pdf('Insurance policy schedule — assigned to Genesis Life Ltd', 'LND', [kv([['Insurer', c.v.insurer], ['Policy', c.v.policy_number], ['Sum insured', money(c.v.sum_insured)], ['Expiry', c.v.insurance_expiry], ['Loss payee', 'Genesis Life Ltd']]), specimen]) });
  }

  // ── Wealth, funds, securities ─────────────────────────────────────────────
  for (const m of await ctx.records('wealth_mandate')) {
    const name = nameOf(m.v.party);
    const owner = m.owner || 'GCPM1';
    const base = new Date(m.created_at).getTime();
    const live = ['signed', 'funded', 'active'].includes(m.stage);
    if (live) {
      const agreement = `Discretionary mandate agreement — ${slug(name)}.pdf`;
      push('document', { entity_type: 'wealth_mandate', entity_id: m.id, category: 'mandates_ips', filename: agreement, uploaded_by: owner, uploaded_at: at(base, 10 * DAY), status: 'approved', reviewed_by: 'GCCOMP1',
        pdf: pdf('Discretionary portfolio management agreement', 'WLT', [kv([['Client', name], ['Mandate type', m.v.mandate_type || 'discretionary'], ['Base currency', m.v.base_currency], ['Benchmark', m.v.benchmark], ['Custodian', m.v.custodian], ['Management fee', `${m.v.management_fee_pct || 1}% p.a.`], ['Performance fee', m.v.performance_fee_pct ? `${m.v.performance_fee_pct}% above benchmark` : 'None']]), p('The client appoints Genesis Wealth Managers Ltd to manage the portfolio at its discretion within the Investment Policy Statement.'), specimen]) });
      push('signature', { doc: `${m.id}|${agreement}`, title: 'Mandate agreement', signers: [{ name, email: emailOf(m.v.party) }], signed: 1, created_by: owner });
      push('document', { entity_type: 'wealth_mandate', entity_id: m.id, category: 'mandates_ips', filename: `Investment Policy Statement — ${slug(name)}.pdf`, uploaded_by: owner, uploaded_at: at(base, 9 * DAY), status: 'approved', reviewed_by: 'GCCOMP1',
        pdf: pdf('Investment Policy Statement', 'WLT', [h2('Objectives'), p('Long-term growth with moderate volatility; liquidity of 10% held in money market funds.'), h2('Strategic allocation'), { type: 'table', header: ['Asset class', 'Target', 'Range'], rows: [['Equities', '55%', '45–65%'], ['Fixed income', '30%', '20–40%'], ['Alternatives', '10%', '0–15%'], ['Cash', '5%', '0–15%']] }, h2('Restrictions'), p(m.v.esg_restrictions || 'None beyond the Genesis exclusion list.'), specimen]) });
      push('document', { entity_type: 'wealth_mandate', entity_id: m.id, category: 'tax_self_cert', filename: `FATCA CRS self-certification — ${slug(name)}.pdf`, uploaded_by: owner, uploaded_at: at(base, 8 * DAY), status: 'approved', reviewed_by: 'GCCOMP1', pdf: pdf('FATCA / CRS self-certification', 'WLT', [kv([['Account holder', name], ['US person', 'No'], ['Tax residency', 'Mauritius']]), specimen]) });
      const report = `Monthly client report — September 2026 — ${slug(name)}.pdf`;
      push('document', { entity_type: 'wealth_mandate', entity_id: m.id, category: 'client_reports', filename: report, uploaded_by: owner, uploaded_at: new Date(now - 10 * DAY), status: 'approved',
        pdf: pdf('Monthly portfolio report — September 2026', 'WLT', [kv([['Client', name], ['Portfolio value', money(m.v.aum, m.v.base_currency || 'USD')], ['Month return', '+0.84%'], ['Year to date', `${m.v.ytd_return_pct || '+6.2'}%`], ['Benchmark YTD', '+5.7%']]), h2('Allocation'), { type: 'table', header: ['Asset class', 'Weight'], rows: [['Equities', '56%'], ['Fixed income', '29%'], ['Alternatives', '9%'], ['Cash', '6%']] }, h2('Commentary'), p('Equities advanced on easing inflation; duration added in investment-grade bonds after the SAAC decision.'), specimen]) });
      push('share', { doc: `${m.id}|${report}`, views: 1 + (m.id % 4), created_by: owner, expiresInDays: 30 });
    }
    const w = at(base, 4 * DAY);
    push('activity', { record_id: m.id, employee_id: owner, type: 'meeting', subject: `Mandate discovery meeting — ${name}`, description: 'Objectives, horizon and constraints; investor questionnaire completed.', outcome: 'Model portfolio agreed; IPS to be drafted.', duration_min: 75, scheduled_at: w, completed_at: w });
    if (m.stage === 'active' && m.id % 2 === 0) push('task', { record_id: m.id, assigned_to: owner, created_by: owner, title: `Prepare the review pack — ${name}`, description: 'Performance, allocation versus model, suitability re-confirmation.', status: 'open', priority: 'normal', due_date: new Date(now + 5 * DAY) });
  }

  for (const fund of await ctx.records('fund')) {
    const prospectus = `${fund.v.name} — Prospectus.pdf`;
    push('document', { entity_type: 'fund', entity_id: fund.id, category: 'fund_documents', filename: prospectus, uploaded_by: 'GCPM2', uploaded_at: new Date(now - 200 * DAY), status: 'approved', reviewed_by: 'GCCOMP1',
      pdf: pdf(`${fund.v.name} — Prospectus (extract)`, 'FND', [kv([['Fund', fund.v.name], ['ISIN', fund.v.isin], ['Base currency', fund.v.base_currency], ['Benchmark', fund.v.benchmark], ['Launch', fund.v.launch_date], ['Maturity', fund.v.maturity_date]]), h2('Investment objective'), p(fund.v.objective || ''), h2('Structure'), p(fund.v.structure || ''), h2('Dealing and distributions'), p(`${fund.v.redemption || ''}. ${fund.v.distribution || ''}.`), specimen]) });
    const sheet = `${fund.v.name} — Factsheet August 2026.pdf`;
    push('document', { entity_type: 'fund', entity_id: fund.id, category: 'fund_documents', filename: sheet, uploaded_by: 'GCPM2', uploaded_at: new Date(now - 40 * DAY), status: 'approved',
      pdf: pdf(`${fund.v.name} — Factsheet, August 2026`, 'FND', [kv([['ISIN', fund.v.isin], ['Asset class', fund.v.asset_class], ['Benchmark', fund.v.benchmark], ['Target investors', fund.v.target_investors]]), h2('Performance'), { type: 'table', header: ['Period', 'Fund', 'Benchmark'], rows: [['1 month', '+0.6%', '+0.5%'], ['Year to date', '+5.1%', '+4.6%'], ['1 year', '+7.9%', '+7.2%']] }, p('Past performance is not a guide to future returns.'), specimen]) });
    push('share', { doc: `${fund.id}|${sheet}`, views: 6 + (fund.id % 9), created_by: 'GCPM2', expiresInDays: 90 });
  }

  const orders = await ctx.records('fund_order');
  for (const o of orders.slice(0, 30)) {
    const name = nameOf(o.v.party);
    const base = new Date(o.created_at).getTime();
    push('document', { entity_type: 'fund_order', entity_id: o.id, category: 'fund_forms', filename: `Subscription form — ${o.v.order_no || `FO-${o.id}`}.pdf`, uploaded_by: o.owner || 'GCPM2', uploaded_at: at(base, HOUR), status: 'approved', reviewed_by: 'GCOPS1',
      pdf: pdf(`${o.v.order_type === 'redemption' ? 'Redemption' : 'Subscription'} form — ${o.v.order_no || `FO-${o.id}`}`, 'FND', [kv([['Investor', name], ['Share class', o.v.share_class_name || o.v.share_class], ['Amount', o.v.amount], ['Dealing date', o.v.cut_off_date]]), p('I confirm I have read the prospectus and the key information for this share class.'), specimen]) });
    if (o.v.order_type !== 'redemption') push('document', { entity_type: 'fund_order', entity_id: o.id, category: 'bank_statements', filename: `Proof of payment — ${o.v.order_no || `FO-${o.id}`}.pdf`, uploaded_by: o.owner || 'GCPM2', uploaded_at: at(base, 2 * HOUR), status: 'approved', reviewed_by: 'GCOPS1',
      pdf: pdf('Proof of payment — SWIFT / bank transfer advice', 'FND', [kv([['Remitter', name], ['Beneficiary', 'Genesis Global Funds Ltd — subscriptions account'], ['Amount', o.v.amount], ['Value date', o.v.cut_off_date]]), specimen]) });
  }

  for (const s of await ctx.records('securities_account')) {
    const name = nameOf(s.v.party);
    const base = new Date(s.created_at).getTime();
    const owner = s.owner || 'GCTRD1';
    [['kyc_id', 'Identity document'], ['proof_of_address', 'Proof of address'], ['account_agreements', 'Securities account agreement'], ['tax_self_cert', 'FATCA / CRS self-certification']].forEach(([category, title], i) => push('document', {
      entity_type: 'securities_account', entity_id: s.id, category, filename: `${title} — ${slug(name)}.pdf`, uploaded_by: owner, uploaded_at: at(base, (i + 1) * DAY), status: 'approved', reviewed_by: 'GCCOMP1',
      pdf: pdf(title, 'SEC', [kv([['Client', name], ['CDS account', s.v.cds_account_no], ['Account type', s.v.account_type], ['Markets', s.v.markets]]), specimen]),
    }));
  }

  // ── Corporate advisory (behind the ADV_PRIVATE wall) ──────────────────────
  for (const m of await ctx.records('advisory_mandate')) {
    const client = nameOf(m.v.client);
    const code = m.v.code_name || `Project ${m.id}`;
    const owner = m.owner || 'GCADV1';
    const base = new Date(m.created_at).getTime();
    const engaged = !['origination', 'pitch', 'conflict_check'].includes(m.stage);
    push('document', { entity_type: 'advisory_mandate', entity_id: m.id, category: 'nda', filename: `NDA — ${code}.pdf`, uploaded_by: owner, uploaded_at: at(base, DAY), status: 'approved', reviewed_by: 'GCCOMP1',
      pdf: pdf(`Non-disclosure agreement — ${code}`, 'ADV', [kv([['Parties', `${client} and Genesis Corporate Advisors Ltd`], ['Purpose', 'Evaluation of the proposed transaction'], ['Term', 'Two years']]), specimen]) });
    if (engaged) {
      const el = `Engagement letter — ${code}.pdf`;
      push('document', { entity_type: 'advisory_mandate', entity_id: m.id, category: 'engagement_letters', filename: el, uploaded_by: owner, uploaded_at: at(base, 5 * DAY), status: 'approved', reviewed_by: 'GCCOMP1',
        pdf: pdf(`Engagement letter — ${code}`, 'ADV', [kv([['Client', client], ['Service', m.v.service || m.v.service_line], ['Retainer', money(m.v.retainer_fee)], ['Success fee', `${m.v.success_fee_pct || 1.5}% of funds raised`]]), p('Scope, fees, confidentiality and conflicts as agreed. Work starts on signature.'), specimen]) });
      push('signature', { doc: `${m.id}|${el}`, title: `Engagement letter ${code}`, signers: [{ name: `${client} — authorised signatory`, email: emailOf(m.v.client) }], signed: 1, created_by: owner });
      push('document', { entity_type: 'advisory_mandate', entity_id: m.id, category: 'deal_documents', filename: `Conflict-check clearance — ${code}.pdf`, uploaded_by: 'GCCOMP1', uploaded_at: at(base, 4 * DAY), status: 'approved', reviewed_by: 'GCMLRO',
        pdf: pdf(`Conflict-check clearance — ${code}`, 'GRP', [p('Searched the party master, all Genesis relationships, open mandates and the restricted list.'), kv([['Result', m.v.conflict_check || 'cleared'], ['Controls', 'Trading desk walled off; research coverage suspended for the deal period']]), specimen]) });
    }
    if (['execution', 'completion'].includes(m.stage) && m.v.service_line === 'fund_raising') {
      const im = `Information memorandum — ${code}.pdf`;
      push('document', { entity_type: 'advisory_mandate', entity_id: m.id, category: 'deal_documents', filename: im, uploaded_by: owner, uploaded_at: at(base, 20 * DAY), status: 'approved', reviewed_by: 'GCADV2',
        pdf: pdf(`Information memorandum — ${code} (strictly confidential)`, 'ADV', [h2('The opportunity'), p(`${client} is raising ${money(m.v.deal_value)} to fund its next phase of growth.`), h2('Key figures'), { type: 'table', header: ['MUR million', 'FY2025', 'FY2026F', 'FY2027F'], rows: [['Revenue', '620', '700', '790'], ['EBITDA', '118', '139', '162'], ['Net debt', '310', '280', '240']] }, h2('Use of proceeds'), li('Expansion capex'), li('Refinancing of short-term debt'), li('Working capital'), specimen]) });
      push('share', { doc: `${m.id}|${im}`, views: 9, created_by: owner, expiresInDays: 21, allowDownload: false });
    }
    const w = at(base, 3 * DAY);
    push('activity', { record_id: m.id, employee_id: owner, type: 'meeting', subject: `Kick-off meeting — ${code}`, description: 'Timeline, data request list, investor universe.', outcome: 'Data room opened; first investor list drafted.', duration_min: 90, scheduled_at: w, completed_at: w });
  }

  // ── Service, compliance, introducers ──────────────────────────────────────
  for (const sr of await ctx.records('service_request')) {
    const owner = sr.owner;
    if (!owner) continue;
    const name = nameOf(sr.v.party);
    const base = new Date(sr.created_at).getTime();
    const w = at(base, 2 * HOUR);
    push('activity', { record_id: sr.id, employee_id: owner, type: 'call', subject: `Acknowledged — ${sr.v.request_type || 'request'} for ${name}`, description: 'Confirmed the request and the expected turnaround.', duration_min: 5, scheduled_at: w, completed_at: w });
    if (sr.v.request_type === 'complaint') {
      push('document', { entity_type: 'service_request', entity_id: sr.id, category: 'complaints', filename: `Complaint letter — ${slug(name)}.pdf`, uploaded_by: owner, uploaded_at: at(base, HOUR), status: 'approved',
        pdf: pdf('Complaint received', 'GRP', [kv([['Complainant', name], ['Received', longDate(base)], ['Channel', sr.v.channel]]), p(sr.v.description || 'Complaint as described by the client.'), specimen]) });
      if (sr.v.final_response) push('document', { entity_type: 'service_request', entity_id: sr.id, category: 'complaints', filename: `Final response — ${slug(name)}.pdf`, uploaded_by: 'GCCOMP1', uploaded_at: at(base, 9 * DAY), status: 'approved',
        pdf: pdf('Final response to your complaint', 'GRP', [p(`Dear ${name},`), p(sr.v.final_response), p('If you are not satisfied, you may refer the matter to the Ombudsperson for Financial Services within three months.'), specimen]) });
    }
    if (!['resolved', 'closed'].includes(sr.stage)) push('task', { record_id: sr.id, assigned_to: owner, created_by: owner, title: `Resolve ${String(sr.v.request_type || 'request').replace(/_/g, ' ')} — ${name}`, status: 'in_progress', priority: sr.v.priority === 'high' ? 'high' : 'normal', due_date: new Date(now + (sr.id % 3 - 1) * DAY) });
  }

  for (const s of await ctx.records('str_report')) {
    push('document', { entity_type: 'str_report', entity_id: s.id, category: 'str_documents', filename: `Internal suspicion report — ${s.v.str_no || s.id}.pdf`, uploaded_by: 'GCMLRO', uploaded_at: s.created_at, status: 'under_review',
      pdf: pdf(`Internal suspicion report ${s.v.str_no || ''} — MLRO only`, 'GRP', [kv([['Subject', nameOf(s.v.party)], ['Suspicion', s.v.suspicion_type]]), h2('Narrative'), p(s.v.narrative || ''), h2('Transactions'), p(s.v.transaction_details || ''), p('Do not disclose to the client (no tipping-off).', { bold: true }), specimen]) });
  }

  for (const i of await ctx.records('introducer')) {
    const name = nameOf(i.v.party);
    push('document', { entity_type: 'introducer', entity_id: i.id, category: 'account_agreements', filename: `Introducer agreement — ${slug(name)}.pdf`, uploaded_by: 'GCBDH', uploaded_at: i.created_at, status: 'approved', reviewed_by: 'GCCOMP1',
      pdf: pdf('Introducer agreement', 'GRP', [kv([['Introducer', name], ['Commission', `${i.v.commission_pct || 0.5}% of funded volume`], ['Clawback', `${i.v.clawback_months || 12} months`], ['Protection window', `${i.v.protection_days || 90} days`]]), specimen]) });
    push('document', { entity_type: 'introducer', entity_id: i.id, category: 'kyc_id', filename: `Identity document — ${slug(name)}.pdf`, uploaded_by: 'GCBDH', uploaded_at: i.created_at, status: 'approved', reviewed_by: 'GCCOMP1', pdf: pdf('Identity document', 'GRP', [kv([['Name', name]]), specimen]) });
  }

  for (const d of await ctx.records('data_subject_request')) {
    push('document', { entity_type: 'data_subject_request', entity_id: d.id, category: 'dpa_requests', filename: `Data subject request — ${d.v.request_no || d.id}.pdf`, uploaded_by: 'GCCOMP1', uploaded_at: d.created_at, status: 'approved',
      pdf: pdf('Data subject request — Data Protection Act 2017', 'GRP', [kv([['Request', d.v.request_no], ['Right', d.v.right], ['Received', iso(d.created_at)], ['Respond by', d.v.due_date]]), specimen]) });
  }

  // ── Desk tasks and reminders without a single record ─────────────────────
  for (const fx of (await ctx.records('fx_deal')).filter((x) => x.v.product === 'forward' && x.v.value_date && new Date(x.v.value_date).getTime() > now).slice(0, 8)) {
    push('reminder', { record_id: fx.id, employee_id: fx.owner || 'GCFX1', created_by: fx.owner || 'GCFX1', title: `Forward maturity — ${fx.v.deal_no || fx.id}`, note: 'Confirm settlement or offer a roll-over.', remind_at: new Date(new Date(fx.v.value_date).getTime() - 3 * DAY), status: 'pending', priority: 'high' });
  }
  push('task', { record_id: null, assigned_to: 'GCCOMP1', created_by: 'GCMLRO', title: 'Quarterly AML statistics for the FSC', description: 'Compile KYC, screening and STR statistics for Q3 2026.', status: 'open', priority: 'high', due_date: new Date(now + 6 * DAY) });
  push('task', { record_id: null, assigned_to: 'GCMKT1', created_by: 'GCBDH', title: 'Send the FMB 2029 Series 2 reminder to the segment', description: 'Consent-checked audience only.', status: 'open', priority: 'normal', due_date: new Date(now + DAY) });
  push('task', { record_id: null, assigned_to: 'GCLMGR', created_by: 'GCCOO', title: 'Review the arrears early-warning list', status: 'open', priority: 'normal', due_date: new Date(now + 2 * DAY) });
  push('task', { record_id: null, assigned_to: 'GCPM1', created_by: 'GCCOO', title: 'Brief RMs on the latest SAAC decision', status: 'completed', priority: 'normal', due_date: new Date(now - 6 * DAY), completed_at: new Date(now - 7 * DAY) });

  // ── Access: wall-crossings and the audit-chain baseline ──────────────────
  const mandates = await ctx.records('advisory_mandate');
  const code = (i) => mandates[i]?.v.code_name || `mandate ${i + 1}`;
  push('crossing', { zone: 'ADV_PRIVATE', employee_id: 'GCRM2', requested_by: 'GCADV1', decided_by: 'GCCOMP1', decision: 'approve', valid_days: 21, reason: `Investor sounding for ${code(0)}: approach two wealth clients as potential anchor investors.` });
  push('crossing', { zone: 'ADV_PRIVATE', employee_id: 'GCCRED1', requested_by: 'GCADV2', decided_by: 'GCCOMP1', decision: 'approve', valid_days: 30, reason: `Credit view on the debt tranche of ${code(1)}.` });
  push('crossing', { zone: 'ADV_PRIVATE', employee_id: 'GCTRD1', requested_by: 'GCADV1', decided_by: 'GCMLRO', decision: 'reject', reason: `Market colour on the issuer for ${code(0)} — rejected: trading desk must stay on the public side.` });
  push('crossing', { zone: 'ADV_PRIVATE', employee_id: 'GCFX1', requested_by: 'GCADV2', decision: null, reason: `FX hedging structure for the foreign-currency proceeds of ${code(2)}.` });
  push('crossing', { zone: 'VIP_CLIENTS', employee_id: 'GCRM1', requested_by: 'GCRM2', decided_by: 'GCMLRO', decision: 'approve', valid_days: 14, reason: 'Cover the VIP book during the senior RM\'s annual leave.' });
  push('crossing', { zone: 'COMPLIANCE_ONLY', employee_id: 'GCAUD1', requested_by: 'GCAUD1', decided_by: 'GCCOMP1', decision: 'approve', valid_days: 10, reason: 'Internal audit of the watch-list process (2026 audit plan).' });
  for (const [zone, members, why] of [
    ['ADV_PRIVATE', ['GCADV1', 'GCADV2', 'GCCOMP1', 'GCMLRO'], 'Advisory private side: deal team and Compliance'],
    ['MLRO_STR', ['GCMLRO'], 'Suspicious-transaction register: MLRO only'],
    ['COMPLIANCE_ONLY', ['GCCOMP1', 'GCMLRO'], 'Watch list: Compliance only'],
    ['VIP_CLIENTS', ['GCCOO', 'GCRM2', 'GCMLRO'], 'Sensitive clients: named users only'],
  ]) push('chain', { entity_type: 'barrier_zone', action: 'baseline', actor: 'GCADMIN', payload: { zone, members, why } });
  push('chain', { entity_type: 'permission.object', action: 'baseline', actor: 'GCADMIN', payload: { note: 'Object permissions and record visibility installed from the Genesis pack', front_office_own_book: ['rm', 'loans_executive'] } });

  return items;
};
