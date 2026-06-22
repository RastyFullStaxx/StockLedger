function normalizeText(value) {
  return `${value ?? ""}`.trim().toLowerCase();
}

function searchMatch(values, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  return values.join(" ").toLowerCase().includes(normalizedQuery);
}

function byId(rows) {
  return new Map((rows ?? []).map((row) => [row.id, row]));
}

export function filterClients({ clients = [], menus = [], filter = "all", search = "", menuId = "all" }) {
  const menusById = byId(menus);

  return clients.filter((client) => {
    if (filter === "recurring" && !normalizeText(client.segment).includes("recurring")) return false;
    if (filter === "seasonal" && !normalizeText(client.segment).includes("seasonal")) return false;
    if (filter === "wholesale" && !normalizeText(client.segment).includes("wholesale")) return false;
    if (menuId !== "all" && client.default_menu_id !== menuId) return false;

    const menu = menusById.get(client.default_menu_id);
    return searchMatch(
      [client.name, client.segment, client.order_pattern, client.next_order, client.delivery_window, menu?.name ?? ""],
      search,
    );
  });
}

export function filterSuppliers({ suppliers = [], products = [], filter = "all", search = "", productId = "all" }) {
  const productsById = byId(products);

  return suppliers.filter((supplier) => {
    if (filter === "review" && !(supplier.variance_cases > 0 || normalizeText(supplier.reliability).includes("watch"))) return false;
    if (filter === "stable" && !(supplier.variance_cases === 0 && !normalizeText(supplier.reliability).includes("watch"))) return false;
    if (productId !== "all" && !supplier.products.includes(productId)) return false;

    return searchMatch(
      [
        supplier.name,
        supplier.reliability,
        supplier.cadence,
        supplier.last_delivery,
        ...supplier.products.map((id) => productsById.get(id)?.name ?? id),
      ],
      search,
    );
  });
}

export function filterMenus({ menus = [], clients = [], menuItems = [], products = [], filter = "all", search = "", clientId = "all" }) {
  const clientsById = byId(clients);
  const productsById = byId(products);

  return menus.filter((menu) => {
    if (filter === "active" && menu.status !== "Active") return false;
    if (filter === "draft" && menu.status === "Active") return false;
    if (filter === "recurring" && !normalizeText(menu.cadence).includes("recurring")) return false;
    if (filter === "seasonal" && !normalizeText(menu.cadence).includes("seasonal")) return false;
    if (clientId !== "all" && menu.client_id !== clientId) return false;

    const client = clientsById.get(menu.client_id);
    const items = menuItems.filter((item) => item.menu_id === menu.id);
    return searchMatch(
      [
        menu.name,
        menu.cadence,
        menu.status,
        client?.name ?? "",
        ...items.map((item) => item.name),
        ...items.flatMap((item) => item.recipe.map((line) => productsById.get(line.product_id)?.name ?? line.product_id)),
      ],
      search,
    );
  });
}

export function filterLocations({ locations = [], stockRows = [], productLow = () => 0, filter = "all", search = "", kind = "all" }) {
  return locations.filter((location) => {
    if (kind !== "all" && location.kind !== kind) return false;
    if (filter === "storage" && location.kind !== "Storage") return false;
    if (filter === "service" && location.kind === "Storage") return false;
    if (filter === "review") {
      const rows = stockRows.filter((row) => row.location === location.name);
      if (!rows.some((row) => row.quantity < 0 || (row.quantity > 0 && row.quantity <= productLow(row.product_id)))) return false;
    }

    return searchMatch([location.name, location.kind, location.owner, location.status], search);
  });
}

export function filterUsers({ users = [], filter = "all", search = "", role = "all" }) {
  return users.filter((user) => {
    if (filter === "active" && user.status !== "Active") return false;
    if (filter === "pending" && !normalizeText(user.status).includes("pending")) return false;
    if (filter === "sensitive" && Number(user.sensitive_access) <= 0) return false;
    if (role !== "all" && user.role !== role) return false;

    return searchMatch([user.display_name, user.role, user.status, user.access_scope, user.last_active], search);
  });
}

export function filterSalesRecords({
  sales = [],
  clientName = (clientId) => clientId,
  productName = (productId) => productId,
  saleTypeLabels = {},
  saleModeLabels = {},
  filter = "all",
  search = "",
  clientId = "all",
}) {
  return sales.filter((sale) => {
    if (filter === "one_time" && sale.sale_type !== "one_time") return false;
    if (filter === "recurring" && sale.sale_type !== "recurring") return false;
    if (filter === "menu_item" && sale.sale_mode !== "menu_item") return false;
    if (filter === "direct_stock" && sale.sale_mode !== "direct_stock") return false;
    if (clientId !== "all" && sale.client_id !== clientId) return false;

    return searchMatch(
      [
        clientName(sale.client_id),
        saleTypeLabels[sale.sale_type] ?? "",
        saleModeLabels[sale.sale_mode] ?? "",
        sale.item_label ?? "",
        productName(sale.product_id),
        sale.location ?? "",
        sale.notes ?? "",
      ],
      search,
    );
  });
}

