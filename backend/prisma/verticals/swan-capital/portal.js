'use strict';

/**
 * SWAN Capital — what the client and introducer portals expose (PRD M23,
 * M19). Applied onto the objects as `config.portal`; the portal itself is
 * generic (services/portal.service.js). Clients see only their own records
 * (through the `link` lookup), introducers only their own referrals.
 */

const TODAY = '{{today}}';

module.exports = {
  loan_application: { client: { title: 'Loan applications', link: 'party', order_index: 1, uploads: true,
    fields: ['application_no', 'product_code', 'loan_amount', 'tenure_months', 'interest_rate', 'emi', 'offer_valid_until'] } },
  loan_account: { client: { title: 'My loans', link: 'party', order_index: 2,
    fields: ['lms_account_no', 'product_code', 'outstanding', 'current_rate', 'instalment', 'next_instalment_date', 'maturity_date'] } },
  fund_holding: { client: { title: 'Fund holdings', link: 'party', order_index: 3,
    fields: ['share_class', 'units', 'nav', 'value', 'currency_code'] } },
  wealth_mandate: { client: { title: 'Wealth mandates', link: 'party', order_index: 4,
    fields: ['mandate_no', 'mandate_type', 'model_portfolio', 'aum', 'base_currency', 'ytd_return_pct', 'next_review_due'] } },
  securities_account: { client: { title: 'Trading accounts', link: 'party', order_index: 5,
    fields: ['account_no', 'account_type', 'markets', 'portfolio_value'] } },
  fx_deal: { client: { title: 'FX deals', link: 'party', order_index: 6,
    fields: ['deal_no', 'product', 'currency_code', 'amount', 'deal_rate', 'value_date'] } },
  fund_order: { client: { title: 'Fund orders', link: 'party', order_index: 7,
    fields: ['order_no', 'order_type', 'fund_code', 'amount', 'currency_code'],
    create: { label: 'Invest or redeem', fields: ['share_class', 'order_type', 'amount'], lookups: { share_class: 'fund_share_class' }, stage: 'captured' } } },
  service_request: { client: { title: 'Requests & complaints', link: 'party', order_index: 8, uploads: true,
    fields: ['request_no', 'request_type', 'created_on', 'resolved_on'],
    create: { label: 'New request or complaint', fields: ['request_type', 'business_unit', 'description'], defaults: { channel: 'portal', priority: 'medium', created_on: TODAY }, stage: 'new' } } },
  consent_record: { client: { title: 'My consents', link: 'party', order_index: 9,
    fields: ['purpose', 'channel', 'status', 'captured_on'],
    create: { label: 'Update a consent', fields: ['purpose', 'channel', 'status'], defaults: { source: 'portal', captured_on: TODAY, text_version: '2026-10-v1' } } } },
  kyc_case: { client: { title: 'Know your customer', link: 'party', order_index: 10, uploads: true,
    fields: ['kyc_no', 'review_type', 'next_review_date'] } },
  introducer_referral: { introducer: { title: 'My referrals', link: 'introducer', order_index: 1, consent_gate: 'client_consented',
    fields: ['referral_no', 'prospect_name', 'product_code', 'estimated_amount', 'submitted_on', 'funded_amount'],
    create: { label: 'Refer a client', fields: ['prospect_first_name', 'prospect_last_name', 'prospect_email', 'prospect_mobile', 'product_code', 'estimated_amount', 'client_consented'], defaults: { submitted_on: TODAY }, stage: 'submitted' } } },
  commission_entry: { introducer: { title: 'Commissions', link: 'introducer', order_index: 2,
    fields: ['period', 'base_amount', 'amount', 'status', 'paid_on'] } },
};
