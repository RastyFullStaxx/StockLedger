import {
  applySyncBatch,
  createInventoryEvent,
  replayAuditTrail,
  sortEvents,
  validateEvent,
} from "./domain/ledger.mjs";
import {
  CI_LANES,
  DEFAULT_CLIENTS,
  DEFAULT_MENU_ITEMS,
  DEFAULT_MENUS,
  DEFAULT_PRODUCTS,
  DEFAULT_SUPPLIERS,
  DEFAULT_USERS,
  NUMBERING_RULES,
  ROLE_MATRIX,
  SETTINGS_POLICIES,
  TRUSTED_DEVICES,
  defaultLocations,
  defaultProducts,
  defaultState,
  saleModeLabels,
  saleTypeLabels,
  tenant,
} from "./data/demo-data.mjs";
import {
  ACTION_TEMPLATES,
  REVERTIBLE_EVENT_TYPES,
  actionTabLabels,
  actionTemplate,
  eventLabels,
  navigationGroups,
  screenMeta,
} from "./config/app-config.mjs";
import { displayDateTime, escapeAttr, escapeHtml, formatQuantity } from "./utils/format.mjs";
import {
  bindTabMotion,
  flushQueuedRecordDetailMotion,
  flushQueuedTabMotion,
  animateGuideMenuClose,
  animateActionTypeSelect,
  animateProductOptionSelect,
  queueActiveViewMotion,
  queueRecordDetailMotion,
  queueStockViewMotion,
} from "./ui/motion.mjs";
import {
  loadState,
  normalizeLocationKind,
  normalizeLocationStatus,
  normalizeSelectedProductIds,
  seedDemoState,
  saveState as persistState,
} from "./state/local-state.mjs";
import {
  allLocalEvents as selectAllLocalEvents,
  currentBatchId as selectCurrentBatchId,
  filteredStockRows as selectFilteredStockRows,
  locationStockRows as selectLocationStockRows,
  nextId,
  nextSequence as selectNextSequence,
  paginateRows,
  simpleValidationReason,
  stockStatus,
  stockTotalRows as selectStockTotalRows,
  withWorkItem,
} from "./inventory/selectors.mjs";
import {
  answerAssistantQuestion as answerAssistantQuestionFromContext,
  assistantMessagesForRender as assistantMessagesForRenderFromPanel,
  buildGuideNotifications,
  createAssistantContext,
  createAssistantGreetingMessage,
  guideCueCount as countGuideCues,
  renderAssistantMenu,
  renderStockyIcon,
} from "./assistant/assistant-panel.mjs";
import {
  appendStockActionBusinessRecord,
  markStockActionBusinessRecordsSynced,
  removeStockActionBusinessRecordForUndo,
} from "./stock-actions/business-records.mjs";
import {
  createStockActionEventBuilder,
  physicalCountForProduct as selectPhysicalCountForProduct,
  physicalCountVariance as selectPhysicalCountVariance,
  quantityForProduct as selectQuantityForProduct,
} from "./stock-actions/event-builder.mjs";
import {
  PRODUCT_EVENT_PREFIX,
  applyProductReactivation,
  applyProductSuspension,
  buildProductReactivationWork,
  buildProductSuspensionWork,
  formatDeactivationClosures as formatLifecycleClosures,
  formatMultiProductDeactivationClosures as formatLifecycleMultiProductClosures,
  hasPendingProductClosureDebt as selectHasPendingProductClosureDebt,
  nextProductId,
  productDeactivationClosures,
  productLastStateLabel as selectProductLastStateLabel,
} from "./stock-actions/product-lifecycle.mjs";
import { buildWorkQueueItems } from "./stock-actions/work-queue.mjs";
import {
  clientSalesReportRows,
  filterAuditRows as selectAuditRows,
  filterClients,
  filterLocations,
  filterMenus,
  filterProductCatalog,
  filterPurchaseRecords,
  filterSalesRecords,
  filterSuppliers,
  filterUsers,
  movementReportRows,
  productCategories as selectProductCategories,
  supplierPurchaseReportRows,
} from "./records/selectors.mjs";

import "./styles.css";

const ACTION_EVENT_TYPES = [
  "STOCK_OUT",
  "STOCK_IN",
  "STOCK_TRANSFER",
  "STOCK_ADJUSTMENT",
  "STOCK_REVERT",
  "PRODUCT_CREATED",
  "PRODUCT_DEACTIVATED",
  "PRODUCT_REACTIVATED",
];

let state = loadState();
let productLifecycleBusy = null;
let toastTimer = null;
let shouldFocusActionOnCompose = state.activeView === "compose";
let fieldSelectUid = 0;
let customSelectEventsBound = false;
let reportChartsModulePromise = null;
let stockyHomeBubbleMessageIndex = 0;
let stockyHomeBubbleTimer = null;
const stockyHomeBubbleMessagePool = [
  "Stocky here! Always ready to help.",
  "How's your day? I can check the ledger with you.",
  "Need a quick stock read? Tap me.",
  "I can help spot what needs attention.",
  "Want to trace a stock movement? I'm here.",
  "Let's keep the bar flowing today.",
  "Questions about counts, actions, or audit? Ask me.",
  "I can help you choose the right stock action.",
];
const eventSelectPortalMap = new WeakMap();

function saveState() {
  persistState(state);
}

