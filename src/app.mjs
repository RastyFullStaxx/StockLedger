import {
  applySyncBatch,
  computeStock,
  createInventoryEvent,
  replayAuditTrail,
  sortEvents,
  summarizeStock,
  validateEvent,
} from "./domain/ledger.mjs";
import { animate } from "motion";

import "./styles.css";

const STORAGE_KEY = "stockledger-local-prototype-state-v1";
const PRODUCT_DEACTIVATE_EPSILON = 0.0001;
const PRODUCT_DEACTIVATION_REASON = "Product deactivated; balances auto-closed by system";
const PRODUCT_EVENT_PREFIX = "PRODUCT_";
const ACTION_EVENT_TYPES = [
  "STOCK_IN",
  "STOCK_OUT",
  "STOCK_TRANSFER",
  "STOCK_ADJUSTMENT",
  "STOCK_REVERT",
  "PRODUCT_CREATED",
  "PRODUCT_DEACTIVATED",
  "PRODUCT_REACTIVATED",
];
const tenant = {
  client_id: "tenant-northstar-hospitality",
  client_name: "Northstar Hospitality",
  device_id: "device-main-bar-terminal",
  device_name: "Main Bar Terminal",
  user_id: "user-mara-velasco",
  actor_name: "Mara Velasco",
};

