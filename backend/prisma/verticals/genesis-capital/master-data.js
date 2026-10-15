'use strict';

/**
 * Genesis Capital — configuration master data (PRD §2.2, M24). Every value is an
 * ordinary record, editable under Masters after install. Product terms are as
 * published on genesis-capital.demo (October 2026) and must be confirmed
 * with Genesis before go-live.
 */

const today = new Date().toISOString().slice(0, 10);

// ── Product catalogue: every product and service on the website ─────────────
// Terms are those published on genesis-capital.demo (13–14 October 2026).
// Where the website publishes nothing (fees, document lists), the sheet says
// so or lists Genesis's standard onboarding pack; confirm with Genesis before go-live.
const SITE = 'https://www.genesis-capital.demo/products-services';
const KYC_IND = 'National Identity Card or passport; proof of residential address (less than 3 months old); FATCA / CRS self-certification; source of funds evidence';
const KYC_CORP = 'Certificate of incorporation and constitution; register of directors and shareholders; ultimate beneficial owner declarations; board resolution; KYC of directors, signatories and beneficial owners; FATCA / CRS self-certification';
const NOT_PUBLISHED = 'Not published on the website — as set out in the offer letter / agreement.';
const P = (code, name, name_fr, business_unit, category, risk_rating, extra = {}) => ({ code, name, name_fr, business_unit, category, risk_rating, active: true, ...extra });
const LENDER = 'Genesis Life Ltd (Loans business line)';
const products = [
  // Financing solutions — Genesis Life Ltd (loans business line)
  P('LND-RE', 'Real Estate Loan', 'Prêt immobilier', 'LND', 'lending', 2, {
    legal_entity: LENDER, tagline: 'The right type of loan for your residential needs or to build your real estate portfolio.',
    margin: -0.675, currencies: 'MUR', min_amount: 0, max_tenure_months: 360, max_age_at_maturity: 65, max_ltv: 100,
    description: 'Acquire a residential property, purchase a construction lot, renovate your home or invest in real estate.',
    features: 'Term up to 30 years (up to age 65)\nFinancing up to 100% of the cost of the project\nVariable rate as from 6.15% p.a. (Genesis PLR 6.825% less 0.675%)\nMUR loans\nOptional moratorium period to ease cash flow\nOption to repay monthly interest only',
    eligibility: 'Individuals; the loan must end by the borrower\'s 65th birthday; repayment capacity and credit history (MCIB) assessed at appraisal.',
    security_requirements: 'First-rank fixed charge on the property financed. Life insurance and building insurance assigned in favour of Genesis Life Ltd.',
    documents_required: `${KYC_IND}; three latest payslips or two years of accounts / tax returns (self-employed); six months of bank statements; title deed or sale agreement; building permit and bill of quantities (construction / renovation); valuation report from an approved valuer; consent to an MCIB credit report.`,
    fees_and_charges: NOT_PUBLISHED, target_clients: 'Individuals buying, building, renovating or investing in property in Mauritius',
    how_to_apply: 'Request more information on the website (Real Estate Loan) or use the loan calculator; a loans executive contacts you within four business hours, collects the documents and takes the application to credit approval, offer, security perfection and disbursement.',
    document_checklist: 'Real estate loan', website_url: `${SITE}/financing-solutions/individuals/real-estate-loan/`,
  }),
  P('LND-PL', 'Personal Loan', 'Prêt personnel', 'LND', 'lending', 2, {
    legal_entity: LENDER, tagline: 'From short-term to long-term financing needs, at attractive rates with flexible repayment terms.',
    margin: 0.175, currencies: 'MUR', min_amount: 500000, max_tenure_months: 120, max_age_at_maturity: 65, max_ltv: 100,
    description: 'Extra cash, a car, a wedding, education, travel — or a private jet or yacht.',
    features: 'Loan amount as from MUR 500,000\nTerm up to 10 years (up to age 65)\nRate as from 7% p.a. (Genesis PLR 6.825% plus 0.175%)\nAttractive rates and flexible repayment terms',
    eligibility: 'Individuals; minimum MUR 500,000; the loan must end by the borrower\'s 65th birthday.',
    security_requirements: 'First-rank fixed charge on the property being secured.',
    documents_required: `${KYC_IND}; three latest payslips; six months of bank statements; title deed of the property offered as security; consent to an MCIB credit report.`,
    fees_and_charges: NOT_PUBLISHED, target_clients: 'Individuals with a property to offer as security',
    how_to_apply: 'Request more information on the website (Personal Loan) or use the loan calculator; a loans executive takes the application from documents to disbursement.',
    document_checklist: 'Personal loan', website_url: `${SITE}/financing-solutions/individuals/personal-loan/`,
  }),
  P('LND-IBL', 'Investment-Backed Loan', 'Prêt adossé à des placements', 'LND', 'lending', 2, {
    legal_entity: LENDER, tagline: 'Borrow against your investments in a quick, flexible and cost-efficient way.',
    margin: -0.175, currencies: 'MUR', min_amount: 0, max_tenure_months: 120, max_age_at_maturity: 65, max_ltv: 70,
    description: 'Raise capital without additional security or a fixed charge on your assets, keeping your investments intact under a pledge agreement — or borrow to invest, using the return to offset the cost of funding.',
    features: 'Term up to 10 years (up to age 65)\nVariable rate as from 6.65% p.a. (Genesis PLR 6.825% less 0.175%)\nFinancing amount depends on the investment pledged (Income Fund, equity or emerging-market funds)\nInvestments stay invested under the pledge\nMUR loans',
    eligibility: 'Existing Genesis clients holding eligible investments; the loan must end by the borrower\'s 65th birthday.',
    security_requirements: 'Pledge of Genesis Global Funds units (Genesis Income Fund, Genesis Foreign Equity Fund, Genesis Emerging Markets Equity Fund) or of a securities portfolio held with Genesis Securities Ltd, in favour of Genesis Life Ltd. Lending value after haircut per asset class; daily loan-to-value monitoring with margin calls.',
    documents_required: `${KYC_IND}; latest fund or portfolio statement; signed pledge agreement; consent to an MCIB credit report.`,
    fees_and_charges: NOT_PUBLISHED, target_clients: 'Existing fund and securities clients',
    how_to_apply: 'Ask your relationship manager or request more information on the website (Investment Backed Loans); the lending value is calculated from your pledged holdings.',
    document_checklist: 'Investment-backed loan', website_url: `${SITE}/financing-solutions/individuals/investment-backed-loans/`,
  }),
  P('LND-COM', 'Commercial Financing', 'Financement commercial', 'LND', 'lending', 3, {
    legal_entity: LENDER, tagline: 'Financing that helps corporates prepare for their next project.',
    margin: 0.5, currencies: 'MUR; foreign currency by arrangement',
    description: 'From commercial lending to refinancing: bespoke solutions for short-term and long-term cash-flow needs.',
    features: 'Term loans, refinancing, revolving / working capital and bridge facilities\nA relationship manager reviews your situation and advises on the right option\nA dedicated team for simple or complex needs\nDirect contact with the Finance team on contract and loan documentation',
    eligibility: 'Companies with audited financial statements; assessed through a credit memorandum (DSCR, gearing, interest cover) and the approval matrix.',
    security_requirements: 'Security package agreed per facility (fixed and floating charges, guarantees, pledges); financial and information covenants.',
    documents_required: `${KYC_CORP}; three years of audited financial statements; latest management accounts; cash-flow projections; details of the project or refinancing.`,
    fees_and_charges: NOT_PUBLISHED, target_clients: 'Mauritian and regional corporates',
    how_to_apply: 'Request more information on the website (Commercial); a relationship manager reviews your situation and a dedicated team structures the facility.',
    document_checklist: 'Commercial facility', website_url: `${SITE}/financing-solutions/commercial/`,
  }),
  // Wealth — Genesis Wealth Managers Ltd
  P('WLT-DPM', 'Wealth Management', 'Gestion de patrimoine', 'WLT', 'wealth', 3, {
    legal_entity: 'Genesis Wealth Managers Ltd', tagline: 'Grow capital, generate income, preserve wealth or safeguard your assets — our specialists work alongside you.',
    currencies: 'MUR, USD, EUR, GBP',
    description: 'Bespoke, transparent discretionary portfolios built on a global investment platform.',
    features: 'Discretionary portfolio management\nAsset allocation across equities, fixed income, multi-asset, alternatives and liquidity\nGlobal platform: ETFs (iShares, Vanguard, SPDR, Xtrackers, Invesco PowerShares), funds (BlackRock, JP Morgan, Goldman Sachs, AXA, Threadneedle, Janus) and international bonds rated by Moody\'s and S&P\nRisk management and sustainable investment\nContinuous monitoring, monthly reports and regular review meetings',
    eligibility: 'Individuals, families and institutions after a risk-profile questionnaire mapped to model portfolios A–E.',
    security_requirements: 'Not applicable.',
    documents_required: `${KYC_IND}; investor questionnaire (risk profile); signed mandate agreement and Investment Policy Statement.`,
    fees_and_charges: 'Management fee (and performance fee where agreed) per the mandate agreement; not published on the website.',
    target_clients: 'Affluent, high-net-worth and institutional investors',
    how_to_apply: 'Complete the investor questionnaire on the website or request more information (Wealth Management); a portfolio manager meets you to agree objectives, risk and the mandate.',
    document_checklist: 'Discretionary mandate', website_url: `${SITE}/investment-solutions/wealth-management/`,
  }),
  // Investment funds — Genesis Global Funds Ltd
  P('FND-MMF', 'Money Market Fund (Short Term Investment Solutions)', 'Fonds monétaire', 'FND', 'funds', 1, {
    legal_entity: 'Genesis Global Funds Ltd', tagline: 'Liquidity, low volatility and positive short-term returns.',
    currencies: 'USD, MUR, EUR', min_amount: 50000,
    description: 'Invested primarily in high-quality, short-term fixed income instruments.',
    features: 'Daily dealing and valuation\nNo subscription or redemption charges\nShare classes: USD (ISIN MU0768S00020, minimum USD 5,000, additional USD 2,000), MUR (ISIN MU0768S00038, minimum MUR 50,000, additional MUR 25,000), EUR (minimum EUR 5,000, additional EUR 2,000)\nLump-sum investment',
    eligibility: 'Retail and institutional investors seeking short-term gains who are comfortable with unhedged currency exposure.',
    security_requirements: 'Not applicable.', documents_required: `${KYC_IND}; fund application form; risk profile; proof of payment.`,
    fees_and_charges: 'No subscription or redemption charges.', target_clients: 'Retail and institutional investors',
    how_to_apply: 'Request more information (Short Term Investment Solutions) or place a subscription through your relationship manager or the client portal before the dealing cut-off.',
    document_checklist: 'Fund subscription', website_url: `${SITE}/investment-solutions/investment-funds/short-term-investment-solutions/`,
  }),
  P('FND-INC', 'Income Fund (Medium Term Investment Solutions)', 'Fonds de revenu', 'FND', 'funds', 2, {
    legal_entity: 'Genesis Global Funds Ltd', tagline: 'A secure and stable investment with regular income.',
    currencies: 'MUR, USD, EUR, GBP', min_amount: 50000,
    description: 'Genesis Income Fund (ISIN MU0768S00046, launched July 2019): geared towards fixed income to generate stable return and regular income, with opportunities for capital growth.',
    features: 'Target return 3% p.a. in USD and 4–5% p.a. in MUR\nAbout 78% investment-grade; maximum 10% in any one issuer\nBenchmark: 5-Year T-Note Futures Index\nWeekly valuation; regular savings monthly, quarterly or yearly\nDividends twice a year',
    eligibility: 'Investors seeking regular income over the medium term.',
    security_requirements: 'Eligible collateral for an Investment-Backed Loan.', documents_required: `${KYC_IND}; fund application form; risk profile; proof of payment.`,
    fees_and_charges: 'Initial service charge up to 1.50%; exit fee 2% in the first year and 1% in the second year.', target_clients: 'Income-seeking individuals and institutions',
    how_to_apply: 'Request more information (Medium Term Investment Solutions) or subscribe through your relationship manager or the client portal.',
    document_checklist: 'Fund subscription', website_url: `${SITE}/investment-solutions/investment-funds/medium-term-investment-solutions/`,
  }),
  P('FND-FEQ', 'Foreign Equity Fund (Long Term Investment Solutions)', 'Fonds actions internationales', 'FND', 'funds', 4, {
    legal_entity: 'Genesis Global Funds Ltd', tagline: 'Capital appreciation from developed equity markets.',
    currencies: 'MUR, USD', min_amount: 50000,
    description: 'Genesis Foreign Equity Fund (ISIN MU0768S00053, launched October 2008): actively managed, invested in developed equity markets (US, Europe, UK, Japan) over the medium to long term.',
    features: 'Benchmark: MSCI World (MUR)\nReturns come from capital appreciation (not taxed for investors, per the fund)\nActively managed',
    eligibility: 'Investors with a long-term horizon and a profile that accepts equity risk (risk 4).',
    security_requirements: 'Eligible collateral for an Investment-Backed Loan.', documents_required: `${KYC_IND}; fund application form; risk profile; proof of payment.`,
    fees_and_charges: 'As per the prospectus; not published on the product page.', target_clients: 'Long-term growth investors',
    how_to_apply: 'Request more information (Long Term Investment Solutions) or subscribe through your relationship manager.',
    document_checklist: 'Fund subscription', website_url: `${SITE}/investment-solutions/investment-funds/long-term-investment-solutions/`,
  }),
  P('FND-EME', 'Emerging Markets Equity Fund (Long Term Investment Solutions)', 'Fonds actions marchés émergents', 'FND', 'funds', 5, {
    legal_entity: 'Genesis Global Funds Ltd', tagline: 'Growth from a diversified portfolio of emerging-market equities.',
    currencies: 'MUR, USD', min_amount: 50000,
    description: 'Genesis Emerging Market Equity Fund (ISIN MU0768S00004, launched November 2018): actively managed, investing in emerging equity markets (China, India, Brazil and others) for capital gain and income.',
    features: 'Benchmark: MSCI Emerging Markets Net Index (MUR)\nAnnual income distribution, subject to statutory requirements and Directors\' approval',
    eligibility: 'Investors with a long-term horizon and a high risk tolerance (risk 5).',
    security_requirements: 'Eligible collateral for an Investment-Backed Loan.', documents_required: `${KYC_IND}; fund application form; risk profile; proof of payment.`,
    fees_and_charges: 'As per the prospectus; not published on the product page.', target_clients: 'Long-term growth investors',
    how_to_apply: 'Request more information or subscribe through your relationship manager; a suitability override is needed above your risk profile.',
    document_checklist: 'Fund subscription', website_url: `${SITE}/investment-solutions/investment-funds/long-term-investment-solutions/`,
  }),
  P('FND-GPE', 'Global Private Equity Fund (Alternative Investment Solutions)', 'Fonds de capital-investissement', 'FND', 'funds', 5, {
    legal_entity: 'Genesis Global Funds Ltd', tagline: 'Capital growth over the medium to long term from private equity worldwide.',
    currencies: 'USD (base); accessible in MUR, USD, EUR, GBP',
    description: 'Genesis Global Private Equity Fund (ISIN MU0768S00012): a diversified range of private-equity investments worldwide across healthcare, technology, consumer, business services and industrials.',
    features: 'Initial subscription USD 10,000; additional USD 5,000\nValuation one business day after the underlying holdings are priced\nQuarterly redemptions',
    eligibility: 'Professional investors.',
    security_requirements: 'Not applicable.', documents_required: `${KYC_IND}; professional-investor classification evidence; fund application form; risk profile; proof of payment.`,
    fees_and_charges: 'Initial service charge up to 3.0%.', target_clients: 'Professional / sophisticated investors',
    how_to_apply: 'Request more information (Alternative Investment Solutions); a suitability check confirms professional status.',
    document_checklist: 'Fund subscription', website_url: `${SITE}/investment-solutions/investment-funds/alternative-investment-solutions/`,
  }),
  P('FND-FMB29', 'Fixed Maturity Bond 2029', 'Obligation à échéance fixe 2029', 'FND', 'funds', 2, {
    legal_entity: 'Genesis Global Funds Ltd', tagline: 'An annual fixed rate until maturity in May 2029.',
    currencies: 'USD',
    description: 'Fixed Maturity Bond (Maturity: 2029) ("FMB"): an open-ended CIS feeder fund invested 100% in the Schroder Special Situations Fund Fixed Maturity Bond 7 (USD) — about 62 bonds with an average credit rating of BBB / Baa2.',
    features: 'Minimum subscription USD 50,000\nAnnual fixed rate until maturity (May 2029)\nQuarterly dividend distribution\nInvestment-grade portfolio of about 62 bonds',
    eligibility: 'Investors able to hold until maturity in 2029.',
    security_requirements: 'Not applicable.', documents_required: `${KYC_IND}; fund application form; risk profile; proof of payment.`,
    fees_and_charges: 'Entry fee up to 2%.', target_clients: 'Income investors with a fixed horizon',
    how_to_apply: 'Subscribe during the series subscription window through your relationship manager or request more information on the website.',
    document_checklist: 'Fund subscription', website_url: `${SITE}/investment-solutions/investment-funds/fixed-maturity-bond-maturity-2029/`,
  }),
  // Trading solutions — Genesis CMB Securities Ltd
  P('SEC-TRD', 'Trading Solutions', 'Solutions de négociation', 'SEC', 'securities', 4, {
    legal_entity: 'Genesis CMB Securities Ltd', tagline: 'A dedicated team of research analysts and portfolio advisors for retail and corporate clients.',
    currencies: 'MUR and hard currencies',
    description: 'Local and international trading, research and portfolio advisory.',
    features: 'Local investments on the Stock Exchange of Mauritius\nInternational shares, mutual funds and ETFs\nResearch and market statistics\nBack-office settlement',
    eligibility: 'Individuals and corporates after KYC and an appropriateness assessment.', security_requirements: 'Not applicable.',
    documents_required: `${KYC_IND}; CDS account opening form; account agreement; appropriateness questionnaire.`,
    fees_and_charges: 'Brokerage per the tariff; not published on the website.', target_clients: 'Retail and corporate investors',
    how_to_apply: 'Request more information (Trading Solutions); the team opens your CDS account and trading account.',
    document_checklist: 'Trading account opening', website_url: `${SITE}/investment-solutions/trading-solutions/`,
  }),
  P('SEC-LOC', 'Local Investments (SEM)', 'Investissements locaux (SEM)', 'SEC', 'securities', 4, {
    legal_entity: 'Genesis CMB Securities Ltd', tagline: 'Trading portfolio options for starting and experienced investors.',
    currencies: 'MUR',
    description: 'Buy and sell shares on the Stock Exchange of Mauritius, matched to your goals and risk profile.',
    features: 'Help to open a CDS securities account\nTrading specialists act on your instructions\nResearch on market trends and portfolio allocation\nBack-office settlement',
    eligibility: 'Investors holding a CDS securities account with an investment dealer or custodian participant.', security_requirements: 'Not applicable.',
    documents_required: `${KYC_IND}; CDS account opening form (you receive a GBL number by email); account agreement.`,
    fees_and_charges: 'Brokerage per the tariff; not published on the website.', target_clients: 'Local equity investors',
    how_to_apply: '1. Start onboarding to open a CDS account and wait for the confirmation email with your GBL number. 2. Fund your account. 3. Call or email the trading desk to place orders.',
    document_checklist: 'Trading account opening', website_url: `${SITE}/investment-solutions/trading-solutions/local-investments/`,
  }),
  P('SEC-INT', 'International Offering', 'Offre internationale', 'SEC', 'securities', 4, {
    legal_entity: 'Genesis CMB Securities Ltd', tagline: 'Opportunities beyond the domestic market.',
    currencies: 'USD, EUR, GBP and other hard currencies',
    description: 'International shares, mutual funds and ETFs on the Genesis Securities trading platform, with custody.',
    features: 'Trade in full autonomy or through the international trading desk\nResearch and portfolio advisory\nCustody on the platform or with a bank of your choice\nPre-funding in hard currency',
    eligibility: 'Clients registered with Genesis Securities Ltd or with a custodian account at their bank.', security_requirements: 'Not applicable.',
    documents_required: `${KYC_IND}; account opening form; signed Investment Clarification Notice; appropriateness questionnaire.`,
    fees_and_charges: 'Trading fee, custodian fee and, for some mutual funds and ETFs, an entry fee; amounts not published on the website.', target_clients: 'Investors seeking international diversification',
    how_to_apply: 'Request more information (International Offering); our team onboards you and sets up the platform account.',
    document_checklist: 'Trading account opening', website_url: `${SITE}/investment-solutions/trading-solutions/international-offering/`,
  }),
  P('SEC-MKT', 'Market Statistics & Research', 'Statistiques de marché', 'SEC', 'securities', 1, {
    legal_entity: 'Genesis CMB Securities Ltd', tagline: 'Weekly market highlights, statistics and research.',
    description: 'Market statistics, weekly highlights and research notes, distributed to subscribers with their consent.',
    features: 'SEMDEX and market statistics\nWeekly highlights\nResearch notes and notices',
    eligibility: 'Anyone who subscribes.', security_requirements: 'Not applicable.', documents_required: 'None — newsletter sign-up with consent.',
    fees_and_charges: 'Free.', target_clients: 'Investors and the public',
    how_to_apply: 'Sign up for the newsletter on the website.', website_url: `${SITE}/investment-solutions/trading-solutions/`,
  }),
  // Corporate advisory — Genesis Corporate Advisors Ltd
  P('ADV-FR', 'Fund Raising', 'Levée de fonds', 'ADV', 'advisory', null, {
    legal_entity: 'Genesis Corporate Advisors Ltd', tagline: 'Raise capital through shares, bonds or other innovative approaches.',
    description: 'A relationship-led approach through preparing and raising funds, so you can focus on operations and investor relations.',
    features: 'Capital raising\nUnsecured debt, bond and share offers\nAccess to a wide range of investors\nEnd-to-end management of the raise',
    eligibility: 'Companies with a capital-raising need, subject to a conflict check before engagement.', security_requirements: 'Not applicable.',
    documents_required: `${KYC_CORP}; signed engagement letter; non-disclosure agreement; company information pack.`,
    fees_and_charges: 'Retainer and success fee per the engagement letter.', target_clients: 'Corporates and project sponsors',
    how_to_apply: 'Request more information (Fund Raising); an advisor meets you, Compliance clears conflicts, and an engagement letter starts the mandate.',
    document_checklist: 'Advisory engagement', website_url: `${SITE}/corporate-advisory-services/fund-raising/`,
  }),
  P('ADV-VAL', 'Valuation & Business Plan', 'Évaluation et plan d\'affaires', 'ADV', 'advisory', null, {
    legal_entity: 'Genesis Corporate Advisors Ltd', tagline: 'Precise, sound valuation data and business plans that serve as your blueprint.',
    description: 'Valuations, business planning and market research supporting strategic, operational or financial goals.',
    features: 'Purchase price allocation valuation\nValuation of intellectual property rights\nMark-to-market valuations\nEmployee share purchase and option plans\nValuations for tax purposes\nDispute advisory services\nValuation reports for mergers, acquisitions, investments or public offerings\nTransaction valuation\nBusiness planning and market research',
    eligibility: 'Companies and investors, subject to a conflict check.', security_requirements: 'Not applicable.',
    documents_required: `${KYC_CORP}; engagement letter; financial statements and forecasts.`,
    fees_and_charges: 'Fixed or milestone fees per the engagement letter.', target_clients: 'Corporates, investors and advisers',
    how_to_apply: 'Request more information (Valuation & Business Plan).',
    document_checklist: 'Advisory engagement', website_url: `${SITE}/corporate-advisory-services/valuation-business-plan/`,
  }),
  P('ADV-RES', 'Corporate Restructuring Advisory', 'Conseil en restructuration', 'ADV', 'advisory', null, {
    legal_entity: 'Genesis Corporate Advisors Ltd', tagline: 'The right restructuring option in a volatile economic environment.',
    description: 'Advice on all types of restructurings, financings and strategic options, including accounting, tax and regulatory challenges.',
    features: 'Company formation / liquidation advisory\nRe-capitalisation and re-organisation advisory\nFinancial viability and business plan advisory\nAdvice on crisis stabilisation\nTurnaround strategies\nFeasibility studies and support through execution',
    eligibility: 'Companies facing restructuring decisions, subject to a conflict check.', security_requirements: 'Not applicable.',
    documents_required: `${KYC_CORP}; engagement letter; financial statements; creditor and shareholder information.`,
    fees_and_charges: 'Per the engagement letter.', target_clients: 'Companies in transition or distress',
    how_to_apply: 'Request more information (Corporate Restructuring Advisory).',
    document_checklist: 'Advisory engagement', website_url: `${SITE}/corporate-advisory-services/corporate-restructuring-advisory/`,
  }),
  // Forex — Genesis Forex Ltd
  P('FX-GEN', 'Genesis Forex', 'Genesis Forex', 'FX', 'fx', 2, {
    legal_entity: 'Genesis Forex Ltd', tagline: 'Talk to our Forexpert for corporate and individual solutions.',
    currencies: 'AUD, CAD, CHF, EUR, GBP, JPY, USD, ZAR and others',
    description: 'Fully transparent, quality execution with a customer-centric approach; indicative TT rates published daily on the website.',
    features: 'Forex spot, forward transactions and forex swaps\nTailored attention from our Forexperts\nIndicative exchange rates published daily',
    eligibility: 'Corporate and individual clients after KYC and an FX profile.', security_requirements: 'Settlement limits per client.',
    documents_required: `${KYC_IND} (individuals) or ${KYC_CORP} (companies); FX client profile; settlement account details; evidence of the underlying transaction for Bank of Mauritius purpose codes.`,
    fees_and_charges: 'Dealing spread included in the quoted rate.', target_clients: 'Importers, exporters, students abroad, property buyers and investors',
    how_to_apply: 'Request more information (Genesis Forex) or call a Forexpert for a quote.', website_url: `${SITE}/forex-services/genesis-forex/`,
  }),
  P('FX-SPOT', 'Forex Spot', 'Change au comptant', 'FX', 'fx', 2, {
    legal_entity: 'Genesis Forex Ltd', tagline: 'Spot exchange at transparent, competitive rates.', currencies: 'AUD, CAD, CHF, EUR, GBP, JPY, USD, ZAR',
    description: 'Buy or sell foreign currency for settlement within two business days.', features: 'Quotes against the daily rate board\nBest-execution audit trail',
    eligibility: 'FX clients with an approved profile.', security_requirements: 'Settlement limit.', documents_required: 'As for Genesis Forex.', fees_and_charges: 'Dealing spread included in the rate.',
    target_clients: 'Corporate and individual clients', how_to_apply: 'Ask a Forexpert for a quote.', website_url: `${SITE}/forex-services/genesis-forex/`,
  }),
  P('FX-FWD', 'Forward Transactions', 'Opérations à terme', 'FX', 'fx', 3, {
    legal_entity: 'Genesis Forex Ltd', tagline: 'Fix today the rate of a future payment.', currencies: 'Major currencies',
    description: 'Forward contracts to hedge known future foreign-currency payments or receipts.', features: 'Fixed forward rate\nRoll-over offered before maturity\nMaturity reminders',
    eligibility: 'FX clients approved for forwards.', security_requirements: 'Forward limit.', documents_required: 'As for Genesis Forex, plus evidence of the underlying exposure.', fees_and_charges: 'Forward points included in the rate.',
    target_clients: 'Importers, exporters and corporate treasuries', how_to_apply: 'Ask a Forexpert.', website_url: `${SITE}/forex-services/genesis-forex/`,
  }),
  P('FX-SWAP', 'Forex Swap', 'Swap de change', 'FX', 'fx', 3, {
    legal_entity: 'Genesis Forex Ltd', tagline: 'Forex swaps with a customer-centric approach.', currencies: 'Major currencies',
    description: 'Exchange currencies now and reverse the exchange at a later date to manage liquidity.', features: 'Near and far legs agreed upfront\nTailored tenors',
    eligibility: 'FX clients approved for swaps.', security_requirements: 'Swap limit.', documents_required: 'As for Genesis Forex.', fees_and_charges: 'Swap points included in the rates.',
    target_clients: 'Corporate treasuries', how_to_apply: 'Ask a Forexpert.', website_url: `${SITE}/forex-services/genesis-forex/`,
  }),
];

