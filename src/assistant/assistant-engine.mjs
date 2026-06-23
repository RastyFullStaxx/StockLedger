const HIGH_CONFIDENCE_KNOWLEDGE_SCORE = 6;

export function createAssistantGreeting(context) {
  const activeView = context.activeView ?? "dashboard";
  const meta = context.screenMeta[activeView] ?? context.screenMeta.dashboard;
  const tips = context.guideTipsForView(activeView).slice(0, 3);
  const notifications = context.notifications().slice(0, 2);
  const actionLines = pageAssistantActions(activeView, context).slice(0, 3);
  const notificationText = notifications.length
    ? notifications.map((item) => `- ${item.title}: ${item.text}`).join("\n")
    : "- Nothing urgent is showing right now.";

  return {
    text: `Hi, I’m Stocky. I’m here on ${meta.title} to help you keep stock actions simple and safe.\n\n${pagePurposeText(meta)}\n\nA good place to start is: ${humanJoin(tips.map(cleanTipForSentence))}.\n\nWhat looks like this right now:\n${notificationText}\n\nAsk me about stock counts, saved work, what to do next, how an action works, or why a number looks off.`,
    actions: actionLines,
  };
}

export function answerAssistantQuestion(question, context) {
  const normalized = normalizeAssistantText(question);
  const activeView = context.activeView ?? "dashboard";
  const meta = context.screenMeta[activeView] ?? context.screenMeta.dashboard;
  const smallTalk = assistantSmallTalkAnswer(normalized, meta, context);
  const knowledgeMatches = retrieveAssistantKnowledge(question, context);
  const topKnowledgeScore = knowledgeMatches[0]?.score ?? 0;
  const confidentMatches = knowledgeMatches.filter((entry) => entry.score >= HIGH_CONFIDENCE_KNOWLEDGE_SCORE);

  if (smallTalk) return smallTalk;

  if (matchesAny(normalized, ["help", "help me", "how can i use", "what can you do", "what can you help", "walk me through", "explain"])) {
    return assistantCapabilitiesAnswer(context, meta);
  }

  if (matchesAny(normalized, ["what should i do", "what next", "next step", "help me", "guide me", "where should i start", "best next step", "what do i do now"])) {
    return {
      text: `On ${meta.title}, I’d start with what is most useful today: ${humanJoin(context.guideTipsForView(activeView).slice(0, 3).map(cleanTipForSentence))}. If you are unsure, check notifications first and then record the action that matches what actually happened.`,
      actions: [
        ...pageAssistantActions(activeView, context).slice(0, 2),
        { label: "Notifications", view: activeView },
      ],
    };
  }

  if (matchesAny(normalized, ["what is this page", "current page", "this page for", "where am i", "about this page"])) {
    const tips = context.guideTipsForView(activeView).slice(0, 4).map((tip) => `- ${tip}`).join("\n");
    return {
      text: `${meta.title}: ${pagePurposeText(meta)}\n\nHere’s what this page is for:\n${tips}`,
      actions: pageAssistantActions(activeView, context),
    };
  }

  if (matchesAny(normalized, ["notification", "attention", "urgent", "need review", "needs attention", "problem", "warning", "issue", "alert", "what needs attention now"])) {
    return assistantNotificationAnswer(context);
  }

  if (matchesAny(normalized, ["how many stock", "how much stock", "stock count", "total stock", "inventory count", "on hand", "available", "how many product", "product count", "inventory total", "stock level", "stock levels", "stock balance", "current stock", "inventory level"])) {
    return assistantStockAnswer(question, context);
  }

  if (matchesAny(normalized, ["low stock", "restock", "below", "zero", "negative", "reorder", "minimum", "reorder point", "stock threshold"])) {
    return assistantLowStockAnswer(context);
  }

  if (matchesAny(normalized, ["work to send", "saved work", "outbox", "send work", "pending", "queue", "sync", "sync queue", "pending work", "online", "offline"])) {
    return assistantOutboxAnswer(context);
  }

  if (matchesAny(normalized, ["what actions", "available actions", "action type", "stock action", "stock in", "use stock", "move stock", "correct count", "correct stock", "enroll", "suspend", "reactivate", "stock transfer", "stock adjustment", "adjust stock", "deactivate product", "reactivate product"])) {
    return assistantActionAnswer(question, context);
  }

  if (matchesAny(normalized, ["location", "where is", "place", "bar", "cellar", "store", "kitchen", "where can i find"])) {
    return assistantLocationAnswer(question, context);
  }

  if (matchesAny(normalized, ["client", "customer", "supplier", "vendor", "menu", "recipe", "setting", "policy"])) {
    if (confidentMatches.length > 0) {
      const matches = confidentMatches.slice(0, 4);
      return {
        text: `Here’s the most relevant StockLedger context I found for you:\n\n${matches.map((entry) => `- ${entry.title}: ${entry.body}`).join("\n")}`,
        actions: assistantActionsFromKnowledge(matches, context),
      };
    }
  }

  if (matchesAny(normalized, ["role", "permission", "roles", "access", "admin", "admin role", "rbac", "global_admin", "client_admin", "staff"])) {
    return {
      text: "StockLedger uses role-based access: GLOBAL_ADMIN (system owner), CLIENT_ADMIN (client-level controls), and STAFF (operations). Access scope is enforced per tenant and follows user role + device trust settings.",
      actions: [{ label: "Open Users", view: "users" }],
    };
  }

  if (matchesAny(normalized, ["tenant", "multi tenant", "isolation", "isolated", "per-tenant", "per tenant", "client db", "master db", "database per client"])) {
    return {
      text: "Tenant data is isolated across a master registry and per-client event stores. Every query and action is tenant-scoped so stock history from one client is never queried against another.",
      actions: [{ label: "Open Audit Trail", view: "audit" }],
    };
  }

  if (matchesAny(normalized, ["idempotent", "idempotency", "duplicate", "duplicates", "retry", "same event", "replay duplicate", "dedupe", "dedup"])) {
    return {
      text: "Idempotency keys are used to prevent duplicate event application. If a batch is resent, the server can detect the repeat and skip double-apply so stock stays correct.",
      actions: [{ label: "Open Audit Trail", view: "audit" }],
    };
  }

  if (matchesAny(normalized, ["batch", "atomic", "rollback", "failed batch", "partial", "all or nothing", "transaction", "sync failure", "sync failed"])) {
    return {
      text: "Sync runs in atomic mode: either the batch applies fully or it is rejected as a whole. A partial success is not allowed, so any failure means you should correct the batch and resend.",
      actions: [{ label: "Open Stock Actions", view: "compose" }],
    };
  }

  if (matchesAny(normalized, ["undo", "reverse", "mistake", "revert"])) {
    return {
      text: "Use Undo Record when a previous movement needs a compensating event. StockLedger does not delete history; it writes a STOCK_REVERT that points to the original event. Open Audit Trail, pick the movement, and prepare the undo record.",
      actions: [
        { label: "Open Audit Trail", view: "audit" },
        { label: "Open Stock Actions", view: "compose" },
      ],
    };
  }

  if (matchesAny(normalized, ["event sourced", "event-sourced", "ledger", "history", "audit", "immutable"])) {
    return {
      text: "StockLedger is an event-sourced ledger, so stock is never edited directly. Every action creates an immutable event, and stock is calculated by replaying STOCK_IN, STOCK_OUT, STOCK_TRANSFER, STOCK_ADJUSTMENT, STOCK_REVERT, and product lifecycle events. If something looks off, add a correction or undo record instead of changing history.",
      actions: [{ label: "Open Audit Trail", view: "audit" }],
    };
  }

  if (matchesAny(normalized, ["sale", "sell", "customer", "client"])) {
    return {
      text: "Sales can create stock usage when fulfilled. Draft sales are planning only; they do not move stock yet. When fulfilled, a direct stock sale queues STOCK_OUT work, while a menu sale creates grouped STOCK_OUT events from its recipe lines.",
      actions: [
        { label: "Open Sales", view: "sales" },
        { label: "Open Stock Actions", view: "compose" },
      ],
    };
  }

  if (matchesAny(normalized, ["purchase", "supplier", "receive", "stock in", "delivery"])) {
    return {
      text: "Use Purchases when supplier context matters (what arrived, from whom, and when). Use Stock Actions > Stock In when stock arrived but you don’t need a formal purchase record.",
      actions: [
        { label: "Open Purchases", view: "purchases" },
        { label: "Open Stock Actions", view: "compose" },
      ],
    };
  }

  if (isLikelyOutOfScopeQuestion(normalized)) {
    return assistantOutOfScopeAnswer();
  }

  if (confidentMatches.length > 0) {
    const matches = confidentMatches.slice(0, 3);
    return {
      text: `Here is what I found, in plain words:\n\n${matches.map((entry) => `- ${entry.title}: ${entry.body}`).join("\n")}`,
      actions: assistantActionsFromKnowledge(matches, context),
    };
  }

  if (topKnowledgeScore > 0 || isStockLedgerQuestion(normalized)) {
    return assistantUncertainAnswer();
  }

  return assistantOutOfScopeAnswer();
}

