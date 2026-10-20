# Genesis CRM — Products Guide

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Using the CRM](README.md)** › 6 of 6 · **For:** All staff
> ← [My account, record tools, portal](my-account-and-record-tools.md) · [Modules & objects](../builder-guide/01-modules-and-objects.md) *(Builder guide)* →
> New to Genesis? Background: [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md)
<!-- /nav:top -->

How the product and service catalogue works in Genesis CRM.

---

## Table of Contents

Product Catalog:

1. [Product Catalog Overview](#product-catalog-overview)
2. [Creating Products](#creating-products)
3. [Managing Product Information](#managing-product-information)
4. [Pricing](#pricing)
5. [Product Categories](#product-categories)

Troubleshooting:

1. [Best Practices](#best-practices)
2. [Troubleshooting](#troubleshooting)

---

# Part 1 — Product Catalog

## Product Catalog Overview

In the Genesis Capital workspace the catalogue is the **Product** object (`financial_product`) in the
**Products & Services** module. It is an ordinary Builder object: each product is one record, stored like every
other record (see [How data is stored](../understanding/03-how-data-is-stored.md)).

It ships with Genesis Capital's 22 products and services — loans, wealth management, funds, securities, advisory
and forex — each with a code such as `LND-RE` (Real Estate Loan) or `FND-MMF` (Money Market Fund).

Other objects use the catalogue through the product **code**. An enquiry, loan application or suitability record
has a **Product** pick-list (`product_code`), and formulas look up the matching product row by code to read its
margin, maximum tenure or risk rating.

> **Not the `products` table.** The database also has an older `products` table with an API at
> `/api/runtime/products` (name, SKU, unit price, vendor, stock fields). No screen uses it and Genesis Capital does
> not store anything in it. Everything in this guide is about the `financial_product` object.

**Accessing the Product Catalog:**

1. **Main Navigation**: open the **Products & Services** module in the left sidebar
2. Select the **Products & Services** object list

**Permissions:**

- Every Genesis Capital staff role can **view** products. Staff roles cannot edit them.
- Administrators (`admin`, `super_admin`) can create and edit products.

---

## Creating Products

### Basic Product Creation

1. **Navigate** to the Products & Services module
2. **Click** + New Product
3. **Fill Required Fields**:
   - Code (must be unique)
   - Name (EN)
   - Business unit
4. **Save** the product

A new product code is not added to the **Product** pick-lists on other objects automatically. An administrator adds
the option to those fields in the Builder.

### Required vs Optional Fields

**Required Fields:**

- Code
- Name (EN)
- Business unit

**Optional But Recommended:**

- Category
- Margin vs Genesis PLR (for loan products)
- Risk rating (used by suitability checks)
- Description and the other product-sheet fields

---

## Managing Product Information

### Core Product Details

| Field | Notes |
| ----- | ----- |
| Code | Unique key. Other objects find the product by this code |
| Name (EN) / Name (FR) | English and French names |
| Business unit | Owning business unit |
| Provided by | Legal entity that provides the product |
| Category | See [Product Categories](#product-categories) |
| Tagline | One-line summary |
| Active | Tick to mark the product as offered |

### Terms

| Field | Notes |
| ----- | ----- |
| Risk rating (1 low – 5 high) | Must be 1–5. Suitability records compare it with the client's risk profile |
| Margin vs Genesis PLR | Percentage points added to the PLR, e.g. `-0.675` |
| Rate from (% p.a.) | Calculated — see [Pricing](#pricing) |
| Currencies | Currencies offered |
| Minimum amount (MUR) | |
| Maximum tenure (months) | Read by loan formulas |
| Maximum age at maturity | |
| Maximum financing / LTV % | |

### Product Sheet

Description, features and benefits, eligibility, security and insurance, documents required, fees and charges,
who it is for, how to apply, and a link to the product page.

**Document checklist (DMS):** the name of the document checklist an application for this product needs. The
record's Docs tab shows that checklist.

---

## Pricing

**Rate from** is a formula: the latest **Genesis PLR** rate already in effect plus the product's **margin**. It is
blank when no margin is set.

The PLR history is its own object (**Genesis PLR**). When a PLR row is added, changed or removed, the products that
read it are recalculated straight away. A scheduled refresh also runs every hour.

Enquiries use the same rule for their **Indicative rate** (PLR + the margin of the chosen product).

---

## Product Categories

Category is a fixed pick-list:

| Value | Label |
| ----- | ----- |
| `lending` | Lending |
| `wealth` | Wealth |
| `funds` | Funds |
| `securities` | Securities |
| `advisory` | Advisory |
| `fx` | Forex |

Use it to filter and group the product list. An administrator can change the options in the Builder.

---

# Part 2 — Troubleshooting

## Best Practices

- Keep codes stable. Other records and formulas find a product by its code.
- Set a margin on every loan product, or its rate stays blank.
- Keep the risk rating current, since suitability checks read it.
- Untick **Active** rather than deleting a product that records still reference.

---

## Troubleshooting

**Product missing from a Product pick-list:**

- The pick-lists on other objects are fixed option lists. Add the code to that field's options in the Builder.

**Rate from is blank:**

- Check that the product has a margin.
- Check that a Genesis PLR row exists with an effective date on or before today.

**A loan or enquiry shows the wrong rate or tenure:**

- Check that its product code matches the product's **Code** exactly.

---

## Related Guides

- **Daily Operations**: [daily-operations.md](daily-operations.md)
- **Workflow Automation**: [../administration/workflow-automation.md](../administration/workflow-automation.md)
- **System Configuration**: [../administration/system-configuration.md](../administration/system-configuration.md)

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Modules & objects](../builder-guide/01-modules-and-objects.md) *(Builder guide)* — Create modules, objects and fields — the blueprint |
| **Previous** | [My account, record tools, portal](my-account-and-record-tools.md) |
| **Background** | [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md) |
| **Related** | [01 — Products & Services](../genesis-capital/process-flows/01-products-and-services.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Using the CRM](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
