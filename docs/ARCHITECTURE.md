# ARCHITECTURE.md

## 1. Overview

StockLedger is a distributed, event-sourced, multi-tenant inventory ledger system designed for offline-first operation, strict auditability, and deterministic state reconstruction.

This document defines the complete system architecture and component relationships.

---

## 2. System Architecture Type

The system follows a:

### Event-Sourced Distributed Ledger Architecture

Key characteristics:
- Event-driven state model
- Offline-first client nodes
- Centralized validation and persistence
- Multi-tenant database isolation
- Deterministic event replay engine

---

## 3. High-Level Architecture

```
                ┌────────────────────────────┐
                │     GLOBAL ADMIN PANEL     │
                │   (System Operators Only)  │
                └────────────┬───────────────┘
                             │
                     Master Database
                 (Client Registry + Auth)
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
 ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
 │  CLIENT A DB   │   │  CLIENT B DB   │   │  CLIENT C DB   │
 │ PostgreSQL     │   │ PostgreSQL     │   │ PostgreSQL     │
 │ Event Ledger   │   │ Event Ledger   │   │ Event Ledger   │
 └──────┬────────┘   └──────┬────────┘   └──────┬────────┘
        │                   │                   │
        └──────────┬────────┴────────┬─────────┘
                   │                 │
        ┌─────────────────────────────────────┐
        │         NESTJS BACKEND API          │
        │  - Event ingestion                 │
        │  - Validation engine               │
        │  - Sync processing                 │
        │  - Auth + tenant routing           │
        └─────────────────────────────────────┘
                   │
        ┌─────────────────────────────────────┐
        │     CLIENT APPLICATION LAYER        │
        │  - Electron Desktop App            │
        │  - React Native Mobile App         │
        │  - Optional PWA                    │
        └─────────────────────────────────────┘
                   │
        ┌─────────────────────────────────────┐
        │        OFFLINE STORAGE LAYER        │
        │  - SQLite (Electron)                │
        │  - IndexedDB (Web fallback)         │
        │  - Local Outbox Queue               │
        └─────────────────────────────────────┘
```

---

## 4. Core Architectural Layers

---

### 4.1 Client Layer

Responsible for:
- User interaction
- Event creation
- Offline storage
- Outbox queue management

Platforms:
- Electron (primary)
- Mobile (future React Native)

Key principle:
> Clients never modify stock directly. They only generate events.

---

### 4.2 Offline Layer

Responsible for:
- Persistent event storage
- Queueing unsynced events
- Handling network interruptions

Storage:
- SQLite (desktop)
- IndexedDB (web fallback)

---

### 4.3 Sync Layer

Responsible for:
- Batch transmission of events
- Idempotency enforcement
- Retry handling
- Failure recovery

Behavior:
- Strict atomic batch sync
- No partial commits
- Safe retry at all times

---

### 4.4 Backend Layer

Built with NestJS.

Responsibilities:
- Event validation
- Authentication
- Tenant routing
- Database writes
- Audit logging

Core rule:
> Backend is the only system allowed to persist events to permanent storage.

---

### 4.5 Data Layer

PostgreSQL-based per-client isolation:

- Each client has a dedicated database
- Contains full event ledger
- No shared tables between clients

Master database:
- client registry
- authentication data
- system metadata

---

## 5. Multi-Tenant Architecture

### Model

StockLedger uses database-per-tenant isolation.

Each client has:
- isolated PostgreSQL database
- independent event history
- independent audit logs

### Routing Flow

1. User authenticates
2. System identifies client_id
3. Backend selects correct database connection
4. All queries execute within tenant context

---

## 6. Event-Driven Core

System state is NOT stored.

Instead:

- All inventory actions are stored as events
- Events are replayed to reconstruct state
- Deterministic ordering ensures consistency

---

## 7. Sync Architecture

### Model
Outbox-based atomic batch sync.

### Flow
1. Client generates event
2. Event stored locally
3. Event queued in outbox
4. Batch sent when online
5. Server validates and stores
6. Event committed atomically

---

## 8. Deterministic Reconciliation Engine

Stock is computed by:

- retrieving all events
- sorting deterministically
- applying sequential transformations
- producing final inventory state

Guarantee:
> Same events always produce same result

---

## 9. Location System

Locations are NOT stock containers.

They are event attributes used for filtering:

Examples:
- Bar
- Kitchen
- Storage

Stock is computed per location via event filtering.

---

## 10. Security Architecture

- Role-based access control (RBAC)
- Tenant isolation enforced at database level
- Device-level authentication support
- Encrypted credentials at rest
- HTTPS required for all sync communication

Roles:
- GLOBAL_ADMIN
- CLIENT_ADMIN
- STAFF

---

## 11. Failure Isolation Strategy

System is designed to prevent:

- cross-tenant data leaks
- sync corruption
- partial transaction commits
- offline data loss

All failures resolve through:
- batch rejection
- retry mechanism
- deterministic replay

---

## 12. System Constraints

The system explicitly prohibits:

- direct stock updates
- deletion of historical events
- partial sync commits
- cross-tenant queries

---

## 13. Design Philosophy

StockLedger prioritizes:

1. Correctness over speed
2. Auditability over simplicity
3. Determinism over flexibility
4. Offline resilience over real-time assumptions

---

## 14. Summary

StockLedger is a distributed event-sourced inventory ledger system with:

- immutable event storage
- offline-first clients
- strict multi-tenant isolation
- deterministic reconciliation
- atomic sync guarantees

It is designed for environments requiring audit-grade inventory accuracy under unreliable connectivity conditions.
