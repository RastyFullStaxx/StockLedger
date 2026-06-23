import { createInventoryEvent } from "../domain/ledger.mjs";

export const tenant = {
  client_id: "tenant-northstar-hospitality",
  client_name: "Northstar Hospitality",
  device_id: "device-main-bar-terminal",
  device_name: "Main Bar Terminal",
  user_id: "user-mara-velasco",
  actor_name: "Mara Velasco",
};

export const DEFAULT_PRODUCTS = [
  {
    id: "prod-gin",
    name: "Juniper Gin",
    category: "Spirits",
    unit: "bottle",
    low: 6,
    is_active: true,
    deactivated_at: null,
    deactivated_by: null,
    deactivated_reason: null,
    reactivated_at: null,
    reactivated_by: null,
  },
  {
    id: "prod-rum",
    name: "Harbor Rum",
    category: "Spirits",
    unit: "bottle",
    low: 5,
    is_active: true,
    deactivated_at: null,
    deactivated_by: null,
    deactivated_reason: null,
    reactivated_at: null,
    reactivated_by: null,
  },
  {
    id: "prod-lime",
    name: "Fresh Lime",
    category: "Kitchen",
    unit: "kg",
    low: 8,
    is_active: true,
    deactivated_at: null,
    deactivated_by: null,
    deactivated_reason: null,
    reactivated_at: null,
    reactivated_by: null,
  },
  {
    id: "prod-tonic",
    name: "Tonic Water",
    category: "Mixer",
    unit: "case",
    low: 7,
    is_active: true,
    deactivated_at: null,
    deactivated_by: null,
    deactivated_reason: null,
    reactivated_at: null,
    reactivated_by: null,
  },
];

export function defaultProducts() {
  return DEFAULT_PRODUCTS.map((product) => ({ ...product }));
}

export const DEFAULT_LOCATIONS = [
  { id: "loc-dry-store", name: "Dry Store", kind: "Storage", owner: "Inventory team", status: "Active" },
  { id: "loc-main-bar", name: "Main Bar", kind: "Service", owner: "Bar team", status: "Active" },
  { id: "loc-kitchen", name: "Kitchen", kind: "Prep", owner: "Kitchen team", status: "Active" },
  { id: "loc-cellar", name: "Cellar", kind: "Storage", owner: "Receiving team", status: "Active" },
];

export function defaultLocations() {
  return DEFAULT_LOCATIONS.map((location) => ({ ...location }));
}

export const DEFAULT_CLIENTS = [
  {
    id: "client-harbor-room",
    name: "Harbor Room",
    segment: "Recurring Bar",
    default_menu_id: "menu-house-pour",
    order_pattern: "Weekly standing order",
    next_order: "Friday service",
    delivery_window: "Before 4 PM",
    private_contact: "Admin-only contact details",
  },
  {
    id: "client-sunfold-events",
    name: "Sunfold Events",
    segment: "Seasonal Events",
    default_menu_id: "menu-event-service",
    order_pattern: "Seasonal event batches",
    next_order: "June wedding block",
    delivery_window: "Event day morning",
    private_contact: "Admin-only contact details",
  },
  {
    id: "client-north-pier",
    name: "North Pier Cafe",
    segment: "Wholesale",
    default_menu_id: "menu-cafe-weekly",
    order_pattern: "Monday wholesale refill",
    next_order: "Next Monday",
    delivery_window: "9 AM to 11 AM",
    private_contact: "Admin-only contact details",
  },
];

export const DEFAULT_MENUS = [
  { id: "menu-house-pour", name: "House Pour Menu", client_id: "client-harbor-room", cadence: "Recurring", status: "Active" },
  { id: "menu-event-service", name: "Event Service Menu", client_id: "client-sunfold-events", cadence: "Seasonal", status: "Draft review" },
  { id: "menu-cafe-weekly", name: "Cafe Weekly Menu", client_id: "client-north-pier", cadence: "Recurring", status: "Active" },
];

