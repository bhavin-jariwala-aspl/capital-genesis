# Genesis CRM — Products & Quotes Guide

Complete guide to managing products, services, and quotes in Genesis CRM.

---

## Table of Contents

Product Catalog:

1. [Product Catalog Overview](#product-catalog-overview)
2. [Creating Products](#creating-products)
3. [Managing Product Information](#managing-product-information)
4. [Pricing & Inventory](#pricing--inventory)
5. [Product Categories](#product-categories)
6. [Vendor Management](#vendor-management)

Quote Management:

1. [Quote Overview](#quote-overview)
2. [Quote Lifecycle](#quote-lifecycle)
3. [Creating Quotes](#creating-quotes)
4. [Quote Line Items](#quote-line-items)
5. [Approval Workflow](#approval-workflow)
6. [Quote Delivery](#quote-delivery)
7. [Revenue Forecasting](#revenue-forecasting)

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
- Seamless integration with quote generation

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
- Used in quotes and customer-facing documents
- Should be descriptive and professional

**Product Description:**

- Detailed product information
- Supports markdown formatting
- Used in quotes and proposals

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

**Quote Integration:**

- Category grouping in quotes
- Category-based pricing rules
- Professional quote organization

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

# Part 2 — Quote Management

## Quote Overview

The Quote Management system provides professional quote generation with built-in approval workflows, product
integration, and revenue forecasting capabilities.

**Key Features:**

- Automated quote numbering (QUO-001, QUO-002, etc.)
- Product catalog integration with automatic pricing
- Multi-stage approval workflow
- Professional quote presentation
- Revenue forecasting and conversion tracking
- PDF export ready (infrastructure in place)

---

## Quote Lifecycle

### Quote Status Flow

```text
Draft → Sent → Accepted
             ↓
          Rejected
```

**Status Definitions:**

| Status | Description | Actions Available |
| ------ | ----------- | ----------------- |
| Draft | Quote being prepared | Edit, Add Items, Submit |
| Sent | Submitted for approval / delivered | Approve, Reject |
| Accepted | Approved and accepted | Convert to Order |
| Rejected | Customer or internal rejection | Revise, Archive |
| Expired | Past validity date | Revise, Archive |

### Quote Workflow Triggers

**Automatic Triggers:**

- Quote submission → Notification to approver
- Approval → Notification to sales rep
- Customer acceptance → Opportunity stage update
- Expiration date reached → Alert notifications

---

## Creating Quotes

### Starting a New Quote

**Navigation:**

1. Sales > Quotes
2. Click **+ New Quote**
3. Fill in quote details form

**Required Information:**

- **Quote Name** (required) — descriptive title for the quote
- Related opportunity (if applicable)
- Validity period/expiration date

### Quote Header Information

The quote form is organized into logical sections. All fields
below the quote name are optional but recommended for complete
CRM records.

**Quote Details:**

- **Quote Name**: Descriptive title (e.g., "Q4 Enterprise License Renewal")
- **Quote Number**: Auto-generated (Q-YYYY-NNNN)
- **Quote Date**: Creation date (auto-filled)
- **Valid Until**: Expiration date for quote
- **Terms**: Payment terms and conditions
- **Notes**: Internal notes and special instructions

**Related Records:**

- **Account**: Primary customer account — select from CRM accounts dropdown
- **Contact**: Primary contact person — select from CRM contacts dropdown
- **Opportunity**: Linked sales opportunity — select from opportunities dropdown

**Pricing Controls:**

- **Discount (%)**: Percentage-based discount applied to the quote subtotal
- **Discount (Fixed $)**: Fixed-amount discount applied to the quote subtotal
- **Currency**: Quote currency (USD, EUR, GBP, CAD, AUD, INR)

> When both discount types are set, the backend prefers the
> percentage discount over the fixed amount.

**Billing & Shipping Addresses:**

Collapsible address sections with street, city, state, country,
and ZIP fields. A "(filled)" indicator appears on the section
header when any address field has a value. Click the section
header to expand or collapse.

- **Billing Address**: Street, City, State, Country, ZIP
- **Shipping Address**: Street, City, State, Country, ZIP

### Opportunity Integration

**Linking to Opportunities:**

- Select existing opportunity from dropdown
- Create new opportunity from quote
- Auto-sync quote value with opportunity amount
- Track quote-to-close conversion rates

**Benefits of Integration:**

- Revenue forecasting accuracy
- Pipeline value updates
- Sales process tracking
- Conversion analysis

---

## Quote Line Items

Line items are managed within the quote detail view. Click any
quote row in the list to open the detail view with full line
item management.

### Adding Line Items

**From Product Catalog:**

1. Open a draft quote by clicking its row
2. Click **Add Item** in the Line Items section
3. Select a product from the **Product** dropdown
4. Name and unit price auto-fill from the catalog
5. Adjust quantity and discount as needed
6. Click **Add Item** to save

**Custom Items (No Product):**

1. Leave the Product dropdown on "Custom item (no product)"
2. Enter name, description, quantity, and unit price manually
3. Click **Add Item**

### Editing Line Items

- Click the **Edit** (pencil) icon on any line item
- Modify name, description, quantity, unit price, or discount
- Click **Update** to save changes
- Line items are only editable while the quote is in **Draft**
  status

### Removing Line Items

- Click the **Remove** (trash) icon on any line item
- The item is immediately removed and totals recalculate

### Line Item Calculations

- **Line Total** = Quantity × Unit Price × (1 - Discount%)
- Quote totals (subtotal, discount, tax, total) recalculate
  automatically after every add/edit/remove

### Quote Detail Summary

When a quote has an account, contact, non-USD currency, or
percentage discount, an info bar appears above the summary
cards showing these details at a glance.

The detail view shows four summary cards:

- **Subtotal**: Sum of all line totals
- **Discount**: Quote-level discount applied
- **Tax**: Calculated tax amount
- **Total**: Final quote amount

### API Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/runtime/quotes/:id/line-items` | Add line item |
| `PUT` | `/api/runtime/quotes/:id/line-items/:itemId` | Update item |
| `DELETE` | `/api/runtime/quotes/:id/line-items/:itemId` | Remove item |

### Pricing Control

**Price Overrides:**

- Override catalog pricing for special deals
- Apply percentage or fixed discounts
- Set special customer pricing
- Document pricing rationale

**Margin Protection:**

- Display cost vs selling price
- Show margin percentages
- Alert on low-margin quotes
- Require approval for below-threshold margins

---

## Approval Workflow

### Approval Rules

**Default Approval Triggers:**

- Quote value exceeds threshold
- Margin below minimum percentage
- Discount above maximum allowed
- Custom approval requirements

**Approval Hierarchy:**

1. **Sales Rep** creates quote
2. **Sales Manager** reviews and approves
3. **Senior Management** for large deals
4. **Finance** for margin exceptions

### Approval Process

**Submission for Approval:**

1. Complete quote with all line items
2. Click the **Send** button (envelope icon)
3. Quote status changes to "Sent"
4. Automatic notification to approver

**Approver Actions:**

- **Accept**: Quote moves to "Accepted" status
- **Reject**: Quote moves to "Rejected" with rejection reason recorded

**Approval Notifications:**

- Dashboard notifications
- Email alerts to approvers (when email integration is configured)

### Rejection Handling

**Rejection Reasons:**

- Pricing concerns
- Margin too low
- Terms not acceptable
- Customer creditworthiness
- Product availability issues

**Post-Rejection Actions:**

- Revise pricing or terms
- Add additional justification
- Escalate to higher authority
- Return to customer for negotiation

---

## Quote Delivery

### Professional Presentation

**Quote Document Sections:**

- Company header with logo
- Customer information
- Quote number and validity
- Line item details with descriptions
- Pricing summary with taxes
- Terms and conditions
- Signature section

**Customization Options:**

- Company branding and colors
- Custom terms and conditions
- Additional custom sections
- Multiple language support

### Delivery Methods

**Electronic Delivery:**

- PDF generation and email
- Customer portal access
- Secure download links
- Digital signature integration

**Customer Response Tracking:**

- Record customer feedback
- Log follow-up activities
- Monitor response timelines

---

## Revenue Forecasting

### Quote-Based Forecasting

**Forecast Calculations:**

- Quote value × Probability = Weighted forecast
- Probability based on quote status
- Timeline based on expected close date

**Probability by Status:**

| Quote Status | Default Probability |
| ------------ | ------------------- |
| Draft | 10% |
| Sent | 50% |
| Accepted | 95% |
| Rejected | 0% |
| Expired | 0% |

### Pipeline Integration

**Opportunity Sync:**

- Quote values update opportunity amounts
- Quote status influences opportunity probability
- Quote timeline affects close date estimates
- Multiple quotes per opportunity handling

---

# Part 3 — Analytics & Troubleshooting

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

### Quote Performance Metrics

**Conversion Analysis:**

- Quote-to-close conversion rates
- Average time from quote to close
- Win/loss analysis by rep and product

**Pricing Analytics:**

- Average quote values
- Margin analysis by product/customer
- Discount frequency and impact

---

## Best Practices

### Product Data Management

- Keep product descriptions current and accurate
- Maintain consistent naming conventions
- Regular pricing updates and reviews
- Accurate cost tracking for margin analysis
- Use logical category structures

### Quote Creation

- Accurate product descriptions
- Competitive pricing strategies
- Clear terms and conditions
- Professional presentation
- Rapid quote turnaround

### Revenue Optimization

- Market-based pricing
- Margin preservation
- Volume discount structures
- Qualification before quoting
- Solution-oriented proposals

---

## Troubleshooting

### Product Issues

**Product Not Appearing in Quotes:**

- Check product status (must be Active)
- Verify user has view permissions on Product object
- Ensure product has valid pricing information

**Pricing Discrepancies:**

- Verify unit price is current
- Check for quote-level discounts
- Confirm tax calculation settings
- Review currency conversion if applicable

**Inventory Tracking Problems:**

- Ensure inventory management is enabled
- Check for recent stock adjustments
- Verify location assignments are correct

### Quote Issues

**Quote Not Generating:**

- Check product pricing information
- Verify customer information complete
- Ensure user has quote creation permissions

**Approval Workflow Problems:**

- Verify approver assignments
- Check approval rule configuration
- Confirm notification settings
- Review user role permissions

---

## Related Guides

- **Daily Operations**: [DAILY_OPERATIONS.md](DAILY_OPERATIONS.md)
- **Workflow Automation**: [../admin-guide/WORKFLOW_AUTOMATION.md](../admin-guide/WORKFLOW_AUTOMATION.md)
- **System Configuration**: [../admin-guide/SYSTEM_CONFIGURATION.md](../admin-guide/SYSTEM_CONFIGURATION.md)
