export function answerAssistantQuestion(question, context) {
  const normalized = normalizeAssistantText(question);
  const activeView = context.activeView ?? "dashboard";
  const meta = context.screenMeta[activeView] ?? context.screenMeta.dashboard;
  const smallTalk = assistantSmallTalkAnswer(normalized, meta, context);

  if (smallTalk) return smallTalk;

  if (matchesAny(normalized, ["what should i do", "what next", "next step", "help me", "guide me", "where should i start"])) {
    return {
      text: `On ${meta.title}, I would start with the highest-signal work: ${context.guideTipsForView(activeView).slice(0, 3).join(" ")} If you are unsure, check notifications first, then use the action button that matches the work you are actually doing.`,
      actions: [
        ...pageAssistantActions(activeView, context).slice(0, 2),
        { label: "Notifications", view: activeView },
      ],
    };
  }

  if (matchesAny(normalized, ["what is this page", "current page", "this page for", "where am i", "about this page"])) {
    const tips = context.guideTipsForView(activeView).slice(0, 4).map((tip) => `- ${tip}`).join("\n");
    return {
      text: `${meta.title} is for ${meta.guide.toLowerCase()}\n\nWhat to do here:\n${tips}`,
      actions: pageAssistantActions(activeView, context),
    };
  }

  if (matchesAny(normalized, ["notification", "attention", "urgent", "need review", "needs attention", "problem", "warning"])) {
    return assistantNotificationAnswer(context);
  }

  if (matchesAny(normalized, ["how many stock", "how much stock", "stock count", "total stock", "inventory count", "on hand", "available"])) {
    return assistantStockAnswer(question, context);
  }

  if (matchesAny(normalized, ["low stock", "restock", "below", "zero", "negative"])) {
    return assistantLowStockAnswer(context);
  }

  if (matchesAny(normalized, ["work to send", "saved work", "outbox", "send work", "pending", "queue", "sync"])) {
    return assistantOutboxAnswer(context);
  }

  if (matchesAny(normalized, ["undo", "reverse", "mistake", "revert"])) {
    return {
      text: "Use Undo Record when a previous stock movement needs a compensating event. StockLedger does not delete or rewrite history; it creates a STOCK_REVERT that references the original event. Open Audit Trail, pick an eligible movement, then prepare the undo record.",
      actions: [
        { label: "Open Audit Trail", view: "audit" },
        { label: "Open Stock Actions", view: "compose" },
      ],
    };
  }

  if (matchesAny(normalized, ["event sourced", "event-sourced", "ledger", "history", "audit", "immutable"])) {
    return {
      text: "StockLedger is an event-sourced inventory ledger. Stock is not edited directly. Each action creates an immutable event, and stock numbers come from replaying STOCK_IN, STOCK_OUT, STOCK_TRANSFER, STOCK_ADJUSTMENT, STOCK_REVERT, and product lifecycle events. If something is wrong, record a correction or undo record instead of changing history.",
      actions: [{ label: "Open Audit Trail", view: "audit" }],
    };
  }

  if (matchesAny(normalized, ["sale", "sell", "customer", "client"])) {
    return {
      text: "Sales can create stock usage when fulfilled. Draft sale records do not move stock. A fulfilled direct stock sale queues STOCK_OUT work, while a menu sale creates grouped STOCK_OUT events from the recipe lines.",
      actions: [
        { label: "Open Sales", view: "sales" },
        { label: "Open Stock Actions", view: "compose" },
      ],
    };
  }

  if (matchesAny(normalized, ["purchase", "supplier", "receive", "stock in", "delivery"])) {
    return {
      text: "Purchases are optional receiving records linked to Stock In. Use Purchases when supplier context matters. Use Stock Actions > Stock In when stock arrived without a formal purchase record.",
      actions: [
        { label: "Open Purchases", view: "purchases" },
        { label: "Open Stock Actions", view: "compose" },
      ],
    };
  }

  if (isLikelyOutOfScopeQuestion(normalized)) {
    return assistantOutOfScopeAnswer();
  }

  const matches = retrieveAssistantKnowledge(question, context).slice(0, 3);
  if (matches.length > 0) {
    return {
      text: `Here is what I found:\n\n${matches.map((entry) => `- ${entry.title}: ${entry.body}`).join("\n")}`,
      actions: assistantActionsFromKnowledge(matches, context),
    };
  }

  return assistantOutOfScopeAnswer();
}