export const DEFAULT_MENU_ITEMS = [
  {
    id: "menu-item-gin-tonic",
    menu_id: "menu-house-pour",
    name: "Juniper Gin & Tonic",
    sale_type: "recurring",
    default_location: "Main Bar",
    recipe: [
      { product_id: "prod-gin", quantity: 1 },
      { product_id: "prod-tonic", quantity: 1 },
    ],
  },
  {
    id: "menu-item-rum-lime",
    menu_id: "menu-event-service",
    name: "Harbor Rum Lime Service",
    sale_type: "one_time",
    default_location: "Main Bar",
    recipe: [
      { product_id: "prod-rum", quantity: 1 },
      { product_id: "prod-lime", quantity: 1 },
    ],
  },
  {
    id: "menu-item-cafe-lime",
    menu_id: "menu-cafe-weekly",
    name: "Fresh Lime Prep Pack",
    sale_type: "recurring",
    default_location: "Kitchen",
    recipe: [
      { product_id: "prod-lime", quantity: 2 },
    ],
  },
];

export const DEFAULT_SUPPLIERS = [
  {
    id: "supplier-coastal",
    name: "Coastal Spirits Supply",
    cadence: "Tuesday delivery",
    products: ["prod-gin", "prod-rum"],
    reliability: "On time",
    last_delivery: "This week",
    variance_cases: 0,
    private_terms: "Cost prices, account terms, and buyer contact stay hidden by default.",
  },
  {
    id: "supplier-marketline",
    name: "Marketline Produce",
    cadence: "Daily produce run",
    products: ["prod-lime"],
    reliability: "Watch quality",
    last_delivery: "Yesterday",
    variance_cases: 2,
    private_terms: "Produce price lists and credit terms are business-sensitive.",
  },
  {
    id: "supplier-cellar",
    name: "Cellar & Case Distribution",
    cadence: "Friday cases",
    products: ["prod-tonic"],
    reliability: "Stable",
    last_delivery: "Last Friday",
    variance_cases: 1,
    private_terms: "Contracted case rates are hidden until role checks pass.",
  },
];

export const saleTypeLabels = {
  one_time: "One-time",
  recurring: "Recurring",
};

export const saleModeLabels = {
  menu_item: "Menu Item",
  direct_stock: "Direct Stock",
};

export const DEFAULT_USERS = [
  {
    id: "user-mara-velasco",
    display_name: "Mara V.",
    role: "CLIENT_ADMIN",
    status: "Active",
    access_scope: "All daily work and control pages",
    last_active: "Today",
    sensitive_access: 2,
    private_note: "Full staff profile and contact details stay server-side until role checks pass.",
  },
  {
    id: "user-eli-reyes",
    display_name: "Eli R.",
    role: "MANAGER",
    status: "Active",
    access_scope: "Sales, purchases, stock actions, reports",
    last_active: "Yesterday",
    sensitive_access: 0,
    private_note: "Private contact data hidden from this prototype view.",
  },
  {
    id: "user-jo-kim",
    display_name: "Jo K.",
    role: "STAFF",
    status: "Invite pending",
    access_scope: "Sales and stock actions only",
    last_active: "Not yet active",
    sensitive_access: 0,
    private_note: "Pending invites should expire and be audited in production.",
  },
  {
    id: "user-audit-seat",
    display_name: "Audit Seat",
    role: "AUDITOR",
    status: "Read-only",
    access_scope: "Reports and audit trail",
    last_active: "This week",
    sensitive_access: 1,
    private_note: "Read-only access still requires export and view logging.",
  },
];

export const ROLE_MATRIX = [
  { role: "CLIENT_ADMIN", stock: "Full", sales: "Full", reports: "Full", users: "Manage" },
  { role: "MANAGER", stock: "Full", sales: "Full", reports: "View", users: "No access" },
  { role: "STAFF", stock: "Record", sales: "Record", reports: "No export", users: "No access" },
  { role: "AUDITOR", stock: "View", sales: "View", reports: "Export with audit", users: "No access" },
];

export const TRUSTED_DEVICES = [
  { id: "device-main-bar-terminal", name: "Main Bar Terminal", trust: "Trusted", offline: "Allowed", last_sync: "Today" },
  { id: "device-cellar-kiosk", name: "Cellar Kiosk", trust: "Trusted", offline: "Allowed", last_sync: "Yesterday" },
  { id: "device-manager-laptop", name: "Manager Laptop", trust: "Review", offline: "Read-only", last_sync: "This week" },
  { id: "device-old-tablet", name: "Old Receiving Tablet", trust: "Suspend", offline: "Blocked", last_sync: "30 days ago" },
];

