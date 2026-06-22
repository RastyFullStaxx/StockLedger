# StockLedger — Development Tracker

Last updated: 2026-06-13

Owner: StockLedger implementation team

Purpose: This is the living control document for system readiness. Update it whenever a phase item is completed, a blocker is found, a release is pushed, or a planning assumption changes.

---

## How To Update This Tracker

### Status keys

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked or at-risk
- `[?]` Needs architecture or product decision

### Update rules

- Add a dated line to the Update Log for every meaningful change.
- Keep percentages conservative. A feature is not production-ready until it is validated, persisted, authorized, audited, tested, and hardened for the relevant environment.
- Separate "prototype works with mock data" from "safe for multi-tenant production."
- Do not mark any event replay computation complete until deterministic replay tests pass and snapshot caching is reviewed.
- Do not mark any sync batch endpoint production-ready while batches can commit partially or idempotency checks are missing.
- Do not mark any tenant-isolation boundary complete until cross-tenant data access tests pass.

---

## Executive Summary

Current overall assessment:

| Layer | Readiness |
|-------|-----------|
| Architecture documentation | 95% |
| Event model specification | 95% |
| Database schema design (master + tenant) | 90% |
| API specification | 90% |
| Sync engine design | 85% |
| Offline architecture design | 85% |
| Inventory logic specification | 90% |
| NestJS backend implementation | 0% |
| Prisma schema definitions | 0% |
| Prisma migrations | 0% |
| TypeScript type definitions | 0% |
| Auth module (JWT + RBAC) | 0% |
| API endpoint implementation | 0% |
| Sync engine implementation | 0% |
| Event replay engine | 0% |
| Multi-tenant provisioning | 0% |
| Electron desktop client | 0% |
| Design system / UI components | 0% |
| Offline SQLite storage | 0% |
| Production hardening | 0% |

Plain answer to the question "pwede na ba from event creation to stock query?":

Not yet. The system architecture, event model, database schema, API contract, sync design, offline architecture, and inventory logic are fully documented and internally consistent. No implementation code exists. The NestJS backend, Prisma schemas, TypeScript types, auth module, API endpoints, sync engine, event replay engine, client applications, and offline storage all need to be built from scratch. The architecture phase is complete; the implementation phase has not started.

---

## Evidence Consulted

Repository and docs reviewed:

- `README.md`
- `AGENTS.md`
- `opencode.json`
- `docs/SYSTEM_OVERVIEW.md`
- `docs/ARCHITECTURE.md`
- `docs/EVENT_MODEL.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/API_SPECIFICATION.md`
- `docs/SYNC_ENGINE.md`
- `docs/OFFLINE_ARCHITECTURE.md`
- `docs/INVENTORY_LOGIC.md`
- `docs/PRODUCT_EXPANSION_PLAN.md`
- `.agents/skills/data-privacy-pii-guardian/SKILL.md`
- `.agents/skills/design-taste-frontend/SKILL.md`
- `.agents/skills/frontend-design/SKILL.md`
- `.agents/skills/improve-codebase-architecture/SKILL.md`
- `.agents/skills/ui-ux-pro-max/SKILL.md`
- `.agents/skills/handoff/SKILL.md`

Verification run on 2026-06-13:

- `[x]` All 8 specification documents in `docs/` are internally consistent.
- `[x]` Event model (5 event types, canonical schema, immutability rules) is documented and matches the API specification.
- `[x]` Database schema (master + per-tenant) is documented with DDL, indexes, and behavior rules.
- `[x]` API specification defines 8 endpoints with request/response shapes and sync behavior rules.
- `[x]` Sync engine design covers outbox pattern, atomic batch, idempotency, retry, and ordering strategy.
- `[x]` Offline architecture covers SQLite/IndexedDB, outbox queue, crash recovery, and consistency rules.
- `[x]` Inventory logic covers stock equation, variance, shrinkage, transfer, negative stock, and point-in-time reconstruction.
- `[~]` Product expansion planning now covers sales, purchases, clients, suppliers, menus, reports, users, audit trail, and CI gate strategy.
- `[x]` All planned file paths in the tracker correspond to paths referenced in AGENTS.md.
- `[!]` No implementation code exists to run build, lint, or typecheck against.
- `[!]` No Prisma schema files exist in the `prisma/` directory.
- `[!]` No NestJS application scaffold exists under `src/`.

Current inventory:

- 0 NestJS module files.
- 0 controller files.
- 0 service files.
- 0 event handler files.
- 0 Prisma schema files.
- 0 TypeScript type definition files.
- 0 Electron application files.
- 0 React component files.
- 0 test files.
- 0 migration files.
- 8 architecture/specification documents.
- 1 AGENTS.md convention document.
- 1 development tracker (this file).

