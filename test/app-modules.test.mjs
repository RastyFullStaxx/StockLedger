import assert from "node:assert/strict";
import test from "node:test";

import { createInventoryEvent, validateEvent } from "../src/domain/ledger.mjs";
import {
  DEFAULT_CLIENTS,
  DEFAULT_MENUS,
  DEFAULT_MENU_ITEMS,
  DEFAULT_PRODUCTS,
  DEFAULT_SUPPLIERS,
  DEFAULT_USERS,
  NUMBERING_RULES,
  SETTINGS_POLICIES,
  defaultProducts,
  defaultState,
  saleModeLabels,
  saleTypeLabels,
  seedEvents,
  seedPurchases,
  seedSales,
  tenant,
} from "../src/data/demo-data.mjs";
import { buildProductionSeedState, productionSeedSummary } from "../src/data/production-seed.mjs";
import { ACTION_TEMPLATES, actionTemplate, eventLabels, navigationGroups, screenMeta } from "../src/config/app-config.mjs";
import { STORAGE_KEY, loadState, normalizeSelectedProductIds, saveState } from "../src/state/local-state.mjs";
import {
  allLocalEvents,
  currentBatchId,
  filteredStockRows,
  locationStockRows,
  nextSequence,
  paginateRows,
  simpleValidationReason,
  stockStatus,
  stockTotalRows,
  withWorkItem,
} from "../src/inventory/selectors.mjs";
import { answerAssistantQuestion, createAssistantGreeting } from "../src/assistant/assistant-engine.mjs";
import {
  answerAssistantQuestion as answerAssistantQuestionFromPanel,
  assistantMessagesForRender,
  buildGuideNotifications,
  createAssistantContext,
  createAssistantGreetingMessage,
  guideCueCount,
  pageActions,
  renderAssistantMenu,
  renderStockyIcon,
} from "../src/assistant/assistant-panel.mjs";
import {
  appendStockActionBusinessRecord,
  markStockActionBusinessRecordsSynced,
  removeStockActionBusinessRecordForUndo,
} from "../src/stock-actions/business-records.mjs";
import {
  createStockActionEventBuilder,
  physicalCountForProduct,
  physicalCountVariance,
  quantityForProduct,
} from "../src/stock-actions/event-builder.mjs";
import {
  PRODUCT_DEACTIVATION_REASON,
  applyProductReactivation,
  applyProductSuspension,
  buildProductReactivationWork,
  buildProductSuspensionWork,
  formatDeactivationClosures,
  formatMultiProductDeactivationClosures,
  hasPendingProductClosureDebt,
  nextProductId,
  normalizeClosureQuantity,
  productDeactivationClosures,
  productLastStateLabel,
} from "../src/stock-actions/product-lifecycle.mjs";
import { buildStockActionSourceDetails } from "../src/stock-actions/source-details.mjs";
import { buildWorkQueueItems } from "../src/stock-actions/work-queue.mjs";
import {
  clientSalesReportRows,
  filterAuditRows,
  filterClients,
  filterLocations,
  filterMenus,
  filterProductCatalog,
  filterPurchaseRecords,
  filterSalesRecords,
  filterSuppliers,
  filterUsers,
  movementReportRows,
  productCategories,
  supplierPurchaseReportRows,
} from "../src/records/selectors.mjs";
import { escapeAttr, escapeHtml, formatQuantity } from "../src/utils/format.mjs";

test("demo data module creates isolated default state with valid seed events", () => {
  const firstState = defaultState();
  const secondState = defaultState();

  assert.notEqual(firstState, secondState);
  assert.notEqual(firstState.products, secondState.products);
  assert.equal(firstState.products.length, DEFAULT_PRODUCTS.length);
  assert.equal(firstState.serverLedger.every((event) => validateEvent(event).valid), true);
  for (const event of firstState.serverLedger.filter((entry) => entry.type.startsWith("STOCK_"))) {
    assert.equal(Number.isInteger(Number(event.quantity)), true, `seed stock event ${event.event_id} must be integer`);
  }
  assert.equal(firstState.sales.length > 0, true);
  assert.equal(firstState.purchases.length > 0, true);
});

test("seeded business records point at seeded ledger events", () => {
  const eventIds = new Set(seedEvents().map((event) => event.event_id));

  for (const sale of seedSales()) {
    assert.equal(eventIds.has(sale.event_id), true, `missing event for sale ${sale.id}`);
  }

  for (const purchase of seedPurchases()) {
    assert.equal(eventIds.has(purchase.event_id), true, `missing event for purchase ${purchase.id}`);
  }
});

