import { actionTemplate } from "../config/app-config.mjs";
import { createInventoryEvent } from "../domain/ledger.mjs";
import { withWorkItem } from "../inventory/selectors.mjs";
import { normalizeSelectedProductIds } from "../state/local-state.mjs";
import { buildStockActionSourceDetails } from "./source-details.mjs";

export function createStockActionEventBuilder({
  tenant = {},
  nextId = (prefix) => `${prefix}-${Date.now()}`,
  currentBatchId = () => "local-batch",
  nextSequence = () => 1,
  findEventForRevert = () => null,
  productName = (productId) => productId,
  formatQuantity = (value) => `${value}`,
  systemCountForProduct = () => null,
  sourceDetailsOptions = {},
  now = () => Date.now(),
} = {}) {
  function buildEvents(form) {
    if (form.type === "STOCK_REVERT") return [buildEvent(form)];

    const selectedIds = normalizeSelectedProductIds(form.product_ids, form.product_id);
    const workItemId = selectedIds.length > 1 || form.attach_sale || form.attach_purchase ? nextId("work") : undefined;
    const batchId = currentBatchId();
    const firstSequence = nextSequence();
    const sourceDetails = buildBatchSourceDetails(form);

    return selectedIds.map((productId, index) =>
      buildEvent(form, {
        productId,
        workItemId,
        batchId,
        sequenceNumber: firstSequence + index,
        sourceDetails,
      }),
    );
  }

  function buildEvent(
    form,
    {
      productId = form.product_id,
      workItemId = nextId("work"),
      batchId = currentBatchId(),
      sequenceNumber = nextSequence(),
      sourceDetails = null,
    } = {},
  ) {
    const template = actionTemplate(form.type);
    const reason = `${form.reason ?? ""}`.trim();

    if (form.type === "STOCK_REVERT") {
      return buildRevertEvent(form, { workItemId, batchId, sequenceNumber });
    }

    const systemCount = systemCountForProduct(form, productId);
    const physicalCount = physicalCountForProduct(form, productId);
    const defaultReason =
      template.isPhysicalCount && systemCount !== null
        ? `Physical count ${formatQuantity(Number(physicalCount || 0))} vs system ${formatQuantity(systemCount)}`
        : "Operational event";
    const source = sourceDetails ?? buildStockActionSourceDetails(form, { ...sourceDetailsOptions, nextId });

    return withWorkItem(
      createInventoryEvent({
        ...tenant,
        event_id: nextId("event"),
        idempotency_key: nextId("idem"),
        sync_batch_id: batchId,
        type: form.type,
        product_id: productId,
        product_name: productName(productId),
        from_location: form.from_location || null,
        to_location: form.to_location || null,
        quantity: eventQuantity(form, template, productId, systemCount),
        original_event_id: form.original_event_id || null,
        reason: source.reason || reason || defaultReason,
        source_type: source.type,
        source_id: source.id,
        source_label: source.label,
        sequence_number: sequenceNumber,
        timestamp: now(),
        status: "queued",
      }),
      workItemId,
    );
  }

  function buildRevertEvent(form, { workItemId, batchId, sequenceNumber }) {
    const original = findEventForRevert(form.original_event_id);
    const productId = original ? original.product_id : form.product_id;
    const reason = `${form.reason ?? ""}`.trim();

    return withWorkItem(
      createInventoryEvent({
        ...tenant,
        event_id: nextId("event"),
        idempotency_key: nextId("idem"),
        sync_batch_id: batchId,
        type: "STOCK_REVERT",
        product_id: productId,
        product_name: productName(productId),
        from_location: original ? original.from_location : null,
        to_location: original ? original.to_location : null,
        quantity: original ? Math.abs(toIntegerQuantity(original.quantity)) : 1,
        original_event_id: form.original_event_id || null,
        reason: reason || "Operational event",
        sequence_number: sequenceNumber,
        timestamp: now(),
        status: "queued",
      }),
      workItemId,
    );
  }

  function buildBatchSourceDetails(form) {
    const pendingSourceId =
      form.type === "STOCK_OUT" && form.attach_sale
        ? nextId("sale")
        : form.type === "STOCK_IN" && form.attach_purchase
        ? nextId("purchase")
        : undefined;

    return buildStockActionSourceDetails({ ...form, pending_source_id: pendingSourceId }, { ...sourceDetailsOptions, nextId });
  }

  return { buildEvent, buildEvents };
}

export function quantityForProduct(form, productId) {
  return form.product_quantities?.[productId] ?? form.quantity ?? 1;
}

export function physicalCountForProduct(form, productId) {
  return form.product_physical_counts?.[productId] ?? form.physical_count ?? "";
}

export function physicalCountVariance(form, productId = form.product_id, systemCount = null) {
  if (systemCount === null) return null;
  const productPhysicalCount = physicalCountForProduct(form, productId);
  if (productPhysicalCount === "" || productPhysicalCount === null || productPhysicalCount === undefined) return null;
  const physical = Number(productPhysicalCount);
  if (!Number.isFinite(physical)) return null;
  return Number((physical - systemCount).toFixed(4));
}

function eventQuantity(form, template, productId, systemCount) {
  const quantity = toIntegerQuantity(quantityForProduct(form, productId));

  if (template.isPhysicalCount) {
    const variance = physicalCountVariance(form, productId, systemCount);
    if (!Number.isFinite(Number(variance))) {
      return Number.NaN;
    }
    return toIntegerQuantity(variance);
  }
  if (Number.isNaN(quantity)) return Number.NaN;
  if (template.requiresPositiveQuantity) return Math.abs(quantity);
  return quantity;
}

function toIntegerQuantity(rawQuantity) {
  const quantity = Number(rawQuantity);
  return Number.isFinite(quantity) && Number.isInteger(quantity) ? quantity : Number.NaN;
}