function assistantOutOfScopeAnswer() {
  return {
    text: "I’m built for StockLedger, so I will not guess at general-world questions from inside this local system. I can still help right here with stock on hand, low stock, saved work, page purpose, actions, audit behavior, products, locations, sales, purchases, users, reports, and settings. Try asking “What needs attention?”, “How many stocks do we have?”, or “What should I do next?”",
    actions: [
      { label: "Open Stock Overview", view: "dashboard" },
      { label: "Open Stock Actions", view: "compose" },
    ],
  };
}

function assistantSmallTalkAnswer(normalized, meta, context) {
  const activeView = context.activeView ?? "dashboard";

  if (!normalized) {
    return {
      text: `I’m here. Ask me about ${meta.title}, saved work, stock counts, audit history, sales, purchases, or what needs attention.`,
      actions: pageAssistantActions(activeView, context),
    };
  }

  if (matchesAny(normalized, ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"])) {
    return {
      text: `Hi. I’m your StockLedger assistant for this session. On ${meta.title}, I can explain what the page is for, point out what needs attention, and help you choose the right stock action without exposing private details unnecessarily.`,
      actions: pageAssistantActions(activeView, context),
    };
  }

  if (matchesAny(normalized, ["thank", "thanks", "appreciate"])) {
    return {
      text: "You’re welcome. I’ll stay focused on the ledger and keep the answers practical.",
      actions: pageAssistantActions(activeView, context).slice(0, 2),
    };
  }

  if (matchesAny(normalized, ["who are you", "what can you do", "what can i ask"])) {
    return {
      text: "I’m a local StockLedger support bot. I answer from this session’s screens, seeded demo data, saved work, and the event-sourced rules: stock is replayed from immutable events, corrections create new events, and private operational details stay tucked away unless they are useful.",
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
      text: `${product.name} has ${context.formatQuantity(total)} ${product.unit} on hand.\n${places}`,
      actions: [{ label: "Open Stock Overview", view: "dashboard" }],
    };
  }

  const totalLines = totals
    .sort((first, second) => first.product_name.localeCompare(second.product_name))
    .map((row) => `- ${row.product_name}: ${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)} across ${row.location_count} location${row.location_count === 1 ? "" : "s"}`)
    .join("\n");
  const totalUnits = totals.reduce((sum, row) => sum + Number(row.quantity), 0);

  return {
    text: `There are ${totals.length} products with replayed stock and ${context.formatQuantity(totalUnits)} total counted units across products.\n${totalLines}`,
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
    text: `${context.outbox.length} event${context.outbox.length === 1 ? "" : "s"} are saved locally in ${workItems.length} work item${workItems.length === 1 ? "" : "s"}. ${invalid.length ? `${invalid.length} item${invalid.length === 1 ? "" : "s"} need validation.` : "Everything queued is ready."}\n${lines || "No work is waiting to send."}`,
    actions: [{ label: "Open Stock Actions", view: "compose" }],
  };
}

function retrieveAssistantKnowledge(question, context) {
  const queryTokens = assistantTokens(question);
  if (!queryTokens.length) return [];

  return assistantKnowledgeBase(context)
    .map((entry) => {
      const haystack = assistantTokens(`${entry.title} ${entry.body} ${entry.keywords ?? ""}`);
      const score = queryTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
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

  return [
    ...pageEntries,
    ...actionEntries,
    ...stockEntries,
    ...locationEntries,
    ...menuEntries,
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

function findMentionedProduct(question, products) {
  const normalized = normalizeAssistantText(question);
  return products.find((product) => normalizeAssistantText(product.name).split(" ").every((part) => normalized.includes(part)));
}

function normalizeAssistantText(value) {
  return `${value ?? ""}`.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function assistantTokens(value) {
  const stop = new Set(["the", "a", "an", "is", "are", "to", "for", "of", "and", "or", "we", "do", "have", "what", "this", "that", "how", "many", "much", "who", "won", "did", "was", "were", "when", "where", "why"]);
  return normalizeAssistantText(value).split(" ").filter((token) => token.length > 2 && !stop.has(token));
}

function matchesAny(value, phrases) {
  return phrases.some((phrase) => value.includes(phrase));
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
