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
    activeView: "dashboard",
    stockView: "totals",
    selectedLocation: "Main Bar",
    productFilter: "all",
    locationFilter: "all",
    message: "",
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const app = document.querySelector("#app");
  const localLedger = allLocalEvents();
  const stockRows = filteredStockRows(localLedger);
  const outboxValidation = state.outbox.map((event) => ({ event, validation: validateEvent(event) }));

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="workspace">
        ${renderTopbar()}
        ${renderStatusRail(localLedger, stockRows, outboxValidation)}
        ${renderActiveView(localLedger, stockRows, outboxValidation)}
      </main>
    </div>
  `;

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
    ["dashboard", screenMeta.dashboard],
    ["compose", screenMeta.compose],
    ["outbox", screenMeta.outbox],
    ["audit", screenMeta.audit],
    ["reconcile", screenMeta.reconcile],
  ];

  return `
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">SL</div>
        <div>
          <p class="brand-name">StockLedger</p>
          <p class="brand-subtitle"Power in Audit</p>
        </div>
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
      <div class="tenant-card">
        <p class="eyebrow">Current Site</p>
        <strong>${tenant.client_name}</strong>
        <span>${tenant.device_name}</span>
      </div>
    </aside>
  `;
}

function renderTopbar() {
  const meta = screenMeta[state.activeView] ?? screenMeta.dashboard;
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${meta.kicker}</p>
        <h1>${viewTitle()}</h1>
      </div>
      <div class="topbar-actions">
        <button class="segmented ${state.online ? "is-on" : ""}" data-action="toggle-online" type="button" aria-pressed="${state.online}">
          <span class="status-dot"></span>
          ${state.online ? "Online" : "Offline"}
        </button>
        <button class="button button-secondary guide-button ${state.guideOpen ? "is-open" : ""}" data-action="toggle-guide" type="button" aria-expanded="${state.guideOpen}">
          ${icon("spark")}
          Guide
        </button>
        <button class="button button-secondary" data-action="reset-demo" type="button">Reset Demo</button>
        <button class="button button-primary" data-action="sync" type="button" ${!state.online || state.outbox.length === 0 ? "disabled" : ""}>
          ${icon("send")}
          Send Work
        </button>
        ${state.guideOpen ? renderGuideMenu() : ""}
      </div>
    </header>
  `;
}