test("production seed creates a loaded valid ledger state", () => {
  const state = buildProductionSeedState();
  const summary = productionSeedSummary(state);
  const ledgerEventIds = new Set(state.serverLedger.map((event) => event.event_id));

  assert.equal(state.products.length >= 16, true);
  assert.equal(state.locations.length >= 9, true);
  assert.equal(state.serverLedger.length >= 45, true);
  assert.equal(state.outbox.length >= 5, true);
  assert.equal(state.sales.length >= 6, true);
  assert.equal(state.purchases.length >= 3, true);
  assert.equal(summary.invalidEvents, 0);
  assert.equal(summary.stockRows > state.products.length, true);
  assert.equal(summary.lowOrNegativeRows > 0, true);

  for (const event of [...state.serverLedger, ...state.outbox]) {
    assert.equal(validateEvent(event).valid, true, `invalid seed event ${event.event_id}`);
    if (event.type.startsWith("STOCK_")) {
      assert.equal(Number.isInteger(Number(event.quantity)), true, `seed stock event ${event.event_id} must be integer`);
    }
  }

  for (const sale of state.sales) {
    assert.equal(ledgerEventIds.has(sale.event_id), true, `missing event for production sale ${sale.id}`);
  }

  for (const purchase of state.purchases) {
    assert.equal(ledgerEventIds.has(purchase.event_id), true, `missing event for production purchase ${purchase.id}`);
  }
});

test("defaultProducts returns editable copies", () => {
  const products = defaultProducts();
  products[0].name = "Changed";

  assert.notEqual(defaultProducts()[0].name, "Changed");
});

test("format helpers are reusable outside app rendering", () => {
  assert.equal(formatQuantity(4), "4");
  assert.equal(formatQuantity(4.5), "4.5");
  assert.equal(escapeHtml("<b>&</b>"), "&lt;b&gt;&amp;&lt;/b&gt;");
  assert.equal(escapeAttr('"quoted"'), "&quot;quoted&quot;");
});

test("app config exposes navigation metadata and action template fallback", () => {
  assert.equal(screenMeta.compose.title, "Stock Actions");
  assert.equal(navigationGroups.some((group) => group.items.includes("compose")), true);
  assert.equal(eventLabels.STOCK_OUT, "Use Stock");
  assert.equal(actionTemplate("UNKNOWN").template, actionTemplate("STOCK_OUT").template);
  assert.equal(actionTemplate("STOCK_IN").requiredFields.includes("to_location"), true);
});

test("local state module normalizes selections and excludes session-only UI state", () => {
  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  const state = loadState(localStorage);

  assert.deepEqual(normalizeSelectedProductIds(["prod-gin", "prod-gin", "", "prod-rum"], "prod-tonic"), ["prod-gin", "prod-rum"]);

  saveState(
    {
      ...state,
      toast: { message: "Do not persist" },
      accountOpen: true,
      locationModalOpen: true,
      guideOpen: true,
      assistantInput: "private session text",
      assistantMessages: [{ role: "user", text: "private" }],
    },
    localStorage,
  );

  const saved = JSON.parse(storage.get(STORAGE_KEY));
  assert.equal(saved.toast, undefined);
  assert.equal(saved.accountOpen, undefined);
  assert.equal(saved.locationModalOpen, undefined);
  assert.equal(saved.guideOpen, undefined);
  assert.equal(saved.assistantInput, undefined);
  assert.equal(saved.assistantMessages, undefined);
});

test("inventory selectors produce stock view models without app rendering", () => {
  const state = defaultState();
  const events = allLocalEvents(state);
  const rows = filteredStockRows(events, {
    products: state.products,
    locations: state.locations,
    productFilter: "prod-lime",
    locationFilter: "Main Bar",
    stockSearch: "lime",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].product_name, "Fresh Lime");
  assert.equal(locationStockRows(rows, "Main Bar").length, 1);

  const totals = stockTotalRows(filteredStockRows(events, { products: state.products, locations: state.locations }), state.products);
  assert.equal(totals.some((row) => row.product_id === "prod-lime" && row.quantity > 0), true);
  assert.deepEqual(stockStatus({ quantity: -1 }, 5), { tone: "error", label: "Check Now" });
  assert.deepEqual(stockStatus({ quantity: 3 }, 5), { tone: "warning", label: "Low Stock" });
  assert.deepEqual(stockStatus({ quantity: 6 }, 5), { tone: "valid", label: "Enough" });
});

test("inventory work helpers are deterministic from explicit state", () => {
  const state = defaultState();
  const events = allLocalEvents(state);
  const pagination = paginateRows(Array.from({ length: 25 }, (_, index) => index + 1), 3);

  assert.deepEqual(pagination.pageRows, [21, 22, 23, 24, 25]);
  assert.equal(pagination.totalPages, 3);
  assert.equal(nextSequence(events), Math.max(...events.map((event) => Number(event.sequence_number))) + 1);
  assert.equal(currentBatchId({ outbox: [{ sync_batch_id: "existing-batch" }] }, events), "existing-batch");
  assert.match(currentBatchId({ outbox: [] }, events, new Date("2026-06-23T00:00:00Z")), /^batch-2026-06-23-/);
  assert.equal(simpleValidationReason("STOCK_OUT requires from_location."), "Choose where the stock left from.");
  assert.deepEqual(withWorkItem({ event_id: "event-1" }, "work-1"), { event_id: "event-1", work_item_id: "work-1" });
});

