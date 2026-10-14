'use strict';

/**
 * Genesis Capital — demo data (installed with --demo).
 *
 * Generated deterministically (seeded PRNG) so every install produces the same
 * book, with dates relative to the install date so dashboards always show the
 * last twelve months. Every record carries an `ext_ref` key, so re-installing
 * updates in place and children reference parents as `@object:ext_ref=…`.
 *
 * The data is realistic rather than random: ages fit loan tenures (ending by
 * 65), personal loans start at MUR 500k, fund orders only go to KYC-approved
 * investors, campaign audiences exclude suppressed clients, and so on — the
 * same rules the Builder metadata enforces.
 */

// ── Deterministic helpers ────────────────────────────────────────────────────
let seed = 20261013;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p) => rnd() < p;
const round = (n, step) => Math.round(n / step) * step;
const TODAY = new Date();
const d = (offsetDays) => { const x = new Date(TODAY); x.setUTCDate(x.getUTCDate() + offsetDays); return x.toISOString().slice(0, 10); };
const ago = (days) => d(-days);
const monthEnd = (monthsBack) => { const x = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - monthsBack + 1, 0)); return x.toISOString().slice(0, 10); };
const period = (monthsBack) => monthEnd(monthsBack).slice(0, 7);
const dob = (age) => { const x = new Date(TODAY); x.setUTCFullYear(x.getUTCFullYear() - age); x.setUTCDate(x.getUTCDate() - int(10, 300)); return x.toISOString().slice(0, 10); };
const ref = (object, key) => `@${object}:ext_ref=${key}`;

// ── People ───────────────────────────────────────────────────────────────────
const FIRST = ['Anjali', 'Jean-Marc', 'Priya', 'Kevin', 'Sophie', 'Raj', 'Lina', 'Vikash', 'Marie-Claire', 'Yannick', 'Nadia', 'Arvind', 'Christelle', 'Deepak', 'Laetitia', 'Rohan', 'Isabelle', 'Sanjay', 'Aurélie', 'Ashwin', 'Mélanie', 'Kushal', 'Natacha', 'Ravi', 'Stéphanie', 'Anil', 'Valérie', 'Nitin', 'Corinne', 'Bhavish', 'Emilie', 'Sunil', 'Fabienne', 'Hemraj', 'Joëlle', 'Pravind', 'Karine', 'Dev', 'Annabelle', 'Shamim', 'Patricia', 'Yusuf', 'Rachel', 'Jayesh', 'Nathalie', 'Amit', 'Danielle', 'Feroze'];
const LAST = ['Ramgoolam', 'Lagesse', 'Naidoo', 'Appadoo', 'Martin', 'Doorgakant', 'Chan', 'Ramdhony', 'Duval', 'Lim Fat', 'Bholah', 'Jugnauth', 'Leclézio', 'Seegoolam', 'Rivet', 'Beeharry', 'Koenig', 'Boodhoo', 'Maurel', 'Gopaul', 'Desvaux', 'Ramsamy', 'Hardy', 'Peerthum', 'Montocchio', 'Sookun', 'Thomas', 'Rughoobur', 'Henry', 'Dabee', 'Gujadhur', 'Ramlackhan', 'Pillay', 'Ah-Kye', 'Mungur', 'Desmarais', 'Ruhee', 'Lam Po Tang', 'Ramful', 'Noël', 'Jhurry', 'Antoine', 'Hossenbux', 'Coret', 'Ramdin', 'Lebrasse', 'Emamally', 'Fok'];
const OCCUPATIONS = [['Engineer', 'CEB', 'low', 'gt_3m'], ['Doctor', 'Wellkin Hospital', 'low', 'gt_3m'], ['Lawyer', 'Juristconsult', 'medium', 'gt_3m'], ['Teacher', 'Royal College', 'low', '600k_1_2m'], ['Accountant', 'PwC Mauritius', 'low', '1_2m_3m'], ['Business owner', 'Own business', 'medium', 'gt_3m'], ['Civil servant', 'Ministry of Finance', 'low', '600k_1_2m'], ['Pilot', 'Air Mauritius', 'low', 'gt_3m'], ['Hotel manager', 'Beachcomber', 'low', '1_2m_3m'], ['Architect', 'Archiplan', 'low', '1_2m_3m'], ['Property developer', 'Own business', 'high', 'gt_3m'], ['Retired', '—', 'low', '600k_1_2m']];
const STREETS = ['Royal Road, Curepipe', 'Avenue des Flamboyants, Floréal', 'Coastal Road, Grand Baie', 'Ebène Cybercity', 'Rue Saint Georges, Port Louis', 'Avenue Dr Eugène Laurent, Quatre Bornes', 'La Vigie Road, Moka', 'Route Royale, Tamarin', 'Sir Seewoosagur Ramgoolam St, Port Louis', 'Avenue Victoria, Rose Hill'];

const RMS = ['GCRM1', 'GCRM2', 'GCRM3'];
const LOAN_EXECS = ['GCLOAN1', 'GCLOAN2'];