// Website "I am interested in" labels → product, entity and queue (Appendix A).
// The duplicate trading labels on today's form are de-duplicated here.
const routing = [
  ['Real Estate Loan', 'LND-RE', 'LND', 'Retail Loans'], ['Personal Loan', 'LND-PL', 'LND', 'Retail Loans'],
  ['Investment Backed Loans', 'LND-IBL', 'LND', 'Retail Loans (notify existing RM)'], ['Commercial', 'LND-COM', 'LND', 'Commercial Lending'],
  ['Wealth Management', 'WLT-DPM', 'WLT', 'Wealth RMs'],
  ['Short Term Investment Solutions', 'FND-MMF', 'FND', 'Fund Sales'], ['Medium Term Investment Solutions', 'FND-INC', 'FND', 'Fund Sales'],
  ['Long Term Investment Solutions', 'FND-FEQ', 'FND', 'Fund Sales'], ['Emerging Markets Equity Fund', 'FND-EME', 'FND', 'Fund Sales'],
  ['Alternative Investment Solutions', 'FND-GPE', 'FND', 'Fund Sales'], ['Fixed Maturity Bond (Maturity: 2029)', 'FND-FMB29', 'FND', 'Fund Sales'],
  ['Trading Solutions', 'SEC-TRD', 'SEC', 'Securities Desk'], ['Local Investments', 'SEC-LOC', 'SEC', 'Securities Desk'],
  ['International Offering', 'SEC-INT', 'SEC', 'Securities Desk'], ['Market Statistics', 'SEC-MKT', 'SEC', 'Research'],
  ['Fund Raising', 'ADV-FR', 'ADV', 'Advisory (private side)'], ['Valuation & Business Plan', 'ADV-VAL', 'ADV', 'Advisory'],
  ['Corporate Restructuring Advisory', 'ADV-RES', 'ADV', 'Advisory'],
  ['Genesis Forex', 'FX-GEN', 'FX', 'Forex Desk'], ['Forex Spot', 'FX-SPOT', 'FX', 'Forex Desk'], ['Forwarding transactions', 'FX-FWD', 'FX', 'Forex Desk'], ['Forex Swap', 'FX-SWAP', 'FX', 'Forex Desk'],
].map(([website_label, product_code, business_unit, queue]) => ({ website_label, prod_param: website_label, product_code, business_unit, queue, first_contact_hours: 4 }));