test("record selectors filter relationship and business views without app rendering", () => {
  const state = defaultState();

  assert.deepEqual(
    filterClients({ clients: DEFAULT_CLIENTS, menus: DEFAULT_MENUS, filter: "wholesale" }).map((client) => client.name),
    ["North Pier Cafe"],
  );
  assert.deepEqual(
    filterSuppliers({ suppliers: DEFAULT_SUPPLIERS, products: state.products, filter: "review" })
      .map((supplier) => supplier.name)
      .sort(),
    ["Cellar & Case Distribution", "Marketline Produce"],
  );
  assert.equal(
    filterSuppliers({ suppliers: DEFAULT_SUPPLIERS, products: state.products, productId: "prod-tonic" })[0].name,
    "Cellar & Case Distribution",
  );
  assert.deepEqual(
    filterMenus({
      menus: DEFAULT_MENUS,
      clients: DEFAULT_CLIENTS,
      menuItems: DEFAULT_MENU_ITEMS,
      products: state.products,
      search: "rum",
    }).map((menu) => menu.name),
    ["Event Service Menu"],
  );
  assert.deepEqual(
    filterLocations({
      locations: [
        { id: "loc-main-bar", name: "Main Bar", kind: "Service", owner: "Bar team", status: "Active" },
        { id: "loc-dry-store", name: "Dry Store", kind: "Storage", owner: "Receiving team", status: "Active" },
      ],
      stockRows: [
        { location: "Main Bar", product_id: "prod-lime", quantity: 2 },
        { location: "Dry Store", product_id: "prod-gin", quantity: 100 },
      ],
      productLow: (productId) => (productId === "prod-lime" ? 5 : 1),
      filter: "review",
    }).map((location) => location.name),
    ["Main Bar"],
  );
  assert.equal(
    filterUsers({ users: DEFAULT_USERS, filter: "sensitive" }).every((user) => Number(user.sensitive_access) > 0),
    true,
  );
  assert.equal(
    filterSalesRecords({
      sales: state.sales,
      clientName: (clientId) => DEFAULT_CLIENTS.find((client) => client.id === clientId)?.name ?? clientId,
      productName: (productId) => state.products.find((product) => product.id === productId)?.name ?? productId,
      saleTypeLabels,
      saleModeLabels,
      filter: "direct_stock",
    }).every((sale) => sale.sale_mode === "direct_stock"),
    true,
  );
  assert.deepEqual(
    filterPurchaseRecords({
      purchases: state.purchases,
      suppliers: DEFAULT_SUPPLIERS,
      products: state.products,
      supplierName: (supplierId) => DEFAULT_SUPPLIERS.find((supplier) => supplier.id === supplierId)?.name ?? supplierId,
      productName: (productId) => state.products.find((product) => product.id === productId)?.name ?? productId,
      filter: "produce",
    }).map((purchase) => purchase.supplier_id),
    ["supplier-marketline"],
  );
  assert.equal(productCategories(state.products).includes("Spirits"), true);
  assert.deepEqual(
    filterProductCatalog({
      products: [{ id: "prod-paused", name: "Paused Product", category: "Bar", unit: "bottle", is_active: false }],
      statusFilter: "suspended",
    }).map((product) => product.name),
    ["Paused Product"],
  );
});

test("record selectors build report and audit rows from explicit inputs", () => {
  const state = defaultState();
  const clientName = (clientId) => DEFAULT_CLIENTS.find((client) => client.id === clientId)?.name ?? clientId;
  const supplierName = (supplierId) => DEFAULT_SUPPLIERS.find((supplier) => supplier.id === supplierId)?.name ?? supplierId;

  assert.equal(
    clientSalesReportRows(state.sales, { clients: DEFAULT_CLIENTS, clientName }).some((row) => row.label === "Harbor Room"),
    true,
  );
  assert.equal(
    supplierPurchaseReportRows(state.purchases, { suppliers: DEFAULT_SUPPLIERS, supplierName, formatQuantity }).some(
      (row) => row.label === "Coastal Spirits Supply",
    ),
    true,
  );
  assert.equal(
    movementReportRows(state.serverLedger, { eventLabels, formatQuantity }).some((row) => row.label === "Use Stock"),
    true,
  );
  assert.deepEqual(
    filterAuditRows({
      rows: [
        {
          type: "STOCK_IN",
          product_id: "prod-gin",
          product_name: "Juniper Gin",
          location: "Dry Store",
          reason: "Delivery received",
          actor_name: "Mara V.",
          source_label: "Purchase",
        },
        {
          type: "STOCK_OUT",
          product_id: "prod-lime",
          product_name: "Fresh Lime",
          location: "Kitchen",
          reason: "Prep use",
          actor_name: "Eli R.",
          source_label: "Sale",
        },
      ],
      eventLabels,
      auditSourceLabel: (entry) => entry.source_label ?? "",
      search: "delivery",
      filter: "stock-in",
    }).map((row) => row.product_name),
    ["Juniper Gin"],
  );
});