// 48 individuals. The first four are the PRD's MVP journey characters.
const individuals = [];
for (let i = 0; i < 48; i += 1) {
  const first = FIRST[i];
  const last = LAST[i];
  const age = i === 0 ? 42 : i === 1 ? 55 : i === 2 ? 47 : int(26, 68);
  const [occupation, employer, occupation_risk, income_band] = pick(OCCUPATIONS);
  const foreign = i === 2 || (i > 30 && chance(0.25));
  const country = i === 2 ? 'ZA' : foreign ? pick(['ZA', 'SC', 'FR', 'GB', 'RE']) : 'MU';
  const segment = i < 6 ? ['affluent', 'hnw', 'hnw', 'affluent', 'hnw', 'uhnw'][i] : pick(['retail', 'retail', 'affluent', 'affluent', 'hnw', 'uhnw']);
  individuals.push({
    key: `PTY-I${String(i + 1).padStart(3, '0')}`,
    first, last, age, country, segment, occupation, employer, occupation_risk, income_band,
    email: `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z.]/g, '') + (country === 'MU' ? '@example.mu' : '@example.com'),
    mobile: country === 'MU' ? `+2305${int(7000000, 7999999)}` : `+27${int(820000000, 829999999)}`,
    language: chance(0.32) ? 'fr' : 'en',
    rm: i < 4 ? ['GCLOAN1', 'GCRM2', 'GCRM2', 'GCLOAN2'][i] : pick(RMS),
    pep: i === 2 || i === 37,
    vip: i === 9 || i === 21,
    vip_reason: i === 9 ? 'board' : i === 21 ? 'staff' : null,
    dnc: i === 44,
  });
}

const ORGS = [
  ['Ocean Breeze Hotels Ltd', 'tourism', 'gt_500m', 'C07012345', 'finance@oceanbreeze.mu'],
  ['Doorga Trading Ltd', 'trade', '50m_500m', 'C09023456', 'accounts@doorgatrading.mu'],
  ['Island Agro Industries Ltd', 'agriculture', 'gt_500m', 'C05034567', 'treasury@islandagro.mu'],
  ['Cybercity Tech Solutions Ltd', 'ict', '50m_500m', 'C14045678', 'cfo@cybercitytech.mu'],
  ['Tamarind Property Developments Ltd', 'property', '50m_500m', 'C12056789', 'finance@tamarindpd.mu'],
  ['Port Louis Logistics Ltd', 'trade', 'gt_500m', 'C03067890', 'cfo@pllogistics.mu'],
  ['Moka Textiles Ltd', 'manufacturing', 'gt_500m', 'C01078901', 'treasury@mokatextiles.mu'],
  ['Sunrise Pension Fund', 'financial', 'gt_500m', 'P11089012', 'investments@sunrisepension.mu'],
  ['Indian Ocean Reinsurance Co Ltd', 'financial', 'gt_500m', 'C08090123', 'cio@ioreinsurance.mu'],
  ['Le Morne Resorts Ltd', 'tourism', '50m_500m', 'C10101234', 'finance@lemorneresorts.mu'],
  ['Rodrigues Seafood Exports Ltd', 'trade', '50m_500m', 'C15112345', 'accounts@rodseafood.mu'],
  ['Phoenix Beverages Distribution Ltd', 'manufacturing', 'gt_500m', 'C02123456', 'treasury@phoenixbev.mu'],
  ['Mascarene Capital Partners Ltd', 'financial', '50m_500m', 'C17134567', 'ops@mascarenecp.mu'],
  ['Grand Baie Medical Centre Ltd', 'other', '50m_500m', 'C13145678', 'finance@gbmedical.mu'],
  ['Savanne Sugar Estates Ltd', 'agriculture', 'gt_500m', 'C04156789', 'cfo@savannesugar.mu'],
  ['Ebène Fintech Ventures Ltd', 'ict', 'lt_50m', 'C19167890', 'founders@ebenefintech.mu'],
];
const organisations = ORGS.map(([legal_name, sector, revenue_band, brn, email], i) => ({
  key: `PTY-O${String(i + 1).padStart(3, '0')}`, legal_name, sector, revenue_band, brn, email,
  institutional: ['financial'].includes(sector) && i >= 7 && i <= 8,
  rm: i < 1 ? 'GCRM3' : pick(['GCRM3', 'GCRM1']),
}));

const GROUPS = [
  ['CG-H01', 'Lagesse family', 'household', 'GCRM2', [1, 6, 18]],
  ['CG-H02', 'Ramgoolam household', 'household', 'GCLOAN1', [0, 24]],
  ['CG-H03', 'Naidoo family office', 'family_office', 'GCRM2', [2, 12, 30]],
  ['CG-H04', 'Leclézio family', 'household', 'GCRM1', [13, 27]],
  ['CG-C01', 'Ocean Breeze Group', 'corporate_group', 'GCRM3', [], [0, 9]],
  ['CG-C02', 'Doorga Group', 'corporate_group', 'GCRM3', [5], [1, 5]],
];

// ── Sets ─────────────────────────────────────────────────────────────────────
const sets = [];
const add = (object, records, extra = {}) => { if (records.length) sets.push({ object, key: 'ext_ref', records, ...extra }); };

add('client_group', GROUPS.map(([ext_ref, name, group_type, primary_rm, , orgIdx]) => ({ ext_ref, name, group_type, primary_rm, group_limit: orgIdx ? 600000000 : null })));

const groupOf = (kind, idx) => {
  const g = GROUPS.find((gg) => (kind === 'i' ? gg[4] : (gg[5] ?? [])).includes(idx));
  return g ? ref('client_group', g[0]) : null;
};

add('party', [
  ...individuals.map((p, i) => ({
    ext_ref: p.key, party_type: 'individual', salutation: pick(['mr', 'mrs', 'ms', 'dr']), first_name: p.first, last_name: p.last,
    date_of_birth: dob(p.age), gender: pick(['male', 'female']), nationality: p.country === 'MU' ? 'MU' : p.country, id_type: p.country === 'MU' ? 'nic' : 'passport',
    id_number: p.country === 'MU' ? `${p.last[0]}${String(int(1000000, 9999999))}${int(1000000, 9999999)}` : `P${int(10000000, 99999999)}`,
    id_expiry_date: i === 3 ? d(30) : i === 11 ? d(25) : d(int(200, 3000)),
    occupation: p.occupation, employer: p.employer, income_band: p.income_band, source_of_wealth: `${p.occupation} — employment income and savings`,
    email: p.email, mobile: p.mobile, preferred_language: p.language, preferred_channel: pick(['email', 'email', 'phone', 'sms', 'whatsapp']),
    address: `${int(1, 120)} ${pick(STREETS)}`, country_of_residence: p.country, segment: p.segment, client_group: groupOf('i', i),
    primary_rm: p.rm, investor_classification: p.segment === 'uhnw' ? 'professional' : 'retail',
    pep: p.pep, vip: p.vip, vip_reason: p.vip_reason, do_not_contact: p.dnc, _owner: p.rm, _created: ago(int(30, 700)),
  })),
  ...organisations.map((o, i) => ({
    ext_ref: o.key, party_type: 'organisation', legal_name: o.legal_name, brn: o.brn, email: o.email, incorporation_country: 'MU',
    incorporation_date: ago(int(2000, 12000)), legal_form: o.sector === 'financial' && o.legal_name.includes('Pension') ? 'pension_fund' : 'company',
    sector: o.sector, revenue_band: o.revenue_band, listed: i === 0 || i === 11 || i === 14, regulated: o.sector === 'financial',
    country_of_residence: 'MU', preferred_language: chance(0.3) ? 'fr' : 'en', segment: o.institutional || o.legal_name.includes('Pension') ? 'institutional' : 'corporate',
    client_group: groupOf('o', i), primary_rm: o.rm, investor_classification: o.institutional ? 'institutional' : 'professional', _owner: o.rm, _created: ago(int(60, 900)),
  })),
]);
const P = (i) => ref('party', individuals[i].key);
const O = (i) => ref('party', organisations[i].key);

add('contact_point', individuals.slice(0, 20).flatMap((p, i) => [
  { ext_ref: `CP-${p.key}-R`, party: P(i), point_type: 'residential', value: `${int(1, 120)} ${pick(STREETS)}`, verified: i % 3 !== 0, verified_on: ago(int(20, 400)), preferred: true },
  ...(i % 2 ? [{ ext_ref: `CP-${p.key}-M`, party: P(i), point_type: 'mobile', value: p.mobile, verified: true, verified_on: ago(int(20, 400)), preferred: false }] : []),
]).concat(organisations.slice(0, 8).map((o, i) => ({ ext_ref: `CP-${o.key}-REG`, party: O(i), point_type: 'registered', value: `${pick(STREETS)} — registered office`, verified: true, verified_on: ago(int(100, 800)), preferred: true }))));

const rel = [
  [1, 'spouse', 6], [0, 'spouse', 24], [2, 'spouse', 12], [13, 'spouse', 27],
  [1, 'director', 'o0'], [1, 'shareholder', 'o0', 35], [5, 'director', 'o1'], [5, 'ubo', 'o1', 60], [2, 'ubo', 'o12', 40],
  [8, 'director', 'o4'], [15, 'director', 'o3'], [19, 'signatory', 'o5'], [22, 'shareholder', 'o9', 25], [6, 'guarantor', 0],
  [30, 'ubo', 'o15', 55], [17, 'director', 'o6'], [26, 'signatory', 'o7'], [33, 'introducer', 3], [7, 'poa', 40], [16, 'employer', 'o13'],
];
add('party_relationship', rel.map(([from, role, to, pct], i) => ({
  ext_ref: `PR-${String(i + 1).padStart(3, '0')}`, from_party: P(from), role, to_party: typeof to === 'string' ? O(Number(to.slice(1))) : P(to),
  ownership_pct: pct ?? null, valid_from: ago(int(200, 3000)),
})));

// Consents: most individuals grant marketing; a few withdraw; some only research.
const marketingConsent = new Set();
const consents = [];
individuals.forEach((p, i) => {
  const granted = !p.dnc && i % 7 !== 3;
  if (granted) marketingConsent.add(i);
  consents.push({ ext_ref: `CON-${p.key}-MKT`, party: P(i), purpose: 'marketing', channel: pick(['email', 'all', 'sms']), status: granted ? 'granted' : 'withdrawn', source: pick(['web_form', 'branch', 'phone']), text_version: '2026-01-v2', captured_on: ago(int(30, 600)), withdrawn_on: granted ? null : ago(int(1, 25)) });
  if (i % 3 === 0) consents.push({ ext_ref: `CON-${p.key}-RES`, party: P(i), purpose: 'research', channel: 'email', status: 'granted', source: 'web_form', text_version: '2026-01-v2', captured_on: ago(int(30, 600)) });
  if (i % 4 === 0) consents.push({ ext_ref: `CON-${p.key}-GRP`, party: P(i), purpose: 'group_sharing', channel: 'all', status: 'granted', source: 'branch', text_version: '2026-01-v2', captured_on: ago(int(30, 600)) });
});
add('consent_record', consents);

// ── KYC ──────────────────────────────────────────────────────────────────────
// Everyone has an onboarding case; most are approved, some in flight.
const approvedKyc = new Set();
const kyc = [];
const kycStages = ['initiated', 'documents_pending', 'under_verification', 'screening', 'risk_assessed', 'pending_approval'];
const allParties = [...individuals.map((p, i) => ({ ref: P(i), key: p.key, i, kind: 'i', pep: p.pep, foreign: p.country !== 'MU', occ: p.occupation_risk, rm: p.rm })),
  ...organisations.map((o, i) => ({ ref: O(i), key: o.key, i, kind: 'o', pep: false, foreign: false, occ: 'medium', rm: o.rm }))];
allParties.forEach((pt, n) => {
  const inFlight = n === 0 || n === 2 || n === 45;
  const decidedDaysAgo = pt.kind === 'o' && pt.i === 2 ? 350 : n === 8 ? 352 : n === 19 ? 340 : int(40, 600);
  // High-risk clients come up for review every year; a few are due now.
  const highRisk = pt.pep || (pt.kind === 'o' && [2, 12].includes(pt.i)) || n === 8 || n === 19;
  const approved = !inFlight;
  if (approved) approvedKyc.add(pt.key);
  kyc.push({
    ext_ref: `KYC-${pt.key}-ON`, party: pt.ref, scope: 'group', review_type: 'onboarding', business_unit: null,
    product_risk: highRisk ? 'high' : pick(['low', 'low', 'medium']), delivery_channel: pt.foreign ? 'non_face_to_face' : 'face_to_face',
    occupation_risk: pt.occ, ownership_complexity: pt.kind === 'o' ? pick(['simple', 'layered', 'layered', 'complex']) : 'simple', transaction_profile: pick(['low', 'medium', 'medium', 'high']),
    documents_complete: approved || n === 2, source_of_funds_verified: approved, screening_result: approved ? 'clear' : (n === 2 ? 'potential_match' : null),
    screening_date: approved ? ago(decidedDaysAgo + 5) : (n === 2 ? ago(3) : null), screening_reference: approved ? `SCR-${10000 + n}` : null,
    fatca_status: pick(['non_us', 'non_us', 'non_us', 'pending']), crs_tax_residencies: pt.foreign ? 'MU; ZA' : 'MU', tin: pt.kind === 'o' ? `TAN${int(10000000, 99999999)}` : null,
    edd_notes: highRisk && approved ? 'Source of wealth: documented business sale (2019). Senior management approval: COO. MLRO sign-off recorded.' : null,
    kyc_outcome: approved ? 'approved' : null, decision_date: approved ? ago(decidedDaysAgo) : null, decided_by: approved ? (highRisk ? 'GCMLRO' : 'GCCOMP1') : null,
    _stage: approved ? 'approved' : (n === 2 ? 'screening' : pick(kycStages)), _owner: pt.rm, _created: ago((approved ? decidedDaysAgo : 0) + int(5, 20)),
  });
});
// Two periodic reviews already opened, one rejected case, one on hold.
kyc.push({ ext_ref: 'KYC-PERIODIC-01', party: O(2), scope: 'group', review_type: 'periodic', documents_complete: true, _stage: 'documents_pending', _owner: 'GCCOMP1', _created: ago(10) });
kyc.push({ ext_ref: 'KYC-PERIODIC-02', party: P(8), scope: 'group', review_type: 'periodic', _stage: 'initiated', _owner: 'GCCOMP1', _created: ago(4) });
add('kyc_case', kyc);

add('screening_hit', [
  { ext_ref: 'HIT-001', kyc_case: ref('kyc_case', `KYC-${individuals[2].key}-ON`), party: P(2), provider: 'world_check', list_type: 'pep', matched_name: 'Priya Naidoo', match_score: 92, source_reference: 'WC-PEP-778812', disposition: 'escalated', reviewer: 'GCCOMP1', rationale: 'Director of a state-owned enterprise in South Africa — PEP by function. Escalated for EDD and MLRO sign-off.' },
  { ext_ref: 'HIT-002', kyc_case: ref('kyc_case', `KYC-${individuals[2].key}-ON`), party: P(2), provider: 'world_check', list_type: 'adverse_media', matched_name: 'P. Naidoo', match_score: 61, disposition: 'pending', source_reference: 'WC-AM-11204' },
  { ext_ref: 'HIT-003', kyc_case: ref('kyc_case', `KYC-${individuals[37].key}-ON`), party: P(37), provider: 'world_check', list_type: 'pep', matched_name: `${individuals[37].first} ${individuals[37].last}`, match_score: 97, disposition: 'true_match', reviewer: 'GCMLRO', rationale: 'Former member of the National Assembly — domestic PEP. EDD completed, approved by MLRO.' },
  { ext_ref: 'HIT-004', kyc_case: ref('kyc_case', `KYC-${individuals[10].key}-ON`), party: P(10), provider: 'world_check', list_type: 'sanctions', matched_name: `${individuals[10].first} ${individuals[10].last.slice(0, 4)}`, match_score: 54, disposition: 'false_positive', reviewer: 'GCCOMP1', rationale: 'Different date of birth and nationality.' },
  { ext_ref: 'HIT-005', kyc_case: ref('kyc_case', `KYC-${organisations[12].key}-ON`), party: O(12), provider: 'world_check', list_type: 'enforcement', matched_name: 'Mascarene Capital', match_score: 70, disposition: 'false_positive', reviewer: 'GCCOMP1', rationale: 'Name similarity with an unrelated foreign entity.' },
  { ext_ref: 'HIT-006', kyc_case: ref('kyc_case', 'KYC-PERIODIC-01'), party: O(2), provider: 'world_check', list_type: 'adverse_media', matched_name: 'Island Agro', match_score: 58, trigger: 'batch', disposition: 'pending' },
]);

add('kyc_reliance', [1, 4, 6, 13, 18, 22].map((i, n) => ({
  ext_ref: `REL-${String(n + 1).padStart(3, '0')}`, kyc_case: ref('kyc_case', `KYC-${individuals[i].key}-ON`), relying_business_unit: pick(['WLT', 'FND', 'SEC', 'LND']),
  relied_on: ago(int(10, 200)), approved_by: 'GCCOMP1', product_addons: 'Suitability questionnaire completed for the relying entity.',
})));

add('str_report', [
  { ext_ref: 'STR-001', party: P(29), suspicion_type: 'structuring', narrative: 'Five cash deposits just below the reporting threshold within ten days, followed by an early settlement request.', transaction_details: 'Deposits of MUR 480k–495k between days 1 and 10.', _stage: 'under_review', _owner: 'GCMLRO' },
  { ext_ref: 'STR-002', party: O(15), suspicion_type: 'third_party', narrative: 'Fund subscriptions paid from unrelated third-party accounts abroad.', _stage: 'filed', fiu_reference: 'FIU-2026-0412', filed_on: ago(41), _owner: 'GCMLRO' },
  { ext_ref: 'STR-003', party: P(41), suspicion_type: 'source_of_funds', narrative: 'Unexplained increase in investable assets inconsistent with declared income.', _stage: 'closed_no_action', _owner: 'GCMLRO' },
]);

// Risk profiles (and web questionnaires without a client yet).
const ANSWERS = [
  ['lt_3', 'sell_all', 'basic', 'capital_preservation'], ['3_5', 'sell_some', 'basic', 'income'], ['5_10', 'hold', 'good', 'balanced'],
  ['5_10', 'hold', 'good', 'growth'], ['gt_10', 'buy_more', 'expert', 'aggressive_growth'], ['gt_10', 'hold', 'good', 'growth'],
];
const profiled = [1, 2, 4, 5, 6, 7, 9, 12, 13, 14, 16, 18, 19, 20, 22, 23, 25, 27, 28, 30, 31, 33, 35, 36, 38, 40, 42, 43];
const profileIdx = new Map();
add('risk_profile', [
  ...profiled.map((i, n) => {
    const a = ANSWERS[(i + n) % ANSWERS.length];
    profileIdx.set(i, `RP-${individuals[i].key}`);
    return {
      ext_ref: `RP-${individuals[i].key}`, party: P(i), profiled_on: ago(int(20, 600)), age: individuals[i].age, client_classification: individuals[i].segment === 'uhnw' ? 'professional' : 'retail',
      time_horizon: a[0], risk_tolerance: a[1], knowledge: a[2], objective: a[3], liquidity_needs: pick(['low', 'medium']), net_worth: round(int(3000000, 90000000), 100000), esg_preference: chance(0.35),
    };
  }),
  ...['Thierry Ng', 'Ameeta Rao', 'Lucas Perrine', 'Divya Seebaluck', 'Olivier Bax', 'Tasneem Joomun'].map((n, k) => {
    const a = ANSWERS[k % ANSWERS.length];
    const [first, last] = n.split(' ');
    return { ext_ref: `RP-WEB-${k + 1}`, first_name: first, last_name: last, email: `${first}.${last}@example.mu`.toLowerCase(), age: int(28, 60), time_horizon: a[0], risk_tolerance: a[1], knowledge: a[2], objective: a[3], esg_preference: chance(0.4) };
  }),
]);

// Mirror the risk-profile formula to pick a product inside each client's ceiling.
const ceilingOf = (i) => {
  const n = profiled.indexOf(i);
  const [h, t, k, o] = ANSWERS[(i + n) % ANSWERS.length];
  const score = { lt_3: 0, '3_5': 10, '5_10': 20, gt_10: 30 }[h] + { sell_all: 0, sell_some: 10, hold: 20, buy_more: 30 }[t]
    + { none: 0, basic: 5, good: 10, expert: 15 }[k] + { capital_preservation: 0, income: 5, balanced: 10, growth: 20, aggressive_growth: 25 }[o]
    + (individuals[i].age >= 65 ? -5 : 0);
  return score >= 80 ? 5 : score >= 60 ? 4 : score >= 40 ? 3 : score >= 20 ? 2 : 1;
};

// ── Service requests & complaints (before the checkpoint: complaints suppress marketing) ──
const SR_TYPES = [['statement_request', 'WLT'], ['address_change', 'LND'], ['early_settlement_quote', 'LND'], ['certificate_of_balance', 'LND'], ['redemption', 'FND'], ['top_up', 'WLT'], ['fx_settlement_query', 'FX'], ['partial_prepayment', 'LND'], ['title_release', 'LND'], ['moratorium_request', 'LND']];
const complainers = new Set([0, 15, 26, 34]);
const srs = [];
for (let n = 0; n < 34; n += 1) {
  const [request_type, bu] = pick(SR_TYPES);
  const i = int(0, 47);
  const open = n % 4 === 0;
  const createdDays = int(3, 330);
  srs.push({
    ext_ref: `SR-${String(n + 1).padStart(3, '0')}`, party: P(i), business_unit: bu, request_type, priority: pick(['low', 'medium', 'medium', 'high']), channel: pick(['email', 'phone', 'walk_in', 'portal']),
    description: `Client request: ${request_type.replace(/_/g, ' ')}.`, created_on: ago(createdDays), resolved_on: open ? null : ago(Math.max(1, createdDays - int(1, 9))),
    csat_score: open ? null : int(3, 5), nps_score: open ? null : int(6, 10), _stage: open ? pick(['new', 'acknowledged', 'in_progress', 'awaiting_client']) : 'closed',
    _owner: bu === 'LND' ? pick(LOAN_EXECS) : pick(RMS), _created: ago(createdDays),
  });
}
const complaintSpecs = [
  [0, 'LND', 'service', 'No update on my application for two weeks.', null, null, 'new'],
  [15, 'WLT', 'product', 'Portfolio performance below what was presented.', 'people', 'Explained the mandate benchmark and risk; offered a review meeting.', 'resolved'],
  [26, 'LND', 'pricing', 'Instalment rose after the PLR change without enough notice.', 'process', 'Notice was sent 30 days ahead; goodwill fee waiver applied.', 'closed'],
  [34, 'FX', 'service', 'Settlement credited a day late.', 'third_party', 'Correspondent bank delay; interest compensated.', 'closed'],
  [10, 'SEC', 'conduct', 'Order executed at a worse price than instructed.', 'system', 'Limit price captured incorrectly; trade corrected and difference refunded.', 'resolved'],
  [20, 'FND', 'pricing', 'Unexpected exit fee on redemption.', 'no_fault', 'Fee disclosed in the prospectus; explained to the client.', 'closed'],
  [29, 'LND', 'service', 'Title deeds release taking too long.', null, null, 'in_progress'],
  [40, 'WLT', 'service', 'Monthly report not received for two months.', null, null, 'acknowledged'],
];
complaintSpecs.forEach(([i, bu, cat, desc, root, response, st], n) => {
  const createdDays = int(5, 200);
  const done = ['resolved', 'closed'].includes(st);
  if (!done) complainers.add(i);
  srs.push({
    ext_ref: `CMP-${String(n + 1).padStart(3, '0')}`, party: P(i), business_unit: bu, request_type: 'complaint', priority: n === 0 ? 'high' : pick(['medium', 'high']), channel: pick(['email', 'phone', 'letter']),
    complaint_category: cat, root_cause: root, final_response: response, redress_amount: n === 4 ? 18500 : n === 3 ? 2400 : null, ombudsperson_referred: n === 2,
    description: desc, created_on: ago(createdDays), acknowledged_on: ago(createdDays - 1), resolved_on: done ? ago(Math.max(1, createdDays - int(5, 14))) : null,
    csat_score: done ? int(2, 4) : null, _stage: st, _owner: bu === 'LND' ? 'GCLMGR' : 'GCCOMP1', _created: ago(createdDays),
  });
});
add('service_request', srs);

// Checkpoint: party roll-ups (KYC status, consent, complaints, profile ceiling)
// must be current before orders, suitability and campaign audiences validate.
sets.push({ recompute: ['party'] });

const kycOk = (pi) => approvedKyc.has(individuals[pi].key);
const kycOkOrg = (oi) => approvedKyc.has(organisations[oi].key);

// ── Relationships per entity ─────────────────────────────────────────────────
const crs = [];
const holdingParties = { WLT: [1, 4, 6, 9, 12, 13, 14, 18, 19, 22, 23, 27, 31, 36, 38, 42], FND: [1, 4, 5, 6, 7, 12, 14, 16, 19, 20, 22, 25, 28, 30, 33, 35, 36, 40, 43], SEC: [4, 5, 7, 13, 16, 20, 23, 25, 31, 35, 38, 43], LND: [0, 3, 8, 10, 11, 15, 17, 21, 24, 26, 29, 32, 34, 37, 39, 41, 44, 45, 46, 47], FX: [2, 5, 9, 17, 28] };
for (const [bu, list] of Object.entries(holdingParties)) {
  list.forEach((i) => crs.push({
    ext_ref: `CR-${individuals[i].key}-${bu}`, party: P(i), business_unit: bu, segment: individuals[i].segment, onboarded_on: ago(int(30, 900)),
    _stage: kycOk(i) ? (chance(0.08) ? 'dormant' : 'active') : 'onboarding', _owner: bu === 'LND' ? pick(LOAN_EXECS) : bu === 'WLT' ? pick(['GCRM2', 'GCPM1']) : bu === 'FND' ? 'GCPM2' : bu === 'SEC' ? 'GCTRD1' : 'GCFX1',
  }));
}
[[0, 'LND'], [0, 'FX'], [0, 'ADV'], [1, 'FX'], [1, 'LND'], [2, 'LND'], [3, 'ADV'], [4, 'LND'], [5, 'LND'], [5, 'FX'], [6, 'FX'], [6, 'LND'], [7, 'WLT'], [7, 'FND'], [8, 'FND'], [8, 'SEC'], [9, 'LND'], [10, 'FX'], [11, 'FX'], [12, 'ADV'], [13, 'LND'], [14, 'LND'], [15, 'ADV']]
  .forEach(([oi, bu]) => crs.push({ ext_ref: `CR-${organisations[oi].key}-${bu}`, party: O(oi), business_unit: bu, segment: ['institutional', 'corporate'][oi === 7 || oi === 8 ? 0 : 1], onboarded_on: ago(int(60, 1200)), _stage: kycOkOrg(oi) ? 'active' : 'onboarding', _owner: bu === 'ADV' ? 'GCADV1' : bu === 'FX' ? 'GCFX1' : 'GCRM3' }));
add('client_relationship', crs);

// ── Enquiries (12 months), web events and referrals ──────────────────────────
const ENQ_PRODUCTS = [['LND-RE', 20], ['LND-PL', 10], ['LND-IBL', 4], ['LND-COM', 5], ['WLT-DPM', 10], ['FND-MMF', 6], ['FND-INC', 6], ['FND-FEQ', 4], ['FND-EME', 2], ['FND-GPE', 2], ['FND-FMB29', 8], ['SEC-LOC', 5], ['SEC-INT', 4], ['SEC-MKT', 2], ['ADV-FR', 3], ['ADV-VAL', 3], ['ADV-RES', 2], ['FX-SPOT', 4], ['FX-FWD', 3], ['FX-SWAP', 1], ['FX-GEN', 2]];
const weighted = ENQ_PRODUCTS.flatMap(([p, w]) => Array(w).fill(p));
const ENQ_FIRST = ['Thierry', 'Ameeta', 'Lucas', 'Divya', 'Olivier', 'Tasneem', 'Marc', 'Pooja', 'Julien', 'Reshma', 'Cédric', 'Anusha', 'Guillaume', 'Kavita', 'Loïc', 'Nirmala', 'Sébastien', 'Shalini', 'Bruno', 'Vidya'];
const ENQ_LAST = ['Ng', 'Rao', 'Perrine', 'Seebaluck', 'Bax', 'Joomun', 'Fanchette', 'Gungah', 'Mamet', 'Hurree', 'Lagane', 'Teeluck', 'Maigrot', 'Nundlall', 'Pitot', 'Ramnarain', 'Rose', 'Soobrayen', 'Sauzier', 'Toofany'];
const STAGES = ['new', 'contacted', 'qualified', 'converted', 'nurture', 'disqualified'];
const enquiries = [];
for (let n = 0; n < 130; n += 1) {
  const product_code = n < 4 ? ['LND-RE', 'WLT-DPM', 'FX-GEN', 'FND-FMB29'][n] : pick(weighted);
  const createdDays = n < 4 ? int(1, 12) : int(1, 365);
  const first = ENQ_FIRST[n % 20];
  const last = ENQ_LAST[(n * 7) % 20];
  const age = createdDays < 30 ? pick([0, 1, 2]) : 3;
  const stage = n < 4 ? ['new', 'contacted', 'qualified', 'new'][n] : age < 3 ? pick(['new', 'new', 'contacted']) : pick(['contacted', 'qualified', 'converted', 'converted', 'nurture', 'disqualified']);
  const isLoan = product_code.startsWith('LND');
  const amount = isLoan ? round(int(product_code === 'LND-PL' ? 500000 : 1500000, product_code === 'LND-COM' ? 80000000 : 15000000), 50000)
    : product_code.startsWith('FX') ? round(int(20000, 400000), 5000) : round(int(250000, 25000000), 50000);
  const corporate = ['LND-COM', 'ADV-FR', 'ADV-VAL', 'ADV-RES'].includes(product_code) || (product_code.startsWith('FX') && chance(0.5));
  enquiries.push({
    ext_ref: `ENQ-${String(n + 1).padStart(4, '0')}`, party_type: corporate ? 'organisation' : 'individual', first_name: first, last_name: last,
    company: corporate ? `${last} ${pick(['Holdings', 'Trading', 'Industries', 'Ventures'])} Ltd` : null,
    email: `${first}.${last}${n}@example.mu`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), mobile: `5${int(7000000, 7999999)}`,
    preferred_language: chance(0.3) ? 'fr' : 'en', country_of_residence: chance(0.9) ? 'MU' : pick(['SC', 'RE', 'ZA']), product_code, estimated_amount: amount,
    currency_code: product_code.startsWith('FX') || product_code === 'FND-GPE' ? 'USD' : (chance(0.1) ? 'EUR' : 'MUR'),
    requested_tenure_months: isLoan ? pick(product_code === 'LND-RE' ? [180, 240, 300] : [36, 60, 84, 120]) : null, applicant_age: isLoan ? int(28, 50) : null,
    investable_assets: product_code.startsWith('WLT') || product_code.startsWith('FND') ? amount : null, investment_horizon: product_code.startsWith('WLT') ? pick(['3_5', '5_10', 'gt_10']) : null,
    fx_currency_pair: product_code.startsWith('FX') ? pick(['USD/MUR', 'EUR/MUR', 'GBP/MUR', 'ZAR/MUR']) : null, fx_purpose: product_code.startsWith('FX') ? pick(['imports', 'exports', 'education', 'property']) : null,
    advisory_need: product_code.startsWith('ADV') ? { 'ADV-FR': 'fund_raising', 'ADV-VAL': 'valuation', 'ADV-RES': 'restructuring' }[product_code] : null,
    message: n === 0 ? 'Buying an apartment in Ebène.' : `Interested in ${product_code}.`,
    channel: n < 4 ? ['web_form', 'referral', 'phone', 'event'][n] : pick(['web_form', 'web_form', 'web_form', 'calculator', 'phone', 'email', 'walk_in', 'event', 'referral', 'introducer', 'social', 'questionnaire']),
    utm_source: chance(0.4) ? pick(['google', 'facebook', 'linkedin', 'newsletter']) : null, utm_campaign: chance(0.3) ? pick(['fmb2029', 'home-loans-q3', 'wealth-seminar']) : null,
    consent_marketing: chance(0.75), consent_text_version: '2026-01-v2',
    disqualify_reason: stage === 'disqualified' ? pick(['no_need', 'not_eligible', 'duplicate', 'unreachable']) : null,
    _stage: stage, _created: ago(createdDays),
  });
}
add('enquiry', enquiries);

add('web_event', Array.from({ length: 70 }, (_, n) => {
  const product_code = pick(['LND-RE', 'LND-RE', 'LND-PL', 'LND-IBL']);
  const converted = n % 5 === 0 && n / 5 < 26;
  return {
    ext_ref: `WEB-${String(n + 1).padStart(4, '0')}`, event_type: 'calculator', product_code, amount: round(int(product_code === 'LND-PL' ? 500000 : 1500000, 12000000), 50000),
    tenure_months: pick([60, 120, 180, 240, 300]), applicant_age: int(25, 55), page_url: `https://www.genesis-capital.demo/products-services/financing-solutions/individuals/${product_code === 'LND-PL' ? 'personal-loan' : 'real-estate-loan'}/`,
    utm_source: pick(['google', 'facebook', null, null]), session_date: ago(int(1, 365)),
    enquiry: converted ? ref('enquiry', `ENQ-${String((n / 5) * 5 + 1).padStart(4, '0')}`) : null, _created: ago(int(1, 365)),
  };
}));

