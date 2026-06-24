# StockLedger

StockLedger is a distributed, event-sourced inventory ledger system designed for bar, kitchen, and supply chain environments requiring strict audit control, offline capability, and multi-tenant isolation

It is not a traditional inventory system. It is an immutable event ledger where all stock changes are derived from historical transactions

---

## Purpose

StockLedger solves core limitations of traditional inventory systems:

- Lack of audit-grade traceability
- Offline operation failures
- Inconsistent stock reconciliation across devices
- Weak multi-location tracking
- Manual inventory adjustments without accountability

This system ensures:
- Every change is recorded as an immutable event
- Stock is always derived, never manually stored
- Full history reconstruction is always possible

---

## Core Principles

- Fully immutable event ledger (no edits, no deletions)
- Event replay is the single source of truth
- Multi-tenant isolation (per-client databases)
- Offline-first operation (device-local event queue)
- Strict atomic batch synchronization
- Idempotent event processing
- Full audit traceability (user, device, timestamp)
- Deterministic reconciliation across all devices

---

## System Architecture (High-Level)

StockLedger consists of three main layers:

### 1. Backend Layer
- NestJS API server
- PostgreSQL master database (client registry)
- PostgreSQL per-client databases (tenant isolation)
- Event ingestion + validation engine

### 2. Client Applications
- Electron desktop application (primary)
- React Native mobile application (future)
- Optional PWA fallback interface

### 3. Offline Layer
- SQLite (Electron)
- IndexedDB (web fallback)
- Local outbox queue for pending sync events

---

## Data Philosophy

Stock is NOT stored.

All inventory values are computed using event replay:

Event examples:
- STOCK_IN
- STOCK_OUT
- STOCK_TRANSFER
- STOCK_ADJUSTMENT
- STOCK_REVERT (compensating event only)

Locations are not stock containers.
They are event attributes used for filtering and reporting.

---

## Sync Model

StockLedger uses an offline-first synchronization model:

### Flow
1. User performs an action
2. Event is stored locally (offline-safe)
3. Event is queued in an outbox
4. System sends atomic batch to backend when online
5. Server validates and stores events
6. Events are replayed to compute final state

### Rules
- Entire batch must succeed or fail (atomic sync)
- Idempotency prevents duplicate events
- Server is authoritative for validation
- Event replay determines final system state

---

## Multi-Tenant Design

Each client operates in complete isolation:

- One PostgreSQL database per client
- No cross-client data access
- Independent event histories
- Independent audit trails

A master database stores:
- client registry
- authentication metadata
- database routing configuration

---

## Security Model

- Role-based access control (RBAC)
  - GLOBAL_ADMIN (system owner)
  - CLIENT_ADMIN (client-level management)
  - STAFF (operational users)

- Device-based authentication (trusted devices supported)
- Full audit logging for all events
- Encrypted credentials at rest
- Strict tenant isolation enforcement

---

## Development Status

StockLedger is currently in architecture and system design phase.

Core components under development:
- Event model specification
- Sync engine design
- Database schema definition
- Offline-first client architecture

---

## Development Roadmap

### Phase 1 — Core Ledger
- Event schema implementation
- NestJS backend setup
- PostgreSQL tenant structure
- Basic event ingestion API

### Phase 2 — Sync Engine
- Offline queue system
- Atomic batch sync
- Idempotency handling

### Phase 3 — Inventory Engine
- Event replay computation
- Stock calculation per location
- Variance and reconciliation logic

### Phase 4 — Multi-Tenant System
- Client onboarding automation
- Database provisioning system
- Admin control panel

### Phase 5 — Client Applications
- Electron desktop application
- React Native mobile application
- Device management system

### Phase 6 — Enterprise Hardening
- Performance optimization
- Security enhancements
- Advanced audit tooling
- Scaling infrastructure

---

## Key Constraint

StockLedger is NOT a CRUD system.

It is an event-sourced ledger system where:
- history is immutable
- state is derived
- consistency is guaranteed through replay

---

## Documentation

Full system documentation is located in `/docs`:

- SYSTEM_OVERVIEW.md
- ARCHITECTURE.md
- EVENT_MODEL.md
- DATABASE_SCHEMA.md
- SYNC_ENGINE.md
- OFFLINE_ARCHITECTURE.md
- SECURITY_MODEL.md
- AUDIT_SYSTEM.md
- INVENTORY_LOGIC.md
- PHASES.md

---

## License

Private system. All rights reserved.
