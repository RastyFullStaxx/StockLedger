export function appendStockActionBusinessRecord(
  { sales = [], purchases = [] },
  events = [],
  form = {},
  { clients = [], suppliers = [], saleTypeLabels = {}, productName = (productId) => productId, now = () => Date.now() } = {},
) {
  const first = events[0];
  const nextSales = Array.isArray(sales) ? sales : [];
  const nextPurchases = Array.isArray(purchases) ? purchases : [];

  if (!first?.source_type || !first.source_id) {
    return { sales: nextSales, purchases: nextPurchases };
  }

  const timestamp = now();
  const selectedProducts = events.map((event) => event.product_id);
  const totalQuantity = events.reduce((total, event) => total + Math.abs(Number(event.quantity)), 0);
  const itemLabel = events.length === 1 ? productName(first.product_id) : `${events.length} products`;

  if (first.source_type === "sale") {
    const client = clients.find((candidate) => candidate.id === form.sale_client_id) ?? clients[0];
    return {
      sales: [
        ...nextSales,
        {
          id: first.source_id,
          client_id: client?.id ?? form.sale_client_id ?? "",
          sale_type: saleTypeLabels[form.sale_type] ? form.sale_type : "one_time",
          sale_mode: "direct_stock",
          menu_item_id: null,
          product_id: first.product_id,
          product_ids: selectedProducts,
          item_label: itemLabel,
          location: first.from_location,
          quantity: totalQuantity,
          notes: `${form.sale_notes ?? ""}`.trim(),
          event_id: first.event_id,
          event_count: events.length,
          work_item_id: first.work_item_id,
          created_at: new Date(timestamp).toISOString(),
          status: "queued",
        },
      ],
      purchases: nextPurchases,
      selectedSaleId: null,
    };
  }

  if (first.source_type === "purchase") {
    const supplier = suppliers.find((candidate) => candidate.id === form.purchase_supplier_id) ?? suppliers[0];
    return {
      sales: nextSales,
      purchases: [
        ...nextPurchases,
        {
          id: first.source_id,
          supplier_id: supplier?.id ?? form.purchase_supplier_id ?? "",
          product_id: first.product_id,
          product_ids: selectedProducts,
          item_label: itemLabel,
          location: first.to_location,
          quantity: totalQuantity,
          notes: `${form.purchase_notes ?? ""}`.trim(),
          event_id: first.event_id,
          event_count: events.length,
          work_item_id: first.work_item_id,
          created_at: new Date(timestamp).toISOString(),
          status: "queued",
        },
      ],
      selectedPurchaseId: null,
    };
  }

  return { sales: nextSales, purchases: nextPurchases };
}

export function removeStockActionBusinessRecordForUndo({ sales = [], purchases = [] }, primaryEvent = {}) {
  if (primaryEvent.source_type === "sale" && primaryEvent.source_id) {
    return {
      sales: (Array.isArray(sales) ? sales : []).filter((record) => record.id !== primaryEvent.source_id),
      purchases: Array.isArray(purchases) ? purchases : [],
    };
  }

  if (primaryEvent.source_type === "purchase" && primaryEvent.source_id) {
    return {
      sales: Array.isArray(sales) ? sales : [],
      purchases: (Array.isArray(purchases) ? purchases : []).filter((record) => record.id !== primaryEvent.source_id),
    };
  }

  return {
    sales: Array.isArray(sales) ? sales : [],
    purchases: Array.isArray(purchases) ? purchases : [],
  };
}

export function markStockActionBusinessRecordsSynced({ sales = [], purchases = [] }, events = []) {
  const saleIds = new Set(events.filter((event) => event.source_type === "sale").map((event) => event.source_id).filter(Boolean));
  const purchaseIds = new Set(
    events.filter((event) => event.source_type === "purchase").map((event) => event.source_id).filter(Boolean),
  );

  return {
    sales:
      saleIds.size > 0
        ? (Array.isArray(sales) ? sales : []).map((record) => (saleIds.has(record.id) ? { ...record, status: "synced" } : record))
        : Array.isArray(sales)
        ? sales
        : [],
    purchases:
      purchaseIds.size > 0
        ? (Array.isArray(purchases) ? purchases : []).map((record) =>
            purchaseIds.has(record.id) ? { ...record, status: "synced" } : record,
          )
        : Array.isArray(purchases)
        ? purchases
        : [],
  };
}
