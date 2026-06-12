# OFFLINE_ARCHITECTURE.md

## 1. Overview

This document defines the offline-first architecture of StockLedger.

The system is designed to operate fully without internet connectivity while maintaining eventual consistency through deterministic synchronization.

---

## 2. Core Principle

Offline mode is not a fallback.

It is a primary operating mode.

All client applications must function fully without network dependency.

---

## 3. Offline System Design

Each client device operates as an independent event generator node.

Responsibilities:
- capture inventory events locally
- store events persistently
- queue events for synchronization
- recover from crashes without data loss

---

## 4. Offline Storage Layer

### 4.1 Electron (Desktop)

Uses:
- SQLite local database
- persistent event store
- outbox queue table

Tables:
- local_events
- outbox_queue
- sync_state

---

### 4.2 Mobile (Future React Native)

Uses:
- SQLite OR MMKV storage
- local event queue
- cached state snapshots

---

### 4.3 Web (Fallback PWA)

Uses:
- IndexedDB
- service worker caching
- in-memory event queue backup

---

## 5. Local Event Queue (Outbox Model)

All operations are first stored locally:

### Flow:

1. User performs action
2. Event is created
3. Event stored in local_events
4. Event added to outbox_queue
5. Sync engine processes queue when online

---

## 6. Offline Event Lifecycle

### Step 1: Event Creation
Event is generated with:
- event_id
- device_id
- timestamp
- sequence_number

---

### Step 2: Local Persistence
Event is immediately stored in SQLite or IndexedDB.

No network dependency exists at this stage.

---

### Step 3: Queueing
Event is added to outbox queue for future sync.

---

### Step 4: Sync Trigger
Sync is triggered when:
- network becomes available
- app is launched online
- periodic sync timer runs

---

## 7. Crash Recovery Model

If a device crashes:

- SQLite state remains intact
- outbox queue is preserved
- unsynced events remain in queue
- sync resumes automatically on restart

Guarantee:
> No event is ever lost due to crash or shutdown

---

## 8. Offline Consistency Rules

- Events must be appended only
- No modification of local events after creation
- Sequence numbers are device-local only
- Server resolves final ordering

---

## 9. Conflict Prevention Strategy

Conflicts are not resolved locally.

Instead:

- all conflicts are deferred to server
- server applies deterministic replay rules
- client never overrides history

---

## 10. Sync Integration Layer

Offline system connects to sync engine via:

- batch submission API
- idempotency keys
- atomic transaction validation

Rules:
- full batch retry required on failure
- no partial sync allowed

---

## 11. Data Integrity Guarantees

Offline layer guarantees:

- zero data loss
- persistent queue storage
- deterministic sync recovery
- crash-safe event persistence

---

## 12. Device Identity Model

Each device is assigned:

- device_id (UUID)
- optional trust flag
- persistent session binding

Device is treated as:
> a trusted event generator node

---

## 13. Performance Considerations

Offline layer is optimized for:

- fast local writes
- minimal sync overhead
- batch processing of events
- low memory footprint

---

## 14. System Constraints

Offline system must:

- never depend on network availability
- never delete local events before sync confirmation
- never reorder event queue locally
- never modify historical events

---

## 15. Summary

Offline architecture ensures StockLedger can operate as a fully independent system per device while maintaining eventual consistency with the central ledger through deterministic batch synchronization.
