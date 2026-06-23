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

  const followUp = assistantFollowUpAnswer(normalized, context, meta);
  if (followUp) return followUp;

  if (matchesAny(normalized, ["help", "help me", "how can i use", "what can you do", "what can you help", "walk me through", "explain"])) {
    return assistantCapabilitiesAnswer(context, meta);
  }

  if (matchesAny(normalized, ["what should i do", "what next", "next step", "help me", "guide me", "where should i start", "best next step", "what do i do now"])) {
    return assistantNextStepAnswer(context, meta, activeView);
  }

  if (matchesAny(normalized, ["what is this page", "current page", "this page for", "where am i", "about this page"])) {
    const tips = context.guideTipsForView(activeView).slice(0, 4).map((tip) => `- ${tip}`).join("\n");
    return {
      text: `${meta.title}: ${pagePurposeText(meta)}\n\nHere’s what this page is for:\n${tips}`,
      actions: pageAssistantActions(activeView, context),
    };
  }

  const copilotAnswer = assistantCopilotAnswer(question, normalized, context, meta, activeView);
  if (copilotAnswer) return copilotAnswer;

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

  if (matchesAny(normalized, ["privacy", "private", "pii", "sensitive", "contact", "terms", "export", "retention", "device trust", "trusted device", "offline retention", "setting", "settings", "policy"])) {
    return assistantSettingsAnswer(context);
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

function assistantFollowUpAnswer(normalized, context, meta) {
  if (!isFollowUpQuestion(normalized)) return null;

  const recentAssistantText = latestAssistantText(context);
  if (!recentAssistantText) {
    return {
      text: `I can keep going, but I need a subject. Ask me to explain a product, saved work, settings, or the current page, and I’ll stay specific to ${meta.title}.`,
      actions: pageAssistantActions(context.activeView ?? "dashboard", context),
    };
  }

  const currentProductTopic = findMentionedProduct(normalized, context.products ?? []);
  if (currentProductTopic) {
    return assistantProductFollowUpAnswer(currentProductTopic, context);
  }

  const currentLocationTopic = findMentionedLocation(normalized, context.locations ?? []);
  if (currentLocationTopic) {
    return assistantLocationFollowUpAnswer(currentLocationTopic, context);
  }

  const productTopic = findMentionedProduct(recentAssistantText, context.products ?? []);
  if (productTopic) {
    return assistantProductFollowUpAnswer(productTopic, context);
  }

  const locationTopic = findMentionedLocation(recentAssistantText, context.locations ?? []);
  if (locationTopic) {
    return assistantLocationFollowUpAnswer(locationTopic, context);
  }

  const recent = normalizeAssistantText(recentAssistantText);
  if (matchesAny(recent, ["saved work", "queued", "queue", "atomic batch", "send"])) {
    const outbox = assistantOutboxAnswer(context);
    return {
      text: `More detail on the saved work:\n\n${outbox.text}\n\nThe human check is simple: does each queued item match something that actually happened? If yes, send once. If no, prepare an undo or correction.`,
      actions: outbox.actions,
    };
  }

  if (matchesAny(recent, ["low stock", "threshold", "below zero", "needs restock", "replenishment"])) {
    const lowStock = assistantLowStockAnswer(context);
    return {
      text: `More detail on the stock risk:\n\n${lowStock.text}\n\nI’m not treating low stock as a failure by itself. It becomes urgent when it blocks service, repeats after receiving, or goes below zero.`,
      actions: lowStock.actions,
    };
  }

  if (matchesAny(recent, ["settings", "privacy", "policy", "retention", "device trust", "export"])) {
    const settings = assistantSettingsAnswer(context);
    return {
      text: `More detail on the policy side:\n\n${settings.text}`,
      actions: settings.actions,
    };
  }

  if (matchesAny(recent, ["stock actions", "action type", "stock in", "use stock", "move stock", "correct stock", "undo record"])) {
    return assistantActionAnswer("what actions can I use", context);
  }

  return {
    text: `I can expand on that, but I don’t want to guess wrong. The last thing I said was about ${meta.title}; ask “why is [product] low?”, “is it safe to send?”, or “which action should I use?” and I’ll anchor the answer to evidence.`,
    actions: pageAssistantActions(context.activeView ?? "dashboard", context),
  };
}

function assistantProductFollowUpAnswer(product, context) {
  const evidence = collectAssistantEvidence(product.name, context);
  const rows = evidence.targetRows;
  const total = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
  const lowRows = rows.filter((row) => Number(row.quantity) >= 0 && Number(row.quantity) <= context.productLow(row.product_id));
  const negativeRows = rows.filter((row) => Number(row.quantity) < 0);
  const rowLines = rows.length
    ? rows.map((row) => `- ${row.location}: ${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)}`).join("\n")
    : "- No replayed stock rows are visible for this product right now.";
  const sourceHints = [
    ...evidence.relatedPurchases.slice(-2).map((purchase) => `purchase ${purchase.status}: ${purchase.item_label ?? context.productName(purchase.product_id)} into ${purchase.location}`),
    ...evidence.relatedSales.slice(-2).map((sale) => `sale ${sale.status}: ${sale.item_label ?? context.productName(sale.product_id)} from ${sale.location}`),
  ];
  const read = negativeRows.length
    ? "This is an audit-first situation because at least one location is below zero."
    : lowRows.length
      ? "This is a replenishment watch item because at least one location is at or below its low threshold."
      : "This looks stable from the replayed rows I can see.";

  return {
    text: `Still looking at ${product.name}. Total on hand is ${context.formatQuantity(total)} ${product.unit}. ${read}\n\nCurrent spread:\n${rowLines}${sourceHints.length ? `\n\nRecent source hints:\n${sourceHints.map((hint) => `- ${hint}`).join("\n")}` : ""}\n\nA good next move is to verify the physical count if the number surprises you, then use Stock Actions for receiving, correction, or undo work.`,
    actions: [
      { label: "Open Stock Overview", view: "dashboard" },
      ...(negativeRows.length ? [{ label: "Open Audit Trail", view: "audit" }] : []),
      ...(lowRows.length || negativeRows.length ? [{ label: "Prepare Stock In", view: "compose" }] : [{ label: "Open Stock Actions", view: "compose" }]),
    ].slice(0, 3),
  };
}

function assistantLocationFollowUpAnswer(location, context) {
  const rows = context.stockRows().filter((row) => row.location === location.name && Number(row.quantity) !== 0);
  const lowRows = rows.filter((row) => Number(row.quantity) >= 0 && Number(row.quantity) <= context.productLow(row.product_id));
  const negativeRows = rows.filter((row) => Number(row.quantity) < 0);
  const rowLines = rows.length
    ? rows.slice(0, 8).map((row) => `- ${row.product_name}: ${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)}`).join("\n")
    : "- No non-zero replayed stock is visible here right now.";
  const read = negativeRows.length
    ? `${negativeRows.length} row${negativeRows.length === 1 ? "" : "s"} are below zero, so check Audit Trail before more routine work.`
    : lowRows.length
      ? `${lowRows.length} row${lowRows.length === 1 ? "" : "s"} are at or below threshold, so receiving or transfer planning may be needed.`
      : "Nothing looks urgent from the replayed stock rows.";

  return {
    text: `For ${location.name}, I’m seeing a ${location.kind} location owned by ${location.owner}. ${read}\n\nCurrent non-zero rows:\n${rowLines}`,
    actions: [
      { label: "Open Locations", view: "locations" },
      { label: "Open Stock Overview", view: "dashboard" },
      ...(negativeRows.length ? [{ label: "Open Audit Trail", view: "audit" }] : []),
    ].slice(0, 3),
  };
}

function isFollowUpQuestion(normalized) {
  if (["why", "how so", "go on", "continue", "expand"].includes(normalized)) return true;
  if (normalized.startsWith("what about ")) return true;

  return matchesAny(normalized, [
    "tell me more",
    "more detail",
    "explain that",
    "what do you mean",
    "why so",
    "that one",
    "what about that",
  ]);
}

function latestAssistantText(context) {
  const messages = Array.isArray(context.recentMessages) ? context.recentMessages : [];
  return [...messages].reverse().find((message) => message?.role !== "user" && `${message.text ?? ""}`.trim())?.text ?? "";
}

function assistantCopilotAnswer(question, normalized, context, meta, activeView) {
  const intent = classifyAssistantIntent(normalized);
  if (!intent) return null;

  const evidence = collectAssistantEvidence(question, context);
  if (intent === "goal") return assistantGoalAnswer(normalized, context, meta, activeView, evidence);
  if (intent === "why") return assistantWhyAnswer(question, context, evidence);
  if (intent === "safety") return assistantSafetyAnswer(normalized, context, evidence);
  if (intent === "history") return assistantHistoryAnswer(question, context, evidence);

  return null;
}

function classifyAssistantIntent(normalized) {
  if (matchesAny(normalized, ["i am trying to", "i'm trying to", "i want to", "i need to", "need to", "trying to"])) return "goal";
  if (matchesAny(normalized, ["why is", "why are", "why did", "why does", "why do", "why was", "why were", "explain why"])) return "why";
  if (matchesAny(normalized, ["is it safe", "safe to", "can i send", "should i send", "can we send", "ready to send", "okay to send", "ok to send", "can i change", "should i change"])) return "safety";
  if (matchesAny(normalized, ["what happened", "what changed", "history of", "trace", "explain the history", "why did it change"])) return "history";
  return null;
}

function collectAssistantEvidence(question, context) {
  const rows = context.stockRows();
  const product = findMentionedProduct(question, context.products ?? []);
  const location = findMentionedLocation(question, context.locations ?? []);
  const productRows = product ? rows.filter((row) => row.product_id === product.id) : [];
  const locationRows = location ? rows.filter((row) => row.location === location.name) : [];
  const targetRows = productRows.length ? productRows : locationRows;
  const lowRows = rows.filter((row) => Number(row.quantity) >= 0 && Number(row.quantity) <= context.productLow(row.product_id));
  const negativeRows = rows.filter((row) => Number(row.quantity) < 0);
  const workItems = safeList(() => context.workItems());
  const validations = safeList(() => context.validations());
  const invalidCount = validations.filter((result) => !result.valid).length;
  const notifications = safeList(() => context.notifications());
  const relatedSales = product ? safeList(() => context.sales).filter((sale) => sale.product_id === product.id || `${sale.item_label ?? ""}`.toLowerCase().includes(product.name.toLowerCase())) : [];
  const relatedPurchases = product ? safeList(() => context.purchases).filter((purchase) => purchase.product_id === product.id || `${purchase.item_label ?? ""}`.toLowerCase().includes(product.name.toLowerCase())) : [];

  return {
    product,
    location,
    rows,
    targetRows,
    lowRows,
    negativeRows,
    workItems,
    validations,
    invalidCount,
    notifications,
    relatedSales,
    relatedPurchases,
  };
}

function assistantGoalAnswer(normalized, context, meta, activeView, evidence) {
  const action = actionForGoal(normalized, context);
  const risk = assistantRiskLevel(evidence);
  const reason = risk.reason ? `\n\nRisk check: ${risk.reason}` : "";

  if (action) {
    return {
      text: `Got it. You’re trying to ${action.goal}.\n\nUse ${action.label}. ${action.reason}${reason}\n\nI’d open the action workspace, choose the matching action type, and record what happened in real life rather than editing a stock number directly.`,
      actions: [
        { label: "Open Stock Actions", view: "compose" },
        ...(risk.view ? [{ label: risk.label, view: risk.view }] : []),
      ],
    };
  }

  return {
    text: `I can help with that from ${meta.title}. I’m reading your goal as operational stock work, so I’d first check whether anything is unsafe, then choose the action that matches what happened.\n\n${context.guideTipsForView(activeView).slice(0, 3).map((tip, index) => `${index + 1}. ${tip}`).join("\n")}${reason}`,
    actions: pageAssistantActions(activeView, context),
  };
}

function assistantWhyAnswer(question, context, evidence) {
  if (evidence.product) {
    const total = evidence.targetRows.reduce((sum, row) => sum + Number(row.quantity), 0);
    const lowRows = evidence.targetRows.filter((row) => Number(row.quantity) >= 0 && Number(row.quantity) <= context.productLow(row.product_id));
    const negativeRows = evidence.targetRows.filter((row) => Number(row.quantity) < 0);
    const rowLines = evidence.targetRows.length
      ? evidence.targetRows.map((row) => `- ${row.location}: ${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)}`).join("\n")
      : "- No replayed stock rows are showing for this product.";
    const sourceHints = [
      ...evidence.relatedSales.slice(0, 2).map((sale) => `sale ${sale.status}: ${sale.item_label ?? context.productName(sale.product_id)} from ${sale.location}`),
      ...evidence.relatedPurchases.slice(0, 2).map((purchase) => `purchase ${purchase.status}: ${purchase.item_label ?? context.productName(purchase.product_id)} into ${purchase.location}`),
    ];
    const cause = negativeRows.length
      ? "The urgent reason is a below-zero row. That usually means a sale, transfer, or correction has outpaced recorded receiving, so the audit trail should be checked before treating the balance as final."
      : lowRows.length
        ? "The reason is threshold pressure: at least one location is at or below the configured low-stock level."
        : "It does not look low from the replayed rows I can see. If it still feels wrong, the audit trail is the place to compare recent movement records.";

    return {
      text: `${evidence.product.name} totals ${context.formatQuantity(total)} ${evidence.product.unit}. ${cause}\n\nCurrent rows:\n${rowLines}${sourceHints.length ? `\n\nRelated source hints:\n${sourceHints.map((hint) => `- ${hint}`).join("\n")}` : ""}`,
      actions: [
        { label: "Open Stock Overview", view: "dashboard" },
        { label: "Open Audit Trail", view: "audit" },
        ...(lowRows.length || negativeRows.length ? [{ label: "Prepare Stock In", view: "compose" }] : []),
      ],
    };
  }

  const urgent = [...evidence.negativeRows, ...evidence.lowRows].slice(0, 5);
  return {
    text: `The most likely explanation is in the replayed stock rows and saved work.\n\n${urgent.length ? urgent.map((row) => `- ${row.product_name} at ${row.location}: ${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)}`).join("\n") : "No low or below-zero rows are standing out right now."}\n\nFor a precise “why,” open Audit Trail and trace the product or location movement history.`,
    actions: [
      { label: "Open Stock Overview", view: "dashboard" },
      { label: "Open Audit Trail", view: "audit" },
    ],
  };
}

