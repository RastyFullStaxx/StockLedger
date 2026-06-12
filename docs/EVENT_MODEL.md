# EVENT_MODEL.md

## 1. Overview

This document defines the canonical event model for StockLedger.

All inventory operations in the system are represented as immutable events. These events form the single source of truth for all stock computation, reconciliation, and audit processes.

---

## 2. Core Principle

StockLedger does NOT store inventory quantities.

Instead, it stores a chronological sequence of events. Stock is derived by replaying these events deterministically.

---

## 3. Event System Design

Every change in inventory is an event.

Events are:
- Immutable
- Append-only
- Replayable
- Idempotent-safe
- Order-resolved via deterministic rules

---

## 4. Event Categories

### 4.1 STOCK_IN
Represents incoming inventory into the system.

Examples:
- Supplier delivery
- Restock
- Initial stock entry

Effect:
- Increases stock at a location

---

### 4.2 STOCK_OUT
Represents inventory leaving the system.

Examples:
- Sales
- Usage
- Consumption
- Waste (if categorized as outflow)

Effect:
- Decreases stock at a location

---

### 4.3 STOCK_TRANSFER
Represents movement between locations.

Examples:
- Storage → Bar
- Bar → Kitchen

Effect:
- Decrease from source location
- Increase at destination location

---

### 4.4 STOCK_ADJUSTMENT
Represents corrections due to discrepancies.

Examples:
- Physical count mismatch
- Shrinkage correction
- Audit correction

Effect:
- Adjusts computed stock via explicit correction event

Important:
This does NOT modify previous events. It adds a new compensating event.

---

### 4.5 STOCK_REVERT (Compensating Event)
Represents reversal of a previous incorrect action.

Rules:
- Must reference original event_id
- Does not delete original event
- Adds inverse correction event

---

## 5. Event Structure (Canonical Schema)

Every event MUST contain the following fields:

```json
{
  "event_id": "uuid",
  "client_id": "uuid",
  "device_id": "uuid",
  "user_id": "uuid",

  "type": "STOCK_OUT",

  "product_id": "uuid",

  "from_location": "string | null",
  "to_location": "string | null",

  "quantity": "number",

  "timestamp": "unix_epoch",
  "sequence_number": "number",

  "idempotency_key": "uuid",
  "sync_batch_id": "uuid"
}
```

---

## 6. Event Rules

### 6.1 Immutability Rule
Once created, an event cannot be:
- edited
- deleted
- overwritten

Only compensating events are allowed.

---

### 6.2 Idempotency Rule
Each event must have a unique idempotency_key.

If the same event is received multiple times:
- It must be ignored safely
- It must NOT create duplicates

---

### 6.3 Ordering Rule
Events are ordered using:

1. server timestamp (primary)
2. sequence_number (device-level ordering)
3. fallback timestamp

This ensures deterministic replay.

---

### 6.4 Atomic Batch Rule
Events are synced in batches.

Rule:
- Entire batch must succeed or fail
- No partial commits allowed

---

## 7. Event Replay Engine

Stock is calculated using deterministic replay:

### Algorithm:

For each product and location:

1. Load all events
2. Sort events by ordering rules
3. Apply sequential transformations:
   - STOCK_IN → +quantity
   - STOCK_OUT → -quantity
   - TRANSFER → move between locations
   - ADJUSTMENT → apply delta
   - REVERT → apply inverse event

---

## 8. Location Model

Locations are NOT storage entities.

They are event attributes used for filtering:

- Bar
- Kitchen
- Storage
- Supply Room

Stock is computed per location via filtered event replay.

---

## 9. Conflict Handling Model

StockLedger does NOT resolve conflicts manually.

Instead:
- All valid events are stored
- Replay determines final state
- Determinism guarantees consistency

---

## 10. Integrity Guarantees

If implemented correctly, the system guarantees:

- No duplicate transactions
- No lost transactions (offline-safe)
- No silent corruption
- Full audit reconstruction
- Deterministic stock computation

---

## 11. System Role of Events

Events are not logs.

They ARE the system state.

Everything else is derived from them.