add('referral', Array.from({ length: 16 }, (_, n) => {
  const i = [4, 6, 12, 14, 19, 22, 0, 3, 8, 10, 24, 32, 1, 13, 27, 31][n];
  const [from_business_unit, to_business_unit, product_code] = pick([['LND', 'WLT', 'WLT-DPM'], ['WLT', 'LND', 'LND-IBL'], ['FND', 'LND', 'LND-IBL'], ['LND', 'FX', 'FX-FWD'], ['WLT', 'SEC', 'SEC-INT'], ['LND', 'FND', 'FND-MMF']]);
  const stage = pick(['submitted', 'accepted', 'in_progress', 'won', 'won', 'lost']);
  return {
    ext_ref: `REFX-${String(n + 1).padStart(3, '0')}`, party: P(i), from_business_unit, to_business_unit, product_code, reason: `Cross-entity opportunity: ${product_code}.`,
    receiving_rm: to_business_unit === 'LND' ? 'GCLOAN1' : to_business_unit === 'WLT' ? 'GCRM2' : to_business_unit === 'FX' ? 'GCFX1' : 'GCTRD1',
    estimated_value: round(int(500000, 20000000), 50000), outcome: stage === 'won' ? 'won' : stage === 'lost' ? 'lost' : null, _stage: stage, _created: ago(int(5, 300)),
  };
}));

// ── Retail lending ───────────────────────────────────────────────────────────
const loanStages = ['enquiry', 'pre_qualified', 'application_captured', 'documents_pending', 'documents_complete', 'credit_appraisal', 'credit_approval', 'offer_issued', 'offer_accepted', 'security_perfection', 'ready_for_disbursement'];
const loans = [];
// Borrowers young enough for the loan to end by 65; investment-backed loans
// go to existing fund holders (their units are pledged as security).
const IBL_BORROWERS = [6, 30, 36];
const borrowers = [0, 3, 8, 10, 6, 15, 17, 21, 24, 30, 26, 29, 32, 34, 37, 39, 41, 44, 45, 46, 47, 11, 13, 18, 27, 36, 42, 9, 1, 23]
  .filter((i) => i === 0 || individuals[i].age <= 58);
borrowers.forEach((i, n) => {
  const p = individuals[i];
  const product_code = n === 0 ? 'LND-RE' : IBL_BORROWERS.includes(i) ? 'LND-IBL' : n % 4 === 1 ? 'LND-PL' : 'LND-RE';
  const maxTenure = Math.min(product_code === 'LND-RE' ? 360 : 120, Math.max(24, (64 - p.age) * 12));
  const tenure_months = Math.max(24, Math.min(maxTenure, pick(product_code === 'LND-RE' ? [180, 240, 300] : [48, 60, 84, 120])));
  const loan_amount = n === 0 ? 8000000 : product_code === 'LND-PL' ? round(int(500000, 3500000), 50000) : product_code === 'LND-IBL' ? round(int(800000, 4000000), 50000) : round(int(2500000, 22000000), 50000);
  const property_value = product_code === 'LND-RE' ? round(loan_amount / (int(60, 95) / 100), 50000) : product_code === 'LND-PL' ? round(loan_amount * 2.5, 50000) : null;
  const monthly_income = round(Math.max(60000, loan_amount / 55), 1000);
  const stage = n === 0 ? 'documents_pending'
    : n < 14 ? (kycOk(i) ? 'disbursed' : 'security_perfection')
      : n < 17 ? 'declined' : n === 17 ? 'withdrawn' : n === 18 ? 'lapsed' : pick(loanStages.slice(1));
  const approved = ['offer_issued', 'offer_accepted', 'security_perfection', 'ready_for_disbursement', 'disbursed'].includes(stage);
  const createdDays = stage === 'disbursed' ? int(60, 360) : int(5, 90);
  const security = ['security_perfection', 'ready_for_disbursement', 'disbursed'].includes(stage);
  loans.push({
    ext_ref: `LA-${String(n + 1).padStart(3, '0')}`, party: P(i), product_code,
    purpose: product_code === 'LND-RE' ? pick(['purchase_residential', 'construction_lot', 'renovation', 're_investment']) : product_code === 'LND-PL' ? pick(['car', 'education', 'wedding', 'travel']) : 'liquidity',
    loan_amount, currency_code: 'MUR', tenure_months, repayment_type: n % 11 === 3 ? 'moratorium' : n % 13 === 5 ? 'interest_only' : 'amortising', moratorium_months: n % 11 === 3 ? 12 : null,
    employment_type: p.occupation === 'Business owner' || p.occupation === 'Property developer' ? 'self_employed' : p.occupation === 'Retired' ? 'retired' : 'salaried',
    monthly_income, existing_obligations: round(int(0, monthly_income * 0.15), 500), property_value, mcib_consent: true,
    risk_grade: approved || stage === 'declined' || stage === 'credit_approval' ? pick(['A', 'B', 'B', 'C']) : null,
    analyst_recommendation: approved ? pick(['approve', 'approve_conditions']) : stage === 'declined' ? 'decline' : null,
    conditions: approved ? 'CP: valuation report, notarised deed, insurance assignment. CS: annual income confirmation.' : null,
    credit_decision: approved ? 'approved' : stage === 'declined' ? 'declined' : null, decision_date: approved || stage === 'declined' ? ago(Math.max(1, createdDays - int(10, 25))) : null,
    decline_reason: stage === 'declined' ? pick(['affordability', 'credit_history', 'security']) : null,
    offer_date: approved || stage === 'lapsed' ? ago(Math.max(1, createdDays - int(25, 35))) : null, plr_at_offer: approved ? 6.825 : null,
    offer_accepted: ['offer_accepted', 'security_perfection', 'ready_for_disbursement', 'disbursed'].includes(stage),
    valuation_received: security, notary_appointed: security, charge_registered: security, life_insurance_assigned: security && product_code === 'LND-RE', building_insurance_assigned: security && product_code === 'LND-RE',
    pledge_registered: security && product_code === 'LND-IBL', disbursement_amount: ['ready_for_disbursement', 'disbursed'].includes(stage) ? loan_amount : null,
    maker: stage === 'disbursed' ? pick(LOAN_EXECS) : null, lms_reference: stage === 'disbursed' ? `LMS-${100200 + n}` : null,
    outcome: stage === 'disbursed' ? 'disbursed' : ['declined', 'withdrawn', 'lapsed'].includes(stage) ? stage : null,
    _stage: stage, _owner: n % 2 ? 'GCLOAN2' : 'GCLOAN1', _created: ago(createdDays),
  });
});
add('loan_application', loans);
const loanByN = (n) => ref('loan_application', `LA-${String(n + 1).padStart(3, '0')}`);