function assistantSafetyAnswer(normalized, context, evidence) {
  const wantsSend = matchesAny(normalized, ["send", "saved work", "queue", "outbox", "sync"]);
  const wantsSettings = matchesAny(normalized, ["change", "settings", "policy", "retention", "export", "device"]);
  const risk = assistantRiskLevel(evidence);

  if (wantsSend) {
    const readyText = evidence.invalidCount
      ? `Not yet. ${evidence.invalidCount} validation result${evidence.invalidCount === 1 ? "" : "s"} need attention before sending.`
      : evidence.workItems.length
        ? `Yes, with a human review first. ${evidence.workItems.length} queued work item${evidence.workItems.length === 1 ? "" : "s"} look ready to send as one atomic batch.`
        : "There is no saved work waiting to send.";
    return {
      text: `${readyText}\n\nBefore sending, scan the queue labels and make sure the work reflects what actually happened. If something is wrong, create an undo or correction rather than editing history.`,
      actions: [
        { label: "Open Stock Actions", view: "compose" },
        { label: "Open Audit Trail", view: "audit" },
      ],
    };
  }

  if (wantsSettings) {
    return {
      text: `${evidence.workItems.length ? "I would pause before changing settings while saved work is waiting." : "This is a reasonable time to review settings because no queued work is blocking the policy view."}\n\n${risk.reason || "The main safety check is whether settings changes could affect offline retention, export behavior, or device trust before queued work is sent."}`,
      actions: [
        { label: "Open Settings", view: "settings" },
        ...(evidence.workItems.length ? [{ label: "Review Saved Work", view: "compose" }] : []),
      ],
    };
  }

  return {
    text: `Safety read: ${risk.reason || "nothing urgent is blocking the next step from the current session data."}\n\nWhen in doubt, verify the stock row, then use Stock Actions for new work or Audit Trail for explanation.`,
    actions: [
      { label: "Open Stock Overview", view: "dashboard" },
      { label: "Open Audit Trail", view: "audit" },
    ],
  };
}

