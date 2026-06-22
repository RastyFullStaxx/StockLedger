# StockLedger User Manual

This manual explains how to use the local StockLedger prototype.

StockLedger records inventory as a history of events. You do not type the final stock number. You record what happened, and StockLedger calculates stock from those records.

This version is a browser-local prototype. It uses sample data, saves demo work in your browser, and simulates online sync. It is not the production NestJS, PostgreSQL, Electron, or SQLite system yet.

## 1. Start the Prototype

From the project folder, run:

```bash
npm install
npm run dev
```

Open the local address printed by the terminal. The usual address is:

```text
http://127.0.0.1:5173
```

If the prototype is already running, open the same address again.

## 2. The Main Rule

Do not overwrite stock.

Do not record:

```text
Gin stock is now 10.
```

Record what happened:

```text
24 bottles of gin arrived in Dry Store.
8 bottles moved from Dry Store to Main Bar.
3 bottles were used from Main Bar.
```

StockLedger keeps every movement in history. This makes stock numbers explainable, because the system can show how each balance was created.

Sales, purchases, menus, clients, suppliers, users, and settings sit around that ledger. They can explain why stock moved, but stock quantity still comes only from replayed inventory events.

## 3. First Things to Check

Start on `Home` or `Stock Overview`.

Check these items first:

1. `Waiting to Send`
2. `Low Stock`
3. `Total Stock`
4. `By Location`
5. `Reports`
6. `Audit Trail`

Use the `Guide` button in the top bar when you need a short hint for the current screen.

## 4. Navigation

The left sidebar is grouped by how people work.

| Group | Screen | Use it for |
| --- | --- | --- |
| Daily Work | `Home` | Quick start and shortcuts |
| Daily Work | `Stock Overview` | Current calculated stock totals |
| Daily Work | `Sales` | Fulfill client sales, recurring orders, menu sales, and direct stock sales |
| Daily Work | `Purchases` | Receive supplier deliveries and create stock-in work |
| Daily Work | `Stock Actions` | Prepare manual stock work, product work, corrections, and send saved work |
| Relationships | `Clients` | Customer records, default menus, order patterns, and hidden contact details |
| Relationships | `Suppliers` | Supplier records, supplied products, receiving history, and hidden terms |
| Relationships | `Menus` | Client menus and recipe lines that become stock deductions when fulfilled |
| Relationships | `Products` | Catalog review for active and inactive products |
| Relationships | `Locations` | Storage, service, and prep locations with replayed balances |
| Control | `Reports` | Stock, sales, purchasing, movement, source, and review summaries |
| Control | `Audit Trail` | Immutable event history and reverse-record workflow |
| Control | `Users & Roles` | Staff access, role matrix, trusted devices, and sensitive-access review |
| Control | `Settings` | Tenant defaults, numbering, privacy guardrails, and CI lanes |

The top account menu shows whether the prototype is `Online` or `Offline`.

The account menu also includes `Reset Demo`. This returns the prototype to the original sample data and removes local demo changes.

## 5. Home

Use `Home` when you want the fastest path into the prototype.

It shows:

- current stock status
- recent movements
- shortcuts to sales, purchases, reports, stock actions, audit trail, and products
- waiting work that should be sent

If work is waiting to send, open `Stock Actions` and review `Work to Send`.

## 6. Stock Overview

Use `Stock Overview` to check calculated stock.

The numbers come from event replay. They are not manually stored totals.

### Total Stock

Use `Total Stock` for the master count by product across all locations.

### By Location

Use `By Location` when you need one store room, bar, kitchen, or cellar.

Choose the location, then review the product balances for that place.

### Detailed List

Use `Detailed List` when you need every product and location row.

Filters can narrow the list by product, location, or search text.

### Low Stock

A product is marked `Low Stock` when its replayed balance is at or below its configured low-stock threshold.

## 7. Sales

Use `Sales` when stock leaves because a client order was fulfilled.

Sales are order-first:

- Draft sale information does not change stock.
- Fulfillment creates one or more `STOCK_OUT` events.
- Menu sales expand into grouped stock work from recipe lines.
- Direct stock sales create one stock-out line.

The page includes:

- client selection
- sale type: one-time or recurring
- menu-item or direct-stock mode
- fulfillment location
- quantity and notes
- a filtered sales table
- a retractable detail panel for the selected sale