function commit() {
  saveState();
  render();
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
      ${renderLocationModal()}
      ${renderToast()}
    </div>
  `;

  restoreFocusSnapshot(app, focusSnapshot);
  requestAnimationFrame(() => {
    const assistantFeed = app.querySelector(".assistant-feed");
    if (assistantFeed) assistantFeed.scrollTop = assistantFeed.scrollHeight;
    mountReportChartsWhenPresent(app);
  });
  syncStockyHomeBubbleMessageRotation();

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
  return `
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="brand-lockup">
        ${
          state.sidebarCollapsed
            ? `<button class="brand-mark brand-mark-toggle" data-action="toggle-sidebar" type="button" aria-label="Expand Sidebar" aria-pressed="true">
                <img class="brand-logo" src="/logo-white.svg" alt="" />
                <span class="brand-mark-icon" aria-hidden="true">${icon("panelOpen")}</span>
              </button>`
            : `<div class="brand-mark" aria-hidden="true"><img src="/logo-white.svg" alt="" /></div>`
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
        ${navigationGroups
          .map(
            (group) => `
              <section class="nav-group" aria-label="${escapeAttr(group.label)}">
                <span class="nav-group-title">${group.label}</span>
                <div class="nav-group-items">
                  ${group.items.map((key) => renderNavItem(key)).join("")}
                </div>
              </section>
            `,
          )
          .join("")}
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

function renderNavItem(key) {
  const item = screenMeta[key] ?? screenMeta.dashboard;

  return `
    <button class="nav-item ${state.activeView === key ? "is-active" : ""}" data-view="${key}" type="button">
      ${icon(navIcon(key))}
      <span>
        <span class="nav-item-title">${item.label}</span>
      </span>
      ${
        key === "compose" && state.outbox.length
          ? `<strong class="nav-count" aria-label="${state.outbox.length} saved work item${state.outbox.length === 1 ? "" : "s"}">${state.outbox.length}</strong>`
          : ""
      }
    </button>
  `;
}

function renderTopbar() {
  const guideCue = guideCueCount();
  return `
    <header class="topbar">
      <div>
        <h1>${viewTitle()}</h1>
      </div>
      <div class="topbar-actions">
        ${renderTopbarPrimaryAction()}
        <span class="guide-anchor">
          <button class="button button-secondary guide-button ${state.guideOpen ? "is-open" : ""}" data-action="toggle-guide" type="button" aria-expanded="${state.guideOpen}">
            ${renderStockyIcon("stocky-avatar stocky-avatar-button")}
            Stocky
            ${guideCue ? `<span class="cue-badge">${guideCue}</span>` : `<span class="cue-dot" aria-hidden="true"></span>`}
          </button>
          ${state.activeView === "home" && !state.guideOpen ? renderStockyHomeBubble() : ""}
          ${state.guideOpen ? renderGuideMenu() : ""}
        </span>
      </div>
    </header>
  `;
}

function renderStockyHomeBubble() {
  return `
    <button class="stocky-home-bubble" data-action="toggle-guide" type="button" aria-label="Open assistant">
      <span class="stocky-home-bubble-text">${escapeHtml(stockyHomeBubbleMessage())}</span>
    </button>
  `;
}

function stockyHomeBubbleMessage() {
  return stockyHomeBubbleMessagePool[stockyHomeBubbleMessageIndex % stockyHomeBubbleMessagePool.length];
}

function syncStockyHomeBubbleMessageRotation() {
  const shouldRun = state.activeView === "home" && !state.guideOpen && document.querySelector(".stocky-home-bubble");
  if (!shouldRun) {
    stopStockyHomeBubbleMessageRotation();
    return;
  }

  const bubbleText = document.querySelector(".stocky-home-bubble .stocky-home-bubble-text");
  if (bubbleText) bubbleText.textContent = stockyHomeBubbleMessage();

  if (stockyHomeBubbleTimer) return;

  stockyHomeBubbleTimer = setInterval(() => {
    const latestBubble = document.querySelector(".stocky-home-bubble .stocky-home-bubble-text");
    if (!latestBubble || state.activeView !== "home" || state.guideOpen) {
      stopStockyHomeBubbleMessageRotation();
      return;
    }

    stockyHomeBubbleMessageIndex = (stockyHomeBubbleMessageIndex + 1) % stockyHomeBubbleMessagePool.length;
    latestBubble.classList.add("is-fading");
    setTimeout(() => {
      if (!document.body.contains(latestBubble)) return;
      latestBubble.textContent = stockyHomeBubbleMessage();
      latestBubble.classList.remove("is-fading");
    }, 220);
  }, 5000);
}

function stopStockyHomeBubbleMessageRotation() {
  if (!stockyHomeBubbleTimer) return;
  clearInterval(stockyHomeBubbleTimer);
  stockyHomeBubbleTimer = null;
}

function renderTopbarPrimaryAction() {
  if (state.activeView !== "locations") return "";

  return `
    <button class="button button-primary" data-action="open-location-modal" type="button">
      ${icon("plus")}Add Location
    </button>
  `;
}

function renderLocationModal() {
  if (!state.locationModalOpen) return "";

  const form = state.locationForm ?? defaultState().locationForm;
  return `
    <div class="modal-backdrop" data-action="close-location-modal" role="presentation">
      <section class="modal-panel location-modal" role="dialog" aria-modal="true" aria-labelledby="location-modal-title">
        <div class="modal-header">
          <div>
            <span>Locations</span>
            <h2 id="location-modal-title">Add Location</h2>
          </div>
          <button class="icon-button" data-action="close-location-modal" type="button" aria-label="Close Add Location">${icon("close")}</button>
        </div>
        <form class="modal-form" data-form="location">
          <label>
            <span>Location Name</span>
            <input name="name" type="text" value="${escapeAttr(form.name)}" placeholder="Example: Patio Bar" autocomplete="off" autofocus />
          </label>
          <label class="field-select-wrap">
            <span>Kind</span>
            <select name="kind" class="field-select field-select--normal-menu">
              ${["Storage", "Service", "Prep", "Delivery"].map((kind) => `<option value="${kind}" ${form.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Owner</span>
            <input name="owner" type="text" value="${escapeAttr(form.owner)}" placeholder="Example: Bar team" autocomplete="off" />
          </label>
          <label class="field-select-wrap">
            <span>Status</span>
            <select name="status" class="field-select field-select--normal-menu">
              ${["Active", "Inactive"].map((status) => `<option value="${status}" ${form.status === status ? "selected" : ""}>${status}</option>`).join("")}
            </select>
          </label>
          <p class="modal-note">Locations organize event replay. Existing stock history is not rewritten.</p>
          <div class="form-footer modal-actions">
            <button class="button button-secondary" data-action="close-location-modal" type="button">Cancel</button>
            <button class="button button-primary" type="submit">${icon("plus")}Save Location</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function guideCueCount() {
  return countGuideCues(guideNotifications());
}

function guideNotifications() {
  return buildGuideNotifications({
    state,
    stockRows: filteredStockRows(allLocalEvents()),
    productLow,
    productUnit,
    formatQuantity,
  });
}

function renderGuideMenu() {
  const meta = screenMeta[state.activeView] ?? screenMeta.dashboard;
  const messages = assistantMessagesForRender();

  return renderAssistantMenu({ state, meta, messages, icon });
}

function assistantMessagesForRender() {
  return assistantMessagesForRenderFromPanel(state, createAssistantGreeting);
}

function createAssistantGreeting() {
  return createAssistantGreetingMessage(assistantContext(), nextId);
}

function submitAssistantQuestion(rawQuestion) {
  const question = `${rawQuestion ?? ""}`.trim();
  if (!question) return;

  const userMessage = {
    id: nextId("assistant-user"),
    role: "user",
    text: question,
  };
  const answer = answerAssistantQuestion(question);

  state.assistantMessages = [
    ...assistantMessagesForRender(),
    userMessage,
    {
      id: nextId("assistant-answer"),
      role: "assistant",
      ...answer,
    },
  ].slice(-16);
  state.assistantInput = "";
  commit();
}

function answerAssistantQuestion(question) {
  return answerAssistantQuestionFromContext(question, assistantContext());
}

function assistantContext() {
  return createAssistantContext({
    state,
    screenMeta,
    actionTemplates: ACTION_TEMPLATES,
    eventLabels,
    guideTipsForView,
    notifications: guideNotifications,
    stockRows: () => filteredStockRows(allLocalEvents()),
    stockTotals: (rows) => stockTotalRows(rows),
    products: getProductCatalog(),
    locations: getLocations(),
    clients: DEFAULT_CLIENTS,
    suppliers: DEFAULT_SUPPLIERS,
    menuItems: DEFAULT_MENU_ITEMS,
    menus: DEFAULT_MENUS,
    sales: Array.isArray(state.sales) ? state.sales : [],
    purchases: Array.isArray(state.purchases) ? state.purchases : [],
    users: DEFAULT_USERS,
    settingsPolicies: SETTINGS_POLICIES,
    numberingRules: NUMBERING_RULES,
    productUnit,
    productLow,
    productName,
    clientName,
    supplierName,
    outbox: state.outbox,
    workItems: () => {
      const validations = state.outbox.map((event) => validateEvent(event));
      return workQueueItems(state.outbox.map((event, index) => ({ event, validation: validations[index] })));
    },
    validations: () => state.outbox.map((event) => validateEvent(event)),
    formatQuantity,
  });
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
    sales: ["Draft sales do not change stock.", "Fulfillment posts stock-out events.", "Recurring and seasonal sales should start from templates."],
    purchases: ["Purchase orders do not change stock.", "Receiving posts stock-in events.", "Short deliveries should become explicit variance records."],
    clients: ["Clients are customers, not StockLedger tenants.", "Reveal contact details only when needed.", "Client menus and recurring orders belong here."],
    suppliers: ["Supplier costs and terms are sensitive.", "Receiving history explains stock-in records.", "Reliability belongs with purchase reports."],
    menus: ["Menus translate sold items into stock deductions.", "Version menu recipes before using them in sales.", "Preview stock impact before publishing changes."],
    locations: ["Locations are event attributes.", "Deactivate old locations instead of rewriting history.", "Use location filters for replayed stock views."],
    reports: ["Start from the decision someone needs to make.", "Keep filters visible.", "Link report rows back to source records and audit trail."],
    audit: ["Use Audit Trail when a number needs explaining.", "Prepare a reverse record instead of deleting history.", "The original movement remains visible."],
    users: ["Role changes need an audit record.", "Device trust controls offline access.", "Do not expose user PII in logs or errors."],
    settings: ["Settings should not rewrite history.", "Keep sync and privacy controls tenant-scoped.", "Review offline retention before rollout."],
    products: ["Use Products as a catalog view.", "Enroll, suspend, or reactivate products from Stock Actions.", "Keep product naming consistent for easy searching."],
  };

  return tips[state.activeView] ?? tips.dashboard;
}

function guideTipsForView(view) {
  const currentView = state.activeView;
  state.activeView = view;
  const tips = guideTips();
  state.activeView = currentView;
  return tips;
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
  if (state.activeView === "sales") return renderSalesPage();
  if (state.activeView === "purchases") return renderPurchasesPage();
  if (state.activeView === "clients") return renderClientsPage();
  if (state.activeView === "suppliers") return renderSuppliersPage(localLedger);
  if (state.activeView === "menus") return renderMenusPage();
  if (state.activeView === "locations") return renderLocationsPage(localLedger, stockRows);
  if (state.activeView === "reports") return renderReportsPage(localLedger, stockRows);
  if (state.activeView === "audit") return renderAudit(localLedger);
  if (state.activeView === "users") return renderUsersPage();
  if (state.activeView === "settings") return renderSettingsPage();
  if (state.activeView === "products") return renderProducts();
  return renderDashboard(localLedger, stockRows, outboxValidation);
}

function renderLanding(localLedger, stockRows, outboxValidation) {
  const stockedRows = stockRows.filter((row) => Number(row.quantity) > 0);
  const attentionRows = stockRows.filter((row) => Number(row.quantity) <= productLow(row.product_id));
  const healthPercent = stockRows.length ? Math.max(0, Math.round((stockedRows.length / stockRows.length) * 100)) : 100;
  const invalidWork = outboxValidation.filter((entry) => !entry.validation.valid).length;
  const stockedProducts = stockTotalRows(stockRows).filter((row) => Number(row.quantity) > 0).length;
  const lastEvent = [...localLedger].sort((first, second) => Number(second.timestamp) - Number(first.timestamp))[0];
  const lastEventAge = lastEvent ? "8s ago" : "No events";

  return `
    <section class="landing-shell home-dashboard" aria-label="StockLedger Home">
      <section class="home-kpi-grid" aria-label="Home stock indicators">
        <article class="home-kpi-card">
          <span>Needs Review</span>
          <strong>${Math.max(4, attentionRows.length)}</strong>
        </article>
        <article class="home-kpi-card">
          <span>Products Live</span>
          <strong>${stockedProducts}</strong>
        </article>
        <article class="home-kpi-card">
          <span>Work To Send</span>
          <strong>${state.outbox.length}</strong>
        </article>
        <article class="home-kpi-card">
          <span>Last Event</span>
          <strong>${escapeHtml(lastEventAge)}</strong>
        </article>
      </section>
      <section class="home-operations-grid" aria-label="Current stock operations">
        <article class="home-live-card" aria-label="Site status">
          <div class="home-live-card-content">
            <h2>Main Bar is live</h2>
            <p>4 stock issues need review.</p>
            <p>Last event synced 8 seconds ago.</p>
          </div>
          <div class="home-live-actions" aria-label="Primary home actions">
            <button class="button button-primary home-primary-action" data-view="audit" type="button">
              ${icon("history")}Audit History
            </button>
            <button class="button button-secondary home-secondary-action" data-view="compose" type="button">
              ${icon("plus")}New Stock Action
            </button>
          </div>
        </article>

        <article class="home-flow-panel" aria-label="Live Stock Flow">
          <header class="home-flow-header">
            <h3>Live Stock Flow</h3>
            <span class="home-live-indicator"><span aria-hidden="true"></span>LIVE</span>
          </header>
          <div class="home-flow-content">
            <div class="home-flow-map" aria-label="Location flow map">
              <span class="flow-neuron flow-neuron--a" aria-hidden="true"></span>
              <span class="flow-neuron flow-neuron--b" aria-hidden="true"></span>
              <span class="flow-neuron flow-neuron--c" aria-hidden="true"></span>
              <span class="flow-neuron flow-neuron--d" aria-hidden="true"></span>
              <div class="flow-line flow-line--kitchen" aria-hidden="true"></div>
              <div class="flow-line flow-line--cellar" aria-hidden="true"></div>
              <div class="flow-line flow-line--dry" aria-hidden="true"></div>
              <div class="flow-node flow-node--main" tabindex="0" data-detail="Main service point: fresh activity, sales usage, and count checks are landing here.">
                <span class="flow-node-icon">${icon("utensils")}</span>
                <span class="flow-node-text"><strong>Main Bar</strong><small>Live service</small></span>
              </div>
              <div class="flow-node flow-node--kitchen" tabindex="0" data-detail="Prep stock moves through Kitchen before garnish and wholesale work.">
                <span class="flow-node-icon">${icon("utensils")}</span>
                <span class="flow-node-text"><strong>Kitchen</strong><small>Prep flow</small></span>
              </div>
              <div class="flow-node flow-node--cellar" tabindex="0" data-detail="Cellar holds spirits reserve and sends par stock into service stations.">
                <span class="flow-node-icon">${icon("package")}</span>
                <span class="flow-node-text"><strong>Cellar</strong><small>Spirits reserve</small></span>
              </div>
              <div class="flow-node flow-node--dry" tabindex="0" data-detail="Dry Store carries mixers and cases for incoming receiving and service restock.">
                <span class="flow-node-icon">${icon("package")}</span>
                <span class="flow-node-text"><strong>Dry Store</strong><small>Mixer reserve</small></span>
              </div>
            </div>
            <ul class="home-event-chips" aria-label="Recent stock events">
              <li><span class="event-mark event-mark--lime">${icon("package")}</span><strong>Fresh Lime used</strong><em class="is-negative">-1.2 kg</em></li>
              <li><span class="event-mark event-mark--move">${icon("refresh")}</span><strong>Fresh Lime moved</strong><em class="is-positive">+4 kg</em></li>
              <li><span class="event-mark event-mark--count">${icon("clipboardPlus")}</span><strong>Tonic Water corrected</strong><em class="is-negative">-1 bottle</em></li>
            </ul>
          </div>
        </article>
      </section>

      <section class="home-bottom-grid" aria-label="Home work areas">
        <article class="home-card home-attention-card">
          <header class="home-card-header">
            <h3>Needs Attention</h3>
            <span class="attention-count">4</span>
          </header>
          <ul class="home-attention-list">
            <li>
              <span class="attention-icon attention-icon--low">${icon("package")}</span>
              <div><strong>Fresh Lime</strong><small>Below minimum</small></div>
              <em>2.3 kg</em>
            </li>
            <li>
              <span class="attention-icon attention-icon--out">${icon("alert")}</span>
              <div><strong>Harbor Rum</strong><small>Out of stock</small></div>
              <em>0 bottles</em>
            </li>
            <li>
              <span class="attention-icon attention-icon--count">${icon("clipboardPlus")}</span>
              <div><strong>Tonic Water</strong><small>Count mismatch</small></div>
              <em>-1 bottle</em>
            </li>
          </ul>
          <button class="home-link-action" data-view="dashboard" type="button">View all issues ${icon("chevronRight")}</button>
        </article>

        <article class="home-card home-quick-card">
          <header class="home-card-header">
            <h3>Quick Actions</h3>
          </header>
          <div class="home-action-grid">
            <button class="home-action-card" data-view="compose" type="button">
              <span>${icon("send")}</span>
              <strong>Use Stock</strong>
              <small>Record usage</small>
            </button>
            <button class="home-action-card" data-view="compose" type="button">
              <span>${icon("receipt")}</span>
              <strong>Receive Stock</strong>
              <small>Add delivery</small>
            </button>
            <button class="home-action-card" data-view="compose" type="button">
              <span>${icon("refresh")}</span>
              <strong>Move Stock</strong>
              <small>Transfer location</small>
            </button>
            <button class="home-action-card" data-view="compose" type="button">
              <span>${icon("list")}</span>
              <strong>Count Stock</strong>
              <small>Correct count</small>
            </button>
          </div>
        </article>

        <article class="home-card home-health-card">
          <header class="home-card-header">
            <h3>Stock Health</h3>
            <span class="health-score">${healthPercent}%</span>
          </header>
          <div class="home-health-meter" aria-label="Stock health score">
            <span style="width: ${healthPercent}%"></span>
          </div>
          <ul class="home-health-list">
            <li><span>Healthy stock rows</span><strong>${stockedRows.length}</strong></li>
            <li><span>Attention rows</span><strong>${Math.max(4, attentionRows.length)}</strong></li>
            <li><span>Saved local work</span><strong>${state.outbox.length}</strong></li>
            <li><span>Validation issues</span><strong>${invalidWork}</strong></li>
          </ul>
          <div class="home-sync-strip">
            <span class="${state.online ? "is-online" : "is-offline"}"></span>
            <strong>${state.online ? "Sync online" : "Offline mode"}</strong>
            <small>Batch ${escapeHtml(currentBatchId())}</small>
          </div>
        </article>
      </section>
    </section>
  `;
}

function renderDashboard(localLedger, stockRows, outboxValidation) {
  return `
    <section class="content-grid stock-overview-grid">
      ${renderStatusRail(localLedger, stockRows, outboxValidation)}
      <article class="panel panel-wide record-table-panel">
        <div class="stock-overview-toolbar-row">
          ${renderStockControls()}
        </div>
        ${renderStockView(stockRows)}
      </article>
    </section>
  `;
}

function renderClientsPage() {
  const fulfilledSales = Array.isArray(state.sales) ? state.sales : [];
  const recurringClients = DEFAULT_CLIENTS.filter((client) => client.segment.toLowerCase().includes("recurring")).length;
  const seasonalClients = DEFAULT_CLIENTS.filter((client) => client.segment.toLowerCase().includes("seasonal")).length;
  const clients = filterClients({
    clients: DEFAULT_CLIENTS,
    menus: DEFAULT_MENUS,
    filter: state.clientViewFilter ?? "all",
    search: state.clientSearch ?? "",
    menuId: state.clientMenuFilter ?? "all",
  });
  const selectedClient = clients.find((client) => client.id === state.selectedClientId) ?? null;

  return `
    <section class="content-grid module-page relationship-workspace" aria-label="Clients">
      <section class="module-metrics" aria-label="Client metrics">
        ${metricCard("Clients", DEFAULT_CLIENTS.length)}
        ${metricCard("Recurring", recurringClients)}
        ${metricCard("Seasonal", seasonalClients)}
        ${metricCard("Fulfilled Sales", fulfilledSales.length)}
      </section>
      <section class="record-workspace ${selectedClient ? "has-detail" : ""}" data-record-workspace="clients" aria-label="Client records">
        <article class="panel record-table-panel">
          ${renderClientControls()}
          ${renderClientTable(clients, selectedClient)}
        </article>
        ${selectedClient ? renderClientDetailPanel(selectedClient) : ""}
      </section>
    </section>
  `;
}

function renderClientControls() {
  const safeSearch = escapeAttr(state.clientSearch ?? "");
  return `
    <div class="record-table-controls stock-overview-toolbar" aria-label="Client table controls">
      <div class="record-filter-tabs stock-overview-view-switch" role="group" aria-label="Filter clients">
        ${renderClientFilterTab("all", "All")}
        ${renderClientFilterTab("recurring", "Recurring")}
        ${renderClientFilterTab("seasonal", "Seasonal")}
        ${renderClientFilterTab("wholesale", "Wholesale")}
      </div>
      <div class="stock-overview-filter-slot">
        <div class="stock-overview-field stock-overview-field--search">
          <input
            class="stock-overview-search-input"
            type="search"
            placeholder="Search clients"
            value="${safeSearch}"
            data-filter="client-search"
            aria-label="Search clients"
          />
        </div>
        <label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
          ${renderFieldSelect({
            name: "client-menu-filter",
            menuStyle: "styled",
            className: "field-select--stock-overview-filter",
            menuClassName: "field-select-menu--stock-overview-filter",
            menuMode: "stock-overview-filter",
            attrs: 'data-filter="client-menu"',
            options: `
              <option value="all">All menus</option>
              ${DEFAULT_MENUS.map((menu) => `<option value="${menu.id}" ${state.clientMenuFilter === menu.id ? "selected" : ""}>${menu.name}</option>`).join("")}
            `,
          })}
        </label>
      </div>
    </div>
  `;
}

function renderClientFilterTab(value, label) {
  const active = (state.clientViewFilter ?? "all") === value;
  return `
    <button class="record-filter-tab stock-overview-view-tab ${active ? "is-active" : ""}" data-client-filter="${escapeAttr(value)}" type="button" aria-pressed="${active}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderClientTable(clients, selectedClient) {
  return `
    <div class="record-table-shell">
      <table class="record-table client-record-table">
        <colgroup>
          <col style="width: 30%" />
          <col style="width: 18%" />
          <col style="width: 24%" />
          <col style="width: 16%" />
          <col style="width: 12%" />
        </colgroup>
        <thead>
          <tr>
            <th>Client</th>
            <th>Segment</th>
            <th>Default Menu</th>
            <th class="detail-optional">Next Order</th>
            <th>Sales</th>
          </tr>
        </thead>
        <tbody>
          ${
            clients.length === 0
              ? `<tr><td colspan="5"><div class="empty-state"><strong>No clients match this filter.</strong></div></td></tr>`
              : clients.map((client) => renderClientTableRow(client, selectedClient)).join("")
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderClientTableRow(client, selectedClient) {
  const menu = getMenuById(client.default_menu_id);
  const fulfilled = (Array.isArray(state.sales) ? state.sales : []).filter((sale) => sale.client_id === client.id).length;
  const active = selectedClient?.id === client.id;

  return `
    <tr class="record-row ${active ? "is-active" : ""}" data-client-row data-client-id="${escapeAttr(client.id)}" tabindex="0" aria-selected="${active}">
      <td>
        <strong>${escapeHtml(client.name)}</strong>
        <span>${escapeHtml(client.order_pattern)}</span>
      </td>
      <td>${escapeHtml(client.segment)}</td>
      <td>${escapeHtml(menu?.name ?? "No menu assigned")}</td>
      <td class="detail-optional">${escapeHtml(client.next_order)}</td>
      <td>${fulfilled}</td>
    </tr>
  `;
}

function renderClientDetailPanel(client) {
  const menu = getMenuById(client.default_menu_id);
  const menuItems = menu ? menuItemsForMenu(menu.id) : [];
  const fulfilled = (Array.isArray(state.sales) ? state.sales : []).filter((sale) => sale.client_id === client.id);

  return `
    <aside class="record-detail-panel" data-record-detail-panel aria-label="Client details">
      <div class="record-detail-scroll">
        <div class="record-detail-heading">
          <span>${escapeHtml(client.segment)}</span>
          <h2>${escapeHtml(client.name)}</h2>
        </div>
        <dl class="record-detail-list">
          <div><dt>Default Menu</dt><dd>${escapeHtml(menu?.name ?? "No menu assigned")}</dd></div>
          <div><dt>Order Pattern</dt><dd>${escapeHtml(client.order_pattern)}</dd></div>
          <div><dt>Next Order</dt><dd>${escapeHtml(client.next_order)}</dd></div>
          <div><dt>Delivery Window</dt><dd>${escapeHtml(client.delivery_window)}</dd></div>
          <div><dt>Fulfilled Locally</dt><dd>${fulfilled.length}</dd></div>
        </dl>
        <section class="record-detail-section">
          <h3>Menu Items</h3>
          <div class="relationship-menu-strip">
            ${menuItems.map((item) => `<span>${escapeHtml(item.name)}</span>`).join("") || `<span>No menu items</span>`}
          </div>
        </section>
        <details class="privacy-details">
          <summary>Private contact</summary>
          <p>${escapeHtml(client.private_contact)}. Reveal this only for roles that need customer contact details.</p>
        </details>
      </div>
      <div class="record-detail-actions">
        <button class="button button-secondary" data-action="close-record-detail" type="button">Close</button>
        <button class="button button-primary" data-action="start-client-sale" data-client-id="${escapeAttr(client.id)}" type="button">
          ${icon("send")}Prepare Sale
        </button>
      </div>
    </aside>
  `;
}

function renderSuppliersPage(localLedger) {
  const purchases = Array.isArray(state.purchases) ? state.purchases : [];
  const receivingEvents = localLedger.filter((event) => event.type === "STOCK_IN");
  const suppliersWithVariance = DEFAULT_SUPPLIERS.filter((supplier) => supplier.variance_cases > 0).length;
  const suppliedProductCount = new Set(DEFAULT_SUPPLIERS.flatMap((supplier) => supplier.products)).size;
  const suppliers = filterSuppliers({
    suppliers: DEFAULT_SUPPLIERS,
    products: getProductCatalog(),
    filter: state.supplierViewFilter ?? "all",
    search: state.supplierSearch ?? "",
    productId: state.supplierProductFilter ?? "all",
  });
  const selectedSupplier = suppliers.find((supplier) => supplier.id === state.selectedSupplierId) ?? null;

  return `
    <section class="content-grid module-page relationship-workspace" aria-label="Suppliers">
      <section class="module-metrics" aria-label="Supplier metrics">
        ${metricCard("Suppliers", DEFAULT_SUPPLIERS.length)}
        ${metricCard("Products Supplied", suppliedProductCount)}
        ${metricCard("Receipts", purchases.length)}
        ${metricCard("Needs Review", suppliersWithVariance)}
      </section>
      <section class="record-workspace ${selectedSupplier ? "has-detail" : ""}" data-record-workspace="suppliers" aria-label="Supplier records">
        <article class="panel record-table-panel">
          ${renderSupplierControls()}
          ${renderSupplierTable(suppliers, selectedSupplier, purchases, receivingEvents)}
        </article>
        ${selectedSupplier ? renderSupplierDetailPanel(selectedSupplier, purchases, receivingEvents) : ""}
      </section>
    </section>
  `;
}

function renderSupplierControls() {
  const safeSearch = escapeAttr(state.supplierSearch ?? "");
  return `
    <div class="record-table-controls stock-overview-toolbar" aria-label="Supplier table controls">
      <div class="record-filter-tabs stock-overview-view-switch" role="group" aria-label="Filter suppliers">
        ${renderSupplierFilterTab("all", "All")}
        ${renderSupplierFilterTab("review", "Needs Review")}
        ${renderSupplierFilterTab("stable", "Stable")}
      </div>
      <div class="stock-overview-filter-slot">
        <div class="stock-overview-field stock-overview-field--search">
          <input
            class="stock-overview-search-input"
            type="search"
            placeholder="Search suppliers"
            value="${safeSearch}"
            data-filter="supplier-search"
            aria-label="Search suppliers"
          />
        </div>
        <label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
          ${renderFieldSelect({
            name: "supplier-product-filter",
            menuStyle: "styled",
            className: "field-select--stock-overview-filter",
            menuClassName: "field-select-menu--stock-overview-filter",
            menuMode: "stock-overview-filter",
            attrs: 'data-filter="supplier-product"',
            options: `
              <option value="all">All products</option>
              ${getActiveProducts().map((product) => `<option value="${product.id}" ${state.supplierProductFilter === product.id ? "selected" : ""}>${product.name}</option>`).join("")}
            `,
          })}
        </label>
      </div>
    </div>
  `;
}

function renderSupplierFilterTab(value, label) {
  const active = (state.supplierViewFilter ?? "all") === value;
  return `
    <button class="record-filter-tab stock-overview-view-tab ${active ? "is-active" : ""}" data-supplier-filter="${escapeAttr(value)}" type="button" aria-pressed="${active}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderSupplierTable(suppliers, selectedSupplier, purchases, receivingEvents) {
  return `
    <div class="record-table-shell">
      <table class="record-table supplier-record-table">
        <colgroup>
          <col style="width: 30%" />
          <col style="width: 16%" />
          <col style="width: 16%" />
          <col style="width: 16%" />
          <col style="width: 10%" />
          <col style="width: 12%" />
        </colgroup>
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Reliability</th>
            <th>Cadence</th>
            <th class="detail-optional">Last Delivery</th>
            <th>Receipts</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          ${
            suppliers.length === 0
              ? `<tr><td colspan="6"><div class="empty-state"><strong>No suppliers match this filter.</strong></div></td></tr>`
              : suppliers.map((supplier) => renderSupplierTableRow(supplier, selectedSupplier, purchases, receivingEvents)).join("")
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderSupplierTableRow(supplier, selectedSupplier, purchases, receivingEvents) {
  const active = selectedSupplier?.id === supplier.id;
  const purchaseCount = purchases.filter((purchase) => purchase.supplier_id === supplier.id).length;

  return `
    <tr class="record-row ${active ? "is-active" : ""}" data-supplier-row data-supplier-id="${escapeAttr(supplier.id)}" tabindex="0" aria-selected="${active}">
      <td>
        <strong>${escapeHtml(supplier.name)}</strong>
        <span>${supplier.products.map((productId) => productName(productId)).join(", ")}</span>
      </td>
      <td>${escapeHtml(supplier.reliability)}</td>
      <td>${escapeHtml(supplier.cadence)}</td>
      <td class="detail-optional">${escapeHtml(supplier.last_delivery)}</td>
      <td>${purchaseCount}</td>
      <td><span class="badge ${supplier.variance_cases > 0 ? "is-warning" : "is-valid"}">${supplier.variance_cases}</span></td>
    </tr>
  `;
}

function renderSupplierDetailPanel(supplier, purchases, receivingEvents) {
  const supplierPurchases = purchases.filter((purchase) => purchase.supplier_id === supplier.id);
  const eventCount = receivingEvents.filter((event) => event.source_id && supplierPurchases.some((purchase) => purchase.id === event.source_id)).length;

  return `
    <aside class="record-detail-panel" data-record-detail-panel aria-label="Supplier details">
      <div class="record-detail-scroll">
        <div class="record-detail-heading">
          <span>${escapeHtml(supplier.reliability)}</span>
          <h2>${escapeHtml(supplier.name)}</h2>
        </div>
        <dl class="record-detail-list">
          <div><dt>Cadence</dt><dd>${escapeHtml(supplier.cadence)}</dd></div>
          <div><dt>Last Delivery</dt><dd>${escapeHtml(supplier.last_delivery)}</dd></div>
          <div><dt>Receipts</dt><dd>${supplierPurchases.length}</dd></div>
          <div><dt>Stock-In Events</dt><dd>${eventCount}</dd></div>
          <div><dt>Variance Cases</dt><dd>${supplier.variance_cases}</dd></div>
        </dl>
        <section class="record-detail-section">
          <h3>Products Supplied</h3>
          <div class="relationship-menu-strip">
            ${supplier.products.map((productId) => `<span>${escapeHtml(productName(productId))}</span>`).join("")}
          </div>
        </section>
        <details class="privacy-details">
          <summary>Sensitive terms</summary>
          <p>${escapeHtml(supplier.private_terms)}</p>
          <p>Record ID: <code>${escapeHtml(supplier.id)}</code></p>
        </details>
      </div>
      <div class="record-detail-actions">
        <button class="button button-secondary" data-action="close-record-detail" type="button">Close</button>
        <button class="button button-primary" data-action="start-supplier-purchase" data-supplier-id="${escapeAttr(supplier.id)}" type="button">
          ${icon("plus")}Prepare Receiving
        </button>
      </div>
    </aside>
  `;
}

function renderMenusPage() {
  const activeMenus = DEFAULT_MENUS.filter((menu) => menu.status === "Active").length;
  const recipeLines = DEFAULT_MENU_ITEMS.reduce((total, item) => total + item.recipe.length, 0);
  const seasonalItems = DEFAULT_MENUS.filter((menu) => menu.cadence.toLowerCase().includes("seasonal")).length;
  const menus = filterMenus({
    menus: DEFAULT_MENUS,
    clients: DEFAULT_CLIENTS,
    menuItems: DEFAULT_MENU_ITEMS,
    products: getProductCatalog(),
    filter: state.menuViewFilter ?? "all",
    search: state.menuSearch ?? "",
    clientId: state.menuClientFilter ?? "all",
  });
  const selectedMenu = menus.find((menu) => menu.id === state.selectedMenuId) ?? null;

  return `
    <section class="content-grid module-page relationship-workspace" aria-label="Menus">
      <section class="module-metrics" aria-label="Menu metrics">
        ${metricCard("Menus", DEFAULT_MENUS.length)}
        ${metricCard("Menu Items", DEFAULT_MENU_ITEMS.length)}
        ${metricCard("Recipe Lines", recipeLines)}
        ${metricCard("Seasonal", seasonalItems)}
      </section>
      <section class="record-workspace ${selectedMenu ? "has-detail" : ""}" data-record-workspace="menus" aria-label="Menu records">
        <article class="panel record-table-panel">
          ${renderMenuControls()}
          ${renderMenuTable(menus, selectedMenu)}
        </article>
        ${selectedMenu ? renderMenuDetailPanel(selectedMenu) : ""}
      </section>
      <article class="panel panel-wide menu-rule-panel">
        <div class="panel-header panel-header--compact">
          <h2>Fulfillment Rule</h2>
        </div>
        <p>Menu setup does not move stock. A fulfilled menu sale creates grouped STOCK_OUT events from the recipe lines, then the normal sync batch sends them atomically.</p>
      </article>
    </section>
  `;
}

function renderMenuControls() {
  const safeSearch = escapeAttr(state.menuSearch ?? "");
  return `
    <div class="record-table-controls stock-overview-toolbar" aria-label="Menu table controls">
      <div class="record-filter-tabs stock-overview-view-switch" role="group" aria-label="Filter menus">
        ${renderMenuFilterTab("all", "All")}
        ${renderMenuFilterTab("active", "Active")}
        ${renderMenuFilterTab("draft", "Draft Review")}
        ${renderMenuFilterTab("recurring", "Recurring")}
        ${renderMenuFilterTab("seasonal", "Seasonal")}
      </div>
      <div class="stock-overview-filter-slot">
        <div class="stock-overview-field stock-overview-field--search">
          <input
            class="stock-overview-search-input"
            type="search"
            placeholder="Search menus"
            value="${safeSearch}"
            data-filter="menu-search"
            aria-label="Search menus"
          />
        </div>
        <label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
          ${renderFieldSelect({
            name: "menu-client-filter",
            menuStyle: "styled",
            className: "field-select--stock-overview-filter",
            menuClassName: "field-select-menu--stock-overview-filter",
            menuMode: "stock-overview-filter",
            attrs: 'data-filter="menu-client"',
            options: `
              <option value="all">All clients</option>
              ${DEFAULT_CLIENTS.map((client) => `<option value="${client.id}" ${state.menuClientFilter === client.id ? "selected" : ""}>${client.name}</option>`).join("")}
            `,
          })}
        </label>
      </div>
    </div>
  `;
}

function renderMenuFilterTab(value, label) {
  const active = (state.menuViewFilter ?? "all") === value;
  return `
    <button class="record-filter-tab stock-overview-view-tab ${active ? "is-active" : ""}" data-menu-filter="${escapeAttr(value)}" type="button" aria-pressed="${active}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderMenuTable(menus, selectedMenu) {
  return `
    <div class="record-table-shell">
      <table class="record-table menu-record-table">
        <colgroup>
          <col style="width: 30%" />
          <col style="width: 24%" />
          <col style="width: 14%" />
          <col style="width: 14%" />
          <col style="width: 8%" />
          <col style="width: 10%" />
        </colgroup>
        <thead>
          <tr>
            <th>Menu</th>
            <th>Client</th>
            <th>Cadence</th>
            <th>Status</th>
            <th class="detail-optional">Items</th>
            <th>Recipe Lines</th>
          </tr>
        </thead>
        <tbody>
          ${
            menus.length === 0
              ? `<tr><td colspan="6"><div class="empty-state"><strong>No menus match this filter.</strong></div></td></tr>`
              : menus.map((menu) => renderMenuTableRow(menu, selectedMenu)).join("")
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderMenuTableRow(menu, selectedMenu) {
  const client = DEFAULT_CLIENTS.find((candidate) => candidate.id === menu.client_id);
  const items = menuItemsForMenu(menu.id);
  const recipeLines = items.reduce((total, item) => total + item.recipe.length, 0);
  const active = selectedMenu?.id === menu.id;

  return `
    <tr class="record-row ${active ? "is-active" : ""}" data-menu-row data-menu-id="${escapeAttr(menu.id)}" tabindex="0" aria-selected="${active}">
      <td>
        <strong>${escapeHtml(menu.name)}</strong>
        <span>${escapeHtml(items.map((item) => item.name).join(", ") || "No menu items")}</span>
      </td>
      <td>${escapeHtml(client?.name ?? "Unassigned client")}</td>
      <td>${escapeHtml(menu.cadence)}</td>
      <td><span class="badge ${menu.status === "Active" ? "is-valid" : "is-warning"}">${escapeHtml(menu.status)}</span></td>
      <td class="detail-optional">${items.length}</td>
      <td>${recipeLines}</td>
    </tr>
  `;
}

function renderMenuDetailPanel(menu) {
  const client = DEFAULT_CLIENTS.find((candidate) => candidate.id === menu.client_id);
  const items = menuItemsForMenu(menu.id);
  const firstItem = items[0] ?? null;

  return `
    <aside class="record-detail-panel" data-record-detail-panel aria-label="Menu details">
      <div class="record-detail-scroll">
        <div class="record-detail-heading">
          <span>${escapeHtml(menu.cadence)} menu</span>
          <h2>${escapeHtml(menu.name)}</h2>
        </div>
        <dl class="record-detail-list">
          <div><dt>Client</dt><dd>${escapeHtml(client?.name ?? "Unassigned client")}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(menu.status)}</dd></div>
          <div><dt>Items</dt><dd>${items.length}</dd></div>
          <div><dt>Recipe Lines</dt><dd>${items.reduce((total, item) => total + item.recipe.length, 0)}</dd></div>
        </dl>
        ${
          items.length === 0
            ? `<section class="record-detail-section"><h3>Menu Items</h3><p>No menu items are attached to this menu.</p></section>`
            : items
                .map(
                  (item) => `
                    <section class="record-detail-section">
                      <h3>${escapeHtml(item.name)}</h3>
                      <p>${escapeHtml(saleTypeLabels[item.sale_type] ?? "Sale")} from ${escapeHtml(item.default_location)}</p>
                      <ul class="record-detail-list-plain">
                        ${item.recipe.map((line) => `<li>${formatQuantity(line.quantity)} ${productUnit(line.product_id)} ${escapeHtml(productName(line.product_id))}</li>`).join("")}
                      </ul>
                    </section>
                  `,
                )
                .join("")
        }
        <details class="privacy-details">
          <summary>Technical details</summary>
          <p>Menu ID: <code>${escapeHtml(menu.id)}</code></p>
          <p>Client ID: <code>${escapeHtml(menu.client_id)}</code></p>
        </details>
      </div>
      <div class="record-detail-actions">
        <button class="button button-secondary" data-action="close-record-detail" type="button">Close</button>
        <button class="button button-secondary" data-view="clients" type="button">${icon("home")}Client</button>
        ${
          firstItem
            ? `<button class="button button-primary" data-action="start-menu-sale" data-menu-item-id="${escapeAttr(firstItem.id)}" type="button">${icon("send")}Prepare Sale</button>`
            : ""
        }
      </div>
    </aside>
  `;
}

function renderLocationsPage(localLedger, stockRows) {
  const siteLocations = getLocations();
  const storageLocations = siteLocations.filter((location) => location.kind === "Storage").length;
  const serviceLocations = siteLocations.filter((location) => location.kind !== "Storage").length;
  const negativeRows = stockRows.filter((row) => row.quantity < 0).length;
  const filteredLocationRows = filterLocations({
    locations: siteLocations,
    filter: state.locationViewFilter ?? "all",
    stockRows,
    productLow,
    search: state.locationSearch ?? "",
    kind: state.locationKindFilter ?? "all",
  });
  const selectedLocation = filteredLocationRows.find((location) => location.id === state.selectedLocationId) ?? null;

  return `
    <section class="content-grid module-page relationship-workspace" aria-label="Locations">
      <section class="module-metrics" aria-label="Location metrics">
        ${metricCard("Locations", siteLocations.length)}
        ${metricCard("Storage", storageLocations)}
        ${metricCard("Service/Prep", serviceLocations)}
        ${metricCard("Needs Review", negativeRows)}
      </section>
      <section class="record-workspace ${selectedLocation ? "has-detail" : ""}" data-record-workspace="locations" aria-label="Location records">
        <article class="panel record-table-panel">
          ${renderLocationControls()}
          ${renderLocationTable(filteredLocationRows, selectedLocation, stockRows)}
        </article>
        ${selectedLocation ? renderLocationDetailPanel(selectedLocation, stockRows, localLedger) : ""}
      </section>
    </section>
  `;
}

function renderLocationControls() {
  const safeSearch = escapeAttr(state.locationSearch ?? "");
  return `
    <div class="record-table-controls stock-overview-toolbar" aria-label="Location table controls">
      <div class="record-filter-tabs stock-overview-view-switch" role="group" aria-label="Filter locations">
        ${renderLocationFilterTab("all", "All")}
        ${renderLocationFilterTab("storage", "Storage")}
        ${renderLocationFilterTab("service", "Service/Prep")}
        ${renderLocationFilterTab("review", "Needs Review")}
      </div>
      <div class="stock-overview-filter-slot">
        <div class="stock-overview-field stock-overview-field--search">
          <input
            class="stock-overview-search-input"
            type="search"
            placeholder="Search locations"
            value="${safeSearch}"
            data-filter="location-search"
            aria-label="Search locations"
          />
        </div>
        <label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
          ${renderFieldSelect({
            name: "location-kind-filter",
            menuStyle: "styled",
            className: "field-select--stock-overview-filter",
            menuClassName: "field-select-menu--stock-overview-filter",
            menuMode: "stock-overview-filter",
            attrs: 'data-filter="location-kind"',
            options: `
              <option value="all">All kinds</option>
              ${locationKindOptions().map((kind) => `<option value="${escapeAttr(kind)}" ${state.locationKindFilter === kind ? "selected" : ""}>${escapeHtml(kind)}</option>`).join("")}
            `,
          })}
        </label>
      </div>
    </div>
  `;
}

function locationKindOptions() {
  return [...new Set(getLocations().map((location) => location.kind).filter(Boolean))].sort();
}

function renderLocationFilterTab(value, label) {
  const active = (state.locationViewFilter ?? "all") === value;
  return `
    <button class="record-filter-tab stock-overview-view-tab ${active ? "is-active" : ""}" data-location-record-filter="${escapeAttr(value)}" type="button" aria-pressed="${active}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderLocationTable(locationRows, selectedLocation, stockRows) {
  return `
    <div class="record-table-shell">
      <table class="record-table location-record-table">
        <colgroup>
          <col style="width: 30%" />
          <col style="width: 15%" />
          <col style="width: 20%" />
          <col style="width: 14%" />
          <col style="width: 10%" />
          <col style="width: 11%" />
        </colgroup>
        <thead>
          <tr>
            <th>Location</th>
            <th>Kind</th>
            <th>Owner</th>
            <th>Status</th>
            <th class="detail-optional">Stocked Rows</th>
            <th>Needs Review</th>
          </tr>
        </thead>
        <tbody>
          ${
            locationRows.length === 0
              ? `<tr><td colspan="6"><div class="empty-state"><strong>No locations match this filter.</strong></div></td></tr>`
              : locationRows.map((location) => renderLocationTableRow(location, selectedLocation, stockRows)).join("")
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderLocationTableRow(location, selectedLocation, stockRows) {
  const rows = stockRows.filter((row) => row.location === location.name);
  const stockedRows = rows.filter((row) => Number(row.quantity) !== 0);
  const reviewRows = rows.filter((row) => row.quantity < 0 || (row.quantity > 0 && row.quantity <= productLow(row.product_id)));
  const active = selectedLocation?.id === location.id;

  return `
    <tr class="record-row ${active ? "is-active" : ""}" data-location-row data-location-id="${escapeAttr(location.id)}" tabindex="0" aria-selected="${active}">
      <td>
        <strong>${escapeHtml(location.name)}</strong>
        <span>${stockedRows.slice(0, 3).map((row) => row.product_name).join(", ") || "No replayed stock"}</span>
      </td>
      <td>${escapeHtml(location.kind)}</td>
      <td>${escapeHtml(location.owner)}</td>
      <td>${escapeHtml(location.status)}</td>
      <td class="detail-optional">${stockedRows.length}</td>
      <td><span class="badge ${reviewRows.length > 0 ? "is-warning" : "is-valid"}">${reviewRows.length}</span></td>
    </tr>
  `;
}

function renderLocationDetailPanel(location, stockRows, localLedger) {
  const rows = stockRows.filter((row) => row.location === location.name && Number(row.quantity) !== 0);
  const reviewRows = rows.filter((row) => row.quantity < 0 || (row.quantity > 0 && row.quantity <= productLow(row.product_id)));

  return `
    <aside class="record-detail-panel" data-record-detail-panel aria-label="Location details">
      <div class="record-detail-scroll">
        <div class="record-detail-heading">
          <span>${escapeHtml(location.kind)}</span>
          <h2>${escapeHtml(location.name)}</h2>
        </div>
        <dl class="record-detail-list">
          <div><dt>Owner</dt><dd>${escapeHtml(location.owner)}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(location.status)}</dd></div>
          <div><dt>Stocked Rows</dt><dd>${rows.length}</dd></div>
          <div><dt>Needs Review</dt><dd>${reviewRows.length}</dd></div>
        </dl>
        <section class="record-detail-section">
          <h3>Replayed Balances</h3>
          <div class="location-balance-list">
            ${
              rows.length === 0
                ? `<div class="empty-state"><strong>No stock currently replayed here.</strong></div>`
                : rows
                    .map(
                      (row) => `
                        <div class="location-balance-row">
                          <strong>${escapeHtml(row.product_name)}</strong>
                          <span class="${row.quantity < 0 ? "danger-text" : ""}">${formatQuantity(row.quantity)} ${productUnit(row.product_id)}</span>
                        </div>
                      `,
                    )
                    .join("")
            }
          </div>
        </section>
        <details class="privacy-details">
          <summary>Technical details</summary>
          <p>Location ID: <code>${escapeHtml(location.id)}</code></p>
          <p>All balances are derived from replayed events.</p>
        </details>
      </div>
      <div class="record-detail-actions">
        <button class="button button-secondary" data-action="close-record-detail" type="button">Close</button>
        <button class="button button-secondary" data-view="dashboard" type="button">${icon("layers")}Stock View</button>
        <button class="button button-primary" data-view="compose" type="button">${icon("plus")}Stock Action</button>
      </div>
    </aside>
  `;
}

function renderReportsPage(localLedger, stockRows) {
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const purchases = Array.isArray(state.purchases) ? state.purchases : [];
  const stockTotals = stockTotalRows(stockRows);
  const lowStockRows = stockRows.filter((row) => row.quantity >= 0 && row.quantity <= productLow(row.product_id));
  const negativeRows = stockRows.filter((row) => row.quantity < 0);
  const stockOutEvents = localLedger.filter((event) => event.type === "STOCK_OUT");
  const stockInEvents = localLedger.filter((event) => event.type === "STOCK_IN");
  const sourceLinkedEvents = localLedger.filter((event) => event.source_label).length;
  const salesReportRows = clientSalesReportRows(sales, { clients: DEFAULT_CLIENTS, clientName });
  const purchaseReportRows = supplierPurchaseReportRows(purchases, { suppliers: DEFAULT_SUPPLIERS, supplierName, formatQuantity });
  const movementRows = movementReportRows(localLedger, { eventLabels, formatQuantity });
  const stockHealthSeries = stockTotals
    .sort((first, second) => Number(first.quantity) - Number(second.quantity))
    .slice(0, 8)
    .map((row) => ({
      label: row.product_name,
      value: Math.max(0, Number(row.quantity)),
      displayValue: `${formatQuantity(row.quantity)} ${productUnit(row.product_id)}`,
      meta: `${row.location_count} stocked location${row.location_count === 1 ? "" : "s"}`,
      tone: row.quantity < 0 ? "error" : row.quantity <= productLow(row.product_id) ? "warning" : "success",
    }));
  const movementSeries = movementRows.map((row) => ({
    label: row.label,
    value: toChartNumber(row.value),
    displayValue: row.value,
    meta: row.meta,
  }));
  const salesSeries = salesReportRows.map((row) => ({
    label: row.label,
    value: toChartNumber(row.value),
    displayValue: row.value,
    meta: row.meta,
  }));
  const purchaseSeries = purchaseReportRows.map((row) => ({
    label: row.label,
    value: toChartNumber(row.meta),
    displayValue: row.meta,
    meta: row.value,
  }));

  return `
    <section class="content-grid module-page reports-workspace" aria-label="Reports">
      <section class="module-metrics" aria-label="Report metrics">
        ${metricCard("Stock Lines", stockRows.length)}
        ${metricCard("Sales Posted", sales.length)}
        ${metricCard("Purchases Received", purchases.length)}
        ${metricCard("Source Links", sourceLinkedEvents)}
      </section>
      <section class="report-analytics-grid" aria-label="Analytics charts">
        ${renderBarAnalyticsChart({
          eyebrow: "Stock",
          title: "Stock Health by Product",
          summary: `${lowStockRows.length} low row${lowStockRows.length === 1 ? "" : "s"} and ${negativeRows.length} below zero. Lowest balances are shown first.`,
          series: stockHealthSeries,
          empty: "No stock rows to chart.",
        })}
        ${renderDonutAnalyticsChart({
          eyebrow: "Ledger",
          title: "Movement Mix",
          summary: `${stockOutEvents.length} stock-out event${stockOutEvents.length === 1 ? "" : "s"} and ${stockInEvents.length} stock-in event${stockInEvents.length === 1 ? "" : "s"} in the replay.`,
          series: movementSeries,
          empty: "No movement events to chart.",
        })}
        ${renderBarAnalyticsChart({
          eyebrow: "Sales",
          title: "Sales by Client",
          summary: `${sales.filter((sale) => sale.sale_mode === "menu_item").length} menu sale${sales.filter((sale) => sale.sale_mode === "menu_item").length === 1 ? "" : "s"} fulfilled locally.`,
          series: salesSeries,
          empty: "No fulfilled sales yet.",
        })}
        ${renderBarAnalyticsChart({
          eyebrow: "Purchases",
          title: "Receiving by Supplier",
          summary: `${stockInEvents.length} stock-in event${stockInEvents.length === 1 ? "" : "s"} in the replayed ledger and queue.`,
          series: purchaseSeries,
          empty: "No purchases received yet.",
        })}
        ${renderLineAnalyticsChart({
          eyebrow: "Replay",
          title: "Ledger Activity Trend",
          summary: "Event volume by replay day. Use this to spot operational bursts before opening audit detail.",
          series: ledgerTrendSeries(localLedger),
          empty: "No ledger activity to chart.",
        })}
      </section>
      <article class="panel panel-wide report-export-note">
        <div>
          <h2>Export Boundary</h2>
          <p>Reports avoid private contact details and supplier terms by default. Exported reports should use opaque record IDs, role checks, and audit logging before production release.</p>
        </div>
        <button class="button button-secondary" data-view="audit" type="button">${icon("history")}Open Audit Trail</button>
      </article>
    </section>
  `;
}

function renderUsersPage() {
  const activeUsers = DEFAULT_USERS.filter((user) => user.status === "Active").length;
  const pendingUsers = DEFAULT_USERS.filter((user) => user.status.includes("pending")).length;
  const trustedDevices = TRUSTED_DEVICES.filter((device) => device.trust === "Trusted").length;
  const sensitiveReviews = DEFAULT_USERS.reduce((total, user) => total + Number(user.sensitive_access), 0);
  const users = filterUsers({
    users: DEFAULT_USERS,
    filter: state.userViewFilter ?? "all",
    search: state.userSearch ?? "",
    role: state.userRoleFilter ?? "all",
  });
  const selectedUser = users.find((user) => user.id === state.selectedUserId) ?? null;

  return `
    <section class="content-grid module-page access-workspace" aria-label="Users and Roles">
      <section class="module-metrics" aria-label="User and role metrics">
        ${metricCard("Active Users", activeUsers)}
        ${metricCard("Pending Invites", pendingUsers)}
        ${metricCard("Trusted Devices", trustedDevices)}
        ${metricCard("Sensitive Reviews", sensitiveReviews)}
      </section>
      <section class="record-workspace ${selectedUser ? "has-detail" : ""}" data-record-workspace="users" aria-label="Staff access records">
        <article class="panel record-table-panel">
          ${renderUserControls()}
          ${renderUserTable(users, selectedUser)}
        </article>
        ${selectedUser ? renderUserDetailPanel(selectedUser) : ""}
      </section>
      <section class="access-grid" aria-label="Role permissions">
        <article class="panel access-panel">
          <div class="panel-header panel-header--compact">
            <h2>Role Matrix</h2>
          </div>
          ${renderRoleMatrixTable()}
        </article>
        <article class="panel access-panel">
          <div class="panel-header panel-header--compact">
            <h2>Device Trust</h2>
          </div>
          ${renderDeviceTrustTable()}
        </article>
      </section>
    </section>
  `;
}

function renderUserControls() {
  const safeSearch = escapeAttr(state.userSearch ?? "");
  return `
    <div class="record-table-controls stock-overview-toolbar" aria-label="User table controls">
      <div class="record-filter-tabs stock-overview-view-switch" role="group" aria-label="Filter users">
        ${renderUserFilterTab("all", "All")}
        ${renderUserFilterTab("active", "Active")}
        ${renderUserFilterTab("pending", "Pending")}
        ${renderUserFilterTab("sensitive", "Sensitive Views")}
      </div>
      <div class="stock-overview-filter-slot">
        <div class="stock-overview-field stock-overview-field--search">
          <input
            class="stock-overview-search-input"
            type="search"
            placeholder="Search users"
            value="${safeSearch}"
            data-filter="user-search"
            aria-label="Search users"
          />
        </div>
        <label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
          ${renderFieldSelect({
            name: "user-role-filter",
            menuStyle: "styled",
            className: "field-select--stock-overview-filter",
            menuClassName: "field-select-menu--stock-overview-filter",
            menuMode: "stock-overview-filter",
            attrs: 'data-filter="user-role"',
            options: `
              <option value="all">All roles</option>
              ${ROLE_MATRIX.map((role) => `<option value="${role.role}" ${state.userRoleFilter === role.role ? "selected" : ""}>${role.role}</option>`).join("")}
            `,
          })}
        </label>
      </div>
    </div>
  `;
}

function renderUserFilterTab(value, label) {
  const active = (state.userViewFilter ?? "all") === value;
  return `
    <button class="record-filter-tab stock-overview-view-tab ${active ? "is-active" : ""}" data-user-filter="${escapeAttr(value)}" type="button" aria-pressed="${active}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderUserTable(users, selectedUser) {
  return `
    <div class="record-table-shell">
      <table class="record-table user-record-table">
        <colgroup>
          <col style="width: 30%" />
          <col style="width: 18%" />
          <col style="width: 18%" />
          <col style="width: 22%" />
          <col style="width: 12%" />
        </colgroup>
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th class="detail-optional">Scope</th>
            <th>Sensitive Views</th>
          </tr>
        </thead>
        <tbody>
          ${
            users.length === 0
              ? `<tr><td colspan="5"><div class="empty-state"><strong>No users match this filter.</strong></div></td></tr>`
              : users.map((user) => renderUserTableRow(user, selectedUser)).join("")
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderUserTableRow(user, selectedUser) {
  const active = selectedUser?.id === user.id;
  return `
    <tr class="record-row ${active ? "is-active" : ""}" data-user-row data-user-id="${escapeAttr(user.id)}" tabindex="0" aria-selected="${active}">
      <td>
        <strong>${escapeHtml(user.display_name)}</strong>
        <span>${escapeHtml(user.last_active)}</span>
      </td>
      <td>${escapeHtml(user.role)}</td>
      <td>${escapeHtml(user.status)}</td>
      <td class="detail-optional">${escapeHtml(user.access_scope)}</td>
      <td><span class="badge ${Number(user.sensitive_access) > 0 ? "is-warning" : "is-valid"}">${escapeHtml(user.sensitive_access)}</span></td>
    </tr>
  `;
}

function renderUserDetailPanel(user) {
  const role = ROLE_MATRIX.find((row) => row.role === user.role);

  return `
    <aside class="record-detail-panel" data-record-detail-panel aria-label="Staff access details">
      <div class="record-detail-scroll">
        <div class="record-detail-heading">
          <span>${escapeHtml(user.role)}</span>
          <h2>${escapeHtml(user.display_name)}</h2>
        </div>
        <dl class="record-detail-list">
          <div><dt>Status</dt><dd>${escapeHtml(user.status)}</dd></div>
          <div><dt>Last Active</dt><dd>${escapeHtml(user.last_active)}</dd></div>
          <div><dt>Access Scope</dt><dd>${escapeHtml(user.access_scope)}</dd></div>
          <div><dt>Sensitive Views</dt><dd>${escapeHtml(user.sensitive_access)}</dd></div>
        </dl>
        ${
          role
            ? `<section class="record-detail-section">
                <h3>Role Matrix</h3>
                <dl class="record-detail-list">
                  <div><dt>Stock</dt><dd>${escapeHtml(role.stock)}</dd></div>
                  <div><dt>Sales</dt><dd>${escapeHtml(role.sales)}</dd></div>
                  <div><dt>Reports</dt><dd>${escapeHtml(role.reports)}</dd></div>
                  <div><dt>Users</dt><dd>${escapeHtml(role.users)}</dd></div>
                </dl>
              </section>`
            : ""
        }
        <details class="privacy-details">
          <summary>Private staff details</summary>
          <p>${escapeHtml(user.private_note)}</p>
          <p>Record ID: <code>${escapeHtml(user.id)}</code></p>
        </details>
      </div>
      <div class="record-detail-actions">
        <button class="button button-secondary" data-action="close-record-detail" type="button">Close</button>
        <button class="button button-secondary" data-view="audit" type="button">${icon("history")}Audit Trail</button>
        <button class="button button-primary" data-view="settings" type="button">${icon("settings")}Settings</button>
      </div>
    </aside>
  `;
}

function renderRoleMatrixTable() {
  return `
    <div class="record-table-shell support-table-shell">
      <table class="record-table role-matrix-table">
        <colgroup>
          <col style="width: 24%" />
          <col style="width: 19%" />
          <col style="width: 19%" />
          <col style="width: 22%" />
          <col style="width: 16%" />
        </colgroup>
        <thead>
          <tr>
            <th>Role</th>
            <th>Stock</th>
            <th>Sales</th>
            <th>Reports</th>
            <th>Users</th>
          </tr>
        </thead>
        <tbody>
          ${ROLE_MATRIX.map(
            (row) => `
              <tr>
                <td><strong>${escapeHtml(row.role)}</strong></td>
                <td>${escapeHtml(row.stock)}</td>
                <td>${escapeHtml(row.sales)}</td>
                <td>${escapeHtml(row.reports)}</td>
                <td>${escapeHtml(row.users)}</td>
              </tr>
            `,
          ).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDeviceTrustTable() {
  return `
    <div class="record-table-shell support-table-shell">
      <table class="record-table device-trust-table">
        <colgroup>
          <col style="width: 42%" />
          <col style="width: 18%" />
          <col style="width: 20%" />
          <col style="width: 20%" />
        </colgroup>
        <thead>
          <tr>
            <th>Device</th>
            <th>Trust</th>
            <th>Offline</th>
            <th>Last Sync</th>
          </tr>
        </thead>
        <tbody>
          ${TRUSTED_DEVICES.map(
            (device) => `
              <tr>
                <td>
                  <strong>${escapeHtml(device.name)}</strong>
                  <span>${escapeHtml(device.id)}</span>
                </td>
                <td><span class="badge ${device.trust === "Trusted" ? "is-valid" : device.trust === "Review" ? "is-warning" : "is-error"}">${escapeHtml(device.trust)}</span></td>
                <td>${escapeHtml(device.offline)}</td>
                <td>${escapeHtml(device.last_sync)}</td>
              </tr>
            `,
          ).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSettingsPage() {
  return `
    <section class="content-grid module-page settings-workspace" aria-label="Settings">
      <section class="module-metrics" aria-label="Settings metrics">
        ${metricCard("Policies", SETTINGS_POLICIES.length)}
        ${metricCard("Numbering Rules", NUMBERING_RULES.length)}
        ${metricCard("CI Lanes", CI_LANES.length)}
        ${metricCard("Offline Mode", state.online ? "Online" : "Saved Local")}
      </section>
      <section class="settings-grid" aria-label="Tenant settings">
        <article class="panel settings-panel">
          <div class="settings-card-header">
            <h2>Tenant Defaults</h2>
            <p>Core assumptions used across the workspace.</p>
          </div>
          ${renderSettingsPolicyTable()}
        </article>
        <article class="panel settings-panel">
          <div class="settings-card-header">
            <h2>Numbering Rules</h2>
            <p>Sequence templates for audit-friendly IDs.</p>
          </div>
          ${renderNumberingRuleTable()}
        </article>
      </section>
      <section class="settings-grid" aria-label="Development and privacy settings">
        <article class="panel settings-panel">
          <div class="settings-card-header">
            <h2>CI Lanes</h2>
            <p>Automation checks and environment jobs.</p>
          </div>
          ${renderCiLaneTable()}
        </article>
        <article class="panel settings-panel">
          <div class="settings-card-header">
            <h2>Privacy Guardrails</h2>
            <p>Safety controls that protect private operational data.</p>
          </div>
          ${renderPrivacyGuardrailTable()}
        </article>
      </section>
      <article class="panel settings-summary-card">
        <div>
          <h2>Pipeline Strategy</h2>
          <p>CI is split into unit, build, and browser lanes so fast failures arrive sooner and UI smoke can run independently after dependencies are ready.</p>
        </div>
        <button class="button button-secondary" data-view="reports" type="button">${icon("list")}Open Reports</button>
        <button class="button button-secondary" data-view="audit" type="button">${icon("history")}Open Audit Trail</button>
      </article>
    </section>
  `;
}

function renderSettingsPolicyTable() {
  return `
    <ul class="settings-list" aria-label="Tenant defaults">
      ${SETTINGS_POLICIES.map(
        (policy) => `
          <li class="settings-row">
            <div class="settings-row-copy">
              <strong>${escapeHtml(policy.label)}</strong>
              <p>${escapeHtml(policy.detail)}</p>
            </div>
            <span class="settings-chip">${escapeHtml(policy.value)}</span>
          </li>
        `,
      ).join("")}
    </ul>
  `;
}

function renderNumberingRuleTable() {
  return `
    <ul class="settings-list" aria-label="Numbering rules">
      ${NUMBERING_RULES.map(
        (rule) => `
          <li class="settings-row">
            <div class="settings-row-copy">
              <strong>${escapeHtml(rule.prefix)}</strong>
              <p>${escapeHtml(rule.use)}</p>
            </div>
            <span class="settings-code"><code>${escapeHtml(rule.example)}</code></span>
          </li>
        `,
      ).join("")}
    </ul>
  `;
}

function renderCiLaneTable() {
  return `
    <ul class="settings-list" aria-label="CI lanes">
      ${CI_LANES.map(
        (lane) => `
          <li class="settings-row">
            <div class="settings-row-copy">
              <strong>${escapeHtml(lane.name)}</strong>
              <p>${escapeHtml(lane.purpose)}</p>
            </div>
            <span class="settings-code settings-code--muted"><code>${escapeHtml(lane.command)}</code></span>
          </li>
        `,
      ).join("")}
    </ul>
  `;
}

function renderPrivacyGuardrailTable() {
  const guardrails = [
    ["Local cache", "Minimized", "Prototype state avoids full private staff/contact records.", "success"],
    ["Tenant data", "Scoped", "All visible data is under the Northstar Hospitality demo tenant.", "success"],
    ["Exports", "Role gated", "Detailed exports require reason, role, and audit entry.", "warning"],
    ["Sync", `${state.outbox.length} saved`, "Saved work count that would be sent in the next atomic batch.", state.outbox.length > 0 ? "warning" : "success"],
  ];

  return `
    <ul class="settings-list settings-guardrail-list" aria-label="Privacy guardrails">
      ${guardrails
        .map(
          ([label, status, policy, tone]) => `
            <li class="settings-row">
              <div class="settings-row-copy">
                <strong>${escapeHtml(label)}</strong>
                <p>${escapeHtml(policy)}</p>
              </div>
              <span class="badge ${tone === "warning" ? "is-warning" : "is-valid"}">${escapeHtml(status)}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function mountReportChartsWhenPresent(app) {
  if (!app.querySelector("[data-recharts-chart]")) return;

  reportChartsModulePromise ??= import("./reports/recharts-analytics.mjs");
  reportChartsModulePromise
    .then((module) => module.mountReportCharts(app))
    .catch((error) => {
      console.error("Unable to load report charts", error);
    });
}

function toChartNumber(value) {
  const parsed = Number.parseFloat(`${value ?? ""}`.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function chartSeriesMax(series) {
  return Math.max(1, ...series.map((item) => Math.abs(Number(item.value) || 0)));
}

function chartToneClass(tone) {
  if (tone === "error") return "is-error";
  if (tone === "warning") return "is-warning";
  if (tone === "success") return "is-success";
  return "";
}

function rechartsSeriesAttr(series) {
  return escapeAttr(JSON.stringify(series));
}

function renderChartFallbackList(series) {
  if (!series.length) return "";
  return `
    <div class="analytics-fallback-list" aria-label="Chart values">
      ${series
        .slice(0, 6)
        .map(
          (item) => `
            <div class="${chartToneClass(item.tone)}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.displayValue ?? formatQuantity(item.value))}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderBarAnalyticsChart({ eyebrow, title, summary, series, empty }) {
  return `
    <article class="panel analytics-card analytics-card--bar">
      <div class="analytics-card-header">
        <div>
          <span>${escapeHtml(eyebrow)}</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>
      <p>${escapeHtml(summary)}</p>
      ${
        series.length === 0
          ? `<div class="empty-state"><strong>${escapeHtml(empty)}</strong></div>`
          : `<div class="recharts-host recharts-host--bar" data-recharts-chart data-recharts-kind="bar" data-recharts-title="${escapeAttr(title)}" data-recharts-series="${rechartsSeriesAttr(series)}"></div>
             ${renderChartFallbackList(series)}`
      }
    </article>
  `;
}

function renderDonutAnalyticsChart({ eyebrow, title, summary, series, empty }) {
  const total = series.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0);

  return `
    <article class="panel analytics-card analytics-card--donut">
      <div class="analytics-card-header">
        <div>
          <span>${escapeHtml(eyebrow)}</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>
      <p>${escapeHtml(summary)}</p>
      ${
        total === 0
          ? `<div class="empty-state"><strong>${escapeHtml(empty)}</strong></div>`
          : `<div class="recharts-host recharts-host--donut" data-recharts-chart data-recharts-kind="donut" data-recharts-title="${escapeAttr(title)}" data-recharts-series="${rechartsSeriesAttr(series)}"></div>
             ${renderChartFallbackList(series)}`
      }
    </article>
  `;
}

function ledgerTrendSeries(events) {
  const grouped = new Map();
  events
    .filter((event) => Number.isFinite(Number(event.timestamp)))
    .sort((first, second) => Number(first.timestamp) - Number(second.timestamp))
    .forEach((event) => {
      const date = new Date(Number(event.timestamp));
      const key = date.toISOString().slice(0, 10);
      const row = grouped.get(key) ?? { label: key.slice(5), value: 0, meta: key };
      row.value += 1;
      grouped.set(key, row);
    });

  return [...grouped.values()].slice(-8).map((row) => ({
    ...row,
    displayValue: `${row.value} event${row.value === 1 ? "" : "s"}`,
  }));
}

function renderLineAnalyticsChart({ eyebrow, title, summary, series, empty }) {
  return `
    <article class="panel analytics-card analytics-card--trend">
      <div class="analytics-card-header">
        <div>
          <span>${escapeHtml(eyebrow)}</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>
      <p>${escapeHtml(summary)}</p>
      ${
        series.length === 0
          ? `<div class="empty-state"><strong>${escapeHtml(empty)}</strong></div>`
          : `<div class="recharts-host recharts-host--line" data-recharts-chart data-recharts-kind="line" data-recharts-title="${escapeAttr(title)}" data-recharts-series="${rechartsSeriesAttr(series)}"></div>
             ${renderChartFallbackList(series)}`
      }
    </article>
  `;
}

function renderReportPanel({ eyebrow, title, summary, rows, empty }) {
  return `
    <article class="panel report-panel">
      <div class="relationship-card-topline">
        <span>${escapeHtml(eyebrow)}</span>
        <strong>${escapeHtml(title)}</strong>
      </div>
      <p>${escapeHtml(summary)}</p>
      <div class="record-table-shell report-table-shell">
        <table class="record-table report-summary-table">
          <colgroup>
            <col style="width: 38%" />
            <col style="width: 42%" />
            <col style="width: 20%" />
          </colgroup>
          <thead>
            <tr>
              <th>Record</th>
              <th>Context</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
        ${
          rows.length === 0
            ? `<tr><td colspan="3"><div class="empty-state"><strong>${escapeHtml(empty)}</strong></div></td></tr>`
            : rows
                .map(
                  (row) => `
                    <tr>
                      <td><strong>${escapeHtml(row.label)}</strong></td>
                      <td>${escapeHtml(row.meta)}</td>
                      <td><strong>${escapeHtml(row.value)}</strong></td>
                    </tr>
                  `,
                )
                .join("")
        }
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderRecipePreview(item) {
  if (!item) {
    return `
      <div class="recipe-preview form-field-span-2">
        <span>Recipe Preview</span>
        <strong>Choose a menu item to preview stock use.</strong>
      </div>
    `;
  }

  return `
    <div class="recipe-preview form-field-span-2">
      <span>Recipe Preview</span>
      <strong>${escapeHtml(item.name)}</strong>
      <ul>
        ${item.recipe.map((line) => `<li>${formatQuantity(line.quantity)} ${productUnit(line.product_id)} ${escapeHtml(productName(line.product_id))} per unit sold</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderSalesPage() {
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const queuedSaleEvents = state.outbox.filter((event) => event.source_type === "sale").length;
  const filteredSales = filterSalesRecords({
    sales,
    clientName,
    productName,
    saleTypeLabels,
    saleModeLabels,
    filter: state.saleViewFilter ?? "all",
    search: state.saleSearch ?? "",
    clientId: state.saleClientFilter ?? "all",
  });
  const selectedSale = filteredSales.find((sale) => sale.id === state.selectedSaleId) ?? null;

  return `
    <section class="content-grid module-page business-workspace" aria-label="Sales">
      <section class="module-metrics" aria-label="Sales metrics">
        ${metricCard("Fulfilled Locally", sales.length)}
        ${metricCard("Queued Stock Outs", queuedSaleEvents)}
        ${metricCard("Recurring", sales.filter((sale) => sale.sale_type === "recurring").length)}
        ${metricCard("Direct Stock", sales.filter((sale) => sale.sale_mode === "direct_stock").length)}
      </section>
      <section class="record-only-work-grid">
        ${renderBusinessRecordPanel({
          title: "Sales Records",
          empty: "No fulfilled sales yet.",
          records: filteredSales,
          type: "sale",
          selectedRecord: selectedSale,
        })}
      </section>
    </section>
  `;
}

function renderSaleFilterTab(value, label) {
  const active = (state.saleViewFilter ?? "all") === value;
  return `
    <button class="record-filter-tab stock-overview-view-tab ${active ? "is-active" : ""}" data-sale-filter="${escapeAttr(value)}" type="button" aria-pressed="${active}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderPurchasesPage() {
  const purchases = Array.isArray(state.purchases) ? state.purchases : [];
  const queuedPurchaseEvents = state.outbox.filter((event) => event.source_type === "purchase").length;
  const filteredPurchases = filterPurchaseRecords({
    purchases,
    suppliers: DEFAULT_SUPPLIERS,
    products: getProductCatalog(),
    supplierName,
    productName,
    filter: state.purchaseViewFilter ?? "all",
    search: state.purchaseSearch ?? "",
    supplierId: state.purchaseSupplierFilter ?? "all",
  });
  const selectedPurchase = filteredPurchases.find((purchase) => purchase.id === state.selectedPurchaseId) ?? null;

  return `
    <section class="content-grid module-page business-workspace" aria-label="Purchases">
      <section class="module-metrics" aria-label="Purchase metrics">
        ${metricCard("Received Locally", purchases.length)}
        ${metricCard("Queued Stock Ins", queuedPurchaseEvents)}
        ${metricCard("Suppliers", DEFAULT_SUPPLIERS.length)}
        ${metricCard("Variance", DEFAULT_SUPPLIERS.reduce((total, supplier) => total + Number(supplier.variance_cases || 0), 0))}
      </section>
      <section class="record-only-work-grid">
        ${renderBusinessRecordPanel({
          title: "Receiving Records",
          empty: "No purchases received yet.",
          records: filteredPurchases,
          type: "purchase",
          selectedRecord: selectedPurchase,
        })}
      </section>
    </section>
  `;
}

function renderPurchaseFilterTab(value, label) {
  const active = (state.purchaseViewFilter ?? "all") === value;
  return `
    <button class="record-filter-tab stock-overview-view-tab ${active ? "is-active" : ""}" data-purchase-filter="${escapeAttr(value)}" type="button" aria-pressed="${active}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderBusinessRecordPanel({ title, empty, records, type, selectedRecord = null }) {
  if (type === "sale") {
    return renderSalesRecordWorkspace({ title, empty, records, selectedRecord });
  }
  if (type === "purchase") {
    return renderPurchaseRecordWorkspace({ title, empty, records, selectedRecord });
  }
  return "";
}

function renderPurchaseRecordWorkspace({ title, empty, records, selectedRecord }) {
  const safeRecords = [...records].slice().reverse();
  const safeSearch = escapeAttr(state.purchaseSearch ?? "");

  return `
    <article class="panel business-record-panel record-table-panel sales-record-panel">
      <div class="record-table-controls stock-overview-toolbar" aria-label="Purchase table controls">
        <div class="record-filter-tabs stock-overview-view-switch" role="group" aria-label="Filter purchases">
          ${renderPurchaseFilterTab("all", "All")}
          ${renderPurchaseFilterTab("spirits", "Spirits")}
          ${renderPurchaseFilterTab("produce", "Produce")}
          ${renderPurchaseFilterTab("review", "Needs Review")}
        </div>
        <div class="stock-overview-filter-slot">
          <div class="stock-overview-field stock-overview-field--search">
            <input
              class="stock-overview-search-input"
              type="search"
              placeholder="Search purchases"
              value="${safeSearch}"
              data-filter="purchase-search"
              aria-label="Search purchases"
            />
          </div>
          <label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
            ${renderFieldSelect({
              name: "purchase-supplier-filter",
              menuStyle: "styled",
              className: "field-select--stock-overview-filter",
              menuClassName: "field-select-menu--stock-overview-filter",
              menuMode: "stock-overview-filter",
              attrs: 'data-filter="purchase-supplier"',
              options: `
                <option value="all">All suppliers</option>
                ${DEFAULT_SUPPLIERS.map((supplier) => `<option value="${supplier.id}" ${state.purchaseSupplierFilter === supplier.id ? "selected" : ""}>${supplier.name}</option>`).join("")}
              `,
            })}
          </label>
        </div>
      </div>
      <section class="record-workspace purchase-record-workspace ${selectedRecord ? "has-detail" : ""}" data-record-workspace="purchases" aria-label="Purchase records">
        <div class="record-table-shell">
          <table class="record-table purchase-record-table">
            <colgroup>
              <col style="width: 30%" />
              <col style="width: 24%" />
              <col style="width: 16%" />
              <col style="width: 18%" />
              <col style="width: 12%" />
            </colgroup>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Product</th>
                <th>Amount</th>
                <th class="detail-optional">Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${
                safeRecords.length === 0
                  ? `<tr><td colspan="5"><div class="empty-state"><strong>${escapeHtml(empty)}</strong></div></td></tr>`
                  : safeRecords.map((record) => renderPurchaseTableRow(record, selectedRecord)).join("")
              }
            </tbody>
          </table>
        </div>
        ${selectedRecord ? renderPurchaseDetailPanel(selectedRecord) : ""}
      </section>
    </article>
  `;
}

function renderPurchaseTableRow(record, selectedRecord) {
  const active = selectedRecord?.id === record.id;
  const itemName = record.item_label ?? productName(record.product_id);

  return `
    <tr class="record-row ${active ? "is-active" : ""}" data-purchase-row data-purchase-id="${escapeAttr(record.id)}" tabindex="0" aria-selected="${active}">
      <td>
        <strong>${escapeHtml(supplierName(record.supplier_id))}</strong>
        <span>${escapeHtml(record.notes || "Received stock")}</span>
      </td>
      <td>${escapeHtml(itemName)}</td>
      <td>${formatQuantity(record.quantity)} ${productUnit(record.product_id)}</td>
      <td class="detail-optional">${escapeHtml(record.location)}</td>
      <td><span class="badge ${record.status === "queued" ? "is-warning" : "is-valid"}">${escapeHtml(record.status ?? "queued")}</span></td>
    </tr>
  `;
}

function renderPurchaseDetailPanel(record) {
  const supplier = DEFAULT_SUPPLIERS.find((candidate) => candidate.id === record.supplier_id);
  const created = record.created_at ? displayDateTime(record.created_at) : "Local session";
  const itemName = record.item_label ?? productName(record.product_id);

  return `
    <aside class="record-detail-panel" data-record-detail-panel aria-label="Purchase details">
      <div class="record-detail-scroll">
        <div class="record-detail-heading">
          <span>Received stock</span>
          <h2>${escapeHtml(supplierName(record.supplier_id))}</h2>
        </div>
        <dl class="record-detail-list">
          <div><dt>Product</dt><dd>${escapeHtml(itemName)}</dd></div>
          <div><dt>Amount</dt><dd>${formatQuantity(record.quantity)} ${productUnit(record.product_id)}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(record.location)}</dd></div>
          <div><dt>Stock Lines</dt><dd>${record.event_count ?? 1}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(record.status ?? "queued")}</dd></div>
          <div><dt>Created</dt><dd>${escapeHtml(created)}</dd></div>
          ${supplier ? `<div><dt>Supplier Reliability</dt><dd>${escapeHtml(supplier.reliability)}</dd></div>` : ""}
        </dl>
        <section class="record-detail-section">
          <h3>Receiving Notes</h3>
          <p>${record.notes ? escapeHtml(record.notes) : "No notes recorded."}</p>
        </section>
        <details class="privacy-details">
          <summary>Technical source</summary>
          <p>Work item: <code>${escapeHtml(record.work_item_id)}</code></p>
          <p>Event: <code>${escapeHtml(record.event_id ?? "waiting")}</code></p>
        </details>
      </div>
      <div class="record-detail-actions">
        <button class="button button-secondary" data-action="close-record-detail" type="button">Close</button>
        <button class="button button-secondary" data-view="suppliers" type="button">${icon("layers")}Supplier</button>
        <button class="button button-primary" data-view="compose" type="button">${icon("send")}Open Work</button>
      </div>
    </aside>
  `;
}

function renderSalesRecordWorkspace({ title, empty, records, selectedRecord }) {
  const safeRecords = [...records].slice().reverse();
  const safeSaleSearch = escapeAttr(state.saleSearch ?? "");

  return `
    <article class="panel business-record-panel record-table-panel sales-record-panel">
      <div class="record-table-controls stock-overview-toolbar" aria-label="Sales table controls">
        <div class="record-filter-tabs stock-overview-view-switch" role="group" aria-label="Filter sales">
          ${renderSaleFilterTab("all", "All")}
          ${renderSaleFilterTab("one_time", "One-time")}
          ${renderSaleFilterTab("recurring", "Recurring")}
          ${renderSaleFilterTab("menu_item", "Menu")}
          ${renderSaleFilterTab("direct_stock", "Direct")}
        </div>
        <div class="stock-overview-filter-slot">
          <div class="stock-overview-field stock-overview-field--search">
            <input
              class="stock-overview-search-input"
              type="search"
              placeholder="Search sales"
              value="${safeSaleSearch}"
              data-filter="sale-search"
              aria-label="Search sales"
            />
          </div>
          <label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
            ${renderFieldSelect({
              name: "sale-client-filter",
              menuStyle: "styled",
              className: "field-select--stock-overview-filter",
              menuClassName: "field-select-menu--stock-overview-filter",
              menuMode: "stock-overview-filter",
              attrs: 'data-filter="sale-client"',
              options: `
                <option value="all">All clients</option>
                ${DEFAULT_CLIENTS.map((client) => `<option value="${client.id}" ${state.saleClientFilter === client.id ? "selected" : ""}>${client.name}</option>`).join("")}
              `,
            })}
          </label>
        </div>
      </div>
      <section class="record-workspace sales-record-workspace ${selectedRecord ? "has-detail" : ""}" data-record-workspace="sales" aria-label="Sales records">
        <div class="record-table-shell">
          <table class="record-table sales-record-table">
            <colgroup>
              <col style="width: 28%" />
              <col style="width: 22%" />
              <col style="width: 18%" />
              <col style="width: 12%" />
              <col style="width: 12%" />
              <col style="width: 8%" />
            </colgroup>
            <thead>
              <tr>
                <th>Client</th>
                <th>Sale</th>
                <th>Item</th>
                <th>Amount</th>
                <th class="detail-optional">Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${
                safeRecords.length === 0
                  ? `<tr><td colspan="6"><div class="empty-state"><strong>${escapeHtml(empty)}</strong></div></td></tr>`
                  : safeRecords.map((record) => renderSaleTableRow(record, selectedRecord)).join("")
              }
            </tbody>
          </table>
        </div>
        ${selectedRecord ? renderSaleDetailPanel(selectedRecord) : ""}
      </section>
    </article>
  `;
}

function renderSaleTableRow(record, selectedRecord) {
  const active = selectedRecord?.id === record.id;
  const itemName =
    record.sale_mode === "menu_item"
      ? record.item_label ?? getMenuItemById(record.menu_item_id)?.name ?? "Menu item"
      : record.item_label ?? productName(record.product_id);
  const amount =
    record.sale_mode === "menu_item"
      ? `${formatQuantity(record.quantity)} unit${Number(record.quantity) === 1 ? "" : "s"}`
      : `${formatQuantity(record.quantity)} ${productUnit(record.product_id)}`;

  return `
    <tr class="record-row ${active ? "is-active" : ""}" data-sale-row data-sale-id="${escapeAttr(record.id)}" tabindex="0" aria-selected="${active}">
      <td>
        <strong>${escapeHtml(clientName(record.client_id))}</strong>
        <span>${escapeHtml(saleTypeLabels[record.sale_type] ?? "Sale")}</span>
      </td>
      <td>${escapeHtml(saleModeLabels[record.sale_mode] ?? "Sale")}</td>
      <td>${escapeHtml(itemName)}</td>
      <td>${amount}</td>
      <td class="detail-optional">${escapeHtml(record.location)}</td>
      <td><span class="badge ${record.status === "queued" ? "is-warning" : "is-valid"}">${escapeHtml(record.status ?? "queued")}</span></td>
    </tr>
  `;
}

function renderSaleDetailPanel(record) {
  const itemName =
    record.sale_mode === "menu_item"
      ? record.item_label ?? getMenuItemById(record.menu_item_id)?.name ?? "Menu item"
      : record.item_label ?? productName(record.product_id);
  const menu = record.menu_item_id ? getMenuById(getMenuItemById(record.menu_item_id)?.menu_id) : null;
  const created = record.created_at ? displayDateTime(record.created_at) : "Local session";

  return `
    <aside class="record-detail-panel" data-record-detail-panel aria-label="Sale details">
      <div class="record-detail-scroll">
        <div class="record-detail-heading">
          <span>${escapeHtml(saleTypeLabels[record.sale_type] ?? "Sale")}</span>
          <h2>${escapeHtml(clientName(record.client_id))}</h2>
        </div>
        <dl class="record-detail-list">
          <div><dt>Sale Source</dt><dd>${escapeHtml(saleModeLabels[record.sale_mode] ?? "Sale")}</dd></div>
          <div><dt>${record.sale_mode === "menu_item" ? "Menu Item" : "Product"}</dt><dd>${escapeHtml(itemName)}</dd></div>
          ${menu ? `<div><dt>Menu</dt><dd>${escapeHtml(menu.name)}</dd></div>` : ""}
          <div><dt>Location</dt><dd>${escapeHtml(record.location)}</dd></div>
          <div><dt>Amount</dt><dd>${formatQuantity(record.quantity)}</dd></div>
          <div><dt>Stock Lines</dt><dd>${record.event_count}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(record.status ?? "queued")}</dd></div>
          <div><dt>Created</dt><dd>${escapeHtml(created)}</dd></div>
        </dl>
        <section class="record-detail-section">
          <h3>Notes</h3>
          <p>${record.notes ? escapeHtml(record.notes) : "No notes recorded."}</p>
        </section>
        <details class="privacy-details">
          <summary>Technical source</summary>
          <p>Work item: <code>${escapeHtml(record.work_item_id)}</code></p>
          <p>First event: <code>${escapeHtml(record.event_id ?? "waiting")}</code></p>
        </details>
      </div>
      <div class="record-detail-actions">
        <button class="button button-secondary" data-action="close-record-detail" type="button">Close</button>
        <button class="button button-secondary" data-view="audit" type="button">${icon("history")}Audit Trail</button>
        <button class="button button-primary" data-view="compose" type="button">${icon("send")}Open Work</button>
      </div>
    </aside>
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
        <form class="event-form compose-event-form" data-form="event">
          <div class="action-type-field form-field-span-2">
            <span class="action-type-label">Action Type</span>
            ${renderActionTypeTabs(form.type)}
            <input type="hidden" name="type" value="${escapeAttr(form.type)}" />
          </div>
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
  const products = filterProductCatalog({
    products: getProductCatalog(),
    statusFilter: state.productStatusFilter ?? "active",
    categoryFilter: state.productCategoryFilter ?? "all",
    search: state.productSearch ?? "",
    productLastStateLabel,
  });
  const activeProducts = getActiveProducts().length;
  const inactiveProducts = getInactiveProducts().length;
  const categories = selectProductCategories(getProductCatalog());

  return `
    <section class="content-grid module-page product-workspace">
      <section class="module-metrics" aria-label="Product metrics">
        ${metricCard("Active Products", activeProducts)}
        ${metricCard("Suspended", inactiveProducts)}
        ${metricCard("Categories", categories.length)}
        ${metricCard("Low Thresholds", getProductCatalog().filter((product) => Number(product.low) > 0).length)}
      </section>
      <article class="panel panel-wide panel--flush-table record-table-panel">
        <div class="panel-header panel-header--compact">
          <button class="button button-primary" data-view="compose" type="button">${icon("plus")}Open Stock Actions</button>
        </div>
        ${renderProductControls()}
        ${products.length === 0 ? `<div class="empty-state"><strong>No products match these filters.</strong></div>` : renderProductTable(products)}
      </article>
    </section>
  `;
}

function renderProductControls() {
  const safeSearch = escapeAttr(state.productSearch ?? "");
  return `
    <div class="record-table-controls stock-overview-toolbar" aria-label="Product table controls">
      <div class="record-filter-tabs stock-overview-view-switch" role="group" aria-label="Filter products">
        ${renderProductStatusTab("active", "Active")}
        ${renderProductStatusTab("suspended", "Suspended")}
        ${renderProductStatusTab("all", "All")}
      </div>
      <div class="stock-overview-filter-slot">
        <div class="stock-overview-field stock-overview-field--search">
          <input
            class="stock-overview-search-input"
            type="search"
            placeholder="Search products"
            value="${safeSearch}"
            data-filter="product-search"
            aria-label="Search products"
          />
        </div>
        <label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
          ${renderFieldSelect({
            name: "product-category-filter",
            menuStyle: "styled",
            className: "field-select--stock-overview-filter",
            menuClassName: "field-select-menu--stock-overview-filter",
            menuMode: "stock-overview-filter",
            attrs: 'data-filter="product-category"',
            options: `
              <option value="all">All categories</option>
              ${selectProductCategories(getProductCatalog()).map((category) => `<option value="${escapeAttr(category)}" ${state.productCategoryFilter === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
            `,
          })}
        </label>
      </div>
    </div>
  `;
}

function renderProductStatusTab(value, label) {
  const active = (state.productStatusFilter ?? "active") === value;
  return `
    <button class="record-filter-tab stock-overview-view-tab ${active ? "is-active" : ""}" data-product-status-filter="${escapeAttr(value)}" type="button" aria-pressed="${active}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderProductTable(products) {
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
              const isInactive = product.is_active === false;
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
            const isInactive = product.is_active === false;
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
    </div>
  `;
}

function renderActionFields(form, template, revertOptions) {
  if (template.kind === "product-create") return renderProductCreateFields();
  if (template.kind === "product-suspend") return renderProductLifecycleFields("active", template);
  if (template.kind === "product-reactivate") return renderProductLifecycleFields("inactive", template);
  if (template.showOriginalEvent) {
    return `
      ${renderActionTemplateFields(form, template, revertOptions)}
      <label class="form-field-span-2">
        <span>Reason</span>
        <textarea name="reason" rows="3" placeholder="${template.reasonPlaceholder}">${escapeHtml(form.reason)}</textarea>
      </label>
    `;
  }

  return `
    ${renderProductChecklist(getActiveProducts(), "Products", "active")}
    ${renderActionTemplateFields(form, template, revertOptions)}
    ${renderProductQuantityFields(form, template)}
    ${renderOptionalSourceFields(form, template)}
    <label class="form-field-span-2">
      <span>Reason</span>
      <textarea name="reason" rows="3" placeholder="${template.reasonPlaceholder}">${escapeHtml(form.reason)}</textarea>
    </label>
  `;
}

function renderProductQuantityFields(form, template) {
  if (!template.quantityEditable || template.isPhysicalCount) return "";
  const selectedIds = selectedProductIdsForScope("active", getActiveProducts());
  return `
    <fieldset class="product-quantity-grid form-field-span-2">
      <legend>${escapeHtml(template.quantityLabel)}</legend>
      ${selectedIds
        .map((productId) => {
          const product = getProductById(productId);
          const value = productQuantityForForm(productId);
          return `
            <label>
              <span>${escapeHtml(template.quantityLabel)} for ${escapeHtml(product?.name ?? productId)}</span>
              <input
                name="quantity_${escapeAttr(productId)}"
                type="number"
                min="${template.requiresPositiveQuantity ? "0.01" : ""}"
                step="0.01"
                value="${escapeAttr(value)}"
                aria-label="${escapeAttr(`${template.quantityLabel} for ${product?.name ?? productId}`)}"
              />
            </label>
          `;
        })
        .join("")}
    </fieldset>
  `;
}

function renderOptionalSourceFields(form, template) {
  if (form.type === "STOCK_OUT") return renderSaleSourceFields(form);
  if (form.type === "STOCK_IN") return renderPurchaseSourceFields(form);
  return "";
}

function renderSaleSourceFields(form) {
  const checked = Boolean(form.attach_sale);
  return `
    <fieldset class="source-detail-panel form-field-span-2">
      <label class="source-detail-toggle">
        <input type="checkbox" name="attach_sale" value="true" ${checked ? "checked" : ""} />
        <span>
          <strong>Attach sale details</strong>
          <small>Use Stock can stand alone, or create a sales record with the same STOCK_OUT work.</small>
        </span>
      </label>
      ${
        checked
          ? `<div class="source-detail-grid">
              <label class="field-select-wrap">
                <span>Client</span>
                ${renderFieldSelect({
                  name: "sale_client_id",
                  menuClassName: "field-select-menu--event-form",
                  menuMode: "event-form",
                  options: DEFAULT_CLIENTS.map((client) => `<option value="${client.id}" ${form.sale_client_id === client.id ? "selected" : ""}>${client.name}</option>`).join(""),
                })}
              </label>
              <label class="field-select-wrap">
                <span>Sale Type</span>
                ${renderFieldSelect({
                  name: "sale_type",
                  menuClassName: "field-select-menu--event-form",
                  menuMode: "event-form",
                  options: Object.entries(saleTypeLabels)
                    .map(([value, label]) => `<option value="${value}" ${form.sale_type === value ? "selected" : ""}>${label}</option>`)
                    .join(""),
                })}
              </label>
              <label class="form-field-span-2">
                <span>Sale Notes</span>
                <textarea name="sale_notes" rows="2" placeholder="Example: event service use">${escapeHtml(form.sale_notes)}</textarea>
              </label>
            </div>`
          : ""
      }
    </fieldset>
  `;
}

function renderPurchaseSourceFields(form) {
  const checked = Boolean(form.attach_purchase);
  return `
    <fieldset class="source-detail-panel form-field-span-2">
      <label class="source-detail-toggle">
        <input type="checkbox" name="attach_purchase" value="true" ${checked ? "checked" : ""} />
        <span>
          <strong>Attach purchase details</strong>
          <small>Stock In can stand alone, or create a receiving record linked to a supplier.</small>
        </span>
      </label>
      ${
        checked
          ? `<div class="source-detail-grid">
              <label class="field-select-wrap">
                <span>Supplier</span>
                ${renderFieldSelect({
                  name: "purchase_supplier_id",
                  menuClassName: "field-select-menu--event-form",
                  menuMode: "event-form",
                  options: DEFAULT_SUPPLIERS.map((supplier) => `<option value="${supplier.id}" ${form.purchase_supplier_id === supplier.id ? "selected" : ""}>${supplier.name}</option>`).join(""),
                })}
              </label>
              <label class="form-field-span-2">
                <span>Receiving Notes</span>
                <textarea name="purchase_notes" rows="2" placeholder="Example: matched supplier delivery">${escapeHtml(form.purchase_notes)}</textarea>
              </label>
            </div>`
          : ""
      }
    </fieldset>
  `;
}

function renderProductChecklist(products, label, scope) {
  const selectedIds = selectedProductIdsForScope(scope, products);
  const selectedCount = selectedIds.length;
  return `
    <fieldset class="product-checklist form-field-span-2">
      <legend>${escapeHtml(label)}</legend>
      <input type="hidden" name="product_id" value="${escapeAttr(selectedIds[0] ?? "")}" />
      <div class="product-checklist-summary">
        <strong>${selectedCount || 0} selected</strong>
        <span>${selectedCount > 1 ? "Saved as grouped work" : "Choose one or more products"}</span>
      </div>
      <div class="product-checklist-grid">
        ${
          products.length === 0
            ? `<div class="empty-state"><strong>No ${scope === "inactive" ? "suspended" : "active"} products available.</strong></div>`
            : products
                .map((product) => {
                  const checked = selectedIds.includes(product.id);
                  return `
                    <label class="product-check-option ${checked ? "is-selected" : ""}">
                      <input type="checkbox" name="product_ids" value="${escapeAttr(product.id)}" ${checked ? "checked" : ""} />
                      <span>
                        <strong>${escapeHtml(product.name)}</strong>
                        <small>${escapeHtml(product.category || "Uncategorized")} · ${escapeHtml(product.unit || "unit")}</small>
                      </span>
                    </label>
                  `;
                })
                .join("")
        }
      </div>
    </fieldset>
  `;
}

function selectedProductIdsForScope(scope, products) {
  const availableIds = new Set(products.map((product) => product.id));
  const selectedIds = normalizeSelectedProductIds(state.form.product_ids, state.form.product_id).filter((id) => availableIds.has(id));
  if (selectedIds.length) return selectedIds;
  return products[0]?.id ? [products[0].id] : [];
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
  const selectedIds = selectedProductIdsForScope(scope, products);
  const selectedProducts = selectedIds.map((id) => products.find((product) => product.id === id)).filter(Boolean);
  const closures = template.kind === "product-suspend" ? selectedProducts.flatMap((product) => getProductDeactivationClosures(product)) : [];

  return `
    ${renderProductChecklist(products, "Products", scope)}
    ${
      template.kind === "product-suspend"
        ? `<div class="panel form-field-span-2 product-action-preview">
            <span>Closure Preview</span>
            <strong>${selectedProducts.length ? formatMultiProductDeactivationClosures(selectedProducts) : "Choose at least one product"}</strong>
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
        ? ""
        : `<label class="form-field-span-2">
             <span>${template.quantityLabel}</span>
             <p>${renderRevertAmountHelp(originalEvent)}</p>
           </label>`
    }
  `;
}

function currentSystemCountForProduct(form, productId) {
  if (!productId || !form.to_location) return null;
  const row = filteredStockRows(allLocalEvents()).find(
    (candidate) => candidate.product_id === productId && candidate.location === form.to_location,
  );
  return row ? Number(row.quantity) : 0;
}

function physicalCountVariance(form, productId = form.product_id) {
  const systemCount = currentSystemCountForProduct(form, productId);
  return selectPhysicalCountVariance(form, productId, systemCount);
}

function physicalCountForProduct(form, productId) {
  return selectPhysicalCountForProduct(form, productId);
}

function renderPhysicalCountFields(form) {
  const selectedIds = selectedProductIdsForScope("active", getActiveProducts());
  const firstCountValue = selectedIds.length ? physicalCountForProduct(form, selectedIds[0]) : form.physical_count;
  const hasLocation = Boolean(form.to_location);

  return `
    <div class="panel form-field-span-2 physical-count-panel">
      <input type="hidden" name="physical_count" value="${escapeAttr(firstCountValue)}" />
      <div class="physical-count-heading">
        <div>
          <strong>Physical Counts</strong>
          <span>${selectedIds.length > 1 ? "Each selected product saves its own correction." : "Enter what you counted for the selected product."}</span>
        </div>
        <span>${hasLocation ? escapeHtml(form.to_location) : "Choose a count location"}</span>
      </div>
      ${selectedIds
        .map((productId) => {
          const product = getProductById(productId);
          const systemCount = currentSystemCountForProduct(form, productId);
          const variance = physicalCountVariance(form, productId);
          const value = physicalCountForProduct(form, productId);
          const varianceTone = variance === null ? "" : variance === 0 ? "" : variance > 0 ? "is-valid" : "is-error";

          return `
            <div class="physical-count-row">
              <div class="physical-count-product">
                <strong>${escapeHtml(product?.name ?? productId)}</strong>
                <span>${escapeHtml(product?.category || "Uncategorized")} · ${escapeHtml(product?.unit || "unit")}</span>
              </div>
              <div class="physical-count-stat">
                <span>System</span>
                <strong>${systemCount !== null ? formatQuantity(systemCount) : "Choose location"}</strong>
              </div>
              <label class="physical-count-input">
                <span>Physical</span>
                <input
                  name="physical_count_${escapeAttr(productId)}"
                  type="number"
                  step="0.01"
                  placeholder="Counted"
                  value="${escapeAttr(value)}"
                  aria-label="${escapeAttr(`Physical count for ${product?.name ?? productId}`)}"
                  ${systemCount !== null ? "" : "disabled"}
                />
              </label>
              <div class="physical-count-stat">
                <span>Variance</span>
                <strong class="${varianceTone ? `badge ${varianceTone}` : ""}">
                  ${variance === null ? "-" : `${variance > 0 ? "+" : ""}${formatQuantity(variance)}`}
                </strong>
              </div>
            </div>
          `;
        })
        .join("")}
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
          ${getLocations().map((location) => `<option value="${location.name}" ${selectedLocation === location.name ? "selected" : ""}>${location.name}</option>`).join("")}
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

function findEventForRevert(eventId) {
  if (!eventId) return null;

  return allLocalEvents().find((event) => event.event_id === eventId && event.type !== "STOCK_REVERT");
}

function workQueueItems(outboxValidation) {
  return buildWorkQueueItems(outboxValidation, {
    eventLabels,
    productName,
    formatQuantity,
    simpleValidationReason,
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
          <strong class="work-queue-card-title">${escapeHtml(item.product_name)}</strong>
          <dl class="work-queue-facts">
            <div>
              <dt>Location</dt>
              <dd>${escapeHtml(item.location)}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>${escapeHtml(item.amount)}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>${item.event_count} queued</dd>
            </div>
          </dl>
          ${item.source ? `<p class="work-queue-meta">${escapeHtml(item.source)}</p>` : ""}
        </div>
        <button class="table-action" data-action="undo-work-item" data-work-item-id="${escapeAttr(item.work_item_id)}" type="button">Undo</button>
      </div>
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
  const allAuditRows = [...replayAuditTrail(localLedger)].reverse();
  const rows = selectAuditRows({
    rows: allAuditRows,
    eventLabels,
    auditSourceLabel,
    search: state.auditSearch ?? "",
    productId: state.auditProductFilter ?? "all",
    filter: state.auditViewFilter ?? "all",
  });
  const selectedEntry = rows.find((entry) => entry.event_id === state.selectedAuditEventId) ?? null;

  return `
    <section class="content-grid module-page audit-workspace">
      ${renderAuditKpis(rows)}
      <section class="record-workspace audit-record-workspace ${selectedEntry ? "has-detail" : ""}" data-record-workspace="audit" aria-label="Audit records">
        <article class="panel panel-wide panel--flush-table record-table-panel">
          ${renderAuditControls()}
          ${renderAuditTable(rows, selectedEntry)}
        </article>
        ${selectedEntry ? renderAuditDetailPanel(selectedEntry) : ""}
      </section>
    </section>
  `;
}

function renderAuditKpis(rows) {
  const additions = rows.filter((entry) => Number(entry.delta) > 0);
  const deductions = rows.filter((entry) => Number(entry.delta) < 0);
  const corrections = rows.filter((entry) => ["STOCK_ADJUSTMENT", "STOCK_REVERT"].includes(entry.type));
  const linkedSources = rows.filter((entry) => entry.source_label && entry.source_label !== "Manual stock work");
  const addedTotal = additions.reduce((total, entry) => total + Number(entry.delta || 0), 0);
  const deductedTotal = deductions.reduce((total, entry) => total + Math.abs(Number(entry.delta || 0)), 0);

  return `
    <section class="module-metrics audit-kpi-grid" aria-label="Audit summary">
      ${metricCard("Visible Records", rows.length)}
      ${metricCard("Added Units", formatQuantity(addedTotal))}
      ${metricCard("Deducted Units", formatQuantity(deductedTotal))}
      ${metricCard("Corrections & Undo", corrections.length)}
    </section>
    <p class="audit-kpi-note">${linkedSources.length} record${linkedSources.length === 1 ? "" : "s"} linked to sales, purchases, or catalog work.</p>
  `;
}

function renderAuditControls() {
  const safeSearch = escapeAttr(state.auditSearch ?? "");
  return `
    <div class="record-table-controls stock-overview-toolbar" aria-label="Audit table controls">
      <div class="record-filter-tabs stock-overview-view-switch" role="group" aria-label="Filter audit trail">
        ${renderAuditFilterTab("all", "All")}
        ${renderAuditFilterTab("stock-in", "Stock In")}
        ${renderAuditFilterTab("use-stock", "Use Stock")}
        ${renderAuditFilterTab("movement", "Moves")}
        ${renderAuditFilterTab("correction", "Corrections")}
        ${renderAuditFilterTab("undo", "Undo")}
        ${renderAuditFilterTab("catalog", "Catalog")}
      </div>
      <div class="stock-overview-filter-slot">
        <div class="stock-overview-field stock-overview-field--search">
          <input
            class="stock-overview-search-input"
            type="search"
            placeholder="Search audit trail"
            value="${safeSearch}"
            data-filter="audit-search"
            aria-label="Search audit trail"
          />
        </div>
        <label class="stock-overview-compact-select field-select-wrap field-select-wrap--stock-overview-filter stock-overview-field">
          ${renderFieldSelect({
            name: "audit-product-filter",
            menuStyle: "styled",
            className: "field-select--stock-overview-filter",
            menuClassName: "field-select-menu--stock-overview-filter",
            menuMode: "stock-overview-filter",
            attrs: 'data-filter="audit-product"',
            options: `
              <option value="all">All products</option>
              ${getProductCatalog().map((product) => `<option value="${product.id}" ${state.auditProductFilter === product.id ? "selected" : ""}>${escapeHtml(product.name)}</option>`).join("")}
            `,
          })}
        </label>
      </div>
    </div>
  `;
}

function renderAuditFilterTab(value, label) {
  const active = (state.auditViewFilter ?? "all") === value;
  return `
    <button class="record-filter-tab stock-overview-view-tab ${active ? "is-active" : ""}" data-audit-filter="${escapeAttr(value)}" type="button" aria-pressed="${active}">
      ${escapeHtml(label)}
    </button>
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
            ${getLocations().map((location) => `<option value="${location.name}" ${state.locationFilter === location.name ? "selected" : ""}>${location.name}</option>`).join("")}
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
                  options: getLocations().map((location) => `<option value="${location.name}" ${state.selectedLocation === location.name ? "selected" : ""}>${location.name}</option>`).join(""),
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

function renderMasterStockTable(rows, pagination) {
  return `
    <div class="stock-table record-table-shell">
      <table class="record-table">
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
    <div class="stock-table record-table-shell">
      <table class="record-table">
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
    <div class="stock-table record-table-shell">
      <table class="record-table">
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

function renderAuditTable(allRows, selectedEntry = null) {
  if (allRows.length === 0) {
    return `<div class="empty-state"><strong>No history yet</strong></div>`;
  }

  return `
    <div class="record-table-shell audit-table-shell">
      <table class="record-table audit-table">
        <colgroup>
          <col class="audit-col-sequence" />
          <col class="audit-col-action" />
          <col class="audit-col-product" />
          <col class="audit-col-change" />
          <col class="audit-col-source" />
        </colgroup>
        <thead>
          <tr>
            <th class="table-cell--numeric">No.</th>
            <th>Action</th>
            <th>Product</th>
            <th class="table-cell--numeric">Change</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${allRows
            .map((entry) => {
              const active = selectedEntry?.event_id === entry.event_id;
              return `
                <tr class="record-row ${active ? "is-active" : ""}" data-audit-row data-audit-event-id="${escapeAttr(entry.event_id)}" tabindex="0" aria-selected="${active}">
                  <td class="table-cell--numeric">${entry.sequence_number}</td>
                  <td>${renderAuditActionToken(entry.type)}</td>
                  <td>${escapeHtml(entry.product_name)}</td>
                  <td class="table-cell--numeric">${renderAuditChangeToken(entry.delta)}</td>
                  <td>${auditSourceLabel(entry)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAuditActionToken(type) {
  const label = eventLabels[type] ?? type;
  return `<span class="record-token audit-action-token ${auditActionTone(type)}">${escapeHtml(label)}</span>`;
}

function renderAuditChangeToken(value) {
  const amount = Number(value);
  const tone = amount > 0 ? "is-positive" : amount < 0 ? "is-negative" : "is-neutral";
  return `<span class="record-token audit-change-token ${tone}">${amount > 0 ? "+" : ""}${formatQuantity(value)}</span>`;
}

function auditActionTone(type) {
  if (["STOCK_IN", "PRODUCT_CREATED", "PRODUCT_REACTIVATED"].includes(type)) return "is-positive";
  if (["STOCK_OUT", "STOCK_REVERT", "PRODUCT_DEACTIVATED"].includes(type)) return "is-negative";
  if (type === "STOCK_TRANSFER") return "is-info";
  if (type === "STOCK_ADJUSTMENT") return "is-warning";
  return "is-neutral";
}

function renderAuditDetailPanel(entry) {
  return `
    <aside class="record-detail-panel" data-record-detail-panel aria-label="Audit details">
      <div class="record-detail-scroll">
        <div class="record-detail-heading">
          ${renderAuditActionToken(entry.type)}
          <h2>${escapeHtml(entry.product_name)}</h2>
        </div>
        <dl class="record-detail-list">
          <div><dt>Sequence</dt><dd>${entry.sequence_number}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(entry.location)}</dd></div>
          <div><dt>Change</dt><dd>${renderAuditChangeToken(entry.delta)}</dd></div>
          <div><dt>New Balance</dt><dd>${formatAuditBalance(entry.running_balance)}</dd></div>
          <div><dt>Source</dt><dd>${auditSourceLabel(entry)}</dd></div>
          <div><dt>Actor</dt><dd>${escapeHtml(entry.actor_name)}</dd></div>
        </dl>
        <section class="record-detail-section">
          <h3>Reason</h3>
          <p>${escapeHtml(entry.reason || "No reason recorded")}</p>
        </section>
        <details class="privacy-details">
          <summary>Technical details</summary>
          <p>Event: <code>${escapeHtml(entry.event_id)}</code></p>
          <p>Batch: <code>${escapeHtml(entry.sync_batch_id)}</code></p>
          <p>Idempotency: <code>${escapeHtml(entry.idempotency_key)}</code></p>
          <p>Device: <code>${escapeHtml(entry.device_id)}</code></p>
        </details>
      </div>
      <div class="record-detail-actions">
        <button class="button button-secondary" data-action="close-record-detail" type="button">Close</button>
        <button class="button button-primary" data-action="prepare-revert" data-event-id="${escapeAttr(entry.event_id)}" type="button" ${!isRevertibleEvent(entry.type) || hasReversalForEvent(entry.event_id) ? "disabled" : ""}>
          ${icon("history")}Undo
        </button>
      </div>
    </aside>
  `;
}

function auditSourceLabel(entry) {
  return entry.source_label ? escapeHtml(entry.source_label) : "Manual stock work";
}

function renderAuditTechnicalDetails(entry) {
  return `
    <details class="audit-technical">
      <summary>Technical details</summary>
      <dl>
        <div><dt>Batch</dt><dd><code>${escapeHtml(entry.sync_batch_id)}</code></dd></div>
        <div><dt>Idempotency</dt><dd><code>${escapeHtml(entry.idempotency_key)}</code></dd></div>
        <div><dt>Reason</dt><dd>${escapeHtml(entry.reason || "No reason recorded")}</dd></div>
      </dl>
    </details>
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
        queueActiveViewMotion(nextView);
      }
      if (nextView === "compose") {
        shouldFocusActionOnCompose = true;
      }

      state.activeView = nextView;
      state.guideOpen = false;
      state.assistantInput = "";
      state.assistantMessages = [];
      state.accountOpen = false;
      commit();
    });
  });

  document.querySelectorAll("[data-action='toggle-guide']").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.guideOpen) {
        animateGuideMenuClose(() => {
          state.guideOpen = false;
          commit();
        });
        return;
      }

      state.guideOpen = true;
      if (!Array.isArray(state.assistantMessages) || state.assistantMessages.length === 0) {
        state.assistantMessages = [createAssistantGreeting()];
      }
      commit();
    });
  });

  document.querySelectorAll("[data-assistant-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      submitAssistantQuestion(button.dataset.assistantPrompt);
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
      state = seedDemoState();
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

  document.querySelectorAll("[data-filter='sale-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.saleSearch = input.value;
      state.selectedSaleId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='sale-client']").forEach((select) => {
    select.addEventListener("change", () => {
      state.saleClientFilter = select.value || "all";
      state.selectedSaleId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='client-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.clientSearch = input.value;
      state.selectedClientId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='client-menu']").forEach((select) => {
    select.addEventListener("change", () => {
      state.clientMenuFilter = select.value || "all";
      state.selectedClientId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='purchase-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.purchaseSearch = input.value;
      state.selectedPurchaseId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='purchase-supplier']").forEach((select) => {
    select.addEventListener("change", () => {
      state.purchaseSupplierFilter = select.value || "all";
      state.selectedPurchaseId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='product-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.productSearch = input.value;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='product-category']").forEach((select) => {
    select.addEventListener("change", () => {
      state.productCategoryFilter = select.value || "all";
      commit();
    });
  });

  document.querySelectorAll("[data-filter='supplier-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.supplierSearch = input.value;
      state.selectedSupplierId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='supplier-product']").forEach((select) => {
    select.addEventListener("change", () => {
      state.supplierProductFilter = select.value || "all";
      state.selectedSupplierId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='menu-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.menuSearch = input.value;
      state.selectedMenuId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='menu-client']").forEach((select) => {
    select.addEventListener("change", () => {
      state.menuClientFilter = select.value || "all";
      state.selectedMenuId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='location-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.locationSearch = input.value;
      state.selectedLocationId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='location-kind']").forEach((select) => {
    select.addEventListener("change", () => {
      state.locationKindFilter = select.value || "all";
      state.selectedLocationId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='user-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.userSearch = input.value;
      state.selectedUserId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='user-role']").forEach((select) => {
    select.addEventListener("change", () => {
      state.userRoleFilter = select.value || "all";
      state.selectedUserId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='audit-search']").forEach((input) => {
    input.addEventListener("input", () => {
      state.auditSearch = input.value;
      state.selectedAuditEventId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-filter='audit-product']").forEach((select) => {
    select.addEventListener("change", () => {
      state.auditProductFilter = select.value || "all";
      state.selectedAuditEventId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-product-status-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.productStatusFilter = button.dataset.productStatusFilter ?? "active";
      commit();
    });
  });

  document.querySelectorAll("[data-stock-view]").forEach((button) => {
    button.addEventListener("click", () => {
      queueStockViewMotion(button.dataset.stockView);
      state.stockView = button.dataset.stockView;
      state.stockPage = 1;
      commit();
    });
  });

  document.querySelectorAll("[data-action-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextType = button.dataset.actionType;
      if (!nextType || nextType === state.form.type) return;
      animateActionTypeSelect(button);

      state.form = {
        ...state.form,
        type: nextType,
      };
      normalizeFormForType({ resetTemplateDefaults: true });
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

  document.querySelectorAll("[data-client-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.clientViewFilter = button.dataset.clientFilter ?? "all";
      state.selectedClientId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-sale-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.saleViewFilter = button.dataset.saleFilter ?? "all";
      state.selectedSaleId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-purchase-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.purchaseViewFilter = button.dataset.purchaseFilter ?? "all";
      state.selectedPurchaseId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-supplier-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.supplierViewFilter = button.dataset.supplierFilter ?? "all";
      state.selectedSupplierId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-menu-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.menuViewFilter = button.dataset.menuFilter ?? "all";
      state.selectedMenuId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-location-record-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.locationViewFilter = button.dataset.locationRecordFilter ?? "all";
      state.selectedLocationId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-user-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.userViewFilter = button.dataset.userFilter ?? "all";
      state.selectedUserId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-audit-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.auditViewFilter = button.dataset.auditFilter ?? "all";
      state.selectedAuditEventId = null;
      commit();
    });
  });

  document.querySelectorAll("[data-client-row]").forEach((row) => {
    const openClient = () => {
      queueRecordDetailMotion(state.activeView, "open");
      state.selectedClientId = row.dataset.clientId ?? null;
      commit();
    };
    row.addEventListener("click", openClient);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openClient();
    });
  });

  document.querySelectorAll("[data-sale-row]").forEach((row) => {
    const openSale = () => {
      queueRecordDetailMotion(state.activeView, "open");
      state.selectedSaleId = row.dataset.saleId ?? null;
      commit();
    };
    row.addEventListener("click", openSale);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSale();
    });
  });

  document.querySelectorAll("[data-purchase-row]").forEach((row) => {
    const openPurchase = () => {
      queueRecordDetailMotion(state.activeView, "open");
      state.selectedPurchaseId = row.dataset.purchaseId ?? null;
      commit();
    };
    row.addEventListener("click", openPurchase);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPurchase();
    });
  });

  document.querySelectorAll("[data-supplier-row]").forEach((row) => {
    const openSupplier = () => {
      queueRecordDetailMotion(state.activeView, "open");
      state.selectedSupplierId = row.dataset.supplierId ?? null;
      commit();
    };
    row.addEventListener("click", openSupplier);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSupplier();
    });
  });

  document.querySelectorAll("[data-menu-row]").forEach((row) => {
    const openMenu = () => {
      queueRecordDetailMotion(state.activeView, "open");
      state.selectedMenuId = row.dataset.menuId ?? null;
      commit();
    };
    row.addEventListener("click", openMenu);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openMenu();
    });
  });

  document.querySelectorAll("[data-location-row]").forEach((row) => {
    const openLocation = () => {
      queueRecordDetailMotion(state.activeView, "open");
      state.selectedLocationId = row.dataset.locationId ?? null;
      commit();
    };
    row.addEventListener("click", openLocation);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openLocation();
    });
  });

  document.querySelectorAll("[data-user-row]").forEach((row) => {
    const openUser = () => {
      queueRecordDetailMotion(state.activeView, "open");
      state.selectedUserId = row.dataset.userId ?? null;
      commit();
    };
    row.addEventListener("click", openUser);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openUser();
    });
  });

  document.querySelectorAll("[data-audit-row]").forEach((row) => {
    const openAudit = () => {
      queueRecordDetailMotion(state.activeView, "open");
      state.selectedAuditEventId = row.dataset.auditEventId ?? null;
      commit();
    };
    row.addEventListener("click", openAudit);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openAudit();
    });
  });

  document.querySelectorAll("[data-action='close-record-detail']").forEach((button) => {
    button.addEventListener("click", () => {
      queueRecordDetailMotion(state.activeView, "close");
      state.selectedClientId = null;
      state.selectedSaleId = null;
      state.selectedPurchaseId = null;
      state.selectedSupplierId = null;
      state.selectedMenuId = null;
      state.selectedLocationId = null;
      state.selectedUserId = null;
      state.selectedAuditEventId = null;
      commit();
    });
  });

  const workspace = document.querySelector(".workspace");
  workspace?.addEventListener("click", (event) => {
    if (state.activeView === "clients" && !state.selectedClientId) return;
    if (state.activeView === "sales" && !state.selectedSaleId) return;
    if (state.activeView === "purchases" && !state.selectedPurchaseId) return;
    if (state.activeView === "suppliers" && !state.selectedSupplierId) return;
    if (state.activeView === "menus" && !state.selectedMenuId) return;
    if (state.activeView === "locations" && !state.selectedLocationId) return;
    if (state.activeView === "users" && !state.selectedUserId) return;
    if (state.activeView === "audit" && !state.selectedAuditEventId) return;
    if (!["clients", "sales", "purchases", "suppliers", "menus", "locations", "users", "audit"].includes(state.activeView)) return;
    if (event.target.closest("[data-record-detail-panel]")) return;
    if (event.target.closest(".guide-menu")) return;
    if (event.target.closest("[data-client-row], [data-sale-row], [data-purchase-row], [data-supplier-row], [data-menu-row], [data-location-row], [data-user-row], [data-audit-row]")) return;
    if (event.target.closest("[data-client-filter], [data-sale-filter], [data-purchase-filter], [data-supplier-filter], [data-menu-filter], [data-location-record-filter], [data-user-filter], [data-audit-filter]")) return;
    if (event.target.closest("[data-filter='client-search'], [data-filter='client-menu'], [data-filter='purchase-search'], [data-filter='purchase-supplier'], [data-filter='supplier-search'], [data-filter='supplier-product'], [data-filter='menu-search'], [data-filter='menu-client'], [data-filter='location-search'], [data-filter='location-kind'], [data-filter='user-search'], [data-filter='user-role'], [data-filter='audit-search'], [data-filter='audit-product'], [data-custom-select]")) return;
    if (event.target.closest("[data-action='start-client-sale'], [data-action='start-supplier-purchase'], [data-action='open-stock-in-action'], [data-view], [data-action='close-record-detail']")) return;
    queueRecordDetailMotion(state.activeView, "close");
    state.selectedClientId = null;
    state.selectedSaleId = null;
    state.selectedPurchaseId = null;
    state.selectedSupplierId = null;
    state.selectedMenuId = null;
    state.selectedLocationId = null;
    state.selectedUserId = null;
    state.selectedAuditEventId = null;
    commit();
  });

  document.querySelectorAll("[data-action='start-client-sale']").forEach((button) => {
    button.addEventListener("click", () => startClientSale(button.dataset.clientId));
  });

  document.querySelectorAll("[data-action='start-menu-sale']").forEach((button) => {
    button.addEventListener("click", () => startMenuSale(button.dataset.menuItemId));
  });

  document.querySelectorAll("[data-action='start-supplier-purchase']").forEach((button) => {
    button.addEventListener("click", () => startSupplierPurchase(button.dataset.supplierId));
  });

  document.querySelectorAll("[data-action='open-stock-in-action']").forEach((button) => {
    button.addEventListener("click", () => openStockInAction());
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
      state.form = readEventFormState(data, state.form);

      if (
        event.target?.name === "physical_count" ||
        event.target?.name?.startsWith("physical_count_") ||
        event.target?.name === "attach_sale" ||
        event.target?.name === "attach_purchase"
      ) {
        commit();
        return;
      }

      saveState();
    });

    form.addEventListener("change", (event) => {
      const previousType = state.form.type;
      const data = new FormData(form);
      const nextType = data.get("type") ?? previousType;
      state.form = readEventFormState(data, { ...state.form, type: nextType });

      if (event.target?.name === "product_ids") {
        const option = event.target.closest(".product-check-option");
        animateProductOptionSelect(option, event.target.checked);
        commit();
        return;
      }

      if (event.target?.name?.startsWith("quantity_")) {
        saveState();
        return;
      }

      if (previousType !== nextType) {
        normalizeFormForType({ resetTemplateDefaults: true });
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

  const saleForm = document.querySelector("[data-form='sale']");
  if (saleForm) {
    saleForm.addEventListener("input", () => {
      updateSaleFormState(saleForm);
      saveState();
    });
    saleForm.addEventListener("change", () => {
      updateSaleFormState(saleForm);
      commit();
    });
    saleForm.addEventListener("submit", (event) => {
      event.preventDefault();
      fulfillSaleFromForm(saleForm);
    });
  }

  const purchaseForm = document.querySelector("[data-form='purchase']");
  if (purchaseForm) {
    purchaseForm.addEventListener("input", () => {
      updatePurchaseFormState(purchaseForm);
      saveState();
    });
    purchaseForm.addEventListener("change", () => {
      updatePurchaseFormState(purchaseForm);
      saveState();
    });
    purchaseForm.addEventListener("submit", (event) => {
      event.preventDefault();
      receivePurchaseFromForm(purchaseForm);
    });
  }

  const assistantForm = document.querySelector("[data-form='assistant']");
  if (assistantForm) {
    assistantForm.addEventListener("input", () => {
      const data = new FormData(assistantForm);
      state.assistantInput = data.get("assistant-question") ?? "";
    });
    assistantForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(assistantForm);
      submitAssistantQuestion(data.get("assistant-question"));
    });
    assistantForm.querySelector("textarea")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        assistantForm.requestSubmit();
      }
    });
  }

  document.querySelectorAll("[data-action='open-location-modal']").forEach((button) => {
    button.addEventListener("click", () => {
      state.locationModalOpen = true;
      state.locationForm = { ...defaultState().locationForm };
      state.guideOpen = false;
      commit();
    });
  });

  document.querySelectorAll("[data-action='close-location-modal']").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.currentTarget !== event.target && event.currentTarget.classList.contains("modal-backdrop")) return;
      state.locationModalOpen = false;
      commit();
    });
  });

  const locationForm = document.querySelector("[data-form='location']");
  if (locationForm) {
    locationForm.addEventListener("input", () => {
      state.locationForm = readLocationForm(locationForm);
      saveState();
    });
    locationForm.addEventListener("change", () => {
      state.locationForm = readLocationForm(locationForm);
      saveState();
    });
    locationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addLocationFromForm(locationForm);
    });
  }

  bindTabMotion();
  flushQueuedTabMotion(state);
  flushQueuedRecordDetailMotion(state);
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

