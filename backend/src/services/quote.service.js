'use strict';

const { Decimal } = require('@prisma/client/runtime/library');
const { getTenantId } = require('../middleware/tenant-scope');

/**
 * QuoteService — Quote and proposal management for opportunities.
 * 
 * Handles quote creation, line items, pricing calculations, and status management.
 * Integrates with Product catalog and CRM entities.
 */
class QuoteService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
    this._quoteObjectId = null;
  }

  // ── Object ID cache ───────────────────────────────────────────────────────

  async #getQuoteObjectId() {
    if (this._quoteObjectId) return this._quoteObjectId;
    const obj = await this.db.uiObject.findFirst({
      where: { name: 'quote' },
      select: { id: true },
    });
    this._quoteObjectId = obj?.id;
    return this._quoteObjectId;
  }

  // ── QUOTE NUMBER GENERATION ────────────────────────────────────────────────

  async #generateQuoteNumber(tx) {
    const db = tx || this.db;
    const year = new Date().getFullYear();
    const prefix = `Q-${year}-`;

    // RC-07 fix: use SELECT FOR UPDATE inside the transaction to lock the
    // range of matched rows, preventing two concurrent transactions from
    // both reading the same 'last' row and computing duplicate quote numbers.
    const rows = await db.$queryRaw`
      SELECT quote_number FROM quotes
      WHERE quote_number LIKE ${prefix + '%'}
      ORDER BY quote_number DESC
      LIMIT 1
      FOR UPDATE
    `;

    let nextNumber = 1;
    if (rows?.[0]?.quote_number) {
      const match = rows[0].quote_number.match(/-(\d+)$/);
      if (match) {
        const lastNumber = parseInt(match[1], 10);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }
    }

    return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async createQuote(data, createdBy) {
    const objectId = await this.#getQuoteObjectId();
    const tenantId = getTenantId();

    return this.db.$transaction(async (tx) => {
      const quoteNumber = data.quote_number || await this.#generateQuoteNumber(tx);
      // Create anchor record
      const record = objectId
        ? await tx.record.create({
            data: {
              object_id: objectId,
              created_by: createdBy ?? null,
              assigned_to: data.owner_id ?? createdBy ?? null,
              tenant_id: tenantId,
            },
          })
        : null;

      // Create quote
      const quote = await tx.quote.create({
        data: {
          quote_number: quoteNumber,
          name: data.name,
          status: data.status ?? 'draft',
          valid_until: data.valid_until ? new Date(data.valid_until) : null,
          opportunity_id: data.opportunity_id ?? null,
          account_id: data.account_id ?? null,
          contact_id: data.contact_id ?? null,
          subtotal: new Decimal(0),
          discount_amount: new Decimal(data.discount_amount ?? 0),
          discount_percent: new Decimal(data.discount_percent ?? 0),
          tax_amount: new Decimal(0),
          total_amount: new Decimal(0),
          currency: data.currency ?? 'USD',
          terms: data.terms ?? null,
          notes: data.notes ?? null,
          billing_street: data.billing_street ?? null,
          billing_city: data.billing_city ?? null,
          billing_state: data.billing_state ?? null,
          billing_country: data.billing_country ?? null,
          billing_zip: data.billing_zip ?? null,
          shipping_street: data.shipping_street ?? null,
          shipping_city: data.shipping_city ?? null,
          shipping_state: data.shipping_state ?? null,
          shipping_country: data.shipping_country ?? null,
          shipping_zip: data.shipping_zip ?? null,
          owner_id: data.owner_id ?? createdBy ?? null,
          record_id: record?.id ?? null,
          created_by: createdBy ?? null,
          tenant_id: tenantId,
        },
        include: {
          line_items: {
            include: { product: true },
            orderBy: { order_index: 'asc' },
          },
          opportunity: true,
          account: true,
          contact: true,
          owner: { select: { employee_id: true, employee_name: true } },
        },
      });

      return quote;
    });
  }

  // ── READ ───────────────────────────────────────────────────────────────────

  async getQuote(id) {
    const quoteId = parseInt(id);
    if (isNaN(quoteId) || quoteId <= 0) {
      throw new Error('Invalid quote ID');
    }
    
    return this.db.quote.findUnique({
      where: { id: quoteId },
      include: {
        line_items: {
          include: { product: true },
          orderBy: { order_index: 'asc' },
        },
        opportunity: true,
        account: true,
        contact: true,
        owner: { select: { employee_id: true, employee_name: true } },
        record: true,
      },
    });
  }

  async getQuoteByNumber(quoteNumber) {
    return this.db.quote.findUnique({
      where: { quote_number: quoteNumber },
      include: {
        line_items: {
          include: { product: true },
          orderBy: { order_index: 'asc' },
        },
        opportunity: true,
        account: true,
        contact: true,
        owner: { select: { employee_id: true, employee_name: true } },
      },
    });
  }

  // ── UPDATE / DELETE ────────────────────────────────────────────────────────

  async updateQuote(id, data) {
    const quoteId = parseInt(id);
    if (isNaN(quoteId) || quoteId <= 0) throw new Error('Invalid quote ID');

    const updateData = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.valid_until !== undefined && {
        valid_until: data.valid_until ? new Date(data.valid_until) : null,
      }),
      ...(data.opportunity_id !== undefined && { opportunity_id: data.opportunity_id ?? null }),
      ...(data.account_id !== undefined && { account_id: data.account_id ?? null }),
      ...(data.contact_id !== undefined && { contact_id: data.contact_id ?? null }),
      ...(data.discount_amount !== undefined && {
        discount_amount: new Decimal(data.discount_amount),
      }),
      ...(data.discount_percent !== undefined && {
        discount_percent: new Decimal(data.discount_percent),
      }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.terms !== undefined && { terms: data.terms ?? null }),
      ...(data.notes !== undefined && { notes: data.notes ?? null }),
      ...(data.owner_id !== undefined && { owner_id: data.owner_id ?? null }),
      ...(data.billing_street !== undefined && { billing_street: data.billing_street }),
      ...(data.billing_city !== undefined && { billing_city: data.billing_city }),
      ...(data.billing_state !== undefined && { billing_state: data.billing_state }),
      ...(data.billing_country !== undefined && { billing_country: data.billing_country }),
      ...(data.billing_zip !== undefined && { billing_zip: data.billing_zip }),
      ...(data.shipping_street !== undefined && { shipping_street: data.shipping_street }),
      ...(data.shipping_city !== undefined && { shipping_city: data.shipping_city }),
      ...(data.shipping_state !== undefined && { shipping_state: data.shipping_state }),
      ...(data.shipping_country !== undefined && { shipping_country: data.shipping_country }),
      ...(data.shipping_zip !== undefined && { shipping_zip: data.shipping_zip }),
      updated_at: new Date(),
    };

    return this.db.quote.update({
      where: { id: quoteId },
      data: updateData,
      include: {
        line_items: { include: { product: true }, orderBy: { order_index: 'asc' } },
        opportunity: true,
        account: true,
        contact: true,
        owner: { select: { employee_id: true, employee_name: true } },
      },
    });
  }

  async deleteQuote(id) {
    const quoteId = parseInt(id);
    if (isNaN(quoteId) || quoteId <= 0) throw new Error('Invalid quote ID');

    return this.db.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({
        where: { id: quoteId },
        select: { record_id: true },
      });
      if (!quote) throw new Error('Quote not found');

      await tx.quoteLineItem.deleteMany({ where: { quote_id: quoteId } });
      await tx.quote.delete({ where: { id: quoteId } });
      if (quote.record_id) {
        await tx.record.delete({ where: { id: quote.record_id } }).catch(() => {});
      }

      return { id: quoteId, deleted: true };
    });
  }

  // ── STATUS TRANSITIONS (aliases for routes) ────────────────────────────────

  async submitQuote(id) {
    const quoteId = parseInt(id);
    if (isNaN(quoteId) || quoteId <= 0) throw new Error('Invalid quote ID');
    const quote = await this.db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
    if (!quote) throw new Error('Quote not found');
    if (quote.status !== 'draft') throw new Error('Only draft quotes can be submitted');
    return this.updateQuoteStatus(quoteId, 'sent', null);
  }

  async approveQuote(id) {
    const quoteId = parseInt(id);
    if (isNaN(quoteId) || quoteId <= 0) throw new Error('Invalid quote ID');
    const quote = await this.db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
    if (!quote) throw new Error('Quote not found');
    if (quote.status !== 'sent') throw new Error('Only submitted quotes can be approved');
    return this.updateQuoteStatus(quoteId, 'accepted', null);
  }

  async rejectQuote(id, rejection_reason) {
    const quoteId = parseInt(id);
    if (isNaN(quoteId) || quoteId <= 0) throw new Error('Invalid quote ID');
    const quote = await this.db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
    if (!quote) throw new Error('Quote not found');
    if (!['draft', 'sent'].includes(quote.status)) throw new Error('Quote cannot be rejected in its current status');
    return this.db.quote.update({
      where: { id: quoteId },
      data: {
        status: 'rejected',
        notes: rejection_reason
          ? `Rejection reason: ${rejection_reason}`
          : undefined,
        updated_at: new Date(),
      },
      include: {
        line_items: { include: { product: true } },
        opportunity: true,
        account: true,
        contact: true,
      },
    });
  }

  // Alias used by routes
  async getQuotes(query) {
    return this.listQuotes(query);
  }

  // Alias used by routes
  async removeLineItem(lineItemId) {
    return this.deleteLineItem(lineItemId);
  }

  async listQuotes({
    status, 
    ownerId, 
    opportunityId,
    accountId,
    search,
    limit = 50, 
    offset = 0,
    orderBy = { created_at: 'desc' },
  } = {}) {
    const where = {
      ...(status && { status }),
      ...(ownerId && { owner_id: ownerId }),
      ...(opportunityId && { opportunity_id: Number(opportunityId) }),
      ...(accountId && { account_id: Number(accountId) }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { quote_number: { contains: search } },
          { account: { name: { contains: search } } },
          { contact: { first_name: { contains: search } } },
          { contact: { last_name: { contains: search } } },
        ],
      }),
    };

    const [quotes, total] = await Promise.all([
      this.db.quote.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          opportunity: { select: { id: true, name: true } },
          account: { select: { id: true, name: true } },
          contact: { select: { id: true, first_name: true, last_name: true } },
          owner: { select: { employee_id: true, employee_name: true } },
          _count: { select: { line_items: true } },
        },
      }),
      this.db.quote.count({ where }),
    ]);

    return { quotes, total, limit, offset };
  }

  // ── LINE ITEMS ─────────────────────────────────────────────────────────────

  async addLineItem(quoteId, lineItemData) {
    return this.db.$transaction(async (tx) => {
      // RC-08 fix: use SELECT FOR UPDATE to lock existing line-item rows for
      // this quote, preventing two concurrent addLineItem calls from both
      // reading the same max order_index and inserting duplicate positions.
      const rows = await tx.$queryRaw`
        SELECT order_index FROM quote_line_items
        WHERE quote_id = ${Number(quoteId)}
        ORDER BY order_index DESC
        LIMIT 1
        FOR UPDATE
      `;
      const orderIndex = (rows?.[0]?.order_index != null ? Number(rows[0].order_index) : -1) + 1;

      // Get product details if product_id provided
      let productData = {};
      if (lineItemData.product_id) {
        const product = await tx.product.findUnique({
          where: { id: Number(lineItemData.product_id) },
          select: { name: true, unit_price: true },
        });
        if (product) {
          productData = {
            name: lineItemData.name ?? product.name,
            unit_price: lineItemData.unit_price ?? product.unit_price,
          };
        }
      }

      // Calculate line total
      const quantity = new Decimal(lineItemData.quantity);
      const unitPrice = new Decimal(lineItemData.unit_price ?? productData.unit_price ?? 0);
      const discount = new Decimal(lineItemData.discount ?? 0);
      
      const subtotal = quantity.mul(unitPrice);
      const discountAmount = subtotal.mul(discount).div(100);
      const lineTotal = subtotal.sub(discountAmount);

      // Create line item
      const lineItem = await tx.quoteLineItem.create({
        data: {
          quote_id: Number(quoteId),
          product_id: lineItemData.product_id ? Number(lineItemData.product_id) : null,
          name: lineItemData.name ?? productData.name ?? '',
          description: lineItemData.description ?? null,
          quantity,
          unit_price: unitPrice,
          discount,
          line_total: lineTotal,
          order_index: orderIndex,
          tenant_id: getTenantId(),
        },
        include: { product: true },
      });

      // Recalculate quote totals
      await this.#recalculateQuoteTotals(tx, Number(quoteId));

      return lineItem;
    });
  }

  async updateLineItem(lineItemId, data) {
    return this.db.$transaction(async (tx) => {
      // Get current line item
      const lineItem = await tx.quoteLineItem.findUnique({
        where: { id: Number(lineItemId) },
        select: { quote_id: true },
      });

      if (!lineItem) {
        throw new Error('Line item not found');
      }

      // Calculate new line total if relevant fields changed
      let lineTotal;
      if (data.quantity !== undefined || data.unit_price !== undefined || data.discount !== undefined) {
        const current = await tx.quoteLineItem.findUnique({
          where: { id: Number(lineItemId) },
          select: { quantity: true, unit_price: true, discount: true },
        });

        const quantity = new Decimal(data.quantity ?? current.quantity);
        const unitPrice = new Decimal(data.unit_price ?? current.unit_price);
        const discount = new Decimal(data.discount ?? current.discount ?? 0);
        
        const subtotal = quantity.mul(unitPrice);
        const discountAmount = subtotal.mul(discount).div(100);
        lineTotal = subtotal.sub(discountAmount);
      }

      // Update line item
      const updated = await tx.quoteLineItem.update({
        where: { id: Number(lineItemId) },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.quantity !== undefined && { quantity: new Decimal(data.quantity) }),
          ...(data.unit_price !== undefined && { unit_price: new Decimal(data.unit_price) }),
          ...(data.discount !== undefined && { discount: new Decimal(data.discount) }),
          ...(lineTotal !== undefined && { line_total: lineTotal }),
          ...(data.order_index !== undefined && { order_index: data.order_index }),
        },
        include: { product: true },
      });

      // Recalculate quote totals
      await this.#recalculateQuoteTotals(tx, lineItem.quote_id);

      return updated;
    });
  }

  async deleteLineItem(lineItemId) {
    return this.db.$transaction(async (tx) => {
      // Get line item to find quote
      const lineItem = await tx.quoteLineItem.findUnique({
        where: { id: Number(lineItemId) },
        select: { quote_id: true },
      });

      if (!lineItem) {
        throw new Error('Line item not found');
      }

      // Delete line item
      await tx.quoteLineItem.delete({
        where: { id: Number(lineItemId) },
      });

      // Recalculate quote totals
      await this.#recalculateQuoteTotals(tx, lineItem.quote_id);

      return { id: Number(lineItemId), deleted: true };
    });
  }

  // ── QUOTE CALCULATIONS ─────────────────────────────────────────────────────

  async #recalculateQuoteTotals(tx, quoteId) {
    // Get all line items
    const lineItems = await tx.quoteLineItem.findMany({
      where: { quote_id: Number(quoteId) },
      select: { line_total: true },
    });

    // Get current quote data
    const quote = await tx.quote.findUnique({
      where: { id: Number(quoteId) },
      select: { discount_percent: true, discount_amount: true, currency: true },
    });

    // Calculate subtotal
    const subtotal = lineItems.reduce((sum, item) => {
      return sum.add(new Decimal(item.line_total));
    }, new Decimal(0));

    // Apply quote-level discount: prefer percent if set, otherwise use stored fixed amount
    const pct = new Decimal(quote.discount_percent ?? 0);
    const discountAmount = pct.greaterThan(0)
      ? subtotal.mul(pct).div(100)
      : new Decimal(quote.discount_amount ?? 0);
    const discountedTotal = subtotal.sub(discountAmount);

    // Calculate tax (simplified - would integrate with tax service in production)
    const taxRate = new Decimal(0.08); // 8% default tax rate
    const taxAmount = discountedTotal.mul(taxRate);

    // Final total
    const totalAmount = discountedTotal.add(taxAmount);

    // Update quote
    await tx.quote.update({
      where: { id: Number(quoteId) },
      data: {
        subtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        updated_at: new Date(),
      },
    });

    return { subtotal, discountAmount, taxAmount, totalAmount };
  }

  async recalculateQuote(quoteId) {
    return this.db.$transaction(async (tx) => {
      return this.#recalculateQuoteTotals(tx, Number(quoteId));
    });
  }

  // ── STATUS MANAGEMENT ──────────────────────────────────────────────────────

  async updateQuoteStatus(quoteId, status, updatedBy) {
    const statusData = { status, updated_at: new Date() };

    if (status === 'sent') {
      statusData.sent_at = new Date();
    } else if (status === 'accepted') {
      statusData.accepted_at = new Date();
    }

    const updated = await this.db.quote.update({
      where: { id: Number(quoteId) },
      data: statusData,
      include: {
        line_items: { include: { product: true } },
        opportunity: true,
        account: true,
        contact: true,
      },
    });

    // Sync CRM pipeline stage — map quote status to pipeline stage name
    if (updated.record_id) {
      const stageNameMap = { sent: 'presented', accepted: 'accepted', rejected: 'declined', expired: 'expired' };
      const stageName = stageNameMap[status] ?? status;
      try {
        const record = await this.db.record.findUnique({ where: { id: updated.record_id }, select: { object_id: true } });
        if (record) {
          const stage = await this.db.uiPipelineStage.findFirst({
            where: { name: stageName, pipeline: { object_id: record.object_id } },
            select: { id: true },
          });
          if (stage) {
            await this.db.record.update({ where: { id: updated.record_id }, data: { pipeline_stage_id: stage.id } });
          }
        }
      } catch (_) { /* pipeline sync is non-critical */ }
    }

    return updated;
  }

  async duplicateQuote(quoteId, newData = {}) {
    const originalQuote = await this.getQuote(quoteId);
    if (!originalQuote) {
      throw new Error('Original quote not found');
    }

    // createQuote and addLineItem each manage their own transactions, so no outer wrapper
    const newQuote = await this.createQuote({
      name: newData.name || `Copy of ${originalQuote.name}`,
      opportunity_id: originalQuote.opportunity_id,
      account_id: originalQuote.account_id,
      contact_id: originalQuote.contact_id,
      currency: originalQuote.currency,
      terms: originalQuote.terms,
      notes: originalQuote.notes,
      owner_id: newData.owner_id || originalQuote.owner_id,
      ...newData,
    }, newData.created_by);

    for (const lineItem of originalQuote.line_items) {
      await this.addLineItem(newQuote.id, {
        product_id: lineItem.product_id,
        name: lineItem.name,
        description: lineItem.description,
        quantity: Number(lineItem.quantity),
        unit_price: Number(lineItem.unit_price),
        discount: Number(lineItem.discount),
      });
    }

    return this.getQuote(newQuote.id);
  }

  // ── REPORTING ───────────────────────────────────────────────────────────────

  async getQuoteMetrics(ownerId = null) {
    const where = ownerId ? { owner_id: ownerId } : {};
    
    const [total, draft, sent, accepted, rejected] = await Promise.all([
      this.db.quote.count({ where }),
      this.db.quote.count({ where: { ...where, status: 'draft' } }),
      this.db.quote.count({ where: { ...where, status: 'sent' } }),
      this.db.quote.count({ where: { ...where, status: 'accepted' } }),
      this.db.quote.count({ where: { ...where, status: 'rejected' } }),
    ]);

    const conversionRate = total > 0 ? (accepted / total) * 100 : 0;

    return {
      total,
      by_status: { draft, sent, accepted, rejected },
      conversion_rate: Math.round(conversionRate * 100) / 100,
    };
  }

  async getQuoteRevenueMetrics(period = 'month') {
    // Implementation would depend on specific date range logic
    // This is a simplified version
    const quotes = await this.db.quote.findMany({
      where: { status: 'accepted' },
      select: { total_amount: true, accepted_at: true },
    });

    const totalRevenue = quotes.reduce((sum, quote) => {
      return sum + Number(quote.total_amount);
    }, 0);

    return {
      total_revenue: totalRevenue,
      quote_count: quotes.length,
      average_deal_size: quotes.length > 0 ? totalRevenue / quotes.length : 0,
    };
  }
}

module.exports = QuoteService;