const countries = [
  ['MU', 'Mauritius', 'none', 5], ['SC', 'Seychelles', 'none', 10], ['KM', 'Comoros', 'none', 15], ['ZM', 'Zambia', 'none', 15],
  ['RW', 'Rwanda', 'none', 12], ['ZA', 'South Africa', 'grey', 25], ['RE', 'Réunion', 'none', 5], ['MG', 'Madagascar', 'none', 15],
  ['FR', 'France', 'none', 5], ['GB', 'United Kingdom', 'none', 5], ['IN', 'India', 'none', 10], ['AE', 'United Arab Emirates', 'none', 15],
  ['US', 'United States', 'none', 5], ['CN', 'China', 'none', 10], ['IR', 'Iran', 'black', 40], ['KP', 'North Korea', 'black', 40],
  ['MM', 'Myanmar', 'black', 40], ['OTHER', 'Other', 'none', 15],
].map(([iso_code, name, fatf_status, risk_score]) => ({ iso_code, name, fatf_status, risk_score, sanctioned: ['IR', 'KP'].includes(iso_code) }));

// Indicative TT rates published on the website, 13 October 2026.
const fxBoard = [
  ['MUR', 1, 1, 1], ['USD', 47.855, 47.15, 48.56], ['EUR', 53.43, 52.64, 54.22], ['GBP', 63.205, 62.27, 64.14], ['ZAR', 3.015, 2.92, 3.11],
  ['AUD', 34.515, 33.61, 35.42], ['JPY', 0.30155, 0.2971, 0.306], ['CAD', 35.14, 34.30, 35.98], ['CHF', 57.265, 56.42, 58.11],
].map(([currency_code, rate_to_mur, buy_tt, sell_tt]) => ({ currency_code, rate_to_mur, buy_tt, sell_tt, rate_date: '2026-10-13' }));