test("stock action source details describe optional sale and purchase attachments", () => {
  let nextIdIndex = 0;
  const deterministicNextId = (prefix) => `${prefix}-${++nextIdIndex}`;

  assert.deepEqual(
    buildStockActionSourceDetails(
      {
        type: "STOCK_OUT",
        attach_sale: true,
        sale_client_id: "client-harbor-room",
        sale_type: "recurring",
        product_ids: ["prod-gin", "prod-tonic"],
      },
      { clients: DEFAULT_CLIENTS, saleTypeLabels, nextId: deterministicNextId },
    ),
    {
      type: "sale",
      id: "sale-1",
      label: "Sale - Harbor Room - 2 products",
      reason: "Recurring fulfilled for Harbor Room",
    },
  );
  assert.deepEqual(
    buildStockActionSourceDetails(
      {
        type: "STOCK_IN",
        attach_purchase: true,
        purchase_supplier_id: "supplier-marketline",
        purchase_notes: "Received early",
        product_ids: ["prod-lime"],
      },
      { suppliers: DEFAULT_SUPPLIERS, nextId: deterministicNextId },
    ),
    {
      type: "purchase",
      id: "purchase-2",
      label: "Purchase - Marketline Produce - 1 product",
      reason: "Received early",
    },
  );
  assert.deepEqual(buildStockActionSourceDetails({ type: "STOCK_IN", attach_purchase: false }), {
    type: undefined,
    id: undefined,
    label: undefined,
    reason: "",
  });
});

test("stock action event builder creates grouped sale events from explicit form state", () => {
  let idIndex = 0;
  const builder = createStockActionEventBuilder({
    tenant,
    nextId: (prefix) => `${prefix}-${++idIndex}`,
    currentBatchId: () => "batch-test",
    nextSequence: () => 40,
    productName: (productId) => ({ "prod-gin": "Juniper Gin", "prod-tonic": "Tonic Water" })[productId] ?? productId,
    sourceDetailsOptions: { clients: DEFAULT_CLIENTS, saleTypeLabels },
    now: () => 1710000000000,
  });

  const events = builder.buildEvents({
    type: "STOCK_OUT",
    product_id: "prod-gin",
    product_ids: ["prod-gin", "prod-tonic"],
    product_quantities: { "prod-gin": 2, "prod-tonic": 5 },
    from_location: "Main Bar",
    to_location: "",
    quantity: 1,
    original_event_id: "",
    reason: "",
    attach_sale: true,
    sale_client_id: "client-harbor-room",
    sale_type: "recurring",
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].work_item_id, "work-1");
  assert.equal(events[1].work_item_id, "work-1");
  assert.equal(events[0].source_id, "sale-2");
  assert.equal(events[1].source_id, "sale-2");
  assert.equal(events[0].source_label, "Sale - Harbor Room - 2 products");
  assert.deepEqual(
    events.map((event) => [event.product_id, event.quantity, event.sequence_number]),
    [
      ["prod-gin", 2, 40],
      ["prod-tonic", 5, 41],
    ],
  );
  assert.equal(events.every((event) => validateEvent(event).valid), true);
});

test("stock action builders reject decimal quantities for menu, sale, and purchase flows", () => {
  let idIndex = 0;
  const builder = createStockActionEventBuilder({
    tenant,
    nextId: (prefix) => `${prefix}-${++idIndex}`,
    currentBatchId: () => "batch-decimals",
    nextSequence: () => 80,
    productName: (productId) => ({ "prod-gin": "Juniper Gin", "prod-tonic": "Tonic Water" })[productId] ?? productId,
    sourceDetailsOptions: { clients: DEFAULT_CLIENTS, saleTypeLabels },
    now: () => 1710000000000,
  });

  const menuEvents = builder.buildEvents({
    type: "STOCK_OUT",
    product_id: "prod-gin",
    product_ids: ["prod-gin", "prod-tonic"],
    product_quantities: { "prod-gin": 2.5, "prod-tonic": 1 },
    from_location: "Main Bar",
    to_location: "",
    quantity: 1,
    original_event_id: "",
    reason: "Menu draft",
    attach_sale: false,
    attach_purchase: false,
  });

  assert.equal(validateEvent(menuEvents[0]).valid, false);
  assert.equal(validateEvent(menuEvents[0]).reason, "quantity must be a finite number.");
  assert.equal(validateEvent(menuEvents[1]).valid, true);

  const saleEvent = builder.buildEvent({
    type: "STOCK_OUT",
    product_id: "prod-gin",
    product_ids: ["prod-gin"],
    from_location: "Main Bar",
    to_location: "",
    quantity: 3.25,
    original_event_id: "",
    reason: "Direct sale",
    attach_sale: false,
    attach_purchase: false,
  });
  assert.equal(validateEvent(saleEvent).valid, false);
  assert.equal(validateEvent(saleEvent).reason, "quantity must be a finite number.");

  const purchaseEvent = builder.buildEvent({
    type: "STOCK_IN",
    product_id: "prod-gin",
    product_ids: ["prod-gin"],
    from_location: "",
    to_location: "Cellar",
    quantity: 4.5,
    original_event_id: "",
    reason: "Decimal purchase",
    attach_sale: false,
    attach_purchase: false,
  });
  assert.equal(validateEvent(purchaseEvent).valid, false);
  assert.equal(validateEvent(purchaseEvent).reason, "quantity must be a finite number.");
});