function assistantHistoryAnswer(question, context, evidence) {
  if (evidence.product) {
    const sourceHints = [
      ...evidence.relatedPurchases.slice(-3).map((purchase) => `Purchase: ${purchase.item_label ?? context.productName(purchase.product_id)} received at ${purchase.location}, quantity ${context.formatQuantity(purchase.quantity)}, status ${purchase.status}.`),
      ...evidence.relatedSales.slice(-3).map((sale) => `Sale: ${sale.item_label ?? context.productName(sale.product_id)} left from ${sale.location}, quantity ${context.formatQuantity(sale.quantity)}, status ${sale.status}.`),
    ];
    const rows = evidence.targetRows.map((row) => `- ${row.location}: ${context.formatQuantity(row.quantity)} ${context.productUnit(row.product_id)}`).join("\n");

    return {
      text: `Here’s the trace I can summarize locally for ${evidence.product.name}.\n\nCurrent replay:\n${rows || "- No replayed rows found."}\n\n${sourceHints.length ? `Recent source records I can see:\n${sourceHints.map((hint) => `- ${hint}`).join("\n")}` : "I do not have a direct source record hint for this product in the current page context."}\n\nFor the exact event-by-event trail, open Audit Trail and filter by the product.`,
      actions: [
        { label: "Open Audit Trail", view: "audit" },
        { label: "Open Stock Overview", view: "dashboard" },
      ],
    };
  }

  return {
    text: "I can explain the current state, but the exact history needs a product, location, or source record to trace. Ask “what happened to Fresh Lime?” or open Audit Trail to inspect the event sequence.",
    actions: [{ label: "Open Audit Trail", view: "audit" }],
  };
}