export const SETTINGS_POLICIES = [
  { label: "Default Location", value: "Main Bar", detail: "Used when a new stock action or sale starts." },
  { label: "Offline Retention", value: "14 days", detail: "Queued work stays local only as long as needed." },
  { label: "Export Mode", value: "Summary first", detail: "Detailed exports require role and audit checks." },
  { label: "Tenant Boundary", value: "Northstar only", detail: "Prototype views never mix tenant data." },
];

export const NUMBERING_RULES = [
  { prefix: "SALE", example: "SALE-2026-00042", use: "Fulfilled sales and menu sale source records" },
  { prefix: "RCV", example: "RCV-2026-00018", use: "Purchase receiving and stock-in source records" },
  { prefix: "ADJ", example: "ADJ-2026-00007", use: "Count corrections, closure work, and variance follow-up" },
];

export const CI_LANES = [
  { name: "Unit lane", command: "npm run verify:quick", purpose: "Fast ledger and verification helper feedback." },
  { name: "Build lane", command: "npm run verify:build", purpose: "Production bundle catches syntax and Vite regressions." },
  { name: "Browser lane", command: "npm run verify:ui", purpose: "Playwright smoke covers navigation and core workflows." },
];

export function seedEvents() {
  const start = Date.now() - 1000 * 60 * 60 * 4;
  const seed = [
    { type: "STOCK_IN", product_id: "prod-gin", from_location: null, to_location: "Dry Store", quantity: 24, reason: "Coastal Spirits delivery accepted", source_type: "purchase", source_id: "seed-purchase-coastal-001", source_label: "Purchase - Coastal Spirits Supply - 2 products" },
    { type: "STOCK_IN", product_id: "prod-rum", from_location: null, to_location: "Cellar", quantity: 18, reason: "Coastal Spirits delivery accepted", source_type: "purchase", source_id: "seed-purchase-coastal-001", source_label: "Purchase - Coastal Spirits Supply - 2 products" },
    { type: "STOCK_IN", product_id: "prod-lime", from_location: null, to_location: "Kitchen", quantity: 32, reason: "Marketline produce delivery accepted", source_type: "purchase", source_id: "seed-purchase-marketline-001", source_label: "Purchase - Marketline Produce - 1 product" },
    { type: "STOCK_IN", product_id: "prod-tonic", from_location: null, to_location: "Dry Store", quantity: 15, reason: "Cellar & Case delivery accepted", source_type: "purchase", source_id: "seed-purchase-cellar-001", source_label: "Purchase - Cellar & Case Distribution - 1 product" },
    { type: "STOCK_TRANSFER", product_id: "prod-gin", from_location: "Dry Store", to_location: "Main Bar", quantity: 8, reason: "Opening bar par level" },
    { type: "STOCK_TRANSFER", product_id: "prod-rum", from_location: "Cellar", to_location: "Main Bar", quantity: 7, reason: "Event service par level" },
    { type: "STOCK_TRANSFER", product_id: "prod-tonic", from_location: "Dry Store", to_location: "Main Bar", quantity: 6, reason: "Opening bar par level" },
    { type: "STOCK_OUT", product_id: "prod-gin", from_location: "Main Bar", to_location: null, quantity: 6, reason: "Recurring menu sale fulfilled for Harbor Room", source_type: "sale", source_id: "seed-sale-harbor-001", source_label: "Sale - Harbor Room - Juniper Gin & Tonic" },
    { type: "STOCK_OUT", product_id: "prod-tonic", from_location: "Main Bar", to_location: null, quantity: 6, reason: "Recurring menu sale fulfilled for Harbor Room", source_type: "sale", source_id: "seed-sale-harbor-001", source_label: "Sale - Harbor Room - Juniper Gin & Tonic" },
    { type: "STOCK_OUT", product_id: "prod-rum", from_location: "Main Bar", to_location: null, quantity: 2, reason: "Seasonal event service fulfilled for Sunfold Events", source_type: "sale", source_id: "seed-sale-sunfold-001", source_label: "Sale - Sunfold Events - Harbor Rum" },
    { type: "STOCK_OUT", product_id: "prod-lime", from_location: "Kitchen", to_location: null, quantity: 9, reason: "Prep usage" },
    { type: "STOCK_ADJUSTMENT", product_id: "prod-tonic", from_location: null, to_location: "Main Bar", quantity: -1, reason: "Physical count variance" },
    { type: "STOCK_TRANSFER", product_id: "prod-lime", from_location: "Kitchen", to_location: "Main Bar", quantity: 4, reason: "Bar garnish prep" },
    { type: "STOCK_OUT", product_id: "prod-lime", from_location: "Main Bar", to_location: null, quantity: 1, reason: "Direct stock sale fulfilled for North Pier Cafe", source_type: "sale", source_id: "seed-sale-north-pier-001", source_label: "Sale - North Pier Cafe - Fresh Lime" },
  ];

  return seed.map((entry, index) =>
    createInventoryEvent({
      ...tenant,
      event_id: `seed-event-${index + 1}`,
      idempotency_key: `seed-idem-${index + 1}`,
      sync_batch_id: "batch-seed-001",
      type: entry.type,
      product_id: entry.product_id,
      product_name: DEFAULT_PRODUCTS.find((product) => product.id === entry.product_id)?.name ?? entry.product_id,
      from_location: entry.from_location,
      to_location: entry.to_location,
      quantity: entry.quantity,
      reason: entry.reason,
      source_type: entry.source_type,
      source_id: entry.source_id,
      source_label: entry.source_label,
      sequence_number: index + 1,
      timestamp: start + index * 1000 * 60 * 8,
      status: "synced",
    }),
  );
}