test("stock action event builder centralizes physical count and undo event rules", () => {
  let idIndex = 0;
  const originalEvent = {
    event_id: "event-original",
    type: "STOCK_OUT",
    product_id: "prod-lime",
    from_location: "Kitchen",
    to_location: null,
    quantity: 3,
  };
  const builder = createStockActionEventBuilder({
    tenant,
    nextId: (prefix) => `${prefix}-${++idIndex}`,
    currentBatchId: () => "batch-physical",
    nextSequence: () => 12,
    findEventForRevert: (eventId) => (eventId === originalEvent.event_id ? originalEvent : null),
    productName: (productId) => ({ "prod-lime": "Fresh Lime", "prod-gin": "Juniper Gin" })[productId] ?? productId,
    formatQuantity,
    systemCountForProduct: (_form, productId) => (productId === "prod-gin" ? 8 : null),
    now: () => 1710000000000,
  });

  assert.equal(quantityForProduct({ product_quantities: { "prod-gin": 3 }, quantity: 1 }, "prod-gin"), 3);
  assert.equal(physicalCountForProduct({ product_physical_counts: { "prod-gin": 6 } }, "prod-gin"), 6);
  assert.equal(physicalCountVariance({ product_physical_counts: { "prod-gin": 6 } }, "prod-gin", 8), -2);

  const adjustment = builder.buildEvent({
    type: "STOCK_ADJUSTMENT",
    product_id: "prod-gin",
    product_ids: ["prod-gin"],
    product_physical_counts: { "prod-gin": 6 },
    from_location: "",
    to_location: "Main Bar",
    quantity: 1,
    original_event_id: "",
    reason: "",
  });
  assert.equal(adjustment.quantity, -2);
  assert.equal(adjustment.reason, "Physical count 6 vs system 8");
  assert.equal(validateEvent(adjustment).valid, true);

  const invalidAdjustment = builder.buildEvent({
    type: "STOCK_ADJUSTMENT",
    product_id: "prod-gin",
    product_ids: ["prod-gin"],
    product_physical_counts: { "prod-gin": 6.2 },
    from_location: "",
    to_location: "Main Bar",
    quantity: 1,
    original_event_id: "",
    reason: "Bad count",
  });
  assert.equal(validateEvent(invalidAdjustment).valid, false);
  assert.equal(validateEvent(invalidAdjustment).reason, "quantity must be a finite number.");

  const revert = builder.buildEvent({
    type: "STOCK_REVERT",
    product_id: "prod-gin",
    original_event_id: "event-original",
    reason: "Wrong sale",
  });
  assert.equal(revert.type, "STOCK_REVERT");
  assert.equal(revert.product_id, "prod-lime");
  assert.equal(revert.from_location, "Kitchen");
  assert.equal(revert.quantity, 3);
  assert.equal(revert.original_event_id, "event-original");
  assert.equal(validateEvent(revert).valid, true);

  const decimalRevertBuilder = createStockActionEventBuilder({
    tenant,
    nextId: (prefix) => `${prefix}-decimal-${++idIndex}`,
    currentBatchId: () => "batch-physical",
    nextSequence: () => 20,
    findEventForRevert: (eventId) =>
      eventId === "event-original-decimal"
        ? {
            ...originalEvent,
            event_id: "event-original-decimal",
            quantity: 2.5,
          }
        : null,
    productName: (productId) => ({ "prod-lime": "Fresh Lime", "prod-gin": "Juniper Gin" })[productId] ?? productId,
    formatQuantity,
    systemCountForProduct: (_form, productId) => (productId === "prod-gin" ? 8 : null),
    now: () => 1710000000000,
  });
  const decimalRevert = decimalRevertBuilder.buildEvent({
    type: "STOCK_REVERT",
    product_id: "prod-gin",
    original_event_id: "event-original-decimal",
    reason: "Wrong sale",
  });
  assert.equal(validateEvent(decimalRevert).valid, false);
  assert.equal(validateEvent(decimalRevert).reason, "quantity must be a finite number.");
});

