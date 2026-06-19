import test from "node:test";
import assert from "node:assert/strict";

import {
  applySyncBatch,
  computeStock,
  createInventoryEvent,
  replayAuditTrail,
  validateEvent,
} from "../src/domain/ledger.mjs";

const base = {
  client_id: "client-northstar",
  device_id: "device-bar-01",
  user_id: "user-mara",
  product_id: "product-gin",
  sync_batch_id: "batch-seed",
};

test("replay computes stock per product and location without storing stock", () => {
  const events = [
    createInventoryEvent({ ...base, type: "STOCK_IN", to_location: "Dry Store", quantity: 24, sequence_number: 1 }),
    createInventoryEvent({ ...base, type: "STOCK_TRANSFER", from_location: "Dry Store", to_location: "Main Bar", quantity: 8, sequence_number: 2 }),
    createInventoryEvent({ ...base, type: "STOCK_OUT", from_location: "Main Bar", quantity: 3, sequence_number: 3 }),
    createInventoryEvent({ ...base, type: "STOCK_ADJUSTMENT", to_location: "Main Bar", quantity: -1, sequence_number: 4 }),
  ];

  const stock = computeStock(events);

  assert.equal(stock["product-gin"]["Dry Store"], 16);
  assert.equal(stock["product-gin"]["Main Bar"], 4);
});

test("stock reverts apply the inverse of the referenced original event", () => {
  const stockOut = createInventoryEvent({
    ...base,
    type: "STOCK_OUT",
    from_location: "Main Bar",
    quantity: 5,
    sequence_number: 2,
  });
  const events = [
    createInventoryEvent({ ...base, type: "STOCK_IN", to_location: "Main Bar", quantity: 10, sequence_number: 1 }),
    stockOut,
    createInventoryEvent({
      ...base,
      type: "STOCK_REVERT",
      from_location: "Main Bar",
      quantity: 5,
      sequence_number: 3,
      original_event_id: stockOut.event_id,
    }),
  ];

  const stock = computeStock(events);

  assert.equal(stock["product-gin"]["Main Bar"], 10);
});

test("validation rejects impossible event shapes with actionable reasons", () => {
  const transfer = createInventoryEvent({
    ...base,
    type: "STOCK_TRANSFER",
    from_location: "Main Bar",
    to_location: null,
    quantity: 2,
    sequence_number: 1,
  });

  assert.deepEqual(validateEvent(transfer), {
    valid: false,
    reason: "STOCK_TRANSFER requires both from_location and to_location.",
  });
});

test("validation rejects STOCK_IN without destination location", () => {
  const input = createInventoryEvent({
    ...base,
    type: "STOCK_IN",
    to_location: null,
    quantity: 3,
    sequence_number: 1,
  });

  assert.deepEqual(validateEvent(input), {
    valid: false,
    reason: "STOCK_IN requires destination location.",
  });
});

test("validation rejects STOCK_OUT without source location", () => {
  const output = createInventoryEvent({
    ...base,
    type: "STOCK_OUT",
    from_location: null,
    quantity: 3,
    sequence_number: 1,
  });

  assert.deepEqual(validateEvent(output), {
    valid: false,
    reason: "STOCK_OUT requires source location.",
  });
});

test("validation rejects STOCK_TRANSFER when source and destination are the same", () => {
  const transfer = createInventoryEvent({
    ...base,
    type: "STOCK_TRANSFER",
    from_location: "Dry Store",
    to_location: "Dry Store",
    quantity: 2,
    sequence_number: 1,
  });

  assert.deepEqual(validateEvent(transfer), {
    valid: false,
    reason: "STOCK_TRANSFER requires different source and destination locations.",
  });
});

test("sync batch is atomic and preserves ledger when one event is invalid", () => {
  const existing = [
    createInventoryEvent({ ...base, type: "STOCK_IN", to_location: "Main Bar", quantity: 10, sequence_number: 1 }),
  ];
  const incoming = [
    createInventoryEvent({ ...base, type: "STOCK_OUT", from_location: "Main Bar", quantity: 2, sequence_number: 2 }),
    createInventoryEvent({ ...base, type: "STOCK_OUT", from_location: null, quantity: 1, sequence_number: 3 }),
  ];

  const result = applySyncBatch(existing, incoming);

  assert.equal(result.success, false);
  assert.equal(result.ledger.length, 1);
  assert.deepEqual(result.failed_event_ids, [incoming[1].event_id]);
});

test("sync batch ignores idempotent duplicates and commits only new events", () => {
  const original = createInventoryEvent({
    ...base,
    type: "STOCK_IN",
    to_location: "Cellar",
    quantity: 6,
    sequence_number: 1,
    idempotency_key: "fixed-key",
  });
  const duplicate = { ...original, event_id: "event-resubmitted-copy" };
  const next = createInventoryEvent({
    ...base,
    type: "STOCK_TRANSFER",
    from_location: "Cellar",
    to_location: "Main Bar",
    quantity: 2,
    sequence_number: 2,
  });

  const result = applySyncBatch([original], [duplicate, next]);

  assert.equal(result.success, true);
  assert.equal(result.processed_count, 1);
  assert.equal(result.duplicate_count, 1);
  assert.equal(result.ledger.length, 2);
});

test("STOCK_REVERT ignores its own quantity and reverses original event impact", () => {
  const original = createInventoryEvent({
    ...base,
    type: "STOCK_OUT",
    from_location: "Main Bar",
    quantity: 5,
    sequence_number: 2,
  });
  const events = [
    createInventoryEvent({ ...base, type: "STOCK_IN", to_location: "Main Bar", quantity: 10, sequence_number: 1 }),
    original,
    createInventoryEvent({
      ...base,
      type: "STOCK_REVERT",
      from_location: "Main Bar",
      to_location: null,
      quantity: 1,
      original_event_id: original.event_id,
      sequence_number: 3,
    }),
  ];
  const stock = computeStock(events);

  assert.equal(stock["product-gin"]["Main Bar"], 10);
});

test("STOCK_ADJUSTMENT accepts both negative and positive quantity", () => {
  assert.equal(
    validateEvent(
      createInventoryEvent({
        ...base,
        type: "STOCK_ADJUSTMENT",
        to_location: "Main Bar",
        quantity: -2,
        sequence_number: 1,
      }),
    ).valid,
    true,
  );
  assert.equal(
    validateEvent(
      createInventoryEvent({
        ...base,
        type: "STOCK_ADJUSTMENT",
        to_location: "Main Bar",
        quantity: 2,
        sequence_number: 2,
      }),
    ).valid,
    true,
  );
});

test("audit trail exposes deterministic order and event impact details", () => {
  const events = [
    createInventoryEvent({ ...base, type: "STOCK_OUT", from_location: "Main Bar", quantity: 1, sequence_number: 2 }),
    createInventoryEvent({ ...base, type: "STOCK_IN", to_location: "Main Bar", quantity: 4, sequence_number: 1 }),
  ];

  const trail = replayAuditTrail(events);

  assert.deepEqual(
    trail.map((entry) => [entry.sequence_number, entry.location, entry.delta, entry.running_balance]),
    [
      [1, "Main Bar", 4, 4],
      [2, "Main Bar", -1, 3],
    ],
  );
});