const DEFAULT_PRODUCTS = [
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

function defaultProducts() {
  return DEFAULT_PRODUCTS.map((product) => ({ ...product }));
}

const locations = [
  { id: "loc-dry-store", name: "Dry Store" },
  { id: "loc-main-bar", name: "Main Bar" },
  { id: "loc-kitchen", name: "Kitchen" },
  { id: "loc-cellar", name: "Cellar" },
];

let state = loadState();
let productLifecycleBusy = null;
let toastTimer = null;
let shouldFocusActionOnCompose = state.activeView === "compose";
let fieldSelectUid = 0;
let customSelectEventsBound = false;
let sidebarMotion = null;
const eventSelectPortalMap = new WeakMap();
const shouldReduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const tabMotionQueue = {
  activeView: null,
  stockView: null,
};
const sidebarTemplateColumns = {
  expanded: "236px minmax(0, 1fr)",
  collapsed: "68px minmax(0, 1fr)",
};

function getSidebarTemplateColumns(collapsed) {
  return collapsed ? sidebarTemplateColumns.collapsed : sidebarTemplateColumns.expanded;
}

function animateSidebarTransition(targetCollapsed) {
  return new Promise((resolve) => {
    if (shouldReduceMotion) {
      resolve();
      return;
    }

    const shell = document.querySelector(".app-shell");
    if (!shell) {
      resolve();
      return;
    }

    const from = window.getComputedStyle(shell).gridTemplateColumns;
    const to = getSidebarTemplateColumns(targetCollapsed);

    if (from === to) {
      resolve();
      return;
    }

    if (sidebarMotion?.stop) {
      sidebarMotion.stop();
    }

    sidebarMotion = animate(
      shell,
      {
        gridTemplateColumns: [from, to],
      },
      {
        duration: 0.24,
        ease: "easeOut",
      },
    );

    sidebarMotion.finished
      .then(() => {
        shell.style.removeProperty("grid-template-columns");
        sidebarMotion = null;
        resolve();
      })
      .catch(() => {
        shell.style.removeProperty("grid-template-columns");
        sidebarMotion = null;
        resolve();
      });
  });
}

function animateTabPress(button) {
  if (shouldReduceMotion || !button) return;
  animate(
    button,
    {
      scale: [1, 0.98, 1],
      y: [0, 1, 0],
    },
    {
      duration: 0.16,
      ease: "easeOut",
    },
  );
}

function animateTabActivate(button) {
  if (shouldReduceMotion || !button) return;
  animate(
    button,
    {
      scale: [0.99, 1.01, 1],
      y: [2, 0],
    },
    {
      duration: 0.24,
      ease: "easeOut",
    },
  );
}

function animateTabHover(button, hovered) {
  if (shouldReduceMotion || !button) return;
  animate(
    button,
    {
      y: hovered ? -1 : 0,
      scale: hovered ? 1.01 : 1,
    },
    {
      duration: 0.16,
      ease: "easeOut",
    },
  );
}

function flushQueuedTabMotion() {
  if (shouldReduceMotion) {
    tabMotionQueue.activeView = null;
    tabMotionQueue.stockView = null;
    return;
  }

  if (tabMotionQueue.activeView === state.activeView) {
    const nextTab = document.querySelector(`.nav-item[data-view="${CSS.escape(tabMotionQueue.activeView)}"]`);
    if (nextTab) animateTabActivate(nextTab);
    tabMotionQueue.activeView = null;
  } else {
    tabMotionQueue.activeView = null;
  }

  if (tabMotionQueue.stockView === state.stockView) {
    const nextStockTab = document.querySelector(`.stock-overview-view-tab[data-stock-view="${CSS.escape(tabMotionQueue.stockView)}"]`);
    if (nextStockTab) animateTabActivate(nextStockTab);
    tabMotionQueue.stockView = null;
  } else {
    tabMotionQueue.stockView = null;
  }
}

function bindTabMotion() {
  if (shouldReduceMotion) return;

  const bindSimplePressMotion = (button) => {
    button.addEventListener("pointerdown", () => animateTabPress(button), { passive: true });
    button.addEventListener("click", (event) => {
      if (event.detail === 0) {
        animateTabPress(button);
      }
    });
  };

  document.querySelectorAll(".nav-item").forEach((button) => {
    bindSimplePressMotion(button);
    button.addEventListener("pointerenter", () => animateTabHover(button, true), { passive: true });
    button.addEventListener("pointerleave", () => animateTabHover(button, false), { passive: true });
  });

  document.querySelectorAll(".stock-overview-view-tab").forEach((button) => {
    bindSimplePressMotion(button);
    button.addEventListener("pointerenter", () => animateTabHover(button, true), { passive: true });
    button.addEventListener("pointerleave", () => animateTabHover(button, false), { passive: true });
  });

  document.querySelectorAll("[data-view]:not(.nav-item):not(.stock-overview-view-tab)").forEach((button) => {
    bindSimplePressMotion(button);
  });
}

function seedEvents() {
  const start = Date.now() - 1000 * 60 * 60 * 4;
  const seed = [
    ["STOCK_IN", "prod-gin", null, "Dry Store", 24, "Supplier delivery accepted"],
    ["STOCK_IN", "prod-rum", null, "Cellar", 18, "Supplier delivery accepted"],
    ["STOCK_IN", "prod-lime", null, "Kitchen", 32, "Morning prep count"],
    ["STOCK_IN", "prod-tonic", null, "Dry Store", 15, "Supplier delivery accepted"],
    ["STOCK_TRANSFER", "prod-gin", "Dry Store", "Main Bar", 8, "Opening bar par level"],
    ["STOCK_TRANSFER", "prod-tonic", "Dry Store", "Main Bar", 6, "Opening bar par level"],
    ["STOCK_OUT", "prod-gin", "Main Bar", null, 3, "Service usage"],
    ["STOCK_OUT", "prod-lime", "Kitchen", null, 9, "Prep usage"],
    ["STOCK_ADJUSTMENT", "prod-tonic", null, "Main Bar", -1, "Physical count variance"],
  ];

  return seed.map(([type, product_id, from_location, to_location, quantity, reason], index) =>
    createInventoryEvent({
      ...tenant,
      event_id: `seed-event-${index + 1}`,
      idempotency_key: `seed-idem-${index + 1}`,
      sync_batch_id: "batch-seed-001",
      type,
      product_id,
      product_name: DEFAULT_PRODUCTS.find((product) => product.id === product_id)?.name ?? product_id,
      from_location,
      to_location,
      quantity,
      reason,
      sequence_number: index + 1,
      timestamp: start + index * 1000 * 60 * 8,
      status: "synced",
    }),
  );
}

function defaultState() {
  return {
    serverLedger: seedEvents(),
    outbox: [],
    online: false,
    activeView: "home",
    products: defaultProducts(),
    stockView: "totals",
    selectedLocation: "Main Bar",
    productFilter: "all",
    locationFilter: "all",
    stockSearch: "",
    stockPage: 1,
    auditPage: 1,
    outboxPage: 1,
    activeProductsPage: 1,
    inactiveProductsPage: 1,
    message: "",
    toast: null,
    accountOpen: false,
    sidebarCollapsed: false,
    lastSync: null,
    guideOpen: false,
    form: {
      type: "STOCK_OUT",
      product_id: "prod-gin",
      from_location: "Main Bar",
      to_location: "",
      quantity: 1,
      physical_count: "",
      reason: "",
      original_event_id: "",
    },
    productForm: {
      name: "",
      category: "",
      unit: "unit",
      low: "0",
    },
  };
}

const screenMeta = {
  home: {
    title: "StockLedger",
    kicker: "Home",
    label: "Home",
    guide: "Start here when you want the shortest path into the local prototype.",
  },
  dashboard: {
    title: "Stock Overview",
    kicker: "Inventory",
    label: "Stock Overview",
    guide: "Start here. Check total stock first, then look at one location when you need detail.",
  },
  compose: {
    title: "Stock Actions",
    kicker: "Actions",
    label: "Stock Actions",
    guide: "Record stock work, product lifecycle work, and send the pending batch from one place.",
  },
  products: {
    title: "Products",
    kicker: "Catalog",
    label: "Products",
    guide: "Use this as a catalog view. Product changes are prepared in Stock Actions so they enter the same work queue.",
  },
  audit: {
    title: "Audit",
    kicker: "History",
    label: "Audit",
    guide: "Use this when a number looks wrong. It shows who recorded each change and how stock was affected.",
  },
};

const eventLabels = {
  STOCK_IN: "Stock In",
  STOCK_OUT: "Use Stock",
  STOCK_TRANSFER: "Move Stock",
  STOCK_ADJUSTMENT: "Correct Stock Count",
  STOCK_REVERT: "Reverse a Record",
  PRODUCT_CREATED: "Enroll Product",
  PRODUCT_DEACTIVATED: "Suspend Product",
  PRODUCT_REACTIVATED: "Reactivate Product",
};

const actionTabLabels = {
  STOCK_IN: "Stock In",
  STOCK_OUT: "Use Stock",
  STOCK_TRANSFER: "Move Stock",
  STOCK_ADJUSTMENT: "Correct Count",
  STOCK_REVERT: "Reverse",
  PRODUCT_CREATED: "Enroll",
  PRODUCT_DEACTIVATED: "Suspend",
  PRODUCT_REACTIVATED: "Reactivate",
};

const REVERTIBLE_EVENT_TYPES = new Set(["STOCK_IN", "STOCK_OUT", "STOCK_TRANSFER", "STOCK_ADJUSTMENT"]);

const ACTION_TEMPLATES = {
  STOCK_IN: {
    template: "Stock In Template",
    summary: "Product arrived into one location.",
    help: "Use this for supplier delivery, restock, or opening stock. Choose where the stock arrived.",
    requiredFields: ["product_id", "to_location", "quantity"],
    sourceLabel: "Not Used",
    destinationLabel: "Arrived At",
    quantityLabel: "Amount Received",
    reasonPlaceholder: "Example: supplier delivery accepted",
    showFromLocation: false,
    showToLocation: true,
    showOriginalEvent: false,
    quantityEditable: true,
    requiresPositiveQuantity: true,
    defaults: {
      from_location: "",
      to_location: "Dry Store",
      quantity: 1,
      original_event_id: "",
    },
  },
  STOCK_OUT: {
    template: "Use Stock Template",
    summary: "Product left one location.",
    help: "Use this when stock was sold, used, wasted, or broken. Choose where it left from.",
    requiredFields: ["product_id", "from_location", "quantity"],
    sourceLabel: "Left From",
    destinationLabel: "Not Used",
    quantityLabel: "Amount Used",
    reasonPlaceholder: "Example: evening service use",
    showFromLocation: true,
    showToLocation: false,
    showOriginalEvent: false,
    quantityEditable: true,
    requiresPositiveQuantity: true,
    defaults: {
      from_location: "Main Bar",
      to_location: "",
      quantity: 1,
      original_event_id: "",
    },
  },
  STOCK_TRANSFER: {
    template: "Transfer Template",
    summary: "Product moved between two locations.",
    help: "Use this when stock moved from one place to another. Choose both the starting place and ending place.",
    requiredFields: ["product_id", "from_location", "to_location", "quantity"],
    sourceLabel: "Move From",
    destinationLabel: "Move To",
    quantityLabel: "Amount Moved",
    reasonPlaceholder: "Example: moved to Main Bar for opening",
    showFromLocation: true,
    showToLocation: true,
    showOriginalEvent: false,
    quantityEditable: true,
    requiresPositiveQuantity: true,
    defaults: {
      from_location: "Dry Store",
      to_location: "Main Bar",
      quantity: 1,
      original_event_id: "",
    },
  },
  STOCK_ADJUSTMENT: {
    template: "Correct Stock Count Template",
    summary: "A hand count found a difference.",
    help: "Choose the product and location you counted. Enter what you physically counted — the system shows the current count and calculates the difference for you.",
    requiredFields: ["product_id", "to_location", "quantity"],
    sourceLabel: "Count Location",
    destinationLabel: "Not Used",
    quantityLabel: "Correction Amount",
    reasonPlaceholder: "Example: physical count difference",
    showFromLocation: false,
    showToLocation: true,
    showOriginalEvent: false,
    quantityEditable: true,
    isPhysicalCount: true,
    requiresPositiveQuantity: false,
    defaults: {
      from_location: "",
      to_location: "Main Bar",
      quantity: 1,
      physical_count: "",
      original_event_id: "",
    },
  },
  STOCK_REVERT: {
    template: "Reverse a Record Template",
    summary: "Cancel one earlier movement without deleting it.",
    help: "Use this to reverse a mistake. Choose the original movement that should be cancelled.",
    requiredFields: ["product_id", "original_event_id"],
    sourceLabel: "Original Location",
    destinationLabel: "Not Used",
    quantityLabel: "Reversal Amount",
    reasonPlaceholder: "Example: wrong product was selected",
    showFromLocation: false,
    showToLocation: false,
    showOriginalEvent: true,
    quantityEditable: false,
    requiresPositiveQuantity: true,
    defaults: {
      from_location: "",
      to_location: "",
      quantity: 1,
      original_event_id: "",
    },
  },
  PRODUCT_CREATED: {
    template: "Product Enrollment Template",
    summary: "Add a product to the catalog before stock work references it.",
    help: "Use this for a new product. Enrollment is saved to the same work queue as inventory records.",
    kind: "product-create",
    reasonPlaceholder: "Example: new seasonal item",
    defaults: {
      from_location: "",
      to_location: "",
      quantity: 0,
      original_event_id: "",
    },
  },
  PRODUCT_DEACTIVATED: {
    template: "Product Suspension Template",
    summary: "Suspend a product and close any replayed stock balance.",
    help: "Use this when a product should stop appearing in stock work. Any non-zero balance is queued as grouped closure work.",
    kind: "product-suspend",
    reasonPlaceholder: "Example: seasonal item removed from menu",
    defaults: {
      from_location: "",
      to_location: "",
      quantity: 0,
      original_event_id: "",
    },
  },
  PRODUCT_REACTIVATED: {
    template: "Product Reactivation Template",
    summary: "Return a suspended product to active use.",
    help: "Use this when a suspended product should be selectable again. Reactivation does not create stock movement.",
    kind: "product-reactivate",
    reasonPlaceholder: "Example: seasonal item returned",
    defaults: {
      from_location: "",
      to_location: "",
      quantity: 0,
      original_event_id: "",
    },
  },
};

function actionTemplate(type) {
  return ACTION_TEMPLATES[type] ?? ACTION_TEMPLATES.STOCK_OUT;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultState();

  try {
    const parsed = JSON.parse(saved);
    const next = {
      ...defaultState(),
      ...parsed,
      form: { ...defaultState().form, ...(parsed.form ?? {}) },
      productForm: { ...defaultState().productForm, ...(parsed.productForm ?? {}) },
      products: sanitizeProducts(parsed.products),
    };
    delete next.physicalCounts;
    delete next.selectedReconcileRowKey;
    if (next.activeView === "reconcile" || next.activeView === "outbox") next.activeView = "compose";
    return next;
  } catch {
    return defaultState();
  }
}

function sanitizeProducts(products) {
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

function nextRandomId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function saveState() {
  const { toast, accountOpen, ...persistedState } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
}

function render() {
  const app = document.querySelector("#app");
  ensureProductSelectionIntegrity();
  const localLedger = allLocalEvents();
  const stockRows = filteredStockRows(localLedger);
  const outboxValidation = state.outbox.map((event) => ({ event, validation: validateEvent(event) }));

  const focusSnapshot = captureFocusSnapshot(app);

  app.innerHTML = `
    <div class="app-shell ${state.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
      ${renderSidebar()}
      <main class="workspace">
        ${renderTopbar()}
        ${renderActiveView(localLedger, stockRows, outboxValidation)}
      </main>
      ${renderToast()}
    </div>
  `;

  restoreFocusSnapshot(app, focusSnapshot);

  if (state.activeView === "compose" && shouldFocusActionOnCompose) {
    requestAnimationFrame(() => {
      const typeField =
        app.querySelector(`.action-type-tab[data-action-type="${CSS.escape(state.form.type)}"]`) ??
        app.querySelector(".action-type-tab");
      if (typeField) {
        typeField.focus();
      }
      shouldFocusActionOnCompose = false;
    });
  }

  bindEvents();
}

function captureFocusSnapshot(app) {
  const active = document.activeElement;
  if (!active || !app.contains(active) || !active.name) return null;
  if (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA") return null;

  return {
    name: active.name,
    selectionStart: typeof active.selectionStart === "number" ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : null,
  };
}

function restoreFocusSnapshot(app, snapshot) {
  if (!snapshot) return;
  const next = app.querySelector(`[name="${snapshot.name}"]`);
  if (!next) return;

  next.focus();
  if (snapshot.selectionStart !== null && typeof next.setSelectionRange === "function") {
    try {
      next.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    } catch {
      // Some input types (e.g. number) don't support selection ranges in all browsers; ignore.
    }
  }
}

function renderSidebar() {
  const navItems = [
    ["home", screenMeta.home],
    ["dashboard", screenMeta.dashboard],
    ["products", screenMeta.products],
    ["compose", screenMeta.compose],
    ["audit", screenMeta.audit],
  ];

  return `
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="brand-lockup">
        ${
          state.sidebarCollapsed
            ? `<button class="brand-mark brand-mark-toggle" data-action="toggle-sidebar" type="button" aria-label="Expand Sidebar" aria-pressed="true">
                <img class="brand-logo" src="/logo.svg" alt="" />
                <span class="brand-mark-icon" aria-hidden="true">${icon("panelOpen")}</span>
              </button>`
            : `<div class="brand-mark" aria-hidden="true"><img src="/logo.svg" alt="" /></div>`
        }
        <div class="brand-copy">
          <p class="brand-name"><span>Stock</span><span>Ledger</span></p>
        </div>
        ${
          state.sidebarCollapsed
            ? ""
            : `<button class="sidebar-toggle" data-action="toggle-sidebar" type="button" aria-label="Collapse Sidebar" aria-pressed="false">
                ${icon("panelClose")}
              </button>`
        }
      </div>
      <nav class="nav-list">
        <div class="nav-group-items">
          ${navItems
            .map(
              ([key, item]) => `
                <button class="nav-item ${state.activeView === key ? "is-active" : ""}" data-view="${key}" type="button">
                  ${icon(navIcon(key))}
                  <span>
                    <span class="nav-item-title">${item.label}</span>
                  </span>
                  ${key === "compose" && state.outbox.length ? `<strong>${state.outbox.length}</strong>` : ""}
                </button>
              `,
            )
            .join("")}
        </div>
      </nav>
      <div class="sidebar-divider" role="separator"></div>
      <div class="account-menu">
        <button class="account-trigger" data-action="toggle-account" type="button" aria-expanded="${state.accountOpen}">
          <span class="account-avatar" aria-hidden="true">NH</span>
          <span>
            <small>Current Site</small>
            <strong>${tenant.client_name}</strong>
            <em>${tenant.device_name}</em>
          </span>
          ${icon("chevron")}
        </button>
        ${
          state.accountOpen
                ? `<div class="account-popover">
                    <button class="account-popover-toggle" data-action="toggle-online" type="button" aria-pressed="${state.online}">
                      ${icon(state.online ? "wifi" : "wifiOff")}
                      <span class="account-popover-toggle-label">${state.online ? "Online" : "Offline"}</span>
                      <span class="mini-toggle-track ${state.online ? "is-on" : ""}" aria-hidden="true"><span class="mini-toggle-thumb"></span></span>
                    </button>
                    <button type="button" data-action="reset-demo">${icon("refresh")}Reset Demo</button>
                  </div>`
            : ""
        }
      </div>
    </aside>
  `;
}

function renderTopbar() {
  const meta = screenMeta[state.activeView] ?? screenMeta.dashboard;
  const guideCue = guideCueCount();
  return `
    <header class="topbar">
      <div>
        <h1>${viewTitle()}</h1>
      </div>
      <div class="topbar-actions">
        <span class="guide-anchor">
          <button class="button button-secondary guide-button ${state.guideOpen ? "is-open" : ""}" data-action="toggle-guide" type="button" aria-expanded="${state.guideOpen}">
            ${icon("spark")}
            Guide
            ${guideCue ? `<span class="cue-badge">${guideCue}</span>` : `<span class="cue-dot" aria-hidden="true"></span>`}
          </button>
          ${state.guideOpen ? renderGuideMenu() : ""}
        </span>
      </div>
    </header>
  `;
}

function guideCueCount() {
  return guideNotifications().length;
}

function guideNotifications() {
  const stockRows = filteredStockRows(allLocalEvents());
  const lowRows = stockRows.filter((row) => row.quantity >= 0 && row.quantity <= productLow(row.product_id));
  const negativeRows = stockRows.filter((row) => row.quantity < 0);
  const notifications = [];

  if (state.outbox.length > 0) {
    notifications.push({
      tone: state.online ? "success" : "warning",
      title: `${state.outbox.length} Work Item${state.outbox.length === 1 ? "" : "s"} Waiting`,
      text: state.online ? "Send saved work now." : "Work is safe locally. Go online to send it.",
    });
  }

  negativeRows.forEach((row) => {
    notifications.push({
      tone: "error",
      title: `${row.product_name} Needs Review`,
      text: `${row.location} is below zero. Check history before reporting.`,
    });
  });

  lowRows.slice(0, 6).forEach((row) => {
    notifications.push({
      tone: row.quantity === 0 ? "error" : "warning",
      title: `${row.product_name} Needs Restock`,
      text: `${row.location}: ${formatQuantity(row.quantity)} ${productUnit(row.product_id)} left.`,
    });
  });

  if (notifications.length === 0) {
    notifications.push({
      tone: "success",
      title: "No Urgent Notifications",
      text: "Stock levels and saved work look clear right now.",
    });
  }

  return notifications;
}

function renderGuideMenu() {
  const meta = screenMeta[state.activeView] ?? screenMeta.dashboard;
  const action = nextAction({
    lowRows: filteredStockRows(allLocalEvents()).filter((row) => row.quantity >= 0 && row.quantity <= productLow(row.product_id)).length,
    invalidOutbox: state.outbox.map((event) => validateEvent(event)).filter((result) => !result.valid).length,
    negativeRows: filteredStockRows(allLocalEvents()).filter((row) => row.quantity < 0).length,
  });
  const tips = guideTips();
  const notifications = guideNotifications();

  return `
    <div class="guide-menu" role="dialog" aria-label="Page Guide">
      <div class="guide-menu-header">
        <div>
          <span>Guide</span>
          <strong>${meta.title}</strong>
        </div>
        <button class="icon-button" data-action="toggle-guide" type="button" aria-label="Close Guide">${icon("close")}</button>
      </div>
      <p>${meta.guide}</p>
      <div class="guide-alerts">
        <span>Notifications</span>
        ${notifications
          .map(
            (item) => `
              <article class="guide-alert is-${item.tone}">
                <strong>${item.title}</strong>
                <small>${item.text}</small>
              </article>
            `,
          )
          .join("")}
      </div>
      <div class="guide-next">
        <span>Suggested Next Action</span>
        <strong>${action.title}</strong>
        <small>${action.text}</small>
        <button class="button button-primary" data-view="${action.view}" type="button">${action.button}</button>
      </div>
      <ul>
        ${tips.map((tip) => `<li>${tip}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderToast() {
  if (!state.toast?.message) return "";

  return `
    <div class="toast ${state.toast.type === "error" ? "is-error" : ""}" role="status" aria-live="polite">
      ${state.toast.type === "error" ? icon("alert") : icon("check")}
      <span>${state.toast.message}</span>
    </div>
  `;
}

function guideTips() {
  const tips = {
    dashboard: ["Use Total Stock for the master count.", "Use By Location to check one store room, bar, or kitchen.", "Open Detailed List only when you need every product-location row."],
    compose: ["Choose the action in user terms.", "Record what happened, not the final stock number.", "For Correct Stock Count, enter what you counted — the system shows the current count and calculates the difference.", "Send pending work from the Work to Send panel."],
    audit: ["Use History when a number needs explaining.", "Prepare a reverse record instead of deleting history.", "The original movement remains visible."],
    products: ["Use Products as a catalog view.", "Enroll, suspend, or reactivate products from Stock Actions.", "Keep product naming consistent for easy searching."],
  };

  return tips[state.activeView] ?? tips.dashboard;
}

function renderStatusRail(localLedger, stockRows, outboxValidation) {
  const negativeRows = stockRows.filter((row) => row.quantity < 0).length;
  const lowRows = stockRows.filter((row) => row.quantity >= 0 && row.quantity <= productLow(row.product_id)).length;
  const invalidOutbox = outboxValidation.filter((entry) => !entry.validation.valid).length;

  return `
    <section class="dashboard-kpi-grid" aria-label="Ledger status">
      ${metricCard("Saved Changes", localLedger.length)}
      ${metricCard("Waiting to Send", state.outbox.length)}
      ${metricCard("Low Stock", lowRows)}
      ${metricCard("Needs Review", negativeRows + invalidOutbox)}
    </section>
  `;
}

function renderActiveView(localLedger, stockRows, outboxValidation) {
  if (state.activeView === "home") return renderLanding(localLedger, stockRows, outboxValidation);
  if (state.activeView === "compose" || state.activeView === "outbox") return renderComposer(localLedger, outboxValidation);
  if (state.activeView === "audit") return renderAudit(localLedger);
  if (state.activeView === "products") return renderProducts();
  return renderDashboard(localLedger, stockRows, outboxValidation);
}

function renderLanding(localLedger, stockRows, outboxValidation) {
  const lowRows = stockRows.filter((row) => row.quantity >= 0 && row.quantity <= productLow(row.product_id));
  const invalidOutbox = outboxValidation.filter((entry) => !entry.validation.valid).length;
  const recentRows = replayAuditTrail(localLedger).reverse().slice(0, 4);

  return `
    <section class="landing-shell" aria-label="StockLedger Home">
      <div class="landing-hero">
        <div class="landing-copy">
          <h2>Inventory That Explains Every Number.</h2>
          <p>Record movements, keep work safe offline, and replay the ledger when a count needs proof.</p>
          <div class="landing-actions">
            <button class="button button-primary" data-view="compose" type="button">${icon("plus")}Stock Actions</button>
            <button class="button button-secondary" data-view="dashboard" type="button">${icon("layers")}Open Stock Overview</button>
          </div>
        </div>
      </div>
        <div class="landing-grid">
          <article class="landing-card">
            <span>${icon("layers")}</span>
            <h3>See The Master Stock</h3>
            <button class="table-action" data-view="dashboard" type="button">View Stock</button>
          </article>
          <article class="landing-card">
            <span>${icon("history")}</span>
            <h3>Trace Every Change</h3>
            <button class="table-action" data-view="audit" type="button">Open History</button>
          </article>
          <article class="landing-card">
            <span>${icon("send")}</span>
            <h3>Send Saved Work</h3>
            <button class="table-action" data-view="compose" type="button">Open Stock Actions</button>
          </article>
          <article class="landing-card">
            <span>${icon("list")}</span>
            <h3>Manage Products</h3>
            <button class="table-action" data-view="products" type="button">Open Catalog</button>
          </article>
        </div>
      <article class="panel landing-recent">
        <div class="panel-header panel-header--compact">
          <button class="table-action" data-view="audit" type="button">View All</button>
        </div>
        <div class="landing-timeline">
          ${recentRows
            .map(
              (entry) => `
                <div>
                  <span>${eventLabels[entry.type] ?? entry.type}</span>
                  <strong>${entry.product_name}</strong>
                  <small>${entry.location} &middot; ${entry.delta > 0 ? "+" : ""}${formatQuantity(entry.delta)} ${productUnit(entry.product_id)}</small>
                </div>
              `,
            )
            .join("")}
        </div>
      </article>
    </section>
  `;
}

function renderDashboard(localLedger, stockRows, outboxValidation) {
  return `
    <section class="content-grid stock-overview-grid">
      ${renderStatusRail(localLedger, stockRows, outboxValidation)}
      <article class="panel panel-wide panel--flush-table">
        <div class="stock-overview-toolbar-row">
          ${renderStockControls()}
        </div>
        ${renderStockView(stockRows)}
      </article>
    </section>
  `;
}

function renderComposer(localLedger, outboxValidation) {
  const form = state.form;
  const validation = previewEventValidation();
  const revertOptions = sortEvents(localLedger)
    .filter((event) => isRevertibleEvent(event.type))
    .slice(-12)
    .reverse();
  const template = actionTemplate(form.type);
  const isStockAction = !template.kind;
  const canPreviewValidation = isStockAction;

  return `
    <section class="content-grid stock-actions-grid">
      <article class="panel panel-wide">
        <form class="event-form" data-form="event">
          <div class="action-type-field form-field-span-2">
            <span class="action-type-label">Action Type</span>
            ${renderActionTypeTabs(form.type)}
            <input type="hidden" name="type" value="${escapeAttr(form.type)}" />
          </div>
          ${renderActionTemplate(form.type)}
          ${renderActionFields(form, template, revertOptions)}
          <div class="form-footer form-field-span-2">
            <div class="validation ${canPreviewValidation ? (validation.valid ? "is-valid" : "is-error") : "is-valid"}">
              ${canPreviewValidation ? (validation.valid ? "Ready to Save on This Device." : simpleValidationReason(validation.reason)) : "Ready to Save on This Device."}
            </div>
            <button class="button button-primary" data-action="append-event" type="button">${icon("plus")}Save Action</button>
          </div>
        </form>
      </article>
      ${renderWorkQueue(outboxValidation)}
    </section>
  `;
}

function renderProducts() {
  const activeProducts = getActiveProducts();
  const inactiveProducts = getInactiveProducts();

  const activePagination = paginateRows(activeProducts, state.activeProductsPage);
  state.activeProductsPage = activePagination.page;
  const inactivePagination = paginateRows(inactiveProducts, state.inactiveProductsPage);
  state.inactiveProductsPage = inactivePagination.page;

  return `
    <section class="content-grid">
      <article class="panel panel-wide catalog-callout">
        <div>
          <h2>Catalog View</h2>
          <p>Use Stock Actions to enroll, suspend, or reactivate products so those changes join the same work queue as stock records.</p>
        </div>
        <button class="button button-primary" data-view="compose" type="button">${icon("plus")}Open Stock Actions</button>
      </article>
      <article class="panel panel-wide panel--flush-table">
        <div class="panel-header">
          <h2>Active Products</h2>
        </div>
        ${activeProducts.length === 0 ? `<div class="empty-state"><strong>No Active Products</strong></div>` : renderProductTable(activePagination.pageRows, "active", activePagination)}
      </article>
      <article class="panel panel-wide panel--flush-table">
        <div class="panel-header">
          <h2>Inactive Products</h2>
        </div>
        ${inactiveProducts.length === 0 ? `<div class="empty-state"><strong>No Inactive Products</strong></div>` : renderProductTable(inactivePagination.pageRows, "inactive", inactivePagination)}
      </article>
    </section>
  `;
}

function renderProductTable(products, group, pagination) {
  return `
    <div class="table-wrap stock-table product-table-wrap">
      <table class="product-table">
        <colgroup>
          <col class="product-col-product" />
          <col class="product-col-category" />
          <col class="product-col-unit" />
          <col class="product-col-low-stock" />
          <col class="product-col-status" />
          <col class="product-col-state-change" />
        </colgroup>
        <thead>
          <tr>
            <th class="col-product">Product</th>
            <th class="col-category">Category</th>
            <th class="col-unit">Unit</th>
            <th class="col-low-stock">Low Stock</th>
            <th class="col-status">Status</th>
            <th class="col-state-change">Last State Change</th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map((product) => {
              const isInactive = group === "inactive";
              const status = isInactive ? "Suspended" : "Active";
              const statusClass = isInactive ? "is-warning" : "is-valid";
              const changeLabel = productLastStateLabel(product);

              return `
                <tr class="product-row ${!product.is_active ? "is-inactive" : ""}">
                  <td class="col-product">${escapeHtml(product.name)}</td>
                  <td class="col-category">${escapeHtml(product.category || "Uncategorized")}</td>
                  <td class="col-unit">${escapeHtml(product.unit || "unit")}</td>
                  <td class="col-low-stock">${formatQuantity(product.low)}</td>
                  <td class="col-status"><span class="product-status badge ${statusClass}">${status}</span></td>
                  <td class="col-state-change">${escapeHtml(changeLabel)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
      <div class="stock-cards product-cards" aria-label="Product list">
        ${products
          .map((product) => {
            const isInactive = group === "inactive";
            const status = isInactive ? "Suspended" : "Active";
            const statusClass = isInactive ? "is-warning" : "is-valid";
            const changeLabel = productLastStateLabel(product);

            return `
              <article class="panel-list-card">
                <div class="kv-row">
                  <div>
                    <strong>${escapeHtml(product.name)}</strong>
                  </div>
                  <span class="product-status badge ${statusClass}">${status}</span>
                </div>
                <dl>
                  <div><dt>Low Stock</dt><dd>${formatQuantity(product.low)}</dd></div>
                  <div><dt>Last State Change</dt><dd>${escapeHtml(changeLabel)}</dd></div>
                </dl>
                ${
                  isInactive && hasPendingProductClosureDebt(product.id)
                    ? `<small class="table-action-subtle" aria-live="polite">Pending lifecycle updates are still in Work to Send.</small>`
                    : ""
                }
              </article>
            `;
          })
          .join("")}
      </div>
      ${renderTablePagination(group === "inactive" ? "inactive-products" : "active-products", pagination, products.length)}
    </div>
  `;
}

function renderActionFields(form, template, revertOptions) {
  if (template.kind === "product-create") return renderProductCreateFields();
  if (template.kind === "product-suspend") return renderProductLifecycleFields("active", template);
  if (template.kind === "product-reactivate") return renderProductLifecycleFields("inactive", template);

  return `
    <label class="field-select-wrap">
      <span>Product</span>
      ${renderFieldSelect({
        name: "product_id",
        menuClassName: "field-select-menu--event-form",
        menuMode: "event-form",
        options: getActiveProducts()
          .map((product) => `<option value="${product.id}" ${form.product_id === product.id ? "selected" : ""}>${product.name}</option>`)
          .join(""),
      })}
    </label>
    ${renderActionTemplateFields(form, template, revertOptions)}
    <label class="form-field-span-2">
      <span>Reason</span>
      <textarea name="reason" rows="3" placeholder="${template.reasonPlaceholder}">${escapeHtml(form.reason)}</textarea>
    </label>
  `;
}

function renderProductCreateFields() {
  const productForm = state.productForm ?? { name: "", category: "", unit: "unit", low: "0" };

  return `
    <label>
      <span>Product Name</span>
      <input name="product-name" type="text" value="${escapeAttr(productForm.name)}" placeholder="e.g. Ginger Syrup" />
    </label>
    <label>
      <span>Category</span>
      <input name="product-category" type="text" value="${escapeAttr(productForm.category)}" placeholder="e.g. Mixer" />
    </label>
    <label>
      <span>Unit</span>
      <input name="product-unit" type="text" value="${escapeAttr(productForm.unit)}" placeholder="e.g. bottle, kg, case, unit" />
    </label>
    <label>
      <span>Low Stock Alert Threshold</span>
      <input name="product-low" type="number" step="0.01" min="0" value="${escapeAttr(productForm.low)}" placeholder="e.g. 6" />
    </label>
  `;
}

function renderProductLifecycleFields(scope, template) {
  const products = scope === "inactive" ? getInactiveProducts() : getActiveProducts();
  const selectedProduct = products.find((product) => product.id === state.form.product_id) ?? products[0] ?? null;
  const closures = template.kind === "product-suspend" && selectedProduct ? getProductDeactivationClosures(selectedProduct) : [];

  return `
    <label class="field-select-wrap form-field-span-2">
      <span>Product</span>
      ${renderFieldSelect({
        name: "product_id",
        menuClassName: "field-select-menu--event-form",
        menuMode: "event-form",
        options:
          products.length === 0
            ? `<option value="">No ${scope === "inactive" ? "suspended" : "active"} products available</option>`
            : products
                .map((product) => `<option value="${product.id}" ${(selectedProduct?.id ?? state.form.product_id) === product.id ? "selected" : ""}>${product.name}</option>`)
                .join(""),
      })}
    </label>
    ${
      template.kind === "product-suspend"
        ? `<div class="panel form-field-span-2 product-action-preview">
            <span>Closure Preview</span>
            <strong>${selectedProduct ? formatDeactivationClosures(closures) : "Choose a product"}</strong>
          </div>`
        : ""
    }
    <label class="form-field-span-2">
      <span>Reason</span>
      <textarea name="reason" rows="3" placeholder="${template.reasonPlaceholder}">${escapeHtml(state.form.reason)}</textarea>
    </label>
  `;
}

function renderActionTemplateFields(form, template, revertOptions) {
  const originalEvent = template.showOriginalEvent ? findEventForRevert(form.original_event_id) : null;

  return `
      ${renderMovementLocationField(template.showFromLocation, template.sourceLabel, form.from_location, "from_location")}
      ${renderMovementLocationField(template.showToLocation, template.destinationLabel, form.to_location, "to_location")}
      ${
        template.showOriginalEvent
          ? `<label class="form-field-span-2 field-select-wrap">
               <span>Original Event</span>
               ${renderFieldSelect({
                 name: "original_event_id",
                 menuClassName: "field-select-menu--event-form",
                 menuMode: "event-form",
                 options: `
                <option value="">Select event to compensate</option>
               ${revertOptions
                 .map(
                   (event) => `
                     <option value="${event.event_id}" ${form.original_event_id === event.event_id ? "selected" : ""}>
                       ${event.sequence_number} - ${eventLabels[event.type] ?? event.type} - ${productName(event.product_id)} - ${formatQuantity(event.quantity)}
                     </option>
                   `,
                 )
                 .join("")}
               `.trim(),
               })}             
           </label>`
        : ""
    }
    ${
      template.isPhysicalCount
        ? renderPhysicalCountFields(form)
        : template.quantityEditable
        ? `<label>
             <span>${template.quantityLabel}</span>
             <input name="quantity" type="number" step="0.01" value="${escapeAttr(form.quantity)}" />
           </label>`
        : `<label class="form-field-span-2">
             <span>${template.quantityLabel}</span>
             <p>${renderRevertAmountHelp(originalEvent)}</p>
           </label>`
    }
  `;
}

function currentSystemCount(form) {
  if (!form.product_id || !form.to_location) return null;
  const row = filteredStockRows(allLocalEvents()).find(
    (candidate) => candidate.product_id === form.product_id && candidate.location === form.to_location,
  );
  return row ? Number(row.quantity) : 0;
}

function physicalCountVariance(form) {
  const systemCount = currentSystemCount(form);
  if (systemCount === null) return null;
  if (form.physical_count === "" || form.physical_count === null || form.physical_count === undefined) return null;
  const physical = Number(form.physical_count);
  if (!Number.isFinite(physical)) return null;
  return Number((physical - systemCount).toFixed(4));
}

function renderPhysicalCountFields(form) {
  const systemCount = currentSystemCount(form);
  const variance = physicalCountVariance(form);
  const hasLocation = systemCount !== null;
  const varianceTone = variance === null ? "" : variance === 0 ? "" : variance > 0 ? "is-valid" : "is-error";

  return `
    <div class="panel form-field-span-2 physical-count-panel">
      <div class="physical-count-row">
        <div class="physical-count-stat">
          <span>System Count</span>
          <strong>${hasLocation ? formatQuantity(systemCount) : "Choose a location"}</strong>
        </div>
        <label class="physical-count-input">
          <span>Physical Count</span>
          <input
            name="physical_count"
            type="number"
            step="0.01"
            placeholder="What you counted"
            value="${escapeAttr(form.physical_count)}"
            ${hasLocation ? "" : "disabled"}
          />
        </label>
        <div class="physical-count-stat">
          <span>Variance</span>
          <strong class="${varianceTone ? `badge ${varianceTone}` : ""}">
            ${variance === null ? "—" : `${variance > 0 ? "+" : ""}${formatQuantity(variance)}`}
          </strong>
        </div>
      </div>
      <p class="physical-count-help">Enter what you actually counted. The system count is looked up live and the difference is saved as the correction — nobody hand-calculates the delta.</p>
    </div>
  `;
}

function renderMovementLocationField(visible, label, selectedLocation, fieldName) {
  if (!visible) return "";

  return `
    <label class="field-select-wrap">
      <span>${label}</span>
      ${renderFieldSelect({
        name: fieldName,
        menuClassName: "field-select-menu--event-form",
        menuMode: "event-form",
        options: `
          <option value="">Choose Place</option>
          ${locations.map((location) => `<option value="${location.name}" ${selectedLocation === location.name ? "selected" : ""}>${location.name}</option>`).join("")}
        `,
      })}
    </label>
  `;
}

function extractFieldSelectOptions(optionHtml) {
  const raw = optionHtml || "";
  const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/g;
  const entries = [];
  let match;

  while ((match = optionPattern.exec(raw)) !== null) {
    const attrText = match[1] || "";
    const valueMatch = attrText.match(/value=\"([^\"]*)\"/) || attrText.match(/value='([^']*)'/);
    if (!valueMatch) continue;

    const labelText = match[2]?.replace(/<[^>]*>/g, "").trim();
    entries.push({
      value: valueMatch[1],
      label: labelText,
      selected: /\bselected\b/.test(attrText),
      disabled: /\bdisabled\b/.test(attrText),
    });
  }

  return entries;
}

function renderFieldSelect({
  name,
  options,
  attrs = "",
  className = "",
  placeholder = "",
  autofocus = false,
  menuStyle = "styled",
  menuClassName = "",
  menuMode = "",
}) {
  const normalizedClassName = [className].filter(Boolean).join(" ");
  const normalizedMenuClassName = [menuClassName].filter(Boolean).join(" ");
  const menuClass = menuStyle === "plain" ? "field-select--normal-menu" : "field-select--styled-menu";
  const selectClass = `field-select ${menuClass} ${normalizedClassName}`.trim();
  const parsedOptions = extractFieldSelectOptions(options);
  const selectedOption =
    parsedOptions.find((entry) => entry.selected) ??
    parsedOptions[0] ??
    { value: "", label: placeholder || "" };
  const resolvedValue = escapeAttr(selectedOption.value || "");
  const resolvedLabel = escapeHtml(selectedOption.label || placeholder || "");
  const baseAttrs = [ `name="${escapeAttr(name)}"`, `class="${selectClass}"`, attrs ].filter(Boolean).join(" ");

  if (menuStyle === "plain") {
    return `
      <select ${baseAttrs}>
        ${placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : ""}
        ${options}
      </select>
    `;
  }

  const menuId = `field-select-menu-${String(++fieldSelectUid).padStart(4, "0")}`;
  const hasExplicitSelection = parsedOptions.some((entry) => entry.selected);
  const optionsForMenu = extractFieldSelectOptions(options)
    .map(
      (entry, index) =>
        `<li role="option" class="field-select-menu-option ${entry.disabled ? "is-disabled" : ""}" data-select-option data-value="${escapeAttr(entry.value)}" data-label="${escapeAttr(entry.label)}" ${entry.disabled ? "aria-disabled=\"true\"" : ""} ${(entry.selected || (!hasExplicitSelection && index === 0)) ? "aria-selected=\"true\"" : ""}>${escapeHtml(entry.label)}</li>`,
    )
    .join("");

  return `
    <div class="field-select-custom-shell" data-custom-select>
      <button
        type="button"
        class="field-select-trigger"
        id="${menuId}-trigger"
        data-select-trigger="${escapeAttr(name)}"
        data-select-target="${menuId}"
        data-select-name="${escapeAttr(name)}"
        aria-haspopup="listbox"
        aria-expanded="false"
        ${autofocus ? "autofocus" : ""}
      >
      <span class="field-select-trigger-label">${resolvedLabel}</span>
        <span
          class="field-select-trigger-arrow"
          aria-hidden="true"
          style="top: 50%; transform: translateY(-50%);"
        >▾</span>
      </button>
      <input type="hidden" data-select-input="${escapeAttr(name)}" ${baseAttrs} value="${resolvedValue}" />
      <ul
        id="${menuId}"
        class="field-select-menu${normalizedMenuClassName ? ` ${normalizedMenuClassName}` : ""}"
        role="listbox"
        data-select-menu
        data-select-name="${escapeAttr(name)}"
        data-select-menu-mode="${escapeAttr(menuMode)}"
        aria-labelledby="${menuId}-trigger"
      >
        ${placeholder
          ? `<li class="field-select-menu-option" data-select-option data-value="" data-label="${escapeAttr(placeholder)}">${escapeHtml(placeholder)}</li>`
          : ""}
        ${optionsForMenu}
      </ul>
    </div>
  `;
}

function renderRevertAmountHelp(originalEvent) {
  if (!originalEvent) {
    return "Select an original movement to derive this amount.";
  }

  const quantity = formatQuantity(Math.abs(Number(originalEvent.quantity)));
  return `${quantity} ${productUnit(originalEvent.product_id)} of ${productName(originalEvent.product_id)} will be reversed.`;
}

function renderActionTemplate(type) {
  const copy = actionTemplate(type);

  return `
    <div class="compose-template-strip form-field-span-2" aria-label="Action Template">
      <span>${copy.template}</span>
      <strong>${copy.summary}</strong>
    </div>
  `;
}

function findEventForRevert(eventId) {
  if (!eventId) return null;

  return allLocalEvents().find((event) => event.event_id === eventId && event.type !== "STOCK_REVERT");
}

function workQueueItems(outboxValidation) {
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
      item.events.find((event) => event.type.startsWith(PRODUCT_EVENT_PREFIX)) ??
      item.events[0];
    const invalid = item.validations.find((validation) => !validation.valid);
    const isGrouped = item.events.length > 1;

    return {
      ...item,
      sequence_number: Math.min(...item.events.map((event) => Number(event.sequence_number))),
      label: eventLabels[primary.type] ?? primary.type,
      product_name: escapeHtml(productName(primary.product_id)),
      location: isGrouped ? `Grouped work: ${item.events.length} events` : escapeHtml(eventLocationText(primary)),
      amount: isGrouped ? "Grouped work" : formatQuantity(primary.quantity),
      detail: isGrouped ? `${item.events.length} grouped event records` : `<code>${escapeHtml(primary.idempotency_key)}</code>`,
      event_count: item.events.length,
      valid: !invalid,
      status: invalid ? simpleValidationReason(invalid.reason) : "Ready",
    };
  });
}

function renderWorkQueueCard(item) {
  return `
    <article class="work-queue-card" data-work-queue-card data-work-item-id="${escapeAttr(item.work_item_id)}">
      <div class="work-queue-card-main">
        <div class="work-queue-sequence" aria-label="Sequence number">${item.sequence_number}</div>
        <div class="work-queue-card-body">
          <div class="work-queue-card-topline">
            <span class="type-pill">${item.label}</span>
            ${item.valid ? "" : `<span class="badge is-error">${escapeHtml(item.status)}</span>`}
          </div>
          <strong>${item.product_name}</strong>
          <dl class="work-queue-facts">
            <div>
              <dt>Location</dt>
              <dd>${item.location}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>${item.amount}</dd>
            </div>
          </dl>
        </div>
        <button class="table-action" data-action="undo-work-item" data-work-item-id="${escapeAttr(item.work_item_id)}" type="button">Undo</button>
      </div>
      <details class="work-queue-technical">
        <summary>Technical details</summary>
        <dl>
          <div><dt>Batch detail</dt><dd>${item.detail}</dd></div>
          <div><dt>Validation</dt><dd>${escapeHtml(item.status)}</dd></div>
          <div><dt>Events</dt><dd>${item.event_count}</dd></div>
        </dl>
      </details>
    </article>
  `;
}

function renderWorkQueue(outboxValidation) {
  const workItems = workQueueItems(outboxValidation);
  const pagination = paginateRows(workItems, state.outboxPage);
  state.outboxPage = pagination.page;
  const pageItems = pagination.pageRows;

  return `
      <aside class="panel panel-wide work-queue-panel" aria-label="Work to Send">
        <div class="panel-header work-queue-header">
          <div>
            <h2>Work to Send</h2>
            <p>${state.outbox.length} event${state.outbox.length === 1 ? "" : "s"} in ${workItems.length} work item${workItems.length === 1 ? "" : "s"}</p>
          </div>
          <button class="button button-primary" data-action="sync" type="button" ${!state.online || state.outbox.length === 0 ? "disabled" : ""}>
            ${icon("send")}Send Saved Work
          </button>
        </div>
        ${
          state.outbox.length === 0
            ? `<div class="empty-state"><strong>No Work Waiting</strong></div>`
            : `<div class="work-queue-list" aria-label="Saved work list">
                ${pageItems.map(renderWorkQueueCard).join("")}
                ${renderTablePagination("outbox", pagination, pageItems.length)}
              </div>`
        }
      </aside>
  `;
}

function renderAudit(localLedger) {
  return `
    <section class="content-grid">
      <article class="panel panel-wide panel--flush-table">
        ${renderAuditTable(localLedger)}
      </article>
    </section>
  `;
}

function renderFilters({ hideLabels = false } = {}) {
  return `
    <div class="stock-overview-filter-cluster">
      <label class="field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
        ${hideLabels ? "" : "<span>Product</span>"}
        ${renderFieldSelect({
            name: "product-filter",
            menuStyle: "styled",
            className: "field-select--stock-overview-filter",
            menuClassName: "field-select-menu--stock-overview-filter",
            menuMode: "stock-overview-filter",
            attrs: 'data-filter="product"',
            options: `
              <option value="all">All products</option>
            ${getActiveProducts().map((product) => `<option value="${product.id}" ${state.productFilter === product.id ? "selected" : ""}>${product.name}</option>`).join("")}
          `,
          })}
      </label>
      <label class="field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
        ${hideLabels ? "" : "<span>Location</span>"}
        ${renderFieldSelect({
          name: "location-filter",
          menuStyle: "styled",
          className: "field-select--stock-overview-filter",
          menuClassName: "field-select-menu--stock-overview-filter",
          menuMode: "stock-overview-filter",
          attrs: 'data-filter="location"',
          options: `
            <option value="all">All locations</option>
            ${locations.map((location) => `<option value="${location.name}" ${state.locationFilter === location.name ? "selected" : ""}>${location.name}</option>`).join("")}
          `,
        })}
      </label>
    </div>
  `;
}

function renderStockControls() {
  const safeStockSearch = String(state.stockSearch || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return `
    <div class="stock-overview-toolbar" aria-label="Stock View Options">
      <div class="stock-overview-view-switch" role="group" aria-label="Choose Stock View">
        ${stockViewButton("totals", "Total Stock", "layers")}
        ${stockViewButton("location", "By Location", "map")}
        ${stockViewButton("detail", "Detailed List", "list")}
      </div>
      <div class="stock-overview-filter-slot">
        <div class="stock-overview-field stock-overview-field--search">
          <input
            class="stock-overview-search-input"
            type="search"
            placeholder="Search products or locations"
            value="${safeStockSearch}"
            data-filter="stock-search"
            aria-label="Search products or locations"
          />
        </div>
        ${ 
            state.stockView === "location"
              ? `<label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
                  ${renderFieldSelect({
                    name: "selected-location-filter",
                    menuStyle: "styled",
                    className: "field-select--stock-overview-filter",
                    menuClassName: "field-select-menu--stock-overview-filter",
                    menuMode: "stock-overview-filter",
                    attrs: 'data-filter="selected-location"',
                  options: locations.map((location) => `<option value="${location.name}" ${state.selectedLocation === location.name ? "selected" : ""}>${location.name}</option>`).join(""),
                })}
              </label>`
            : ""
        }
        ${state.stockView === "detail" ? renderFilters({ hideLabels: true }) : ""}
      </div>
    </div>
  `;
}

function stockViewButton(view, label, iconName) {
  return `
    <button class="stock-overview-view-tab ${state.stockView === view ? "is-active" : ""}" data-stock-view="${view}" type="button" aria-pressed="${state.stockView === view}">
      ${icon(iconName)}
      ${label}
    </button>
  `;
}

function renderActionTypeTabs(activeType) {
  return `
    <div class="action-type-tabs" role="group" aria-label="Choose action type">
      ${ACTION_EVENT_TYPES.map(
        (type) => `
          <button
            class="action-type-tab ${activeType === type ? "is-active" : ""}"
            data-action-type="${type}"
            type="button"
            aria-pressed="${activeType === type}"
          >
            ${actionTabLabels[type] ?? eventLabels[type] ?? type}
          </button>
        `,
      ).join("")}
    </div>
  `;
}

function renderStockView(stockRows) {
  if (state.stockView === "location") {
    const rows = locationStockRows(stockRows);
    const pagination = paginateRows(rows, state.stockPage);
    state.stockPage = pagination.page;
    return renderLocationStockTable(pagination.pageRows, pagination);
  }
  if (state.stockView === "detail") {
    const pagination = paginateRows(stockRows, state.stockPage);
    state.stockPage = pagination.page;
    return renderStockTable(pagination.pageRows, pagination);
  }
  const rows = stockTotalRows(stockRows);
  const pagination = paginateRows(rows, state.stockPage);
  state.stockPage = pagination.page;
  return renderMasterStockTable(pagination.pageRows, pagination);
}

function stockViewTitle() {
  if (state.stockView === "location") return `${state.selectedLocation} Stock`;
  if (state.stockView === "detail") return "Detailed Stock List";
  return "Total Stock";
}

function stockViewHelp() {
  if (state.stockView === "location") return "Shows every product in the selected location.";
  if (state.stockView === "detail") return "Shows each product and location row for checking exact balances.";
  return "Shows the master total for each product across all locations.";
}

function renderMasterStockTable(rows, pagination) {
  return `
    <div class="table-wrap stock-table">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th class="table-cell--numeric">Total Stock</th>
            <th>Unit</th>
            <th class="table-cell--numeric">Locations With Stock</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${row.product_name}</td>
                  <td class="table-cell--numeric">${formatQuantity(row.quantity)}</td>
                  <td>${productUnit(row.product_id)}</td>
                  <td class="table-cell--numeric">${row.location_count}</td>
                  <td>${stockState(row)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
      <div class="stock-cards" aria-label="Total Stock List">
        ${rows
          .map(
            (row) => `
                <article class="stock-card">
                  <div>
                    <strong>${row.product_name}</strong>
                  </div>
                  <div>
                    <strong>${formatQuantity(row.quantity)} ${productUnit(row.product_id)}</strong>
                  ${stockState(row)}
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
      ${renderTablePagination("stock", pagination, rows.length)}
    </div>
  `;
}

function renderLocationStockTable(rows, pagination) {
  return `
    <div class="table-wrap stock-table">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Location</th>
            <th class="table-cell--numeric">Quantity</th>
            <th>Unit</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${row.product_name}</td>
                  <td>${row.location}</td>
                  <td class="table-cell--numeric">${formatQuantity(row.quantity)}</td>
                  <td>${productUnit(row.product_id)}</td>
                  <td>${stockState(row)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
      <div class="stock-cards" aria-label="Location Stock List">
        ${rows
          .map(
            (row) => `
                <article class="stock-card">
                <div>
                  <strong>${row.product_name}</strong>
                </div>
                <div>
                  <strong>${formatQuantity(row.quantity)} ${productUnit(row.product_id)}</strong>
                  ${stockState(row)}
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
      ${renderTablePagination("stock", pagination, rows.length)}
    </div>
  `;
}

function renderStockTable(rows, pagination) {
  return `
    <div class="table-wrap stock-table">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Location</th>
            <th class="table-cell--numeric">Quantity</th>
            <th>Unit</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${row.product_name}</td>
                  <td>${row.location}</td>
                  <td class="table-cell--numeric">${formatQuantity(row.quantity)}</td>
                  <td>${productUnit(row.product_id)}</td>
                  <td>${stockState(row)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
      <div class="stock-cards" aria-label="Current Stock List">
        ${rows
          .map(
            (row) => `
                <article class="stock-card">
                <div>
                  <strong>${row.product_name}</strong>
                </div>
                <div>
                  <strong>${formatQuantity(row.quantity)} ${productUnit(row.product_id)}</strong>
                  ${stockState(row)}
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
      ${renderTablePagination("stock", pagination, rows.length)}
    </div>
  `;
}

function renderAuditTable(events, limit = null, compact = false) {
  const trail = replayAuditTrail(events);
  const allRows = [...trail].reverse();

  if (allRows.length === 0) {
    return `<div class="empty-state"><strong>No history yet</strong></div>`;
  }

  let rows = allRows;
  let pagination = null;

  if (compact || limit !== null) {
    rows = allRows.slice(0, limit ?? allRows.length);
  } else {
    pagination = paginateRows(allRows, state.auditPage);
    state.auditPage = pagination.page;
    rows = pagination.pageRows;
  }

  return `
    <div class="table-wrap audit-table ${compact ? "table-wrap--compact" : ""}">
      <table>
        <thead>
          <tr>
            <th class="table-cell--numeric">No.</th>
            <th>Action</th>
            <th>Product</th>
            <th>Location</th>
            <th class="table-cell--numeric">Change</th>
            <th class="table-cell--numeric">New Balance</th>
            <th>Actor</th>
            ${compact ? "" : "<th>Batch</th><th>Fix</th>"}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((entry) => {
              return `
                <tr>
                  <td class="table-cell--numeric">${entry.sequence_number}</td>
                  <td><span class="type-pill">${eventLabels[entry.type] ?? entry.type}</span></td>
                  <td>${entry.product_name}</td>
                  <td>${entry.location}</td>
                  <td class="table-cell--numeric ${entry.delta < 0 ? "danger-text" : ""}">${entry.delta > 0 ? "+" : ""}${formatQuantity(entry.delta)}</td>
                  <td class="table-cell--numeric">${formatAuditBalance(entry.running_balance)}</td>
                  <td>${entry.actor_name}</td>
                  ${
                    compact
                      ? ""
                      : `<td><code>${entry.sync_batch_id}</code></td>
                        <td>
                          <button class="table-action" data-action="prepare-revert" data-event-id="${entry.event_id}" type="button" ${!isRevertibleEvent(entry.type) || hasReversalForEvent(entry.event_id) ? "disabled" : ""}>Prepare reverse record</button>
                        </td>`
                  }
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
        <div class="audit-cards" aria-label="${compact ? "Recent movement list" : "Full movement history"}">
        ${rows
            .map((entry) => {
              return `
              <article class="history-card">
                <div class="kv-row">
                  <div>
                    <span>No. ${entry.sequence_number}</span>
                    <strong>${entry.product_name}</strong>
                  </div>
                  <span class="type-pill">${eventLabels[entry.type] ?? entry.type}</span>
                </div>
                <dl>
                  <div><dt>Location</dt><dd>${entry.location}</dd></div>
                  <div><dt>Change</dt><dd class="${entry.delta < 0 ? "danger-text" : ""}">${entry.delta > 0 ? "+" : ""}${formatQuantity(entry.delta)}</dd></div>
                  <div><dt>New balance</dt><dd>${formatAuditBalance(entry.running_balance)}</dd></div>
                  <div><dt>Actor</dt><dd>${entry.actor_name}</dd></div>
                  ${compact ? "" : `<div><dt>Batch</dt><dd><code>${entry.sync_batch_id}</code></dd></div>`}
                </dl>
                ${
                  compact
                    ? ""
                    : `<div>
                        <button class="table-action" data-action="prepare-revert" data-event-id="${entry.event_id}" type="button" ${!isRevertibleEvent(entry.type) || hasReversalForEvent(entry.event_id) ? "disabled" : ""}>
                          Prepare reverse record
                        </button>
                      </div>`
                }
              </article>
              `;
            })
            .join("")}
      </div>
      ${pagination ? renderTablePagination("audit", pagination, rows.length) : ""}
    </div>
  `;
}

function metricCard(label, value) {
  return `
    <article class="dashboard-kpi-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const isSidebarTab = button.closest(".nav-item");
      const isStockTab = button.closest(".stock-overview-view-tab");

      const nextView = button.dataset.view;
      if (isSidebarTab) {
        tabMotionQueue.activeView = nextView;
      }
      if (nextView === "compose") {
        shouldFocusActionOnCompose = true;
      }

      state.activeView = nextView;
      state.guideOpen = false;
      state.accountOpen = false;
      commit();
    });
  });

  document.querySelectorAll("[data-action='toggle-guide']").forEach((button) => {
    button.addEventListener("click", () => {
      state.guideOpen = !state.guideOpen;
      commit();
    });
  });

  document.querySelectorAll("[data-action='toggle-account']").forEach((button) => {
    button.addEventListener("click", () => {
      state.accountOpen = !state.accountOpen;
      commit();
    });
  });

  document.querySelectorAll("[data-action='toggle-sidebar']").forEach((button) => {
    button.addEventListener("click", async () => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      await animateSidebarTransition(state.sidebarCollapsed);
      state.accountOpen = false;
      commit();
    });
  });

  document.querySelectorAll("[data-action='toggle-online']").forEach((button) => {
    button.addEventListener("click", () => {
      state.online = !state.online;
      showToast(state.online ? "Online. You can send saved work now." : "Offline. New work stays saved on this device.");
      commit();
    });
  });

  document.querySelectorAll("[data-action='sync']").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      syncOutbox();
    });
  });

  document.querySelectorAll("[data-action='append-event']").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      appendFormEvent();
    });
  });

  document.querySelectorAll("[data-action='reset-demo']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirm("Reset this demo and return to the sample data?")) return;
      state = defaultState();
      commit();
    });
  });

  if (!customSelectEventsBound) {
    document.addEventListener("click", (event) => {
      const activeOption = event.target.closest("[data-select-option]");
      const activeTrigger = event.target.closest("[data-select-trigger]");

      const restoreEventMenuPortal = (menu) => {
        const portalState = eventSelectPortalMap.get(menu);
        if (!portalState) return;

        const { shell, placeholder } = portalState;
        if (placeholder?.parentNode && shell?.isConnected) {
          shell.insertBefore(menu, placeholder);
          placeholder.remove();
        }

        eventSelectPortalMap.delete(menu);
      };

      const closeMenus = () => {
        document.querySelectorAll("[data-select-menu]").forEach((menu) => {
          restoreEventMenuPortal(menu);
          menu.classList.remove("is-open");
          menu.style.right = "";
          menu.style.bottom = "";
          menu.style.position = "";
          menu.style.left = "";
          menu.style.top = "";
          menu.style.minWidth = "";
          menu.style.width = "";
          menu.style.maxHeight = "";
          menu.style.transform = "";
          menu.style.zIndex = "";
        });
        document.querySelectorAll("[data-select-trigger]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
      };

      if (activeOption) {
        event.preventDefault();
        const menu = activeOption.closest("[data-select-menu]");
        const triggerName = menu?.dataset.selectName ?? "";
        const trigger = document.querySelector(`[data-select-trigger="${triggerName}"]`);
        const input = document.querySelector(`[data-select-input="${triggerName}"]`);
        const label = trigger?.querySelector(".field-select-trigger-label");

        if (!menu || activeOption.classList.contains("is-disabled") || !trigger || !input || !label) return;

        const value = activeOption.dataset.value ?? "";
        const title = activeOption.dataset.label ?? activeOption.textContent.trim();

        menu.querySelectorAll("[data-select-option]").forEach((option) => {
          option.setAttribute("aria-selected", option === activeOption ? "true" : "false");
        });

        trigger.setAttribute("aria-expanded", "false");
        restoreEventMenuPortal(menu);
        menu.classList.remove("is-open");
        input.value = value;
        label.textContent = title;

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      if (activeTrigger) {
        event.preventDefault();
        event.stopPropagation();

        const triggerName = activeTrigger.dataset.selectName;
        const shell = activeTrigger.closest("[data-custom-select]");
        const menu = shell?.querySelector(`[data-select-menu][data-select-name="${triggerName}"]`);
        if (!menu) return;

        const willOpen = !menu.classList.contains("is-open");
        closeMenus();
        if (!willOpen) return;

        const triggerRect = activeTrigger.getBoundingClientRect();
        const menuMinHeight = 72;
        const menuMaxCap = 260;
        const menuMode = menu.dataset.selectMenuMode;

        const isEventMenu = menu.classList.contains("field-select-menu--event-form") || menuMode === "event-form";
        const isFilterMenu =
          menuMode === "stock-overview-filter" ||
          menu.classList.contains("field-select-menu--stock-overview-filter");

        if (isEventMenu) {
          if (shell && !eventSelectPortalMap.has(menu)) {
            const placeholder = document.createComment("");
            shell.insertBefore(placeholder, menu);
            document.body.appendChild(menu);
            eventSelectPortalMap.set(menu, { shell, placeholder });
          }

          const roomBelow = Math.max(0, Math.floor(window.innerHeight - Math.floor(triggerRect.bottom + 6) - 8));
          const menuWidth = Math.max(160, Math.floor(triggerRect.width));
          const menuLeft = Math.max(0, Math.min(Math.floor(triggerRect.left), Math.max(0, Math.floor(window.innerWidth - menuWidth - 4))));
          const menuTop = Math.floor(triggerRect.bottom + 6);
          const menuMaxHeight = Math.min(menuMaxCap, Math.max(menuMinHeight, roomBelow));

          menu.style.position = "fixed";
          menu.style.left = `${menuLeft}px`;
          menu.style.top = `${menuTop}px`;
          menu.style.width = `${menuWidth}px`;
          menu.style.minWidth = `${menuWidth}px`;
          menu.style.right = "";
          menu.style.bottom = "";
          menu.style.transform = "";
          menu.style.maxHeight = `${menuMaxHeight}px`;
        } else if (isFilterMenu) {
          const filterRoomBelow = Math.max(0, Math.floor(window.innerHeight - (triggerRect.bottom + 6) - 8));
          menu.style.position = "absolute";
          menu.style.left = "0";
          menu.style.top = "";
          menu.style.bottom = "";
          menu.style.width = `${Math.max(160, Math.floor(triggerRect.width))}px`;
          menu.style.minWidth = `${Math.max(160, Math.floor(triggerRect.width))}px`;
          menu.style.transform = "";
          menu.style.right = "";
          menu.style.bottom = "";
          menu.style.right = "";
          menu.style.maxHeight = `${Math.min(menuMaxCap, Math.max(menuMinHeight, filterRoomBelow))}px`;
        } else {
          const menuLeft = Math.max(0, Math.floor(triggerRect.left));
          const menuTop = Math.floor(triggerRect.bottom + 6);
          const menuWidth = Math.max(160, Math.floor(triggerRect.width));

          menu.style.position = "fixed";
          menu.style.left = `${menuLeft}px`;
          menu.style.top = `${menuTop}px`;
          menu.style.width = `${menuWidth}px`;
          menu.style.minWidth = `${menuWidth}px`;
          const menuRoomBelow = Math.max(0, Math.floor(window.innerHeight - (triggerRect.bottom + 6) - 8));
          menu.style.maxHeight = `${Math.min(menuMaxCap, Math.max(menuMinHeight, menuRoomBelow))}px`;
        }

        menu.style.zIndex = "2147483000";

        activeTrigger.setAttribute("aria-expanded", "true");
        menu.classList.add("is-open");
        return;
      }

      const inCustomSelect = event.target.closest("[data-custom-select]");
      if (!inCustomSelect) {
        closeMenus();
      }
    });

    customSelectEventsBound = true;
  }

  document.querySelectorAll("[data-filter='product']").forEach((select) => {
    select.addEventListener("change", () => {
      state.productFilter = select.value;
      state.stockPage = 1;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='location']").forEach((select) => {
    select.addEventListener("change", () => {
      state.locationFilter = select.value;
      state.stockPage = 1;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='selected-location']").forEach((select) => {
    select.addEventListener("change", () => {
      state.selectedLocation = select.value;
      state.stockPage = 1;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='stock-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.stockSearch = input.value;
      state.stockPage = 1;
      commit();
    });
  });

  document.querySelectorAll("[data-stock-view]").forEach((button) => {
    button.addEventListener("click", () => {
      tabMotionQueue.stockView = button.dataset.stockView;
      state.stockView = button.dataset.stockView;
      state.stockPage = 1;
      commit();
    });
  });

  document.querySelectorAll("[data-action-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextType = button.dataset.actionType;
      if (!nextType || nextType === state.form.type) return;

      state.form = {
        ...state.form,
        type: nextType,
      };
      normalizeFormForType();
      commit();
    });
  });

  const paginationScopeKey = {
    stock: "stockPage",
    audit: "auditPage",
    outbox: "outboxPage",
    "active-products": "activeProductsPage",
    "inactive-products": "inactiveProductsPage",
  };

  document.querySelectorAll("[data-action='page-prev']").forEach((button) => {
    button.addEventListener("click", () => {
      const key = paginationScopeKey[button.dataset.pageScope];
      if (!key || button.disabled) return;
      state[key] = Math.max(1, (state[key] || 1) - 1);
      commit();
    });
  });

  document.querySelectorAll("[data-action='page-next']").forEach((button) => {
    button.addEventListener("click", () => {
      const key = paginationScopeKey[button.dataset.pageScope];
      if (!key || button.disabled) return;
      state[key] = (state[key] || 1) + 1;
      commit();
    });
  });

  document.querySelectorAll("[data-action='prepare-revert']").forEach((button) => {
    button.addEventListener("click", () => prepareRevert(button.dataset.eventId));
  });

  document.querySelectorAll("[data-action='undo-work-item']").forEach((button) => {
    button.addEventListener("click", () => undoWorkItem(button.dataset.workItemId));
  });

  const form = document.querySelector("[data-form='event']");
  if (form) {
    form.addEventListener("input", (event) => {
      const data = new FormData(form);
      state.productForm = {
        ...state.productForm,
        name: data.get("product-name") ?? state.productForm.name,
        category: data.get("product-category") ?? state.productForm.category,
        unit: data.get("product-unit") ?? state.productForm.unit,
        low: data.get("product-low") ?? state.productForm.low,
      };
      state.form = {
        ...state.form,
        product_id: data.get("product_id") ?? state.form.product_id,
        from_location: data.get("from_location") ?? state.form.from_location ?? "",
        to_location: data.get("to_location") ?? state.form.to_location ?? "",
        quantity: data.has("quantity") ? data.get("quantity") : state.form.quantity,
        physical_count: data.has("physical_count") ? data.get("physical_count") : state.form.physical_count,
        reason: data.get("reason") ?? "",
        original_event_id: data.get("original_event_id") ?? state.form.original_event_id ?? "",
      };

      if (event.target?.name === "physical_count") {
        commit();
        return;
      }

      saveState();
    });

    form.addEventListener("change", () => {
      const previousType = state.form.type;
      const data = new FormData(form);
      const nextType = data.get("type") ?? previousType;

      state.form = {
        ...state.form,
        type: nextType,
        product_id: data.get("product_id"),
        from_location: data.get("from_location") ?? "",
        to_location: data.get("to_location") ?? "",
        original_event_id: data.get("original_event_id") ?? "",
      };

      if (previousType !== nextType) {
        normalizeFormForType();
        commit();
        return;
      }

      commit();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      appendFormEvent();
    });
  }

  bindTabMotion();
  flushQueuedTabMotion();
}