const modelPortfolios = [
  ['A', 'Conservative', 1, 10, 60, 30, 0, 'Capital preservation; mostly bonds and money market.'],
  ['B', 'Moderately conservative', 2, 30, 50, 15, 5, 'Income with modest growth.'],
  ['C', 'Balanced', 3, 50, 35, 5, 10, 'Balanced growth and income.'],
  ['D', 'Growth', 4, 70, 20, 0, 10, 'Long-term growth; accepts volatility.'],
  ['E', 'Aggressive', 5, 85, 5, 0, 10, 'Maximum long-term growth.'],
].map(([code, name, risk_level, equity_pct, bond_pct, cash_pct, alternatives_pct, description]) => ({ code, name, risk_level, equity_pct, bond_pct, cash_pct, alternatives_pct, description }));

// KYC risk factors (model v1) — read by the KYC risk-score formula.
const riskFactors = [
  ['pep', 'pep', 'PEP', 30],
  ['product_low', 'product', 'low', 0], ['product_medium', 'product', 'medium', 10], ['product_high', 'product', 'high', 20],
  ['channel_face_to_face', 'channel', 'face to face', 0], ['channel_non_face_to_face', 'channel', 'non face to face', 10],
  ['occupation_low', 'occupation', 'low', 0], ['occupation_medium', 'occupation', 'medium', 7], ['occupation_high', 'occupation', 'high', 15],
  ['ownership_simple', 'ownership', 'simple', 0], ['ownership_layered', 'ownership', 'layered', 8], ['ownership_complex', 'ownership', 'complex / opaque', 15],
  ['activity_low', 'activity', 'low', 0], ['activity_medium', 'activity', 'medium', 5], ['activity_high', 'activity', 'high', 10],
].map(([code, factor, value, score]) => ({ code, factor, value, score, model_version: 'v1', effective_from: '2026-01-01' }));