const applicants = [];
loans.forEach((l, n) => {
  applicants.push({ ext_ref: `APP-${l.ext_ref}-1`, loan_application: loanByN(n), party: l.party, role: 'primary', relationship: 'self', employment_type: l.employment_type, monthly_income: l.monthly_income, existing_obligations: l.existing_obligations, mcib_rating: n < 20 ? pick(['clean', 'clean', 'clean', 'minor']) : 'not_pulled', mcib_pulled_on: n < 20 ? ago(int(20, 200)) : null, signed_offer: l.offer_accepted });
  if (n % 3 === 0) {
    const spouse = { 0: 24, 1: 6 }[borrowers[n]] ?? int(0, 47);
    applicants.push({ ext_ref: `APP-${l.ext_ref}-2`, loan_application: loanByN(n), party: P(spouse), role: n % 6 === 0 ? 'co_borrower' : 'guarantor', relationship: n % 6 === 0 ? 'spouse' : 'parent', monthly_income: round(int(40000, 150000), 1000), mcib_rating: 'clean', signed_offer: l.offer_accepted });
  }
});
add('loan_applicant', applicants);

add('credit_condition', loans.flatMap((l, n) => (l.credit_decision === 'approved' ? [
  { ext_ref: `CC-${l.ext_ref}-1`, loan_application: loanByN(n), condition_type: 'cp', condition: 'Valuation report by an approved valuer', status: l.valuation_received ? 'satisfied' : 'open', due_date: ago(-15), satisfied_on: l.valuation_received ? ago(int(5, 40)) : null },
  { ext_ref: `CC-${l.ext_ref}-2`, loan_application: loanByN(n), condition_type: 'cp', condition: 'Life and building insurance assigned to Genesis Life Ltd', status: l.life_insurance_assigned || l.product_code !== 'LND-RE' ? 'satisfied' : 'open', due_date: ago(-20), satisfied_on: l.life_insurance_assigned ? ago(int(5, 40)) : null },
  { ext_ref: `CC-${l.ext_ref}-3`, loan_application: loanByN(n), condition_type: 'cs', condition: 'Annual income confirmation for three years', status: 'open', due_date: d(int(60, 360)) },
] : [])));

const offerApps = loans.map((l, n) => [l, n]).filter(([l]) => l.credit_decision === 'approved').slice(0, 10);
add('loan_offer', offerApps.flatMap(([l, n]) => [l.tenure_months - 60, l.tenure_months].filter((t) => t >= 24).map((t, k) => ({
  ext_ref: `OF-${l.ext_ref}-${k + 1}`, loan_application: loanByN(n), scenario: `${t / 12} years ${l.repayment_type}`, amount: l.loan_amount, tenure_months: t,
  arrangement_fee_pct: 0.5, selected: k === 1, valid_until: d(int(5, 30)), signed_on: k === 1 && l.offer_accepted ? ago(int(3, 30)) : null,
}))));

add('disbursement', loans.map((l, n) => [l, n]).filter(([l]) => ['ready_for_disbursement', 'disbursed'].includes(l._stage)).flatMap(([l, n]) => {
  const staged = l.purpose === 'construction_lot' || l.purpose === 'renovation';
  const tranches = staged ? [0.4, 0.35, 0.25] : [1];
  return tranches.map((share, k) => ({
    ext_ref: `DB-${l.ext_ref}-${k + 1}`, loan_application: loanByN(n), tranche_no: k + 1, amount: round(l.loan_amount * share, 1000), stage_certificate: staged, conditions_met: true,
    maker: l.maker ?? 'GCLOAN1', checker: l._stage === 'disbursed' ? 'GCOPS1' : null, lms_reference: l._stage === 'disbursed' && (k === 0 || !staged) ? `${l.lms_reference}-T${k + 1}` : null,
    value_date: l._stage === 'disbursed' && (k === 0 || !staged) ? ago(int(10, 200)) : null,
    status: l._stage === 'disbursed' && (k === 0 || !staged) ? 'booked' : 'requested', _stage: l._stage === 'disbursed' && (k === 0 || !staged) ? 'booked' : (k === 0 ? 'checking' : 'requested'),
  }));
}));

// ── Funds (NAV, holdings, campaigns, orders) ─────────────────────────────────
const CLASSES = [['MMF-USD', 10.0, 0.0035], ['MMF-MUR', 100, 0.003], ['MMF-EUR', 10.0, 0.0028], ['INC-MUR', 25.0, 0.005], ['FEQ-USD', 18.0, 0.009], ['FEQ-MUR', 410, 0.008], ['EME-USD', 12.0, 0.004], ['GPE-USD', 115.0, 0.011], ['FMB29-USD', 100, 0.0045]];
const navs = [];
const latestNav = {};
CLASSES.forEach(([code, base, drift]) => {
  let nav = base;
  for (let m = 12; m >= 0; m -= 1) {
    nav = Math.round(nav * (1 + drift + (rnd() - 0.45) * drift * 3) * 10000) / 10000;
    navs.push({ ext_ref: `NAV-${code}-${monthEnd(m)}`, share_class: `@fund_share_class:class_code=${code}`, nav_date: m === 0 ? ago(1) : monthEnd(m), nav });
  }
  latestNav[code] = nav;
});
add('nav_history', navs);

const holdings = [];
const pledgedHoldings = [];
holdingParties.FND.forEach((i, n) => {
  if (!kycOk(i)) return;
  const classes = [pick(['MMF-MUR', 'INC-MUR', 'MMF-USD']), ...(n % 2 ? [pick(['FEQ-USD', 'FEQ-MUR', 'EME-USD'])] : []), ...(n % 4 === 0 ? ['FMB29-USD'] : []), ...(individuals[i].segment === 'uhnw' && n % 3 === 0 ? ['GPE-USD'] : [])];
  [...new Set(classes)].forEach((code) => {
    const units = round(int(code.endsWith('USD') ? 2000 : 10000, code.endsWith('USD') ? 60000 : 200000) / (code === 'GPE-USD' ? 20 : 1), 10);
    const key = `FH-${individuals[i].key}-${code}`;
    holdings.push({ ext_ref: key, party: P(i), share_class: `@fund_share_class:class_code=${code}`, units, book_cost: Math.round(units * latestNav[code] * (0.9 + rnd() * 0.08)), as_of: ago(1), pledged: false });
    if (['INC-MUR', 'FEQ-MUR', 'FEQ-USD', 'EME-USD'].includes(code)) pledgedHoldings.push({ key, i });
  });
});
// Institutional unitholders.
[[7, 'INC-MUR', 900000], [7, 'MMF-MUR', 2500000], [8, 'FEQ-USD', 120000], [8, 'MMF-USD', 300000]].forEach(([oi, code, units]) => holdings.push({ ext_ref: `FH-${organisations[oi].key}-${code}`, party: O(oi), share_class: `@fund_share_class:class_code=${code}`, units, book_cost: Math.round(units * latestNav[code] * 0.95), as_of: ago(1) }));
add('fund_holding', holdings);

add('fund_campaign', [
  { ext_ref: 'FC-FMB29-S1', name: 'Fixed Maturity Bond 2029 — Series 1', share_class: '@fund_share_class:class_code=FMB29-USD', window_opens: ago(470), window_closes: ago(400), target_raise: 500000000, maturity_plan: 'Maturity letters 6 and 3 months before May 2029; reinvestment proposals into the Income Fund and a successor FMB. Minimum subscription USD 50,000; entry fee up to 2%.', _stage: 'closed' },
  { ext_ref: 'FC-FMB29-S2', name: 'Fixed Maturity Bond 2029 — Series 2', share_class: '@fund_share_class:class_code=FMB29-USD', window_opens: ago(25), window_closes: d(35), target_raise: 300000000, maturity_plan: 'Same maturity plan as Series 1.', _stage: 'open' },
]);

const CLASS_RISK = { 'MMF-MUR': 1, 'MMF-USD': 1, 'MMF-EUR': 1, 'INC-MUR': 2, 'FMB29-USD': 2, 'FEQ-MUR': 4, 'FEQ-USD': 4, 'EME-USD': 5, 'GPE-USD': 5 };
const orders = [];
holdingParties.FND.forEach((i, n) => {
  if (!kycOk(i)) return;
  for (let k = 0; k < 2 + (n % 2); k += 1) {
    const code = pick(['MMF-MUR', 'INC-MUR', 'MMF-USD', 'FMB29-USD', 'FEQ-MUR']);
    const order_type = k === 2 ? 'redemption' : 'subscription';
    const usd = code.endsWith('USD');
    const fmb = code === 'FMB29-USD';
    // An override is recorded exactly where the fund is above the client's profile (SUIT-FR-04).
    const higherRisk = order_type === 'subscription' && profileIdx.has(i) && CLASS_RISK[code] > ceilingOf(i);
    const created = int(2, 360);
    const done = created > 7;
    orders.push({
      ext_ref: `FO-${individuals[i].key}-${k + 1}`, party: P(i), share_class: `@fund_share_class:class_code=${code}`, order_type,
      fund_campaign: fmb ? (created < 25 ? ref('fund_campaign', 'FC-FMB29-S2') : ref('fund_campaign', 'FC-FMB29-S1')) : null,
      amount: fmb ? round(int(50000, 400000), 5000) : usd ? round(int(5000, 60000), 500) : round(int(50000, 2000000), 5000),
      suitability_override: higherRisk ? 'Client informed of the higher risk; allocation limited to 10% of investable assets.' : null, client_acknowledged: higherRisk,
      cut_off_date: ago(created), payment_proof_received: done, ta_reference: done ? `TA-${200000 + orders.length}` : null,
      maker: 'GCPM2', _stage: done ? 'confirmed' : pick(['captured', 'checked', 'submitted_to_ta']), _owner: 'GCPM2', _created: ago(created),
    });
  }
});
add('fund_order', orders);

add('distribution_notice', [
  { ext_ref: 'DN-INC-1', share_class: '@fund_share_class:class_code=INC-MUR', record_date: monthEnd(6), payment_date: d(-170), amount_per_unit: 0.42, published: true, notice_text: 'Semi-annual income distribution of MUR 0.42 per unit.' },
  { ext_ref: 'DN-MMF-1', share_class: '@fund_share_class:class_code=MMF-MUR', record_date: monthEnd(3), payment_date: d(-80), amount_per_unit: 0.95, published: true, notice_text: 'Quarterly distribution of MUR 0.95 per unit.' },
  { ext_ref: 'DN-FMB-1', share_class: '@fund_share_class:class_code=FMB29-USD', record_date: monthEnd(1), payment_date: d(-20), amount_per_unit: 1.3, published: true, notice_text: 'Quarterly dividend of USD 1.30 per unit on the Fixed Maturity Bond 2029 (Series 1).' },
  { ext_ref: 'DN-INC-2', share_class: '@fund_share_class:class_code=INC-MUR', record_date: d(30), payment_date: d(45), amount_per_unit: 0.44, published: false, notice_text: 'Forthcoming semi-annual distribution (draft).' },
]);

// ── Wealth mandates, reviews, AUM ────────────────────────────────────────────
const mandates = [];
holdingParties.WLT.forEach((i, n) => {
  const ccy = pick(['USD', 'USD', 'EUR', 'MUR']);
  const aum = ccy === 'MUR' ? round(int(15000000, 150000000), 100000) : round(int(300000, 6000000), 10000);
  const stage = !kycOk(i) ? pick(['discovery', 'risk_profiling', 'proposal']) : n < 13 ? 'active' : pick(['signed', 'funded', 'proposal']);
  mandates.push({
    ext_ref: `WM-${individuals[i].key}`, party: P(i), risk_profile: profileIdx.has(i) ? ref('risk_profile', profileIdx.get(i)) : null,
    mandate_type: n % 5 === 0 ? 'advisory' : 'discretionary', base_currency: ccy, benchmark: pick(['MSCI ACWI', '60/40 Global', 'SEMDEX + Bloomberg Global Agg']),
    custodian: pick(['Genesis Securities Ltd', 'SBM Custody', 'Standard Bank Custody']), portfolio_manager: n % 2 ? 'GCPM1' : 'GCRM2', review_frequency: individuals[i].segment === 'uhnw' ? 'quarterly' : 'semi_annual',
    management_fee_pct: individuals[i].segment === 'uhnw' ? 0.75 : 1.0, performance_fee_pct: n % 3 === 0 ? 10 : null, minimum_fee: ccy === 'MUR' ? 75000 : 1500,
    aum: stage === 'active' || stage === 'funded' ? aum : null, aum_as_of: stage === 'active' ? monthEnd(0) : null, next_review: d(int(-20, 120)),
    esg_restrictions: chance(0.3) ? 'Exclude tobacco and controversial weapons; tilt to ESG leaders.' : null,
    _stage: stage, _owner: n % 2 ? 'GCPM1' : 'GCRM2', _created: ago(int(60, 900)),
  });
});
add('wealth_mandate', mandates);

