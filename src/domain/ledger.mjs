export const EVENT_TYPES = Object.freeze([
  "STOCK_IN",
  "STOCK_OUT",
  "STOCK_TRANSFER",
  "STOCK_ADJUSTMENT",
  "STOCK_REVERT",
  "PRODUCT_CREATED",
  "PRODUCT_DEACTIVATED",
  "PRODUCT_REACTIVATED",
]);

const LOCATION_NOT_APPLICABLE = "Unassigned";
const PRODUCT_AUDIT_EVENT_TYPES = new Set(["PRODUCT_CREATED", "PRODUCT_DEACTIVATED", "PRODUCT_REACTIVATED"]);
const AUDIT_LOCATION = "Catalog";

export function createInventoryEvent(input) {
  const timestamp = input.timestamp ?? Date.now();
  const sequence = Number(input.sequence_number ?? 1);
  const eventId = input.event_id ?? stableId("event", input.type, timestamp, sequence, input.product_id);
  const quantity = input.quantity ?? 0;

  return {
    event_id: eventId,
    client_id: input.client_id,
    device_id: input.device_id,
    user_id: input.user_id,
    type: input.type,
    product_id: input.product_id,
    from_location: input.from_location ?? null,
    to_location: input.to_location ?? null,
    quantity: Number(quantity),
    timestamp,
    sequence_number: sequence,
    idempotency_key: input.idempotency_key ?? stableId("idem", eventId, input.sync_batch_id ?? "local"),
    sync_batch_id: input.sync_batch_id ?? "local-batch",
    original_event_id: input.original_event_id ?? null,
    created_at: input.created_at ?? new Date(timestamp).toISOString(),
    actor_name: input.actor_name ?? "Local operator",
    device_name: input.device_name ?? input.device_id,
    product_name: input.product_name ?? input.product_id,
    reason: input.reason ?? "",
    status: input.status ?? "queued",
  };
}

export function validateEvent(event) {
  if (!event || typeof event !== "object") {
    return invalid("Event payload is required.");
  }

  const required = [
    "event_id",
    "client_id",
    "device_id",
    "user_id",
    "type",
    "product_id",
    "quantity",
    "timestamp",
    "sequence_number",
    "idempotency_key",
    "sync_batch_id",
  ];

  for (const field of required) {
    if (event[field] === undefined || event[field] === null || event[field] === "") {
      return invalid(`${field} is required.`);
    }
  }

  if (!EVENT_TYPES.includes(event.type)) {
    return invalid(`Unsupported event type: ${event.type}.`);
  }

  const quantity = Number(event.quantity);

  if (!Number.isFinite(quantity)) {
    return invalid("quantity must be a finite number.");
  }

  if (PRODUCT_AUDIT_EVENT_TYPES.has(event.type) && quantity !== 0) {
    return invalid("Product lifecycle events require quantity of 0.");
  }

  if (!PRODUCT_AUDIT_EVENT_TYPES.has(event.type) && quantity === 0) {
    return invalid("quantity must be a non-zero number.");
  }

  if (Number(event.quantity) < 0 && !["STOCK_ADJUSTMENT", "STOCK_REVERT"].includes(event.type)) {
    return invalid(`${event.type} quantity must be positive.`);
  }

  if (event.type === "STOCK_TRANSFER" && (!event.from_location || !event.to_location)) {
    return invalid("STOCK_TRANSFER requires both from_location and to_location.");
  }

  if (event.type === "STOCK_TRANSFER" && event.from_location === event.to_location) {
    return invalid("STOCK_TRANSFER requires different source and destination locations.");
  }

  if (event.type === "STOCK_IN" && !event.to_location) {
    return invalid("STOCK_IN requires destination location.");
  }

  if (event.type === "STOCK_OUT" && !event.from_location) {
    return invalid("STOCK_OUT requires source location.");
  }

  if (event.type === "STOCK_REVERT" && !event.original_event_id) {
    return invalid("STOCK_REVERT requires original_event_id.");
  }

  if (event.type === "STOCK_ADJUSTMENT" && !event.from_location && !event.to_location) {
    return invalid("STOCK_ADJUSTMENT requires a location.");
  }

  if (event.type === "STOCK_REVERT" && !event.from_location && !event.to_location) {
    return invalid("STOCK_REVERT requires location from the original movement.");
  }

  return { valid: true };
}

export function computeStock(events) {
  const stock = {};
  const ordered = sortEvents(events);
  const eventById = new Map(ordered.map((event) => [event.event_id, event]));

  for (const event of ordered) {
    for (const impact of eventImpacts(event, eventById)) {
      addStock(stock, event.product_id, impact.location, impact.delta);
    }
  }

  return stock;
}

