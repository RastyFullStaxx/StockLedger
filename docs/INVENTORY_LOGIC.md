# INVENTORY_LOGIC.md

## 1. Overview

This document defines how StockLedger computes inventory state from immutable event data.

StockLedger does NOT store stock values.
All stock calculations are derived from event replay logic.

---

## 2. Core Principle

Inventory state is a function of time-ordered events:

> Stock = f(events)

There is no persistent quantity field representing final stock.

---

## 3. Stock Computation Model

Stock is computed by aggregating events per product and location.

### Event Impact Rules:

- STOCK_IN → increases stock
- STOCK_OUT → decreases stock
- STOCK_TRANSFER → moves stock between locations
- STOCK_ADJUSTMENT → applies delta correction
- STOCK_REVERT → inverse of original event

---

## 4. Formal Stock Equation

For a given product and location:

```
Stock(Location, Product) =
    Σ STOCK_IN
  - Σ STOCK_OUT
  + Σ STOCK_ADJUSTMENT
  + Σ STOCK_REVERT
  + Σ TRANSFER_IN
  - Σ TRANSFER_OUT
```

---

## 5. Variance Calculation (Excel Mapping)

StockLedger replaces Excel-based formulas:

### Traditional Excel Logic:
- Beginning Inventory
- Purchases
- Ending Inventory
- Usage = Beginning + Purchases - Ending

### StockLedger Equivalent:

- Beginning Inventory = derived snapshot at time T0
- Purchases = STOCK_IN
- Ending Inventory = computed from events
- Usage = STOCK_OUT + derived consumption events

---

## 6. Shrinkage Detection

Shrinkage is calculated as:

```
Shrinkage = Expected Stock - Actual Physical Count
```

Where:

- Expected Stock = event replay result
- Actual Stock = user-reported physical count

If mismatch exists:
- system generates STOCK_ADJUSTMENT event

---

## 7. Cost vs Selling Price Logic

StockLedger supports dual valuation:

### Cost Layer:
- Used for internal valuation
- Based on purchase cost per STOCK_IN event

### Selling Layer:
- Used for revenue estimation
- Based on product selling_price at time of STOCK_OUT

Important:
Selling price does NOT affect stock quantity.

---

## 8. Location-Based Logic

Each event includes location context.

### Rules:

- STOCK_IN → location is destination
- STOCK_OUT → location is source
- STOCK_TRANSFER → moves between locations

Stock per location is computed independently via filtered replay.

---

## 9. Transfer Logic

Transfers are NOT direct updates.

They are two linked events:

1. STOCK_TRANSFER_OUT (source location)
2. STOCK_TRANSFER_IN (destination location)

This ensures full traceability.

---

## 10. Negative Stock Handling

StockLedger allows configuration:

### Strict Mode (recommended):
- Prevent negative stock
- Reject STOCK_OUT if insufficient inventory

### Audit Mode:
- Allow negative stock
- Flag discrepancies for review

---

## 11. Reconciliation Model

Reconciliation compares:

- Expected stock (event replay)
- Physical count input

If mismatch:
- SYSTEM generates adjustment event
- NO direct overwrite allowed

---

## 12. Time-Based Stock Reconstruction

StockLedger supports historical reconstruction:

At any timestamp T:

```
Stock(T) = replay(events where timestamp <= T)
```

This enables:
- audit reporting
- historical inventory tracking
- discrepancy analysis over time

---

## 13. Performance Optimization Strategy

To improve replay performance:

- index events by product_id
- index events by timestamp
- cache periodic snapshots (future phase only)
- avoid storing computed stock permanently

---

## 14. System Guarantees

If implemented correctly:

- Stock is always reproducible
- No hidden state exists
- No manual stock corruption possible
- All changes are traceable
- Offline operations remain consistent after sync

---

## 15. Summary

StockLedger inventory logic is based on:

- event-driven computation
- deterministic replay
- immutable historical records
- strict separation of cost vs quantity
- audit-first design philosophy
