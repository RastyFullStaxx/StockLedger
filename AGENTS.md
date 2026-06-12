# AGENTS.md — StockLedger

## Project

StockLedger is a distributed, event-sourced inventory ledger system designed for bar, kitchen, and supply chain environments requiring strict audit control, offline capability, and multi-tenant isolation.

**Tech Stack:** NestJS (backend), PostgreSQL (master + per-tenant databases), TypeScript, Prisma ORM, Electron (desktop client), React Native (mobile — future), SQLite (offline storage).

**Status:** Architecture and system design phase (pre-implementation).

**Key Constraint:** StockLedger is NOT a CRUD system. It is an event-sourced ledger where:
- history is immutable
- state is derived from event replay
- consistency is guaranteed through deterministic replay

## Quick Commands

```bash
npm run start:dev     # Start NestJS dev server (when scaffolded)
npm run build         # Production build (nest build)
npm run start         # Start production server
npm run lint          # ESLint (NestJS + TypeScript)
npm run typecheck     # TypeScript type checking (tsc --noEmit)
npm run test          # Unit tests (Jest)
npm run test:e2e      # End-to-end tests
npx prisma generate   # Generate Prisma client
npx prisma migrate    # Run database migrations
```

## System Architecture

### Layers

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Client Layer** | Electron (primary), React Native (future), PWA (fallback) | Generate events, never modify stock directly |
| **Offline Layer** | SQLite (desktop), IndexedDB (web), outbox queue | Store events locally, queue for sync |
| **Sync Layer** | NestJS sync endpoint, atomic batch, idempotency | Transmit events when online, enforce consistency |
| **Backend Layer** | NestJS API server | Only system allowed to persist events permanently |
| **Data Layer** | PostgreSQL per-client + master DB | Tenant isolation, event history, audit trails |

### Data Philosophy

Stock is NEVER stored. All inventory values are computed using event replay:

**Event types:**
- `STOCK_IN` — incoming inventory (supplier delivery, restock)
- `STOCK_OUT` — inventory leaving (sales, usage, consumption, waste)
- `STOCK_TRANSFER` — movement between locations
- `STOCK_ADJUSTMENT` — corrections (physical count mismatch, shrinkage)
- `STOCK_REVERT` — compensating event (must reference original event_id)

**Stock formula:** `Stock(Location, Product) = Σ STOCK_IN - Σ STOCK_OUT + Σ ADJUSTMENT + Σ REVERT + Σ TRANSFER_IN - Σ TRANSFER_OUT`

### Two-Tier Database Architecture

| Database | Purpose | Tables |
|----------|---------|--------|
| **Master DB** | Client registry, auth, routing | `clients`, `users`, `devices` |
| **Per-Tenant DB** | Isolated event store | `events`, `products`, `locations`, `audit_logs` |

### Canonical Event Schema

```typescript
interface InventoryEvent {
  event_id: string;             // UUID
  client_id: string;            // UUID — tenant
  device_id: string;            // UUID — source device
  user_id: string;              // UUID — actor
  type: EventType;              // STOCK_IN | STOCK_OUT | STOCK_TRANSFER | STOCK_ADJUSTMENT | STOCK_REVERT
  product_id: string;           // UUID
  from_location: string | null;  // UUID or null
  to_location: string | null;    // UUID or null
  quantity: number;              // Numeric — positive for in, negative for out
  timestamp: number;             // Unix epoch
  sequence_number: number;       // Device-level ordering
  idempotency_key: string;       // UUID — prevents duplicate processing
  sync_batch_id: string;         // UUID — atomic sync group
}
```

### Sync Model

1. User performs action → Event stored locally (offline-safe)
2. Event queued in outbox
3. System sends atomic batch to backend when online
4. Server validates and persists events
5. Events replayed to compute final state

**Rules:**
- Entire batch must succeed or fail (atomic sync)
- Idempotency prevents duplicate events
- Server is authoritative for validation
- Event replay determines final system state

### Security Model

- **RBAC:** GLOBAL_ADMIN (system owner), CLIENT_ADMIN (client-level), STAFF (operational)
- **Device auth:** Trusted devices supported, unique device_id per node
- **Full audit logging** for all events
- **Encrypted credentials** at rest
- **Strict tenant isolation** — one PostgreSQL database per client

## Key Files

| Layer | Path (planned) | Purpose |
|-------|---------------|---------|
| Controllers | `src/controllers/` | NestJS route handlers |
| Services | `src/services/` | Business logic |
| Event handlers | `src/events/handlers/` | Per-event-type processing |
| Event replay | `src/events/replay/` | Stock computation engine |
| Sync engine | `src/sync/` | Batch processing, idempotency |
| Types | `src/types/` | TypeScript types, enums, interfaces |
| Prisma master | `prisma/master-schema.prisma` | Master database schema |
| Prisma tenant | `prisma/tenant-schema.prisma` | Tenant database schema |
| Electron | `electron/` | Desktop application |
| Docs | `docs/` | System documentation |

