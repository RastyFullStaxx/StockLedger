# StockLedger System Overview

## 1. System Definition

StockLedger is a distributed, event-sourced inventory ledger system designed for bar, kitchen, and supply chain environments requiring strict auditability, offline functionality, and multi-tenant isolation.

It is not a traditional inventory application.

It is a **transactional ledger system** where every inventory change is recorded as an immutable event, and all stock states are derived from historical events.

---

## 2. Core Problem Being Solved

Traditional inventory systems fail in real-world bar and kitchen environments due to:

- Manual stock adjustments without traceability
- Excel-based tracking inconsistencies
- Lack of offline functionality during operations
- Data mismatch between physical and system inventory
- Poor multi-location reconciliation
- Weak audit capability for shrinkage and loss

StockLedger is designed to eliminate these failures by enforcing:

- Immutable transaction history
- Deterministic stock computation
- Offline-first operation
- Full audit reconstruction capability

---

## 3. Operational Context (Real-World Use Case)

StockLedger is designed for environments such as:

- Bars
- Restaurants (kitchen + storage + service areas)
- Supply rooms
- Multi-location inventory operations

These environments share common constraints:

- High transaction frequency
- Limited time for manual input
- Occasional offline conditions
- Need for fast reconciliation
- High importance of shrinkage tracking

---

## 4. Fundamental System Philosophy

StockLedger is built on four foundational principles:

### 4.1 Event-Driven Truth
Every inventory change is represented as an immutable event.

No direct modification of stock is allowed.

---

### 4.2 State is Derived, Not Stored
Stock values are never stored directly.

Instead, system state is computed by replaying events.

---

### 4.3 Offline-First Operation
The system must function fully without internet connectivity.

All user actions are recorded locally first, then synchronized.

---

### 4.4 Deterministic Reconciliation
Given the same event history, the system must always produce identical results.

---

## 5. Core Data Philosophy

### 5.1 Inventory is a Ledger

Inventory is not a table of quantities.

It is a chronological sequence of events:

- STOCK_IN (incoming stock)
- STOCK_OUT (consumption / sale / usage)
- STOCK_TRANSFER (movement between locations)
- STOCK_ADJUSTMENT (correction with reason)
- STOCK_REVERT (compensating correction event)

---

### 5.2 Locations Are Not Containers

Locations (e.g., bar, kitchen, storage) are not independent inventories.

They are attributes attached to events.

Stock is derived by filtering events per location.

---

### 5.3 No Deletion or Editing of History

Once an event is created:

- It cannot be modified
- It cannot be deleted

Corrections are represented as new compensating events only.

---

## 6. Multi-Tenant Model

StockLedger is a multi-tenant system.

Each client:

- Has a completely isolated database
- Has no access to other client data
- Operates independently in terms of inventory history and audit logs

A master system manages:

- client registry
- authentication
- database routing configuration

---

## 7. Device and Offline Model

StockLedger operates under a distributed device model.

Each device:

- Can operate offline
- Maintains a local event queue
- Generates inventory events independently
- Syncs when connectivity is available

Device characteristics:

- Login-based authentication
- Optional “trusted device” persistence
- Local event storage (SQLite / IndexedDB)

---

## 8. Synchronization Model

The system uses a strict synchronization model:

### 8.1 Outbox Pattern
All events are stored locally first in an outbox queue.

---

### 8.2 Atomic Batch Sync
Events are synced to the server in batches.

Rules:

- Entire batch must succeed or fail
- No partial commits allowed
- No silent failures

---

### 8.3 Idempotency
Each event must include a unique identifier to prevent duplication.

Server must safely ignore repeated events.

---

### 8.4 Server Authority
Server is the final authority for validation and persistence.

---

## 9. Conflict Resolution Model

StockLedger does not perform manual conflict resolution on stock values.

Instead:

- All events are stored
- Events are replayed in deterministic order
- Final state is always derived from event history

If inconsistencies arise, they are resolved naturally through replay, not mutation.

---

## 10. Inventory Computation Model

Stock is computed using event aggregation:

- Sum of STOCK_IN increases stock
- STOCK_OUT decreases stock
- STOCK_TRANSFER moves stock between locations
- ADJUSTMENT modifies balance via compensating event

There is no stored “current stock” value in the system.

---

## 11. Audit Requirements

StockLedger is designed for full forensic traceability.

Every event contains:

- user identity
- device identity
- timestamp
- event type
- quantity change
- location context

This allows:

- full reconstruction of inventory history
- shrinkage analysis
- discrepancy detection
- accountability tracking

---

## 12. Security Principles

The system enforces:

- strict tenant isolation
- role-based access control
- encrypted sensitive data at rest
- secure authenticated API communication
- device-level tracking for audit integrity

Roles include:

- GLOBAL_ADMIN (system owner level access)
- CLIENT_ADMIN (per-client administration)
- STAFF (operational users)

---

## 13. System Boundaries

StockLedger explicitly does NOT include:

- real-time POS system replacement
- accounting ledger replacement
- financial bookkeeping system

It is strictly an inventory event ledger system.

---

## 14. Expected System Behavior

The system must guarantee:

- consistent stock computation across devices
- offline operation without data loss
- reliable synchronization after reconnection
- deterministic reconstruction of all inventory states
- complete audit traceability at all times

---

## 15. Summary

StockLedger is a distributed, offline-first, event-sourced inventory ledger system where:

- all inventory changes are immutable events
- stock is always derived from history
- multiple devices can operate independently
- synchronization is atomic and idempotent
- multi-tenant isolation ensures client data separation
- full audit reconstruction is always possible

This system prioritizes correctness, traceability, and consistency over convenience.