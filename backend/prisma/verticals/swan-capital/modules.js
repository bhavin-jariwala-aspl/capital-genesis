'use strict';

/**
 * SWAN Capital — sidebar modules. Each module's `category` becomes a sidebar
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
  { name: 'swan_clients', label: 'Clients', category: 'client_360', icon: 'Users', color: 'indigo', order_index: 10,
    description: 'Client 360: parties, households, relationships per entity, contact points and consents (M02)',
    objects: [core.party, growth.clientGroup, core.clientRelationship, core.partyRelationship, growth.contactPoint, core.consentRecord] },
  { name: 'swan_enquiries', label: 'Enquiries & Leads', category: 'client_360', icon: 'Inbox', color: 'blue', order_index: 11,
    description: 'Every enquiry from every channel, calculator sessions and cross-entity referrals (M01)',
    objects: [core.enquiry, comp.webEvent, core.referral] },
  { name: 'swan_crosssell', label: 'Cross-sell & RM Workbench', category: 'client_360', icon: 'Sparkles', color: 'violet', order_index: 12,
    description: 'Opportunities, next-best actions, meeting notes and RM targets (M14, M15)',
    objects: [growth.opportunity, growth.nbaSuggestion, growth.meetingNote, growth.rmTarget] },

  // ── Lending ─────────────────────────────────────────────────────────────────
  { name: 'swan_lending', label: 'Retail Lending', category: 'lending', icon: 'Landmark', color: 'green', order_index: 20,
    description: 'Real Estate, Personal and Investment-Backed loans: origination, credit, offer, disbursement (M05)',
    objects: [core.loanApplication, lending.loanApplicant, lending.creditCondition, lending.loanOffer, lending.disbursement] },
  { name: 'swan_commercial', label: 'Commercial Lending', category: 'lending', icon: 'Building2', color: 'emerald', order_index: 21,
    description: 'Facilities, credit memos, financial spreading and covenants (M06)',
    objects: [lending.creditFacility, lending.financialSpread, lending.covenant, lending.covenantTest] },
  { name: 'swan_collateral', label: 'Collateral & Pledges', category: 'lending', icon: 'Home', color: 'lime', order_index: 22,
    description: 'Collateral register, allocations, valuations, LTV monitoring and margin calls (M07)',
    objects: [core.collateral, lending.collateralLink, lending.collateralValuation, lending.marginCall] },
  { name: 'swan_servicing', label: 'Loan Servicing', category: 'lending', icon: 'BookOpen', color: 'teal', order_index: 23,
    description: 'Loan book from the LMS, PLR change management and collections (M08)',
    objects: [lending.loanAccount, lending.plrChangeEvent, lending.plrNotification, lending.collectionAction] },

  // ── Investments ─────────────────────────────────────────────────────────────
  { name: 'swan_wealth', label: 'Wealth Management', category: 'investments', icon: 'Briefcase', color: 'cyan', order_index: 30,
    description: 'Risk profiling, suitability, discretionary mandates, reviews and AUM (M04, M09)',
    objects: [core.riskProfile, core.suitabilityRecord, core.wealthMandate, inv.mandateReview, inv.aumSnapshot, inv.saacDecision] },
  { name: 'swan_funds', label: 'Investment Funds', category: 'investments', icon: 'Landmark', color: 'sky', order_index: 31,
    description: 'Swan Global Funds: funds, share classes, NAV, orders, holdings, FMB 2029 campaign (M10)',
    objects: [inv.fund, inv.fundShareClass, inv.navHistory, core.fundOrder, inv.fundHolding, inv.fundCampaign, inv.distributionNotice] },
  { name: 'swan_securities', label: 'Trading Solutions', category: 'investments', icon: 'LineChart', color: 'blue', order_index: 32,
    description: 'Swan CMB Securities: accounts, order intake, IPO / bond book, research (M11)',
    objects: [core.securitiesAccount, inv.clientOrder, inv.ioiEntry, inv.researchPublication] },

  // ── Advisory & forex ────────────────────────────────────────────────────────
  { name: 'swan_advisory', label: 'Corporate Advisory', category: 'advisory', icon: 'Lock', color: 'purple', order_index: 40,
    description: 'Swan Corporate Advisors — private side behind the information barrier (M12)',
    objects: [core.advisoryMandate, advfx.conflictCheck, advfx.dealTeamMember, advfx.insiderListEntry, advfx.investorTarget, advfx.advisoryDeliverable, advfx.timeEntry, growth.feeInvoice, advfx.dealCredential] },
  { name: 'swan_forex', label: 'Forex Desk', category: 'advisory', icon: 'Repeat', color: 'fuchsia', order_index: 41,
    description: 'Swan Forex: client profiles, quotes, deals, forwards and rate alerts (M13)',
    objects: [core.fxProfile, advfx.fxQuote, advfx.fxDeal, advfx.fxRateAlert] },

  // ── Marketing, partners, revenue ────────────────────────────────────────────
  { name: 'swan_marketing', label: 'Marketing & Consent', category: 'growth', icon: 'Megaphone', color: 'pink', order_index: 50,
    description: 'Campaigns, segments, events, newsletters and subscriptions (M18)',
    objects: [growth.campaign, growth.campaignMember, growth.segment, growth.marketingEvent, growth.eventRegistration, growth.subscription] },
  { name: 'swan_partners', label: 'Introducers', category: 'growth', icon: 'Handshake', color: 'orange', order_index: 51,
    description: 'Introducers and SWAN insurance agents, referrals and commissions (M19)',
    objects: [growth.introducer, growth.introducerReferral, growth.commissionEntry] },
  { name: 'swan_revenue', label: 'Revenue', category: 'growth', icon: 'Receipt', color: 'yellow', order_index: 52,
    description: 'Revenue ledger by entity, product and RM with split credit (M20)',
    objects: [growth.revenueEntry] },

  // ── Service & compliance ───────────────────────────────────────────────────
  { name: 'swan_service', label: 'Service & Complaints', category: 'service', icon: 'LifeBuoy', color: 'amber', order_index: 60,
    description: 'Service requests and the FSC complaints register (M16)', objects: [core.serviceRequest] },
  { name: 'swan_compliance', label: 'KYC & Compliance', category: 'compliance', icon: 'ShieldCheck', color: 'red', order_index: 70,
    description: 'KYC/AML, screening, STRs and the compliance registers (M03, M21)',
    objects: [core.kycCase, comp.screeningHit, comp.kycReliance, core.strReport, core.restrictedList, core.conflictEntry, comp.giftRegister, comp.paDealing, comp.dataSubjectRequest] },

  // ── Masters ─────────────────────────────────────────────────────────────────
  { name: 'swan_masters', label: 'Masters', category: 'masters', icon: 'Database', color: 'gray', order_index: 90,
    description: 'Products, routing, PLR, countries, FX board, model portfolios, risk factors, collateral types, approval matrix, catalogue, reason codes (M24)',
    objects: [core.financialProduct, core.productRouting, core.plrRate, core.country, core.fxRate, core.modelPortfolio,
      comp.kycRiskFactor, comp.collateralType, comp.approvalMatrix, comp.serviceCatalogue, comp.reasonCode] },
];

// Every object carries the source-system / migration id (PRD ExternalReference,
// X-10): imports and integrations match on it, and demo data is keyed by it.
for (const obj of modules.flatMap((m) => m.objects)) {
  if (!obj.fields.some((f) => f.name === 'ext_ref')) {
    obj.fields.push({ name: 'ext_ref', label: 'External reference', type: 'text', help: 'Id in the source system (LMS, PMS, TA, OMS) or migration file — used to match imports and integration callbacks.' });
  }
}

module.exports = modules;