export function seedSales() {
  const now = Date.now() - 1000 * 60 * 60 * 2;
  return [
    {
      id: "seed-sale-harbor-001",
      client_id: "client-harbor-room",
      sale_type: "recurring",
      sale_mode: "menu_item",
      menu_item_id: "menu-item-gin-tonic",
      product_id: "prod-gin",
      product_ids: ["prod-gin", "prod-tonic"],
      item_label: "Juniper Gin & Tonic",
      location: "Main Bar",
      quantity: 6,
      notes: "Seeded fulfilled menu sale for dashboard and reports.",
      event_id: "seed-event-8",
      event_count: 2,
      work_item_id: "seed-work-sale-harbor-001",
      created_at: new Date(now).toISOString(),
      status: "synced",
    },
    {
      id: "seed-sale-sunfold-001",
      client_id: "client-sunfold-events",
      sale_type: "one_time",
      sale_mode: "direct_stock",
      menu_item_id: null,
      product_id: "prod-rum",
      product_ids: ["prod-rum"],
      item_label: "Harbor Rum",
      location: "Main Bar",
      quantity: 2,
      notes: "Seeded direct stock sale for event service.",
      event_id: "seed-event-10",
      event_count: 1,
      work_item_id: "seed-work-sale-sunfold-001",
      created_at: new Date(now + 1000 * 60 * 14).toISOString(),
      status: "synced",
    },
    {
      id: "seed-sale-north-pier-001",
      client_id: "client-north-pier",
      sale_type: "recurring",
      sale_mode: "direct_stock",
      menu_item_id: null,
      product_id: "prod-lime",
      product_ids: ["prod-lime"],
      item_label: "Fresh Lime",
      location: "Main Bar",
      quantity: 1,
      notes: "Seeded wholesale refill usage.",
      event_id: "seed-event-14",
      event_count: 1,
      work_item_id: "seed-work-sale-north-pier-001",
      created_at: new Date(now + 1000 * 60 * 26).toISOString(),
      status: "synced",
    },
  ];
}