## Routes (NestJS)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/sync/batch` | Submit batch of events atomically |
| `GET` | `/api/events` | Query historical events (filterable) |
| `GET` | `/api/stock` | Computed stock from event replay |
| `GET` | `/api/stock/:productId` | Stock for specific product |
| `POST` | `/api/products` | Create product metadata |
| `GET` | `/api/products` | List products for tenant |
| `POST` | `/api/locations` | Create inventory location |
| `GET` | `/api/locations` | List locations for tenant |

## Component Architecture (Electron Client)

```
src/renderer/
├── components/
│   ├── ui/              # Atomic primitives (Button, Input, Card, Badge)
│   ├── shared/          # Composite patterns (DataTable, FilterBar, StatCard)
│   └── layout/          # AppShell, Sidebar, TopBar, SyncStatusBar
├── screens/             # App views (Dashboard, Inventory, Events, Settings)
├── services/            # IPC calls, sync client, offline storage
└── store/               # Client-side state management
```

## Code Conventions

- **Naming:** Controllers `PascalCase`, files `kebab-case`, TypeScript types/interfaces `PascalCase`
- **Exports:** Named exports preferred over default exports
- **Imports:** Use NestJS path aliases from tsconfig.json — no relative imports traversing many levels
- **Typing:** Strict TypeScript mode. Explicit types on all functions, params, and returns. No `any`
- **Event handlers:** One handler per event type, clean separation of validation from processing
- **Controllers:** Thin — only orchestrate. Business logic in services or event handlers
- **Offline/Online parity:** Same validation logic used on client (offline) and server (online)

## Testing Strategy

- **Unit tests:** Service functions, event handlers, replay engine — Jest
- **Integration tests:** API endpoints with tenant isolation — Supertest + testcontainers
- **Event replay tests:** Known event sequences → expected stock output (deterministic)
- **Sync engine tests:** Batch atomicity, idempotency, rollback on failure
- **E2E tests:** Full flow — event creation → offline storage → sync → replay → stock computation

## Design Token System

**All styling uses CSS custom properties defined in the design system.**

| Token | Purpose |
|-------|---------|
| `--color-primary` | Brand color, active states, primary buttons |
| `--color-bg` | Screen background |
| `--color-card` | Card/surface background |
| `--color-text` | Primary text |
| `--color-text-muted` | Labels, captions, secondary |
| `--color-border` | Container borders |
| `--color-success` | Sync complete, stock sufficient |
| `--color-warning` | Low stock, pending sync |
| `--color-error` | Sync failed, stock discrepancy |
| `--color-info` | Event details, audit info |
| `--font-heading` | All headings |
| `--font-body` | All body text |

## Development Roadmap

### Phase 1 — Core Ledger
Event schema, NestJS backend, PostgreSQL tenant structure, basic event ingestion API

### Phase 2 — Sync Engine
Offline queue system, atomic batch sync, idempotency handling

### Phase 3 — Inventory Engine
Event replay computation, stock calculation per location, variance/reconciliation

### Phase 4 — Multi-Tenant System
Client onboarding automation, database provisioning, admin control panel

### Phase 5 — Client Applications
Electron desktop, React Native mobile, device management

### Phase 6 — Enterprise Hardening
Performance optimization, security enhancements, advanced audit tooling, scaling

## Common Pitfalls

- Don't store stock directly — always derive from event replay
- Don't allow event mutation or deletion — only compensating events
- Don't mix tenant data — one database per client, never cross-query
- Don't process sync batches partially — atomic commit or full rollback
- Don't skip idempotency — duplicate events must be safely ignored
- Don't block the UI thread on sync — use background processing
- Don't cache stock without invalidation strategy — event replay is the source of truth
- Don't forget offline SQLite schema must mirror server schema
- Don't expose PII or financial data in errors, logs, or client storage
- Don't rely on client-side checks for tenant isolation — enforce server-side

## Environment

- Node.js 18+ required by NestJS/TypeScript stack
- PostgreSQL 14+ for master and tenant databases
- SQLite 3 for Electron offline storage
- `.env.example` has all keys — copy to `.env` and fill for local work
- Database URLs: `DATABASE_URL_MASTER` (single), `DATABASE_URL_TENANT_*` pattern (per client)
- No Docker required for basic local development — PostgreSQL instance needed

## Documentation

Full system documentation is in `/docs`:
- SYSTEM_OVERVIEW.md, ARCHITECTURE.md, EVENT_MODEL.md
- DATABASE_SCHEMA.md, SYNC_ENGINE.md, OFFLINE_ARCHITECTURE.md
- INVENTORY_LOGIC.md, API_SPECIFICATION.md
