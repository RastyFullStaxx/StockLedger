import {
  EVENT_TYPES,
  applySyncBatch,
  computeStock,
  createInventoryEvent,
  replayAuditTrail,
  sortEvents,
  summarizeStock,
  validateEvent,
} from "./domain/ledger.mjs";

import "./styles.css";

const STORAGE_KEY = "stockledger-local-prototype-state-v1";
const tenant = {
  client_id: "tenant-northstar-hospitality",
  client_name: "Northstar Hospitality",
  device_id: "device-main-bar-terminal",
  device_name: "Main Bar Terminal",
  user_id: "user-mara-velasco",
  actor_name: "Mara Velasco",
};

const products = [
  { id: "prod-gin", name: "Juniper Gin", category: "Spirits", unit: "bottle", low: 6 },
  { id: "prod-rum", name: "Harbor Rum", category: "Spirits", unit: "bottle", low: 5 },
  { id: "prod-lime", name: "Fresh Lime", category: "Kitchen", unit: "kg", low: 8 },
  { id: "prod-tonic", name: "Tonic Water", category: "Mixer", unit: "case", low: 7 },
];

const locations = [
  { id: "loc-dry-store", name: "Dry Store" },
  { id: "loc-main-bar", name: "Main Bar" },
  { id: "loc-kitchen", name: "Kitchen" },
  { id: "loc-cellar", name: "Cellar" },
];

let state = loadState();
let toastTimer = null;
let shouldFocusActionOnCompose = state.activeView === "compose";
let fieldSelectUid = 0;
let customSelectEventsBound = false;
const eventSelectPortalMap = new WeakMap();

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
      product_name: productName(product_id),
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
    stockView: "totals",
    selectedLocation: "Main Bar",
    productFilter: "all",
    locationFilter: "all",
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
      reason: "",
      original_event_id: "",
    },
    physicalCounts: {},
  };
}

const screenMeta = {
  home: {
    title: "StockLedger",
    label: "Home",
    kicker: "Ledger",
    guide: "Start here when you want the shortest path into the local prototype.",
  },
  dashboard: {
    title: "Stock Overview",
    label: "Stock Overview",
    kicker: "Inventory",
    guide: "Start here. Check total stock first, then look at one location when you need detail.",
  },
  compose: {
    title: "Record Movement",
    label: "Record Movement",
    kicker: "Action",
    guide: "Write what happened. Do not type a final stock number. The system will calculate stock for you.",
  },
  outbox: {
    title: "Send Work",
    label: "Send Work",
    kicker: "Sync",
    guide: "These events are saved on this device. When online, send them together as one safe batch.",
  },
  audit: {
    title: "History",
    label: "History",
    kicker: "Audit",
    guide: "Use this when a number looks wrong. It shows who recorded each change and how stock was affected.",
  },
  reconcile: {
    title: "Count Check",
    label: "Count Check",
    kicker: "Reconcile",
    guide: "After a physical count, enter what you counted. Differences become correction events, not hidden edits.",
  },
};

const eventLabels = {
  STOCK_IN: "Add Delivery",
  STOCK_OUT: "Record Use",
  STOCK_TRANSFER: "Move Stock",
  STOCK_ADJUSTMENT: "Correct Count",
  STOCK_REVERT: "Reverse Mistake",
};