const collateralTypes = [
  ['residential', 'Residential property', 0, 36, 85, 95, 100], ['land', 'Land / construction lot', 10, 36, 80, 90, 100],
  ['commercial', 'Commercial property', 15, 24, 75, 85, 95], ['fund_units', 'Fund units', 30, 1, 75, 80, 90],
  ['securities', 'Securities portfolio', 40, 1, 75, 80, 90], ['cash', 'Cash deposit', 0, 12, 95, 98, 100], ['guarantee', 'Guarantee', 50, 12, 80, 90, 100],
].map(([code, label, haircut_pct, revaluation_months, ltv_warning_pct, ltv_margin_call_pct, ltv_liquidation_pct]) => ({ code, label, haircut_pct, revaluation_months, ltv_warning_pct, ltv_margin_call_pct, ltv_liquidation_pct }));

const approvalBands = [
  ['LND|5M', 'LND', 5000000, 'loans_manager', 'Loans Manager', 1],
  ['LND|20M', 'LND', 20000000, 'credit_committee', 'Credit Committee', 2],
  ['LND|MAX', 'LND', 999999999999, 'board_credit_committee', 'Board Credit Committee', 3],
  ['LND|RATE', 'LND', 999999999999, 'loans_manager', 'Loans Manager (rate override ≤ 0.25 pts)', 1],
  ['FND|ORDER', 'FND', 999999999999, 'operations_checker', 'Operations checker', 1],
].map(([band_key, business_unit, max_amount, approver_role, approver_label, quorum]) => ({ band_key, business_unit, max_amount, approver_role, approver_label, quorum, exception_type: band_key.endsWith('RATE') ? 'rate_override' : 'none' }));

