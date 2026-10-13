'use strict';

const { Decimal } = require('@prisma/client/runtime/library');
const { getTenantId } = require('../middleware/tenant-scope');

/**
 * ProductService — Product catalog management for quotes and pricing.
 * 
 * Handles product/service CRUD, pricing, inventory, and quote integration.
 * Maintains consistent pricing data across the CRM system.
 */
class ProductService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
    this._productObjectId = null;
  }

  // ── Object ID cache ───────────────────────────────────────────────────────

  async #getProductObjectId() {
    if (this._productObjectId) return this._productObjectId;
    const obj = await this.db.uiObject.findFirst({
      where: { name: 'product' },
      select: { id: true },
    });
    this._productObjectId = obj?.id;
    return this._productObjectId;
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async createProduct(data, createdBy) {
    const objectId = await this.#getProductObjectId();
    const tenantId = getTenantId();

    return this.db.$transaction(async (tx) => {
      // Create anchor record
      const record = objectId
        ? await tx.record.create({
            data: {
              object_id: objectId,
              created_by: createdBy ?? null,
              assigned_to: createdBy ?? null,
              tenant_id: tenantId,
            },
          })
        : null;

      // Create product
      const product = await tx.product.create({
        data: {
          name: data.name,
          sku: data.sku ?? null,
          category: data.category ?? null,
          description: data.description ?? null,
          unit_price: new Decimal(data.unit_price),
          cost_price: data.cost_price ? new Decimal(data.cost_price) : null,
          currency: data.currency ?? 'USD',
          tax_rate: data.tax_rate ? new Decimal(data.tax_rate) : null,
          is_active: data.is_active ?? true,
          is_service: data.is_service ?? false,
          min_quantity: data.min_quantity ?? 1,
          max_quantity: data.max_quantity ?? null,
          vendor_name: data.vendor_name ?? null,
          vendor_sku: data.vendor_sku ?? null,
          dimensions: data.dimensions ?? null,
          weight: data.weight ? new Decimal(data.weight) : null,
          warranty_months: data.warranty_months ?? null,
          record_id: record?.id ?? null,
          created_by: createdBy ?? null,
          tenant_id: tenantId,
        },
      });

      return { ...product, record: record ?? undefined };
    });
  }

  // ── READ ───────────────────────────────────────────────────────────────────

  async getProduct(id) {
    const productId = parseInt(id);
    if (isNaN(productId) || productId <= 0) {
      throw new Error('Invalid product ID');
    }
    
    return this.db.product.findUnique({
      where: { id: productId },
      include: {
        record: true,
        quote_items: {
          include: {
            quote: {
              select: { id: true, quote_number: true, name: true, status: true },
            },
          },
        },
      },
    });
  }

  async getProductBySku(sku) {
    return this.db.product.findUnique({
      where: { sku },
      include: { record: true },
    });
  }

  // Alias used by routes
  async getProducts(query) {
    return this.listProducts(query);
  }

  async listProducts({
    category,
    // Defaults to active-only: the sole no-arg caller is the quote product
    // picker (GET /runtime/products), which must not offer inactive products.
    // Pass isActive: false explicitly to inspect inactive rows.
    isActive = true,
    isService,
    search,
    limit = 50, 
    offset = 0,
    orderBy = { name: 'asc' },
  } = {}) {
    const where = {
      ...(category && { category }),
      ...(isActive !== undefined && { is_active: isActive }),
      ...(isService !== undefined && { is_service: isService }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { sku: { contains: search } },
          { description: { contains: search } },
          { vendor_name: { contains: search } },
        ],
      }),
    };

    const [products, total] = await Promise.all([
      this.db.product.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: { record: true },
      }),
      this.db.product.count({ where }),
    ]);

    return { products, total, limit, offset };
  }

  async getProductsByCategory() {
    return this.db.product.groupBy({
      by: ['category'],
      where: { is_active: true },
      _count: { id: true },
      orderBy: { category: 'asc' },
    });
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async updateProduct(id, data, updatedBy) {
    const updateData = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.sku !== undefined && { sku: data.sku }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.unit_price !== undefined && { unit_price: new Decimal(data.unit_price) }),
      ...(data.cost_price !== undefined && { 
        cost_price: data.cost_price ? new Decimal(data.cost_price) : null 
      }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.tax_rate !== undefined && { 
        tax_rate: data.tax_rate ? new Decimal(data.tax_rate) : null 
      }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      ...(data.is_service !== undefined && { is_service: data.is_service }),
      ...(data.min_quantity !== undefined && { min_quantity: data.min_quantity }),
      ...(data.max_quantity !== undefined && { max_quantity: data.max_quantity }),
      ...(data.vendor_name !== undefined && { vendor_name: data.vendor_name }),
      ...(data.vendor_sku !== undefined && { vendor_sku: data.vendor_sku }),
      ...(data.dimensions !== undefined && { dimensions: data.dimensions }),
      ...(data.weight !== undefined && { 
        weight: data.weight ? new Decimal(data.weight) : null 
      }),
      ...(data.warranty_months !== undefined && { warranty_months: data.warranty_months }),
      updated_at: new Date(),
    };

    return this.db.product.update({
      where: { id: Number(id) },
      data: updateData,
      include: { record: true },
    });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────

  async deleteProduct(id) {
    return this.db.$transaction(async (tx) => {
      // Check if product is used in any quotes
      const quoteItems = await tx.quoteLineItem.findFirst({
        where: { product_id: Number(id) },
      });

      if (quoteItems) {
        throw new Error('Cannot delete product: it is referenced in existing quotes');
      }

      // Get the product to find its record
      const product = await tx.product.findUnique({
        where: { id: Number(id) },
        select: { record_id: true },
      });

      // Delete product (this will cascade delete the record due to FK constraints)
      await tx.product.delete({ where: { id: Number(id) } });

      return { id: Number(id), deleted: true };
    });
  }

  // ── PRICING UTILITIES ──────────────────────────────────────────────────────

  calculateLineTotal(unitPrice, quantity, discount = 0) {
    const price = new Decimal(unitPrice);
    const qty = new Decimal(quantity);
    const discountPct = new Decimal(discount).div(100);
    
    const subtotal = price.mul(qty);
    const discountAmount = subtotal.mul(discountPct);
    
    return subtotal.sub(discountAmount);
  }

  calculateTax(amount, taxRate) {
    if (!taxRate) return new Decimal(0);
    
    const amt = new Decimal(amount);
    const rate = new Decimal(taxRate);
    
    return amt.mul(rate);
  }

  // ── REPORTING ───────────────────────────────────────────────────────────────

  async getTopSellingProducts(limit = 10) {
    return this.db.product.findMany({
      include: {
        quote_items: {
          include: {
            quote: {
              where: { status: { in: ['accepted'] } },
              select: { total_amount: true },
            },
          },
        },
        _count: {
          select: { quote_items: true },
        },
      },
      orderBy: {
        quote_items: { _count: 'desc' },
      },
      take: limit,
    });
  }

  async getProductSalesMetrics(productId) {
    const product = await this.db.product.findUnique({
      where: { id: Number(productId) },
      include: {
        quote_items: {
          include: {
            quote: {
              select: { 
                status: true, 
                total_amount: true, 
                created_at: true,
                accepted_at: true,
              },
            },
          },
        },
      },
    });

    if (!product) return null;

    const metrics = {
      total_quotes: product.quote_items.length,
      accepted_quotes: product.quote_items.filter(
        item => item.quote.status === 'accepted'
      ).length,
      total_revenue: product.quote_items
        .filter(item => item.quote.status === 'accepted')
        .reduce((sum, item) => sum + Number(item.line_total), 0),
      conversion_rate: 0,
    };

    if (metrics.total_quotes > 0) {
      metrics.conversion_rate = (metrics.accepted_quotes / metrics.total_quotes) * 100;
    }

    return metrics;
  }
}

module.exports = ProductService;