'use strict';

/**
 * Genesis Capital — sidebar modules. Each module's `category` becomes a sidebar
 * section, so the whole navigation is metadata (Builder ▸ Modules & Objects).
 * Every object below is defined in one of the objects*.js files.
 */

const core = require('./objects');
const lending = require('./objects-lending');
const inv = require('./objects-investments');
const advfx = require('./objects-advisory-fx');
const growth = require('./objects-growth');
const comp = require('./objects-compliance');

const modules = [
  // ── Client 360 ──────────────────────────────────────────────────────────────
  { name: 'genesis_products', label: 'Products & Services', category: 'client_360', icon: 'Package', color: 'indigo', order_index: 5,
    description: 'Genesis\'s 22 products and services as published on genesis-capital.demo — terms, eligibility, security, documents, fees and how to apply (M24)',
    objects: [core.financialProduct] },
  { name: 'genesis_clients', label: 'Clients', category: 'client_360', icon: 'Users', color: 'indigo', order_index: 10,
    description: 'Client 360: parties, households, relationships per entity, contact points and consents (M02)',
    objects: [core.party, growth.clientGroup, core.clientRelationship, core.partyRelationship, growth.contactPoint, core.consentRecord] },
  { name: 'genesis_enquiries', label: 'Enquiries & Leads', category: 'client_360', icon: 'Inbox', color: 'blue', order_index: 11,
    description: 'Every enquiry from every channel, calculator sessions and cross-entity referrals (M01)',
    objects: [core.enquiry, comp.webEvent, core.referral] },
  { name: 'genesis_crosssell', label: 'Cross-sell & RM Workbench', category: 'client_360', icon: 'Sparkles', color: 'violet', order_index: 12,
    description: 'Opportunities, next-best actions, meeting notes and RM targets (M14, M15)',
    objects: [growth.opportunity, growth.nbaSuggestion, growth.meetingNote, growth.rmTarget] },

  // ── Lending ─────────────────────────────────────────────────────────────────
  { name: 'genesis_lending', label: 'Retail Lending', category: 'lending', icon: 'Landmark', color: 'green', order_index: 20,
    description: 'Real Estate, Personal and Investment-Backed loans: origination, credit, offer, disbursement (M05)',
    objects: [core.loanApplication, lending.loanApplicant, lending.creditCondition, lending.loanOffer, lending.disbursement] },
  { name: 'genesis_commercial', label: 'Commercial Lending', category: 'lending', icon: 'Building2', color: 'emerald', order_index: 21,
    description: 'Facilities, credit memos, financial spreading and covenants (M06)',
    objects: [lending.creditFacility, lending.financialSpread, lending.covenant, lending.covenantTest] },
  { name: 'genesis_collateral', label: 'Collateral & Pledges', category: 'lending', icon: 'Home', color: 'lime', order_index: 22,
    description: 'Collateral register, allocations, valuations, LTV monitoring and margin calls (M07)',
    objects: [core.collateral, lending.collateralLink, lending.collateralValuation, lending.marginCall] },
  { name: 'genesis_servicing', label: 'Loan Servicing', category: 'lending', icon: 'BookOpen', color: 'teal', order_index: 23,
    description: 'Loan book from the LMS, PLR change management and collections (M08)',
    objects: [lending.loanAccount, lending.plrChangeEvent, lending.plrNotification, lending.collectionAction] },

  // ── Investments ─────────────────────────────────────────────────────────────
  { name: 'genesis_wealth', label: 'Wealth Management', category: 'investments', icon: 'Briefcase', color: 'cyan', order_index: 30,
    description: 'Risk profiling, suitability, discretionary mandates, reviews and AUM (M04, M09)',
    objects: [core.riskProfile, core.suitabilityRecord, core.wealthMandate, inv.mandateReview, inv.aumSnapshot, inv.saacDecision] },
  { name: 'genesis_funds', label: 'Investment Funds', category: 'investments', icon: 'Landmark', color: 'sky', order_index: 31,
    description: 'Genesis Global Funds: funds, share classes, NAV, orders, holdings, FMB 2029 campaign (M10)',
    objects: [inv.fund, inv.fundShareClass, inv.navHistory, core.fundOrder, inv.fundHolding, inv.fundCampaign, inv.distributionNotice] },
  { name: 'genesis_securities', label: 'Trading Solutions', category: 'investments', icon: 'LineChart', color: 'blue', order_index: 32,
    description: 'Genesis CMB Securities: accounts, order intake, IPO / bond book, research (M11)',
    objects: [core.securitiesAccount, inv.clientOrder, inv.ioiEntry, inv.researchPublication] },

  // ── Advisory & forex ────────────────────────────────────────────────────────
  { name: 'genesis_advisory', label: 'Corporate Advisory', category: 'advisory', icon: 'Lock', color: 'purple', order_index: 40,
    description: 'Genesis Corporate Advisors — private side behind the information barrier (M12)',
    objects: [core.advisoryMandate, advfx.conflictCheck, advfx.dealTeamMember, advfx.insiderListEntry, advfx.investorTarget, advfx.advisoryDeliverable, advfx.timeEntry, growth.feeInvoice, advfx.dealCredential] },
  { name: 'genesis_forex', label: 'Forex Desk', category: 'advisory', icon: 'Repeat', color: 'fuchsia', order_index: 41,
    description: 'Genesis Forex: client profiles, quotes, deals, forwards and rate alerts (M13)',
    objects: [core.fxProfile, advfx.fxQuote, advfx.fxDeal, advfx.fxRateAlert] },

  // ── Marketing, partners, revenue ────────────────────────────────────────────
  { name: 'genesis_marketing', label: 'Marketing & Consent', category: 'growth', icon: 'Megaphone', color: 'pink', order_index: 50,
    description: 'Campaigns, segments, events, newsletters and subscriptions (M18)',
    objects: [growth.campaign, growth.campaignMember, growth.segment, growth.marketingEvent, growth.eventRegistration, growth.subscription] },
  { name: 'genesis_partners', label: 'Introducers', category: 'growth', icon: 'Handshake', color: 'orange', order_index: 51,
    description: 'Introducers and Genesis insurance agents, referrals and commissions (M19)',
    objects: [growth.introducer, growth.introducerReferral, growth.commissionEntry] },
  { name: 'genesis_revenue', label: 'Revenue', category: 'growth', icon: 'Receipt', color: 'yellow', order_index: 52,
    description: 'Revenue ledger by entity, product and RM with split credit (M20)',
    objects: [growth.revenueEntry] },

  // ── Service & compliance ───────────────────────────────────────────────────
  { name: 'genesis_service', label: 'Service & Complaints', category: 'service', icon: 'LifeBuoy', color: 'amber', order_index: 60,
    description: 'Service requests and the FSC complaints register (M16)', objects: [core.serviceRequest] },
  { name: 'genesis_compliance', label: 'KYC & Compliance', category: 'compliance', icon: 'ShieldCheck', color: 'red', order_index: 70,
    description: 'KYC/AML, screening, STRs and the compliance registers (M03, M21)',
    objects: [core.kycCase, comp.screeningHit, comp.kycReliance, core.strReport, core.restrictedList, core.conflictEntry, comp.giftRegister, comp.paDealing, comp.dataSubjectRequest] },

  // ── Masters ─────────────────────────────────────────────────────────────────
  { name: 'genesis_masters', label: 'Masters', category: 'masters', icon: 'Database', color: 'gray', order_index: 90,
    description: 'Website routing, PLR, countries, FX board, model portfolios, risk factors, collateral types, approval matrix, catalogue, reason codes (M24)',
    objects: [core.productRouting, core.plrRate, core.country, core.fxRate, core.modelPortfolio,
      comp.kycRiskFactor, comp.collateralType, comp.approvalMatrix, comp.serviceCatalogue, comp.reasonCode] },
];