const catalogue = [
  ['address_change', 'Address change', 'ALL', 16, false], ['statement_request', 'Statement request', 'ALL', 16, false],
  ['early_settlement_quote', 'Early settlement quote', 'LND', 24, false], ['partial_prepayment', 'Partial prepayment', 'LND', 40, true],
  ['tenure_change', 'Tenure change', 'LND', 80, true], ['moratorium_request', 'Moratorium request', 'LND', 80, true],
  ['redemption', 'Fund redemption', 'FND', 16, true], ['top_up', 'Top-up', 'WLT', 16, false], ['fx_settlement_query', 'FX settlement query', 'FX', 8, false],
  ['certificate_of_balance', 'Certificate of balance', 'LND', 24, false], ['title_release', 'Release of title deeds', 'LND', 80, true],
  ['complaint', 'Complaint', 'ALL', 120, false], ['other', 'Other', 'ALL', 40, false],
].map(([request_type, label, business_unit, sla_hours, requires_approval]) => ({ request_type, label, business_unit, sla_hours, requires_approval }));

const reasons = [
  ['LD-NONEED', 'lead_disqualification', 'No current need', 'Pas de besoin actuel'], ['LD-NOTELIG', 'lead_disqualification', 'Not eligible', 'Non éligible'],
  ['LD-DUP', 'lead_disqualification', 'Duplicate', 'Doublon'], ['LD-UNREACH', 'lead_disqualification', 'Unreachable', 'Injoignable'],
  ['LN-AFF', 'loan_decline', 'Affordability', 'Capacité de remboursement'], ['LN-CREDIT', 'loan_decline', 'Credit history', 'Historique de crédit'],
  ['LN-SEC', 'loan_decline', 'Insufficient security', 'Garantie insuffisante'], ['LN-AGE', 'loan_decline', 'Age / tenure', 'Âge / durée'],
  ['MD-PERF', 'mandate_loss', 'Performance', 'Performance'], ['MD-FEES', 'mandate_loss', 'Fees', 'Frais'], ['MD-RELOC', 'mandate_loss', 'Client relocated', 'Client relocalisé'],
  ['AC-REQ', 'account_closure', 'Client request', 'Demande du client'], ['AC-DORM', 'account_closure', 'Dormant', 'Inactif'],
  ['RC-PROC', 'complaint_root_cause', 'Process', 'Processus'], ['RC-PEOPLE', 'complaint_root_cause', 'People', 'Personnel'], ['RC-SYS', 'complaint_root_cause', 'System', 'Système'],
].map(([code, reason_type, label, label_fr]) => ({ code, reason_type, label, label_fr }));

