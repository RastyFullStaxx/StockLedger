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
import { actionTemplate, eventLabels, navigationGroups, screenMeta } from "../src/config/app-config.mjs";
import { STORAGE_KEY, loadState, normalizeSelectedProductIds, saveState } from "../src/state/local-state.mjs";
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
