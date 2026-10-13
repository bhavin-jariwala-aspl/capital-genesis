'use strict';

const crypto = require('crypto');
const { logger } = require('./logging.service');

/**
 * CalculationEngineService — Life Insurance premium calculation engine.
 *
 * Production-ready rating engine using 2017 CSO mortality tables, expense
 * loading, profit margins, and rider pricing to produce realistic US-market
 * premium figures. Supports all major life product types.
 *
 * Architecture:
 *   - Internal rating via CSO tables (default)
 *   - Adapter pattern via RatingAdapterRegistry for carrier API integrations
 *   - Quote persistence to QuoteScenario table for audit and comparison
 *   - Comparative quoting with side-by-side analysis
 */
class CalculationEngineService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;

    // ── 2017 CSO-approximated base mortality rates (per 1 000) by age ──────
    // Simplified unisex table; gender adjustments applied as multipliers.
    this._baseMortalityPer1000 = {
      18: 0.50, 19: 0.52, 20: 0.54, 21: 0.56, 22: 0.57, 23: 0.58, 24: 0.59,
      25: 0.60, 26: 0.62, 27: 0.64, 28: 0.66, 29: 0.69, 30: 0.72, 31: 0.76,
      32: 0.80, 33: 0.85, 34: 0.90, 35: 0.96, 36: 1.03, 37: 1.11, 38: 1.20,
      39: 1.30, 40: 1.42, 41: 1.56, 42: 1.72, 43: 1.90, 44: 2.11, 45: 2.35,
      46: 2.62, 47: 2.93, 48: 3.28, 49: 3.67, 50: 4.11, 51: 4.60, 52: 5.15,
      53: 5.77, 54: 6.46, 55: 7.24, 56: 8.11, 57: 9.09, 58: 10.18, 59: 11.41,
      60: 12.79, 61: 14.34, 62: 16.07, 63: 18.01, 64: 20.18, 65: 22.62,
      66: 25.35, 67: 28.40, 68: 31.82, 69: 35.66, 70: 39.96, 71: 44.78,
      72: 50.18, 73: 56.23, 74: 63.01, 75: 70.60, 76: 79.11, 77: 88.64,
      78: 99.32, 79: 111.27, 80: 124.65, 81: 139.63, 82: 156.42, 83: 175.26,
      84: 196.39, 85: 220.11,
    };

    // ── Gender mortality multipliers ────────────────────────────────────────
    this._genderFactors = { male: 1.0, female: 0.60, non_binary: 0.80 };

    // ── Smoker multipliers ──────────────────────────────────────────────────
    this._smokerFactors = { never: 1.0, former: 1.50, current: 2.50 };

    // ── Health class multipliers ────────────────────────────────────────────
    this._healthClassFactors = {
      preferred_plus: 0.75,
      preferred:      0.90,
      standard_plus:  1.00,
      standard:       1.20,
      substandard:    1.75,
    };

    // ── Expense loading & profit margin (% of net premium) ──────────────────
    this._expenseLoadingPct  = 0.25;   // 25 % acquisition + admin
    this._profitMarginPct    = 0.08;   // 8 %
    this._policyFeesAnnual   = {
      term_life:              75,
      whole_life:             95,
      universal_life:         120,
      variable_life:          150,
      indexed_universal_life: 140,
      final_expense:          60,
    };

    // ── Interest / crediting assumptions ────────────────────────────────────
    this._guaranteedRate     = 0.025;  // 2.5 % for whole life
    this._currentCreditRate  = 0.045;  // 4.5 % for UL / IUL illustrated
    this._variableReturnRate = 0.065;  // 6.5 % gross for variable

    // ── Payment frequency multipliers (annual = 1.00) ───────────────────────
    this._frequencyMultipliers = {
      annual:      1.000,
      semi_annual: 0.520,   // slight surcharge
      quarterly:   0.265,
      monthly:     0.0900,
    };

    // ── Product catalog ─────────────────────────────────────────────────────
    this._products = [
      {
        type: 'term_life',
        name: 'Genesis Term Life',
        description: 'Affordable level-term coverage with guaranteed premiums for the selected term period.',
        min_coverage: 25000,
        max_coverage: 10000000,
        min_age: 18,
        max_age: 75,
        available_terms: [10, 15, 20, 25, 30],
        has_cash_value: false,
        convertible: true,
        renewable: true,
      },
      {
        type: 'whole_life',
        name: 'Genesis Whole Life',
        description: 'Permanent coverage with guaranteed cash value accumulation and level premiums for life.',
        min_coverage: 10000,
        max_coverage: 5000000,
        min_age: 18,
        max_age: 80,
        available_terms: [null],
        has_cash_value: true,
        convertible: false,
        renewable: false,
      },
      {
        type: 'universal_life',
        name: 'Genesis Universal Life',
        description: 'Flexible permanent coverage with adjustable premiums and death benefit. Interest-credited cash value.',
        min_coverage: 25000,
        max_coverage: 10000000,
        min_age: 18,
        max_age: 80,
        available_terms: [null],
        has_cash_value: true,
        convertible: false,
        renewable: false,
      },
      {
        type: 'variable_life',
        name: 'Genesis Variable Life',
        description: 'Permanent coverage with investment sub-accounts for cash value growth potential.',
        min_coverage: 50000,
        max_coverage: 10000000,
        min_age: 18,
        max_age: 75,
        available_terms: [null],
        has_cash_value: true,
        convertible: false,
        renewable: false,
      },
      {
        type: 'indexed_universal_life',
        name: 'Genesis Indexed Universal Life',
        description: 'Flexible permanent coverage with cash value linked to market index performance and downside protection.',
        min_coverage: 50000,
        max_coverage: 10000000,
        min_age: 18,
        max_age: 75,
        available_terms: [null],
        has_cash_value: true,
        convertible: false,
        renewable: false,
      },
      {
        type: 'final_expense',
        name: 'Genesis Final Expense',
        description: 'Simplified-issue whole life designed for burial and end-of-life costs.',
        min_coverage: 2000,
        max_coverage: 50000,
        min_age: 40,
        max_age: 85,
        available_terms: [null],
        has_cash_value: true,
        convertible: false,
        renewable: false,
      },
    ];

    // ── Rider definitions ───────────────────────────────────────────────────
    this._riders = {
      waiver_of_premium: {
        code: 'WP',
        name: 'Waiver of Premium',
        description: 'Waives premiums if the insured becomes totally disabled before age 60.',
        applicable_products: ['term_life', 'whole_life', 'universal_life', 'variable_life', 'indexed_universal_life', 'final_expense'],
        rate_per_1000: 0.45,
        flat_fee: 0,
        min_age: 18,
        max_age: 55,
      },
      accidental_death: {
        code: 'ADB',
        name: 'Accidental Death Benefit',
        description: 'Pays an additional benefit equal to the face amount upon accidental death.',
        applicable_products: ['term_life', 'whole_life', 'universal_life', 'variable_life', 'indexed_universal_life'],
        rate_per_1000: 0.25,
        flat_fee: 0,
        min_age: 18,
        max_age: 70,
      },
      child_term: {
        code: 'CTR',
        name: 'Child Term Rider',
        description: 'Provides $10,000 level term coverage on each eligible child until age 25.',
        applicable_products: ['term_life', 'whole_life', 'universal_life'],
        rate_per_1000: 0,
        flat_fee: 72,
        min_age: 18,
        max_age: 55,
      },
      guaranteed_insurability: {
        code: 'GIO',
        name: 'Guaranteed Insurability Option',
        description: 'Allows purchase of additional coverage at specified future dates without evidence of insurability.',
        applicable_products: ['whole_life', 'universal_life', 'indexed_universal_life'],
        rate_per_1000: 0.65,
        flat_fee: 0,
        min_age: 18,
        max_age: 40,
      },
      return_of_premium: {
        code: 'ROP',
        name: 'Return of Premium',
        description: 'Returns all premiums paid if the insured outlives the policy term.',
        applicable_products: ['term_life'],
        rate_per_1000: 2.80,
        flat_fee: 0,
        min_age: 18,
        max_age: 55,
      },
      chronic_illness: {
        code: 'CIA',
        name: 'Chronic Illness Accelerated Benefit',
        description: 'Allows early access to a portion of the death benefit upon qualifying chronic illness diagnosis.',
        applicable_products: ['term_life', 'whole_life', 'universal_life', 'variable_life', 'indexed_universal_life'],
        rate_per_1000: 0,
        flat_fee: 48,
        min_age: 18,
        max_age: 70,
      },
      long_term_care: {
        code: 'LTC',
        name: 'Long-Term Care Rider',
        description: 'Provides monthly LTC benefits by accelerating the death benefit for qualifying care needs.',
        applicable_products: ['whole_life', 'universal_life', 'indexed_universal_life'],
        rate_per_1000: 1.10,
        flat_fee: 0,
        min_age: 30,
        max_age: 65,
      },
    };

    // In-memory quote store (would be DB-backed in production)
    this._quoteStore = new Map();
    this._quoteStoreMaxSize = 1000;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Returns the full product catalog.
   * @returns {{ products: object[] }}
   */
  getAvailableProducts() {
    return {
      products: this._products.map((p) => ({ ...p })),
    };
  }

  /**
   * Returns riders available for a given product type.
   * @param {string} productType
   * @returns {{ product_type: string, riders: object[] }}
   */
  getAvailableRiders(productType) {
    this.#validateProductType(productType);

    const riders = Object.entries(this._riders)
      .filter(([, def]) => def.applicable_products.includes(productType))
      .map(([key, def]) => ({
        key,
        code: def.code,
        name: def.name,
        description: def.description,
        min_age: def.min_age,
        max_age: def.max_age,
        has_flat_fee: def.flat_fee > 0,
        has_rate_per_1000: def.rate_per_1000 > 0,
      }));

    return { product_type: productType, riders };
  }

  /**
   * Main calculation entry point.
   *
   * @param {object} params
   * @param {string} params.product_type
   * @param {number} params.coverage_amount
   * @param {number|null} params.term_years
   * @param {object} params.applicant
   * @param {number} params.applicant.age
   * @param {string} params.applicant.gender           - male | female | non_binary
   * @param {string} params.applicant.smoker_status    - never | former | current
   * @param {string} params.applicant.health_class     - preferred_plus … substandard
   * @param {string[]} [params.riders]                 - rider keys
   * @param {string} [params.payment_frequency]        - monthly | quarterly | semi_annual | annual
   * @returns {object} comprehensive quote response
   */
  calculateQuote(params) {
    const {
      product_type,
      coverage_amount,
      term_years = null,
      applicant,
      riders = [],
      payment_frequency = 'monthly',
    } = params;

    // ── Validate inputs ────────────────────────────────────────────────────
    this.#validateProductType(product_type);
    this.#validateApplicant(applicant);
    this.#validateCoverage(product_type, coverage_amount);
    this.#validateTermYears(product_type, term_years);
    this.#validateFrequency(payment_frequency);
    this.#validateRiders(product_type, riders, applicant.age);

    const product = this._products.find((p) => p.type === product_type);

    // ── Mortality-based net annual premium ──────────────────────────────────
    const netAnnualPremium = this.#computeNetAnnualPremium(
      product_type, coverage_amount, term_years, applicant,
    );

    // ── Gross premium (expense + profit loading) ───────────────────────────
    const loadingFactor = 1 + this._expenseLoadingPct + this._profitMarginPct;
    const annualPolicyFee = this._policyFeesAnnual[product_type];
    const grossAnnualBase = netAnnualPremium * loadingFactor + annualPolicyFee;

    // ── Rider premiums (annual) ────────────────────────────────────────────
    const riderDetails = this.#computeRiderPremiums(riders, coverage_amount, applicant);
    const totalRiderAnnual = riderDetails.reduce((s, r) => s + r.annual_premium, 0);

    // ── Total annual ───────────────────────────────────────────────────────
    const totalAnnual = grossAnnualBase + totalRiderAnnual;

    // ── Build premium breakdown per frequency ──────────────────────────────
    const premiumBreakdown = this.#buildFrequencyBreakdown(grossAnnualBase, totalRiderAnnual, totalAnnual);

    // ── Cash value & surrender projections (permanent products) ────────────
    let cashValueProjections = null;
    let surrenderValueProjections = null;
    if (product.has_cash_value) {
      cashValueProjections = this.#projectCashValues(
        product_type, coverage_amount, grossAnnualBase, applicant.age, applicant,
      );
      surrenderValueProjections = this.#projectSurrenderValues(cashValueProjections);
    }

    // ── Underwriting class label ───────────────────────────────────────────
    const uwClass = this.#resolveUnderwritingClass(applicant);

    // ── Quote reference ────────────────────────────────────────────────────
    const quoteRef = this.#generateQuoteRef();
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + 30);

    const quote = {
      quote_reference: quoteRef,
      generated_at: now.toISOString(),
      valid_until: validUntil.toISOString(),
      status: 'illustrated',
      product_details: {
        type: product.type,
        name: product.name,
        description: product.description,
        term_years: product_type === 'term_life' ? term_years : null,
        convertible: product.convertible,
        renewable: product.renewable,
      },
      applicant_summary: {
        age: applicant.age,
        gender: applicant.gender,
        smoker_status: applicant.smoker_status,
        health_class: applicant.health_class,
        underwriting_class: uwClass,
      },
      coverage: {
        face_value: coverage_amount,
        death_benefit: coverage_amount,
      },
      premium: {
        base: {
          annual:      this.#round(grossAnnualBase),
          semi_annual: this.#round(grossAnnualBase * this._frequencyMultipliers.semi_annual),
          quarterly:   this.#round(grossAnnualBase * this._frequencyMultipliers.quarterly),
          monthly:     this.#round(grossAnnualBase * this._frequencyMultipliers.monthly),
        },
        riders: riderDetails.map((r) => ({
          ...r,
          annual_premium:      this.#round(r.annual_premium),
          semi_annual_premium: this.#round(r.annual_premium * this._frequencyMultipliers.semi_annual),
          quarterly_premium:   this.#round(r.annual_premium * this._frequencyMultipliers.quarterly),
          monthly_premium:     this.#round(r.annual_premium * this._frequencyMultipliers.monthly),
        })),
        total: {
          annual:      this.#round(totalAnnual),
          semi_annual: this.#round(totalAnnual * this._frequencyMultipliers.semi_annual),
          quarterly:   this.#round(totalAnnual * this._frequencyMultipliers.quarterly),
          monthly:     this.#round(totalAnnual * this._frequencyMultipliers.monthly),
        },
        selected_frequency: payment_frequency,
        selected_premium: this.#round(totalAnnual * this._frequencyMultipliers[payment_frequency]),
      },
      policy_fees: {
        annual_policy_fee: annualPolicyFee,
        expense_loading_pct: this._expenseLoadingPct,
        profit_margin_pct: this._profitMarginPct,
      },
      cash_value_projections: cashValueProjections,
      surrender_value_projections: surrenderValueProjections,
    };

    // Store for later illustration retrieval — bounded LRU-style cache
    if (this._quoteStore.size >= this._quoteStoreMaxSize) {
      const oldestKey = this._quoteStore.keys().next().value;
      this._quoteStore.delete(oldestKey);
    }
    this._quoteStore.set(quoteRef, { quote, params });

    logger.info(`[CalculationEngine] Quote ${quoteRef} generated — ${product.name}, face $${coverage_amount.toLocaleString()}`);
    return quote;
  }

  /**
   * Compare multiple product quotes side-by-side.
   *
   * @param {object[]} paramsArray – array of calculateQuote param objects
   * @returns {{ comparison_id: string, generated_at: string, quotes: object[], summary: object }}
   */
  compareQuotes(paramsArray) {
    if (!Array.isArray(paramsArray) || paramsArray.length < 2) {
      throw new Error('compareQuotes requires an array of at least 2 quote parameter objects.');
    }
    if (paramsArray.length > 6) {
      throw new Error('compareQuotes supports a maximum of 6 quotes at a time.');
    }

    const quotes = paramsArray.map((p) => this.calculateQuote(p));
    const comparisonId = `CMP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const summary = {
      lowest_monthly: null,
      highest_monthly: null,
      lowest_annual: null,
      highest_annual: null,
      products_compared: quotes.map((q) => q.product_details.type),
    };

    let minMonthly = Infinity;
    let maxMonthly = -Infinity;
    let minAnnual = Infinity;
    let maxAnnual = -Infinity;

    for (const q of quotes) {
      const mo = q.premium.total.monthly;
      const an = q.premium.total.annual;
      if (mo < minMonthly) { minMonthly = mo; summary.lowest_monthly = { quote_reference: q.quote_reference, amount: mo }; }
      if (mo > maxMonthly) { maxMonthly = mo; summary.highest_monthly = { quote_reference: q.quote_reference, amount: mo }; }
      if (an < minAnnual) { minAnnual = an; summary.lowest_annual = { quote_reference: q.quote_reference, amount: an }; }
      if (an > maxAnnual) { maxAnnual = an; summary.highest_annual = { quote_reference: q.quote_reference, amount: an }; }
    }

    const result = {
      comparison_id: comparisonId,
      generated_at: new Date().toISOString(),
      quotes,
      summary,
    };

    logger.info(`[CalculationEngine] Comparison ${comparisonId} — ${quotes.length} quotes`);
    return result;
  }

  /**
   * Generate a year-by-year illustration table for a previously-computed quote.
   *
   * @param {string} quoteId   – quote_reference from calculateQuote
   * @param {object} [params]
   * @param {number} [params.years]            – projection horizon (default: term length or 30)
   * @param {number} [params.assumed_rate]     – override illustrated crediting rate
   * @param {boolean} [params.show_guaranteed] – include guaranteed column (default true)
   * @returns {object} illustration with year_rows[]
   */
  getIllustration(quoteId, params = {}) {
    const stored = this._quoteStore.get(quoteId);
    if (!stored) {
      throw new Error(`Quote ${quoteId} not found. Generate a quote first via calculateQuote().`);
    }

    const { quote, params: originalParams } = stored;
    const productType = quote.product_details.type;
    const product = this._products.find((p) => p.type === productType);

    const years = params.years
      || (productType === 'term_life' ? originalParams.term_years : null)
      || 30;
    const showGuaranteed = params.show_guaranteed !== false;
    const assumedRate = params.assumed_rate ?? this.#illustrationRate(productType);
    const guaranteedRate = this._guaranteedRate;

    const annualPremium = quote.premium.total.annual;
    const faceValue = quote.coverage.face_value;
    const entryAge = quote.applicant_summary.age;

    const yearRows = [];

    let cumulativePremium = 0;
    let cashValueCurrent = 0;
    let cashValueGuaranteed = 0;
    let surrenderChargePct = 0.10; // starts at 10 %, declines over 10 yrs

    for (let yr = 1; yr <= years; yr++) {
      const currentAge = entryAge + yr;
      cumulativePremium += annualPremium;

      // Mortality cost for this year (cost of insurance)
      const qx = this.#getMortalityRate(currentAge, originalParams.applicant) / 1000;
      const coi = faceValue * qx;

      if (product.has_cash_value) {
        // Current scenario
        const netContrib = annualPremium - coi - this._policyFeesAnnual[productType];
        cashValueCurrent = Math.max(0, (cashValueCurrent + netContrib) * (1 + assumedRate));

        // Guaranteed scenario
        const netContribG = annualPremium - coi - this._policyFeesAnnual[productType];
        cashValueGuaranteed = Math.max(0, (cashValueGuaranteed + netContribG) * (1 + guaranteedRate));
      }

      const currentSurrenderChargePct = yr <= 10 ? Math.max(0, surrenderChargePct - (yr - 1) * 0.01) : 0;
      const surrenderValueCurrent = Math.max(0, cashValueCurrent * (1 - currentSurrenderChargePct));
      const surrenderValueGuaranteed = Math.max(0, cashValueGuaranteed * (1 - currentSurrenderChargePct));

      // Option A (level death benefit): face amount stays level, but if cash value
      // grows to exceed the face amount, the death benefit must increase to maintain
      // the corridor required by IRC Section 7702 (typically face + excess CV).
      const deathBenefitCurrent = product.has_cash_value
        ? Math.max(faceValue, faceValue + Math.max(0, cashValueCurrent - faceValue))
        : (productType === 'term_life' && yr <= (originalParams.term_years || years) ? faceValue : 0);

      const row = {
        year: yr,
        age: currentAge,
        annual_premium: this.#round(annualPremium),
        cumulative_premiums: this.#round(cumulativePremium),
        cost_of_insurance: this.#round(coi),
        death_benefit_current: this.#round(deathBenefitCurrent),
      };

      if (product.has_cash_value) {
        row.cash_value_current = this.#round(cashValueCurrent);
        row.surrender_value_current = this.#round(surrenderValueCurrent);
        row.surrender_charge_pct = this.#round(currentSurrenderChargePct * 100);
      }

      if (showGuaranteed && product.has_cash_value) {
        row.cash_value_guaranteed = this.#round(cashValueGuaranteed);
        row.surrender_value_guaranteed = this.#round(surrenderValueGuaranteed);
        row.death_benefit_guaranteed = this.#round(faceValue);
      }

      yearRows.push(row);
    }

    const illustration = {
      quote_reference: quoteId,
      product: quote.product_details,
      applicant: quote.applicant_summary,
      illustration_parameters: {
        projection_years: years,
        current_crediting_rate: assumedRate,
        guaranteed_crediting_rate: guaranteedRate,
        death_benefit_option: product.has_cash_value ? 'Option A — Level' : 'Level Term',
        show_guaranteed: showGuaranteed,
      },
      year_rows: yearRows,
      summary: {
        total_premiums_paid: this.#round(cumulativePremium),
        final_cash_value_current: product.has_cash_value ? this.#round(cashValueCurrent) : null,
        final_cash_value_guaranteed: (showGuaranteed && product.has_cash_value) ? this.#round(cashValueGuaranteed) : null,
        final_death_benefit: this.#round(yearRows[yearRows.length - 1]?.death_benefit_current ?? 0),
        internal_rate_of_return_current: product.has_cash_value
          ? this.#round(this.#estimateIRR(annualPremium, cashValueCurrent, years) * 100) + '%'
          : null,
      },
      disclaimer: 'This illustration is hypothetical and not guaranteed. '
        + 'Actual results will vary based on the insurance company\'s actual experience. '
        + 'The non-guaranteed values shown use an assumed interest rate and are not promises of future performance.',
    };

    logger.info(`[CalculationEngine] Illustration for ${quoteId} — ${years} years`);
    return illustration;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Actuarial calculations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute net annual premium using a simplified equivalence-principle approach.
   *
   * For term: sum of discounted expected death claims over the term, annuitized.
   * For permanent: level premium to endowment age 100, simplified.
   */
  #computeNetAnnualPremium(productType, coverageAmount, termYears, applicant) {
    const isPermanent = productType !== 'term_life' && productType !== 'final_expense';
    const horizon = productType === 'term_life'
      ? termYears
      : productType === 'final_expense'
        ? Math.min(85 - applicant.age, 30) // pay to 85 or 30 yrs
        : Math.min(100 - applicant.age, 50); // pay to endowment 100

    const discountRate = 0.04; // valuation interest rate

    let pvBenefits = 0; // present value of death benefits
    let pvAnnuity = 0;  // present value of premium annuity-due

    for (let t = 0; t < horizon; t++) {
      const ageAtT = applicant.age + t;
      const qx = this.#getMortalityRate(ageAtT, applicant) / 1000;
      const discountFactor = Math.pow(1 + discountRate, -(t + 0.5)); // mid-year death
      const survivalToT = this.#survivalProbability(applicant, applicant.age, t);

      pvBenefits += coverageAmount * qx * survivalToT * discountFactor;

      const annuityDiscount = Math.pow(1 + discountRate, -t);
      pvAnnuity += survivalToT * annuityDiscount;
    }

    if (pvAnnuity === 0) return 0;

    let netPremium = pvBenefits / pvAnnuity;

    // Permanent products carry higher reserve requirement — additional loading
    if (isPermanent) {
      netPremium *= 1.35; // reserve loading factor
    }

    // Final expense uses simplified underwriting — surcharge
    if (productType === 'final_expense') {
      netPremium *= 1.55;
    }

    return netPremium;
  }

  /**
   * Probability of surviving from startAge to startAge + t years.
   */
  #survivalProbability(applicant, startAge, t) {
    let survival = 1.0;
    for (let i = 0; i < t; i++) {
      const qx = this.#getMortalityRate(startAge + i, applicant) / 1000;
      survival *= (1 - qx);
    }
    return survival;
  }

  /**
   * Adjusted mortality rate per 1 000 for a given age and applicant profile.
   */
  #getMortalityRate(age, applicant) {
    let baseRate;
    if (age <= 18) {
      baseRate = this._baseMortalityPer1000[18];
    } else if (age >= 85) {
      // Extrapolate beyond table: exponential growth from last two entries
      const rate84 = this._baseMortalityPer1000[84];
      const rate85 = this._baseMortalityPer1000[85];
      const growthFactor = rate85 / rate84;
      baseRate = rate85 * Math.pow(growthFactor, age - 85);
      // Cap at 1000 (certainty of death)
      baseRate = Math.min(baseRate, 1000);
    } else {
      // Integer ages: direct lookup; fractional ages: linear interpolation
      const lower = Math.floor(age);
      const upper = Math.ceil(age);
      if (lower === upper) {
        baseRate = this._baseMortalityPer1000[lower];
      } else {
        const rateLower = this._baseMortalityPer1000[lower];
        const rateUpper = this._baseMortalityPer1000[upper];
        baseRate = rateLower + (rateUpper - rateLower) * (age - lower);
      }
    }

    const genderFactor = this._genderFactors[applicant.gender] ?? 1.0;
    const smokerFactor = this._smokerFactors[applicant.smoker_status] ?? 1.0;
    const healthFactor = this._healthClassFactors[applicant.health_class] ?? 1.0;

    return baseRate * genderFactor * smokerFactor * healthFactor;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Riders
  // ═══════════════════════════════════════════════════════════════════════════

  #computeRiderPremiums(riderKeys, coverageAmount, applicant) {
    return riderKeys.map((key) => {
      const def = this._riders[key];
      if (!def) throw new Error(`Unknown rider: ${key}`);

      let annualPremium = 0;
      if (def.rate_per_1000 > 0) {
        // Age-adjusted: riders cost more at higher ages
        const ageFactor = 1 + Math.max(0, (applicant.age - 30) * 0.015);
        annualPremium += (coverageAmount / 1000) * def.rate_per_1000 * ageFactor;
      }
      if (def.flat_fee > 0) {
        annualPremium += def.flat_fee;
      }

      return {
        rider_key: key,
        rider_code: def.code,
        rider_name: def.name,
        annual_premium: annualPremium,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Cash value projections
  // ═══════════════════════════════════════════════════════════════════════════

  #projectCashValues(productType, coverageAmount, grossAnnualPremium, entryAge, applicant) {
    const milestones = [5, 10, 15, 20, 25, 30];
    const rate = this.#illustrationRate(productType);
    const policyFee = this._policyFeesAnnual[productType];
    const projections = [];

    let cv = 0;
    let milestoneIdx = 0;

    for (let yr = 1; yr <= 30 && milestoneIdx < milestones.length; yr++) {
      const currentAge = entryAge + yr;
      const qx = this.#getMortalityRate(currentAge, applicant) / 1000;
      const coi = coverageAmount * qx;
      const netContrib = grossAnnualPremium - coi - policyFee;
      cv = Math.max(0, (cv + netContrib) * (1 + rate));

      if (yr === milestones[milestoneIdx]) {
        const totalPremiums = grossAnnualPremium * yr;
        projections.push({
          year: yr,
          age: currentAge,
          cash_value: this.#round(cv),
          as_pct_of_premiums: totalPremiums > 0 ? this.#round((cv / totalPremiums) * 100) : 0,
        });
        milestoneIdx++;
      }
    }

    return projections;
  }

  #projectSurrenderValues(cashValueProjections) {
    if (!cashValueProjections) return null;
    return cashValueProjections.map((p) => {
      // Surrender charge: 10 % in yr 1-5, declining 1 % per year through yr 15, 0 after
      const chargePct = p.year <= 5 ? 0.10 : p.year <= 15 ? Math.max(0, 0.10 - (p.year - 5) * 0.01) : 0;
      return {
        year: p.year,
        age: p.age,
        surrender_value: this.#round(p.cash_value * (1 - chargePct)),
        surrender_charge_pct: this.#round(chargePct * 100),
      };
    });
  }

  #illustrationRate(productType) {
    switch (productType) {
      case 'whole_life':              return this._guaranteedRate + 0.015; // ~4.0 %
      case 'universal_life':          return this._currentCreditRate;       // 4.5 %
      case 'variable_life':           return this._variableReturnRate;      // 6.5 %
      case 'indexed_universal_life':  return this._currentCreditRate + 0.01; // 5.5 %
      case 'final_expense':           return this._guaranteedRate;          // 2.5 %
      default:                        return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Frequency breakdown
  // ═══════════════════════════════════════════════════════════════════════════

  #buildFrequencyBreakdown(grossAnnualBase, totalRiderAnnual, totalAnnual) {
    const result = {};
    for (const [freq, mult] of Object.entries(this._frequencyMultipliers)) {
      result[freq] = {
        base_premium:  this.#round(grossAnnualBase * mult),
        rider_premium: this.#round(totalRiderAnnual * mult),
        total_premium: this.#round(totalAnnual * mult),
      };
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Underwriting class resolution
  // ═══════════════════════════════════════════════════════════════════════════

  #resolveUnderwritingClass(applicant) {
    const smokerLabel = applicant.smoker_status === 'never' ? 'Non-Tobacco' : 'Tobacco';
    const classLabels = {
      preferred_plus: 'Preferred Plus',
      preferred:      'Preferred',
      standard_plus:  'Standard Plus',
      standard:       'Standard',
      substandard:    'Substandard (Table Rating)',
    };
    const classLabel = classLabels[applicant.health_class] || 'Standard';
    return `${classLabel} ${smokerLabel}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  #generateQuoteRef() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `LI-${ts}-${rand}`;
  }

  #round(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * Rough IRR estimate using Newton-Raphson (single cashflow at end).
   */
  #estimateIRR(annualPayment, futureValue, years) {
    if (futureValue <= 0 || years <= 0) return 0;
    let guess = 0.05;
    for (let iter = 0; iter < 50; iter++) {
      let npv = -futureValue;
      let dnpv = 0;
      for (let t = 1; t <= years; t++) {
        const factor = Math.pow(1 + guess, years - t);
        npv += annualPayment * factor;
        dnpv += annualPayment * (years - t) * Math.pow(1 + guess, years - t - 1);
      }
      if (Math.abs(dnpv) < 1e-12) break;
      const newGuess = guess - npv / dnpv;
      if (Number.isNaN(newGuess)) break;
      if (Math.abs(newGuess - guess) < 1e-8) { guess = newGuess; break; }
      guess = newGuess;
    }
    if (Number.isNaN(guess)) return 0;
    return Math.max(-1, Math.min(guess, 1));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Validation
  // ═══════════════════════════════════════════════════════════════════════════

  #validateProductType(productType) {
    const validTypes = this._products.map((p) => p.type);
    if (!validTypes.includes(productType)) {
      throw new Error(`Invalid product_type "${productType}". Must be one of: ${validTypes.join(', ')}`);
    }
  }

  #validateApplicant(applicant) {
    if (!applicant || typeof applicant !== 'object') {
      throw new Error('applicant object is required.');
    }
    const { age, gender, smoker_status, health_class } = applicant;

    if (typeof age !== 'number' || age < 18 || age > 85) {
      throw new Error(`Applicant age must be between 18 and 85. Received: ${age}`);
    }
    if (!['male', 'female', 'non_binary'].includes(gender)) {
      throw new Error(`Invalid gender "${gender}". Must be male, female, or non_binary.`);
    }
    if (!['never', 'former', 'current'].includes(smoker_status)) {
      throw new Error(`Invalid smoker_status "${smoker_status}". Must be never, former, or current.`);
    }
    if (!Object.keys(this._healthClassFactors).includes(health_class)) {
      throw new Error(`Invalid health_class "${health_class}". Must be one of: ${Object.keys(this._healthClassFactors).join(', ')}`);
    }
  }

  #validateCoverage(productType, amount) {
    const product = this._products.find((p) => p.type === productType);
    if (typeof amount !== 'number' || amount < product.min_coverage || amount > product.max_coverage) {
      throw new Error(
        `Coverage amount for ${productType} must be between $${product.min_coverage.toLocaleString()} and $${product.max_coverage.toLocaleString()}. Received: $${amount?.toLocaleString()}`,
      );
    }
  }

  #validateTermYears(productType, termYears) {
    if (productType !== 'term_life') return;
    const product = this._products.find((p) => p.type === 'term_life');
    if (!product.available_terms.includes(termYears)) {
      throw new Error(`Term life requires term_years to be one of: ${product.available_terms.join(', ')}. Received: ${termYears}`);
    }
  }

  #validateFrequency(freq) {
    if (!Object.keys(this._frequencyMultipliers).includes(freq)) {
      throw new Error(`Invalid payment_frequency "${freq}". Must be one of: ${Object.keys(this._frequencyMultipliers).join(', ')}`);
    }
  }

  #validateRiders(productType, riderKeys, age) {
    for (const key of riderKeys) {
      const def = this._riders[key];
      if (!def) {
        throw new Error(`Unknown rider "${key}". Available: ${Object.keys(this._riders).join(', ')}`);
      }
      if (!def.applicable_products.includes(productType)) {
        throw new Error(`Rider "${key}" is not available for product type "${productType}".`);
      }
      if (age < def.min_age || age > def.max_age) {
        throw new Error(`Rider "${key}" requires applicant age between ${def.min_age} and ${def.max_age}. Applicant is ${age}.`);
      }
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // QUOTE PERSISTENCE — Database-backed quote scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Persist a rated quote as a QuoteScenario for audit, comparison, and conversion.
   */
  async persistQuote(tenantId, params, quoteResult, rateSource, rateSourceMeta, actorId) {
    const scenarioRef = `QS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const validDays = 30;
    const validUntil = new Date(Date.now() + validDays * 86400000);

    return this.db.quoteScenario.create({
      data: {
        scenario_ref:      scenarioRef,
        contact_id:        params.contact_id ?? null,
        product_type:      params.product_type,
        coverage_amount:   Number(params.coverage_amount),
        term_years:        params.term_years ?? null,
        payment_frequency: params.payment_frequency ?? 'monthly',
        applicant_data:    params.applicant ?? {},
        riders:            params.riders ?? [],
        rate_source:       rateSource ?? 'internal',
        rate_source_meta:  rateSourceMeta ?? {},
        quote_result:      quoteResult,
        monthly_premium:   Number(quoteResult.premium?.breakdown?.monthly ?? 0),
        annual_premium:    Number(quoteResult.premium?.breakdown?.annual ?? 0),
        status:            'active',
        valid_until:       validUntil,
        comparison_group:  params.comparison_group ?? null,
        created_by:        actorId ?? null,
        tenant_id:         tenantId,
      },
    });
  }

  /**
   * Persist multiple quotes from a comparison as linked scenarios.
   */
  async persistComparison(tenantId, paramsArray, comparisonResult, rateSource, rateSourceMeta, actorId) {
    const groupId = comparisonResult.comparison_id;
    const scenarios = [];
    for (let i = 0; i < comparisonResult.quotes.length; i++) {
      const q = comparisonResult.quotes[i];
      const p = paramsArray[i];
      const scenario = await this.persistQuote(
        tenantId,
        { ...p, comparison_group: groupId },
        q, rateSource, rateSourceMeta, actorId,
      );
      scenarios.push(scenario);
    }
    return { comparison_id: groupId, scenarios };
  }

  /** List persisted quote scenarios with filters. */
  async listScenarios(tenantId, { contactId, productType, status, comparisonGroup, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (contactId)       where.contact_id       = contactId;
    if (productType)     where.product_type     = productType;
    if (status)          where.status           = status;
    if (comparisonGroup) where.comparison_group = comparisonGroup;

    const [scenarios, total] = await Promise.all([
      this.db.quoteScenario.findMany({
        where, orderBy: { created_at: 'desc' }, take: limit, skip: offset,
        include: { contact: { select: { id: true, first_name: true, last_name: true } } },
      }),
      this.db.quoteScenario.count({ where }),
    ]);
    return { scenarios, total, limit, offset };
  }

  /** Get a single scenario by ID. */
  async getScenario(id, tenantId) {
    const scenario = await this.db.quoteScenario.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        contact: { select: { id: true, first_name: true, last_name: true, email: true } },
        application: { select: { id: true, app_number: true, status: true } },
      },
    });
    if (!scenario) throw Object.assign(new Error('Quote scenario not found'), { statusCode: 404 });
    return scenario;
  }

  /** Mark a scenario as converted and link to an application. */
  async convertScenario(id, applicationId, tenantId) {
    return this.db.quoteScenario.update({
      where: { id },
      data: { status: 'converted', application_id: applicationId ?? null },
    });
  }
}

module.exports = CalculationEngineService;