// Fund master and share classes (classes priced by NAV history in the demo set).
const funds = [
  { code: 'FND-MMF', name: 'Genesis Money Market Fund', asset_class: 'money_market', horizon: 'short', base_currency: 'USD',
    objective: 'Maintain liquidity, keep volatility low and provide positive short-term returns by investing primarily in high-quality, short-term fixed income instruments.',
    structure: 'USD, MUR and EUR share classes; unhedged currency exposure.', distribution: 'Not stated on the website', redemption: 'Daily dealing and valuation; no subscription or redemption charges',
    target_investors: 'Retail and institutional investors seeking short-term gains', product_page: `${SITE}/investment-solutions/investment-funds/short-term-investment-solutions/` },
  { code: 'FND-INC', name: 'Genesis Income Fund', isin: 'MU0768S00046', asset_class: 'fixed_income', horizon: 'medium', base_currency: 'USD', benchmark: '5-Year T-Note Futures Index', launch_date: '2019-07-01',
    objective: 'Geared towards fixed income investments to generate stable return, regular income and opportunities for capital growth. Target return 3% p.a. in USD and 4–5% p.a. in MUR.',
    structure: '78.2% investment grade, 8.4% non-investment grade, 13.4% cash; maximum 10% exposure to any one issuer. Accessible in MUR, USD, EUR or GBP.',
    distribution: 'Dividends twice a year, depending on performance and local legislation', redemption: 'Weekly valuation; regular savings monthly, quarterly or yearly; exit fee 2% (year 1) and 1% (year 2)',
    target_investors: 'Investors seeking regular income', product_page: `${SITE}/investment-solutions/investment-funds/medium-term-investment-solutions/` },
  { code: 'FND-FEQ', name: 'Genesis Foreign Equity Fund', isin: 'MU0768S00053', asset_class: 'equity', horizon: 'long', base_currency: 'MUR', benchmark: 'MSCI World (MUR)', launch_date: '2008-10-01',
    objective: 'Actively managed; seeks capital appreciation by investing in developed equity markets (US, Europe, UK, Japan) over the medium to long term.',
    structure: 'Developed-market equities.', distribution: 'Capital appreciation only', redemption: 'As per the prospectus',
    target_investors: 'Long-term growth investors', product_page: `${SITE}/investment-solutions/investment-funds/long-term-investment-solutions/` },
  { code: 'FND-EME', name: 'Genesis Emerging Markets Equity Fund', isin: 'MU0768S00004', asset_class: 'equity', horizon: 'long', base_currency: 'MUR', benchmark: 'MSCI Emerging Markets Net Index (MUR)', launch_date: '2018-11-01',
    objective: 'Actively managed; grows investment through capital gain and income from a diversified portfolio of emerging-market equities (China, India, Brazil and others) over the medium to long term.',
    structure: 'Emerging-market equities.', distribution: 'Annual, subject to statutory requirements and Directors\' approval', redemption: 'As per the prospectus',
    target_investors: 'Long-term growth investors with a high risk tolerance', product_page: `${SITE}/investment-solutions/investment-funds/long-term-investment-solutions/` },
  { code: 'FND-GPE', name: 'Genesis Global Private Equity Fund', isin: 'MU0768S00012', asset_class: 'private_equity', horizon: 'alternative', base_currency: 'USD',
    objective: 'Capital growth over the medium to long term from a diversified range of private-equity investments worldwide.',
    structure: 'Sectors: healthcare, technology, consumer, business services and industrials. Accessible in MUR, USD, EUR and GBP.',
    distribution: 'Not stated', redemption: 'Valuation one business day after the underlying holdings are priced; quarterly redemptions',
    target_investors: 'Professional investors', product_page: `${SITE}/investment-solutions/investment-funds/alternative-investment-solutions/` },
  { code: 'FND-FMB29', name: 'Genesis Fixed Maturity Bond 2029', asset_class: 'fixed_maturity', horizon: 'medium', base_currency: 'USD', maturity_date: '2029-05-31',
    objective: 'An annual fixed rate until maturity in May 2029.',
    structure: 'Open-ended CIS feeder fund invested 100% in the Schroder Special Situations Fund Fixed Maturity Bond 7 (USD): about 62 bonds, average credit rating BBB / Baa2.',
    distribution: 'Quarterly dividends', redemption: 'Hold to maturity (May 2029); entry fee up to 2%',
    target_investors: 'Income investors with a fixed horizon', product_page: `${SITE}/investment-solutions/investment-funds/fixed-maturity-bond-maturity-2029/` },
];