const snapshots = [];
const reviews = [];
mandates.forEach((m) => {
  if (!m.aum) return;
  let mv = m.aum * 0.92;
  let ytd = 0;
  for (let k = 5; k >= 0; k -= 1) {
    const r = (rnd() - 0.4) * 2.4;
    ytd = Math.round((ytd + r) * 100) / 100;
    const flows = chance(0.25) ? round((rnd() - 0.4) * m.aum * 0.05, 1000) : 0;
    mv = Math.round(mv * (1 + r / 100) + flows);
    snapshots.push({
      ext_ref: `AUM-${m.ext_ref}-${monthEnd(k)}`, wealth_mandate: ref('wealth_mandate', m.ext_ref), as_of: monthEnd(k), market_value: mv,
      equities: Math.round(mv * 0.55), bonds: Math.round(mv * 0.3), cash: Math.round(mv * 0.05), alternatives: Math.round(mv * 0.1),
      net_flows: flows, mtd_return_pct: Math.round(r * 100) / 100, ytd_return_pct: ytd, since_inception_pct: Math.round((ytd + 18 + rnd() * 20) * 100) / 100,
    });
  }
  reviews.push({ ext_ref: `MR-${m.ext_ref}-1`, wealth_mandate: ref('wealth_mandate', m.ext_ref), review_type: m.review_frequency === 'quarterly' ? 'quarterly' : 'semi_annual', due_date: ago(int(120, 180)), held_on: ago(int(110, 170)), suitability_confirmed: true, outcome: pick(['no_change', 'rebalance', 'top_up']), minutes: 'Reviewed performance against benchmark; allocation in line with the model portfolio; no change to objectives.', _stage: 'completed' });
  const overdue = chance(0.2);
  reviews.push({ ext_ref: `MR-${m.ext_ref}-2`, wealth_mandate: ref('wealth_mandate', m.ext_ref), review_type: m.review_frequency === 'quarterly' ? 'quarterly' : 'semi_annual', due_date: overdue ? ago(int(5, 40)) : d(int(5, 90)), _stage: overdue ? 'pack_prepared' : 'scheduled' });
});
add('aum_snapshot', snapshots);
add('mandate_review', reviews);

add('saac_decision', [
  { ext_ref: 'SAAC-1', title: 'Reduce US equity overweight', meeting_date: ago(150), affected_models: 'D', rationale: 'Valuations stretched after a strong rally; take profits.', allocation_change: 'US equities −5%, global bonds +3%, cash +2% in model D.', client_communication_sent: true },
  { ext_ref: 'SAAC-2', title: 'Add short-duration investment-grade bonds', meeting_date: ago(90), affected_models: 'all', rationale: 'Higher yields at the short end improve the risk-return trade-off.', allocation_change: '+5% short-duration IG across A–C.', client_communication_sent: true },
  { ext_ref: 'SAAC-3', title: 'Increase emerging-market equity', meeting_date: ago(30), affected_models: 'E', rationale: 'Improving earnings momentum in Asia ex-Japan.', allocation_change: 'EM equities +4% funded from developed markets.', client_communication_sent: false },
  { ext_ref: 'SAAC-4', title: 'Introduce ESG tilt to all models', meeting_date: ago(210), affected_models: 'all', rationale: 'Client demand and better data coverage.', allocation_change: 'Replace core ETFs with ESG-screened equivalents.', client_communication_sent: true },
]);

// Suitability records — one deliberate override (GPE for a moderate profile).
add('suitability_record', profiled.slice(0, 18).map((i, n) => {
  const override = n === 5;
  const ceiling = ceilingOf(i);
  const product = override ? 'FND-GPE' : ceiling >= 3 ? pick(['WLT-DPM', 'FND-INC', 'FND-MMF']) : ceiling === 2 ? pick(['FND-INC', 'FND-MMF']) : 'FND-MMF';
  return {
    ext_ref: `SUIT-${individuals[i].key}`, party: P(i), risk_profile: ref('risk_profile', profileIdx.get(i)), business_unit: pick(['WLT', 'FND']),
    product_code: product, rationale: 'Matches the client\'s objective, horizon and capacity for loss.',
    risks_disclosed: 'Capital at risk; past performance is not a guide; liquidity and currency risk explained.',
    override_reason: override ? 'Client is a professional investor with private-equity experience; allocation capped at 5% of assets.' : null, client_acknowledged: true,
  };
}));

// ── Securities ───────────────────────────────────────────────────────────────
const accounts = [];
holdingParties.SEC.forEach((i, n) => {
  accounts.push({
    ext_ref: `SA-${individuals[i].key}`, party: P(i), account_type: n % 5 === 0 ? 'joint' : 'individual', markets: pick(['sem', 'both', 'international']),
    custodian: 'Genesis Securities Ltd', settlement_bank: `MCB ${int(100000000, 999999999)}`, cds_account_no: kycOk(i) ? `CDS-${int(100000, 999999)}` : null, oms_account_no: kycOk(i) ? `OMS-${int(10000, 99999)}` : null,
    trading_limit: round(int(1000000, 20000000), 100000), appropriateness_ok: kycOk(i), agreement_signed: kycOk(i),
    portfolio_value: kycOk(i) ? round(int(500000, 40000000), 1000) : null, last_trade_date: n === 3 ? ago(420) : ago(int(1, 120)),
    _stage: kycOk(i) ? 'active' : pick(['requested', 'kyc_suitability', 'agreement']), _owner: 'GCTRD1', _created: ago(int(60, 1000)),
  });
});
[[7, 'corporate'], [8, 'corporate'], [12, 'nominee']].forEach(([oi, type]) => accounts.push({ ext_ref: `SA-${organisations[oi].key}`, party: O(oi), account_type: type, markets: 'both', custodian: 'Genesis Securities Ltd', cds_account_no: `CDS-${int(100000, 999999)}`, oms_account_no: `OMS-${int(10000, 99999)}`, trading_limit: 250000000, appropriateness_ok: true, agreement_signed: true, portfolio_value: round(int(80000000, 600000000), 1000), last_trade_date: ago(int(1, 30)), _stage: 'active', _owner: 'GCTRD1' }));
add('securities_account', accounts);

const SEM = [['MCB Group', 520], ['IBL Ltd', 41], ['SBM Holdings', 5.6], ['New Mauritius Hotels', 21], ['Sun Ltd', 42], ['CIEL Ltd', 7.2], ['Omnicane', 30], ['Lux Island Resorts', 64], ['ENL Ltd', 23], ['Rogers & Co', 26]];
const INTL = [['Apple Inc', 228], ['iShares Core MSCI World ETF', 104], ['Vanguard S&P 500 ETF', 520], ['Microsoft Corp', 415], ['SPDR Gold Shares', 245]];
const activeAccounts = accounts.filter((a) => a._stage === 'active');
add('client_order', Array.from({ length: 60 }, (_, n) => {
  const acct = activeAccounts[n % activeAccounts.length];
  const intl = acct.markets !== 'sem' && n % 3 === 0;
  const [instrument, px] = intl ? pick(INTL) : pick(SEM);
  const days = int(0, 300);
  const stage = days < 2 ? pick(['received', 'sent_to_oms']) : n % 17 === 0 ? 'cancelled' : 'executed';
  const quantity = intl ? int(10, 400) : int(100, 20000);
  return {
    ext_ref: `OL-${String(n + 1).padStart(4, '0')}`, securities_account: ref('securities_account', acct.ext_ref), instrument, market: intl ? 'international' : 'sem', side: chance(0.6) ? 'buy' : 'sell',
    quantity, price_type: 'limit', limit_price: px, channel: pick(['phone', 'phone', 'email']), received_at: `${ago(days)} ${String(int(9, 15)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`,
    recording_ref: `REC-${int(100000, 999999)}`, oms_reference: stage === 'executed' ? `OMS-${700000 + n}` : null, executed_price: stage === 'executed' ? Math.round(px * (0.99 + rnd() * 0.02) * 100) / 100 : null,
    _stage: stage, _owner: 'GCTRD1', _created: ago(days),
  };
}));

add('ioi_entry', [[7, 'MCB Group 2031 Notes', 'notes', 150000000, 120000000], [8, 'MCB Group 2031 Notes', 'notes', 100000000, 90000000], [5, 'MCB Group 2031 Notes', 'notes', 5000000, 4000000],
  [4, 'Island Agro IPO', 'equity', 2000000, null], [16, 'Island Agro IPO', 'equity', 1500000, null], [7, 'Island Agro IPO', 'equity', 80000000, null],
  [13, 'Savanne Sugar Bond 2030', 'bond', 3000000, 3000000], [20, 'Savanne Sugar Bond 2030', 'bond', 2500000, 2000000], [8, 'Savanne Sugar Bond 2030', 'bond', 60000000, 55000000]]
  .map(([pi, issue_name, instrument, ind, alloc], n) => ({ ext_ref: `IOI-${n + 1}`, issue_name, party: pi === 7 || pi === 8 ? O(pi) : P(pi), instrument, indicated_amount: ind, allocated_amount: alloc, indicated_on: ago(int(5, 120)) })));

add('research_publication', Array.from({ length: 16 }, (_, n) => {
  const type = n % 4 === 3 ? 'market_statistics' : n % 4 === 2 ? 'research' : 'weekly_highlights';
  return {
    ext_ref: `RES-${n + 1}`, title: type === 'weekly_highlights' ? `Weekly market highlights — week ${52 - n * 2}` : type === 'research' ? pick(['Banking sector outlook', 'Tourism recovery and SEM hotels', 'Mauritius rupee: drivers into 2027', 'Global bonds: duration call']) : `Market statistics — ${period(n)}`,
    publication_type: type, published_on: ago(n * 14 + 2), sem_index: Math.round((2200 + rnd() * 150) * 100) / 100, sem_change_pct: Math.round((rnd() - 0.45) * 300) / 100,
    summary: 'SEMDEX moved on banking and hospitality stocks; foreign investors net buyers.', sent: n > 0, opens: n > 0 ? int(80, 400) : null,
  };
}));

// ── Corporate advisory (behind the barrier) ─────────────────────────────────
const MANDATES = [
  ['Project Dodo', 0, null, 'fund_raising', 'end_to_end_raise', 450000000, 1500000, 1.5, 'execution', 'high'],
  ['Project Kestrel', 2, 14, 'valuation', 'ma_valuation', 1200000000, 2500000, 0.75, 'engagement', 'medium'],
  ['Project Pink Pigeon', 4, null, 'restructuring', 'recap', 300000000, 1800000, 1.0, 'conflict_check', 'medium'],
  ['Project Lambis', 3, null, 'fund_raising', 'debt_bond_share_offer', 250000000, 1000000, 1.25, 'pitch', 'low'],
  ['Project Paille-en-Queue', 6, 11, 'valuation', 'ppa', 800000000, 1200000, 0.5, 'completed', 'high'],
  ['Project Vacoas', 12, null, 'valuation', 'esop', 150000000, 600000, 0, 'origination', 'low'],
  ['Project Tamarin', 9, null, 'restructuring', 'turnaround', 220000000, 1500000, 2.0, 'abandoned', 'low'],
];
add('advisory_mandate', MANDATES.map(([code_name, oi, cp, service_line, service, deal_value, retainer_fee, success_fee_pct, stage, prob], n) => ({
  ext_ref: `ADV-${n + 1}`, code_name, client: O(oi), counterparty: cp != null ? O(cp) : null, service_line, service, currency_code: 'MUR', deal_value, retainer_fee, success_fee_pct,
  stage_probability: prob, mandate_date: ago(int(30, 300)), expected_close: d(int(30, 240)), im_issued: ['execution', 'completed'].includes(stage) && service_line === 'fund_raising',
  conflict_check: ['origination', 'pitch', 'conflict_check'].includes(stage) ? 'pending' : stage === 'abandoned' ? 'declined' : 'cleared',
  engagement_letter_signed: ['execution', 'completed'].includes(stage), _stage: stage, _owner: n % 2 ? 'GCADV2' : 'GCADV1', _created: ago(int(30, 300)),
})));
const advRef = (n) => ref('advisory_mandate', `ADV-${n + 1}`);
add('conflict_check', MANDATES.map((m, n) => ({
  ext_ref: `CCK-${n + 1}`, advisory_mandate: advRef(n),
  decision: ['origination', 'pitch'].includes(m[8]) ? 'pending' : m[8] === 'conflict_check' ? 'pending' : m[8] === 'abandoned' ? 'declined' : n === 1 ? 'managed' : 'cleared',
  controls: n === 1 ? 'Counterparty is a Genesis Securities client: trading desk walled off; research coverage suspended for the deal period.' : null,
  staff_declarations: n === 4 ? 'No staff holdings in the target declared.' : null, decided_by: m[8] === 'conflict_check' || ['origination', 'pitch'].includes(m[8]) ? null : 'GCCOMP1',
  decided_on: m[8] === 'conflict_check' || ['origination', 'pitch'].includes(m[8]) ? null : ago(int(20, 200)),
  _stage: ['origination', 'pitch'].includes(m[8]) ? 'requested' : m[8] === 'conflict_check' ? 'under_review' : 'decided',
})));
const team = [];
const insiders = [];
MANDATES.forEach((m, n) => {
  [['GCADV1', 'Corporate Advisor', 'lead'], ['GCADV2', 'Advisory Analyst', 'analyst'], ['GCCOMP1', 'Compliance Officer', 'compliance']].slice(0, n % 2 ? 2 : 3).forEach(([id, name, role], k) => {
    team.push({ ext_ref: `DT-${n + 1}-${k + 1}`, advisory_mandate: advRef(n), employee_id: id, employee_name: name, deal_role: role, added_on: ago(int(20, 280)), insider_added: true });
    insiders.push({ ext_ref: `INS-${n + 1}-${k + 1}`, advisory_mandate: advRef(n), person: name, person_type: 'staff', organisation: 'Genesis Corporate Advisors Ltd', received_at: `${ago(int(20, 280))} 10:00`, reason: `Deal team (${role}).` });
  });
  insiders.push({ ext_ref: `INS-${n + 1}-C`, advisory_mandate: advRef(n), person: 'Chief Financial Officer', person_type: 'client', organisation: ORGS[m[1]][0], received_at: `${ago(int(20, 280))} 14:30`, reason: 'Client management.' });
  if (n === 0) insiders.push({ ext_ref: 'INS-1-WC', advisory_mandate: advRef(0), person: 'Trader', person_type: 'wall_crossed', organisation: 'Genesis CMB Securities Ltd', received_at: `${ago(12)} 09:15`, reason: 'Wall-crossed to sound out institutional demand for the notes.', ceased_at: `${ago(5)} 17:00` });
});
add('deal_team_member', team);
add('insider_list_entry', insiders);
add('investor_target', [[7, 'pension_fund'], [8, 'insurer'], [12, 'fund'], [5, 'hnwi'], [4, 'hnwi'], [11, 'corporate'], [14, 'corporate']].flatMap(([pi, type], k) => [0, 3].map((mn) => {
  const stageIdx = mn === 0 ? Math.min(5, k) : Math.min(2, k);
  const stage = ['targeted', 'nda', 'im_shared', 'ioi', 'committed', 'allocated'][stageIdx];
  const party = ['pension_fund', 'insurer', 'fund', 'corporate'].includes(type) ? O(pi) : P(pi);
  const amt = round(int(5000000, 120000000), 500000);
  return {
    ext_ref: `IT-${mn + 1}-${k + 1}`, advisory_mandate: advRef(mn), investor: party, investor_type: type, nda_status: stageIdx >= 1 ? 'signed' : 'not_sent',
    im_shared_on: stageIdx >= 2 ? ago(int(10, 60)) : null, im_views: stageIdx >= 2 ? int(1, 14) : null, ioi_amount: stageIdx >= 3 ? amt : null,
    commitment: stageIdx >= 4 ? round(amt * 0.8, 500000) : null, allocation: stageIdx >= 5 ? round(amt * 0.7, 500000) : null, _stage: stage,
  };
})));
add('advisory_deliverable', MANDATES.flatMap((m, n) => [
  { ext_ref: `DEL-${n + 1}-1`, advisory_mandate: advRef(n), title: m[3] === 'valuation' ? 'Valuation report' : m[3] === 'fund_raising' ? 'Information memorandum' : 'Restructuring options paper', deliverable_type: m[3] === 'valuation' ? 'valuation_report' : m[3] === 'fund_raising' ? 'information_memorandum' : 'board_paper', due_date: d(int(-60, 60)), version: 'v2', reviewer: 'GCADV1', _stage: m[8] === 'completed' ? 'delivered' : pick(['drafting', 'in_review', 'approved']) },
  { ext_ref: `DEL-${n + 1}-2`, advisory_mandate: advRef(n), title: 'Signing milestone fee', deliverable_type: 'milestone', due_date: d(int(-30, 90)), milestone_fee: round(m[6] * 0.5, 10000), invoice_raised: m[8] === 'completed', _stage: m[8] === 'completed' ? 'delivered' : 'drafting' },
]));
add('time_entry', Array.from({ length: 48 }, (_, n) => ({ ext_ref: `TE-${n + 1}`, advisory_mandate: advRef(n % 5), employee_id: n % 3 ? 'GCADV2' : 'GCADV1', work_date: ago(int(1, 200)), hours: pick([1.5, 2, 3, 4, 6, 7.5]), activity: pick(['Financial modelling', 'Client meeting', 'Due diligence', 'IM drafting', 'Investor calls', 'Valuation analysis']), rate: n % 3 ? 3500 : 6000 })));
add('fee_invoice', [[0, 'retainer', 1500000, 'paid'], [0, 'milestone', 750000, 'issued'], [1, 'retainer', 2500000, 'paid'], [4, 'retainer', 1200000, 'paid'], [4, 'success', 4000000, 'paid'], [4, 'expenses', 85000, 'paid'], [2, 'retainer', 900000, 'sent_to_accounting'], [3, 'retainer', 500000, 'draft']]
  .map(([mn, fee_type, amount, status], k) => ({ ext_ref: `FI-${k + 1}`, advisory_mandate: advRef(mn), fee_type, amount, issued_on: status === 'draft' ? null : ago(int(10, 250)), due_on: status === 'draft' ? null : ago(int(-30, 200)), status })));