test("stock action business records append, rollback, and sync linked source records", () => {
  const saleEvents = [
    {
      event_id: "event-sale-1",
      type: "STOCK_OUT",
      product_id: "prod-gin",
      from_location: "Main Bar",
      quantity: 2,
      source_type: "sale",
      source_id: "sale-local-1",
      work_item_id: "work-sale-1",
    },
    {
      event_id: "event-sale-2",
      type: "STOCK_OUT",
      product_id: "prod-tonic",
      from_location: "Main Bar",
      quantity: 4,
      source_type: "sale",
      source_id: "sale-local-1",
      work_item_id: "work-sale-1",
    },
  ];
  const appendedSale = appendStockActionBusinessRecord(
    { sales: [], purchases: [] },
    saleEvents,
    {
      sale_client_id: "client-harbor-room",
      sale_type: "recurring",
      sale_notes: "Standing order",
    },
    {
      clients: DEFAULT_CLIENTS,
      saleTypeLabels,
      productName: (productId) => ({ "prod-gin": "Juniper Gin" })[productId] ?? productId,
      now: () => Date.parse("2026-06-23T00:00:00Z"),
    },
  );

  assert.equal(appendedSale.sales.length, 1);
  assert.equal(appendedSale.selectedSaleId, null);
  assert.equal(appendedSale.sales[0].client_id, "client-harbor-room");
  assert.equal(appendedSale.sales[0].quantity, 6);
  assert.equal(appendedSale.sales[0].item_label, "2 products");
  assert.equal(appendedSale.sales[0].created_at, "2026-06-23T00:00:00.000Z");

  const purchaseEvents = [
    {
      event_id: "event-purchase-1",
      type: "STOCK_IN",
      product_id: "prod-lime",
      to_location: "Kitchen",
      quantity: 3,
      source_type: "purchase",
      source_id: "purchase-local-1",
      work_item_id: "work-purchase-1",
    },
  ];
  const appendedPurchase = appendStockActionBusinessRecord(
    { sales: appendedSale.sales, purchases: [] },
    purchaseEvents,
    {
      purchase_supplier_id: "supplier-marketline",
      purchase_notes: "Checked at receiving",
    },
    {
      suppliers: DEFAULT_SUPPLIERS,
      productName: (productId) => ({ "prod-lime": "Fresh Lime" })[productId] ?? productId,
      now: () => Date.parse("2026-06-23T01:00:00Z"),
    },
  );

  assert.equal(appendedPurchase.purchases.length, 1);
  assert.equal(appendedPurchase.selectedPurchaseId, null);
  assert.equal(appendedPurchase.purchases[0].supplier_id, "supplier-marketline");
  assert.equal(appendedPurchase.purchases[0].item_label, "Fresh Lime");

  const synced = markStockActionBusinessRecordsSynced(
    { sales: appendedPurchase.sales, purchases: appendedPurchase.purchases },
    [...saleEvents, ...purchaseEvents],
  );
  assert.equal(synced.sales[0].status, "synced");
  assert.equal(synced.purchases[0].status, "synced");

  const withoutSale = removeStockActionBusinessRecordForUndo(synced, saleEvents[0]);
  assert.equal(withoutSale.sales.length, 0);
  assert.equal(withoutSale.purchases.length, 1);
});

