# Product Lifecycle (Soft Deactivate / Reactivate) - Pre-Mortem and Hardening Plan

## 1) Objective and constraints

- Preserve event immutability: no stock event is ever deleted or edited.
- Deactivate must be a soft state transition only (`is_active = false`) plus balancing `STOCK_ADJUSTMENT` events.
- Reactivation is metadata-only; it must not create stock movement events.
- Stock after any lifecycle transition is always derived from replay, never rewritten in-place.

## 2) Acceptance criteria

- Lifecycle transition events and product metadata remain in a clear audit trail.
- Deactivation closes all non-zero balances to zero via one adjustment per location.
- Product selectors and movement screens hide inactive products by default.
- Reactivated products are immediately selectable again with no synthetic stock adjustments.
- Existing movement history stays unchanged.

## 3) Failure mode analysis and mitigations

### F1 - Duplicate deactivate action creates duplicate closure events
- **Failure pattern:** two clients/tabs issue deactivate for the same active product before sync.
- **Impact:** stock can be over-closed if both requests replay against same baseline.
- **Detection:** repeated deactivation request in audit with same active-to-inactive window and multiple adjustment bursts.
- **Mitigation (prototype):**
  - In-UI busy lock (`productLifecycleBusy`) prevents repeated click replay.
  - No-op when `is_active === false`.
  - Backend recommendation: persist `deactivation_version` (or compare-and-swap on `is_active`) and reject stale transitions.

### F2 - Floating point residue leaves micro balances
- **Failure pattern:** computed balance is `0.0000001` due precision drift.
- **Impact:** deactivation keeps many tiny balancing events or leaves tiny non-zero residue.
- **Mitigation (prototype):**
  - Epsilon normalization (`PRODUCT_DEACTIVATE_EPSILON = 1e-4`) before closure emission.
  - Closure preview shows normalized values only.
- **Backend hardening suggestion:** define canonical rounding policy during replay before emitting closure batches.

### F3 - Stock drift from unsynced closure queue
- **Failure pattern:** user deactivates, then creates more movements before outbox sends, while reactivating again.
- **Impact:** local preview can diverge from server view during offline windows.
- **Mitigation (prototype):**
  - Use `allLocalEvents()` (ledger + outbox) for closure computation.
  - Warn on reactivation when product has pending lifecycle-closure debt.
- **Backend hardening suggestion:** API response should include per-product queued/unconfirmed state for UX alignment.

### F4 - Unknown or invalid location stock at deactivation
- **Failure pattern:** balance exists at unexpected location labels (legacy imports, data drift, location rename).
- **Impact:** closure events target invalid location context or fail to appear in standard selectors.
- **Mitigation (prototype):**
  - Closure function currently emits by replayed location key for every non-zero balance.
  - UI warning path can be extended to flag non-catalog locations before confirming deactivation.
- **Backend hardening suggestion:** reject deactivation when invalid location reconciliation cannot be resolved and require explicit reconciliation.

### F5 - Stale form/filter selection after lifecycle change
- **Failure pattern:** user remains on an inactive product in compose filters.
- **Impact:** blank movement form, validation errors, or accidental wrong product entry.
- **Mitigation (prototype):**
  - `ensureProductSelectionIntegrity()` repairs:
    - active product filter
    - movement form product selection
    - selected stock location sanity.

### F6 - Audit opacity: missing human context
- **Failure pattern:** reactivation/deactivation logged only as opaque ids or hidden metadata.
- **Impact:** operators cannot reconstruct intent from audit trail quickly.
- **Mitigation (prototype):**
  - Lifecycle metadata stored on product row (`deactivated_by`, `deactivated_reason`, `reactivated_by`).
  - Deactivation uses clear reason text in balancing events.
- **Backend hardening suggestion:** include actor display name in lifecycle metadata and emit lifecycle audit event entry (`product.deactivated`, `product.reactivated`).

### F7 - Concurrent admin changes across sessions
- **Failure pattern:** two operators race to reactivate/deactivate same product.
- **Impact:** last-writer-wins confusion and inconsistent expectations.
- **Mitigation (prototype):**
  - In-memory UI lock only protects one session.
- **Backend hardening suggestion:**
  - Enforce optimistic concurrency on product state in tenant DB.
  - Return version conflict + current state when transitions are stale.

### F8 - Reactivation confusion over stock start point
- **Failure pattern:** operator assumes reactivation restores previous balance.
- **Impact:** operational stock planning error and policy disputes.
- **Mitigation (UX):**
  - Confirmation copy explicitly states reactivation is metadata-only.
  - Product becomes reusable immediately from current replayed balances (typically zero after policy-driven closure).

## 4) Implementation hardening checklist for next phase

- Add backend endpoint-level idempotency/correlation for lifecycle transitions.
- Persist lifecycle audit events for lifecycle state changes.
- Add integration tests for:
  - deactivation + replay closure to zero per location
  - reactivation does not emit movement events
  - reactivation/deactivation ordering under offline/outbox replay
  - duplicate transition contention.
- Add operational observability:
  - count of pending lifecycle-closure outbox events
  - lifecycle transition conflicts/validation rejections
  - unknown-location deactivation blocks.