add('deal_credential', [
  ['Sole financial adviser on MUR 800m PPA for Phoenix Beverages acquisition', 'valuation', 'Manufacturing', 800000000, 120],
  ['Arranger of MUR 1bn multi-tranche notes for a listed hospitality group', 'fund_raising', 'Tourism', 1000000000, 400],
  ['Restructuring adviser to a sugar estate group', 'restructuring', 'Agriculture', 350000000, 600],
  ['Independent valuation for SEM listing of a logistics company', 'valuation', 'Logistics', 2200000000, 820],
  ['ESOP valuation for a fintech scale-up', 'valuation', 'ICT', 90000000, 250],
].map(([headline, service_line, sector, deal_value, days], k) => ({ ext_ref: `TOMB-${k + 1}`, headline, service_line, sector, deal_value, closed_on: ago(days), public: true, summary: 'Mandate completed on time; credentials approved for external use.' })));

// ── Forex desk ───────────────────────────────────────────────────────────────
const fxClients = [...holdingParties.FX.map((i) => ({ party: P(i), key: individuals[i].key, corp: false })), ...[0, 1, 5, 6, 10, 11].map((oi) => ({ party: O(oi), key: organisations[oi].key, corp: true }))];
add('fx_profile', fxClients.map((c, n) => ({
  ext_ref: `FXP-${c.key}`, party: c.party, purpose: c.corp ? pick(['imports', 'exports']) : pick(['education', 'property', 'investment']),
  monthly_volume: c.corp ? round(int(2000000, 60000000), 100000) : round(int(100000, 2000000), 10000), currency_pairs: c.corp ? 'USD/MUR, EUR/MUR' : pick(['GBP/MUR', 'ZAR/MUR', 'EUR/MUR', 'AUD/MUR']),
  approved_products: c.corp ? ['spot', 'forward', 'swap'] : ['spot'], settlement_limit: c.corp ? round(int(20000000, 150000000), 1000000) : round(int(500000, 5000000), 100000),
  settlement_accounts: c.corp ? 'MCB USD 000412…, SBM EUR 000233…' : null, _owner: 'GCFX1',
})));
const RATES = { USD: 47.855, EUR: 53.43, GBP: 63.205, ZAR: 3.015, AUD: 34.515 };
add('fx_quote', Array.from({ length: 30 }, (_, n) => {
  const c = fxClients[n % fxClients.length];
  const ccy = c.corp ? pick(['USD', 'EUR']) : pick(['GBP', 'ZAR', 'EUR', 'AUD']);
  const side = c.corp && chance(0.6) ? 'buys' : pick(['buys', 'sells']);
  const days = int(0, 200);
  const stage = days < 1 ? pick(['requested', 'quoted']) : pick(['accepted', 'accepted', 'accepted', 'rejected', 'expired']);
  const mid = RATES[ccy];
  return {
    ext_ref: `FXQX-${n + 1}`, party: c.party, fx_profile: ref('fx_profile', `FXP-${c.key}`), product: c.corp && n % 4 === 0 ? 'forward' : 'spot', side, currency_code: ccy,
    amount: c.corp ? round(int(50000, 1500000), 5000) : round(int(2000, 60000), 500), value_date: d(n % 4 === 0 ? 90 : 2),
    requested_at: `${ago(days)} 10:${String(int(0, 59)).padStart(2, '0')}`, quoted_rate: stage === 'requested' ? null : Math.round(mid * (side === 'buys' ? 1.008 : 0.992) * 10000) / 10000,
    quoted_at: stage === 'requested' ? null : `${ago(days)} 10:${String(int(30, 59)).padStart(2, '0')}`, responded_at: ['accepted', 'rejected'].includes(stage) ? `${ago(days)} 11:05` : null,
    _stage: stage, _owner: 'GCFX1', _created: ago(days),
  };
}));
add('fx_deal', Array.from({ length: 90 }, (_, n) => {
  const c = fxClients[n % fxClients.length];
  const ccy = c.corp ? pick(['USD', 'USD', 'EUR']) : pick(['GBP', 'ZAR', 'EUR', 'AUD', 'USD']);
  const product = c.corp ? pick(['spot', 'spot', 'forward', 'swap']) : 'spot';
  const side = pick(['buys', 'buys', 'sells']);
  const days = int(0, 360);
  const valueOffset = product === 'spot' ? 2 : int(30, 180);
  return {
    ext_ref: `FXDX-${String(n + 1).padStart(3, '0')}`, party: c.party, fx_profile: ref('fx_profile', `FXP-${c.key}`), product, side, currency_code: ccy,
    amount: c.corp ? round(int(40000, 2000000), 5000) : round(int(1500, 50000), 500), deal_rate: Math.round(RATES[ccy] * (1 + (rnd() - 0.5) * 0.04) * (side === 'buys' ? 1.006 : 0.994) * 10000) / 10000,
    trade_date: ago(days), value_date: d(valueOffset - days), dealing_reference: `KTP-${880000 + n}`,
    purpose_code: c.corp ? pick(['IMP', 'EXP']) : pick(['EDU', 'PRO', 'TRV', 'INV']), settled: valueOffset - days < 0, _owner: 'GCFX1', _created: ago(days),
  };
}));
add('fx_rate_alert', Array.from({ length: 10 }, (_, n) => {
  const c = fxClients[n % fxClients.length];
  const ccy = pick(['USD', 'EUR', 'GBP']);
  const direction = pick(['below', 'above']);
  const hit = n % 4 === 0;
  const target = Math.round(RATES[ccy] * (direction === 'below' ? (hit ? 1.01 : 0.98) : (hit ? 0.99 : 1.02)) * 1000) / 1000;
  return { ext_ref: `FXA-${n + 1}`, party: c.party, currency_code: ccy, direction, target_rate: target, channel: pick(['email', 'sms']), expires_on: d(int(10, 90)), triggered_on: hit ? ago(int(1, 10)) : null, converted_to_deal: hit && n % 2 === 0, _stage: hit ? 'triggered' : 'active' };
}));

// ── Commercial lending ───────────────────────────────────────────────────────
const FACILITIES = [
  [0, 'CG-C01', 'term_loan', 250000000, 84, 1.25, 'active', '1'], [9, 'CG-C01', 'revolving', 60000000, 12, 1.5, 'annual_review', '2'],
  [1, 'CG-C02', 'revolving', 45000000, 12, 1.75, 'active', '3'], [5, 'CG-C02', 'term_loan', 80000000, 60, 1.5, 'credit_approval', '3'],
  [2, null, 'refinancing', 180000000, 96, 1.0, 'security_perfection', '2'], [4, null, 'bridge', 35000000, 18, 2.25, 'credit_memo', '4'],
  [6, null, 'term_loan', 120000000, 72, 1.25, 'active', '2'], [13, null, 'overdraft', 15000000, 12, 2.0, 'rm_assessment', '3'],
];
add('credit_facility', FACILITIES.map(([oi, grp, facility_type, amount, tenor_months, margin, stage, grade], n) => ({
  ext_ref: `CF-${n + 1}`, borrower: O(oi), borrower_group: grp ? ref('client_group', grp) : null, facility_type, amount, currency_code: 'MUR', tenor_months, margin,
  arrangement_fee_pct: 0.5, commitment_fee_pct: facility_type === 'revolving' ? 0.25 : null, purpose: `${facility_type.replace('_', ' ')} for ${ORGS[oi][0]}`,
  expiry_date: stage === 'annual_review' ? d(20) : d(int(90, 2000)), company_background: `${ORGS[oi][0]} — established Mauritian ${ORGS[oi][1]} business with experienced management.`,
  swot: 'S: market position; W: concentration; O: regional expansion; T: FX and tourism cycles.', projections: 'Revenue growth 6–8% p.a.; capex funded 60/40 debt/equity.',
  security_package: 'First-rank floating charge; fixed charge on property; corporate guarantee.', recommendation: ['credit_approval', 'security_perfection', 'active', 'annual_review'].includes(stage) ? 'Approve subject to covenants.' : null,
  risk_grade: grade, credit_decision: ['security_perfection', 'active', 'annual_review'].includes(stage) ? 'approved' : null, _stage: stage, _owner: 'GCRM3', _created: ago(int(30, 700)),
})));
const spreads = [];
FACILITIES.forEach((f, n) => {
  const rev = round(int(150000000, 2500000000), 1000000);
  for (let y = 0; y < 3; y += 1) {
    const r = Math.round(rev * (1 - y * 0.06));
    const ebitda = Math.round(r * (0.12 + rnd() * 0.08));
    spreads.push({
      ext_ref: `FS-${n + 1}-${y}`, credit_facility: ref('credit_facility', `CF-${n + 1}`), period_end: `${TODAY.getUTCFullYear() - 1 - y}-06-30`, basis: 'audited',
      revenue: r, ebitda, depreciation: Math.round(ebitda * 0.25), interest_expense: Math.round(ebitda * 0.15), tax: Math.round(ebitda * 0.1), net_profit: Math.round(ebitda * 0.45),
      total_assets: Math.round(r * 1.4), total_debt: Math.round(ebitda * (2 + rnd() * 2)), cash: Math.round(ebitda * 0.4), equity: Math.round(r * 0.6), annual_debt_service: Math.round(ebitda * (0.45 + rnd() * 0.25)),
    });
  }
});
add('financial_spread', spreads);
const covenants = [];
const tests = [];
FACILITIES.forEach((f, n) => {
  if (!['active', 'annual_review', 'security_perfection'].includes(f[6])) return;
  [['financial', 'dscr', 1.25], ['financial', 'net_debt_to_ebitda', 3.5], ['information', 'audited_accounts', null]].forEach(([covenant_type, metric, threshold], k) => {
    const key = `COV-${n + 1}-${k + 1}`;
    covenants.push({ ext_ref: key, credit_facility: ref('credit_facility', `CF-${n + 1}`), covenant_type, metric, threshold, frequency: 'annual', next_test_date: d(int(20, 300)) });
    if (f[6] !== 'security_perfection') {
      const breach = n === 1 && k === 0;
      tests.push({ ext_ref: `CT-${n + 1}-${k + 1}`, covenant: ref('covenant', key), credit_facility: ref('credit_facility', `CF-${n + 1}`), test_date: ago(int(30, 200)), certificate_received: true,
        actual_value: metric === 'dscr' ? (breach ? 1.08 : 1.6) : metric === 'net_debt_to_ebitda' ? 2.4 : null, waiver: breach ? 'requested' : 'none', waiver_terms: breach ? 'Waiver requested for FY: tourism slowdown; cash sweep proposed.' : null });
    }
  });
});
add('covenant', covenants);
add('covenant_test', tests);