function actionForGoal(normalized, context) {
  const entries = [
    { phrases: ["receive", "delivery", "stock in", "arrived", "purchase"], label: context.eventLabels.STOCK_IN ?? "Stock In", goal: "record received stock", reason: "It adds inventory into a location from receiving or restock work." },
    { phrases: ["use", "consume", "waste", "sold", "sell", "stock out"], label: context.eventLabels.STOCK_OUT ?? "Use Stock", goal: "record stock leaving inventory", reason: "It records real usage, sales, waste, or consumption as stock leaving a location." },
    { phrases: ["move", "transfer", "relocate", "send to", "from bar to"], label: context.eventLabels.STOCK_TRANSFER ?? "Move Stock", goal: "move stock between locations", reason: "It keeps the same product in the ledger while changing its location." },
    { phrases: ["count", "correct", "adjust", "physical", "variance"], label: context.eventLabels.STOCK_ADJUSTMENT ?? "Correct Stock Count", goal: "correct a counted balance", reason: "It records the counted reality as an adjustment instead of rewriting past events." },
    { phrases: ["undo", "reverse", "mistake", "wrong"], label: context.eventLabels.STOCK_REVERT ?? "Undo Record", goal: "undo a previous movement", reason: "It creates a compensating record that points back to the original movement." },
    { phrases: ["new product", "enroll", "create product"], label: context.eventLabels.PRODUCT_CREATED ?? "Enroll New Product", goal: "add a catalog product", reason: "It queues product catalog work through the same audited action flow." },
    { phrases: ["suspend", "deactivate", "stop product"], label: context.eventLabels.PRODUCT_DEACTIVATED ?? "Suspend Product", goal: "suspend a product", reason: "It closes replayed stock where needed and marks the product inactive locally." },
    { phrases: ["reactivate", "activate again", "bring back"], label: context.eventLabels.PRODUCT_REACTIVATED ?? "Reactivate Product", goal: "reactivate a suspended product", reason: "It restores the catalog item without creating stock movement." },
  ];

  return entries.find((entry) => entry.phrases.some((phrase) => normalized.includes(phrase))) ?? null;
}