test("product lifecycle module builds closure work and catalog state without app rendering", () => {
  const product = {
    id: "prod-test-syrup",
    name: "Test Syrup",
    category: "Mixer",
    unit: "bottle",
    low: 1,
    is_active: true,
  };
  const events = [
    createInventoryEvent({
      ...tenant,
      event_id: "event-test-in-main",
      idempotency_key: "idem-test-in-main",
      sync_batch_id: "batch-test",
      type: "STOCK_IN",
      product_id: product.id,
      product_name: product.name,
      to_location: "Main Bar",
      quantity: 5,
      sequence_number: 1,
      timestamp: 1710000000000,
    }),
    createInventoryEvent({
      ...tenant,
      event_id: "event-test-out-main",
      idempotency_key: "idem-test-out-main",
      sync_batch_id: "batch-test",
      type: "STOCK_OUT",
      product_id: product.id,
      product_name: product.name,
      from_location: "Main Bar",
      quantity: 2,
      sequence_number: 2,
      timestamp: 1710000001000,
    }),
    createInventoryEvent({
      ...tenant,
      event_id: "event-test-in-cellar",
      idempotency_key: "idem-test-in-cellar",
      sync_batch_id: "batch-test",
      type: "STOCK_IN",
      product_id: product.id,
      product_name: product.name,
      to_location: "Cellar",
      quantity: 2,
      sequence_number: 3,
      timestamp: 1710000002000,
    }),
  ];
  const closures = productDeactivationClosures(product, events);

  assert.deepEqual(closures, [
    { location: "Main Bar", balance: 3, closureQuantity: -3 },
    { location: "Cellar", balance: 2, closureQuantity: -2 },
  ]);
  assert.equal(formatDeactivationClosures(closures, { formatQuantity }), "Main Bar: +3 | Cellar: +2");
  assert.equal(
    formatMultiProductDeactivationClosures([product], { events, formatQuantity }),
    "Test Syrup: Main Bar: +3 | Cellar: +2",
  );
  assert.equal(nextProductId("Test Syrup", [{ id: "prod-test-syrup" }]), "prod-test-syrup-1");
  assert.equal(normalizeClosureQuantity(0.00000001), 0);

  let idIndex = 0;
  const suspensionEvents = buildProductSuspensionWork([product], events, {
    tenant,
    reason: "Season ended",
    nextId: (prefix) => `${prefix}-${++idIndex}`,
    currentBatchId: () => "batch-lifecycle",
    nextSequence: () => 20,
    now: () => Date.parse("2026-06-23T00:00:00Z"),
  });

  assert.deepEqual(
    suspensionEvents.map((event) => [event.type, event.sequence_number, event.work_item_id]),
    [
      ["PRODUCT_DEACTIVATED", 20, "work-product-suspended-1"],
      ["STOCK_ADJUSTMENT", 21, "work-product-suspended-1"],
      ["STOCK_ADJUSTMENT", 22, "work-product-suspended-1"],
    ],
  );
  assert.equal(suspensionEvents.every((event) => validateEvent(event).valid), true);
  assert.equal(suspensionEvents[1].reason, PRODUCT_DEACTIVATION_REASON);
  assert.equal(hasPendingProductClosureDebt(suspensionEvents, product.id), true);

  const suspendedCatalog = applyProductSuspension([product], [product], {
    reason: "Season ended",
    tenant,
    now: () => Date.parse("2026-06-23T00:00:00Z"),
  });
  assert.equal(suspendedCatalog[0].is_active, false);
  assert.equal(suspendedCatalog[0].deactivated_reason, "Season ended");
  assert.equal(
    productLastStateLabel(suspendedCatalog[0], { displayDateTime: () => "Jun 23" }),
    `Suspended Jun 23 by ${tenant.user_id}. Season ended`,
  );

  idIndex = 0;
  const reactivationEvents = buildProductReactivationWork(suspendedCatalog, {
    tenant,
    reason: "Back on menu",
    nextId: (prefix) => `${prefix}-${++idIndex}`,
    currentBatchId: () => "batch-reactivate",
    nextSequence: () => 40,
    now: () => Date.parse("2026-06-24T00:00:00Z"),
  });
  assert.deepEqual(
    reactivationEvents.map((event) => [event.type, event.sequence_number, event.work_item_id]),
    [["PRODUCT_REACTIVATED", 40, "work-product-reactivated-3"]],
  );
  assert.equal(reactivationEvents.every((event) => validateEvent(event).valid), true);

  const reactivatedCatalog = applyProductReactivation(suspendedCatalog, suspendedCatalog, {
    tenant,
    now: () => Date.parse("2026-06-24T00:00:00Z"),
  });
  assert.equal(reactivatedCatalog[0].is_active, true);
  assert.equal(reactivatedCatalog[0].reactivated_by, tenant.user_id);
  assert.equal(
    productLastStateLabel(reactivatedCatalog[0], { displayDateTime: () => "Jun 24" }),
    `Reactivated Jun 24 by ${tenant.user_id}`,
  );
});

test("assistant engine answers StockLedger questions and redirects out-of-scope prompts", () => {
  const state = defaultState();
  const events = allLocalEvents(state);
  const stockRows = filteredStockRows(events, {
    products: state.products,
    locations: state.locations,
    productFilter: "all",
    locationFilter: "all",
    stockSearch: "",
  });
  const context = {
    activeView: "home",
    screenMeta,
    actionTemplates: ACTION_TEMPLATES,
    eventLabels,
    guideTipsForView: () => ["Use Total Stock for the master count."],
    notifications: () => [{ tone: "warning", title: "Fresh Lime Needs Restock", text: "Main Bar is low." }],
    pageActions: () => [{ label: "Open Stock Actions", view: "compose" }],
    stockRows: () => stockRows,
    stockTotals: (rows) => stockTotalRows(rows, state.products),
    products: state.products,
    locations: state.locations,
    menuItems: [],
    menus: [],
    productUnit: (productId) => state.products.find((product) => product.id === productId)?.unit ?? "unit",
    productLow: (productId) => state.products.find((product) => product.id === productId)?.low ?? 0,
    productName: (productId) => state.products.find((product) => product.id === productId)?.name ?? productId,
    outbox: [],
    workItems: () => [],
    validations: () => [],
    formatQuantity,
  };

  assert.match(createAssistantGreeting(context).text, /Hi, I[.’]m Stocky|Hi, I\.m Stocky/);
  assert.match(answerAssistantQuestion("How many stocks do we have?", context).text, /products with replayed stock/);
  assert.match(answerAssistantQuestion("What actions can I use?", context).text, /Stock Actions can queue/);
  assert.match(answerAssistantQuestion("Who won the basketball game?", context).text, /I[.’]m here to help with StockLedger/);
});