export function filterPurchaseRecords({
  purchases = [],
  suppliers = [],
  products = [],
  supplierName = (supplierId) => supplierId,
  productName = (productId) => productId,
  filter = "all",
  search = "",
  supplierId = "all",
}) {
  const suppliersById = byId(suppliers);
  const productsById = byId(products);

  return purchases.filter((purchase) => {
    if (filter === "review" && !(suppliersById.get(purchase.supplier_id)?.variance_cases > 0)) return false;
    if (filter === "spirits" && productsById.get(purchase.product_id)?.category !== "Spirits") return false;
    if (filter === "produce" && productsById.get(purchase.product_id)?.category !== "Kitchen") return false;
    if (supplierId !== "all" && purchase.supplier_id !== supplierId) return false;

    return searchMatch(
      [
        supplierName(purchase.supplier_id),
        productName(purchase.product_id),
        purchase.item_label ?? "",
        purchase.location,
        purchase.notes,
        purchase.status,
      ],
      search,
    );
  });
}

export function productCategories(products = []) {
  return [...new Set(products.map((product) => product.category || "Uncategorized"))].sort((first, second) =>
    first.localeCompare(second),
  );
}

export function filterProductCatalog({
  products = [],
  statusFilter = "active",
  categoryFilter = "all",
  search = "",
  productLastStateLabel = () => "",
}) {
  return products.filter((product) => {
    if (statusFilter === "active" && product.is_active === false) return false;
    if (statusFilter === "suspended" && product.is_active !== false) return false;
    if (categoryFilter !== "all" && (product.category || "Uncategorized") !== categoryFilter) return false;
    return searchMatch([product.name, product.category, product.unit, productLastStateLabel(product)], search);
  });
}

export function clientSalesReportRows(sales = [], { clients = [], clientName = (clientId) => clientId } = {}) {
  const grouped = new Map(clients.map((client) => [client.id, { label: client.name, count: 0, stockLines: 0, menuSales: 0 }]));
  sales.forEach((sale) => {
    const row = grouped.get(sale.client_id) ?? { label: clientName(sale.client_id), count: 0, stockLines: 0, menuSales: 0 };
    row.count += 1;
    row.stockLines += Number(sale.event_count ?? 1);
    row.menuSales += sale.sale_mode === "menu_item" ? 1 : 0;
    grouped.set(sale.client_id, row);
  });

  return [...grouped.values()]
    .filter((row) => row.count > 0)
    .sort((first, second) => second.count - first.count)
    .map((row) => ({
      label: row.label,
      value: `${row.count} sale${row.count === 1 ? "" : "s"}`,
      meta: `${row.menuSales} menu sale${row.menuSales === 1 ? "" : "s"} / ${row.stockLines} stock line${row.stockLines === 1 ? "" : "s"}`,
    }));
}

export function supplierPurchaseReportRows(
  purchases = [],
  { suppliers = [], supplierName = (supplierId) => supplierId, formatQuantity = (value) => `${value}` } = {},
) {
  const grouped = new Map(suppliers.map((supplier) => [supplier.id, { label: supplier.name, count: 0, quantity: 0 }]));
  purchases.forEach((purchase) => {
    const row = grouped.get(purchase.supplier_id) ?? { label: supplierName(purchase.supplier_id), count: 0, quantity: 0 };
    row.count += 1;
    row.quantity += Number(purchase.quantity);
    grouped.set(purchase.supplier_id, row);
  });

  return [...grouped.values()]
    .filter((row) => row.count > 0)
    .sort((first, second) => second.count - first.count)
    .map((row) => ({
      label: row.label,
      value: `${row.count} receipt${row.count === 1 ? "" : "s"}`,
      meta: `${formatQuantity(row.quantity)} total units received`,
    }));
}

export function movementReportRows(events = [], { eventLabels = {}, formatQuantity = (value) => `${value}` } = {}) {
  const movementTypes = ["STOCK_IN", "STOCK_OUT", "STOCK_TRANSFER", "STOCK_ADJUSTMENT", "STOCK_REVERT"];

  return movementTypes
    .map((type) => {
      const matchingEvents = events.filter((event) => event.type === type);
      const absoluteQuantity = matchingEvents.reduce((total, event) => total + Math.abs(Number(event.quantity)), 0);
      return {
        label: eventLabels[type] ?? type,
        value: `${matchingEvents.length} event${matchingEvents.length === 1 ? "" : "s"}`,
        meta: `${formatQuantity(absoluteQuantity)} total movement`,
      };
    })
    .filter((row) => !row.value.startsWith("0 "));
}

export function filterAuditRows({
  rows = [],
  eventLabels = {},
  auditSourceLabel = () => "",
  search = "",
  productId = "all",
  filter = "all",
}) {
  return rows.filter((entry) => {
    if (productId !== "all" && entry.product_id !== productId) return false;
    if (filter === "stock-in" && entry.type !== "STOCK_IN") return false;
    if (filter === "use-stock" && entry.type !== "STOCK_OUT") return false;
    if (filter === "movement" && entry.type !== "STOCK_TRANSFER") return false;
    if (filter === "correction" && entry.type !== "STOCK_ADJUSTMENT") return false;
    if (filter === "undo" && entry.type !== "STOCK_REVERT") return false;
    if (filter === "catalog" && !["PRODUCT_CREATED", "PRODUCT_DEACTIVATED", "PRODUCT_REACTIVATED"].includes(entry.type)) return false;

    return searchMatch(
      [eventLabels[entry.type] ?? entry.type, entry.product_name, entry.location, entry.reason, auditSourceLabel(entry), entry.actor_name],
      search,
    );
  });
}