function assistantRiskLevel(evidence) {
  if (evidence.invalidCount > 0) {
    return { level: "high", reason: `${evidence.invalidCount} saved validation result${evidence.invalidCount === 1 ? "" : "s"} need attention before sending.`, label: "Review Saved Work", view: "compose" };
  }
  if (evidence.negativeRows.length > 0) {
    return { level: "high", reason: `${evidence.negativeRows.length} stock row${evidence.negativeRows.length === 1 ? "" : "s"} are below zero, so audit review should come before routine changes.`, label: "Open Audit Trail", view: "audit" };
  }
  if (evidence.lowRows.length > 0) {
    return { level: "medium", reason: `${evidence.lowRows.length} stock row${evidence.lowRows.length === 1 ? "" : "s"} are at or below threshold.`, label: "Open Stock Overview", view: "dashboard" };
  }
  if (evidence.workItems.length > 0) {
    return { level: "medium", reason: `${evidence.workItems.length} queued work item${evidence.workItems.length === 1 ? "" : "s"} should be reviewed before policy changes.`, label: "Review Saved Work", view: "compose" };
  }
  return { level: "low", reason: "", label: "", view: "" };
}

function assistantNextStepAnswer(context, meta, activeView) {
  const notifications = context.notifications();
  const urgentNotifications = notifications.filter((item) => item.tone === "error" || item.tone === "warning");
  const validations = context.validations();
  const invalidCount = validations.filter((result) => !result.valid).length;
  const workItems = context.workItems();
  const lowRows = context.stockRows().filter((row) => Number(row.quantity) >= 0 && Number(row.quantity) <= context.productLow(row.product_id));
  const negativeRows = context.stockRows().filter((row) => Number(row.quantity) < 0);

  const steps = [];
  if (invalidCount > 0) {
    steps.push(`Open Stock Actions and fix ${invalidCount} saved item${invalidCount === 1 ? "" : "s"} that cannot be sent yet.`);
  }
  if (negativeRows.length > 0) {
    steps.push(`Review ${negativeRows.length} below-zero stock row${negativeRows.length === 1 ? "" : "s"} in Stock Overview before recording more movement.`);
  }
  if (lowRows.length > 0) {
    steps.push(`Plan replenishment for the most urgent low-stock rows, starting with ${lowRows[0].product_name} at ${lowRows[0].location}.`);
  }
  if (workItems.length > 0 && invalidCount === 0) {
    steps.push(`Send ${workItems.length} queued work item${workItems.length === 1 ? "" : "s"} once you trust the saved batch.`);
  }
  if (steps.length === 0) {
    steps.push(...context.guideTipsForView(activeView).slice(0, 3));
  }

  return {
    text: `On ${meta.title}, I’d do this next:\n\n${steps.slice(0, 4).map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\nI’m prioritizing safety: invalid saved work first, below-zero stock second, low-stock replenishment third, then routine reporting.`,
    actions: [
      ...(urgentNotifications.length || lowRows.length || negativeRows.length ? [{ label: "Open Stock Overview", view: "dashboard" }] : []),
      ...(workItems.length ? [{ label: "Open Stock Actions", view: "compose" }] : pageAssistantActions(activeView, context).slice(0, 1)),
      { label: "Open Audit Trail", view: "audit" },
    ].slice(0, 3),
  };
}