function assistantUncertainAnswer() {
  return {
    text: "I can help with StockLedger, but I can’t answer this confidently from the current session data. Try one of these instead: “What needs attention?”, “How much stock do we have?”, “What should I do next?”, or “How does sync and idempotency work?”.",
    actions: [
      { label: "Open Stock Overview", view: "dashboard" },
      { label: "Open Stock Actions", view: "compose" },
      { label: "Open Audit Trail", view: "audit" },
    ],
  };
}

function assistantOutOfScopeAnswer() {
  return {
    text: "I’m here to help with StockLedger, and I don’t want to guess outside what this session can show me. I can help with stock on hand, low stock, saved work, page purpose, actions, audit behavior, products, locations, sales, purchases, users, reports, and settings. Try one of these: “What needs attention?”, “How much stock do we have?”, or “What should I do next?”",
    actions: [
      { label: "Open Stock Overview", view: "dashboard" },
      { label: "Open Stock Actions", view: "compose" },
    ],
  };
}

function assistantCapabilitiesAnswer(context, meta) {
  const activeView = context.activeView ?? "dashboard";
  return {
    text: `Great, we can keep this short. I can help you with ${meta.title}, stock levels, saved work, page guidance, action selection, low stock planning, and audit-safe corrections. If you tell me your goal (“what should I do now?” or “how many X are left?”), I’ll give you the next practical step.`,
    actions: pageAssistantActions(activeView, context),
  };
}