function fieldNameForProductInput(name) {
  if (name === "product-name") return "name";
  if (name === "product-category") return "category";
  if (name === "product-unit") return "unit";
  if (name === "product-low") return "low";
  return name;
}

function createProductFromAction() {
  const productForm = state.productForm ?? { name: "", category: "", unit: "unit", low: "0" };
  const rawName = `${productForm.name ?? ""}`.trim();
  const rawCategory = `${productForm.category ?? ""}`.trim();
  const rawUnit = `${productForm.unit ?? "unit"}`.trim() || "unit";
  const rawLow = `${productForm.low ?? "0"}`.trim();

  if (!rawName) {
    showToast("Product name is required.", "error");
    return;
  }

  const normalizedName = rawName;
  const duplicateExists = getProductCatalog().some((product) => product.name.toLowerCase() === normalizedName.toLowerCase());
  if (duplicateExists) {
    showToast("A product with this name already exists.", "error");
    return;
  }

  const lowValue = Number(rawLow);
  const low = Number.isFinite(lowValue) && lowValue >= 0 ? lowValue : 0;
  const candidateId = nextProductId(normalizedName, getProductCatalog());
  const workItemId = nextId("work-product-created");
  const createEvent = withWorkItem(
    createInventoryEvent({
      ...tenant,
      event_id: nextId("product-created"),
      idempotency_key: nextId("idem-product-created"),
      sync_batch_id: currentBatchId(),
      type: "PRODUCT_CREATED",
      product_id: candidateId,
      product_name: normalizedName,
      quantity: 0,
      reason: `Product enrolled: ${normalizedName}`,
      sequence_number: nextSequence(),
      timestamp: Date.now(),
      status: "queued",
    }),
    workItemId,
  );

  state.products = [
    ...getProductCatalog(),
    {
      id: candidateId,
      name: normalizedName,
      category: rawCategory || "Uncategorized",
      unit: rawUnit,
      low,
      is_active: true,
      deactivated_at: null,
      deactivated_by: null,
      deactivated_reason: "",
      reactivated_at: null,
      reactivated_by: null,
    },
  ];
  state.outbox = [...state.outbox, createEvent];

  state.form.product_id = candidateId;
  state.productForm = {
    name: "",
    category: "",
    unit: "unit",
    low: "0",
  };

  showToast(`Product "${normalizedName}" enrolled locally. Send work when online.`);
  commit();
}

