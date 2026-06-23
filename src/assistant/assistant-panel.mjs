import {
  answerAssistantQuestion as answerAssistantQuestionFromContext,
  createAssistantGreeting as createAssistantGreetingFromContext,
} from "./assistant-engine.mjs";
import { escapeAttr, escapeHtml } from "../utils/format.mjs";

export function buildGuideNotifications({ state, stockRows, productLow, productUnit, formatQuantity }) {
  const rows = Array.isArray(stockRows) ? stockRows : [];
  const lowRows = rows.filter((row) => row.quantity >= 0 && row.quantity <= productLow(row.product_id));
  const negativeRows = rows.filter((row) => row.quantity < 0);
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

export function guideCueCount(notifications) {
  return notifications.length;
}

export function renderStockyIcon(className = "stocky-avatar") {
  return `<span class="${className}" aria-hidden="true"><img src="/stocky.svg" alt="" /></span>`;
}

export function renderAssistantMenu({ state, meta, messages, icon }) {
  return `
    <div class="guide-menu assistant-menu" role="dialog" aria-label="Stocky Assistant">
      <div class="guide-menu-header">
        <div class="assistant-title">
          ${renderStockyIcon("stocky-avatar stocky-avatar-header")}
          <div class="assistant-title-copy">
            <span>Stocky</span>
            <strong>${meta.title}</strong>
          </div>
        </div>
        <button class="icon-button assistant-menu-close" data-action="toggle-guide" type="button" aria-label="Close Stocky">${icon("close")}</button>
      </div>
      <div class="assistant-feed" aria-live="polite">
        ${messages.map(renderAssistantMessage).join("")}
      </div>
      <form class="assistant-form" data-form="assistant">
        <label class="assistant-input-label">
          <span>Ask Stocky</span>
          <textarea name="assistant-question" rows="2" aria-label="Ask about StockLedger" placeholder="Ask for help with stock levels, pending work, actions, audit, sales, purchases, or what you should do next.">${escapeHtml(state.assistantInput ?? "")}</textarea>
        </label>
        <button class="button button-primary" type="submit">${icon("send")}Send</button>
      </form>
    </div>
  `;
}

export function assistantMessagesForRender(state, createGreeting) {
  if (Array.isArray(state.assistantMessages) && state.assistantMessages.length > 0) {
    return state.assistantMessages;
  }

  return [createGreeting()];
}

export function createAssistantGreetingMessage(context, nextId) {
  const greeting = createAssistantGreetingFromContext(context);

  return {
    id: nextId("assistant"),
    role: "assistant",
    ...greeting,
  };
}

export function answerAssistantQuestion(question, context) {
  return answerAssistantQuestionFromContext(question, context);
}

export function createAssistantContext({
  state,
  screenMeta,
  actionTemplates,
  eventLabels,
  guideTipsForView,
  notifications,
  stockRows,
  stockTotals,
  products,
  locations,
  clients,
  suppliers,
  menuItems,
  menus,
  sales,
  purchases,
  users,
  settingsPolicies,
  numberingRules,
  productUnit,
  productLow,
  productName,
  clientName,
  supplierName,
  outbox,
  workItems,
  validations,
  formatQuantity,
}) {
  return {
    activeView: state.activeView,
    recentMessages: Array.isArray(state.assistantMessages) ? state.assistantMessages.slice(-8) : [],
    screenMeta,
    actionTemplates,
    eventLabels,
    guideTipsForView,
    notifications,
    pageActions,
    stockRows,
    stockTotals,
    products,
    locations,
    clients,
    suppliers,
    menuItems,
    menus,
    sales: Array.isArray(sales) ? sales : [],
    purchases: Array.isArray(purchases) ? purchases : [],
    users,
    settingsPolicies,
    numberingRules,
    productUnit,
    productLow,
    productName,
    clientName,
    supplierName,
    outbox,
    workItems,
    validations,
    formatQuantity,
  };
}

export function pageActions(view) {
  if (view === "home") return [{ label: "Open Stock Overview", view: "dashboard" }, { label: "Open Stock Actions", view: "compose" }];
  if (view === "dashboard") return [{ label: "Open Stock Actions", view: "compose" }, { label: "Open Reports", view: "reports" }];
  if (view === "compose") return [{ label: "Open Stock Overview", view: "dashboard" }, { label: "Open Audit Trail", view: "audit" }];
  if (view === "audit") return [{ label: "Open Stock Actions", view: "compose" }, { label: "Open Stock Overview", view: "dashboard" }];
  if (view === "sales") return [{ label: "Open Stock Actions", view: "compose" }, { label: "Open Clients", view: "clients" }];
  if (view === "purchases") return [{ label: "Open Stock Actions", view: "compose" }, { label: "Open Suppliers", view: "suppliers" }];
  if (view === "products") return [{ label: "Open Stock Actions", view: "compose" }, { label: "Open Stock Overview", view: "dashboard" }];
  return [{ label: "Open Stock Actions", view: "compose" }, { label: "Open Audit Trail", view: "audit" }];
}

export function renderAssistantMessage(message) {
  const role = message.role === "user" ? "user" : "assistant";
  const actions = Array.isArray(message.actions) ? message.actions : [];
  return `
    <article class="assistant-message is-${role}">
      <div class="assistant-message-meta">
        ${role === "assistant" ? renderStockyIcon("stocky-avatar stocky-avatar-message") : ""}
        <span>${role === "user" ? "You" : "Stocky"}</span>
      </div>
      <p>${formatAssistantText(message.text)}</p>
      ${
        actions.length
          ? `<div class="assistant-message-actions">
              ${actions.map((action) => `<button class="table-action" data-view="${escapeAttr(action.view)}" type="button">${escapeHtml(action.label)}</button>`).join("")}
            </div>`
          : ""
      }
    </article>
  `;
}

export function formatAssistantText(text) {
  return escapeHtml(text).replace(/\n/g, "<br />");
}