export function seedPurchases() {
  const now = Date.now() - 1000 * 60 * 60 * 3;
  return [
    {
      id: "seed-purchase-coastal-001",
      supplier_id: "supplier-coastal",
      product_id: "prod-gin",
      product_ids: ["prod-gin", "prod-rum"],
      item_label: "2 products",
      location: "Dry Store / Cellar",
      quantity: 42,
      notes: "Seeded supplier delivery for spirits stock.",
      event_id: "seed-event-1",
      event_count: 2,
      work_item_id: "seed-work-purchase-coastal-001",
      created_at: new Date(now).toISOString(),
      status: "synced",
    },
    {
      id: "seed-purchase-marketline-001",
      supplier_id: "supplier-marketline",
      product_id: "prod-lime",
      product_ids: ["prod-lime"],
      item_label: "Fresh Lime",
      location: "Kitchen",
      quantity: 32,
      notes: "Seeded produce run with quality watch enabled.",
      event_id: "seed-event-3",
      event_count: 1,
      work_item_id: "seed-work-purchase-marketline-001",
      created_at: new Date(now + 1000 * 60 * 10).toISOString(),
      status: "synced",
    },
    {
      id: "seed-purchase-cellar-001",
      supplier_id: "supplier-cellar",
      product_id: "prod-tonic",
      product_ids: ["prod-tonic"],
      item_label: "Tonic Water",
      location: "Dry Store",
      quantity: 15,
      notes: "Seeded mixer delivery for par levels.",
      event_id: "seed-event-4",
      event_count: 1,
      work_item_id: "seed-work-purchase-cellar-001",
      created_at: new Date(now + 1000 * 60 * 20).toISOString(),
      status: "synced",
    },
  ];
}

export function defaultState() {
  return {
    serverLedger: seedEvents(),
    outbox: [],
    online: false,
    activeView: "home",
    products: defaultProducts(),
    locations: defaultLocations(),
    stockView: "totals",
    selectedLocation: "Main Bar",
    productFilter: "all",
    locationFilter: "all",
    stockSearch: "",
    productSearch: "",
    productStatusFilter: "active",
    productCategoryFilter: "all",
    stockPage: 1,
    auditPage: 1,
    productPage: 1,
    clientPage: 1,
    supplierPage: 1,
    menuPage: 1,
    locationPage: 1,
    userPage: 1,
    salesPage: 1,
    purchasePage: 1,
    outboxPage: 1,
    activeProductsPage: 1,
    inactiveProductsPage: 1,
    sales: seedSales(),
    purchases: seedPurchases(),
    selectedClientId: null,
    selectedSaleId: null,
    selectedPurchaseId: null,
    selectedSupplierId: null,
    selectedMenuId: null,
    selectedLocationId: null,
    selectedUserId: null,
    selectedAuditEventId: null,
    auditViewFilter: "all",
    auditSearch: "",
    auditProductFilter: "all",
    clientViewFilter: "all",
    clientSearch: "",
    clientMenuFilter: "all",
    saleViewFilter: "all",
    saleSearch: "",
    saleClientFilter: "all",
    purchaseViewFilter: "all",
    purchaseSearch: "",
    purchaseSupplierFilter: "all",
    supplierViewFilter: "all",
    supplierSearch: "",
    supplierProductFilter: "all",
    menuViewFilter: "all",
    menuSearch: "",
    menuClientFilter: "all",
    locationViewFilter: "all",
    locationSearch: "",
    locationKindFilter: "all",
    userViewFilter: "all",
    userSearch: "",
    userRoleFilter: "all",
    message: "",
    toast: null,
    accountOpen: false,
    sidebarCollapsed: false,
    lastSync: null,
    guideOpen: false,
    assistantInput: "",
    assistantMessages: [],
    form: {
      type: "STOCK_OUT",
      product_id: "prod-gin",
      product_ids: ["prod-gin"],
      product_quantities: {},
      product_physical_counts: {},
      from_location: "Main Bar",
      to_location: "",
      quantity: 1,
      physical_count: "",
      reason: "",
      original_event_id: "",
      attach_sale: false,
      attach_purchase: false,
      sale_client_id: DEFAULT_CLIENTS[0].id,
      sale_type: "one_time",
      sale_notes: "",
      purchase_supplier_id: DEFAULT_SUPPLIERS[0].id,
      purchase_notes: "",
    },
    productForm: {
      name: "",
      category: "",
      unit: "unit",
      low: "0",
    },
    locationModalOpen: false,
    locationForm: {
      name: "",
      kind: "Storage",
      owner: "",
      status: "Active",
    },
    saleForm: {
      client_id: DEFAULT_CLIENTS[0].id,
      sale_type: "one_time",
      sale_mode: "menu_item",
      menu_item_id: DEFAULT_MENU_ITEMS[0].id,
      product_id: "prod-gin",
      location: "Main Bar",
      quantity: 1,
      notes: "",
    },
    purchaseForm: {
      supplier_id: DEFAULT_SUPPLIERS[0].id,
      product_id: "prod-rum",
      location: "Cellar",
      quantity: 1,
      notes: "",
    },
  };
}