Use `Fulfill Sale` when the sale is ready to affect stock. The created stock work waits in `Work to Send` until sent.

Click a sale row to open its full details on the right side of the table. The table keeps only the useful columns visible while the detail panel is open. Sale actions such as opening work or audit history are at the bottom of the detail panel.

## 8. Purchases

Use `Purchases` when supplier stock arrives.

Purchases separate ordering from receiving:

- A purchase plan does not change stock.
- Receiving creates `STOCK_IN` work.
- Supplier, product, quantity, location, and notes stay linked to the stock event.

Use `Receive Purchase` after checking what actually arrived. The stock-in work waits in `Work to Send` until sent. Use `Stock In Without Purchase` when stock arrived without a supplier receipt or purchase plan.

Receipt history uses a filtered table with status tabs, search, and supplier filtering. Click a purchase row to open the receiving details on the right side of the table. The detail panel shows notes, supplier reliability, technical source IDs, and bottom actions for closing, opening the supplier, or opening the queued work.

## 9. Stock Actions

Use `Stock Actions` for manual stock work, product lifecycle work, corrections, and sending saved work.

The left side is the action form. The right side is `Work to Send`.

Choose the action type from the action tabs, choose one or more products when the action supports it, fill in the required fields, write a reason, then click `Save Action`.

Saved work stays in `Work to Send` until you send it.

Important: saved work is sent as one batch. If one saved item has a validation problem, the whole batch is rejected so the history stays consistent.

When several products are selected for the same stock action, StockLedger saves grouped work: one event per product, sharing the same action context.

## 10. Action Types

### Stock In

Use this when stock arrives at a location.

Example:

```text
12 cases of Tonic Water arrived at Dry Store.
```

Choose one or more products, destination location, amount received, and reason.

### Use Stock

Use this when stock leaves a location.

Examples:

- sold
- used during service
- used during prep
- wasted
- broken

Choose one or more products, source location, amount used, and reason.

### Move Stock

Use this when stock moves from one location to another.

Example:

```text
8 bottles of Juniper Gin moved from Dry Store to Main Bar.
```

Choose one or more products, then choose:

- `Move From`
- `Move To`
- amount moved
- reason

The source and destination must be different.

### Correct Count

Use this when a hand count does not match the system count.

Choose one or more products and the count location. Enter the number you physically counted. StockLedger shows the current calculated count and creates the correction amount for each selected product.

This does not overwrite history. It adds a new correction movement.

### Undo Record

Use this when one previous movement was wrong.

Choose the original movement. StockLedger creates a new reversing movement.

The original record is not deleted.

### Enroll New Product

Use this when a product should be added to the catalog.

Enter the product name, category, unit, low-stock threshold, and reason.

After saving, the product appears locally and the enrollment waits in `Work to Send`.

### Suspend Product

Use this when a product should stop appearing in normal stock actions.

If the product still has stock, StockLedger prepares closure work so the remaining balance is closed through audit-visible records.

You can select more than one product. Suspension work waits in `Work to Send` until it is sent.

### Reactivate Product

Use this when a suspended product should be selectable again.

You can select more than one suspended product. Reactivation does not create stock movement. It only returns the product to active use.

## 11. Work to Send

`Work to Send` is the local queue of saved work that has not been sent yet.

Each review card shows the operator fields first:

- sequence number
- action
- product or source label
- location
- amount
- `Undo`

Technical fields are hidden under `Technical details`:

- batch or idempotency detail
- validation status
- event count
- source detail when available

Valid cards do not show a `Ready` badge on the main card. If a row is not valid, the validation problem is shown on the card.

Grouped work stays grouped. For example, suspending a product with stock can show `Grouped work: 3 events`.

## 12. Send Saved Work

To send saved work:

1. Open `Stock Actions`.
2. Review `Work to Send`.
3. Open the account menu.
4. Switch to `Online`.
5. Click `Send Saved Work`.

If sending works, the prototype adds the work to the synced ledger and clears `Work to Send`.

If sending fails, read the message on screen. Fix or remove the invalid unsent item, then send again.

Duplicate movements are ignored safely by the simulated sync engine.

## 13. Offline Work