function assistantSmallTalkAnswer(normalized, meta, context) {
  const activeView = context.activeView ?? "dashboard";

  if (!normalized) {
    return {
      text: `I’m here and ready. Ask me about ${meta.title}, saved work, stock counts, audit history, sales, purchases, or what needs attention, and I’ll keep the answer practical.`,
      actions: pageAssistantActions(activeView, context),
    };
  }

  if (matchesAny(normalized, ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"])) {
    return {
      text: `Hi there — I’m Stocky. On ${meta.title}, I can explain the page, point out what needs attention, and help you choose the right stock action in plain language.`,
      actions: pageAssistantActions(activeView, context),
    };
  }

  if (matchesAny(normalized, ["thank", "thanks", "appreciate"])) {
    return {
      text: "You’re welcome. I’ll stay practical and keep helping you move stock safely.",
      actions: pageAssistantActions(activeView, context).slice(0, 2),
    };
  }

  if (matchesAny(normalized, ["who are you", "what can you do", "what can i ask"])) {
    return {
      text: "I’m Stocky, the local StockLedger guide. I answer from what this session shows: screens, demo state, saved work, and event-sourced rules — stock is replayed from immutable events, corrections make new events, and private details stay protected unless they matter.",
      actions: [
        { label: "Current Page", view: activeView },
        { label: "Stock Overview", view: "dashboard" },
        { label: "Stock Actions", view: "compose" },
      ],
    };
  }

  return null;
}

function assistantNotificationAnswer(context) {
  const notifications = context.notifications();
  return {
    text: notifications.map((item) => `- ${item.title}: ${item.text}`).join("\n"),
    actions: notifications.some((item) => item.tone === "error" || item.tone === "warning")
      ? [{ label: "Open Stock Overview", view: "dashboard" }]
      : [{ label: "Open Stock Actions", view: "compose" }],
  };
}

function assistantStockAnswer(question, context) {
  const rows = context.stockRows();
  const totals = context.stockTotals(rows).filter((row) => Number(row.quantity) !== 0);
  const product = findMentionedProduct(question, context.products);

  if (product) {
    const productRows = rows.filter((row) => row.product_id === product.id);
    const total = productRows.reduce((sum, row) => sum + Number(row.quantity), 0);
    const places = productRows.length
      ? productRows.map((row) => `${row.location}: ${context.formatQuantity(row.quantity)} ${product.unit}`).join("\n")
      : "No replayed stock at any location.";
    return {
      text: `${product.name} currently has ${context.formatQuantity(total)} ${product.unit} on hand.\n${places}`,
      actions: [{ label: "Open Stock Overview", view: "dashboard" }],
    };
  }

  const totalLines = totals
    .sort((first, second) => first.product_name.localeCompare(second.product_name))
    .map((row) => `- ${row.product_name}: ${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)} across ${row.location_count} location${row.location_count === 1 ? "" : "s"}`)
    .join("\n");
  const totalUnits = totals.reduce((sum, row) => sum + Number(row.quantity), 0);

  return {
    text: `You currently have ${totals.length} products with replayed stock and ${context.formatQuantity(totalUnits)} total counted units.\n${totalLines || "No products currently have replayed stock."}`,
    actions: [{ label: "Open Stock Overview", view: "dashboard" }],
  };
}

function assistantLowStockAnswer(context) {
  const rows = context.stockRows();
  const lowRows = rows.filter((row) => row.quantity >= 0 && row.quantity <= context.productLow(row.product_id));
  const negativeRows = rows.filter((row) => row.quantity < 0);
  const lines = [...negativeRows, ...lowRows]
    .slice(0, 8)
    .map((row) => `- ${row.product_name} at ${row.location}: ${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)} (${row.quantity < 0 ? "below zero" : "low stock"})`)
    .join("\n");

  return {
    text: lines || "No low-stock or below-zero rows are showing in the current replay.",
    actions: [
      { label: "Open Stock Overview", view: "dashboard" },
      { label: "Stock In", view: "compose" },
    ],
  };
}

function assistantOutboxAnswer(context) {
  const validations = context.validations();
  const invalid = validations.filter((result) => !result.valid);
  const workItems = context.workItems();
  const lines = workItems.slice(0, 6).map((item) => `- ${item.label}: ${item.product_name}, ${item.location}, ${item.amount}`).join("\n");

  return {
    text: `${context.outbox.length} event${context.outbox.length === 1 ? "" : "s"} are saved locally in ${workItems.length} queued work item${workItems.length === 1 ? "" : "s"}. ${invalid.length ? `${invalid.length} of those item${invalid.length === 1 ? "" : "s"} still need attention.` : "Everything queued is ready to send."}\n${lines || "No work is waiting to send."}`,
    actions: [{ label: "Open Stock Actions", view: "compose" }],
  };
}

function assistantActionAnswer(question, context) {
  const normalized = normalizeAssistantText(question);
  const actionEntries = Object.entries(context.actionTemplates)
    .map(([type, template]) => ({
      type,
      label: context.eventLabels[type] ?? type,
      template,
      normalizedLabel: normalizeAssistantText(`${context.eventLabels[type] ?? type} ${type} ${template.summary} ${template.help ?? ""}`),
    }));
  const directMatch = actionEntries.find((entry) => entry.normalizedLabel.split(" ").some((token) => token.length > 3 && normalized.includes(token)));

  if (directMatch && !matchesAny(normalized, ["what actions", "available actions", "action type", "stock action"])) {
    return {
      text: `${directMatch.label} is the right fit.\n\n${directMatch.template.summary} ${directMatch.template.help ?? ""}\n\nRequired fields: ${(directMatch.template.requiredFields ?? []).join(", ") || "No special fields"}.`,
      actions: [{ label: "Open Stock Actions", view: "compose" }],
    };
  }

  return {
    text: `Stock Actions can queue work while keeping stock history immutable:\n\n${actionEntries
      .map((entry) => `- ${entry.label}: ${entry.template.summary}`)
      .join("\n")}\n\nUse the action name that matches what happened in real life. Stocky will prefer corrections and undo records over changing history.`,
    actions: [{ label: "Open Stock Actions", view: "compose" }],
  };
}

function assistantLocationAnswer(question, context) {
  const normalized = normalizeAssistantText(question);
  const mentioned = (context.locations ?? []).find((location) => normalizeAssistantText(location.name).split(" ").every((part) => normalized.includes(part)));
  const rows = context.stockRows();

  if (mentioned) {
    const locationRows = rows.filter((row) => row.location === mentioned.name && Number(row.quantity) !== 0);
    const lines = locationRows
      .slice(0, 8)
      .map((row) => `- ${row.product_name}: ${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)}`)
      .join("\n");
    return {
      text: `${mentioned.name} is a ${mentioned.kind} location owned by ${mentioned.owner}. Status: ${mentioned.status}.\n${lines || "No replayed stock is currently showing there."}`,
      actions: [
        { label: "Open Locations", view: "locations" },
        { label: "Open Stock Overview", view: "dashboard" },
      ],
    };
  }

  return {
    text: `StockLedger has ${(context.locations ?? []).length} locations in this session:\n${(context.locations ?? [])
      .map((location) => `- ${location.name}: ${location.kind}, ${location.status}`)
      .join("\n")}`,
    actions: [{ label: "Open Locations", view: "locations" }],
  };
}

function retrieveAssistantKnowledge(question, context) {
  const queryTokens = expandAssistantTokens(assistantTokens(question));
  if (!queryTokens.length) return [];

  const normalizedQuery = normalizeAssistantText(question);
  return assistantKnowledgeBase(context)
    .map((entry) => {
      const normalizedEntry = normalizeAssistantText(`${entry.title} ${entry.body} ${entry.keywords ?? ""}`);
      const haystack = expandAssistantTokens(assistantTokens(normalizedEntry));
      const tokenScore = queryTokens.reduce((total, token) => total + (haystack.includes(token) ? 2 : 0), 0);
      const phraseScore = normalizedEntry.includes(normalizedQuery) || normalizedQuery.includes(normalizeAssistantText(entry.title)) ? 5 : 0;
      const score = tokenScore + phraseScore;
      return { ...entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((first, second) => second.score - first.score || first.title.localeCompare(second.title));
}

function assistantKnowledgeBase(context) {
  const rows = context.stockRows();
  const stockEntries = context.stockTotals(rows).map((row) => ({
    title: `${row.product_name} stock`,
    body: `${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)} on hand across ${row.location_count} location${row.location_count === 1 ? "" : "s"}. Low threshold is ${context.formatQuantity(context.productLow(row.product_id))}.`,
    view: "dashboard",
    keywords: "stock inventory count quantity on hand product",
  }));
  const pageEntries = Object.entries(context.screenMeta).map(([view, meta]) => ({
    title: meta.title,
    body: meta.guide,
    view,
    keywords: `${meta.label} page screen tab ${context.guideTipsForView(view).join(" ")}`,
  }));
  const actionEntries = Object.entries(context.actionTemplates).map(([type, template]) => ({
    title: context.eventLabels[type] ?? type,
    body: `${template.summary} ${template.help ?? ""}`,
    view: "compose",
    keywords: `${type} action stock work queue`,
  }));
  const locationEntries = context.locations.map((location) => ({
    title: `${location.name} location`,
    body: `${location.kind} location owned by ${location.owner}. Status: ${location.status}.`,
    view: "locations",
    keywords: "location place storage service prep cellar bar kitchen",
  }));
  const menuEntries = context.menuItems.map((item) => {
    const menu = context.menus.find((candidate) => candidate.id === item.menu_id);
    return {
      title: item.name,
      body: `Menu item for ${menu?.name ?? "menu"} deducts ${item.recipe.map((line) => `${context.formatQuantity(line.quantity)} ${context.productUnit(line.product_id)} ${context.productName(line.product_id)}`).join(", ")} when fulfilled.`,
      view: "menus",
      keywords: "menu recipe sale fulfillment stock out",
    };
  });
  const clientEntries = (context.clients ?? []).map((client) => ({
    title: client.name,
    body: `${client.segment} client. Default menu: ${context.menus.find((menu) => menu.id === client.default_menu_id)?.name ?? "None"}. Order pattern: ${client.order_pattern}. Next order: ${client.next_order}.`,
    view: "clients",
    keywords: "client customer order recurring seasonal wholesale sale menu relationship",
  }));
  const supplierEntries = (context.suppliers ?? []).map((supplier) => ({
    title: supplier.name,
    body: `${supplier.cadence} supplier. Reliability: ${supplier.reliability}. Last delivery: ${supplier.last_delivery}. Variance cases: ${supplier.variance_cases ?? 0}.`,
    view: "suppliers",
    keywords: "supplier vendor purchase receiving delivery variance relationship",
  }));
  const saleEntries = (context.sales ?? []).slice(-12).map((sale) => ({
    title: `Sale ${context.clientName?.(sale.client_id) ?? sale.client_id}`,
    body: `${sale.item_label ?? context.productName(sale.product_id)} fulfilled from ${sale.location}. Quantity ${context.formatQuantity(sale.quantity)}. Status ${sale.status}.`,
    view: "sales",
    keywords: "sale fulfilled client direct stock menu stock out",
  }));
  const purchaseEntries = (context.purchases ?? []).slice(-12).map((purchase) => ({
    title: `Purchase ${context.supplierName?.(purchase.supplier_id) ?? purchase.supplier_id}`,
    body: `${purchase.item_label ?? context.productName(purchase.product_id)} received at ${purchase.location}. Quantity ${context.formatQuantity(purchase.quantity)}. Status ${purchase.status}.`,
    view: "purchases",
    keywords: "purchase supplier receiving stock in delivery",
  }));
  const userEntries = (context.users ?? []).map((user) => ({
    title: user.display_name,
    body: `${user.role} user. Status: ${user.status}. Scope: ${user.access_scope}. Last active: ${user.last_active}.`,
    view: "users",
    keywords: "user role staff access device trust permission",
  }));
  const settingEntries = [
    ...(context.settingsPolicies ?? []).map((policy) => ({
      title: policy.label,
      body: `${policy.value}. ${policy.detail}`,
      view: "settings",
      keywords: "setting policy offline sync tenant privacy",
    })),
    ...(context.numberingRules ?? []).map((rule) => ({
      title: `${rule.prefix} numbering`,
      body: `${rule.example}. ${rule.use}`,
      view: "settings",
      keywords: "setting numbering sequence document code",
    })),
    {
      title: "Sync and idempotency",
      body: "Sync is atomic and queue-based. Idempotency keys protect from accidental duplicate event application.",
      view: "audit",
      keywords: "sync batch queue outbox idempotent idempotency atomic",
    },
    {
      title: "Event replay model",
      body: "Stock is always derived from immutable event replay. Actions create new events; history is not edited in place.",
      view: "audit",
      keywords: "replay event sourced immutable stock history ledger",
    },
    {
      title: "Tenant isolation",
      body: "Tenant isolation uses a master registry plus per-client storage so one client’s stock state cannot mix with another.",
      view: "settings",
      keywords: "tenant isolation multi tenant per client database",
    },
    {
      title: "User access roles",
      body: "Role model includes GLOBAL_ADMIN, CLIENT_ADMIN, and STAFF, each with different permission scope and audit visibility.",
      view: "users",
      keywords: "role rbac global_admin client_admin staff permission",
    },
  ];

  return [
    ...pageEntries,
    ...actionEntries,
    ...stockEntries,
    ...locationEntries,
    ...menuEntries,
    ...clientEntries,
    ...supplierEntries,
    ...saleEntries,
    ...purchaseEntries,
    ...userEntries,
    ...settingEntries,
    { title: "Event-sourced ledger", body: "Stock is derived from immutable event replay. Use corrections and undo records instead of editing history.", view: "audit", keywords: "ledger immutable audit history event source replay" },
    { title: "Session-only chat", body: "Assistant chat history is held in memory for this browser session and is excluded from localStorage persistence.", view: context.activeView, keywords: "privacy chat session history storage local" },
    { title: "Privacy", body: "Private contact details, supplier terms, and staff notes should stay hidden unless the role and audit path require them.", view: "users", keywords: "privacy pii private sensitive tenant user supplier client" },
  ];
}

function assistantActionsFromKnowledge(matches, context) {
  const seen = new Set();
  return matches
    .map((entry) => entry.view)
    .filter(Boolean)
    .filter((view) => {
      if (seen.has(view)) return false;
      seen.add(view);
      return true;
    })
    .slice(0, 3)
    .map((view) => ({ label: `Open ${(context.screenMeta[view] ?? context.screenMeta.dashboard).title}`, view }));
}

function pageAssistantActions(view, context) {
  if (context.pageActions) return context.pageActions(view);
  if (view === "compose") return [{ label: "Open Stock Overview", view: "dashboard" }];
  if (view === "dashboard") return [{ label: "Open Stock Actions", view: "compose" }];
  if (view === "audit") return [{ label: "Open Stock Actions", view: "compose" }];
  return [{ label: "Open Stock Actions", view: "compose" }, { label: "Open Audit Trail", view: "audit" }];
}

function pagePurposeText(meta) {
  return `${meta.title} is for ${meta.guide.toLowerCase()}`;
}

function cleanTipForSentence(tip) {
  return `${tip ?? ""}`.trim().replace(/\.$/, "").replace(/^use /i, "use ").replace(/^open /i, "open ");
}

function humanJoin(items) {
  const cleanItems = items.map((item) => `${item ?? ""}`.trim()).filter(Boolean);
  if (cleanItems.length === 0) return "ask for the next best step";
  if (cleanItems.length === 1) return cleanItems[0];
  if (cleanItems.length === 2) return `${cleanItems[0]} and ${cleanItems[1]}`;
  return `${cleanItems.slice(0, -1).join(", ")}, and ${cleanItems.at(-1)}`;
}

function findMentionedProduct(question, products) {
  const normalized = normalizeAssistantText(question);
  return products.find((product) => normalizeAssistantText(product.name).split(" ").every((part) => normalized.includes(part)));
}

function normalizeAssistantText(value) {
  return `${value ?? ""}`.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function assistantTokens(value) {
  const stop = new Set(["the", "a", "an", "is", "are", "to", "for", "of", "and", "or", "we", "do", "have", "what", "this", "that", "how", "many", "much", "who", "won", "did", "was", "were", "when", "where", "why", "please", "show", "tell", "about"]);
  return normalizeAssistantText(value).split(" ").filter((token) => token.length > 2 && !stop.has(token));
}

function expandAssistantTokens(tokens) {
  const synonyms = new Map([
    ["buy", ["purchase", "supplier", "receive"]],
    ["bought", ["purchase", "supplier", "receive"]],
    ["sell", ["sale", "client", "stockout"]],
    ["sold", ["sale", "client", "stockout"]],
    ["customer", ["client", "sale"]],
    ["vendor", ["supplier", "purchase"]],
    ["place", ["location"]],
    ["room", ["location"]],
    ["sync", ["outbox", "online", "offline", "batch"]],
    ["syncing", ["outbox", "online", "offline", "batch"]],
    ["online", ["connect", "outbox", "sync"]],
    ["offline", ["outbox", "queue", "sync"]],
    ["replay", ["event", "ledger", "history", "immutable"]],
    ["event", ["ledger", "history", "replay"]],
    ["tenant", ["isolation", "client db", "master db", "multi tenant"]],
    ["admin", ["role", "permission", "rbac", "access"]],
    ["admins", ["role", "permission", "rbac", "access"]],
    ["count", ["stock", "quantity", "inventory"]],
    ["counts", ["stock", "quantity", "inventory"]],
    ["amount", ["quantity", "stock"]],
    ["remaining", ["stock", "balance"]],
    ["balance", ["stock", "quantity", "inventory"]],
    ["threshold", ["low", "restock", "minimum"]],
    ["waiting", ["queue", "outbox", "pending"]],
    ["saved", ["queue", "outbox", "pending"]],
    ["mistake", ["undo", "reverse", "audit"]],
    ["mistakes", ["undo", "reverse", "audit"]],
    ["wrong", ["undo", "reverse", "correction"]],
  ]);
  const expanded = new Set(tokens);
  tokens.forEach((token) => {
    (synonyms.get(token) ?? []).forEach((synonym) => expanded.add(synonym));
    if (token.endsWith("s")) expanded.add(token.slice(0, -1));
  });
  return [...expanded];
}

function matchesAny(value, phrases) {
  return phrases.some((phrase) => value.includes(phrase));
}

function isStockLedgerQuestion(normalized) {
  return matchesAny(
    normalized,
    [
      "stock",
      "inventory",
      "ledger",
      "audit",
      "product",
      "location",
      "sale",
      "purchase",
      "supplier",
      "client",
      "menu",
      "report",
      "user",
      "role",
      "sync",
      "outbox",
      "queue",
      "undo",
      "reverse",
      "event",
      "batch",
      "low",
      "restock",
      "count",
      "settings",
      "page",
      "screen",
      "tenant",
      "admin",
      "action",
      "replay",
    ],
  );
}

function isLikelyOutOfScopeQuestion(normalized) {
  if (!normalized) return false;
  const stockledgerWords = [
    "stock",
    "inventory",
    "ledger",
    "audit",
    "product",
    "location",
    "sale",
    "purchase",
    "supplier",
    "client",
    "menu",
    "report",
    "user",
    "role",
    "sync",
    "outbox",
    "queue",
    "undo",
    "reverse",
    "event",
    "batch",
    "low",
    "restock",
    "count",
    "settings",
    "page",
    "screen",
  ];
  if (stockledgerWords.some((word) => normalized.includes(word))) return false;

  return matchesAny(normalized, [
    "basketball",
    "football",
    "baseball",
    "nba",
    "nfl",
    "weather",
    "news",
    "recipe",
    "movie",
    "song",
    "politics",
    "president",
    "stock market",
    "crypto",
    "who won",
    "tell me a joke",
  ]);
}