test("assistant panel module builds notifications, context, and Stocky markup without app rendering", () => {
  const state = {
    ...defaultState(),
    activeView: "compose",
    online: false,
    outbox: [{ event_id: "event-waiting" }],
    assistantInput: "<check>",
    assistantMessages: [],
  };
  const stockRows = [
    { product_id: "prod-lime", product_name: "Fresh Lime", location: "Main Bar", quantity: 0 },
    { product_id: "prod-rum", product_name: "Harbor Rum", location: "Dry Store", quantity: -1 },
  ];
  const productUnitForTest = (productId) => state.products.find((product) => product.id === productId)?.unit ?? "unit";
  const productLowForTest = (productId) => state.products.find((product) => product.id === productId)?.low ?? 0;
  const notifications = buildGuideNotifications({
    state,
    stockRows,
    productLow: productLowForTest,
    productUnit: productUnitForTest,
    formatQuantity,
  });

  assert.equal(guideCueCount(notifications), 3);
  assert.deepEqual(pageActions("compose").map((action) => action.view), ["dashboard", "audit"]);
  assert.match(renderStockyIcon("stocky-avatar-test"), /stocky\.svg/);

  let id = 0;
  const context = createAssistantContext({
    state,
    screenMeta,
    actionTemplates: ACTION_TEMPLATES,
    eventLabels,
    guideTipsForView: () => ["Choose the action that matches the real stock movement."],
    notifications: () => notifications,
    stockRows: () => stockRows,
    stockTotals: () => [{ product_id: "prod-lime", product_name: "Fresh Lime", quantity: 0, location_count: 1 }],
    products: state.products,
    locations: state.locations,
    clients: DEFAULT_CLIENTS,
    suppliers: DEFAULT_SUPPLIERS,
    menuItems: DEFAULT_MENU_ITEMS,
    menus: DEFAULT_MENUS,
    sales: state.sales,
    purchases: state.purchases,
    users: DEFAULT_USERS,
    settingsPolicies: SETTINGS_POLICIES,
    numberingRules: NUMBERING_RULES,
    productUnit: productUnitForTest,
    productLow: productLowForTest,
    productName: (productId) => state.products.find((product) => product.id === productId)?.name ?? productId,
    clientName: (clientId) => DEFAULT_CLIENTS.find((client) => client.id === clientId)?.name ?? clientId,
    supplierName: (supplierId) => DEFAULT_SUPPLIERS.find((supplier) => supplier.id === supplierId)?.name ?? supplierId,
    outbox: state.outbox,
    workItems: () => [],
    validations: () => [{ valid: true }],
    formatQuantity,
  });
  const greeting = createAssistantGreetingMessage(context, (prefix) => `${prefix}-${++id}`);
  const messages = assistantMessagesForRender(state, () => greeting);
  const html = renderAssistantMenu({
    state,
    meta: screenMeta.compose,
    messages,
    icon: (name) => `<i>${name}</i>`,
  });

  assert.equal(context.activeView, "compose");
  assert.match(answerAssistantQuestionFromPanel("what is this page", context).text, /Stock Actions/);
  assert.match(greeting.text, /Hi, I.m Stocky/);
  assert.match(html, /Stocky Assistant/);
  assert.match(html, /stocky\.svg/);
  assert.match(html, /&lt;check&gt;/);
}
);

test("stock action work queue groups related events into operator-facing items", () => {
  const state = defaultState();
  const first = {
    ...state.serverLedger[7],
    status: "queued",
    work_item_id: "work-sale-1",
    sequence_number: 31,
    source_label: "Sale - Harbor Room - 2 products",
  };
  const second = {
    ...state.serverLedger[8],
    status: "queued",
    work_item_id: "work-sale-1",
    sequence_number: 32,
    source_label: "Sale - Harbor Room - 2 products",
  };
  const invalid = {
    ...state.serverLedger[0],
    event_id: "invalid-stock-in",
    work_item_id: "work-invalid",
    sequence_number: 33,
    to_location: null,
  };
  const items = buildWorkQueueItems(
    [
      { event: first, validation: validateEvent(first) },
      { event: second, validation: validateEvent(second) },
      { event: invalid, validation: validateEvent(invalid) },
    ],
    {
      eventLabels,
      productName: (productId) => state.products.find((product) => product.id === productId)?.name ?? productId,
      formatQuantity,
      simpleValidationReason,
    },
  );

  assert.equal(items.length, 2);
  assert.equal(items[0].work_item_id, "work-sale-1");
  assert.equal(items[0].product_name, "Sale - Harbor Room - 2 products");
  assert.equal(items[0].location, "Grouped work: 2 events");
  assert.equal(items[0].amount, "2 stock lines");
  assert.equal(items[0].detail, "2 grouped event records");
  assert.equal(items[0].detailIsCode, false);
  assert.equal(items[1].valid, false);
  assert.equal(items[1].status, "Choose where the stock arrived.");
  assert.equal(items[1].detailIsCode, true);
});