The prototype starts in `Offline` mode.

When offline:

- new work is saved in this browser
- work waits in `Work to Send`
- local stock includes saved stock movements
- nothing is sent to the simulated server ledger

When online:

- `Send Saved Work` can send the waiting batch
- the whole batch succeeds or fails together
- duplicate work is handled by idempotency checks

## 14. Clients

Use `Clients` for customers or buyers, not StockLedger tenant administration.

The Clients page uses a table-first layout with segment tabs, client search, and menu filtering. Click a client row to open full details on the right side of the table.

The table shows:

- segment
- default menu
- order pattern
- next order
- fulfilled local sales count

The detail panel shows the selected client's menu items, delivery window, sales count, and private contact block. Private contact details are hidden in `Private contact`; reveal them only for roles that need customer contact information.

Use `Fulfill Sale` from the detail panel when you want to start a sale using that client's default menu.

## 15. Suppliers

Use `Suppliers` for purchasing relationships and receiving follow-up.

The Suppliers page uses a table-first layout with status tabs, supplier search, and a product filter. Click a supplier row to open full details on the right side of the table.

The table shows:

- reliability
- delivery cadence
- last delivery
- received count
- variance count

The detail panel shows supplied products, stock-in event count, variance cases, and sensitive terms. Commercial terms are hidden under `Sensitive terms`.

Use `Receive Purchase` from the detail panel when a delivery should become stock-in work.

## 16. Menus

Use `Menus` to connect sellable items to stock products.

The Menus page uses a filtered table with status/cadence tabs, search, and client filtering. Click a menu row to open its full details on the right side of the table.

The table shows:

- client menu name
- client
- menu status
- recurring or seasonal cadence
- recipe lines

The detail panel shows menu items, recipe lines, fulfillment locations, and technical IDs. Menu setup does not move stock. A fulfilled menu sale creates grouped `STOCK_OUT` events from the recipe lines.

Use `Fulfill Sale` from the detail panel to open a sale already prepared with the selected menu.

## 17. Products

Use `Products` to review the catalog.

The Products page uses one filtered catalog table. Use the status tabs, search, and category filter to narrow the list.

The table shows:

- product category
- unit
- low-stock threshold
- lifecycle status
- last lifecycle change

Create, suspend, and reactivate products from `Stock Actions`. Product changes use the same queue and sync rules as stock movements.

## 18. Locations

Use `Locations` to review storage, service, and prep areas.

The Locations page uses a filtered table. Click `Add Location` to register a new storage, service, prep, or delivery place for future stock movements. Click a location row to open replayed balances on the right side of the table.

The table shows:

- location kind
- owner
- status
- stocked rows
- review count

The detail panel shows balances by product, technical location details, and bottom actions for stock view or stock action. Detailed movement history belongs in `Audit Trail`.

Location stock is still replayed from events. Locations do not store final stock totals directly.

## 19. Reports

Use `Reports` when you need a decision-focused view instead of a raw event list.

Reports use compact summary tables for:

- `Stock Health`
- `Sales by Client`
- `Receiving by Supplier`
- `Stock Movement Mix`
- `Export Boundary`

Reports avoid private contact details and supplier terms by default.

Before exporting final reports in production, the system should require role checks, a reason, device/user audit logging, and scoped filters.

## 20. Audit Trail

Use `Audit Trail` when a stock number needs explaining.

Use the filter tabs, search bar, and product filter to narrow the trail before opening a record.

The audit view uses a row-detail layout. The table shows:

- action type
- product
- source document such as sale, purchase, menu sale, manual action, or correction
- quantity change

Click a row to open full details on the right side. The detail panel shows location, new balance, source, actor, reason, device, batch, and idempotency details.

Batch IDs and validation internals stay hidden in `Technical details`.

If a movement was wrong, choose `Prepare undo record` from the detail panel. This opens `Stock Actions` with `Undo Record` selected. Review the reversal and write a reason before saving it.

## 21. Users & Roles

Use `Users & Roles` to review access, not to edit historical records.

The page uses a staff table with status tabs, search, and role filtering. It also shows support tables for:

- staff access table
- role matrix
- device trust

Click a staff row to open access scope, role permissions, sensitive-view count, and private staff details on the right side of the table. Private staff details are hidden by default. Role changes, invite changes, and device trust changes should create audit records in production.

