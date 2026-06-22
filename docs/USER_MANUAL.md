# StockLedger User Manual

This manual explains how to use the local StockLedger prototype.

StockLedger records inventory as a history of movements. You do not type the final stock number. You record what happened, and StockLedger calculates stock from those records.

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

## 3. First Things to Check

Start on `Home` or `Stock Overview`.

Check these items first:

1. `Waiting to Send`
2. `Low Stock`
3. `Total Stock`
4. `By Location`
5. `Audit`

Use the `Guide` button in the top bar when you need a short hint for the current screen.

## 4. Navigation

The left sidebar opens the main screens:

| Screen | Use it for |
| --- | --- |
| `Home` | Quick start, recent activity, and shortcuts |
| `Stock Overview` | Current calculated stock totals |
| `Stock Actions` | Prepare stock work, product work, and send saved work |
| `Products` | Review active and inactive products |
| `Audit` | Check history and explain stock numbers |

The top account menu shows whether the prototype is `Online` or `Offline`.

The account menu also includes `Reset Demo`. This returns the prototype to the original sample data and removes local demo changes.

## 5. Home

Use `Home` when you want the fastest path into the prototype.

It shows:

- current stock status
- recent movements
- a shortcut to `Stock Actions`
- a shortcut to `Stock Overview`
- a shortcut to `Audit`
- a shortcut to `Products`

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

## 7. Stock Actions

Use `Stock Actions` to prepare work.

The left side is the action form. The right side is `Work to Send`.

Choose an action type, fill in the required fields, write a reason, then click `Save Action`.

Saved work stays in `Work to Send` until you send it.

Important: saved work is sent as one batch. If one saved item has a validation problem, the whole batch is rejected so the history stays consistent.

## 8. Action Types

### Stock In

Use this when stock arrives at a location.

Example:

```text
12 cases of Tonic Water arrived at Dry Store.
```

Choose the product, destination location, amount received, and reason.

### Use Stock

Use this when stock leaves a location.

Examples:

- sold
- used during service
- used during prep
- wasted
- broken

Choose the product, source location, amount used, and reason.

### Move Stock

Use this when stock moves from one location to another.

Example:

```text
8 bottles of Juniper Gin moved from Dry Store to Main Bar.
```

Choose:

- `Move From`
- `Move To`
- amount moved
- reason

The source and destination must be different.

### Correct Stock Count

Use this when a hand count does not match the system count.

Choose the product and count location. Enter the number you physically counted. StockLedger shows the current calculated count and creates the correction amount.

This does not overwrite history. It adds a new correction movement.

### Reverse a Record

Use this when one previous movement was wrong.

Choose the original movement. StockLedger creates a new reversing movement.

The original record is not deleted.

### Enroll Product

Use this when a product should be added to the catalog.

Enter the product name, category, unit, low-stock threshold, and reason.

After saving, the product appears locally and the enrollment waits in `Work to Send`.

### Suspend Product

Use this when a product should stop appearing in normal stock actions.

If the product still has stock, StockLedger prepares closure work so the remaining balance is closed through audit-visible records.

Suspension work waits in `Work to Send` until it is sent.

### Reactivate Product

Use this when a suspended product should be selectable again.

Reactivation does not create stock movement. It only returns the product to active use.

## 9. Work to Send

`Work to Send` is the local queue of saved work that has not been sent yet.

Each saved item shows its action, product, location, quantity, and validation status.

You can remove an unsent item from `Work to Send`.

After work has been sent, do not delete or edit it. Use `Reverse a Record` or `Correct Stock Count`.

## 10. Send Saved Work

To send saved work:

1. Open `Stock Actions`.
2. Review `Work to Send`.
3. Open the account menu.
4. Switch to `Online`.
5. Click `Send Saved Work`.

If sending works, the prototype adds the work to the synced ledger and clears `Work to Send`.

If sending fails, read the message on screen. Fix or remove the invalid unsent item, then send again.

Duplicate movements are ignored safely by the simulated sync engine.

## 11. Offline Work

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

## 12. Products

Use `Products` to review the catalog.

The screen has:

- `Active Products`
- `Inactive Products`
- product category
- unit
- low-stock threshold
- lifecycle status

Create, suspend, and reactivate products from `Stock Actions`. Product changes use the same queue and sync rules as stock movements.

## 13. Audit

Use `Audit` when a stock number needs explaining.

The audit table shows:

- action type
- product
- location
- quantity change
- new balance
- person
- device
- batch reference
- reason

If a movement was wrong, choose `Prepare reverse record` from the audit row. This opens `Stock Actions` with `Reverse a Record` selected. Review the reversal and write a reason before saving it.

## 14. Good Reasons to Write

Reasons should be short and clear.

Good examples:

```text
Supplier delivery accepted
Evening service use
Moved to Main Bar for opening
Physical count difference
Wrong product selected
Seasonal product suspended
```

Avoid vague reasons:

```text
ok
done
adjusted
fixed
```

## 15. If You Make a Mistake

Do not delete history.

Use one of these:

- `Reverse a Record` if one old movement was wrong.
- `Correct Stock Count` if the current stock does not match a hand count.
- Remove the item from `Work to Send` if it has not been sent yet.

This keeps the audit trail honest.

## 16. Daily Work Pattern

Use this simple order:

1. Open `Home`.
2. Check `Waiting to Send`.
3. Open `Stock Overview`.
4. Check `Total Stock` or `By Location`.
5. Open `Stock Actions`.
6. Prepare stock or product work.
7. Review `Work to Send`.
8. Switch to `Online`.
9. Click `Send Saved Work`.
10. Use `Audit` if a number needs explaining.

## 17. Troubleshooting

| Problem | What to do |
| --- | --- |
| `Send Saved Work` says you are offline | Open the account menu and switch to `Online` |
| A batch is rejected | Review `Work to Send`, fix or remove the invalid item, then send again |
| A product is missing from stock actions | Check `Products`; it may be inactive |
| A stock number looks wrong | Open `Audit` and review the movement history |
| You entered the wrong movement | Use `Reverse a Record` after sync, or remove it from `Work to Send` before sync |
| You want the original sample data back | Use `Reset Demo` in the account menu |

## 18. Words Used in the System

| Word | Meaning |
| --- | --- |
| Movement | Something that happened to stock |
| Event | The saved record of a movement or product lifecycle action |
| Replay | Recalculating stock from event history |
| Work to Send | Work saved in this browser and waiting to send |
| Batch | A group of saved work sent together |
| Audit | The history used to explain stock numbers |
| Correction | A new movement that fixes a count difference |
| Reverse | A new movement that cancels an earlier mistake |
| Idempotency | A duplicate-safety check that prevents the same work from being processed twice |

## 19. Prototype Boundary

This local prototype is for testing the StockLedger workflow.

It does prove:

- inventory writes are events
- stock is calculated from replay
- offline work can wait in a local queue
- sync can reject a whole invalid batch
- duplicate sends can be handled safely
- mistakes are fixed with new records

It does not yet include:

- real NestJS API endpoints
- PostgreSQL master and tenant databases
- Prisma migrations
- real authentication or RBAC
- Electron SQLite storage
- production tenant isolation

## 20. Remember

- Record what happened.
- Do not overwrite final stock.
- Review `Work to Send` before sending.
- Send work when online.
- Fix mistakes with a new movement.
- Use `Audit` when a number needs explaining.
