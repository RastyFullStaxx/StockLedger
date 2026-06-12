# DATABASE_SCHEMA.md

## 1. Overview

This document defines the complete database schema for StockLedger.

The system uses a dual-layer database design:
- Master Database (system-wide control layer)
- Tenant Database (per-client event ledger layer)

The design is optimized for:
- event-sourced inventory tracking
- strict multi-tenant isolation
- offline-first synchronization
- deterministic replay computation

---

## 2. Design Principles

- No direct stock storage
- Event-only persistence model
- Append-only ledger tables
- Strict tenant isolation
- Idempotent event ingestion
- Immutable historical records
- Audit-first structure

---

## 3. Master Database Schema

The master database controls system-wide operations and tenant routing.

### 3.1 clients

Stores all registered clients.

```sql
CREATE TABLE clients (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    db_name TEXT NOT NULL,
    db_host TEXT NOT NULL,
    db_user TEXT NOT NULL,
    db_password TEXT NOT NULL, -- encrypted
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 3.2 users (global + client-level users)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    client_id UUID NULL, -- null = GLOBAL_ADMIN
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL, -- GLOBAL_ADMIN | CLIENT_ADMIN | STAFF
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 3.3 devices

Tracks trusted or registered devices.

```sql
CREATE TABLE devices (
    id UUID PRIMARY KEY,
    client_id UUID NOT NULL,
    user_id UUID NOT NULL,
    device_name TEXT,
    trusted BOOLEAN DEFAULT FALSE,
    last_active TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4. Tenant Database Schema (Per Client)

Each client has an isolated PostgreSQL database.

---

## 4.1 events (CORE LEDGER TABLE)

This is the most important table in the system.

```sql
CREATE TABLE events (
    id UUID PRIMARY KEY,
    event_id UUID UNIQUE NOT NULL,

    client_id UUID NOT NULL,
    device_id UUID NOT NULL,
    user_id UUID NOT NULL,

    type TEXT NOT NULL, 
    -- STOCK_IN | STOCK_OUT | STOCK_TRANSFER | STOCK_ADJUSTMENT | STOCK_REVERT

    product_id UUID NOT NULL,

    from_location TEXT,
    to_location TEXT,

    quantity NUMERIC NOT NULL,

    timestamp BIGINT NOT NULL,
    sequence_number BIGINT NOT NULL,

    idempotency_key UUID UNIQUE NOT NULL,
    sync_batch_id UUID NOT NULL,

    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### Indexes (critical for performance)

```sql
CREATE INDEX idx_events_product ON events(product_id);
CREATE INDEX idx_events_location ON events(from_location, to_location);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_idempotency ON events(idempotency_key);
```

---

## 4.2 products

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT NOT NULL,
    cost_price NUMERIC,
    selling_price NUMERIC,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4.3 locations

```sql
CREATE TABLE locations (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL
);
```

Note:
Locations are logical dimensions only. They do NOT store stock.

---

## 4.4 audit_logs

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    event_id UUID,
    action TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. Database Behavior Rules

---

### 5.1 Immutability Rule

- events table is append-only
- no UPDATE allowed
- no DELETE allowed

Corrections must be new events.

---

### 5.2 Idempotency Rule

Each event is uniquely identified by:

- event_id
- idempotency_key

Duplicate events are ignored safely.

---

### 5.3 Tenant Isolation Rule

Each tenant database is fully isolated:
- no cross-tenant queries
- no shared event tables

---

## 6. Stock Computation Model

Stock is NOT stored.

It is computed using event replay:

### Formula:

- STOCK_IN → +quantity
- STOCK_OUT → -quantity
- STOCK_TRANSFER → move between locations
- STOCK_ADJUSTMENT → delta correction
- STOCK_REVERT → inverse operation

---

## 7. Performance Strategy

To support large datasets:

- indexes on product_id and timestamp
- optional materialized views (future phase)
- periodic snapshot caching (future optimization only)

---

## 8. Migration Strategy

Each tenant database uses identical schema versioning.

Rules:
- all tenants must run same schema version
- migrations are applied centrally
- rollback strategy required for failed deployments

---

## 9. Security Considerations

- encrypted DB credentials in master DB
- tenant isolation enforced at application layer
- role-based access control
- device-level tracking support

---

## 10. System Constraint Summary

The database design explicitly enforces:

- no stock columns
- no mutable inventory state
- no cross-tenant access
- no event deletion
- no event modification

---

## 11. Summary

StockLedger uses a dual-database architecture:

- Master DB → system control + routing
- Tenant DB → immutable event ledger

This design ensures:
- audit-grade traceability
- offline-safe synchronization
- deterministic inventory computation
- strict client isolation