function nextProductId(name, catalog) {
  const normalized = `${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "product";
  const ids = new Set(catalog.map((product) => product.id));
  let candidate = `prod-${normalized}`;
  let suffix = 1;

  while (ids.has(candidate)) {
    candidate = `prod-${normalized}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function appendFormEvent() {
  const template = actionTemplate(state.form.type);
  if (template.kind === "product-create") {
    createProductFromAction();
    return;
  }

  if (template.kind === "product-suspend") {
    suspendProductFromAction();
    return;
  }

  if (template.kind === "product-reactivate") {
    reactivateProductFromAction();
    return;
  }

  const event = buildEventFromForm();
  const validation = validateEvent(event);

  if (!validation.valid) {
    showToast(simpleValidationReason(validation.reason), "error");
    commit();
    return;
  }

  state.outbox.push(event);
  showToast(`${eventLabels[event.type]} saved locally. Send work when online.`);
  state.form.quantity = 1;
  state.form.physical_count = "";
  state.form.original_event_id = "";
  state.form.reason = "";
  normalizeFormForType();
  commit();
}

function syncOutbox() {
  if (!state.online) {
    showToast("Work was not sent. Switch to Online first.", "error");
    commit();
    return;
  }

  const result = applySyncBatch(state.serverLedger, state.outbox);
  if (!result.success) {
    showToast("Work was not sent. Fix the highlighted saved movement, then send again.", "error");
    commit();
    return;
  }

  state.serverLedger = result.ledger;
  state.outbox = [];
  state.lastSync = new Date(result.server_timestamp).toISOString();
  showToast(`${result.processed_count} saved movement(s) sent successfully. The stock list is now updated.`);
  commit();
}

function undoWorkItem(workItemId) {
  const events = state.outbox.filter((candidate) => (candidate.work_item_id || candidate.event_id) === workItemId);
  if (events.length === 0) return;

  const primary =
    events.find((event) => event.type === "PRODUCT_DEACTIVATED") ??
    events.find((event) => event.type.startsWith(PRODUCT_EVENT_PREFIX)) ??
    events[0];
  const label = eventLabels[primary.type] ?? primary.type;

  if (primary.type === "PRODUCT_CREATED" && hasPendingProductDependencies(primary.product_id, workItemId)) {
    showToast("Remove pending stock work for this new product before undoing enrollment.", "error");
    return;
  }

  const shouldUndo = window.confirm(`Remove ${label} from Work to Send?`);
  if (!shouldUndo) return;

  state.outbox = state.outbox.filter((candidate) => (candidate.work_item_id || candidate.event_id) !== workItemId);
  rollbackLocalProductStateForUndo(primary);
  showToast(`${label} removed from Work to Send.`);
  commit();
}

function hasPendingProductDependencies(productId, workItemId) {
  return state.outbox.some(
    (event) => event.product_id === productId && (event.work_item_id || event.event_id) !== workItemId,
  );
}

function rollbackLocalProductStateForUndo(primaryEvent) {
  if (primaryEvent.type === "PRODUCT_CREATED") {
    const existsOnServer = state.serverLedger.some((event) => event.product_id === primaryEvent.product_id);
    if (!existsOnServer) {
      state.products = getProductCatalog().filter((product) => product.id !== primaryEvent.product_id);
    }
    return;
  }

  if (primaryEvent.type === "PRODUCT_DEACTIVATED") {
    state.products = getProductCatalog().map((product) =>
      product.id === primaryEvent.product_id
        ? {
            ...product,
            is_active: true,
            deactivated_at: null,
            deactivated_by: null,
            deactivated_reason: "",
          }
        : product,
    );
    return;
  }

  if (primaryEvent.type === "PRODUCT_REACTIVATED") {
    state.products = getProductCatalog().map((product) =>
      product.id === primaryEvent.product_id
        ? {
            ...product,
            is_active: false,
            reactivated_at: null,
            reactivated_by: null,
          }
        : product,
    );
  }
}


function prepareRevert(eventId) {
  const original = allLocalEvents().find((event) => event.event_id === eventId);
  if (!original || original.type === "STOCK_REVERT") return;
  if (!isRevertibleEvent(original.type)) {
    showToast("This event does not support mistake reversal.", "error");
    return;
  }

  if (hasReversalForEvent(original.event_id)) {
    showToast("A reverse record already exists or is waiting to send for this record.", "error");
    return;
  }

  state.form = {
    ...state.form,
    type: "STOCK_REVERT",
    product_id: original.product_id,
    from_location: "",
    to_location: "",
    quantity: 1,
    physical_count: "",
    reason: "",
    original_event_id: original.event_id,
  };
  state.activeView = "compose";
  shouldFocusActionOnCompose = true;
  showToast("Reverse a Record is ready for review. Add a reason, then save the action.");
  commit();
}

function hasReversalForEvent(eventId) {
  return allLocalEvents().some((event) => event.type === "STOCK_REVERT" && event.original_event_id === eventId);
}

function isRevertibleEvent(eventType) {
  return REVERTIBLE_EVENT_TYPES.has(eventType);
}

function buildEventFromForm() {
  const form = state.form;
  const template = actionTemplate(form.type);
  const workItemId = nextId("work");

  if (form.type === "STOCK_REVERT") {
    const original = findEventForRevert(form.original_event_id);
    return withWorkItem(
      createInventoryEvent({
        ...tenant,
        event_id: nextId("event"),
        idempotency_key: nextId("idem"),
        sync_batch_id: currentBatchId(),
        type: "STOCK_REVERT",
        product_id: original ? original.product_id : form.product_id,
        product_name: productName(original ? original.product_id : form.product_id),
        from_location: original ? original.from_location : null,
        to_location: original ? original.to_location : null,
        quantity: original ? Math.abs(Number(original.quantity)) : 1,
        original_event_id: form.original_event_id || null,
        reason: form.reason.trim() || "Operational event",
        sequence_number: nextSequence(),
        timestamp: Date.now(),
        status: "queued",
      }),
      workItemId,
    );
  }

  const quantityValue = template.isPhysicalCount
    ? physicalCountVariance(form) ?? 0
    : template.requiresPositiveQuantity
    ? Math.abs(Number(form.quantity || 0))
    : Number(form.quantity || 0);
  const defaultReason = template.isPhysicalCount && currentSystemCount(form) !== null
    ? `Physical count ${formatQuantity(Number(form.physical_count || 0))} vs system ${formatQuantity(currentSystemCount(form))}`
    : "Operational event";
  return withWorkItem(
    createInventoryEvent({
      ...tenant,
      event_id: nextId("event"),
      idempotency_key: nextId("idem"),
      sync_batch_id: currentBatchId(),
      type: form.type,
      product_id: form.product_id,
      product_name: productName(form.product_id),
      from_location: form.from_location || null,
      to_location: form.to_location || null,
      quantity: quantityValue,
      original_event_id: form.original_event_id || null,
      reason: form.reason.trim() || defaultReason,
      sequence_number: nextSequence(),
      timestamp: Date.now(),
      status: "queued",
    }),
    workItemId,
  );
}

function previewEventValidation() {
  return validateEvent({
    ...buildEventFromForm(),
    event_id: "preview-event",
    idempotency_key: "preview-idem",
    sync_batch_id: "preview-batch",
  });
}

function normalizeFormForType() {
  const template = actionTemplate(state.form.type);
  const defaults = template.defaults ?? {};
  const selectableProducts = template.kind === "product-reactivate" ? getInactiveProducts() : getActiveProducts();

  if (state.form.type === "PRODUCT_CREATED") {
    state.form.product_id = "";
  } else if (!selectableProducts.some((product) => product.id === state.form.product_id)) {
    state.form.product_id = selectableProducts[0]?.id ?? "";
  }

  state.form.from_location = template.showFromLocation ? state.form.from_location || defaults.from_location || "" : "";
  state.form.to_location = template.showToLocation ? state.form.to_location || defaults.to_location || "" : "";
  state.form.original_event_id = template.showOriginalEvent ? state.form.original_event_id || defaults.original_event_id || "" : "";

  if (template.quantityEditable) {
    const parsedQuantity = Number(state.form.quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity === 0) {
      state.form.quantity = defaults.quantity ?? 1;
    }
  } else {
    state.form.quantity = defaults.quantity ?? 1;
  }

  if (!template.isPhysicalCount) {
    state.form.physical_count = "";
  }
}

function allLocalEvents() {
  return sortEvents([...state.serverLedger, ...state.outbox]);
}

function filteredStockRows(events) {
  const searchTerm = String(state.stockSearch || "").trim().toLowerCase();

  return summarizeStock(events, getProductCatalog(), locations).filter((row) => {
    const productMatch = state.productFilter === "all" || row.product_id === state.productFilter;
    const locationMatch = state.locationFilter === "all" || row.location === state.locationFilter;
    const productName = String(row.product_name || "").toLowerCase();
    const productId = String(row.product_id || "").toLowerCase();
    const locationName = String(row.location || "").toLowerCase();
    const searchMatch = !searchTerm || productName.includes(searchTerm) || productId.includes(searchTerm) || locationName.includes(searchTerm);

    return productMatch && locationMatch && searchMatch;
  });
}

function stockTotalRows(rows) {
  return getProductCatalog().map((product) => {
    const productRows = rows.filter((row) => row.product_id === product.id);
    return {
      product_id: product.id,
      product_name: product.name,
      quantity: productRows.reduce((total, row) => total + Number(row.quantity), 0),
      location_count: productRows.filter((row) => Number(row.quantity) > 0).length,
    };
  });
}

function locationStockRows(rows) {
  return rows.filter((row) => row.location === state.selectedLocation);
}

function stockState(row) {
  if (row.quantity < 0) return `<span class="badge is-error">Check Now</span>`;
  if (row.quantity <= productLow(row.product_id)) return `<span class="badge is-warning">Low Stock</span>`;
  return `<span class="badge is-valid">Enough</span>`;
}

const TABLE_PAGE_SIZE = 10;

function paginateRows(rows, page) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * TABLE_PAGE_SIZE;
  const pageRows = rows.slice(start, start + TABLE_PAGE_SIZE);
  return { pageRows, page: safePage, totalPages, total };
}