function renderGuideMenu() {
  const meta = screenMeta[state.activeView] ?? screenMeta.dashboard;
  const action = nextAction({
    lowRows: filteredStockRows(allLocalEvents()).filter((row) => row.quantity >= 0 && row.quantity <= productLow(row.product_id)).length,
    invalidOutbox: state.outbox.map((event) => validateEvent(event)).filter((result) => !result.valid).length,
    negativeRows: filteredStockRows(allLocalEvents()).filter((row) => row.quantity < 0).length,
  });
  const tips = guideTips();

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
    ${
      state.message
        ? `<div class="notice ${state.message.includes("not sent") || state.message.includes("offline") ? "is-error" : ""}" role="status" aria-live="polite">
            ${state.message}
          </div>`
        : ""
    }
  `;
}

function renderActiveView(localLedger, stockRows, outboxValidation) {
  if (state.activeView === "compose") return renderComposer(localLedger);
  if (state.activeView === "outbox") return renderOutbox(outboxValidation);
  if (state.activeView === "audit") return renderAudit(localLedger);
  if (state.activeView === "reconcile") return renderReconcile(stockRows);
  return renderDashboard(localLedger, stockRows);
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
        ${renderEventHelp(form.type)}
        <form class="event-form" data-form="event">
          <label>
            <span>What Happened?</span>
            <select name="type">
              ${EVENT_TYPES.map((type) => `<option value="${type}" ${form.type === type ? "selected" : ""}>${eventLabels[type]}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Product</span>
            <select name="product_id">
              ${products.map((product) => `<option value="${product.id}" ${form.product_id === product.id ? "selected" : ""}>${product.name}</option>`).join("")}
            </select>
          </label>
          ${renderLocationFields(form)}
          <label>
            <span>Quantity</span>
            <input name="quantity" type="number" step="0.01" value="${escapeAttr(form.quantity)}" />
          </label>
          ${
            form.type === "STOCK_REVERT"
              ? `<label class="span-2">
                  <span>Original Event</span>
                  <select name="original_event_id">
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
                  </select>
                </label>`
              : ""
          }
          <label class="span-2">
            <span>Reason</span>
            <textarea name="reason" rows="3" placeholder="Example: evening service use, supplier delivery, or physical count difference">${escapeHtml(form.reason)}</textarea>
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

function renderLocationFields(form) {
  const fromVisible = ["STOCK_OUT", "STOCK_TRANSFER"].includes(form.type);
  const toVisible = ["STOCK_IN", "STOCK_TRANSFER", "STOCK_ADJUSTMENT"].includes(form.type);
  const revertVisible = form.type === "STOCK_REVERT";

  if (revertVisible) {
    return `
      <label>
        <span>Location</span>
        <select name="from_location">
          <option value="">Use Original Location</option>
          ${locations.map((location) => `<option value="${location.name}" ${form.from_location === location.name ? "selected" : ""}>${location.name}</option>`).join("")}
        </select>
      </label>
    `;
  }

  return `
    ${
      fromVisible
        ? `<label>
            <span>Where From?</span>
            <select name="from_location">
              <option value="">Choose Starting Place</option>
              ${locations.map((location) => `<option value="${location.name}" ${form.from_location === location.name ? "selected" : ""}>${location.name}</option>`).join("")}
            </select>
          </label>`
        : ""
    }
    ${
      toVisible
        ? `<label>
            <span>Where To?</span>
            <select name="to_location">
              <option value="">Choose Ending Place</option>
              ${locations.map((location) => `<option value="${location.name}" ${form.to_location === location.name ? "selected" : ""}>${location.name}</option>`).join("")}
            </select>
          </label>`
        : ""
    }
  `;
}

function renderEventHelp(type) {
  const help = {
    STOCK_IN: ["Use this for deliveries or restock.", "Choose where the stock arrived."],
    STOCK_OUT: ["Use this when stock was used, sold, wasted, or broken.", "Choose where it left from."],
    STOCK_TRANSFER: ["Use this when stock moved from one place to another.", "Choose both the starting place and ending place."],
    STOCK_ADJUSTMENT: ["Use this after a hand count finds a difference.", "Use a plus number to add stock or a minus number to subtract stock."],
    STOCK_REVERT: ["Use this to reverse a mistake.", "Choose the original movement that should be cancelled."],
  };
  const [title, text] = help[type] ?? ["Record the movement.", "Fill the required fields before saving."];

  return `
    <div class="form-guide">
      <strong>${eventLabels[type] ?? "Record Movement"}</strong>
      <span>${title} ${text}</span>
    </div>
  `;
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
                      <th>No.</th>
                      <th>Action</th>
                      <th>Product</th>
                      <th>Location</th>
                      <th>Amount</th>
                      <th>Duplicate Check</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${outboxValidation
                      .map(
                        ({ event, validation }) => `
                          <tr>
                            <td>${event.sequence_number}</td>
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
                <th>System Count</th>
                <th>Hand Count</th>
                <th>Difference</th>
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
      <label>
        <span>Product</span>
        <select data-filter="product">
          <option value="all">All products</option>
          ${products.map((product) => `<option value="${product.id}" ${state.productFilter === product.id ? "selected" : ""}>${product.name}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Location</span>
        <select data-filter="location">
          <option value="all">All locations</option>
          ${locations.map((location) => `<option value="${location.name}" ${state.locationFilter === location.name ? "selected" : ""}>${location.name}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderStockControls() {
  return `
    <div class="stock-controls" aria-label="Stock View Options">
      <div class="view-switch" role="group" aria-label="Choose Stock View">
        ${stockViewButton("totals", "Total Stock", "layers")}
        ${stockViewButton("location", "By Location", "map")}
        ${stockViewButton("detail", "Detailed List", "list")}
      </div>
      ${
        state.stockView === "location"
          ? `<label class="compact-select">
              <span>Location</span>
              <select data-filter="selected-location">
                ${locations.map((location) => `<option value="${location.name}" ${state.selectedLocation === location.name ? "selected" : ""}>${location.name}</option>`).join("")}
              </select>
            </label>`
          : ""
      }
      ${state.stockView === "detail" ? renderFilters() : ""}
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
            <th>Total Stock</th>
            <th>Unit</th>
            <th>Locations With Stock</th>
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
                  <td>${row.location_count}</td>
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
            <th>Quantity</th>
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
            <th>Quantity</th>
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
            <th>No.</th>
            <th>Action</th>
            <th>Product</th>
            <th>Location</th>
            <th>Change</th>
            <th>New balance</th>
            <th>Actor</th>
            ${compact ? "" : "<th>Batch</th><th>Fix</th>"}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (entry) => `
                <tr>
                  <td>${entry.sequence_number}</td>
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
      state.activeView = button.dataset.view;
      state.guideOpen = false;
      commit();
    });
  });

  document.querySelectorAll("[data-action='toggle-guide']").forEach((button) => {
    button.addEventListener("click", () => {
      state.guideOpen = !state.guideOpen;
      commit();
    });
  });

  document.querySelectorAll("[data-action='toggle-online']").forEach((button) => {
    button.addEventListener("click", () => {
      state.online = !state.online;
      state.message = state.online ? "You are online. You can send saved work now." : "You are offline. New work will stay saved on this device.";
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
        type: data.get("type"),
        product_id: data.get("product_id"),
        from_location: data.get("from_location") ?? "",
        to_location: data.get("to_location") ?? "",
        quantity: data.get("quantity"),
        reason: data.get("reason") ?? "",
        original_event_id: data.get("original_event_id") ?? "",
      };
      saveState();
    });

    form.addEventListener("change", () => {
      const previousType = state.form.type;
      const data = new FormData(form);
      state.form = {
        ...state.form,
        type: data.get("type"),
        product_id: data.get("product_id"),
        from_location: data.get("from_location") ?? "",
        to_location: data.get("to_location") ?? "",
        original_event_id: data.get("original_event_id") ?? "",
      };

      if (previousType !== state.form.type) {
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
    state.message = validation.reason;
    commit();
    return;
  }

  state.outbox.push(event);
  state.message = `${eventLabels[event.type]} saved locally. Send work when online.`;
  state.form.quantity = 1;
  state.form.reason = "";
  state.activeView = "outbox";
  commit();
}

function syncOutbox() {
  if (!state.online) {
    state.message = "Work was not sent because the device is offline. Switch to Online first.";
    commit();
    return;
  }

  const result = applySyncBatch(state.serverLedger, state.outbox);
  if (!result.success) {
    state.message = `Work was not sent. Fix the highlighted saved movement, then send again.`;
    commit();
    return;
  }

  state.serverLedger = result.ledger;
  state.outbox = [];
  state.lastSync = new Date(result.server_timestamp).toISOString();
  state.message = `${result.processed_count} saved movement(s) sent successfully. The stock list is now updated.`;
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
  state.message = "Count difference saved as a correction. The old history was not changed.";
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
  state.message = "Mistake reversal saved. The original record still stays visible in history.";
  state.activeView = "outbox";
  commit();
}

function buildEventFromForm() {
  const form = state.form;
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
    quantity: Number(form.quantity),
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
  if (state.form.type === "STOCK_IN") {
    state.form.from_location = "";
    state.form.to_location ||= "Dry Store";
  }
  if (state.form.type === "STOCK_OUT") {
    state.form.from_location ||= "Main Bar";
    state.form.to_location = "";
  }
  if (state.form.type === "STOCK_TRANSFER") {
    state.form.from_location ||= "Dry Store";
    state.form.to_location ||= "Main Bar";
  }
  if (state.form.type === "STOCK_ADJUSTMENT") {
    state.form.from_location = "";
    state.form.to_location ||= "Main Bar";
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
  };

  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.layers}</svg>`;
}

function viewTitle() {
  const titles = {
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