// Share classes as published (minimums, ISINs, fees). Cut-off times are Genesis's
// operating parameter (not on the website) — confirm before go-live.
const shareClasses = [
  ['MMF-USD', 'FND-MMF', 'USD class', 'USD', 'MU0768S00020', 1, 5000, 2000, 0, 0, null, 'daily', false],
  ['MMF-MUR', 'FND-MMF', 'MUR class', 'MUR', 'MU0768S00038', 1, 50000, 25000, 0, 0, null, 'daily', false],
  ['MMF-EUR', 'FND-MMF', 'EUR class', 'EUR', null, 1, 5000, 2000, 0, 0, null, 'daily', false],
  ['INC-MUR', 'FND-INC', 'MUR class', 'MUR', 'MU0768S00046', 2, 50000, null, 1.5, 2, null, 'weekly', true],
  ['FEQ-MUR', 'FND-FEQ', 'MUR class', 'MUR', 'MU0768S00053', 4, 50000, null, null, null, null, 'daily', false],
  ['FEQ-USD', 'FND-FEQ', 'USD class', 'USD', null, 4, 2000, null, null, null, null, 'daily', false],
  ['EME-USD', 'FND-EME', 'USD class', 'USD', 'MU0768S00004', 5, 2000, null, null, null, null, 'weekly', true],
  ['GPE-USD', 'FND-GPE', 'USD class', 'USD', 'MU0768S00012', 5, 10000, 5000, 3, null, null, 'quarterly', false],
  ['FMB29-USD', 'FND-FMB29', 'USD class', 'USD', null, 2, 50000, null, 2, null, null, 'closed', true],
].map(([class_code, fund, class_name, currency_code, isin, risk_rating, min_investment, additional_investment, entry_fee_pct, exit_fee_pct, management_fee_pct, dealing_frequency, distribution_policy]) => ({
  class_code, fund: `@fund:code=${fund}`, class_name, currency_code, isin, risk_rating, min_investment, additional_investment, entry_fee_pct, exit_fee_pct, management_fee_pct, dealing_frequency,
  distribution_policy, cut_off_time: '12:00 Mauritius time',
}));

module.exports = [
  { object: 'financial_product', key: 'code', records: products },
  { object: 'product_routing', key: 'product_code', records: routing },
  { object: 'plr_rate', key: 'effective_from', records: [
    { rate: 7.0, effective_from: '2025-01-01', approved_by: 'ALCO' },
    { rate: 6.825, effective_from: '2026-01-01', approved_by: 'ALCO' },
  ] },
  { object: 'country', key: 'iso_code', records: countries },
  { object: 'fx_rate', key: ['currency_code', 'rate_date'], records: fxBoard },
  { object: 'model_portfolio', key: 'code', records: modelPortfolios },
  { object: 'kyc_risk_factor', key: 'code', records: riskFactors },
  { object: 'collateral_type', key: 'code', records: collateralTypes },
  { object: 'approval_matrix', key: 'band_key', records: approvalBands },
  { object: 'service_catalogue', key: 'request_type', records: catalogue },
  { object: 'reason_code', key: 'code', records: reasons },
  { object: 'fund', key: 'code', records: funds },
  { object: 'fund_share_class', key: 'class_code', records: shareClasses },
];
module.exports.today = today;