function renderTablePagination(scope, pagination, shownCount) {
  const { page, totalPages, total } = pagination;
  return `
    <div class="table-pagination">
      <span class="table-pagination-info">Showing <strong>${shownCount}</strong> of <strong>${total}</strong> ${total === 1 ? "record" : "records"}</span>
      <div class="table-pagination-controls">
        <button class="icon-button table-pagination-btn" data-action="page-prev" data-page-scope="${scope}" type="button" aria-label="Previous page" ${page <= 1 ? "disabled" : ""}>${icon("chevronLeft")}</button>
        <span class="table-pagination-page">Page <strong>${page}</strong> of <strong>${totalPages}</strong></span>
        <button class="icon-button table-pagination-btn" data-action="page-next" data-page-scope="${scope}" type="button" aria-label="Next page" ${page >= totalPages ? "disabled" : ""}>${icon("chevronRight")}</button>
      </div>
    </div>
  `;
}

function simpleValidationReason(reason) {
  const messages = [
    ["STOCK_IN requires to_location", "Choose where the stock arrived."],
    ["STOCK_OUT requires from_location", "Choose where the stock left from."],
    ["STOCK_TRANSFER requires both", "Choose the starting place and ending place."],
    ["different source and destination", "Choose two different locations."],
    ["STOCK_REVERT requires original_event_id", "Choose the original movement to reverse."],
    ["quantity must be a non-zero number", "Enter an amount greater than zero."],
    ["quantity must be positive", "Use a positive amount for this action."],
  ];

  return messages.find(([match]) => reason.includes(match))?.[1] ?? reason;
}