---

## Current Functional Map

### Functioning Now

- `[x]` System architecture documented (layers, components, data flow).
- `[x]` Event model specified (5 event types, canonical schema, immutability rules).
- `[x]` Database schema designed (master DB + per-tenant DB with DDL).
- `[x]` API specification defined (8 endpoints, request/response, error handling).
- `[x]` Sync engine designed (outbox pattern, atomic batch, idempotency, retry).
- `[x]` Offline architecture designed (SQLite, outbox queue, crash recovery).
- `[x]` Inventory logic specified (stock equation, variance, transfer, point-in-time).
- `[x]] StockLedger event-sourcing conventions documented (AGENTS.md).

### Partially Functioning

*(No implementation exists yet — all items below are spec/design only)*

- `[~]` Prisma schema definitions are specified in DATABASE_SCHEMA.md but not written as `.prisma` files.
- `[~]` TypeScript types are specified in AGENTS.md and EVENT_MODEL.md but not written as `.ts` files.
- `[~]` File paths for all layers are specified in AGENTS.md but directories under `src/` do not exist.

### Not Functioning Yet For Production

- `[ ]` NestJS backend project initialized.
- `[ ]` Prisma master schema (`prisma/master-schema.prisma`).
- `[ ]` Prisma tenant schema (`prisma/tenant-schema.prisma`).
- `[ ]` Prisma migrations run (master + tenant).
- `[ ]` TypeScript types: `EventType` enum, `InventoryEvent` interface, DTOs, auth types.
- `[ ]` JWT auth module (`src/auth/`).
- `[ ]` Login endpoint (`POST /api/auth/login`).
- `[ ]` RolesGuard and tenant-resolution middleware.
- `[ ]` `POST /api/sync/batch` endpoint.
- `[ ]` `GET /api/events` endpoint.
- `[ ]` `POST /api/products` and `GET /api/products` endpoints.
- `[ ]` `POST /api/locations` and `GET /api/locations` endpoints.
- `[ ]` `GET /api/stock` and `GET /api/stock/:productId` endpoints.
- `[ ]` Event validation service.
- `[ ]` Idempotency check service.
- `[ ]` Offline SQLite schema.
- `[ ]` Outbox queue service.
- `[ ]` Batch assembly and transmission.
- `[ ]` Server-side sync processing (atomic batch, conflict detection).
- `[ ]` Sync status indicator.
- `[ ]` Event replay engine.
- `[ ]` Stock computation (per product, per location, point-in-time).
- `[ ]` Variance detection and reconciliation.
- `[ ]` Snapshot caching.
- `[ ]` Client onboarding (tenant DB provisioning).
- `[ ]` Admin panel backend endpoints.
- `[ ]` Admin panel UI.
- `[ ]` Electron desktop client.
- `[ ]` Design system (CSS tokens, UI primitives, layout).
- `[ ]` All Electron screens (Login, Dashboard, Inventory, Events, etc.).
- `[ ]` Offline SQLite storage in Electron.
- `[ ]` Sync client service.
- `[ ]` Performance optimization (indexes, caching, rate limiting).
- `[ ]` Security hardening (payload encryption, sanitization, audit).
- `[ ]` Stress testing and penetration testing.

---

## End-To-End Readiness: Event Creation To Stock Query

| Stage | Current readiness | What works now | What blocks production |
|---|---|---|---|
| **Event creation** | 0% | Event model and validation rules are fully documented. | No client UI or API endpoint exists; no offline event creation flow. |
| **Local storage (offline)** | 0% | Offline architecture documented; SQLite schema designed. | No SQLite database initialized; no outbox queue implemented; no Electron app exists. |
| **Batch assembly** | 0% | Sync engine documented; batch structure defined in API spec. | No batch assembly logic; no `batch_id` generation; no sequence number assignment. |
| **Sync transmission** | 0% | Retry strategy and error handling documented. | No HTTP sync client; no exponential backoff; no batch rejection handler. |
| **Server validation** | 0% | Validation rules documented (required fields, idempotency). | No event validation service; no idempotency check; no NestJS endpoint. |
| **Event persistence** | 0% | Tenant database schema designed with DDL and indexes. | No Prisma tenant schema file; no migrations; no tenant DB connection factory. |
| **Event replay / stock computation** | 0% | Stock equation and inventory logic fully documented. | No replay engine; no stock computer; no point-in-time support. |
| **Stock query** | 0% | API contract defined for `GET /api/stock`. | No controller; no replay integration; no location filtering. |

Minimum "demo-ready" path today:

1. Read the architecture docs to understand the design.
2. Review the event model and API specification.
3. Review the database schema and sync engine design.
4. Review the inventory logic and stock equation.

Minimum "demo-ready with a running backend" path needed:

1. Initialize NestJS project with strict TypeScript.
2. Write Prisma schemas (master + tenant) and run migrations.
3. Define TypeScript types (EventType, InventoryEvent, DTOs).
4. Implement JWT auth module and login endpoint.
5. Implement `POST /api/sync/batch` as an event ingestion endpoint.
6. Implement event validation and idempotency checking.
7. Implement product and location CRUD endpoints.
8. Implement `GET /api/events` and `GET /api/stock` endpoints.

Minimum "production-ready with multi-tenant isolation" path still needed:

1. Real auth, RBAC, session controls, and tenant-isolation enforcement.
2. Prisma master + tenant schema implementation and migration.
3. Tenant DB connection factory with per-client pooling.
4. Atomic batch sync with full transactional commit.
5. Idempotency deduplication at the database level.
6. Event replay engine with deterministic ordering.
7. Stock computation with location filtering and point-in-time support.
8. Offline SQLite storage in Electron.
9. Sync client with retry, backoff, and status reporting.
10. Design system and UI components.
11. All Electron screens and workflows.
12. Admin panel for client onboarding and management.
13. Performance optimization, security hardening, and stress testing.

---

## Phase Plan

### Phase 0: Architecture & System Design

Current completion: **95%**

Goal: Define the complete StockLedger system architecture, event model, database schema, API contract, sync engine, offline architecture, and inventory logic before any implementation begins.

Phase 0 is nearly complete. All 8 specification documents have been written and reviewed for internal consistency. The event model, database schema, API contract, sync engine, offline architecture, and inventory logic are fully specified. This does not mean the system is production-ready; all implementation remains to be done.

#### What is already done

- `[x]` System architecture documented (layers, components, data flow).
- `[x]` Event model specified (5 event types, canonical schema, immutability rules).
- `[x]` Database schema designed (master DB + per-tenant DB with DDL).
- `[x]` API specification defined (8 endpoints, request/response, error handling).
- `[x]` Sync engine designed (outbox pattern, atomic batch, idempotency, retry).
- `[x]` Offline architecture designed (SQLite, outbox queue, crash recovery).
- `[x]` Inventory logic specified (stock equation, variance, transfer, point-in-time).
- `[x]` AGENTS.md convention document created (naming, imports, exports, testing strategy).
- `[x]` Development tracker created (this file).
- `[x]` All 8 specification documents cross-reviewed for consistency.
- `[x]` Skills directory set up for AI-assisted development.

#### Remaining checklist

- `[~]` Resolve any remaining ambiguity between event ordering rules in EVENT_MODEL.md (server timestamp primary) vs SYNC_ENGINE.md (sequence_number primary). **Decision needed in Phase 1.**
- `[ ]` `[?]` Confirm PostgreSQL version minimum for tenant DB features.
- `[ ]` `[?]` Confirm minimum Node.js version in `.nvmrc` or `engines` field.

#### Pre-mortem

- **Failure mode:** The team starts implementing before architectural decisions are fully settled, causing rewrites.
- **Early warning:** Implementation PRs contradict documented design decisions.
- **Prevention:** Complete Phase 0 review before beginning Phase 1 implementation.

---

### Phase 1 — Core Ledger (27 targets)

Current completion: **0%**

Goal: Build the NestJS backend with Prisma schemas, TypeScript types, JWT auth module, and all core API endpoints.

Phase 1 produces a running NestJS API server with PostgreSQL persistence, JWT authentication, and event ingestion capability. The system will accept events via `POST /api/sync/batch`, store them in tenant databases, and expose event history, product, and location CRUD. Stock is not yet computed — `GET /api/stock` is a placeholder until Phase 3.

#### What is already done

*(Implementation has not started. All Phase 1 targets are pending.)*

- `[x]` Architecture and design for all 27 targets is documented and ready to implement.
- `[x]` File paths and module structure for all 27 targets are pre-defined in AGENTS.md.

#### Remaining checklist

**1.1 Scaffold & Config (4 targets)**

- `[ ]` 1.1.1 Initialize NestJS project (`nest-cli.json`).
- `[ ]` 1.1.2 Configure strict TypeScript (`tsconfig.json`).
- `[ ]` 1.1.3 Set up ESLint + Prettier (`.eslintrc.js`, `.prettierrc`).
- `[ ]` 1.1.4 Configure environment loader (`.env.example`, `.env`).

**1.2 Prisma Schemas (8 targets)**

- `[ ]` 1.2.1 Define `clients` table (`prisma/master-schema.prisma`).
- `[ ]` 1.2.2 Define `users` table (`prisma/master-schema.prisma`).
- `[ ]` 1.2.3 Define `devices` table (`prisma/master-schema.prisma`).
- `[ ]` 1.2.4 Define `events` table (`prisma/tenant-schema.prisma`).
- `[ ]` 1.2.5 Define `products` table (`prisma/tenant-schema.prisma`).
- `[ ]` 1.2.6 Define `locations` table (`prisma/tenant-schema.prisma`).
- `[ ]` 1.2.7 Define `audit_logs` table (`prisma/tenant-schema.prisma`).
- `[ ]` 1.2.8 Run initial Prisma migrations (`prisma/migrations/`).

**1.3 TypeScript Types (4 targets)**

- `[ ]` 1.3.1 Define `EventType` enum (`src/types/event-types.ts`).
- `[ ]` 1.3.2 Define `InventoryEvent` interface (`src/types/event-interfaces.ts`).
- `[ ]` 1.3.3 Define DTOs (`src/types/dtos.ts`).
- `[ ]` 1.3.4 Define `Role` enum + `User` types (`src/types/auth-types.ts`).

**1.4 Auth Module (4 targets)**

- `[ ]` 1.4.1 Implement JWT strategy (`src/auth/jwt.strategy.ts`).
- `[ ]` 1.4.2 Implement `POST /api/auth/login` (`src/auth/auth.controller.ts`).
- `[ ]` 1.4.3 Implement `RolesGuard` (`src/auth/roles.guard.ts`).
- `[ ]` 1.4.4 Implement tenant-resolution middleware (`src/auth/tenant.middleware.ts`).

**1.5 API Endpoints (7 targets)**

- `[ ]` 1.5.1 `POST /api/sync/batch` (`src/controllers/sync.controller.ts`).
- `[ ]` 1.5.2 `GET /api/events` (`src/controllers/events.controller.ts`).
- `[ ]` 1.5.3 `POST /api/products` (`src/controllers/products.controller.ts`).
- `[ ]` 1.5.4 `GET /api/products` (`src/controllers/products.controller.ts`).
- `[ ]` 1.5.5 `POST /api/locations` (`src/controllers/locations.controller.ts`).
- `[ ]` 1.5.6 `GET /api/locations` (`src/controllers/locations.controller.ts`).
- `[ ]` 1.5.7 `GET /api/stock` stub (`src/controllers/stock.controller.ts`).

**1.6 Event Validation (2 targets)**

- `[ ]` 1.6.1 Event schema validation service (`src/services/validation.service.ts`).
- `[ ]` 1.6.2 Idempotency check service (`src/services/idempotency.service.ts`).

**1.7 Tests (5 targets)**

- `[ ]` 1.7.1 Unit tests: event validation.
- `[ ]` 1.7.2 Unit tests: auth guards + JWT.
- `[ ]` 1.7.3 Integration tests: sync batch endpoint.
- `[ ]` 1.7.4 Integration tests: products + locations.
- `[ ]` 1.7.5 Run lint + typecheck pass.

#### Pre-mortem

- **Failure mode:** Building traditional CRUD endpoints instead of event-sourced ingestion, accidentally adding stock mutation endpoints.
- **Early warning:** Controllers or services try to directly update or store stock values.
- **Prevention:** Enforce event-only writes from day one. Do not create any endpoint that accepts stock quantity as a direct input outside of events. The `POST /api/sync/batch` endpoint must be the only write path.

---

### Phase 2 — Sync Engine (20 targets)

Current completion: **0%**

Goal: Implement the offline-first sync engine with SQLite outbox queue, batch assembly, atomic transmission, server-side batch processing, and idempotency enforcement.

Phase 2 enables the offline-first operating model. Client devices (starting with the NestJS server itself, then Electron) can store events locally, queue them in an outbox, and transmit them in atomic batches. The server validates, deduplicates, and persists events in a single transaction.

#### What is already done

*(Implementation has not started. All Phase 2 targets are pending.)*

- `[x]` Sync engine design is fully documented in `docs/SYNC_ENGINE.md`.
- `[x]` Offline architecture design is fully documented in `docs/OFFLINE_ARCHITECTURE.md`.
- `[x]` All file paths and module names are pre-defined.

#### Remaining checklist

**2.1 Offline Schema (3 targets)**

- `[ ]` 2.1.1 Define `local_events` table (`electron/offline-schema.sql`).
- `[ ]` 2.1.2 Define `outbox_queue` table (`electron/offline-schema.sql`).
- `[ ]` 2.1.3 Define `sync_state` table (`electron/offline-schema.sql`).

**2.2 Outbox Queue (4 targets)**

- `[ ]` 2.2.1 `add(event)` — store event locally.
- `[ ]` 2.2.2 `getPending()` — retrieve unsynced events.
- `[ ]` 2.2.3 `markSynced(batchId)`.
- `[ ]` 2.2.4 `removeFailed(batchId)`.

**2.3 Batch Assembly (3 targets)**

- `[ ]` 2.3.1 Generate `batch_id` + group events.
- `[ ]` 2.3.2 `SyncBatchDTO` types + validation.
- `[ ]` 2.3.3 Sequence number gap detection.

**2.4 Transmission (3 targets)**

- `[ ]` 2.4.1 HTTP sync client with retry.
- `[ ]` 2.4.2 Exponential backoff strategy.
- `[ ]` 2.4.3 Batch rejection handler (client-side rollback).

**2.5 Server-Side Sync Processing (4 targets)**

- `[ ]` 2.5.1 Idempotency key deduplication.
- `[ ]` 2.5.2 Atomic batch transaction wrapper.
- `[ ]` 2.5.3 Conflict detection (sequence gaps).
- `[ ]` 2.5.4 Batch response builder.

**2.6 Sync Status (1 target)**

- `[ ]` 2.6.1 Sync status indicator component.

**2.7 Tests (3 targets)**

- `[ ]` 2.7.1 Unit tests: outbox queue ops.
- `[ ]` 2.7.2 Unit tests: idempotency.
- `[ ]` 2.7.3 Integration: full sync round-trip.

#### Pre-mortem

- **Failure mode:** Non-atomic batch commits cause partial sync state. Half a sync batch succeeds; the other half silently fails.
- **Early warning:** Events are processed individually instead of in atomic batches.
- **Prevention:** Implement the transactional wrapper before accepting any events. The server must not commit any event individually — only full batch commits are allowed.

---

### Phase 3 — Inventory Engine (16 targets)

Current completion: **0%**

Goal: Build the deterministic event replay engine, stock computation service, variance detection, and reconciliation logic.

Phase 3 delivers the core value of StockLedger: computed inventory state derived entirely from event history. Stock is never stored — it is always computed by replaying events in deterministic order.

#### What is already done

*(Implementation has not started. All Phase 3 targets are pending.)*

- `[x]` Stock equation and inventory logic are fully documented in `docs/INVENTORY_LOGIC.md`.
- `[x]` Event replay algorithm is specified in `docs/EVENT_MODEL.md`.
- `[x]` All file paths and module names are pre-defined.

#### Remaining checklist

**3.1 Replay Engine (5 targets)**

- `[ ]` 3.1.1 `getAllEvents(clientId, filters)` — fetch + sort.
- `[ ]` 3.1.2 Deterministic event sorter (seq → timestamp).
- `[ ]` 3.1.3 `computeStock(productId, location?)` — replay loop.
- `[ ]` 3.1.4 `computeStockAtTime(timestamp)` — point-in-time.
- `[ ]` 3.1.5 `computeAllStocks()` — full inventory snapshot.

**3.2 Stock Endpoints (3 targets)**

- `[ ]` 3.2.1 Full `GET /api/stock` with multi-location breakdown.
- `[ ]` 3.2.2 `GET /api/stock/:productId` with location filter.
- `[ ]` 3.2.3 `GET /api/stock/history/:productId` — time-series.

**3.3 Reconciliation (3 targets)**

- `[ ]` 3.3.1 Variance detection (expected vs physical).
- `[ ]` 3.3.2 Reconciliation report generator.
- `[ ]` 3.3.3 STOCK_REVERT handler (compensating event).

**3.4 Snapshot Optimization (2 targets)**

- `[ ]` 3.4.1 Periodic snapshot cache.
- `[ ]` 3.4.2 Snapshot invalidation on new event.

**3.5 Tests (3 targets)**

- `[ ]` 3.5.1 Deterministic replay tests (known sequence → expected).
- `[ ]` 3.5.2 Corner case tests (zero, negative, concurrent).
- `[ ]` 3.5.3 STOCK_REVERT integration tests.

#### Pre-mortem

- **Failure mode:** Storing computed stock values in a database column instead of deriving them via event replay, creating drift between cached and replayed values.
- **Early warning:** A "current_stock" column is added to a table or a materialized view becomes the source of truth.
- **Prevention:** Never add stock columns to any database table. If caching is needed, use the snapshot cache layer with explicit invalidation on every new event. Audit that the replay engine remains the single source of truth.

---

### Phase 4 — Multi-Tenant System (14 targets)

Current completion: **0%**

Goal: Implement client onboarding automation, per-tenant database provisioning, tenant connection factory, admin panel, and tenant isolation enforcement.

Phase 4 enables StockLedger's multi-tenant architecture. Each client gets a fully isolated PostgreSQL database. The admin panel allows global admins to onboard, suspend, and deprovision clients. Tenant routing is enforced at the middleware layer.

#### What is already done

*(Implementation has not started. All Phase 4 targets are pending.)*

- `[x]` Multi-tenant database architecture is fully documented.
- `[x]` Tenant isolation rules and routing flow are specified.
- `[x]` All file paths and module names are pre-defined.

#### Remaining checklist

**4.1 Client Onboarding (4 targets)**

- `[ ]` 4.1.1 `POST /api/admin/clients` — register client.
- `[ ]` 4.1.2 Automated tenant DB provisioning.
- `[ ]` 4.1.3 Tenant migration runner.
- `[ ]` 4.1.4 Tenant DB connection factory (per-client pool).

**4.2 Admin Panel — Backend (4 targets)**

- `[ ]` 4.2.1 `GET /api/admin/clients` — list with status.
- `[ ]` 4.2.2 `PATCH /api/admin/clients/:id` — activate/suspend.
- `[ ]` 4.2.3 `DELETE /api/admin/clients/:id` — deprovision.
- `[ ]` 4.2.4 Tenant health check endpoint.

**4.3 Admin Panel — UI (3 targets)**

- `[ ]` 4.3.1 Admin dashboard.
- `[ ]` 4.3.2 Client detail view.
- `[ ]` 4.3.3 Client creation form.

**4.4 Tests (3 targets)**

- `[ ]` 4.4.1 Unit: tenant provisioning + connection factory.
- `[ ]` 4.4.2 Integration: full onboarding lifecycle.
- `[ ]` 4.4.3 Isolation: no cross-tenant data access.

#### Pre-mortem

- **Failure mode:** Cross-tenant data leak during DB provisioning, connection routing, or query execution.
- **Early warning:** Missing `client_id` filter on event queries or tenant DB selected incorrectly.
- **Prevention:** Enforce tenant context at the connection-pool level, not just in query filters. The tenant middleware must resolve and inject the database connection before any controller logic runs. Test with concurrent requests for different tenants.

---

### Phase 5 — Client Applications (25 targets)

Current completion: **0%**

Goal: Build the Electron desktop application with the design system, all screens, offline SQLite storage, and sync client integration.

Phase 5 produces the primary client application. Users can log in, view dashboards, manage inventory and events, and use the full offline-first workflow. The design system ensures visual consistency across all screens.

#### What is already done

*(Implementation has not started. All Phase 5 targets are pending.)*

- `[x]` Offline architecture documented for Electron/SQLite.
- `[x]` Design token system specified in AGENTS.md.
- `[x]` Component architecture specified (ui, shared, layout, screens).
- `[x]` All file paths and module names are pre-defined.

#### Remaining checklist

**5.1 Electron Scaffold (3 targets)**

- `[ ]` 5.1.1 Initialize Electron + TypeScript.
- `[ ]` 5.1.2 Main process / renderer process.
- `[ ]` 5.1.3 Typed IPC bridge.

**5.2 Design System (4 targets)**

- `[ ]` 5.2.1 CSS custom properties (`tokens.css`).
- `[ ]` 5.2.2 Atomic primitives (Button, Input, Card, Badge, Modal).
- `[ ]` 5.2.3 Composite patterns (DataTable, FilterBar, StatCard).
- `[ ]` 5.2.4 Layout components (AppShell, Sidebar, TopBar, SyncStatusBar).

**5.3 Screens (8 targets)**

- `[ ]` 5.3.1 LoginScreen.
- `[ ]` 5.3.2 DashboardScreen.
- `[ ]` 5.3.3 InventoryScreen.
- `[ ]` 5.3.4 EventCreateScreen.
- `[ ]` 5.3.5 EventHistoryScreen.
- `[ ]` 5.3.6 LocationManagementScreen.
- `[ ]` 5.3.7 ProductManagementScreen.
- `[ ]` 5.3.8 SettingsScreen.

**5.4 Offline Storage (3 targets)**

- `[ ]` 5.4.1 SQLite init (main process).
- `[ ]` 5.4.2 Local event CRUD via IPC.
- `[ ]` 5.4.3 Outbox queue (renderer-side).

**5.5 Sync Client (3 targets)**

- `[ ]` 5.5.1 Sync client service.
- `[ ]` 5.5.2 Auto-sync trigger.
- `[ ]` 5.5.3 Manual sync + progress indication.

**5.6 Tests (3 targets)**

- `[ ]` 5.6.1 Unit: IPC handlers, offline storage.
- `[ ]` 5.6.2 Component: LoginScreen, EventCreateForm.
- `[ ]` 5.6.3 Integration: offline → sync → online.

#### Pre-mortem

- **Failure mode:** Offline events are acknowledged to the user before they are safely stored in SQLite, causing data loss on crash.
- **Early warning:** An event is confirmed ("Stock out recorded") before the SQLite write completes.
- **Prevention:** Always persist events to SQLite before returning confirmation to the user. The confirm callback must fire only after the database write succeeds. No exception — this is the offline-first invariant.

---

### Phase 6 — Enterprise Hardening (14 targets)

Current completion: **0%**

Goal: Optimize performance, harden security, add audit tooling, and prepare for production deployment.

Phase 6 addresses everything required to take StockLedger from a working prototype to a production-grade system. This includes database indexing, snapshot caching, API rate limiting, payload encryption, audit export, stress testing, and security review.

#### What is already done

*(Implementation has not started. All Phase 6 targets are pending.)*

- `[x]` Performance strategy outlined in database schema docs.
- `[x]` Security model documented in system overview and API spec.
- `[x]` All file paths and module names are pre-defined.

#### Remaining checklist

**6.1 Performance (4 targets)**

- `[ ]` 6.1.1 Add database indexes (product_id, timestamp, type).
- `[ ]` 6.1.2 Snapshot-based stock caching.
- `[ ]` 6.1.3 API rate limiting.
- `[ ]` 6.1.4 Query optimization pass (replay + audit queries).

**6.2 Security (4 targets)**

- `[ ]` 6.2.1 Payload encryption (sync transmission).
- `[ ]` 6.2.2 Input sanitization.
- `[ ]` 6.2.3 Admin action audit trail.
- `[ ]` 6.2.4 Security review: JWT, tokens, device trust.

**6.3 Tooling (3 targets)**

- `[ ]` 6.3.1 Audit export (CSV/JSON).
- `[ ]` 6.3.2 Shrinkage analysis reports.
- `[ ]` 6.3.3 Discrepancy detection dashboard.

**6.4 Production Readiness (3 targets)**

- `[ ]` 6.4.1 Performance stress test (10K+ events).
- `[ ]` 6.4.2 Security penetration test (tenant isolation, auth bypass).
- `[ ]` 6.4.3 Production deployment docs + runbook.

#### Pre-mortem

- **Failure mode:** Performance degrades as event volume grows — replay takes seconds for standard queries, causing UI timeouts.
- **Early warning:** A single `GET /api/stock` call takes more than 2 seconds for fewer than 10,000 events.
- **Prevention:** Add snapshot caching before production load. Set performance benchmarks in CI that fail if replay latency exceeds threshold. Index the `events` table on `(product_id, timestamp)` from day one.

---

## Critical Cross-Cutting Blockers

These should be treated as release gates, not optional cleanup.

- `[!]` **No NestJS project scaffold exists.** Every backend target depends on this. Until `nest new` is run and `tsconfig.json` is configured with strict mode and path aliases, no code can be written.
- `[!]` **No PostgreSQL instance configured for local development.** No master or tenant database URLs exist in `.env`. Prisma migrations cannot run.
- `[!]` **No Prisma schema files.** The database design is fully documented but no `.prisma` file exists. Types, controllers, and services cannot be written without the Prisma client.
- `[!]` **No TypeScript type definitions implemented.** The event model, enum, interfaces, and DTOs are designed but not written as `.ts` files. All downstream code depends on these types.
- `[!]` **No auth module implemented.** JWT strategy, login endpoint, RolesGuard, and tenant middleware are not built. Every protected endpoint depends on this.
- `[!]` **No event validation or idempotency service.** The core invariants of the system (idempotent, validated event ingestion) cannot be enforced.
- `[!]` **No Electron project initialized.** The desktop client, offline SQLite storage, and sync client require an Electron shell.

---

## Recommended Execution Order

### Sprint 0: Scaffold & Types

Target completion: Phase 1 targets 1.1.1–1.1.4, 1.3.1–1.3.4

- `[ ]` Initialize NestJS project with strict TypeScript.
- `[ ]` Configure ESLint, Prettier, path aliases, and environment variables.
- `[ ]` Define all TypeScript types: `EventType` enum, `InventoryEvent` interface, DTOs, `Role` enum, `User` types.

### Sprint 1: Database Foundation

Target completion: Phase 1 targets 1.2.1–1.2.8

- `[ ]` Write Prisma master schema (clients, users, devices).
- `[ ]` Write Prisma tenant schema (events, products, locations, audit_logs).
- `[ ]` Run initial migrations for master + tenant databases.
- `[ ]` Verify Prisma client generation works for both schemas.

### Sprint 2: Auth & Core Endpoints

Target completion: Phase 1 targets 1.4.1–1.5.7

- `[ ]` Implement JWT strategy and login endpoint.
- `[ ]` Implement RolesGuard and tenant-resolution middleware.
- `[ ]` Implement `POST /api/sync/batch` (primary write path).
- `[ ]` Implement `GET /api/events` with filtering.
- `[ ]` Implement product and location CRUD endpoints.
- `[ ]` Implement `GET /api/stock` stub.

### Sprint 3: Validation & Sync Server

Target completion: Phase 1 targets 1.6.1–1.6.2, Phase 2 targets 2.5.1–2.5.4

- `[ ]` Implement event schema validation service.
- `[ ]` Implement idempotency check service.
- `[ ]` Implement atomic batch transaction wrapper.
- `[ ]` Implement conflict detection and batch response builder.

### Sprint 4: Event Replay & Stock

Target completion: Phase 3 targets 3.1.1–3.2.3

- `[ ]` Implement event replay engine with deterministic sorting.
- `[ ]` Implement stock computation (per product, per location).
- `[ ]` Implement point-in-time stock reconstruction.
- `[ ]` Wire `GET /api/stock` to replay engine.

### Sprint 5: Sync Client & Offline

Target completion: Phase 2 targets 2.1.1–2.4.3

- `[ ]` Write offline SQLite schema.
- `[ ]` Implement outbox queue.
- `[ ]` Implement batch assembly and HTTP sync client.
- `[ ]` Implement retry, backoff, and rejection handling.

### Sprint 6: Reconciliation & Snapshots

Target completion: Phase 3 targets 3.3.1–3.4.2

- `[ ]` Implement variance detection.
- `[ ]` Implement STOCK_REVERT handler.
- `[ ]` Implement snapshot caching with invalidation.
- `[ ]` Build reconciliation report generator.

### Sprint 7: Multi-Tenant System

Target completion: Phase 4 targets 4.1.1–4.3.3

- `[ ]` Implement client registration API and automated DB provisioning.
- `[ ]` Build tenant connection factory with per-client pooling.
- `[ ]` Build admin panel (client list, detail, creation form).
- `[ ]` Implement tenant health check and deprovisioning.

### Sprint 8: Electron App — Foundation

Target completion: Phase 5 targets 5.1.1–5.2.4, 5.4.1

- `[ ]` Initialize Electron project with TypeScript and IPC bridge.
- `[ ]` Build CSS design tokens and UI primitives (Button, Input, Card, DataTable).
- `[ ]` Build layout components (AppShell, Sidebar, TopBar).
- `[ ]` Initialize SQLite database in main process.

### Sprint 9: Electron App — Screens & Sync

Target completion: Phase 5 targets 5.3.1–5.5.3

- `[ ]` Build LoginScreen with JWT persistence.
- `[ ]` Build DashboardScreen and InventoryScreen.
- `[ ]` Build EventCreateScreen and EventHistoryScreen.
- `[ ]` Build LocationManagementScreen and ProductManagementScreen.
- `[ ]` Build SettingsScreen.
- `[ ]` Wire sync client service with auto and manual sync.

### Sprint 10: Testing & Hardening

Target completion: Phase 1 targets 1.7.1–1.7.5, Phase 2 targets 2.7.1–2.7.3, Phase 3 targets 3.5.1–3.5.3, Phase 6 targets 6.1.1–6.4.3

- `[ ]` Write unit and integration tests for all existing code.
- `[ ]` Add database indexes and optimize queries.
- `[ ]` Implement API rate limiting and payload encryption.
- `[ ]] Implement audit export and shrinkage reports.
- `[ ]` Run stress test and penetration test.
- `[ ]` Write production deployment documentation.

---

## Update Log

| Date | Update | Evidence | Next action |
|---|---|---|---|
| 2026-06-13 | Created initial development tracker from architecture docs audit. | All 8 specification documents, AGENTS.md, and convention files reviewed. | Begin Sprint 0: NestJS scaffold, TypeScript types, and Prisma schemas. |
| 2026-06-13 | Restructured tracker to follow CureRays CRMS format with 9 sections, executive summary, phase plans with pre-mortems, and recommended execution order. | Comparison against CureRays CRMS tracker structure and StockLedger architecture docs. | Use this as the working checklist for all implementation phases. |
