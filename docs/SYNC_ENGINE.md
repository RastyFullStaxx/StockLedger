# SYNC_ENGINE.md

## 1. Overview

The Sync Engine is responsible for synchronizing offline-generated inventory events from client devices to the central server in a safe, deterministic, and idempotent manner.

It ensures that StockLedger remains consistent across all devices even under unstable network conditions.

---

## 2. Core Principle

The Sync Engine follows these rules:

- Offline-first is mandatory
- Server is authoritative
- All sync operations are atomic
- Events are idempotent
- No partial state updates are allowed

---

## 3. Sync Model Type

StockLedger uses a:

### Outbox-Based Atomic Batch Sync System

All events are:
- stored locally first
- queued in an outbox
- sent to server in batches

---

## 4. Offline Event Flow

### Step 1: User Action
User performs inventory action (e.g., STOCK_OUT)

### Step 2: Local Persistence
Event is immediately stored in local database (SQLite / IndexedDB)

### Step 3: Outbox Queue
Event is appended to a local sync queue

### Step 4: Background Sync Trigger
When connectivity is available:
- events are grouped into batches
- batch is sent to server

---

## 5. Sync Request Structure

Each sync request contains:

- client_id
- device_id
- batch_id
- ordered list of events
- metadata (timestamps, version, checksum)

---

## 6. Atomic Batch Rule

### CRITICAL RULE

A sync batch must be treated as a single atomic transaction.

### Behavior:

- If ALL events in batch are valid → commit entire batch
- If ANY event fails → reject entire batch

No partial commits are allowed.

---

## 7. Idempotency System

Every event contains a unique:

- idempotency_key

### Server Behavior:

If an event with the same idempotency_key already exists:
- ignore duplicate
- do NOT reapply

This ensures safe retry behavior.

---

## 8. Retry Strategy

If sync fails:

### Client Behavior:
- retry entire batch
- do not modify event order
- preserve original idempotency keys

### Server Behavior:
- reject invalid batch
- provide error reason
- allow safe re-submission

---

## 9. Failure Handling Model

Failures are classified as:

### 9.1 Validation Failure
- invalid event structure
- invalid product reference
- invalid stock operation

Result:
→ entire batch rejected

---

### 9.2 Conflict Failure
- sequence mismatch
- duplicate detection
- invalid ordering

Result:
→ entire batch rejected

---

### 9.3 System Failure
- server downtime
- database failure

Result:
→ client retries later unchanged

---

## 10. Ordering Strategy

Events are not trusted in client-provided order.

Server enforces deterministic ordering using:

1. device sequence_number
2. server timestamp
3. fallback timestamp

This ensures replay consistency.

---

## 11. Server Processing Flow

When a batch is received:

### Step 1: Authenticate client + device
Verify:
- client_id validity
- device trust status

---

### Step 2: Validate batch structure
Check:
- schema validity
- required fields
- event integrity

---

### Step 3: Idempotency check
Filter out previously processed events

---

### Step 4: Transactional commit

Execute within database transaction:

- insert events into ledger
- update audit logs
- commit or rollback fully

---

## 12. Event Replay Guarantee

After sync:

The system guarantees that:

- replaying events produces identical stock state
- no duplication occurs
- no missing transactions exist

---

## 13. Offline Safety Guarantee

Even if a device is offline for extended periods:

- events remain locally stored
- no data loss occurs
- sync resumes safely when reconnected

---

## 14. Multi-Device Consistency

Multiple devices may generate events simultaneously.

Consistency is ensured by:

- event-based ordering
- server reconciliation
- deterministic replay engine

---

## 15. Sync Integrity Guarantees

If correctly implemented, the system guarantees:

- zero data loss
- zero duplicate events
- deterministic final state
- full audit traceability
- safe offline operation

---

## 16. System Role of Sync Engine

The Sync Engine is NOT a transport layer.

It is a:

> deterministic consistency enforcement system between distributed event sources and the central ledger.