function currentBatchId() {
  return state.outbox[0]?.sync_batch_id ?? `batch-${new Date().toISOString().slice(0, 10)}-${nextSequence()}`;
}

function nextSequence() {
  return allLocalEvents().reduce((max, event) => Math.max(max, Number(event.sequence_number)), 0) + 1;
}

function nextId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function withWorkItem(event, workItemId) {
  return {
    ...event,
    work_item_id: workItemId,
  };
}

function showToast(message, type = "success") {
  state.toast = { message, type, created_at: Date.now() };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = null;
    commit();
  }, 3600);
}

function nextAction(context = {}) {
  const issueCount = (context.lowRows ?? 0) + (context.invalidOutbox ?? 0) + (context.negativeRows ?? 0);

  if (state.outbox.length > 0 && state.online) {
    return {
      title: "Send Saved Work",
      text: "There are local changes ready to send. Send them before making reports.",
      button: "Open Stock Actions",
      view: "compose",
    };
  }

  if (state.outbox.length > 0 && !state.online) {
    return {
      title: "Keep Working. Send Later.",
      text: "Your changes are saved on this device. Go online when you are ready to send them.",
      button: "Open Stock Actions",
      view: "compose",
    };
  }

  if (issueCount > 0) {
    return {
      title: "Check Low Stock First",
      text: "Some items are low or need review. Look at the stock list before recording more movement.",
      button: "Open Stock Overview",
      view: "dashboard",
    };
  }

  return {
    title: "Open Stock Actions",
    text: "When stock or product catalog work happens, prepare it in the action workspace.",
    button: "Stock Actions",
    view: "compose",
  };
}

