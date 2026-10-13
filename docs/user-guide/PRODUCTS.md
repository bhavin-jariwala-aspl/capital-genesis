# Genesis CRM — Products Guide

Complete guide to managing products and services in Genesis CRM.

---

## Table of Contents

Product Catalog:

1. [Product Catalog Overview](#product-catalog-overview)
2. [Creating Products](#creating-products)
3. [Managing Product Information](#managing-product-information)
4. [Pricing & Inventory](#pricing--inventory)
5. [Product Categories](#product-categories)
6. [Vendor Management](#vendor-management)

Analytics & Troubleshooting:

1. [Analytics & Reporting](#analytics--reporting)
2. [Best Practices](#best-practices)
3. [Troubleshooting](#troubleshooting)

---

# Part 1 — Product Catalog

## Product Catalog Overview

The Product Catalog is Genesis CRM's comprehensive product and service management system. It provides centralized
control over your company's offerings, pricing, inventory, and vendor relationships.

**Key Capabilities:**

- Product and service catalog with detailed specifications
- Multi-currency pricing with cost tracking and profit margins
- Inventory management with vendor relationships
- Search and filtering capabilities
- Analytics and performance metrics

**Accessing the Product Catalog:**

1. **Main Navigation**: Sales > Products
2. **Direct URL**: `/module/sales/object/product`

**Permissions Required:**

- **View**: `can_view` permission on Product object
- **Create/Edit**: `can_edit` permission on Product object
- **Delete**: Administrative role or explicit delete permissions

---

## Creating Products

### Basic Product Creation

1. **Navigate** to Sales > Products
2. **Click** + New Product button
3. **Fill Required Fields**:
   - Product Name (required)
   - Unit Price (required)
   - Currency (defaults to system currency)
4. **Save** the product

### Product Types

**Physical Products:**

- Inventory tracking enabled
- Shipping weight and dimensions
- Storage location information

**Digital Products:**

- No inventory tracking
- License key management
- Download delivery options

**Services:**

- Time-based pricing options
- Service duration tracking
- Resource allocation settings

### Required vs Optional Fields

**Required Fields:**

- Product Name
- Unit Price
- Currency

**Optional But Recommended:**

- Product Description
- Category
- Cost Price (for profit tracking)
- SKU (for inventory management)

---

## Managing Product Information

### Core Product Details

**Product Name:**

- Primary identifier for the product
- Used in customer-facing documents
- Should be descriptive and professional

**Product Description:**

- Detailed product information
- Supports markdown formatting
- Used in proposals and customer-facing documents

**SKU (Stock Keeping Unit):**

- Unique identifier for inventory tracking
- Alphanumeric code (e.g., PROD-001, SKU-ABC123)
- Auto-generated if not provided

**Category:**

- Organizational grouping for products
- Enables filtering and reporting
- Can be customized per business needs

### Advanced Product Settings

**Tax Settings:**

- Tax rate configuration
- Tax-inclusive vs tax-exclusive pricing
- Regional tax variations

**Status Management:**

- Active/Inactive status
- Discontinued product handling
- Seasonal availability settings

**Document Attachments:**

- Product images and photos
- Specification documents
- User manuals and guides
- Compliance certificates

---

## Pricing & Inventory

### Pricing Management

**Unit Price:**

- Primary selling price
- Multi-currency support available
- Can include or exclude taxes

**Cost Price:**

- Purchase or production cost
- Used for profit margin calculation
- Enables margin reporting and analysis

**Profit Margin Calculation:**

```text
Profit Margin = ((Unit Price - Cost Price) / Unit Price) × 100%
```

**Pricing Strategies:**

- Fixed pricing for standard products
- Tiered pricing for volume discounts
- Dynamic pricing based on market conditions

### Inventory Tracking

**Stock Levels:**

- Current quantity on hand
- Minimum stock level alerts
- Maximum stock level recommendations

**Inventory Metrics:**

- Stock turn rate
- Days sales inventory
- Reorder point calculation

**Inventory Locations:**

- Multiple warehouse support
- Location-specific stock levels
- Transfer tracking between locations

---

## Product Categories

### Creating Categories

**Category Hierarchy:**

- Main categories (e.g., Electronics, Software)
- Subcategories (e.g., Laptops under Electronics)
- Product assignment to categories

**Category Management:**

- Category descriptions
- Category-specific settings
- Reporting by category

### Using Categories

**Organization Benefits:**

- Easier product browsing
- Category-based reporting
- Simplified inventory management
- Enhanced search and filtering

---

## Vendor Management

### Vendor Information

**Vendor Details:**

- Vendor name and contact information
- Vendor SKU mapping
- Purchase prices and terms
- Delivery timeframes

**Vendor Relationships:**

- Primary vs secondary vendors
- Vendor performance metrics
- Contract terms and conditions
- Payment terms and schedules

### Purchase Management

**Purchase Orders:**

- Generate POs from low stock alerts
- Track delivery status
- Receive inventory updates
- Update cost prices from actual purchases

**Vendor Performance:**

- Delivery time tracking
- Quality metrics
- Cost competitiveness analysis
- Relationship scoring

---

# Part 2 — Analytics & Troubleshooting

## Analytics & Reporting

### Product Performance

**Sales Metrics:**

- Units sold per period
- Revenue by product
- Profit margins achieved
- Customer demand patterns

**Inventory Analysis:**

- Stock turnover rates
- Slow-moving inventory identification
- Reorder recommendations
- Carrying cost analysis

---

## Best Practices

### Product Data Management

- Keep product descriptions current and accurate
- Maintain consistent naming conventions
- Regular pricing updates and reviews
- Accurate cost tracking for margin analysis
- Use logical category structures

### Revenue Optimization

- Market-based pricing
- Margin preservation
- Volume discount structures
- Solution-oriented proposals

---

## Troubleshooting

### Product Issues

**Product Not Appearing in Pickers:**

- Check product status (must be Active)
- Verify user has view permissions on Product object
- Ensure product has valid pricing information

**Pricing Discrepancies:**

- Verify unit price is current
- Confirm tax calculation settings
- Review currency conversion if applicable

**Inventory Tracking Problems:**

- Ensure inventory management is enabled
- Check for recent stock adjustments
- Verify location assignments are correct

---

## Related Guides

- **Daily Operations**: [DAILY_OPERATIONS.md](DAILY_OPERATIONS.md)
- **Workflow Automation**: [../admin-guide/WORKFLOW_AUTOMATION.md](../admin-guide/WORKFLOW_AUTOMATION.md)
- **System Configuration**: [../admin-guide/SYSTEM_CONFIGURATION.md](../admin-guide/SYSTEM_CONFIGURATION.md)
