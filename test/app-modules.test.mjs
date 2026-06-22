import assert from "node:assert/strict";
import test from "node:test";

import { validateEvent } from "../src/domain/ledger.mjs";
import {
  DEFAULT_PRODUCTS,
  defaultProducts,
  defaultState,
  seedEvents,
  seedPurchases,
  seedSales,
} from "../src/data/demo-data.mjs";
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
import { answerAssistantQuestion } from "../src/assistant/assistant-engine.mjs";
import { buildWorkQueueItems } from "../src/stock-actions/work-queue.mjs";
import { escapeAttr, escapeHtml, formatQuantity } from "../src/utils/format.mjs";

test("demo data module creates isolated default state with valid seed events", () => {
  const firstState = defaultState();
  const secondState = defaultState();

  assert.notEqual(firstState, secondState);
  assert.notEqual(firstState.products, secondState.products);
  assert.equal(firstState.products.length, DEFAULT_PRODUCTS.length);
  assert.equal(firstState.serverLedger.every((event) => validateEvent(event).valid), true);
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

  assert.match(answerAssistantQuestion("How many stocks do we have?", context).text, /products with replayed stock/);
  assert.match(answerAssistantQuestion("Who won the basketball game?", context).text, /I.m built for StockLedger/);
});

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
