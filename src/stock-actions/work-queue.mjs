const DEFAULT_PRODUCT_EVENT_PREFIX = "PRODUCT_";

export function buildWorkQueueItems(
  outboxValidation,
  {
    eventLabels,
    productName,
    formatQuantity,
    simpleValidationReason,
    productEventPrefix = DEFAULT_PRODUCT_EVENT_PREFIX,
  },
) {
  const grouped = new Map();

  outboxValidation.forEach(({ event, validation }) => {
    const workItemId = event.work_item_id || event.event_id;
    if (!grouped.has(workItemId)) {
      grouped.set(workItemId, {
        work_item_id: workItemId,
        events: [],
        validations: [],
      });
    }

    const item = grouped.get(workItemId);
    item.events.push(event);
    item.validations.push(validation);
  });

  return [...grouped.values()].map((item) => {
    const primary =
      item.events.find((event) => event.type === "PRODUCT_DEACTIVATED") ??
      item.events.find((event) => event.type.startsWith(productEventPrefix)) ??
      item.events[0];
    const invalid = item.validations.find((validation) => !validation.valid);
    const isGrouped = item.events.length > 1;

    return {
      ...item,
      sequence_number: Math.min(...item.events.map((event) => Number(event.sequence_number))),
      label: eventLabels[primary.type] ?? primary.type,
      product_name: isGrouped && primary.source_label ? primary.source_label : productName(primary.product_id),
      location: isGrouped ? `Grouped work: ${item.events.length} events` : eventLocationText(primary),
      amount: isGrouped ? `${item.events.length} stock lines` : formatQuantity(primary.quantity),
      detail: isGrouped ? `${item.events.length} grouped event records` : primary.idempotency_key,
      detailIsCode: !isGrouped,
      source: primary.source_label ?? "",
      event_count: item.events.length,
      valid: !invalid,
      status: invalid ? simpleValidationReason(invalid.reason) : "Ready",
    };
  });
}

export function eventLocationText(event) {
  if (event.type === "STOCK_IN") return `Arrived at ${event.to_location || "Unknown Place"}`;
  if (event.type === "STOCK_OUT") return `Left from ${event.from_location || "Unknown Place"}`;
  if (event.type === "STOCK_TRANSFER") return `${event.from_location || "Unknown Place"} to ${event.to_location || "Unknown Place"}`;
  if (event.type === "STOCK_ADJUSTMENT") return `Corrected at ${event.to_location || event.from_location || "Unknown Place"}`;
  if (event.type === "STOCK_REVERT") return "Undoes an earlier movement";
  if (event.type === "PRODUCT_CREATED") return "Product catalog";
  if (event.type === "PRODUCT_DEACTIVATED") return "Product catalog";
  if (event.type === "PRODUCT_REACTIVATED") return "Product catalog";
  return `${event.from_location || "None"} to ${event.to_location || "None"}`;
}