function assistantSettingsAnswer(context) {
  const policies = context.settingsPolicies ?? [];
  const policyLines = policies.map((policy) => `- ${policy.label}: ${policy.value} (${policy.detail})`).join("\n");
  const savedCount = context.outbox.length;
  const users = context.users ?? [];
  const adminCount = users.filter((user) => `${user.role}`.includes("ADMIN")).length;

  return {
    text: `Settings should protect stock history without slowing daily work.\n\nCurrent posture:\n${policyLines || "- No policy rows are loaded in this session."}\n\n${savedCount ? `${savedCount} saved event${savedCount === 1 ? "" : "s"} are waiting, so review the queue before changing sync, retention, or export behavior.` : "No saved work is waiting, so this is a safe moment to review policy posture."} ${adminCount} admin user${adminCount === 1 ? "" : "s"} are visible in the current user set.\n\nPrivacy rule of thumb: show summaries first, reveal private staff/contact/supplier details only through role-checked, audited flows.`,
    actions: [
      { label: "Open Settings", view: "settings" },
      { label: "Open Users", view: "users" },
      { label: "Open Audit Trail", view: "audit" },
    ],
  };
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
    text: "I’m here to help with StockLedger, but I can’t reliably answer that from this local inventory session. I can help with stock on hand, low stock, saved work, page purpose, actions, audit behavior, products, locations, sales, purchases, users, reports, and settings. Try one of these: “What needs attention?”, “How much stock do we have?”, or “What should I do next?”",
    actions: [
      { label: "Open Stock Overview", view: "dashboard" },
      { label: "Open Stock Actions", view: "compose" },
    ],
  };
}

