import { defaultLocations, defaultProducts, defaultState } from "../data/demo-data.mjs";
import { buildProductionSeedState } from "../data/production-seed.mjs";

function seededDemoState() {
  return buildProductionSeedState();
}

export function seedDemoState() {
  return seededDemoState();
}

export const STORAGE_KEY = "stockledger-local-prototype-state-v1";

function preferSeedIfEmpty(candidate, seedValue) {
  if (!Array.isArray(candidate) || candidate.length === 0) return seedValue;
  return candidate;
}

export function loadState(storage = globalThis.localStorage) {
  const saved = storage?.getItem(STORAGE_KEY);
  if (!saved) return seedDemoState();

  const seed = seedDemoState();

  try {
    const parsed = JSON.parse(saved);
    const next = {
      ...seed,
      ...parsed,
      form: { ...seed.form, ...(parsed.form ?? {}) },
      productForm: { ...seed.productForm, ...(parsed.productForm ?? {}) },
      saleForm: { ...seed.saleForm, ...(parsed.saleForm ?? {}) },
      purchaseForm: { ...seed.purchaseForm, ...(parsed.purchaseForm ?? {}) },
      sales: preferSeedIfEmpty(parsed.sales, seed.sales),
      purchases: preferSeedIfEmpty(parsed.purchases, seed.purchases),
      selectedClientId: parsed.selectedClientId ?? null,
      selectedSaleId: parsed.selectedSaleId ?? null,
      selectedPurchaseId: parsed.selectedPurchaseId ?? null,
      selectedSupplierId: parsed.selectedSupplierId ?? null,
      selectedMenuId: parsed.selectedMenuId ?? null,
      selectedLocationId: parsed.selectedLocationId ?? null,
      selectedUserId: parsed.selectedUserId ?? null,
      selectedAuditEventId: parsed.selectedAuditEventId ?? null,
      auditViewFilter: parsed.auditViewFilter ?? "all",
      auditSearch: parsed.auditSearch ?? "",
      auditProductFilter: parsed.auditProductFilter ?? "all",
      clientViewFilter: parsed.clientViewFilter ?? "all",
      clientSearch: parsed.clientSearch ?? "",
      clientMenuFilter: parsed.clientMenuFilter ?? "all",
      saleViewFilter: parsed.saleViewFilter ?? "all",
      saleSearch: parsed.saleSearch ?? "",
      saleClientFilter: parsed.saleClientFilter ?? "all",
      productSearch: parsed.productSearch ?? "",
      productStatusFilter: parsed.productStatusFilter ?? "active",
      productCategoryFilter: parsed.productCategoryFilter ?? "all",
      purchaseViewFilter: parsed.purchaseViewFilter ?? "all",
      purchaseSearch: parsed.purchaseSearch ?? "",
      purchaseSupplierFilter: parsed.purchaseSupplierFilter ?? "all",
      supplierViewFilter: parsed.supplierViewFilter ?? "all",
      supplierSearch: parsed.supplierSearch ?? "",
      supplierProductFilter: parsed.supplierProductFilter ?? "all",
      menuViewFilter: parsed.menuViewFilter ?? "all",
      menuSearch: parsed.menuSearch ?? "",
      menuClientFilter: parsed.menuClientFilter ?? "all",
      locationViewFilter: parsed.locationViewFilter ?? "all",
      locationSearch: parsed.locationSearch ?? "",
      locationKindFilter: parsed.locationKindFilter ?? "all",
      userViewFilter: parsed.userViewFilter ?? "all",
      userSearch: parsed.userSearch ?? "",
      userRoleFilter: parsed.userRoleFilter ?? "all",
      products: preferSeedIfEmpty(sanitizeProducts(parsed.products), seed.products),
      locations: preferSeedIfEmpty(sanitizeLocations(parsed.locations), seed.locations),
      locationModalOpen: false,
      locationForm: { ...seed.locationForm, ...(parsed.locationForm ?? {}) },
    };
    delete next.physicalCounts;
    delete next.selectedReconcileRowKey;
    next.form.product_ids = normalizeSelectedProductIds(next.form.product_ids, next.form.product_id);
    next.form.product_id = next.form.product_ids[0] ?? next.form.product_id ?? "";
    if (next.activeView === "reconcile" || next.activeView === "outbox") next.activeView = "compose";
    return next;
  } catch {
    return seedDemoState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  const { toast, accountOpen, locationModalOpen, guideOpen, assistantInput, assistantMessages, ...persistedState } = state;
  storage?.setItem(STORAGE_KEY, JSON.stringify(persistedState));
}

export function normalizeSelectedProductIds(productIds, fallbackProductId = "") {
  const rawIds = Array.isArray(productIds) ? productIds : [fallbackProductId];
  const seen = new Set();
  return rawIds
    .map((id) => `${id ?? ""}`.trim())
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export function sanitizeProducts(products) {
  if (!Array.isArray(products)) return defaultProducts();
  return products
    .map((product) => ({
      id: `${product.id ?? ""}`.trim() || `prod-${nextRandomId("prod")}`,
      name: `${product.name ?? ""}`.trim(),
      category: `${product.category ?? ""}`.trim(),
      unit: `${product.unit ?? "unit"}`.trim() || "unit",
      low: Number(product.low) || 0,
      is_active: product.is_active !== false,
      deactivated_at: product.deactivated_at ?? null,
      deactivated_by: product.deactivated_by ?? null,
      deactivated_reason: product.deactivated_reason ?? "",
      reactivated_at: product.reactivated_at ?? null,
      reactivated_by: product.reactivated_by ?? null,
    }))
    .filter((product) => product.name);
}

export function sanitizeLocations(locationRows) {
  if (!Array.isArray(locationRows)) return defaultLocations();

  const seen = new Set();
  return locationRows
    .map((location) => {
      const name = `${location.name ?? ""}`.trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return null;
      seen.add(key);

      return {
        id: `${location.id ?? ""}`.trim() || nextLocationId(name),
        name,
        kind: normalizeLocationKind(location.kind),
        owner: `${location.owner ?? ""}`.trim() || "Inventory team",
        status: normalizeLocationStatus(location.status),
      };
    })
    .filter(Boolean);
}

export function normalizeLocationKind(kind) {
  const normalized = `${kind ?? ""}`.trim();
  return ["Storage", "Service", "Prep", "Delivery"].includes(normalized) ? normalized : "Storage";
}

export function normalizeLocationStatus(status) {
  const normalized = `${status ?? ""}`.trim();
  return ["Active", "Inactive"].includes(normalized) ? normalized : "Active";
}

function nextRandomId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextLocationId(name) {
  return `loc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || nextRandomId("location")}`;
}
