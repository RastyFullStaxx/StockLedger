# StockLedger Product Expansion Plan

## 1. Direction

StockLedger should grow from an inventory ledger into a sales-aware stock operations system.

The core rule does not change: stock is still derived from immutable inventory events. Sales, purchases, client orders, menus, and reports sit around the ledger and create or explain stock events. They must not become a second source of stock truth.

The upgraded product should be easier than the old system because staff should not need to think in database terms. They should see: who is ordering, what was sold, what was bought, what stock changed, what needs action, and what happened historically.

---

## 2. Primary Navigation

Use sidebar groups so the app can grow without becoming a long flat list.

### Daily Work

| Page | Purpose | Notes |
|---|---|---|
| Home | Today view, urgent work, shortcuts | Keep as the operational landing page. |
| Stock Overview | Current derived stock by product and location | Existing page stays. |
| Stock Actions | Manual stock work and exceptional corrections | Existing page stays, but remains focused on ledger actions. |
| Sales | Record sales, recurring orders, seasonal orders, fulfillment | New module. Sales can post `STOCK_OUT` when fulfilled. |
| Purchases | Purchase orders, receiving, supplier deliveries | New module. Receiving can post `STOCK_IN`. |

### Relationships

| Page | Purpose | Notes |
|---|---|---|
| Clients | Customer records, order history, standing orders, balances if needed | New module. Do not mix with tenant/client-admin records. |
| Suppliers | Supplier records, purchase history, delivery reliability | New module. |
| Menus | Sellable menus, bundles, recipes, product deductions | New module. This replaces ad hoc sales item setup. |
| Products | Product catalog and lifecycle | Existing page stays as catalog, not daily stock movement. |
| Locations | Storage/service areas and location setup | New page when configuration grows beyond the current static list. |

### Control

| Page | Purpose | Notes |
|---|---|---|
| Reports | Sales, purchases, stock movement, variance, client activity | New module with report templates and filters. |
| Audit Trail | Immutable event history and correction workflow | Rename current `Audit` to `Audit Trail`. |
| Users & Roles | Staff users, permissions, device trust | New module. |
| Settings | Site profile, sync/device settings, numbering, defaults | New module. |

### Admin Only

| Page | Purpose | Notes |
|---|---|---|
| Tenants | System-owner client registry and tenant provisioning | Only for `GLOBAL_ADMIN`. This avoids confusion with customer `Clients`. |

---

## 3. Page Plans

### Home

Show a scannable operations cockpit:

- unsent work
- low stock and negative stock
- sales due today
- purchase deliveries expected today
- recurring orders needing confirmation
- recent exceptions needing review

Primary actions should be: `Record Sale`, `Receive Purchase`, `Use Stock`, `Create Order`, `Send Work`.

### Sales

Sales should be order-first, not stock-adjustment-first.

Sections:

- `New Sale`: client, sale type, date, items, price/notes, fulfillment location
- `Recurring`: standing orders with frequency, next due date, default items
- `Seasonal`: date-ranged order templates and limited-time client menus
- `To Fulfill`: approved sales not yet deducted from stock
- `Sales History`: posted sales with linked stock events

Posting rule:

- Draft sales do not affect stock.
- Fulfilled sales generate one or more immutable `STOCK_OUT` events.
- Voids or corrections use compensating records and stock reverts, not edits.

### Purchases

Purchases should separate ordering from receiving.

Sections:

- `New Purchase`: supplier, expected date, items, quantities, notes
- `Incoming`: open purchase orders and expected deliveries
- `Receive Stock`: confirm actual received quantities and location
- `Supplier History`: delivery and variance history

Posting rule:

- Purchase orders do not affect stock.
- Received items generate immutable `STOCK_IN` events.
- Short deliveries, returns, and damaged goods create explicit adjustment/reversal workflows.

### Clients

This page is for customers or buyers, not StockLedger tenants.

Sections:

- client profile and contact details
- delivery/billing notes
- default menu or price list
- recurring orders
- seasonal transactions
- sales history
- open balances only if the client confirms accounting scope

PII rule:

- client contact details must be role-protected, redacted in logs, and excluded from technical error messages.

### Suppliers

Sections:

- supplier profile
- products supplied
- purchase history
- expected delivery days
- receiving variance and reliability

### Menus

Menus turn sellable items into stock deductions.

Sections:

- menu items or bundles sold to clients
- recipe/BOM mapping to stock products
- client-specific menus and seasonal menus
- effective dates
- test deduction preview before publishing

Posting rule:

- A sale of a menu item expands into stock product deductions only when fulfilled.
- The expansion must be deterministic and versioned, so old sales replay with the menu version used at the time.

### Reports

Reports should be grouped by decision, not by database table.

Recommended report groups:

- `Stock`: current stock, low stock, negative stock, stock by location
- `Movement`: stock in/out/transfer/adjustment history
- `Sales`: sales by client, item, period, recurring vs seasonal
- `Purchases`: received stock, supplier totals, delivery variance
- `Clients`: client activity, top items, inactive clients
- `Variance`: physical count differences, shrinkage, corrections
- `Audit`: user actions, device actions, reversals, batch sync history

Every report should support date range, client/supplier/product/location filters, export, and printable summary.

### Audit Trail

Keep this page immutable and forensic.

Show:

- event sequence
- action type
- actor and device
- source document, such as sale, purchase, manual action, or correction
- affected product/location/quantity
- batch sync status
- reverse/correct action when allowed

Hide technical IDs by default behind details.

### Users & Roles

Sections:

- user list
- role assignment
- device trust
- access history
- invite/deactivate user

Roles:

- `GLOBAL_ADMIN`: StockLedger system owner
- `CLIENT_ADMIN`: tenant/business owner
- `MANAGER`: sales, purchases, reports, users within tenant
- `STAFF`: daily stock, sales fulfillment, receiving
- `AUDITOR`: read-only reports and audit trail

---

## 4. Domain Records and Events

Keep business records separate from inventory events.

| Business record | What it represents | When stock changes |
|---|---|---|
| Sale order | Client requested or bought items | When fulfilled/posted |
| Recurring order | Template for repeated sale orders | When each generated sale is fulfilled |
| Seasonal order/menu | Date-ranged sales setup | When fulfilled during active dates |
| Purchase order | Supplier order before delivery | When received |
| Receiving record | Actual supplier delivery | Immediately posts `STOCK_IN` |
| Menu recipe | Sellable item to stock-product mapping | Used during sale fulfillment |

New event families to plan:

- `SALE_CREATED`, `SALE_FULFILLED`, `SALE_VOIDED`
- `PURCHASE_CREATED`, `PURCHASE_RECEIVED`, `PURCHASE_CANCELLED`
- `CLIENT_CREATED`, `CLIENT_UPDATED`, `CLIENT_DEACTIVATED`
- `SUPPLIER_CREATED`, `SUPPLIER_UPDATED`, `SUPPLIER_DEACTIVATED`
- `MENU_ITEM_CREATED`, `MENU_ITEM_VERSIONED`, `MENU_ITEM_DEACTIVATED`
- `USER_INVITED`, `USER_ROLE_CHANGED`, `DEVICE_TRUST_CHANGED`

These are not replacements for stock events. They are business/audit events. Stock quantities still come only from inventory replay.

---

## 5. Redundancy Decisions

Merge or rename these concepts before implementation:

- `Audit` becomes `Audit Trail`.
- `Products` stays catalog-only. Product lifecycle actions continue to be prepared from `Stock Actions` or later from product detail pages.
- `Stock Actions` should not absorb sales or purchases. Sales and purchases get their own guided pages because they need client/supplier context.
- `Clients` means customers/buyers. `Tenants` means StockLedger subscribed businesses.
- `Menus` should include recipes/BOM and client-specific sellable lists instead of creating separate recipe and client-menu tabs at first.
- `Reports` should absorb any old-system standalone print/list pages unless they are daily-work actions.

---

## 6. Sidebar Structure

Recommended expanded sidebar:

```text
Home

Daily Work
  Stock Overview
  Stock Actions
  Sales
  Purchases

Relationships
  Clients
  Suppliers
  Menus
  Products
  Locations

Control
  Reports
  Audit Trail
  Users & Roles
  Settings

System Admin
  Tenants
```

On smaller screens, collapse groups into icons and keep `Home`, `Sales`, `Purchases`, `Stock Actions`, and `Reports` easiest to reach.

---

## 7. Implementation Phases

### Phase A: Product Model Expansion

- Define customer/client, supplier, sales, purchase, and menu terms.
- Update database/API docs with business records separate from stock events.
- Add privacy rules for customer/client contact data.

### Phase B: Prototype Navigation

- Add sidebar grouping.
- Add placeholder pages for Sales, Purchases, Clients, Suppliers, Menus, Reports, Users & Roles, Settings.
- Each placeholder should show the intended sections and primary actions, not a blank screen.

### Phase C: Sales and Purchases

- Implement sale draft, sale fulfillment, purchase order, and receiving in the local prototype.
- Fulfillment posts `STOCK_OUT`; receiving posts `STOCK_IN`.
- Extend browser smoke to cover sale-to-stock and purchase-to-stock flows.

### Phase D: Menus and Recurring Work

- Implement menu item to stock-product mappings.
- Implement recurring order templates and seasonal effective dates.
- Add deterministic versioning for menu recipes used by sales.

### Phase E: Reports and Audit

- Add report views by decision group.
- Link every report row back to source business records and immutable stock events.
- Add printable/exportable summaries after the report model stabilizes.

### Phase F: Production CI and Backend

- Move domain logic into testable modules before NestJS scaffolding.
- Add backend contracts only after the prototype interactions are proven.
- Keep production implementation aligned with the event model and tenant isolation docs.

---

## 8. CI Pipeline Friction Reduction

The current verify path is good for confidence but too broad for every small change. Split it into faster gates:

| Gate | Runs on | Contents |
|---|---|---|
| `npm run verify:quick` | every push and local pre-PR | unit tests, lint/typecheck when available |
| `npm run verify:ui` | UI changes or PR label | one browser smoke on Chromium |
| `npm run verify` | main branch and release PRs | build, all unit tests, all browser smoke, future e2e |
| `db-contract` | backend/schema changes | Prisma validate, migrations dry run, tenant isolation tests |

Practical improvements:

- cache npm dependencies and Playwright browsers in CI
- avoid running browser smoke when only docs changed
- keep local `npm run verify` as the confidence command
- add smaller commands such as `npm run verify:quick` and `npm run verify:ui`
- make browser smoke seed/reset local storage inside the test, as it does now
- keep screenshots only on failure in CI, but allow local screenshot capture during design work

---

## 9. Immediate UI Rule

Avoid nested boxes in operational forms.

For Stock Actions and future Sales/Purchases forms:

- use one border for the actual control
- do not wrap selects/inputs inside another bordered rectangle
- use spacing, labels, and section headers for grouping
- hide technical IDs by default
- keep primary actions visible without hunting