function assistantCapabilitiesAnswer(context, meta) {
  const activeView = context.activeView ?? "dashboard";
  return {
    text: `Great, we can keep this short. I can help you with ${meta.title}, stock levels, saved work, page guidance, action selection, low stock planning, privacy-safe settings, and audit-safe corrections.\n\nThe most useful way to ask is goal-first: “what should I do now?”, “why is Fresh Lime low?”, “can I send saved work?”, or “which action fits this situation?” I’ll answer from the current local ledger and give you a next step.`,
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
      text: `Hi. I’m here with you. On ${meta.title}, I can explain what you’re seeing, point out what needs attention, and help you choose the next stock-safe move in plain language.`,
      actions: pageAssistantActions(activeView, context),
    };
  }

  if (matchesAny(normalized, ["confused", "lost", "overwhelmed", "not sure", "dont know", "don't know", "stuck"])) {
    return assistantCalmTriageAnswer(context, meta, activeView);
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

function assistantCalmTriageAnswer(context, meta, activeView) {
  const rows = context.stockRows();
  const validations = safeList(() => context.validations());
  const invalid = validations.filter((result) => !result.valid);
  const workItems = safeList(() => context.workItems());
  const negativeRows = rows.filter((row) => Number(row.quantity) < 0);
  const lowRows = rows.filter((row) => Number(row.quantity) >= 0 && Number(row.quantity) <= context.productLow(row.product_id));
  const firstMove = invalid.length
    ? `fix ${invalid.length} saved validation issue${invalid.length === 1 ? "" : "s"} before sending anything`
    : negativeRows.length
      ? `check ${negativeRows[0].product_name} at ${negativeRows[0].location} because it is below zero`
      : lowRows.length
        ? `plan receiving for ${lowRows[0].product_name} at ${lowRows[0].location}`
        : workItems.length
          ? `review the ${workItems.length} saved work item${workItems.length === 1 ? "" : "s"} and send once they match reality`
          : `stay on ${meta.title} and do the next ordinary task`;
  const readLines = [
    invalid.length ? `${invalid.length} saved validation issue${invalid.length === 1 ? "" : "s"} need attention.` : "",
    negativeRows.length ? `${negativeRows.length} stock row${negativeRows.length === 1 ? "" : "s"} are below zero.` : "",
    lowRows.length ? `${lowRows.length} stock row${lowRows.length === 1 ? "" : "s"} are at or below threshold.` : "",
    workItems.length ? `${workItems.length} queued work item${workItems.length === 1 ? "" : "s"} are waiting.` : "",
  ].filter(Boolean);

  return {
    text: `You’re not behind. Let’s shrink the problem.\n\nFirst move: ${firstMove}.\n\nWhat I’m seeing:\n${readLines.length ? readLines.map((line) => `- ${line}`).join("\n") : "- Nothing urgent is standing out from the current replay or saved work."}\n\nAfter that, use Stock Actions for new work and Audit Trail only when a number needs explanation.`,
    actions: [
      ...(invalid.length || workItems.length ? [{ label: "Review Saved Work", view: "compose" }] : []),
      ...(negativeRows.length || lowRows.length ? [{ label: "Open Stock Overview", view: "dashboard" }] : []),
      { label: "Open Audit Trail", view: "audit" },
      ...pageAssistantActions(activeView, context),
    ].slice(0, 3),
  };
}

function assistantNotificationAnswer(context) {
  const notifications = context.notifications();
  const urgent = notifications.filter((item) => item.tone === "error" || item.tone === "warning");
  const opener = urgent.length
    ? `${urgent.length} thing${urgent.length === 1 ? "" : "s"} deserve attention before routine work.`
    : "Nothing urgent is showing right now.";
  return {
    text: `${opener}\n\n${notifications.map((item) => `- ${item.title}: ${item.text}`).join("\n")}\n\nI’d handle errors first, then low-stock rows, then send saved work once the queue looks valid.`,
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
    const lowRows = productRows.filter((row) => Number(row.quantity) >= 0 && Number(row.quantity) <= context.productLow(product.id));
    const negativeRows = productRows.filter((row) => Number(row.quantity) < 0);
    const busiest = [...productRows].sort((first, second) => Number(second.quantity) - Number(first.quantity))[0];
    const statusLine = negativeRows.length
      ? `${negativeRows.length} location${negativeRows.length === 1 ? "" : "s"} are below zero, so check audit history before relying on the total.`
      : lowRows.length
        ? `${lowRows.length} location${lowRows.length === 1 ? "" : "s"} are at or below the low threshold of ${context.formatQuantity(context.productLow(product.id))} ${product.unit}.`
        : `This is above the low threshold of ${context.formatQuantity(context.productLow(product.id))} ${product.unit}.`;
    const places = productRows.length
      ? productRows.map((row) => `${row.location}: ${context.formatQuantity(row.quantity)} ${product.unit}`).join("\n")
      : "No replayed stock at any location.";
    return {
      text: `${product.name} currently has ${context.formatQuantity(total)} ${product.unit} on hand. ${statusLine}${busiest ? ` Highest location: ${busiest.location}.` : ""}\n\n${places}`,
      actions: [
        { label: "Open Stock Overview", view: "dashboard" },
        ...(negativeRows.length || lowRows.length ? [{ label: "Prepare Stock In", view: "compose" }] : []),
      ],
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
    text: lines
      ? `Here’s the short list I’d handle first:\n${lines}\n\nBelow-zero rows are audit questions first. Low-stock rows are replenishment questions after you confirm the count is real.`
      : "No low-stock or below-zero rows are showing in the current replay. That means you can focus on saved work, upcoming sales, or routine receiving.",
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
    text: `${context.outbox.length} event${context.outbox.length === 1 ? "" : "s"} are saved locally in ${workItems.length} queued work item${workItems.length === 1 ? "" : "s"}. ${invalid.length ? `${invalid.length} validation result${invalid.length === 1 ? "" : "s"} need attention before sending.` : "Everything queued is ready to send as an atomic batch."}\n\n${lines || "No work is waiting to send."}\n\nIf the queue looks right, send it once. If it looks wrong, undo or correct with a new record instead of editing history.`,
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

function findMentionedLocation(question, locations) {
  const normalized = normalizeAssistantText(question);
  return locations.find((location) => normalizeAssistantText(location.name).split(" ").every((part) => normalized.includes(part)));
}

function safeList(read) {
  try {
    const value = read();
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
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