// Every object carries the source-system / migration id (PRD ExternalReference,
// X-10): imports and integrations match on it, and demo data is keyed by it.
for (const obj of modules.flatMap((m) => m.objects)) {
  if (!obj.fields.some((f) => f.name === 'ext_ref')) {
    obj.fields.push({ name: 'ext_ref', label: 'External reference', type: 'text', help: 'Id in the source system (LMS, PMS, TA, OMS) or migration file — used to match imports and integration callbacks.' });
  }
}

// Client and introducer portal sections (config.portal).
const portal = require('./portal');
for (const obj of modules.flatMap((m) => m.objects)) {
  if (portal[obj.name]) obj.config = { ...(obj.config ?? {}), portal: portal[obj.name] };
}

// Website data feeds (PRD I-02): GET /api/public/feeds/genesis-capital/<name>.
// They replace the website's own NAV / rate tables, so the figures shown on
// genesis-capital.demo are the CRM's masters.
const feeds = {
  fx_rate: { name: 'fx-rates', fields: ['currency_code', 'rate_to_mur', 'buy_tt', 'sell_tt', 'rate_date'], latest_by: { group: 'currency_code', order: 'rate_date' }, sort: { field: 'currency_code' } },
  fund_share_class: { name: 'fund-nav', fields: ['class_code', 'name', 'currency_code', 'latest_nav', 'latest_nav_date', 'risk_rating', 'min_investment', 'dealing_frequency'], sort: { field: 'class_code' } },
  // Performance history behind the website's NAV table.
  nav_history: { name: 'nav-history', fields: ['class_code', 'fund', 'nav_date', 'nav'], sort: { field: 'nav_date', dir: 'asc' }, limit: 500 },
  plr_rate: { name: 'plr', fields: ['rate', 'effective_from'], sort: { field: 'effective_from', dir: 'desc' }, limit: 1 },
  // The product catalogue (Products & Services): the website's product cards and "Rate from".
  financial_product: { name: 'products', fields: ['code', 'name', 'name_fr', 'category', 'legal_entity', 'tagline', 'rate_from', 'website_url', 'active'], sort: { field: 'code' } },
};
for (const obj of modules.flatMap((m) => m.objects)) {
  if (feeds[obj.name]) obj.config = { ...(obj.config ?? {}), public_feed: feeds[obj.name] };
}