## 22. Settings

Use `Settings` for tenant-level defaults and operational policies.

The page shows:

- tenant defaults
- numbering rules
- CI lanes
- privacy guardrails
- pipeline strategy

Settings should not rewrite historical events. If a default changes, future work can use the new default, but old records remain explainable from the event history.

## 23. Good Reasons to Write

Reasons should be short and clear.

Good examples:

```text
Supplier delivery accepted
Evening service use
Moved to Main Bar for opening
Physical count difference
Wrong product selected
Seasonal product suspended
Sunfold menu sale fulfilled
Coastal delivery received
```

Avoid vague reasons:

```text
ok
done
adjusted
fixed
```

## 24. If You Make a Mistake

Do not delete history.

Use one of these:

- `Undo Record` if one old movement was wrong.
- `Correct Count` if the current stock does not match a hand count.
- Remove the item from `Work to Send` if it has not been sent yet.

This keeps the audit trail honest.

## 25. Daily Work Pattern

Use this simple order:

1. Open `Home`.
2. Check `Waiting to Send`.
3. Open `Sales` for client orders that need fulfillment.
4. Open `Purchases` for deliveries that arrived.
5. Open `Stock Overview` for replayed balances.
6. Open `Stock Actions` for manual stock work, product work, corrections, or sending.
7. Review `Work to Send`.
8. Switch to `Online`.
9. Click `Send Saved Work`.
10. Use `Reports` for summaries.
11. Use `Audit Trail` if a number needs explaining.

## 26. Troubleshooting

| Problem | What to do |
| --- | --- |
| `Send Saved Work` says you are offline | Open the account menu and switch to `Online` |
| A batch is rejected | Review `Work to Send`, fix or remove the invalid item, then send again |
| A product is missing from stock actions | Check `Products`; it may be inactive |
| A stock number looks wrong | Open `Audit Trail` and review the movement history |
| You entered the wrong movement | Use `Undo Record` after sync, or remove it from `Work to Send` before sync |
| A sale did not change stock | Confirm it was fulfilled, then check `Work to Send` |
| A purchase did not change stock | Confirm it was received, then check `Work to Send` |
| A client contact or supplier term is hidden | Open the matching details block only if your role needs it |
| You want the original sample data back | Use `Reset Demo` in the account menu |

## 27. Words Used in the System

| Word | Meaning |
| --- | --- |
| Movement | Something that happened to stock |
| Event | The saved record of a movement or product lifecycle action |
| Replay | Recalculating stock from event history |
| Work to Send | Work saved in this browser and waiting to send |
| Batch | A group of saved work sent together |
| Audit Trail | The history used to explain stock numbers |
| Correction | A new movement that fixes a count difference |
| Undo Record | A new movement that cancels an earlier mistake |
| Sale | A client-facing business record that can create stock-out events when fulfilled |
| Purchase | A supplier-facing business record that can create stock-in events when received |
| Menu | A sellable client item or bundle mapped to stock-product recipe lines |
| Client | A customer or buyer |
| Tenant | The StockLedger subscriber/business using the system |
| Idempotency | A duplicate-safety check that prevents the same work from being processed twice |

## 28. Prototype Boundary

This local prototype is for testing the StockLedger workflow.

It does prove:

- inventory writes are events
- stock is calculated from replay
- offline work can wait in a local queue
- sync can reject a whole invalid batch
- duplicate sends can be handled safely
- mistakes are fixed with new records
- sales can create stock-out work
- purchases can create stock-in work
- menu sales can create grouped stock work
- reports and audit views can link stock changes back to business source records
- sensitive contact, staff, and supplier details can stay hidden by default

It does not yet include:

- real NestJS API endpoints
- PostgreSQL master and tenant databases
- Prisma migrations
- real authentication or RBAC enforcement
- Electron SQLite storage
- production tenant isolation
- production report exports

## 29. Remember

- Record what happened.
- Do not overwrite final stock.
- Fulfill sales only when they should deduct stock.
- Receive purchases only when stock actually arrived.
- Review `Work to Send` before sending.
- Send work when online.
- Fix mistakes with a new movement.
- Use `Reports` for summaries.
- Use `Audit Trail` when a number needs explaining.
