import { sortEvents, summarizeStock } from "../domain/ledger.mjs";

export const TABLE_PAGE_SIZE = 10;

export function allLocalEvents(state) {
  return sortEvents([...(state.serverLedger ?? []), ...(state.outbox ?? [])]);
}

export function filteredStockRows(
  events,
  {
    products,
    locations,
    productFilter = "all",
    locationFilter = "all",
    stockSearch = "",
  },
) {
  const searchTerm = String(stockSearch || "").trim().toLowerCase();

  return summarizeStock(events, products, locations).filter((row) => {
    const productMatch = productFilter === "all" || row.product_id === productFilter;
    const locationMatch = locationFilter === "all" || row.location === locationFilter;
    const productName = String(row.product_name || "").toLowerCase();
    const productId = String(row.product_id || "").toLowerCase();
    const locationName = String(row.location || "").toLowerCase();
    const searchMatch = !searchTerm || productName.includes(searchTerm) || productId.includes(searchTerm) || locationName.includes(searchTerm);

    return productMatch && locationMatch && searchMatch;
  });
}

export function stockTotalRows(rows, products) {
  return products.map((product) => {
    const productRows = rows.filter((row) => row.product_id === product.id);
    return {
      product_id: product.id,
      product_name: product.name,
      quantity: productRows.reduce((total, row) => total + Number(row.quantity), 0),
      location_count: productRows.filter((row) => Number(row.quantity) > 0).length,
    };
  });
}

export function locationStockRows(rows, selectedLocation) {
  return rows.filter((row) => row.location === selectedLocation);
}

export function stockStatus(row, lowStock) {
  if (row.quantity < 0) return { tone: "error", label: "Check Now" };
  if (row.quantity <= lowStock) return { tone: "warning", label: "Low Stock" };
  return { tone: "valid", label: "Enough" };
}

export function paginateRows(rows, page, pageSize = TABLE_PAGE_SIZE) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  return { pageRows, page: safePage, totalPages, total };
}

export function simpleValidationReason(reason) {
  const messages = [
    ["STOCK_IN requires to_location", "Choose where the stock arrived."],
    ["STOCK_IN requires destination location", "Choose where the stock arrived."],
    ["STOCK_OUT requires from_location", "Choose where the stock left from."],
    ["STOCK_OUT requires source location", "Choose where the stock left from."],
    ["STOCK_TRANSFER requires both", "Choose the starting place and ending place."],
    ["different source and destination", "Choose two different locations."],
    ["STOCK_REVERT requires original_event_id", "Choose the original movement to undo."],
    ["quantity must be a non-zero number", "Enter an amount greater than zero."],
    ["quantity must be positive", "Use a positive amount for this action."],
  ];

  return messages.find(([match]) => reason.includes(match))?.[1] ?? reason;
}

export function nextSequence(events) {
  return events.reduce((max, event) => Math.max(max, Number(event.sequence_number)), 0) + 1;
}

export function currentBatchId(state, events, date = new Date()) {
  return state.outbox?.[0]?.sync_batch_id ?? `batch-${date.toISOString().slice(0, 10)}-${nextSequence(events)}`;
}

export function nextId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function withWorkItem(event, workItemId) {
  return {
    ...event,
    work_item_id: workItemId,
  };
}