// Personal calendar feed (RM-FR-03): dated records appear in their owner's calendar.
const calendars = {
  meeting_note: [{ date_field: 'meeting_date', time_field: 'meeting_time', duration_min: 60, label: 'Meeting' }, { date_field: 'follow_up_date', label: 'Follow up' }],
  mandate_review: [{ date_field: 'due_date', label: 'Mandate review due' }],
  fx_deal: [{ date_field: 'value_date', label: 'FX value date' }],
  covenant_test: [{ date_field: 'test_date', label: 'Covenant test' }],
  marketing_event: [{ date_field: 'event_date', label: 'Event' }],
  advisory_deliverable: [{ date_field: 'due_date', label: 'Deliverable due' }],
};
for (const obj of modules.flatMap((m) => m.objects)) {
  if (calendars[obj.name]) obj.config = { ...(obj.config ?? {}), calendar: calendars[obj.name] };
}

// Calculated business-unit fields hold a unit code ('LND', 'WLT'…); give them the
// unit list as options so lists and record panels show "Lending (Genesis Life Ltd)".
const { BUSINESS_UNITS } = require('./options');
for (const mod of modules) {
  for (const obj of mod.objects) {
    for (const f of obj.fields) {
      if (f.name === 'business_unit' && f.type === 'formula' && !f.options) f.options = BUSINESS_UNITS;
    }
  }
}

// French labels (PRD X-02 / E-15): `config.label_fr` on modules, objects,
// fields, pipelines and stages, `label_fr` on select options. Labels without a
// translation (codes, currencies, product names) display in English.
const fr = require('./i18n-fr');
const frOf = (label) => (label == null ? undefined : fr[label] ?? fr[String(label).trim()]);
const withFr = (node, extra = {}) => {
  const t = frOf(node.label);
  const pl = frOf(node.plural_label);
  if (!t && !pl && !Object.keys(extra).length) return;
  node.config = { ...(node.config ?? {}), ...(t ? { label_fr: t } : {}), ...(pl ? { plural_label_fr: pl } : {}), ...extra };
};
for (const mod of modules) {
  withFr(mod);
  for (const obj of mod.objects) {
    withFr(obj);
    for (const f of obj.fields) {
      withFr(f);
      if (Array.isArray(f.options)) {
        f.options = f.options.map((o) => (o && typeof o === 'object' && frOf(o.label) ? { ...o, label_fr: frOf(o.label) } : o));
      }
    }
    for (const p of [obj.pipeline, ...(obj.pipelines ?? [])].filter(Boolean)) {
      withFr(p);
      for (const st of p.stages ?? []) withFr(st);
    }
  }
}

module.exports = modules;