// ── Collateral, valuations, margin calls ─────────────────────────────────────
const collateral = [];
loans.forEach((l, n) => {
  if (!['security_perfection', 'ready_for_disbursement', 'disbursed', 'offer_accepted'].includes(l._stage)) return;
  if (l.product_code === 'LND-IBL') {
    const ph = pledgedHoldings.find((h) => P(h.i) === l.party);
    if (!ph) return;
    collateral.push({ ext_ref: `COLX-${l.ext_ref}`, loan_application: loanByN(n), owner: l.party, collateral_type: 'fund_units', description: `Pledged units ${ph.key.split('-').slice(-2).join('-')}`, fund_holding: ref('fund_holding', ph.key), pledge_status: l.pledge_registered ? 'registered' : 'instructed', value: null, valuation_date: ago(1) });
  } else {
    collateral.push({
      ext_ref: `COLX-${l.ext_ref}`, loan_application: loanByN(n), owner: l.party, collateral_type: l.purpose === 'construction_lot' ? 'land' : 'residential',
      description: `${l.purpose === 'construction_lot' ? 'Construction lot' : 'Residential property'}, ${pick(STREETS)}`, title_reference: `TV ${int(1000, 9999)}/${int(10, 99)}`, charge_rank: 'first',
      value: l.property_value ?? round(l.loan_amount * 1.6, 50000), valuation_date: ago(int(30, 400)), valuer: pick(['Ramlackhan & Associates', 'Noor Dilmohamed & Co', 'Elevate Valuers']),
      insurer: 'Genesis General Ltd', policy_number: `SG-HOM-${int(100000, 999999)}`, sum_insured: round((l.property_value ?? l.loan_amount) * 0.7, 50000), insurance_expiry: n % 7 === 0 ? d(18) : d(int(60, 360)),
    });
  }
});
FACILITIES.forEach((f, n) => {
  if (!['security_perfection', 'active', 'annual_review'].includes(f[6])) return;
  collateral.push({ ext_ref: `COLX-CF-${n + 1}`, owner: O(f[0]), collateral_type: 'commercial', description: `Commercial premises of ${ORGS[f[0]][0]}`, title_reference: `TV ${int(1000, 9999)}/${int(10, 99)}`, charge_rank: 'first', value: round(f[3] * 1.5, 1000000), valuation_date: ago(int(100, 900)), valuer: 'Elevate Valuers', insurer: 'Genesis General Ltd', policy_number: `SG-COM-${int(100000, 999999)}`, sum_insured: round(f[3], 1000000), insurance_expiry: d(int(30, 360)) });
});
add('collateral', collateral);
add('collateral_link', FACILITIES.map((f, n) => [f, n]).filter(([f]) => ['security_perfection', 'active', 'annual_review'].includes(f[6]))
  .map(([f, n]) => ({ ext_ref: `CL-CF-${n + 1}`, collateral: ref('collateral', `COLX-CF-${n + 1}`), credit_facility: ref('credit_facility', `CF-${n + 1}`), allocated_value: f[3] })));
add('collateral_valuation', collateral.filter((c) => c.collateral_type !== 'fund_units').flatMap((c, k) => [
  { ext_ref: `CV-${c.ext_ref}-1`, collateral: ref('collateral', c.ext_ref), valuation_date: ago(int(500, 1100)), market_value: round(c.value * 0.9, 50000), forced_sale_value: round(c.value * 0.7, 50000), valuer: c.valuer ?? 'Elevate Valuers', method: 'full' },
  ...(k % 2 ? [{ ext_ref: `CV-${c.ext_ref}-2`, collateral: ref('collateral', c.ext_ref), valuation_date: c.valuation_date, market_value: c.value, forced_sale_value: round(c.value * 0.75, 50000), valuer: c.valuer ?? 'Elevate Valuers', method: 'desktop' }] : []),
]));

// ── Loan book (LMS view), PLR change, collections ───────────────────────────
const book = [];
loans.forEach((l, n) => {
  if (l._stage !== 'disbursed') return;
  const monthsIn = int(2, 11);
  const outstanding = Math.round(l.loan_amount * (1 - monthsIn / l.tenure_months * 0.8));
  const arrears = n % 6 === 2 ? pick([12, 45, 75, 120]) : 0;
  book.push({
    ext_ref: `LAC-${l.lms_reference}`, lms_account_no: l.lms_reference, party: l.party, loan_application: loanByN(n), product_code: l.product_code, currency_code: 'MUR',
    original_amount: l.loan_amount, outstanding, rate_type: true, margin: { 'LND-RE': -0.675, 'LND-PL': 0.175, 'LND-IBL': -0.175 }[l.product_code],
    instalment: Math.round(l.loan_amount / l.tenure_months * 1.45), next_instalment_date: d(int(1, 28)), arrears_days: arrears, arrears_amount: arrears ? Math.round(l.loan_amount / l.tenure_months * 1.45 * Math.ceil(arrears / 30)) : 0,
    maturity_date: d(l.tenure_months * 30 - monthsIn * 30), collateral_value: l.property_value ?? null, status: arrears > 90 ? 'arrears' : arrears ? 'arrears' : 'active', synced_at: ago(1),
  });
});
// Legacy book booked before the CRM (migrated from the LMS).
for (let k = 0; k < 22; k += 1) {
  const i = [3, 8, 10, 15, 17, 21, 26, 29, 32, 34, 37, 39, 41, 44, 45, 46, 47, 11, 24, 0, 6, 13][k];
  const product_code = k % 5 === 0 ? 'LND-PL' : 'LND-RE';
  const original = product_code === 'LND-PL' ? round(int(500000, 2500000), 50000) : round(int(2000000, 14000000), 50000);
  const yearsIn = int(1, 12);
  const tenure = product_code === 'LND-PL' ? 120 : pick([240, 300]);
  const arrears = k % 7 === 3 ? pick([8, 33, 64, 95]) : 0;
  const maturityMonths = Math.max(2, tenure - yearsIn * 12);
  book.push({
    ext_ref: `LAC-LEG-${k + 1}`, lms_account_no: `LMS-0${8800 + k}`, party: P(i), product_code, currency_code: 'MUR', original_amount: original,
    outstanding: Math.round(original * Math.max(0.05, 1 - yearsIn * 12 / tenure)), rate_type: k % 9 !== 4, fixed_rate: k % 9 === 4 ? 6.5 : null,
    margin: product_code === 'LND-PL' ? 0.175 : -0.675, instalment: Math.round(original / tenure * 1.5), next_instalment_date: d(int(1, 28)),
    arrears_days: arrears, arrears_amount: arrears ? Math.round(original / tenure * 1.5 * Math.ceil(arrears / 30)) : 0,
    maturity_date: k === 4 ? d(60) : d(maturityMonths * 30), collateral_value: product_code === 'LND-RE' ? round(original * 1.5, 50000) : null,
    status: arrears ? 'arrears' : 'active', synced_at: ago(1),
  });
}
add('loan_account', book);

add('plr_change_event', [
  { ext_ref: 'PLR-CHG-2026', old_rate: 7.0, new_rate: 6.825, effective_from: '2026-01-01', approved_by: 'ALCO (meeting of 2025-12-10)', _stage: 'distributed' },
]);
add('plr_notification', book.filter((b) => b.rate_type).map((b) => ({
  ext_ref: `PLRN-${b.lms_account_no}`, plr_change_event: ref('plr_change_event', 'PLR-CHG-2026'), loan_account: ref('loan_account', b.ext_ref),
  old_instalment: Math.round(b.instalment * 1.012), new_instalment: b.instalment, channel: pick(['email', 'email', 'post']), status: pick(['delivered', 'delivered', 'delivered', 'sent', 'bounced']), sent_on: '2025-12-15',
})));
add('collection_action', book.filter((b) => b.arrears_days > 0).flatMap((b, k) => [
  { ext_ref: `COLL-${b.lms_account_no}-1`, loan_account: ref('loan_account', b.ext_ref), action: 'call', action_date: ago(int(5, 20)), outcome: k % 3 === 0 ? 'no_contact' : 'ptp', ptp_amount: k % 3 === 0 ? null : b.arrears_amount, ptp_date: k % 3 === 0 ? null : d(int(3, 15)), notes: 'Called the borrower about the arrears.' },
  ...(b.arrears_days > 60 ? [{ ext_ref: `COLL-${b.lms_account_no}-2`, loan_account: ref('loan_account', b.ext_ref), action: b.arrears_days > 90 ? 'letter' : 'sms', action_date: ago(int(1, 4)), outcome: 'dispute', notes: 'Demand letter issued; escalation to legal if unpaid in 14 days.' }] : []),
]));
add('margin_call', loans.map((l, n) => [l, n]).filter(([l]) => l.product_code === 'LND-IBL' && l._stage === 'disbursed').slice(0, 2).map(([l, n], k) => ({
  ext_ref: `MCX-${k + 1}`, loan_application: loanByN(n), party: l.party, ltv_at_call: 82.5, shortfall: round(l.loan_amount * 0.05, 1000), call_date: ago(k ? 3 : 25), cure_by: ago(k ? -7 : 15), cure: k ? 'none' : 'top_up', _stage: k ? 'issued' : 'cured',
})));

// ── Cross-sell, RM workbench ─────────────────────────────────────────────────
const OPP_TYPES = [['LND', 'LND-IBL'], ['WLT', 'WLT-DPM'], ['FND', 'FND-FMB29'], ['FX', 'FX-FWD'], ['SEC', 'SEC-INT'], ['ADV', 'ADV-FR'], ['FND', 'FND-INC'], ['LND', 'LND-RE']];
add('fs_opportunity', Array.from({ length: 40 }, (_, n) => {
  const i = int(0, 47);
  const [business_unit, product_code] = pick(OPP_TYPES);
  const stage = pick(['identified', 'qualified', 'proposal', 'negotiation', 'won', 'won', 'lost']);
  return {
    ext_ref: `OPP-${String(n + 1).padStart(3, '0')}`, party: business_unit === 'ADV' ? O(int(0, 15)) : P(i), business_unit, product_code,
    amount: round(int(500000, 30000000), 50000), currency_code: 'MUR', probability: { identified: 10, qualified: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 }[stage],
    expected_close: d(int(-90, 150)), forecast_category: stage === 'won' ? 'closed' : stage === 'negotiation' ? 'commit' : stage === 'proposal' ? 'best_case' : 'pipeline',
    owner_rm: pick(RMS), referrer_rm: n % 4 === 0 ? pick(LOAN_EXECS) : null, split_pct: n % 4 === 0 ? 20 : 0, loss_reason: stage === 'lost' ? pick(['price', 'competitor', 'timing']) : null,
    _stage: stage, _owner: pick(RMS), _created: ago(int(5, 300)),
  };
}));
add('nba_suggestion', [
  ...pledgedHoldings.slice(0, 6).map((ph, k) => ({ ext_ref: `NBA-IBL-${k + 1}`, party: P(ph.i), rule: 'ibl_for_fund_holder', business_unit: 'LND', product_code: 'LND-IBL', reason: 'Fund holdings above MUR 1m and no loan — liquidity without selling (Investment-Backed Loan).', status: k < 4 ? 'open' : 'accepted' })),
  ...[0, 3, 8, 15, 21].map((i, k) => ({ ext_ref: `NBA-WLT-${k + 1}`, party: P(i), rule: 'wealth_for_borrower', business_unit: 'WLT', product_code: 'FND-MMF', reason: 'Real-estate borrower — park surplus funds in the Money Market Fund or open a wealth account.', status: k < 3 ? 'open' : 'dismissed', dismiss_reason: k < 3 ? null : 'Client prefers bank deposits for now.' })),
  ...[0, 1, 5, 10].map((oi, k) => ({ ext_ref: `NBA-FX-${k + 1}`, party: O(oi), rule: 'fx_for_corporate', business_unit: 'FX', product_code: 'FX-FWD', reason: 'Corporate with foreign-currency revenue — offer forward hedging.', status: 'open' })),
  ...[1, 6, 12].map((i, k) => ({ ext_ref: `NBA-FMB-${k + 1}`, party: P(i), rule: 'fmb_reinvestment', business_unit: 'FND', product_code: 'FND-INC', reason: 'FMB 2029 holder — prepare a reinvestment proposal ahead of maturity.', status: 'open' })),
  ...[11, 24].map((i, k) => ({ ext_ref: `NBA-HNW-${k + 1}`, party: P(i), rule: 'wealth_discovery_hnw', business_unit: 'WLT', product_code: 'WLT-DPM', reason: 'HNW client with a personal loan only — book a wealth discovery meeting.', status: 'open' })),
]);
add('meeting_note', Array.from({ length: 60 }, (_, n) => {
  const i = int(0, 47);
  const template = pick(['discovery', 'review', 'review', 'credit_visit', 'call', 'call', 'event']);
  const days = int(0, 200);
  const rm = template === 'credit_visit' ? pick(['GCLOAN1', 'GCLOAN2', 'GCCRED1']) : pick([...RMS, 'GCPM1']);
  return {
    ext_ref: `MN-${String(n + 1).padStart(3, '0')}`, party: P(i), template, business_unit: template === 'credit_visit' ? 'LND' : pick(['WLT', 'FND', 'LND', 'SEC']),
    meeting_date: ago(days), meeting_time: `${int(9, 16)}:${pick(['00', '30'])}`, location: pick(['office', 'client', 'video', 'phone']), attendees: `${individuals[i].first} ${individuals[i].last}; ${rm}`, rm,
    objectives: 'Review goals, liquidity needs and upcoming life events.', outcomes: 'Client interested in diversifying into international funds.', next_steps: 'Send proposal and fund factsheets.',
    follow_up_date: d(int(-10, 30)), _owner: rm, _created: ago(days),
  };
}));
const quarter = (back) => { const x = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - back * 3, 1)); return `${x.getUTCFullYear()}-Q${Math.floor(x.getUTCMonth() / 3) + 1}`; };
add('rm_target', [...RMS, 'GCLOAN1', 'GCLOAN2', 'GCPM1'].flatMap((rm) => [0, 1].map((q) => {
  const tgt = round(int(30000000, 120000000), 1000000);
  return {
    ext_ref: `TGT-${rm}-${quarter(q)}`, rm, business_unit: rm.startsWith('GCLOAN') ? 'LND' : rm === 'GCPM1' ? 'WLT' : pick(['WLT', 'LND', 'FND']), period: quarter(q),
    new_business_target: tgt, revenue_target: round(tgt * 0.012, 10000), meetings_target: 40, achieved_new_business: round(tgt * (q ? 0.8 + rnd() * 0.4 : 0.3 + rnd() * 0.5), 100000), achieved_revenue: round(tgt * 0.012 * (q ? 0.9 : 0.5), 10000),
  };
})));

