# API_SPECIFICATION.md

## 1. Overview

This document defines the complete API contract for StockLedger.

The API is designed to support:
- offline-first synchronization
- event-driven inventory ingestion
- multi-tenant isolation
- strict atomic batch processing
- idempotent event handling

---

## 2. Core API Philosophy

StockLedger APIs are NOT CRUD-based.

They are event ingestion and retrieval endpoints.

Principles:
- Events are the only write operation
- State is always derived, not stored
- APIs are stateless except for authentication
- All sync operations are batch-based

---

## 3. Authentication Model

### 3.1 Auth Type
- JWT-based authentication
- Device-aware sessions supported

### 3.2 Roles
- GLOBAL_ADMIN
- CLIENT_ADMIN
- STAFF

### 3.3 Auth Flow

1. User logs in
2. Server validates credentials
3. JWT issued
4. Token includes:
   - client_id
   - user_id
   - role
   - device_id (optional)

---

## 4. Core API Endpoints

---

## 4.1 Sync Batch Endpoint (CRITICAL)

### POST /api/sync/batch

This is the PRIMARY system endpoint.

### Request Body:

```json
{
  "client_id": "uuid",
  "device_id": "uuid",
  "batch_id": "uuid",
  "events": [
    {
      "event_id": "uuid",
      "type": "STOCK_OUT",
      "product_id": "uuid",
      "from_location": "bar",
      "to_location": null,
      "quantity": 5,
      "timestamp": 1234567890,
      "sequence_number": 10,
      "idempotency_key": "uuid"
    }
  ]
}
```

### Response:

```json
{
  "success": true,
  "processed_count": 10,
  "rejected_count": 0,
  "server_timestamp": 1234569999
}
```

### Rules:
- Entire batch is atomic
- If one event fails → reject full batch
- Idempotency keys prevent duplicates

---

## 4.2 Event History Endpoint

### GET /api/events

Query historical events for audit purposes.

### Query Params:
- client_id
- product_id
- location
- start_time
- end_time

### Response:
List of immutable events.

---

## 4.3 Stock Query Endpoint

### GET /api/stock

Returns computed stock (derived from event replay).

### Query Params:
- product_id
- location_id (optional)

### Response:
```json
{
  "product_id": "uuid",
  "location": "bar",
  "stock": 120
}
```

Important:
Stock is NOT stored in DB. It is computed dynamically.

---

## 4.4 Product Management

### POST /api/products

Create product metadata.

### GET /api/products

List all products for tenant.

### PATCH /api/products/:product_id

Update product lifecycle metadata.

Request examples:

```json
{
  "is_active": false,
  "reason": "Planned decommission for seasonal menu update"
}
```

Behavior:

- `is_active=false` deactivates a product.
- Deactivation should emit one `STOCK_ADJUSTMENT` event for each location with non-zero replayed stock.
- Each adjustment uses the exact negative of current replayed quantity at that location (with epsilon close-to-zero guard, default `1e-4`).
- Historical movement records remain immutable; no events are deleted.
- `is_active=true` reactivates the product and must not create movement events.
- Querying products includes lifecycle fields: `is_active`, `deactivated_at`, `deactivated_by`, `deactivated_reason`, `reactivated_at`, `reactivated_by`.

### Lifecycle failure and concurrency behavior

- Deactivation requests must verify that:
  - the product exists,
  - the caller has authority for catalog changes,
  - and product state is not already in the requested lifecycle state.
- If already in target state, endpoint should return success with no-op metadata (or explicit `204`/`409` policy), but never emit additional `STOCK_ADJUSTMENT` events.
- Deactivation closure calculation:
  - use current replayed balances including unsynced local queue where present in the same device context,
  - apply epsilon normalization (`1e-4`) before generating balancing events,
  - emit no adjustment for zero-residue balances.
- Reactivation must not create stock movement events.
- Server should return pending lifecycle transition status if a product has unsent local closure events.

### Query behavior

- `GET /api/products` accepts `is_active` query (`true|false|all`, default `all` for admin views).
- See [Product Lifecycle Pre-Mortem and Hardening Plan](./PRODUCT_LIFECYCLE_PREMORTEM.md) for operational and risk controls.

 

## 4.5 Location Management

### POST /api/locations

Create inventory location.

### GET /api/locations

List locations for tenant.

---

## 5. Sync Behavior Rules

### 5.1 Atomic Batch Rule
- all events must succeed or fail together
- no partial commits allowed

---

### 5.2 Idempotency Rule
- event_id and idempotency_key must be unique
- duplicate events are ignored safely

---

### 5.3 Ordering Rule
Events are ordered using:
1. sequence_number
2. timestamp
3. server reconciliation order

---

## 6. Error Handling

### 6.1 Batch Rejection

If batch fails:

```json
{
  "success": false,
  "error": "VALIDATION_FAILED",
  "failed_event_ids": ["uuid1", "uuid2"]
}
```

Client must retry full batch.

---

## 6.2 Network Failure

- client retries automatically
- no data loss allowed
- local queue preserved

---

## 7. Security Enforcement

- All requests require JWT
- Tenant isolation enforced server-side
- Device validation optional but supported
- HTTPS required for all endpoints

---

## 8. Offline Sync Contract

Clients must:

1. Store events locally
2. Queue events in outbox
3. Send batch when online
4. Retry full batch on failure
5. Never modify event order

---

## 9. Data Consistency Model

System guarantees:

- eventual consistency across devices
- deterministic final state via event replay
- zero duplicate events (idempotency enforced)
- full audit traceability

---

## 10. System Constraint Summary

The API explicitly enforces:

- no direct stock mutation endpoints
- no DELETE event endpoints
- no partial batch commits
- no cross-tenant access

---

## 11. Summary

StockLedger API is an event-ingestion system designed to:

- accept immutable inventory events
- synchronize offline clients safely
- compute stock via deterministic replay
- maintain strict audit integrity across tenants
