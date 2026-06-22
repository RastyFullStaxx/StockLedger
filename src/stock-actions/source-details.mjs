import { normalizeSelectedProductIds } from "../state/local-state.mjs";

export function buildStockActionSourceDetails(
  form,
  { clients = [], suppliers = [], saleTypeLabels = {}, nextId = () => undefined } = {},
) {
  const selectedCount = normalizeSelectedProductIds(form.product_ids, form.product_id).length;

  if (form.type === "STOCK_OUT" && form.attach_sale) {
    const client = clients.find((candidate) => candidate.id === form.sale_client_id) ?? clients[0];
    const clientName = client?.name ?? "client";
    const saleId = form.pending_source_id ?? nextId("sale");
    return {
      type: "sale",
      id: saleId,
      label: `Sale - ${clientName} - ${selectedCount} product${selectedCount === 1 ? "" : "s"}`,
      reason: `${form.sale_notes || form.reason || `${saleTypeLabels[form.sale_type] ?? "Sale"} fulfilled for ${clientName}`}`.trim(),
    };
  }

  if (form.type === "STOCK_IN" && form.attach_purchase) {
    const supplier = suppliers.find((candidate) => candidate.id === form.purchase_supplier_id) ?? suppliers[0];
    const supplierName = supplier?.name ?? "supplier";
    const purchaseId = form.pending_source_id ?? nextId("purchase");
    return {
      type: "purchase",
      id: purchaseId,
      label: `Purchase - ${supplierName} - ${selectedCount} product${selectedCount === 1 ? "" : "s"}`,
      reason: `${form.purchase_notes || form.reason || `Purchase received from ${supplierName}`}`.trim(),
    };
  }

  return {
    type: undefined,
    id: undefined,
    label: undefined,
    reason: "",
  };
}