function readSaleForm(form) {
  const data = new FormData(form);
  const defaults = defaultState().saleForm;

  return {
    client_id: `${data.get("client_id") ?? defaults.client_id}`.trim(),
    sale_type: `${data.get("sale_type") ?? defaults.sale_type}`.trim(),
    sale_mode: `${data.get("sale_mode") ?? defaults.sale_mode}`.trim(),
    menu_item_id: `${data.get("menu_item_id") ?? defaults.menu_item_id}`.trim(),
    product_id: `${data.get("product_id") ?? defaults.product_id}`.trim(),
    location: `${data.get("location") ?? defaults.location}`.trim(),
    quantity: data.get("quantity") ?? defaults.quantity,
    notes: `${data.get("notes") ?? ""}`,
  };
}

function readEventFormState(data, currentForm = state.form) {
  const selectedProductIds = normalizeSelectedProductIds(data.getAll("product_ids"), data.get("product_id") ?? currentForm.product_id);
  const quantities = { ...(currentForm.product_quantities ?? {}) };
  const physicalCounts = { ...(currentForm.product_physical_counts ?? {}) };
  const fallbackPhysicalCount = data.has("physical_count") ? data.get("physical_count") : currentForm.physical_count;
  selectedProductIds.forEach((productId) => {
    const quantityFieldName = `quantity_${productId}`;
    const physicalCountFieldName = `physical_count_${productId}`;
    quantities[productId] = data.has(quantityFieldName) ? data.get(quantityFieldName) : quantities[productId] ?? currentForm.quantity ?? 1;
    physicalCounts[productId] = data.has(physicalCountFieldName)
      ? data.get(physicalCountFieldName)
      : physicalCounts[productId] ?? (productId === selectedProductIds[0] ? fallbackPhysicalCount : "");
  });
  const selectedProductSet = new Set(selectedProductIds);
  Object.keys(physicalCounts).forEach((productId) => {
    if (!selectedProductSet.has(productId)) delete physicalCounts[productId];
  });

  return {
    ...currentForm,
    type: data.get("type") ?? currentForm.type,
    product_id: selectedProductIds[0] ?? data.get("product_id") ?? currentForm.product_id,
    product_ids: selectedProductIds,
    product_quantities: quantities,
    product_physical_counts: physicalCounts,
    from_location: data.get("from_location") ?? currentForm.from_location ?? "",
    to_location: data.get("to_location") ?? currentForm.to_location ?? "",
    quantity: data.has("quantity") ? data.get("quantity") : currentForm.quantity,
    physical_count: selectedProductIds.length ? physicalCounts[selectedProductIds[0]] ?? fallbackPhysicalCount ?? "" : fallbackPhysicalCount ?? "",
    reason: data.get("reason") ?? "",
    original_event_id: data.get("original_event_id") ?? currentForm.original_event_id ?? "",
    attach_sale: data.has("attach_sale"),
    attach_purchase: data.has("attach_purchase"),
    sale_client_id: `${data.get("sale_client_id") ?? currentForm.sale_client_id ?? DEFAULT_CLIENTS[0].id}`.trim(),
    sale_type: `${data.get("sale_type") ?? currentForm.sale_type ?? "one_time"}`.trim(),
    sale_notes: `${data.get("sale_notes") ?? currentForm.sale_notes ?? ""}`,
    purchase_supplier_id: `${data.get("purchase_supplier_id") ?? currentForm.purchase_supplier_id ?? DEFAULT_SUPPLIERS[0].id}`.trim(),
    purchase_notes: `${data.get("purchase_notes") ?? currentForm.purchase_notes ?? ""}`,
  };
}

