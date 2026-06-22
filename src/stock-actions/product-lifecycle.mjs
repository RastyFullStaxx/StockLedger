import { computeStock, createInventoryEvent } from "../domain/ledger.mjs";
import { withWorkItem } from "../inventory/selectors.mjs";

export const PRODUCT_DEACTIVATION_REASON = "Product deactivated; balances auto-closed by system";
export const PRODUCT_DEACTIVATE_EPSILON = 0.0001;
export const PRODUCT_EVENT_PREFIX = "PRODUCT_";

export function nextProductId(name, catalog = []) {
  const normalized = `${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "product";
  const ids = new Set(catalog.map((product) => product.id));
  let candidate = `prod-${normalized}`;
  let suffix = 1;

  while (ids.has(candidate)) {
    candidate = `prod-${normalized}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function productLastStateLabel(product, { displayDateTime = (value) => value } = {}) {
  if (product.is_active) {
    return product.reactivated_at
      ? `Reactivated ${displayDateTime(product.reactivated_at)} by ${product.reactivated_by || "operator"}`
      : "Active";
  }

  const base = product.deactivated_at
    ? `Suspended ${displayDateTime(product.deactivated_at)} by ${product.deactivated_by || "operator"}`
    : "Suspended";
  const reason = `${product.deactivated_reason || ""}`.trim();
  return reason ? `${base}. ${reason}` : base;
}

export function normalizeClosureQuantity(value, epsilon = PRODUCT_DEACTIVATE_EPSILON) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) < epsilon) return 0;
  return Number(amount.toFixed(6));
}

export function productDeactivationClosures(product, events = []) {
  const stock = computeStock(events);
  const balances = stock[product.id];
  if (!balances) return [];

  return Object.entries(balances)
    .map(([location, quantity]) => {
      const safeQuantity = normalizeClosureQuantity(quantity);
      if (safeQuantity === 0) return null;

      return {
        location,
        balance: safeQuantity,
        closureQuantity: normalizeClosureQuantity(-safeQuantity),
      };
    })
    .filter(Boolean);
}

export function formatDeactivationClosures(closures = [], { formatQuantity = (value) => `${value}` } = {}) {
  if (!closures.length) return "No stock remains to close.";

  return closures
    .map((entry) => `${entry.location}: ${entry.balance > 0 ? "+" : ""}${formatQuantity(entry.balance)}`)
    .join(" | ");
}

export function formatMultiProductDeactivationClosures(
  products = [],
  { events = [], formatQuantity = (value) => `${value}` } = {},
) {
  return products
    .map((product) => `${product.name}: ${formatDeactivationClosures(productDeactivationClosures(product, events), { formatQuantity })}`)
    .join(" / ");
}

export function hasPendingProductClosureDebt(outbox = [], productId, reason = PRODUCT_DEACTIVATION_REASON) {
  return outbox.some(
    (event) => event.type === "STOCK_ADJUSTMENT" && event.product_id === productId && event.reason === reason,
  );
}

export function buildProductSuspensionWork(
  products = [],
  events = [],
  {
    tenant = {},
    reason = "",
    nextId = (prefix) => `${prefix}-${Date.now()}`,
    currentBatchId = () => "local-batch",
    nextSequence = () => 1,
    now = () => Date.now(),
  } = {},
) {
  const actorReason = `${reason ?? ""}`.trim();
  const batchId = currentBatchId();
  let sequence = nextSequence();

  return products.flatMap((product) => {
    const workItemId = nextId("work-product-suspended");
    const lifecycleEvent = withWorkItem(
      createInventoryEvent({
        ...tenant,
        event_id: nextId("suspend"),
        idempotency_key: nextId("idem-suspend"),
        sync_batch_id: batchId,
        type: "PRODUCT_DEACTIVATED",
        product_id: product.id,
        product_name: product.name,
        quantity: 0,
        reason: actorReason ? `Product suspended: ${actorReason}` : "Product suspended",
        sequence_number: sequence++,
        timestamp: now(),
        status: "queued",
      }),
      workItemId,
    );
    const closureEvents = productDeactivationClosures(product, events).map((entry) =>
      withWorkItem(
        createInventoryEvent({
          ...tenant,
          event_id: nextId("suspend-closure"),
          idempotency_key: nextId("idem-suspend-closure"),
          sync_batch_id: batchId,
          type: "STOCK_ADJUSTMENT",
          product_id: product.id,
          product_name: product.name,
          to_location: entry.location,
          quantity: entry.closureQuantity,
          reason: PRODUCT_DEACTIVATION_REASON,
          sequence_number: sequence++,
          timestamp: now(),
          status: "queued",
        }),
        workItemId,
      ),
    );
    return [lifecycleEvent, ...closureEvents];
  });
}

export function applyProductSuspension(catalog = [], products = [], { reason = "", tenant = {}, now = () => Date.now() } = {}) {
  const selectedIds = new Set(products.map((product) => product.id));
  const actorReason = `${reason ?? ""}`.trim();

  return catalog.map((current) =>
    selectedIds.has(current.id)
      ? {
          ...current,
          is_active: false,
          deactivated_at: new Date(now()).toISOString(),
          deactivated_by: tenant.user_id,
          deactivated_reason: actorReason || "",
          reactivated_at: null,
          reactivated_by: null,
        }
      : current,
  );
}

export function buildProductReactivationWork(
  products = [],
  {
    tenant = {},
    reason = "",
    nextId = (prefix) => `${prefix}-${Date.now()}`,
    currentBatchId = () => "local-batch",
    nextSequence = () => 1,
    now = () => Date.now(),
  } = {},
) {
  const actorReason = `${reason ?? ""}`.trim();
  const batchId = currentBatchId();
  let sequence = nextSequence();

  return products.map((product) =>
    withWorkItem(
      createInventoryEvent({
        ...tenant,
        event_id: nextId("reactivate"),
        idempotency_key: nextId("idem-reactivate"),
        sync_batch_id: batchId,
        type: "PRODUCT_REACTIVATED",
        product_id: product.id,
        product_name: product.name,
        quantity: 0,
        reason: actorReason ? `Product reactivated: ${actorReason}` : "Product reactivated",
        sequence_number: sequence++,
        timestamp: now(),
        status: "queued",
      }),
      nextId("work-product-reactivated"),
    ),
  );
}

export function applyProductReactivation(catalog = [], products = [], { tenant = {}, now = () => Date.now() } = {}) {
  const selectedIds = new Set(products.map((product) => product.id));

  return catalog.map((current) =>
    selectedIds.has(current.id)
      ? {
          ...current,
          is_active: true,
          reactivated_at: new Date(now()).toISOString(),
          reactivated_by: tenant.user_id,
        }
      : current,
  );
}