export function replayAuditTrail(events) {
  const balances = {};
  const ordered = sortEvents(events);
  const eventById = new Map(ordered.map((event) => [event.event_id, event]));
  const trail = [];

  for (const event of ordered) {
    const impacts = eventImpacts(event, eventById);
    if (impacts.length === 0) {
      trail.push({
        event_id: event.event_id,
        type: event.type,
        product_id: event.product_id,
        product_name: event.product_name,
        location: auditLocation(event),
        delta: 0,
        running_balance: null,
        timestamp: event.timestamp,
        sequence_number: event.sequence_number,
        actor_name: event.actor_name,
        device_name: event.device_name,
        sync_batch_id: event.sync_batch_id,
        idempotency_key: event.idempotency_key,
        reason: event.reason,
      });
      continue;
    }

    for (const impact of impacts) {
      const product = event.product_id;
      const location = impact.location;
      balances[product] ??= {};
      balances[product][location] = Number(((balances[product][location] ?? 0) + impact.delta).toFixed(4));
      trail.push({
        event_id: event.event_id,
        type: event.type,
        product_id: product,
        product_name: event.product_name,
        location,
        delta: impact.delta,
        running_balance: balances[product][location],
        timestamp: event.timestamp,
        sequence_number: event.sequence_number,
        actor_name: event.actor_name,
        device_name: event.device_name,
        sync_batch_id: event.sync_batch_id,
        idempotency_key: event.idempotency_key,
        reason: event.reason,
      });
    }
  }

  return trail;
}

export function applySyncBatch(ledger, incomingEvents, options = {}) {
  const existingKeys = new Set(ledger.map((event) => event.idempotency_key));
  const batchKeys = new Set();
  const failed = [];
  const duplicates = [];
  const accepted = [];

  for (const event of incomingEvents) {
    const validation = validateEvent(event);
    if (!validation.valid) {
      failed.push({ event_id: event.event_id, reason: validation.reason });
      continue;
    }

    if (existingKeys.has(event.idempotency_key) || batchKeys.has(event.idempotency_key)) {
      duplicates.push(event);
      continue;
    }

    batchKeys.add(event.idempotency_key);
    accepted.push({ ...event, status: options.status ?? "synced" });
  }

  if (failed.length > 0) {
    return {
      success: false,
      error: "VALIDATION_FAILED",
      failed_event_ids: failed.map((entry) => entry.event_id),
      failures: failed,
      processed_count: 0,
      duplicate_count: duplicates.length,
      rejected_count: incomingEvents.length,
      ledger,
      server_timestamp: Date.now(),
    };
  }

  return {
    success: true,
    processed_count: accepted.length,
    duplicate_count: duplicates.length,
    rejected_count: 0,
    ledger: sortEvents([...ledger, ...accepted]),
    server_timestamp: Date.now(),
  };
}

export function sortEvents(events) {
  return [...events].sort((first, second) => {
    return (
      Number(first.sequence_number) - Number(second.sequence_number) ||
      Number(first.timestamp) - Number(second.timestamp) ||
      String(first.event_id).localeCompare(String(second.event_id))
    );
  });
}

export function summarizeStock(events, products = [], locations = []) {
  const stock = computeStock(events);
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  const locationNames = locations.map((location) => location.name);
  const rows = [];

  for (const productId of Object.keys(stock).sort()) {
    for (const location of Object.keys(stock[productId]).sort()) {
      rows.push({
        product_id: productId,
        product_name: productNames.get(productId) ?? productId,
        location,
        quantity: stock[productId][location],
      });
    }
  }

  for (const product of products) {
    for (const location of locationNames) {
      if (!stock[product.id]?.[location]) {
        rows.push({
          product_id: product.id,
          product_name: product.name,
          location,
          quantity: 0,
        });
      }
    }
  }

  return rows.sort((first, second) => {
    return first.product_name.localeCompare(second.product_name) || first.location.localeCompare(second.location);
  });
}

function eventImpacts(event, eventById) {
  const quantity = Number(event.quantity);

  if (event.type === "STOCK_IN") {
    return [{ location: event.to_location ?? LOCATION_NOT_APPLICABLE, delta: quantity }];
  }

  if (event.type === "STOCK_OUT") {
    return [{ location: event.from_location ?? LOCATION_NOT_APPLICABLE, delta: -quantity }];
  }

  if (event.type === "STOCK_TRANSFER") {
    return [
      { location: event.from_location ?? LOCATION_NOT_APPLICABLE, delta: -quantity },
      { location: event.to_location ?? LOCATION_NOT_APPLICABLE, delta: quantity },
    ];
  }

  if (event.type === "STOCK_ADJUSTMENT") {
    return [{ location: event.to_location ?? event.from_location ?? LOCATION_NOT_APPLICABLE, delta: quantity }];
  }

  if (PRODUCT_AUDIT_EVENT_TYPES.has(event.type)) {
    return [];
  }

  if (event.type === "STOCK_REVERT") {
    const original = eventById.get(event.original_event_id);
    if (!original) {
      return [{ location: event.to_location ?? event.from_location ?? LOCATION_NOT_APPLICABLE, delta: quantity }];
    }

    return eventImpacts(original, eventById).map((impact) => ({
      location: impact.location,
      delta: -impact.delta,
    }));
  }

  return [];
}

function auditLocation(event) {
  if (PRODUCT_AUDIT_EVENT_TYPES.has(event.type)) {
    return AUDIT_LOCATION;
  }

  return LOCATION_NOT_APPLICABLE;
}

function addStock(stock, productId, location, delta) {
  stock[productId] ??= {};
  stock[productId][location] = Number(((stock[productId][location] ?? 0) + delta).toFixed(4));
}

function invalid(reason) {
  return { valid: false, reason };
}

function stableId(prefix, ...parts) {
  const source = parts.join(":");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }

  return `${prefix}-${Math.abs(hash).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