const ACTION_TEMPLATES = {
  STOCK_IN: {
    template: "Delivery Template",
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
    template: "Usage Template",
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
    template: "Count Correction Template",
    summary: "A hand count found a difference.",
    help: "Use this after a hand count finds a difference. Use a plus number to add stock or a minus number to subtract stock.",
    requiredFields: ["product_id", "to_location", "quantity"],
    sourceLabel: "Count Location",
    destinationLabel: "Not Used",
    quantityLabel: "Correction Amount",
    reasonPlaceholder: "Example: physical count difference",
    showFromLocation: false,
    showToLocation: true,
    showOriginalEvent: false,
    quantityEditable: true,
    requiresPositiveQuantity: false,
    defaults: {
      from_location: "",
      to_location: "Main Bar",
      quantity: 1,
      original_event_id: "",
    },
  },
  STOCK_REVERT: {
    template: "Mistake Reversal Template",
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
};

function actionTemplate(type) {
  return ACTION_TEMPLATES[type] ?? ACTION_TEMPLATES.STOCK_OUT;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultState();

  try {
    const parsed = JSON.parse(saved);
    return {
      ...defaultState(),
      ...parsed,
      form: { ...defaultState().form, ...(parsed.form ?? {}) },
      physicalCounts: parsed.physicalCounts ?? {},
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  const { toast, accountOpen, ...persistedState } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
}

function render() {
  const app = document.querySelector("#app");
  const localLedger = allLocalEvents();
  const stockRows = filteredStockRows(localLedger);
  const outboxValidation = state.outbox.map((event) => ({ event, validation: validateEvent(event) }));

  app.innerHTML = `
    <div class="app-shell ${state.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
      ${renderSidebar()}
      <main class="workspace">
        ${renderTopbar()}
        ${renderStatusRail(localLedger, stockRows, outboxValidation)}
        ${renderActiveView(localLedger, stockRows, outboxValidation)}
      </main>
      ${renderToast()}
    </div>
  `;

  if (state.activeView === "compose" && shouldFocusActionOnCompose) {
    requestAnimationFrame(() => {
      const typeField = app.querySelector("[data-select-trigger='type']");
      if (typeField) {
        typeField.focus();
      }
      shouldFocusActionOnCompose = false;
    });
  }

  bindEvents();
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='append-event']");
  if (!button) return;

  event.preventDefault();
  appendFormEvent();
});

function renderSidebar() {
  const nav = [
    ["home", screenMeta.home],
    ["dashboard", screenMeta.dashboard],
    ["compose", screenMeta.compose],
    ["outbox", screenMeta.outbox],
    ["audit", screenMeta.audit],
    ["reconcile", screenMeta.reconcile],
  ];

  return `
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true"><img src="/logo.svg" alt="" /></div>
        <div class="brand-copy">
          <p class="brand-name"><span>Stock</span><span>Ledger</span></p>
          <p class="brand-subtitle">Power in Audit</p>
        </div>
        <button class="sidebar-toggle" data-action="toggle-sidebar" type="button" aria-label="${state.sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}" aria-pressed="${state.sidebarCollapsed}">
          ${icon(state.sidebarCollapsed ? "panelOpen" : "panelClose")}
        </button>
      </div>
      <nav class="nav-list">
        ${nav
          .map(
            ([key, item]) => `
              <button class="nav-item ${state.activeView === key ? "is-active" : ""}" data-view="${key}" type="button">
                ${icon(navIcon(key))}
                <span>
                  <small>${item.kicker}</small>
                  ${item.label}
                </span>
                ${key === "outbox" && state.outbox.length ? `<strong>${state.outbox.length}</strong>` : ""}
              </button>
            `,
          )
          .join("")}
      </nav>
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
                <button type="button" data-view="home">${icon("home")}Home</button>
                <button type="button" data-view="dashboard">${icon("layers")}Stock Overview</button>
                <button type="button" data-view="outbox">${icon("send")}Send Work${state.outbox.length ? `<span>${state.outbox.length}</span>` : ""}</button>
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
        <p class="eyebrow">${meta.kicker}</p>
        <h1>${viewTitle()}</h1>
      </div>
      <div class="topbar-actions">
        <button class="button button-secondary" data-action="reset-demo" type="button">Reset Demo</button>
        <span class="guide-anchor">
          <button class="button button-secondary guide-button ${state.guideOpen ? "is-open" : ""}" data-action="toggle-guide" type="button" aria-expanded="${state.guideOpen}">
            ${icon("spark")}
            Guide
            ${guideCue ? `<span class="cue-badge">${guideCue}</span>` : `<span class="cue-dot" aria-hidden="true"></span>`}
          </button>
          ${state.guideOpen ? renderGuideMenu() : ""}
        </span>
        <button class="connection-toggle ${state.online ? "is-on" : ""}" data-action="toggle-online" type="button" aria-pressed="${state.online}">
          <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
          <span>${state.online ? "Online" : "Offline"}</span>
        </button>
        <button class="button button-primary send-work-button ${state.outbox.length ? "has-work" : ""}" data-action="sync" type="button" ${!state.online || state.outbox.length === 0 ? "disabled" : ""}>
          ${icon("send")}
          Send Work
        </button>
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
    compose: ["Choose the action in user terms.", "Record what happened, not the final stock number.", "Write a short reason that another person can understand."],
    outbox: ["Saved work stays on this device while offline.", "Send work when the Online button is on.", "If one row has a problem, the full batch waits."],
    audit: ["Use History when a number needs explaining.", "Reverse a mistake instead of deleting it.", "The original movement remains visible."],
    reconcile: ["Enter the hand count after a physical count.", "Save a correction only when there is a difference.", "Corrections keep the reason visible."],
  };

  return tips[state.activeView] ?? tips.dashboard;
}

function renderStatusRail(localLedger, stockRows, outboxValidation) {
  if (state.activeView === "home") {
    return "";
  }

  const negativeRows = stockRows.filter((row) => row.quantity < 0).length;
  const lowRows = stockRows.filter((row) => row.quantity >= 0 && row.quantity <= productLow(row.product_id)).length;
  const invalidOutbox = outboxValidation.filter((entry) => !entry.validation.valid).length;

  return `
    <section class="status-grid" aria-label="Ledger status">
      ${metricCard("Saved Changes", localLedger.length, "Recorded movements")}
      ${metricCard("Waiting to Send", state.outbox.length, state.online ? "Ready now" : "Saved locally")}
      ${metricCard("Low Stock", lowRows, "Review before service")}
      ${metricCard("Needs Review", negativeRows + invalidOutbox, "Fix before reports")}
    </section>
  `;
}

function renderActiveView(localLedger, stockRows, outboxValidation) {
  if (state.activeView === "home") return renderLanding(localLedger, stockRows, outboxValidation);
  if (state.activeView === "compose") return renderComposer(localLedger);
  if (state.activeView === "outbox") return renderOutbox(outboxValidation);
  if (state.activeView === "audit") return renderAudit(localLedger);
  if (state.activeView === "reconcile") return renderReconcile(stockRows);
  return renderDashboard(localLedger, stockRows);
}

function renderLanding(localLedger, stockRows, outboxValidation) {
  const lowRows = stockRows.filter((row) => row.quantity >= 0 && row.quantity <= productLow(row.product_id));
  const invalidOutbox = outboxValidation.filter((entry) => !entry.validation.valid).length;
  const recentRows = replayAuditTrail(localLedger).reverse().slice(0, 4);

  return `
    <section class="landing-shell" aria-label="StockLedger Home">
      <div class="landing-hero">
        <div class="landing-copy">
          <p class="eyebrow">Local Audit Prototype</p>
          <h2>Inventory That Explains Every Number.</h2>
          <p>Record movements, keep work safe offline, and replay the ledger when a count needs proof.</p>
          <div class="landing-actions">
            <button class="button button-primary" data-view="compose" type="button">${icon("plus")}Record Movement</button>
            <button class="button button-secondary" data-view="dashboard" type="button">${icon("layers")}Open Stock Overview</button>
          </div>
        </div>
      </div>
      <div class="landing-grid">
        <article class="landing-card">
          <span>${icon("layers")}</span>
          <h3>See The Master Stock</h3>
          <p>Total stock, per-location stock, and detailed rows stay one click apart.</p>
          <button class="table-action" data-view="dashboard" type="button">View Stock</button>
        </article>
        <article class="landing-card">
          <span>${icon("history")}</span>
          <h3>Trace Every Change</h3>
          <p>History is immutable. Mistakes are reversed with a visible correction.</p>
          <button class="table-action" data-view="audit" type="button">Open History</button>
        </article>
        <article class="landing-card">
          <span>${icon("send")}</span>
          <h3>Send Work Safely</h3>
          <p>Offline work waits locally, then sends as one batch when the connection is on.</p>
          <button class="table-action" data-view="outbox" type="button">Check Outbox</button>
        </article>
      </div>
      <article class="panel landing-recent">
        <div class="panel-header compact">
          <div>
            <p class="eyebrow">Recent Ledger</p>
            <h2>Last Movements</h2>
          </div>
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

function renderDashboard(localLedger, stockRows) {
  return `
    <section class="content-grid stock-overview-grid">
      <article class="panel panel-wide">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Main View</p>
            <h2>${stockViewTitle()}</h2>
            <p class="section-help">${stockViewHelp()}</p>
          </div>
        </div>
        <div class="stock-control-row">
          ${renderStockControls()}
        </div>
        ${renderStockView(stockRows)}
      </article>
    </section>
  `;
}

function renderComposer(localLedger) {
  const form = state.form;
  const validation = previewEventValidation();
  const revertOptions = sortEvents(localLedger)
    .filter((event) => event.type !== "STOCK_REVERT")
    .slice(-12)
    .reverse();
  const template = actionTemplate(form.type);

  return `
    <section class="content-grid composer-grid">
      <article class="panel panel-wide">
        <div class="panel-header compact">
          <div>
            <p class="eyebrow">Movement</p>
            <h2>Record One Movement</h2>
            <p class="section-help">Pick the action, product, place, and amount. The stock total updates after this is saved.</p>
          </div>
        </div>
        ${renderActionTemplate(form.type)}
        <form class="event-form" data-form="event">
          <label class="field-select-wrap field-select-wrap--emphasized">
            <span>Action Type</span>
            ${renderFieldSelect({
              name: "type",
              options: EVENT_TYPES.map((type) => `<option value="${type}" ${form.type === type ? "selected" : ""}>${eventLabels[type]}</option>`).join(""),
              className: "field-select--emphasized",
              menuClassName: "field-select-menu--event-form",
              menuMode: "event-form",
              autofocus: true,
            })}
          </label>
          <label class="field-select-wrap">
            <span>Product</span>
            ${renderFieldSelect({
              name: "product_id",
              menuClassName: "field-select-menu--event-form",
              menuMode: "event-form",
              options: products.map((product) => `<option value="${product.id}" ${form.product_id === product.id ? "selected" : ""}>${product.name}</option>`).join(""),
            })}
          </label>
          ${renderActionTemplateFields(form, template, revertOptions)}
          <label class="span-2">
            <span>Reason</span>
            <textarea name="reason" rows="3" placeholder="${template.reasonPlaceholder}">${escapeHtml(form.reason)}</textarea>
          </label>
          <div class="form-footer span-2">
            <div class="validation ${validation.valid ? "is-valid" : "is-error"}">
              ${validation.valid ? "Ready to Save on This Device." : simpleValidationReason(validation.reason)}
            </div>
            <button class="button button-primary" data-action="append-event" type="button">${icon("plus")}Save Movement</button>
          </div>
        </form>
      </article>
    </section>
  `;
}

function renderActionTemplateFields(form, template, revertOptions) {
  const originalEvent = template.showOriginalEvent ? findEventForRevert(form.original_event_id) : null;

  return `
      ${renderMovementLocationField(template.showFromLocation, template.sourceLabel, form.from_location, "from_location")}
      ${renderMovementLocationField(template.showToLocation, template.destinationLabel, form.to_location, "to_location")}
      ${
        template.showOriginalEvent
          ? `<label class="span-2 field-select-wrap">
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
      template.quantityEditable
        ? `<label>
             <span>${template.quantityLabel}</span>
             <input name="quantity" type="number" step="0.01" value="${escapeAttr(form.quantity)}" />
           </label>`
        : `<label class="span-2">
             <span>${template.quantityLabel}</span>
             <p>${renderRevertAmountHelp(originalEvent)}</p>
           </label>`
    }
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
    <div class="template-strip" aria-label="Action Template">
      <span>${copy.template}</span>
      <strong>${copy.summary}</strong>
    </div>
  `;
}

function findEventForRevert(eventId) {
  if (!eventId) return null;

  return allLocalEvents().find((event) => event.event_id === eventId && event.type !== "STOCK_REVERT");
}

function renderOutbox(outboxValidation) {
  return `
    <section class="content-grid">
      <article class="panel panel-wide">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Saved Locally</p>
            <h2>Work Waiting to Send</h2>
            <p class="section-help">Send all saved movements together. If one movement has a problem, none are sent.</p>
          </div>
          <button class="button button-primary" data-action="sync" type="button" ${!state.online || state.outbox.length === 0 ? "disabled" : ""}>
            ${icon("send")}Send Saved Work
          </button>
        </div>
        ${
          state.outbox.length === 0
            ? `<div class="empty-state"><strong>No Saved Work Waiting</strong><span>Record a movement first. It will appear here before it is sent.</span></div>`
            : `<div class="table-wrap outbox-table">
                <table>
                  <thead>
                    <tr>
                      <th class="numeric">No.</th>
                      <th>Action</th>
                      <th>Product</th>
                      <th>Location</th>
                      <th class="numeric">Amount</th>
                      <th>Duplicate Check</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${outboxValidation
                      .map(
                        ({ event, validation }) => `
                          <tr>
                            <td class="numeric">${event.sequence_number}</td>
                            <td><span class="type-pill">${eventLabels[event.type]}</span></td>
                            <td>${productName(event.product_id)}</td>
                            <td>${eventLocationText(event)}</td>
                            <td class="numeric">${formatQuantity(event.quantity)}</td>
                            <td><code>${event.idempotency_key}</code></td>
                            <td><span class="badge ${validation.valid ? "is-valid" : "is-error"}">${validation.valid ? "Ready" : simpleValidationReason(validation.reason)}</span></td>
                          </tr>
                        `,
                      )
                      .join("")}
                  </tbody>
                </table>
                <div class="outbox-cards" aria-label="Saved work list">
                  ${outboxValidation
                    .map(
                      ({ event, validation }) => `
                        <article class="work-card">
                          <div class="card-row">
                            <div>
                              <span>No. ${event.sequence_number}</span>
                              <strong>${eventLabels[event.type]}</strong>
                            </div>
                            <span class="badge ${validation.valid ? "is-valid" : "is-error"}">${validation.valid ? "Ready" : simpleValidationReason(validation.reason)}</span>
                          </div>
                          <dl>
                            <div><dt>Product</dt><dd>${productName(event.product_id)}</dd></div>
                            <div><dt>Location</dt><dd>${eventLocationText(event)}</dd></div>
                            <div><dt>Amount</dt><dd>${formatQuantity(event.quantity)}</dd></div>
                            <div><dt>Duplicate Check</dt><dd><code>${event.idempotency_key}</code></dd></div>
                          </dl>
                        </article>
                      `,
                    )
                    .join("")}
                </div>
              </div>`
        }
      </article>
    </section>
  `;
}

function renderAudit(localLedger) {
  return `
    <section class="content-grid">
      <article class="panel panel-wide">
        <div class="panel-header compact">
          <div>
            <p class="eyebrow">Full History</p>
            <h2>Every Recorded Movement</h2>
            <p class="section-help">Use this page to answer who changed stock, where it changed, and what the balance became.</p>
          </div>
        </div>
        ${renderAuditTable(localLedger)}
      </article>
    </section>
  `;
}

function renderReconcile(stockRows) {
  return `
    <section class="content-grid">
      <article class="panel panel-wide">
        <div class="panel-header compact">
          <div>
            <p class="eyebrow">After Counting Stock</p>
            <h2>Compare Counted Stock</h2>
            <p class="section-help">Enter what you counted by hand. If it differs, save a correction so the reason stays visible.</p>
          </div>
        </div>
        <div class="table-wrap reconcile-table">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Location</th>
                <th class="numeric">System Count</th>
                <th>Hand Count</th>
                <th class="numeric">Difference</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${stockRows
                .map((row) => {
                  const key = countKey(row);
                  const physical = state.physicalCounts[key] ?? "";
                  const variance = physical === "" ? null : Number(physical) - row.quantity;
                  return `
                    <tr>
                      <td>${row.product_name}</td>
                      <td>${row.location}</td>
                      <td class="numeric">${formatQuantity(row.quantity)}</td>
                      <td>
                        <input class="count-input" data-count-key="${key}" type="number" step="0.01" value="${escapeAttr(physical)}" aria-label="Physical count for ${row.product_name} at ${row.location}" />
                      </td>
                      <td class="numeric ${variance && variance < 0 ? "danger-text" : ""}">${variance === null ? "Pending" : formatQuantity(variance)}</td>
                      <td>
                        <button class="button button-secondary" data-action="reconcile" data-count-key="${key}" type="button" ${!variance ? "disabled" : ""}>
                          ${icon("check")}Save Correction
                        </button>
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
          <div class="reconcile-cards" aria-label="Count correction list">
            ${stockRows
              .map((row) => {
                const key = countKey(row);
                const physical = state.physicalCounts[key] ?? "";
                const variance = physical === "" ? null : Number(physical) - row.quantity;
                return `
                  <article class="count-card">
                    <div class="card-row">
                      <div>
                        <strong>${row.product_name}</strong>
                        <span>${row.location}</span>
                      </div>
                      <div class="card-number">
                        <span>System Count</span>
                        <strong>${formatQuantity(row.quantity)}</strong>
                      </div>
                    </div>
                    <label>
                      <span>Hand Count</span>
                      <input data-count-key="${key}" type="number" step="0.01" value="${escapeAttr(physical)}" aria-label="Physical count for ${row.product_name} at ${row.location}" />
                    </label>
                    <div class="card-row">
                      <div>
                        <span>Difference</span>
                        <strong class="${variance && variance < 0 ? "danger-text" : ""}">${variance === null ? "Pending" : formatQuantity(variance)}</strong>
                      </div>
                      <button class="button button-secondary" data-action="reconcile" data-count-key="${key}" type="button" ${!variance ? "disabled" : ""}>
                        ${icon("check")}Save Correction
                      </button>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </div>
      </article>
    </section>
  `;
}

function renderFilters() {
  return `
      <div class="filters">
        <label class="field-select-wrap field-select-wrap--stock-overview-filter">
        <span>Product</span>
        ${renderFieldSelect({
            name: "product-filter",
            menuStyle: "styled",
            className: "field-select--stock-overview-filter",
            menuClassName: "field-select-menu--stock-overview-filter",
            menuMode: "stock-overview-filter",
            attrs: 'data-filter="product"',
            options: `
              <option value="all">All products</option>
            ${products.map((product) => `<option value="${product.id}" ${state.productFilter === product.id ? "selected" : ""}>${product.name}</option>`).join("")}
          `,
        })}
      </label>
      <label class="field-select-wrap field-select-wrap--stock-overview-filter">
        <span>Location</span>
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
  return `
    <div class="stock-controls" aria-label="Stock View Options">
      <div class="stock-filter-slot">
        ${ 
            state.stockView === "location"
              ? `<label class="compact-select field-select-wrap field-select-wrap--stock-overview-filter">
                  <span>Location</span>
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
        ${state.stockView === "detail" ? renderFilters() : ""}
      </div>
      <div class="view-switch" role="group" aria-label="Choose Stock View">
        ${stockViewButton("totals", "Total Stock", "layers")}
        ${stockViewButton("location", "By Location", "map")}
        ${stockViewButton("detail", "Detailed List", "list")}
      </div>
    </div>
  `;
}

function stockViewButton(view, label, iconName) {
  return `
    <button class="view-option ${state.stockView === view ? "is-active" : ""}" data-stock-view="${view}" type="button" aria-pressed="${state.stockView === view}">
      ${icon(iconName)}
      ${label}
    </button>
  `;
}

function renderStockView(stockRows) {
  if (state.stockView === "location") return renderLocationStockTable(locationStockRows(stockRows));
  if (state.stockView === "detail") return renderStockTable(stockRows);
  return renderMasterStockTable(stockTotalRows(stockRows));
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

function renderMasterStockTable(rows) {
  return `
    <div class="table-wrap stock-table">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th class="numeric">Total Stock</th>
            <th>Unit</th>
            <th class="numeric">Locations With Stock</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${row.product_name}</td>
                  <td class="numeric">${formatQuantity(row.quantity)}</td>
                  <td>${productUnit(row.product_id)}</td>
                  <td class="numeric">${row.location_count}</td>
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
                  <span>${row.location_count} location${row.location_count === 1 ? "" : "s"} with stock</span>
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
    </div>
  `;
}

function renderLocationStockTable(rows) {
  return `
    <div class="table-wrap stock-table">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Location</th>
            <th class="numeric">Quantity</th>
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
                  <td class="numeric">${formatQuantity(row.quantity)}</td>
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
                  <span>${row.location}</span>
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
    </div>
  `;
}

function renderStockTable(rows) {
  return `
    <div class="table-wrap stock-table">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Location</th>
            <th class="numeric">Quantity</th>
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
                  <td class="numeric">${formatQuantity(row.quantity)}</td>
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
                  <span>${row.location}</span>
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
    </div>
  `;
}

function renderAuditTable(events, limit = null, compact = false) {
  const trail = replayAuditTrail(events);
  const rows = [...trail].reverse().slice(0, limit ?? trail.length);

  if (rows.length === 0) {
    return `<div class="empty-state"><strong>No history yet</strong><span>Save inventory movements to build the ledger.</span></div>`;
  }

  return `
    <div class="table-wrap audit-table ${compact ? "compact-table" : ""}">
      <table>
        <thead>
          <tr>
            <th class="numeric">No.</th>
            <th>Action</th>
            <th>Product</th>
            <th>Location</th>
            <th class="numeric">Change</th>
            <th class="numeric">New Balance</th>
            <th>Actor</th>
            ${compact ? "" : "<th>Batch</th><th>Fix</th>"}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (entry) => `
                <tr>
                  <td class="numeric">${entry.sequence_number}</td>
                  <td><span class="type-pill">${eventLabels[entry.type] ?? entry.type}</span></td>
                  <td>${entry.product_name}</td>
                  <td>${entry.location}</td>
                  <td class="numeric ${entry.delta < 0 ? "danger-text" : ""}">${entry.delta > 0 ? "+" : ""}${formatQuantity(entry.delta)}</td>
                  <td class="numeric">${formatQuantity(entry.running_balance)}</td>
                  <td>${entry.actor_name}</td>
                  ${
                    compact
                      ? ""
                      : `<td><code>${entry.sync_batch_id}</code></td>
                        <td>
                          <button class="table-action" data-action="quick-revert" data-event-id="${entry.event_id}" type="button" ${entry.type === "STOCK_REVERT" ? "disabled" : ""}>
                            Reverse
                          </button>
                        </td>`
                  }
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
      <div class="audit-cards" aria-label="${compact ? "Recent movement list" : "Full movement history"}">
        ${rows
          .map(
            (entry) => `
              <article class="history-card">
                <div class="card-row">
                  <div>
                    <span>No. ${entry.sequence_number}</span>
                    <strong>${entry.product_name}</strong>
                  </div>
                  <span class="type-pill">${eventLabels[entry.type] ?? entry.type}</span>
                </div>
                <dl>
                  <div><dt>Location</dt><dd>${entry.location}</dd></div>
                  <div><dt>Change</dt><dd class="${entry.delta < 0 ? "danger-text" : ""}">${entry.delta > 0 ? "+" : ""}${formatQuantity(entry.delta)}</dd></div>
                  <div><dt>New balance</dt><dd>${formatQuantity(entry.running_balance)}</dd></div>
                  <div><dt>Actor</dt><dd>${entry.actor_name}</dd></div>
                  ${compact ? "" : `<div><dt>Batch</dt><dd><code>${entry.sync_batch_id}</code></dd></div>`}
                </dl>
                ${
                  compact
                    ? ""
                    : `<button class="table-action" data-action="quick-revert" data-event-id="${entry.event_id}" type="button" ${entry.type === "STOCK_REVERT" ? "disabled" : ""}>
                        Reverse
                      </button>`
                }
              </article>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function metricCard(label, value, hint) {
  return `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.view;
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
    button.addEventListener("click", () => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
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
      commit();
    });
  });

  document.querySelectorAll("[data-filter='location']").forEach((select) => {
    select.addEventListener("change", () => {
      state.locationFilter = select.value;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='selected-location']").forEach((select) => {
    select.addEventListener("change", () => {
      state.selectedLocation = select.value;
      commit();
    });
  });

  document.querySelectorAll("[data-stock-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.stockView = button.dataset.stockView;
      commit();
    });
  });

  document.querySelectorAll("[data-count-key]").forEach((input) => {
    input.addEventListener("input", () => {
      state.physicalCounts[input.dataset.countKey] = input.value;
      saveState();
    });
  });

  document.querySelectorAll("[data-action='reconcile']").forEach((button) => {
    button.addEventListener("click", () => reconcileCount(button.dataset.countKey));
  });

  document.querySelectorAll("[data-action='quick-revert']").forEach((button) => {
    button.addEventListener("click", () => createRevert(button.dataset.eventId));
  });

  const form = document.querySelector("[data-form='event']");
  if (form) {
    form.addEventListener("input", () => {
      const data = new FormData(form);
      state.form = {
        ...state.form,
        product_id: data.get("product_id"),
        from_location: data.get("from_location") ?? state.form.from_location ?? "",
        to_location: data.get("to_location") ?? state.form.to_location ?? "",
        quantity: data.get("quantity"),
        reason: data.get("reason") ?? "",
        original_event_id: data.get("original_event_id") ?? state.form.original_event_id ?? "",
      };
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

      saveState();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      appendFormEvent();
    });
  }
}

function appendFormEvent() {
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
  state.form.original_event_id = "";
  state.form.reason = "";
  normalizeFormForType();
  state.activeView = "outbox";
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

function reconcileCount(key) {
  const row = filteredStockRows(allLocalEvents()).find((candidate) => countKey(candidate) === key);
  if (!row) return;

  const physical = Number(state.physicalCounts[key]);
  const variance = Number((physical - row.quantity).toFixed(4));
  if (!Number.isFinite(physical) || variance === 0) return;

  const event = createInventoryEvent({
    ...tenant,
    event_id: nextId("recon"),
    idempotency_key: nextId("idem-recon"),
    sync_batch_id: currentBatchId(),
    type: "STOCK_ADJUSTMENT",
    product_id: row.product_id,
    product_name: row.product_name,
    to_location: row.location,
    quantity: variance,
    reason: `Physical count ${formatQuantity(physical)} vs replay ${formatQuantity(row.quantity)}`,
    sequence_number: nextSequence(),
    timestamp: Date.now(),
  });

  state.outbox.push(event);
  delete state.physicalCounts[key];
  showToast("Count difference saved as a correction. The old history was not changed.");
  state.activeView = "outbox";
  commit();
}

function createRevert(eventId) {
  const original = allLocalEvents().find((event) => event.event_id === eventId);
  if (!original || original.type === "STOCK_REVERT") return;

  const event = createInventoryEvent({
    ...tenant,
    event_id: nextId("revert"),
    idempotency_key: nextId("idem-revert"),
    sync_batch_id: currentBatchId(),
    type: "STOCK_REVERT",
    product_id: original.product_id,
    product_name: productName(original.product_id),
    from_location: original.from_location,
    to_location: original.to_location,
    quantity: Math.abs(Number(original.quantity)),
    original_event_id: original.event_id,
    reason: `Compensating event for ${original.event_id}`,
    sequence_number: nextSequence(),
    timestamp: Date.now(),
  });

  state.outbox.push(event);
  showToast("Mistake reversal saved. The original record still stays visible in history.");
  state.activeView = "outbox";
  commit();
}

function buildEventFromForm() {
  const form = state.form;
  const template = actionTemplate(form.type);

  if (form.type === "STOCK_REVERT") {
    const original = findEventForRevert(form.original_event_id);
    return createInventoryEvent({
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
    });
  }

  const quantityValue = template.requiresPositiveQuantity ? Math.abs(Number(form.quantity || 0)) : Number(form.quantity || 0);
  return createInventoryEvent({
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
    reason: form.reason.trim() || "Operational event",
    sequence_number: nextSequence(),
    timestamp: Date.now(),
    status: "queued",
  });
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
}

function allLocalEvents() {
  return sortEvents([...state.serverLedger, ...state.outbox]);
}

function filteredStockRows(events) {
  return summarizeStock(events, products, locations).filter((row) => {
    const productMatch = state.productFilter === "all" || row.product_id === state.productFilter;
    const locationMatch = state.locationFilter === "all" || row.location === state.locationFilter;
    return productMatch && locationMatch;
  });
}

function stockTotalRows(rows) {
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

function locationStockRows(rows) {
  return rows.filter((row) => row.location === state.selectedLocation);
}

function stockState(row) {
  if (row.quantity < 0) return `<span class="badge is-error">Check Now</span>`;
  if (row.quantity <= productLow(row.product_id)) return `<span class="badge is-warning">Low Stock</span>`;
  return `<span class="badge is-valid">Enough</span>`;
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

function countKey(row) {
  return `${row.product_id}::${row.location}`;
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
      button: "Open Send Work",
      view: "outbox",
    };
  }

  if (state.outbox.length > 0 && !state.online) {
    return {
      title: "Keep Working. Send Later.",
      text: "Your changes are saved on this device. Go online when you are ready to send them.",
      button: "View Saved Work",
      view: "outbox",
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
    title: "Record the Next Movement",
    text: "When stock arrives, moves, or gets used, record what happened.",
    button: "Record Movement",
    view: "compose",
  };
}

function navIcon(view) {
  const icons = {
    home: "home",
    dashboard: "layers",
    compose: "plus",
    outbox: "send",
    audit: "history",
    reconcile: "check",
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
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M3 19v-5h5"/><path d="M21 5v5h-5"/>',
    alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
    panelClose: '<path d="M3 5h18v14H3z"/><path d="M9 5v14"/><path d="m16 10-2 2 2 2"/>',
    panelOpen: '<path d="M3 5h18v14H3z"/><path d="M9 5v14"/><path d="m14 10 2 2-2 2"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  };

  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.layers}</svg>`;
}

function viewTitle() {
  const titles = {
    home: "StockLedger",
    dashboard: "Stock Overview",
    compose: "Record Movement",
    outbox: "Send Work",
    audit: "History",
    reconcile: "Count Check",
  };
  return titles[state.activeView] ?? "Stock Overview";
}

function productName(productId) {
  return products.find((product) => product.id === productId)?.name ?? productId;
}

function productUnit(productId) {
  return products.find((product) => product.id === productId)?.unit ?? "unit";
}

function productLow(productId) {
  return products.find((product) => product.id === productId)?.low ?? 0;
}

function eventLocationText(event) {
  if (event.type === "STOCK_IN") return `Arrived at ${event.to_location || "Unknown Place"}`;
  if (event.type === "STOCK_OUT") return `Left from ${event.from_location || "Unknown Place"}`;
  if (event.type === "STOCK_TRANSFER") return `${event.from_location || "Unknown Place"} to ${event.to_location || "Unknown Place"}`;
  if (event.type === "STOCK_ADJUSTMENT") return `Corrected at ${event.to_location || event.from_location || "Unknown Place"}`;
  if (event.type === "STOCK_REVERT") return `Reverses an earlier movement`;
  return `${event.from_location || "None"} to ${event.to_location || "None"}`;
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