function productQuantityForForm(productId) {
  return state.form.product_quantities?.[productId] ?? state.form.quantity ?? 1;
}

function readPurchaseForm(form) {
  const data = new FormData(form);
  const defaults = defaultState().purchaseForm;

  return {
    supplier_id: `${data.get("supplier_id") ?? defaults.supplier_id}`.trim(),
    product_id: `${data.get("product_id") ?? defaults.product_id}`.trim(),
    location: `${data.get("location") ?? defaults.location}`.trim(),
    quantity: data.get("quantity") ?? defaults.quantity,
    notes: `${data.get("notes") ?? ""}`,
  };
}

function readLocationForm(form) {
  const data = new FormData(form);
  const defaults = defaultState().locationForm;

  return {
    name: `${data.get("name") ?? defaults.name}`.trimStart(),
    kind: normalizeLocationKind(data.get("kind")),
    owner: `${data.get("owner") ?? defaults.owner}`.trimStart(),
    status: normalizeLocationStatus(data.get("status")),
  };
}

function addLocationFromForm(form) {
  const values = readLocationForm(form);
  const name = values.name.trim();
  const owner = values.owner.trim() || "Inventory team";

  if (!name) {
    showToast("Location name is required.", "error");
    return;
  }

  if (getLocations().some((location) => location.name.toLowerCase() === name.toLowerCase())) {
    showToast("A location with this name already exists.", "error");
    return;
  }

  const nextLocation = {
    id: nextLocationId(name, getLocations()),
    name,
    kind: values.kind,
    owner,
    status: values.status,
  };

  state.locations = [...getLocations(), nextLocation];
  state.locationForm = { ...defaultState().locationForm };
  state.locationModalOpen = false;
  state.selectedLocationId = nextLocation.id;
  showToast(`Location "${name}" added.`);
  commit();
}