// ── Marketing ────────────────────────────────────────────────────────────────
add('segment', [
  ['SEG-1', 'HNW without a wealth mandate', 'party', "segment IN ('hnw','uhnw') AND aum_mur = 0", 14],
  ['SEG-2', 'PLR-linked borrowers', 'loan_account', 'rate_type = true', 40],
  ['SEG-3', 'FMB 2029 holders', 'fund_holding', "product_code = 'FND-FMB29'", 9],
  ['SEG-4', 'Fund holders without a loan', 'party', 'fund_holdings_mur > 1000000 AND loan_exposure_mur = 0', 11],
  ['SEG-5', 'Francophone affluent clients', 'party', "preferred_language = 'fr' AND segment = 'affluent'", 7],
  ['SEG-6', 'Corporates with FX needs', 'party', "party_type = 'organisation' AND fx_volume_12m_mur > 0", 6],
].map(([ext_ref, name, base_object, criteria, estimated_size]) => ({ ext_ref, name, base_object, criteria, estimated_size, description: name })));
const CAMPAIGNS = [
  ['CMP-FMB29-S2', 'FMB 2029 Series 2 launch', 'acquisition', 'FND', 'FND-FMB29', 'SEG-3', 450000, 380000, 25, -35, 'live'],
  ['CMP-HOME-Q3', 'Home loans — Q3 rate offer', 'acquisition', 'LND', 'LND-RE', null, 600000, 640000, 120, 30, 'completed'],
  ['CMP-WLT-SEM', 'Wealth seminar: investing beyond Mauritius', 'cross_sell', 'WLT', 'WLT-DPM', 'SEG-1', 250000, 230000, 75, 45, 'completed'],
  ['CMP-IBL-XS', 'Liquidity without selling (IBL cross-sell)', 'cross_sell', 'LND', 'LND-IBL', 'SEG-4', 120000, 95000, 60, 15, 'live'],
  ['CMP-FX-CORP', 'FX hedging for exporters', 'cross_sell', 'FX', 'FX-FWD', 'SEG-6', 80000, 60000, 90, 60, 'completed'],
  ['CMP-NEWS-FR', 'Lettre d\'information trimestrielle', 'retention', null, null, 'SEG-5', 40000, 38000, 40, 10, 'live'],
];
add('campaign', CAMPAIGNS.map(([ext_ref, name, objective, business_unit, product_code, seg, budget, actual_cost, startAgo, endIn, stage]) => ({
  ext_ref, name, objective, business_unit, product_code, segment: seg ? ref('segment', seg) : null, channels: ['email', 'social'], budget, actual_cost,
  start_date: ago(startAgo), end_date: d(endIn - startAgo > 0 ? endIn : -startAgo + 30), content: `${name} — key messages, offer and call to action.`, _stage: stage, _owner: 'GCMKT1',
})));
const reachable = individuals.map((p, i) => i).filter((i) => marketingConsent.has(i) && !complainers.has(i) && !individuals[i].dnc);
add('campaign_member', CAMPAIGNS.flatMap(([cref, , , , , , , , , , stage], c) => reachable.filter((_, k) => (k + c) % 3 !== 0).slice(0, 22).map((i) => ({
  ext_ref: `CMM-${cref}-${individuals[i].key}`, campaign: ref('campaign', cref), party: P(i), channel: 'email', sent_on: ago(int(5, 60)),
  opened: chance(0.55), clicked: chance(0.2), responded: stage !== 'planning' && chance(0.15), unsubscribed: chance(0.02),
}))));
add('marketing_event', [
  ['EVT-1', 'Wealth seminar — Investing beyond Mauritius', 'WLT', 'CMP-WLT-SEM', 45, 'Le Méridien, Pointe aux Piments', 80],
  ['EVT-2', 'FMB 2029 Series 2 investor briefing', 'FND', 'CMP-FMB29-S2', -12, 'Genesis Centre, Port Louis', 60],
  ['EVT-3', 'Home-buyers evening', 'LND', 'CMP-HOME-Q3', 70, 'Bagatelle Mall', 120],
  ['EVT-4', 'Exporters FX breakfast', 'FX', 'CMP-FX-CORP', 60, 'Hennessy Park, Ebène', 40],
].map(([ext_ref, name, business_unit, cmp, daysAgo, venue, capacity]) => ({ ext_ref, name, business_unit, campaign: ref('campaign', cmp), event_date: ago(daysAgo), venue, capacity })));
add('event_registration', ['EVT-1', 'EVT-2', 'EVT-3', 'EVT-4'].flatMap((e, k) => reachable.slice(k * 4, k * 4 + 12).map((i) => ({
  ext_ref: `REG-${e}-${individuals[i].key}`, marketing_event: ref('marketing_event', e), party: P(i), registered_on: ago(int(70, 100)), attended: e !== 'EVT-2' && chance(0.7), follow_up_done: e !== 'EVT-2' && chance(0.5),
}))));
add('subscription', reachable.flatMap((i, k) => [
  { ext_ref: `SUB-${individuals[i].key}-W`, party: P(i), topic: 'weekly_highlights', status: 'subscribed', subscribed_on: ago(int(30, 600)), source: 'web_form' },
  ...(k % 3 === 0 ? [{ ext_ref: `SUB-${individuals[i].key}-R`, party: P(i), topic: 'research', status: k % 9 === 0 ? 'unsubscribed' : 'subscribed', subscribed_on: ago(int(30, 600)), source: 'event' }] : []),
  ...(k % 4 === 0 ? [{ ext_ref: `SUB-${individuals[i].key}-F`, party: P(i), topic: 'fund_factsheets', status: 'subscribed', subscribed_on: ago(int(30, 600)), source: 'web_form' }] : []),
]));

// ── Introducers ──────────────────────────────────────────────────────────────
const INTRO = [[33, 'broker', 0.5, 'active'], [7, 'professional', 0.4, 'active'], [40, 'agent', 0.35, 'active'], [43, 'client', 0.25, 'agreement'], [12, 'corporate', 0.3, 'kyc']];
add('introducer', INTRO.map(([pi, introducer_type, commission_pct, stage], k) => ({
  ext_ref: `INTR-${k + 1}`, party: k === 4 ? O(pi) : P(pi), introducer_type, agreement_signed_on: stage === 'kyc' ? null : ago(int(100, 700)), agreement_expires_on: d(int(100, 700)),
  allowed_products: ['LND-RE', 'LND-PL', 'WLT-DPM', 'FND-FMB29'], commission_pct, clawback_months: 12, protection_days: 90, portal_email: k === 4 ? ORGS[pi][4] : individuals[pi].email, _stage: stage,
})));
const introRefs = [];
add('introducer_referral', Array.from({ length: 22 }, (_, n) => {
  const k = n % 3;
  const stage = pick(['submitted', 'accepted', 'in_progress', 'funded', 'funded', 'lost']);
  const amount = round(int(1000000, 12000000), 50000);
  introRefs.push({ n, k, stage, amount });
  return {
    ext_ref: `IREF-${String(n + 1).padStart(3, '0')}`, introducer: ref('introducer', `INTR-${k + 1}`), prospect_first_name: ENQ_FIRST[(n * 3) % 20], prospect_last_name: ENQ_LAST[(n * 11) % 20],
    prospect_email: `prospect${n + 1}@example.mu`, prospect_mobile: `+2305${int(7000000, 7999999)}`, product_code: pick(['LND-RE', 'LND-RE', 'LND-PL', 'WLT-DPM', 'FND-FMB29']),
    estimated_amount: amount, submitted_on: ago(int(5, 300)), client_consented: chance(0.8), funded_amount: stage === 'funded' ? round(amount * 0.95, 50000) : null, _stage: stage,
  };
}));
add('commission_entry', introRefs.filter((r) => r.stage === 'funded').map((r, j) => ({
  ext_ref: `COM-${j + 1}`, introducer: ref('introducer', `INTR-${r.k + 1}`), introducer_referral: ref('introducer_referral', `IREF-${String(r.n + 1).padStart(3, '0')}`),
  period: period(int(0, 9)), base_amount: round(r.amount * 0.95, 50000), amount: Math.round(r.amount * 0.95 * [0.5, 0.4, 0.35][r.k] / 100), status: j % 4 === 0 ? 'accrued' : j % 4 === 1 ? 'approved' : 'paid', paid_on: j % 4 > 1 ? ago(int(5, 120)) : null,
})));

// ── Revenue ledger (12 months) ───────────────────────────────────────────────
const REV = [['LND', 'arrangement_fee', 'LND-RE', 350000], ['LND', 'interest_income', 'LND-RE', 9500000], ['WLT', 'management_fee', 'WLT-DPM', 4200000], ['WLT', 'performance_fee', 'WLT-DPM', 600000],
  ['FND', 'management_fee', 'FND-INC', 3100000], ['SEC', 'brokerage', 'SEC-LOC', 1400000], ['ADV', 'advisory_retainer', 'ADV-FR', 900000], ['ADV', 'success_fee', 'ADV-VAL', 1500000], ['FX', 'fx_spread', 'FX-SPOT', 1900000]];
const revenue = [];
for (let m = 11; m >= 0; m -= 1) {
  REV.forEach(([bu, type, product, base]) => {
    if (type === 'success_fee' && m % 4) return;
    if (type === 'performance_fee' && m % 3) return;
    const amount = Math.round(base * (0.8 + rnd() * 0.45) * (1 + (11 - m) * 0.012));
    revenue.push({
      ext_ref: `REV-${period(m)}-${bu}-${type}`, business_unit: bu, revenue_type: type, product_code: product, amount, currency_code: 'MUR', period: period(m), booked_on: monthEnd(m),
      rm: bu === 'LND' ? pick(LOAN_EXECS) : bu === 'WLT' ? pick(['GCRM2', 'GCPM1']) : bu === 'FND' ? 'GCPM2' : bu === 'SEC' ? 'GCTRD1' : bu === 'ADV' ? 'GCADV1' : 'GCFX1',
      referrer_rm: type === 'arrangement_fee' && m % 2 ? 'GCRM1' : null, referrer_split_pct: type === 'arrangement_fee' && m % 2 ? 20 : 0,
      campaign: type === 'arrangement_fee' && m < 4 ? ref('campaign', 'CMP-HOME-Q3') : type === 'management_fee' && bu === 'FND' && m < 2 ? ref('campaign', 'CMP-FMB29-S2') : null,
      finance_amount: m > 0 ? Math.round(amount * (m % 5 === 0 ? 0.985 : 1)) : null,
    });
  });
}
add('revenue_entry', revenue);

// ── Compliance registers ─────────────────────────────────────────────────────
add('restricted_list_entry', [
  ['RL-1', 'Island Agro Industries Ltd', 'MU0000ISLA01', 'restricted', 'Advisory mandate in progress (Project Kestrel) — no research, no trading.', 120],
  ['RL-2', 'Tamarind Property Developments Ltd', 'MU0000TAMR02', 'watch', 'Possible restructuring discussions.', 45],
  ['RL-3', 'Savanne Sugar Estates Ltd', 'MU0000SAVA03', 'restricted', 'Underwriting of the 2030 bond — quiet period.', 30],
  ['RL-4', 'Mascarene Capital Partners Ltd', null, 'watch', 'Adverse media under review.', 15],
  ['RL-5', 'Lux Island Resorts', 'MU0000LUXI05', 'watch', 'Rumoured capital raise.', 10],
].map(([ext_ref, issuer, isin, list_type, reason, daysAgo]) => ({ ext_ref, issuer, isin, list_type, reason, added_on: ago(daysAgo), remove_on: d(int(30, 120)) })));
add('conflict_register', [
  { ext_ref: 'CONF-1', subject: 'Project Kestrel: counterparty is a Genesis Securities client', party: O(14), advisory_mandate: advRef(1), description: 'Counterparty holds a securities account with Genesis CMB Securities.', decision: 'managed', controls: 'Trading desk walled off; research suspended; wall-crossing log maintained.' },
  { ext_ref: 'CONF-2', subject: 'Staff declaration: analyst holds shares in Lux Island Resorts', description: 'Advisory analyst declared a personal holding.', decision: 'managed', controls: 'Holding frozen for the duration of related mandates.' },
  { ext_ref: 'CONF-3', subject: 'Project Tamarin: client competitor already advised', party: O(9), advisory_mandate: advRef(6), description: 'Competing hotel group advised in the last 12 months.', decision: 'declined', controls: 'Mandate declined.' },
  { ext_ref: 'CONF-4', subject: 'Gift from a fund distributor above threshold', description: 'Hospitality offered by an international fund house.', decision: 'cleared', controls: 'Within policy after review.' },
]);
add('gift_register', Array.from({ length: 10 }, (_, n) => ({
  ext_ref: `GIFT-${n + 1}`, employee_id: pick(['GCRM1', 'GCRM2', 'GCPM1', 'GCADV1', 'GCFX1', 'GCLOAN1']), direction: n % 4 === 0 ? 'given' : 'received',
  counterparty: pick(['BlackRock', 'Vanguard', 'Ocean Breeze Hotels', 'Doorga Trading', 'JP Morgan AM', 'Client']), description: pick(['Dinner', 'Conference ticket', 'Wine hamper', 'Golf day', 'Book']),
  estimated_value: pick([1500, 3000, 4500, 7500, 12000]), event_date: ago(int(5, 300)), decision: n % 5 === 0 ? 'declined' : n % 3 === 0 ? 'approved' : 'noted',
})));
add('pa_dealing', Array.from({ length: 8 }, (_, n) => {
  const [security] = n === 2 ? ['Savanne Sugar Estates Ltd'] : pick(SEM);
  return { ext_ref: `PAD-${n + 1}`, employee_id: pick(['GCRM1', 'GCPM1', 'GCTRD1', 'GCADV2', 'GCFX1']), security, side: pick(['buy', 'sell']), quantity: int(100, 5000), requested_on: ago(int(1, 200)), decision: n === 2 ? 'refused' : n === 7 ? 'pending' : 'cleared', decided_by: n === 7 ? null : 'GCCOMP1' };
}));
add('data_subject_request', [
  { ext_ref: 'DSR-1', party: P(17), request_type: 'access', received_on: ago(40), identity_verified: true, details: 'Copy of all personal data held.', response: 'Data pack sent by secure link.', completed_on: ago(18), _stage: 'completed' },
  { ext_ref: 'DSR-2', party: P(28), request_type: 'rectification', received_on: ago(12), identity_verified: true, details: 'Correct the residential address.', _stage: 'in_progress' },
  { ext_ref: 'DSR-3', party: P(44), request_type: 'erasure', received_on: ago(26), identity_verified: true, aml_retention_applies: true, details: 'Delete all my data.', response: 'Marketing data erased; KYC and transaction records retained for 7 years under FIAMLA.', completed_on: ago(4), _stage: 'completed' },
  { ext_ref: 'DSR-4', party: P(35), request_type: 'portability', received_on: ago(3), details: 'Export my portfolio data.', _stage: 'verifying' },
  { ext_ref: 'DSR-5', party: P(9), request_type: 'objection', received_on: ago(20), identity_verified: true, details: 'Object to profiling for marketing.', response: 'Profiling consent withdrawn.', completed_on: ago(16), _stage: 'completed' },
]);

module.exports = sets;