function navIcon(view) {
  const icons = {
    home: "home",
    dashboard: "layers",
    products: "list",
    compose: "plus",
    audit: "history",
  };

  return icons[view] ?? "layers";
}

function icon(name) {
  const paths = {
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 18 9 5 9-5"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    spark: '<path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M3 19v-5h5"/><path d="M21 5v5h-5"/>',
    alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
    panelClose: '<path d="M3 5h18v14H3z"/><path d="M9 5v14"/><path d="m16 10-2 2 2 2"/>',
    panelOpen: '<path d="M3 5h18v14H3z"/><path d="M9 5v14"/><path d="m14 10 2 2-2 2"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>',
    wifiOff: '<path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>',
  };

  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.layers}</svg>`;
}

function viewTitle() {
  const titles = {
    home: "StockLedger",
    dashboard: "Stock Overview",
    products: "Products",
    compose: "Stock Actions",
    audit: "History",
  };
  return titles[state.activeView] ?? "Stock Overview";
}

function getProductCatalog() {
  return Array.isArray(state.products) ? state.products : defaultProducts();
}

function getActiveProducts() {
  return getProductCatalog().filter((product) => product.is_active !== false);
}

function getInactiveProducts() {
  return getProductCatalog().filter((product) => product.is_active === false);
}

function ensureProductSelectionIntegrity() {
  const activeProducts = getActiveProducts();
  const activeProductIds = new Set(activeProducts.map((product) => product.id));

  if (state.productFilter !== "all" && !activeProductIds.has(state.productFilter)) {
    state.productFilter = "all";
  }

  if (state.form.type === "PRODUCT_CREATED") {
    state.form.product_id = "";
  } else if (state.form.type === "PRODUCT_REACTIVATED") {
    const inactiveProducts = getInactiveProducts();
    const inactiveProductIds = new Set(inactiveProducts.map((product) => product.id));
    if (!inactiveProductIds.has(state.form.product_id)) {
      state.form.product_id = inactiveProducts[0]?.id ?? "";
    }
  } else if (!activeProductIds.has(state.form.product_id)) {
    state.form.product_id = activeProducts[0]?.id ?? "";
  }

  if (state.selectedLocation && !locations.some((location) => location.name === state.selectedLocation)) {
    state.selectedLocation = locations[0]?.name ?? "Main Bar";
  }
}

function productLastStateLabel(product) {
  if (product.is_active) {
    return product.reactivated_at ? `Reactivated ${displayDateTime(product.reactivated_at)} by ${product.reactivated_by || "operator"}` : "Active";
  }

  const base = product.deactivated_at ? `Suspended ${displayDateTime(product.deactivated_at)} by ${product.deactivated_by || "operator"}` : "Suspended";
  const reason = `${product.deactivated_reason || ""}`.trim();
  return reason ? `${base}. ${reason}` : base;
}

function displayDateTime(timestamp) {
  if (!timestamp) return "";
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return "";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeClosureQuantity(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) < PRODUCT_DEACTIVATE_EPSILON) return 0;
  return Number(amount.toFixed(6));
}

function getProductDeactivationClosures(product) {
  const stock = computeStock(allLocalEvents());
  const balances = stock[product.id];
  if (!balances) return [];

  return Object.entries(balances)
    .map(([location, quantity]) => {
      const safeQuantity = normalizeClosureQuantity(quantity);
      if (safeQuantity === 0) return null;

      return {
        location,
        balance: safeQuantity,
        closureQuantity: normalizeClosureQuantity(-safeQuantity),
      };
    })
    .filter(Boolean);
}

function formatDeactivationClosures(closures) {
  if (!closures.length) return "No stock remains to close.";

  return closures
    .map((entry) => `${entry.location}: ${entry.balance > 0 ? "+" : ""}${formatQuantity(entry.balance)}`)
    .join(" | ");
}

function hasPendingProductClosureDebt(productId) {
  return state.outbox.some(
    (event) =>
      event.type === "STOCK_ADJUSTMENT" &&
      event.product_id === productId &&
      event.reason === PRODUCT_DEACTIVATION_REASON,
  );
}

function suspendProductFromAction() {
  const productId = state.form.product_id;
  if (!productId) return;
  if (productLifecycleBusy === productId) return;

  const product = getProductById(productId);
  if (!product) {
    showToast("Product not found for suspension.", "error");
    return;
  }

  if (!product.is_active) {
    showToast(`"${product.name}" is already suspended.`);
    return;
  }

  const closures = getProductDeactivationClosures(product);
  const closurePreview = formatDeactivationClosures(closures);
  const shouldProceed = window.confirm(
    `Suspend "${product.name}"?\n\nStock Closure Preview:\n${closurePreview}\n\nThis will add one STOCK_ADJUSTMENT per affected location and then mark the product inactive.`,
  );
  if (!shouldProceed) return;

  productLifecycleBusy = productId;
  try {
    const actorReason = `${state.form.reason ?? ""}`.trim();
    const batchId = currentBatchId();
    const workItemId = nextId("work-product-suspended");
    let sequence = nextSequence();
    const lifecycleEvent = withWorkItem(
      createInventoryEvent({
        ...tenant,
        event_id: nextId("suspend"),
        idempotency_key: nextId("idem-suspend"),
        sync_batch_id: batchId,
        type: "PRODUCT_DEACTIVATED",
        product_id: product.id,
        product_name: product.name,
        quantity: 0,
        reason: actorReason ? `Product suspended: ${actorReason}` : "Product suspended",
        sequence_number: sequence++,
        timestamp: Date.now(),
        status: "queued",
      }),
      workItemId,
    );
    const closureEvents = closures.map((entry) =>
      withWorkItem(
        createInventoryEvent({
          ...tenant,
          event_id: nextId("suspend-closure"),
          idempotency_key: nextId("idem-suspend-closure"),
          sync_batch_id: batchId,
          type: "STOCK_ADJUSTMENT",
          product_id: product.id,
          product_name: product.name,
          to_location: entry.location,
          quantity: entry.closureQuantity,
          reason: PRODUCT_DEACTIVATION_REASON,
          sequence_number: sequence++,
          timestamp: Date.now(),
          status: "queued",
        }),
        workItemId,
      ),
    );

    state.outbox = [...state.outbox, lifecycleEvent, ...closureEvents];
    state.products = getProductCatalog().map((current) =>
      current.id === productId
        ? {
            ...current,
            is_active: false,
            deactivated_at: new Date().toISOString(),
            deactivated_by: tenant.user_id,
            deactivated_reason: actorReason || "",
            reactivated_at: null,
            reactivated_by: null,
          }
        : current,
    );

    showToast(
      closures.length
        ? `${product.name} suspended and ${closures.length} balancing event(s) queued.`
        : `${product.name} suspended. No balances required closing.`,
    );

    state.form.reason = "";
    ensureProductSelectionIntegrity();
    commit();
  } finally {
    productLifecycleBusy = null;
  }
}

function reactivateProductFromAction() {
  const productId = state.form.product_id;
  const product = getProductById(productId);
  if (!product) {
    showToast("Product not found for reactivation.", "error");
    return;
  }

  if (product.is_active) {
    showToast(`"${product.name}" is already active.`);
    return;
  }

  const warning = hasPendingProductClosureDebt(productId)
    ? "There are pending suspension closure events for this product in Work to Send."
    : "";

  const shouldProceed = window.confirm(
    `Reactivate "${product.name}"?\n\nReactivation does not create any stock movement events. Current stock (replayed) becomes immediately reusable.${warning ? `\n\n${warning}` : ""}`,
  );
  if (!shouldProceed) return;
  const actorReason = `${state.form.reason ?? ""}`.trim();
  const workItemId = nextId("work-product-reactivated");
  const reactivationEvent = withWorkItem(
    createInventoryEvent({
      ...tenant,
      event_id: nextId("reactivate"),
      idempotency_key: nextId("idem-reactivate"),
      sync_batch_id: currentBatchId(),
      type: "PRODUCT_REACTIVATED",
      product_id: product.id,
      product_name: product.name,
      quantity: 0,
      reason: actorReason ? `Product reactivated: ${actorReason}` : "Product reactivated",
      sequence_number: nextSequence(),
      timestamp: Date.now(),
      status: "queued",
    }),
    workItemId,
  );

  state.products = getProductCatalog().map((current) =>
    current.id === productId
      ? {
          ...current,
          is_active: true,
          reactivated_at: new Date().toISOString(),
          reactivated_by: tenant.user_id,
        }
      : current,
  );
  state.outbox = [...state.outbox, reactivationEvent];

  showToast(`"${product.name}" is active again. Reactivation does not create stock movement events.`);
  state.form.reason = "";
  ensureProductSelectionIntegrity();
  commit();
}

function getProductById(productId) {
  return getProductCatalog().find((product) => product.id === productId);
}

function productName(productId) {
  return getProductById(productId)?.name ?? productId;
}

function productUnit(productId) {
  return getProductById(productId)?.unit ?? "unit";
}

function productLow(productId) {
  return getProductById(productId)?.low ?? 0;
}

function eventLocationText(event) {
  if (event.type === "STOCK_IN") return `Arrived at ${event.to_location || "Unknown Place"}`;
  if (event.type === "STOCK_OUT") return `Left from ${event.from_location || "Unknown Place"}`;
  if (event.type === "STOCK_TRANSFER") return `${event.from_location || "Unknown Place"} to ${event.to_location || "Unknown Place"}`;
  if (event.type === "STOCK_ADJUSTMENT") return `Corrected at ${event.to_location || event.from_location || "Unknown Place"}`;
  if (event.type === "STOCK_REVERT") return `Reverses an earlier movement`;
  if (event.type === "PRODUCT_CREATED") return "Product catalog";
  if (event.type === "PRODUCT_DEACTIVATED") return "Product catalog";
  if (event.type === "PRODUCT_REACTIVATED") return "Product catalog";
  return `${event.from_location || "None"} to ${event.to_location || "None"}`;
}

function formatAuditBalance(value) {
  if (!Number.isFinite(Number(value))) return "N/A";
  return formatQuantity(value);
}

function formatQuantity(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
}

function commit() {
  saveState();
  render();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

render();