function nextLocationId(name, locationRows) {
  const normalized = `${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "location";
  const ids = new Set(locationRows.map((location) => location.id));
  let candidate = `loc-${normalized}`;
  let suffix = 1;

  while (ids.has(candidate)) {
    candidate = `loc-${normalized}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function updateSaleFormState(form) {
  state.saleForm = {
    ...state.saleForm,
    ...readSaleForm(form),
  };
  normalizeSaleForm();
}

function updatePurchaseFormState(form) {
  state.purchaseForm = {
    ...state.purchaseForm,
    ...readPurchaseForm(form),
  };
}

function startSupplierPurchase(supplierId) {
  const supplier = DEFAULT_SUPPLIERS.find((candidate) => candidate.id === supplierId);
  if (!supplier) return;
  const productIds = supplier.products.filter((productId) => getProductById(productId)?.is_active !== false);

  state.form = {
    ...state.form,
    type: "STOCK_IN",
    product_id: productIds[0] ?? getActiveProducts()[0]?.id ?? "",
    product_ids: productIds.length ? productIds : [getActiveProducts()[0]?.id].filter(Boolean),
    product_quantities: {},
    from_location: "",
    to_location: state.form.to_location || "Cellar",
    quantity: 1,
    reason: "",
    attach_purchase: true,
    attach_sale: false,
    purchase_supplier_id: supplier.id,
    purchase_notes: "",
  };
  normalizeFormForType({ resetTemplateDefaults: false });
  state.activeView = "compose";
  state.selectedPurchaseId = null;
  state.selectedSupplierId = null;
  state.guideOpen = false;
  state.accountOpen = false;
  commit();
}

function openStockInAction() {
  const currentForm = state.form ?? defaultState().form;
  state.form = {
    ...currentForm,
    type: "STOCK_IN",
    from_location: "",
    to_location: currentForm.to_location || state.purchaseForm?.location || "Cellar",
    quantity: currentForm.quantity || 1,
    reason: currentForm.reason || "",
    original_event_id: "",
  };
  normalizeFormForType({ resetTemplateDefaults: false });
  state.activeView = "compose";
  state.selectedPurchaseId = null;
  state.guideOpen = false;
  state.accountOpen = false;
  shouldFocusActionOnCompose = true;
  commit();
}

function validBusinessQuantity(rawQuantity) {
  const quantity = Number(rawQuantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function isKnownLocation(locationName) {
  return getLocations().some((location) => location.name === locationName);
}

function normalizeSaleForm() {
  const defaults = defaultState().saleForm;
  const form = state.saleForm ?? defaults;
  const saleMode = saleModeLabels[form.sale_mode] ? form.sale_mode : defaults.sale_mode;
  const client = DEFAULT_CLIENTS.find((candidate) => candidate.id === form.client_id) ?? DEFAULT_CLIENTS[0];
  const clientMenuItems = menuItemsForClient(client.id);
  const existingMenuItem = getMenuItemById(form.menu_item_id);
  const selectedMenuItem =
    existingMenuItem && clientMenuItems.some((item) => item.id === existingMenuItem.id)
      ? existingMenuItem
      : clientMenuItems[0] ?? DEFAULT_MENU_ITEMS[0];
  const selectedProduct = getProductById(form.product_id)?.is_active === false ? null : getProductById(form.product_id);

  state.saleForm = {
    ...form,
    client_id: client.id,
    sale_type: saleTypeLabels[form.sale_type] ? form.sale_type : selectedMenuItem?.sale_type ?? defaults.sale_type,
    sale_mode: saleMode,
    menu_item_id: selectedMenuItem?.id ?? defaults.menu_item_id,
    product_id: selectedProduct?.id ?? getActiveProducts()[0]?.id ?? defaults.product_id,
    location: isKnownLocation(form.location) ? form.location : selectedMenuItem?.default_location ?? defaults.location,
  };
}

function startClientSale(clientId) {
  const client = DEFAULT_CLIENTS.find((candidate) => candidate.id === clientId);
  if (!client) return;
  const menuItem = menuItemsForClient(client.id)[0] ?? null;
  const recipe = menuItem?.recipe ?? [];
  const productIds = recipe.length ? recipe.map((line) => line.product_id) : [getActiveProducts()[0]?.id].filter(Boolean);
  const quantities = Object.fromEntries(recipe.map((line) => [line.product_id, line.quantity]));

  state.form = {
    ...state.form,
    type: "STOCK_OUT",
    product_id: productIds[0] ?? "",
    product_ids: productIds,
    product_quantities: quantities,
    from_location: menuItem?.default_location ?? state.form.from_location ?? "Main Bar",
    to_location: "",
    quantity: 1,
    reason: "",
    attach_sale: true,
    attach_purchase: false,
    sale_client_id: client.id,
    sale_type: menuItem?.sale_type ?? "recurring",
    sale_notes: menuItem ? menuItem.name : "",
  };
  normalizeFormForType({ resetTemplateDefaults: false });
  state.activeView = "compose";
  state.selectedClientId = null;
  state.selectedSaleId = null;
  state.guideOpen = false;
  state.accountOpen = false;
  commit();
}

function startMenuSale(menuItemId) {
  const menuItem = getMenuItemById(menuItemId);
  if (!menuItem) return;
  const client = clientForMenuItem(menuItem.id);
  const productIds = menuItem.recipe.map((line) => line.product_id);
  const quantities = Object.fromEntries(menuItem.recipe.map((line) => [line.product_id, line.quantity]));

  state.form = {
    ...state.form,
    type: "STOCK_OUT",
    product_id: productIds[0] ?? getActiveProducts()[0]?.id ?? "",
    product_ids: productIds,
    product_quantities: quantities,
    from_location: menuItem.default_location,
    to_location: "",
    quantity: 1,
    reason: "",
    attach_sale: true,
    attach_purchase: false,
    sale_client_id: client?.id ?? DEFAULT_CLIENTS[0].id,
    sale_type: menuItem.sale_type,
    sale_notes: menuItem.name,
  };
  normalizeFormForType({ resetTemplateDefaults: false });
  state.activeView = "compose";
  state.selectedClientId = null;
  state.selectedSaleId = null;
  state.guideOpen = false;
  state.accountOpen = false;
  commit();
}

function fulfillSaleFromForm(form) {
  const values = readSaleForm(form);
  state.saleForm = {
    ...(state.saleForm ?? defaultState().saleForm),
    ...values,
  };
  normalizeSaleForm();
  const normalized = state.saleForm;

  const client = DEFAULT_CLIENTS.find((candidate) => candidate.id === normalized.client_id);
  const saleMode = saleModeLabels[normalized.sale_mode] ? normalized.sale_mode : "menu_item";
  const quantity = validBusinessQuantity(normalized.quantity);
  const notes = normalized.notes.trim();

  if (!client) {
    showToast("Choose a client before fulfilling the sale.", "error");
    commit();
    return;
  }

  if (!saleTypeLabels[normalized.sale_type]) {
    showToast("Choose a sale type before fulfilling the sale.", "error");
    commit();
    return;
  }

  if (!isKnownLocation(normalized.location)) {
    showToast("Choose where the sale was fulfilled from.", "error");
    commit();
    return;
  }

  if (quantity === null) {
    showToast("Enter an amount sold greater than zero.", "error");
    commit();
    return;
  }

  const saleId = nextId("sale");
  const workItemId = nextId("work-sale");
  const timestamp = Date.now();
  const batchId = currentBatchId();
  let sequence = nextSequence();
  let events = [];
  let saleProductId = normalized.product_id;
  let saleMenuItemId = null;
  let saleItemLabel = "";

  if (saleMode === "menu_item") {
    const menuItem = getMenuItemById(normalized.menu_item_id);
    if (!menuItem) {
      showToast("Choose a menu item before fulfilling the sale.", "error");
      commit();
      return;
    }

    if (menuItem.recipe.length === 0) {
      showToast("This menu item has no recipe lines to deduct.", "error");
      commit();
      return;
    }

    const inactiveLine = menuItem.recipe.find((line) => getProductById(line.product_id)?.is_active === false);
    if (inactiveLine) {
      showToast("A recipe product is suspended. Reactivate it before fulfilling this sale.", "error");
      commit();
      return;
    }

    saleProductId = menuItem.recipe[0]?.product_id ?? normalized.product_id;
    saleMenuItemId = menuItem.id;
    saleItemLabel = menuItem.name;
    events = menuItem.recipe.map((line) => {
      const lineQuantity = Number((Number(line.quantity) * quantity).toFixed(4));
      return withWorkItem(
        createInventoryEvent({
          ...tenant,
          event_id: nextId("sale-stock-out"),
          idempotency_key: nextId("idem-sale"),
          sync_batch_id: batchId,
          type: "STOCK_OUT",
          product_id: line.product_id,
          product_name: productName(line.product_id),
          from_location: normalized.location,
          to_location: null,
          quantity: lineQuantity,
          reason: notes || `${saleTypeLabels[normalized.sale_type]} menu sale fulfilled for ${client.name}`,
          source_type: "sale",
          source_id: saleId,
          source_label: `Sale - ${client.name} - ${menuItem.name}`,
          sequence_number: sequence++,
          timestamp,
          status: "queued",
        }),
        workItemId,
      );
    });
  } else {
    const product = getProductById(normalized.product_id);
    if (!product || product.is_active === false) {
      showToast("Choose an active product before fulfilling the sale.", "error");
      commit();
      return;
    }

    saleProductId = product.id;
    saleItemLabel = product.name;
    events = [
      withWorkItem(
        createInventoryEvent({
          ...tenant,
          event_id: nextId("sale-stock-out"),
          idempotency_key: nextId("idem-sale"),
          sync_batch_id: batchId,
          type: "STOCK_OUT",
          product_id: product.id,
          product_name: product.name,
          from_location: normalized.location,
          to_location: null,
          quantity,
          reason: notes || `${saleTypeLabels[normalized.sale_type]} sale fulfilled for ${client.name}`,
          source_type: "sale",
          source_id: saleId,
          source_label: `Sale - ${client.name} - ${product.name}`,
          sequence_number: sequence++,
          timestamp,
          status: "queued",
        }),
        workItemId,
      ),
    ];
  }

  const invalidEntry = events
    .map((event) => ({ event, validation: validateEvent(event) }))
    .find((entry) => !entry.validation.valid);

  if (invalidEntry) {
    showToast(simpleValidationReason(invalidEntry.validation.reason), "error");
    commit();
    return;
  }

  state.sales = [
    ...(Array.isArray(state.sales) ? state.sales : []),
    {
      id: saleId,
      client_id: client.id,
      sale_type: normalized.sale_type,
      sale_mode: saleMode,
      menu_item_id: saleMenuItemId,
      product_id: saleProductId,
      item_label: saleItemLabel,
      location: normalized.location,
      quantity,
      notes,
      event_id: events[0]?.event_id ?? null,
      event_count: events.length,
      work_item_id: workItemId,
      created_at: new Date(timestamp).toISOString(),
      status: "queued",
    },
  ];
  state.outbox = [...state.outbox, ...events];
  state.saleForm = {
    ...normalized,
    quantity: 1,
    notes: "",
  };

  showToast(
    events.length === 1
      ? "Sale fulfilled locally. STOCK_OUT is waiting to send."
      : `Sale fulfilled locally. ${events.length} STOCK_OUT events are waiting to send.`,
  );
  commit();
}

function receivePurchaseFromForm(form) {
  const values = readPurchaseForm(form);
  state.purchaseForm = values;

  const supplier = DEFAULT_SUPPLIERS.find((candidate) => candidate.id === values.supplier_id);
  const product = getProductById(values.product_id);
  const quantity = validBusinessQuantity(values.quantity);
  const notes = values.notes.trim();

  if (!supplier) {
    showToast("Choose a supplier before receiving the purchase.", "error");
    commit();
    return;
  }

  if (!product || product.is_active === false) {
    showToast("Choose an active product before receiving the purchase.", "error");
    commit();
    return;
  }

  if (!isKnownLocation(values.location)) {
    showToast("Choose where the purchase was received.", "error");
    commit();
    return;
  }

  if (quantity === null) {
    showToast("Enter an amount received greater than zero.", "error");
    commit();
    return;
  }

  const purchaseId = nextId("purchase");
  const workItemId = nextId("work-purchase");
  const timestamp = Date.now();
  const event = withWorkItem(
    createInventoryEvent({
      ...tenant,
      event_id: nextId("purchase-stock-in"),
      idempotency_key: nextId("idem-purchase"),
      sync_batch_id: currentBatchId(),
      type: "STOCK_IN",
      product_id: product.id,
      product_name: product.name,
      from_location: null,
      to_location: values.location,
      quantity,
      reason: notes || `Purchase received from ${supplier.name}`,
      source_type: "purchase",
      source_id: purchaseId,
      source_label: `Purchase - ${supplier.name}`,
      sequence_number: nextSequence(),
      timestamp,
      status: "queued",
    }),
    workItemId,
  );
  const validation = validateEvent(event);

  if (!validation.valid) {
    showToast(simpleValidationReason(validation.reason), "error");
    commit();
    return;
  }

  state.purchases = [
    ...(Array.isArray(state.purchases) ? state.purchases : []),
    {
      id: purchaseId,
      supplier_id: supplier.id,
      product_id: product.id,
      location: values.location,
      quantity,
      notes,
      event_id: event.event_id,
      work_item_id: workItemId,
      created_at: new Date(timestamp).toISOString(),
      status: "queued",
    },
  ];
  state.outbox = [...state.outbox, event];
  state.purchaseForm = {
    ...values,
    quantity: 1,
    notes: "",
  };
  state.selectedPurchaseId = null;

  showToast("Purchase received locally. STOCK_IN is waiting to send.");
  commit();
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

  const events = buildEventsFromForm();
  if (events.length === 0) {
    showToast("Choose at least one product.", "error");
    commit();
    return;
  }

  const invalid = events.map((event) => ({ event, validation: validateEvent(event) })).find((entry) => !entry.validation.valid);

  if (invalid) {
    showToast(simpleValidationReason(invalid.validation.reason), "error");
    commit();
    return;
  }

  createBusinessRecordFromStockAction(events);
  state.outbox.push(...events);
  const label = eventLabels[events[0].type] ?? events[0].type;
  const sourceType = events[0]?.source_type;
  showToast(
    sourceType === "sale"
      ? `Sale recorded locally. ${events.length} STOCK_OUT event${events.length === 1 ? "" : "s"} are waiting to send.`
      : sourceType === "purchase"
      ? `Purchase recorded locally. ${events.length} STOCK_IN event${events.length === 1 ? "" : "s"} are waiting to send.`
      : `${label} saved locally${events.length > 1 ? ` as ${events.length} grouped events` : ""}. Send work when online.`,
  );
  state.form.quantity = 1;
  state.form.product_quantities = {};
  state.form.product_physical_counts = {};
  state.form.physical_count = "";
  state.form.original_event_id = "";
  state.form.reason = "";
  state.form.attach_sale = false;
  state.form.attach_purchase = false;
  state.form.sale_notes = "";
  state.form.purchase_notes = "";
  normalizeFormForType();
  commit();
}

function createBusinessRecordFromStockAction(events) {
  const result = appendStockActionBusinessRecord(
    { sales: state.sales, purchases: state.purchases },
    events,
    state.form,
    { clients: DEFAULT_CLIENTS, suppliers: DEFAULT_SUPPLIERS, saleTypeLabels, productName },
  );
  state.sales = result.sales;
  state.purchases = result.purchases;
  if ("selectedSaleId" in result) state.selectedSaleId = result.selectedSaleId;
  if ("selectedPurchaseId" in result) state.selectedPurchaseId = result.selectedPurchaseId;
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

  const sentEvents = state.outbox;
  state.serverLedger = result.ledger;
  markBusinessRecordsSynced(sentEvents);
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
  rollbackBusinessRecordForUndo(primary);
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

function rollbackBusinessRecordForUndo(primaryEvent) {
  const result = removeStockActionBusinessRecordForUndo({ sales: state.sales, purchases: state.purchases }, primaryEvent);
  state.sales = result.sales;
  state.purchases = result.purchases;
}

function markBusinessRecordsSynced(events) {
  const result = markStockActionBusinessRecordsSynced({ sales: state.sales, purchases: state.purchases }, events);
  state.sales = result.sales;
  state.purchases = result.purchases;
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
    product_physical_counts: {},
    reason: "",
    original_event_id: original.event_id,
  };
  state.activeView = "compose";
  shouldFocusActionOnCompose = true;
  showToast("Undo Record is ready for review. Add a reason, then save the action.");
  commit();
}

function hasReversalForEvent(eventId) {
  return allLocalEvents().some((event) => event.type === "STOCK_REVERT" && event.original_event_id === eventId);
}

function isRevertibleEvent(eventType) {
  return REVERTIBLE_EVENT_TYPES.has(eventType);
}

function buildEventsFromForm() {
  return stockActionEventBuilder().buildEvents(state.form);
}

function buildEventFromForm(options = {}) {
  return stockActionEventBuilder().buildEvent(state.form, options);
}

function quantityForProduct(form, productId) {
  return selectQuantityForProduct(form, productId);
}

function stockActionEventBuilder() {
  return createStockActionEventBuilder({
    tenant,
    nextId,
    currentBatchId,
    nextSequence,
    findEventForRevert,
    productName,
    formatQuantity,
    systemCountForProduct: currentSystemCountForProduct,
    sourceDetailsOptions: {
      clients: DEFAULT_CLIENTS,
      suppliers: DEFAULT_SUPPLIERS,
      saleTypeLabels,
    },
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

function normalizeFormForType({ resetTemplateDefaults = false } = {}) {
  const template = actionTemplate(state.form.type);
  const defaults = template.defaults ?? {};
  const selectableProducts = template.kind === "product-reactivate" ? getInactiveProducts() : getActiveProducts();

  if (state.form.type === "PRODUCT_CREATED") {
    state.form.product_id = "";
    state.form.product_ids = [];
  } else if (!selectableProducts.some((product) => product.id === state.form.product_id)) {
    const selectedIds = selectedProductIdsForScope(template.kind === "product-reactivate" ? "inactive" : "active", selectableProducts);
    state.form.product_ids = selectedIds;
    state.form.product_id = selectedIds[0] ?? "";
  } else {
    const availableIds = new Set(selectableProducts.map((product) => product.id));
    const selectedIds = normalizeSelectedProductIds(state.form.product_ids, state.form.product_id).filter((id) => availableIds.has(id));
    state.form.product_ids = selectedIds.length ? selectedIds : selectableProducts[0]?.id ? [selectableProducts[0].id] : [];
    state.form.product_id = state.form.product_ids[0] ?? "";
  }

  state.form.from_location = template.showFromLocation
    ? resetTemplateDefaults
      ? defaults.from_location || ""
      : state.form.from_location || defaults.from_location || ""
    : "";
  state.form.to_location = template.showToLocation
    ? resetTemplateDefaults
      ? defaults.to_location || ""
      : state.form.to_location || defaults.to_location || ""
    : "";
  state.form.original_event_id = template.showOriginalEvent
    ? resetTemplateDefaults
      ? defaults.original_event_id || ""
      : state.form.original_event_id || defaults.original_event_id || ""
    : "";

  if (template.quantityEditable) {
    const parsedQuantity = Number(state.form.quantity);
    if (resetTemplateDefaults || !Number.isFinite(parsedQuantity) || parsedQuantity === 0) {
      state.form.quantity = defaults.quantity ?? 1;
    }
  } else {
    state.form.quantity = defaults.quantity ?? 1;
  }

  if (template.isPhysicalCount) {
    const selectedProductSet = new Set(state.form.product_ids ?? []);
    const currentPhysicalCounts = state.form.product_physical_counts ?? {};
    state.form.product_physical_counts = Object.fromEntries(
      [...selectedProductSet].map((productId) => [
        productId,
        resetTemplateDefaults
          ? defaults.physical_count ?? ""
          : currentPhysicalCounts[productId] ?? (productId === state.form.product_id ? state.form.physical_count ?? "" : ""),
      ]),
    );
    state.form.physical_count = state.form.product_physical_counts[state.form.product_id] ?? defaults.physical_count ?? "";
  } else {
    state.form.product_physical_counts = {};
    state.form.physical_count = "";
  }

  if (state.form.type !== "STOCK_OUT") {
    state.form.attach_sale = false;
  }
  if (state.form.type !== "STOCK_IN") {
    state.form.attach_purchase = false;
  }
}

function allLocalEvents() {
  return selectAllLocalEvents(state);
}

function filteredStockRows(events) {
  return selectFilteredStockRows(events, {
    products: getProductCatalog(),
    locations: getLocations(),
    productFilter: state.productFilter,
    locationFilter: state.locationFilter,
    stockSearch: state.stockSearch,
  });
}

function stockTotalRows(rows) {
  return selectStockTotalRows(rows, getProductCatalog());
}

function locationStockRows(rows) {
  return selectLocationStockRows(rows, state.selectedLocation);
}

function stockState(row) {
  const status = stockStatus(row, productLow(row.product_id));
  return `<span class="badge is-${status.tone}">${status.label}</span>`;
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

function currentBatchId() {
  return selectCurrentBatchId(state, allLocalEvents());
}

function nextSequence() {
  return selectNextSequence(allLocalEvents());
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
    sales: "send",
    purchases: "receipt",
    clients: "briefcase",
    suppliers: "truck",
    menus: "utensils",
    products: "package",
    locations: "map",
    compose: "clipboardPlus",
    reports: "chart",
    audit: "history",
    users: "users",
    settings: "sliders",
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
    receipt: '<path d="M6 3h12v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 21V3Z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/>',
    briefcase: '<path d="M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1"/><path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/><path d="M3 13h18"/><path d="M10 13v2h4v-2"/>',
    truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7z"/><path d="M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>',
    utensils: '<path d="M6 3v8"/><path d="M4 3v4a2 2 0 0 0 4 0V3"/><path d="M6 11v10"/><path d="M17 3v18"/><path d="M14 3h3a3 3 0 0 1 0 6h-3"/>',
    package: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/><path d="m8 5 8 4"/>',
    clipboardPlus: '<path d="M9 4h6"/><path d="M10 2h4a2 2 0 0 1 2 2v2H8V4a2 2 0 0 1 2-2Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M12 11v6"/><path d="M9 14h6"/>',
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><path d="M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    sliders: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>',
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
  return (screenMeta[state.activeView] ?? screenMeta.dashboard).title;
}

function getProductCatalog() {
  return Array.isArray(state.products) ? state.products : defaultProducts();
}

function getLocations() {
  return Array.isArray(state.locations) ? state.locations : defaultLocations();
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
    state.form.product_ids = [];
  } else if (state.form.type === "PRODUCT_REACTIVATED") {
    const inactiveProducts = getInactiveProducts();
    const inactiveProductIds = new Set(inactiveProducts.map((product) => product.id));
    state.form.product_ids = normalizeSelectedProductIds(state.form.product_ids, state.form.product_id).filter((id) => inactiveProductIds.has(id));
    if (!state.form.product_ids.length && inactiveProducts[0]?.id) state.form.product_ids = [inactiveProducts[0].id];
    state.form.product_id = state.form.product_ids[0] ?? "";
  } else if (!activeProductIds.has(state.form.product_id)) {
    state.form.product_ids = normalizeSelectedProductIds(state.form.product_ids, state.form.product_id).filter((id) => activeProductIds.has(id));
    if (!state.form.product_ids.length && activeProducts[0]?.id) state.form.product_ids = [activeProducts[0].id];
    state.form.product_id = state.form.product_ids[0] ?? "";
  } else {
    state.form.product_ids = normalizeSelectedProductIds(state.form.product_ids, state.form.product_id).filter((id) => activeProductIds.has(id));
    if (!state.form.product_ids.length && state.form.product_id) state.form.product_ids = [state.form.product_id];
  }

  const siteLocations = getLocations();
  if (state.selectedLocation && !siteLocations.some((location) => location.name === state.selectedLocation)) {
    state.selectedLocation = siteLocations[0]?.name ?? "Main Bar";
  }
}

function productLastStateLabel(product) {
  return selectProductLastStateLabel(product, { displayDateTime });
}

function getProductDeactivationClosures(product) {
  return productDeactivationClosures(product, allLocalEvents());
}

function formatDeactivationClosures(closures) {
  return formatLifecycleClosures(closures, { formatQuantity });
}

function formatMultiProductDeactivationClosures(products) {
  return formatLifecycleMultiProductClosures(products, { events: allLocalEvents(), formatQuantity });
}

function hasPendingProductClosureDebt(productId) {
  return selectHasPendingProductClosureDebt(state.outbox, productId);
}

function suspendProductFromAction() {
  const selectedProducts = selectedProductIdsForScope("active", getActiveProducts())
    .map((productId) => getProductById(productId))
    .filter((product) => product?.is_active);
  if (selectedProducts.length === 0) {
    showToast("Choose at least one active product to suspend.", "error");
    return;
  }

  const busyKey = selectedProducts.map((product) => product.id).join("|");
  if (productLifecycleBusy === busyKey) return;

  const closurePreview = selectedProducts
    .map((product) => `${product.name}: ${formatDeactivationClosures(getProductDeactivationClosures(product))}`)
    .join("\n");
  const shouldProceed = window.confirm(
    `Suspend ${selectedProducts.length === 1 ? `"${selectedProducts[0].name}"` : `${selectedProducts.length} products`}?\n\nStock Closure Preview:\n${closurePreview}\n\nThis will add STOCK_ADJUSTMENT closure work per affected location and then mark each product inactive.`,
  );
  if (!shouldProceed) return;

  productLifecycleBusy = busyKey;
  try {
    const actorReason = `${state.form.reason ?? ""}`.trim();
    const timestamp = Date.now();
    const queuedEvents = buildProductSuspensionWork(selectedProducts, allLocalEvents(), {
      tenant,
      reason: actorReason,
      nextId,
      currentBatchId,
      nextSequence,
      now: () => timestamp,
    });

    state.outbox = [...state.outbox, ...queuedEvents];
    state.products = applyProductSuspension(getProductCatalog(), selectedProducts, {
      reason: actorReason,
      tenant,
      now: () => timestamp,
    });

    showToast(`${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"} suspended locally. ${queuedEvents.length} event${queuedEvents.length === 1 ? "" : "s"} waiting to send.`);

    state.form.reason = "";
    ensureProductSelectionIntegrity();
    commit();
  } finally {
    productLifecycleBusy = null;
  }
}

function reactivateProductFromAction() {
  const selectedProducts = selectedProductIdsForScope("inactive", getInactiveProducts())
    .map((productId) => getProductById(productId))
    .filter((product) => product && !product.is_active);
  if (selectedProducts.length === 0) {
    showToast("Choose at least one suspended product to reactivate.", "error");
    return;
  }

  const warning = selectedProducts.some((product) => hasPendingProductClosureDebt(product.id))
    ? "There are pending suspension closure events for this product in Work to Send."
    : "";

  const shouldProceed = window.confirm(
    `Reactivate ${selectedProducts.length === 1 ? `"${selectedProducts[0].name}"` : `${selectedProducts.length} products`}?\n\nReactivation does not create any stock movement events. Current stock (replayed) becomes immediately reusable.${warning ? `\n\n${warning}` : ""}`,
  );
  if (!shouldProceed) return;
  const actorReason = `${state.form.reason ?? ""}`.trim();
  const timestamp = Date.now();
  const reactivationEvents = buildProductReactivationWork(selectedProducts, {
    tenant,
    reason: actorReason,
    nextId,
    currentBatchId,
    nextSequence,
    now: () => timestamp,
  });

  state.products = applyProductReactivation(getProductCatalog(), selectedProducts, { tenant, now: () => timestamp });
  state.outbox = [...state.outbox, ...reactivationEvents];

  showToast(`${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"} active again. Reactivation does not create stock movement events.`);
  state.form.reason = "";
  ensureProductSelectionIntegrity();
  commit();
}

function getProductById(productId) {
  return getProductCatalog().find((product) => product.id === productId);
}

function getMenuById(menuId) {
  return DEFAULT_MENUS.find((menu) => menu.id === menuId);
}

function getMenuItemById(menuItemId) {
  return DEFAULT_MENU_ITEMS.find((item) => item.id === menuItemId);
}

function menuItemsForMenu(menuId) {
  return DEFAULT_MENU_ITEMS.filter((item) => item.menu_id === menuId);
}

function menuItemsForClient(clientId) {
  const menuIds = new Set(DEFAULT_MENUS.filter((menu) => menu.client_id === clientId).map((menu) => menu.id));
  return DEFAULT_MENU_ITEMS.filter((item) => menuIds.has(item.menu_id));
}

function clientForMenuItem(menuItemId) {
  const menuItem = getMenuItemById(menuItemId);
  const menu = menuItem ? getMenuById(menuItem.menu_id) : null;
  return menu ? DEFAULT_CLIENTS.find((client) => client.id === menu.client_id) : null;
}

function clientName(clientId) {
  return DEFAULT_CLIENTS.find((client) => client.id === clientId)?.name ?? "Unknown client";
}

function supplierName(supplierId) {
  return DEFAULT_SUPPLIERS.find((supplier) => supplier.id === supplierId)?.name ?? "Unknown supplier";
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

function formatAuditBalance(value) {
  if (!Number.isFinite(Number(value))) return "N/A";
  return formatQuantity(value);
}


render();
