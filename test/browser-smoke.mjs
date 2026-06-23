import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.STOCKLEDGER_URL ?? "http://127.0.0.1:5173";
const localBrowserLibs = resolve(".playwright-libs/root/usr/lib/x86_64-linux-gnu");
const browserEnv = existsSync(localBrowserLibs)
  ? {
      ...process.env,
      LD_LIBRARY_PATH: [localBrowserLibs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
    }
  : process.env;

const browser = await chromium.launch({ env: browserEnv });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function chooseAction(label) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function chooseProduct(label) {
  const target = page.locator(".product-check-option").filter({ hasText: label }).locator("input[name='product_ids']");
  await target.check();
  const targetValue = await target.inputValue();
  const checkedValues = await page.locator("input[name='product_ids']:checked").evaluateAll((inputs) => inputs.map((input) => input.value));
  for (const value of checkedValues) {
    if (value !== targetValue) {
      await page.locator(`input[name='product_ids'][value='${value}']`).uncheck();
    }
  }
}

async function addProduct(label) {
  const checkbox = page.locator(".product-check-option").filter({ hasText: label }).locator("input[name='product_ids']");
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }
}

async function saveActionByDomClick() {
  await page.locator("[data-action='append-event']").evaluate((button) => button.click());
}

async function setProductAmount(productId, amount) {
  await page.locator(`input[name="quantity_${productId}"]`).evaluate((input, nextValue) => {
    input.value = nextValue;
    input.setAttribute("value", nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(amount));
}

async function setPhysicalCount(productId, count) {
  await page.locator(`input[name="physical_count_${productId}"]`).evaluate((input, nextValue) => {
    input.value = nextValue;
    input.setAttribute("value", nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(count));
}

async function expectFilterTabsNotClipped(label) {
  const clipped = await page.locator(".record-filter-tabs, .stock-overview-view-switch").evaluateAll((groups) =>
    groups
      .filter((group) => group.offsetParent !== null)
      .map((group) => ({
        text: group.textContent?.trim() ?? "",
        scrollWidth: group.scrollWidth,
        clientWidth: group.clientWidth,
        scrollHeight: group.scrollHeight,
        clientHeight: group.clientHeight,
      }))
      .filter((group) => group.scrollWidth > group.clientWidth + 1 || group.scrollHeight > group.clientHeight + 1),
  );
  if (clipped.length > 0) {
    throw new Error(`${label} filter tabs should fit without internal scrollbars: ${JSON.stringify(clipped)}`);
  }
}

async function expectRecordWorkspaceFits(label) {
  const metrics = await page.locator(".record-workspace.has-detail").first().evaluate((workspace) => {
    const children = Array.from(workspace.children);
    const tableSide = children.find((child) => child.classList.contains("record-table-panel") || child.classList.contains("record-table-shell"));
    const tableShell = workspace.querySelector(".record-table-shell");
    const table = workspace.querySelector(".record-table");
    const detail = workspace.querySelector("[data-record-detail-panel]");
    const rect = (element) => {
      const box = element?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom } : null;
    };

    return {
      tableSide: rect(tableSide),
      tableShell: rect(tableShell),
      table: rect(table),
      detail: rect(detail),
      viewportHeight: window.innerHeight,
    };
  });

  if (!metrics.tableSide || !metrics.tableShell || !metrics.table || !metrics.detail) {
    throw new Error(`${label} record workspace should expose table and detail geometry.`);
  }

  const sideGap = metrics.detail.x - metrics.tableSide.right;
  const tableRightGap = metrics.tableShell.right - metrics.table.right;
  if (sideGap > 18) {
    throw new Error(`${label} record detail gap is too wide: ${JSON.stringify(metrics)}.`);
  }
  if (tableRightGap > 4) {
    throw new Error(`${label} retracted table leaves an empty right gap: ${JSON.stringify(metrics)}.`);
  }
  if (metrics.detail.height < metrics.tableSide.height - 4 || metrics.detail.height < metrics.viewportHeight * 0.62) {
    throw new Error(`${label} detail panel should use the full record workspace height: ${JSON.stringify(metrics)}.`);
  }
}

try {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "StockLedger" }).waitFor();
  await page.getByRole("button", { name: /Stocky/ }).click();
  await page.getByRole("dialog", { name: "Stocky Assistant" }).waitFor();
  const assistantBounds = await page.locator(".guide-menu").boundingBox();
  const viewport = page.viewportSize();
  if (!assistantBounds || !viewport) {
    throw new Error("Expected assistant menu to have visible bounds.");
  }
  if (
    assistantBounds.x < 0 ||
    assistantBounds.y < 0 ||
    assistantBounds.x + assistantBounds.width > viewport.width ||
    assistantBounds.y + assistantBounds.height > viewport.height
  ) {
    throw new Error(`Assistant menu is clipped: ${JSON.stringify(assistantBounds)} in ${JSON.stringify(viewport)}.`);
  }
  await page.getByText("Hi, I’m Stocky.", { exact: false }).waitFor();
  if (await page.locator(".assistant-context, .assistant-quick-actions").count()) {
    throw new Error("Stocky should render as a chat-only panel without outside guide details.");
  }
  await page.getByLabel("Ask about StockLedger").fill("How many stocks do we have?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.locator(".assistant-message").filter({ hasText: "products with replayed stock" }).waitFor();
  await page.getByLabel("Ask about StockLedger").fill("Who won the basketball game?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.locator(".assistant-message").filter({ hasText: "can’t reliably answer that from this local inventory session" }).waitFor();
  const persistedAssistantChat = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("stockledger-local-prototype-state-v1") || "{}");
    return Boolean(saved.assistantMessages || saved.assistantInput || saved.guideOpen);
  });
  if (persistedAssistantChat) {
    throw new Error("Assistant chat state should stay session-only and out of localStorage.");
  }
  await page.getByRole("button", { name: "Close Stocky" }).click();
  for (const [view, heading] of [
    ["sales", "Sales"],
    ["purchases", "Purchases"],
    ["clients", "Clients"],
    ["menus", "Menus"],
    ["reports", "Reports"],
    ["users", "Users & Roles"],
  ]) {
    await page.locator(`.nav-item[data-view='${view}']`).click();
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  }
  await page.locator(".nav-item[data-view='clients']").click();
  await page.locator("[data-client-row]").filter({ hasText: "House Pour Menu" }).waitFor();
  await page.getByLabel("Search clients").fill("Sunfold");
  await page.locator("[data-client-row]").filter({ hasText: "Sunfold Events" }).waitFor();
  await page.getByLabel("Search clients").fill("");
  await page.locator("[data-client-row]").filter({ hasText: "Harbor Room" }).click();
  await page.getByText("Private contact", { exact: true }).first().waitFor();
  await expectRecordWorkspaceFits("Clients");
  await page.locator(".nav-item[data-view='suppliers']").click();
  await expectFilterTabsNotClipped("Suppliers");
  await page.getByText("Coastal Spirits Supply", { exact: true }).waitFor();
  await page.getByLabel("Search suppliers").fill("Marketline");
  await page.locator("[data-supplier-row]").filter({ hasText: "Marketline Produce" }).waitFor();
  await page.getByLabel("Search suppliers").fill("");
  await page.locator("[data-supplier-row]").filter({ hasText: "Coastal Spirits Supply" }).click();
  await page.getByText("Sensitive terms", { exact: true }).first().waitFor();
  await expectRecordWorkspaceFits("Suppliers");
  await page.locator(".nav-item[data-view='menus']").click();
  await expectFilterTabsNotClipped("Menus");
  await page.getByLabel("Search menus").fill("Rum");
  await page.locator("[data-menu-row]").filter({ hasText: "Event Service Menu" }).waitFor();
  await page.getByLabel("Search menus").fill("");
  await page.locator("[data-menu-row]").filter({ hasText: "Juniper Gin & Tonic" }).waitFor();
  await page.locator("[data-menu-row]").filter({ hasText: "House Pour Menu" }).click();
  await page.getByText("Technical details", { exact: true }).first().waitFor();
  await page.getByText("Fulfillment Rule", { exact: true }).waitFor();
  await expectRecordWorkspaceFits("Menus");
  await page.locator(".nav-item[data-view='locations']").click();
  await expectFilterTabsNotClipped("Locations");
  await page.getByRole("button", { name: "Add Location", exact: true }).waitFor();
  await page.getByLabel("Search locations").fill("Cellar");
  await page.locator("[data-location-row]").filter({ hasText: "Cellar" }).waitFor();
  await page.getByLabel("Search locations").fill("");
  await page.getByRole("button", { name: "Add Location", exact: true }).click();
  await page.getByRole("dialog", { name: "Add Location" }).waitFor();
  await page.getByLabel("Location Name").fill("Smoke Patio");
  await page.getByLabel("Owner").fill("Service team");
  await page.getByRole("button", { name: "Save Location", exact: true }).click();
  await page.locator("[data-location-row]").filter({ hasText: "Smoke Patio" }).waitFor();
  await page.locator("[data-location-row]").filter({ hasText: "Main Bar" }).click();
  await page.locator("[data-record-detail-panel]").getByText("Technical details", { exact: true }).waitFor();
  await expectRecordWorkspaceFits("Locations");
  await page.locator(".nav-item[data-view='users']").click();
  await expectFilterTabsNotClipped("Users");
  await page.getByText("Role Matrix", { exact: true }).waitFor();
  await page.getByText("Device Trust", { exact: true }).waitFor();
  await page.getByLabel("Search users").fill("Eli");
  await page.locator("[data-user-row]").filter({ hasText: "Eli R." }).waitFor();
  await page.getByLabel("Search users").fill("");
  await page.locator("[data-user-row]").filter({ hasText: "Mara V." }).click();
  await page.getByText("Private staff details", { exact: true }).first().waitFor();
  await expectRecordWorkspaceFits("Users & Roles");
  await page.locator(".nav-item[data-view='settings']").click();
  await page.getByText("Default Location", { exact: true }).waitFor();
  await page.getByText("SALE-2026-00042", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "CI Lanes", exact: true }).waitFor();
  await page.getByText("npm run verify:ui", { exact: true }).waitFor();
  await page.getByText("Pipeline Strategy", { exact: true }).waitFor();

  await page.locator(".nav-item[data-view='dashboard']").click();
  await page.getByRole("heading", { name: "Stock Overview" }).waitFor();
  await expectFilterTabsNotClipped("Stock Overview");
  await page.locator(".nav-item[data-view='compose']").click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  await page.getByText("Work to Send", { exact: true }).waitFor();
  const actionLabels = await page.locator(".action-type-tab").evaluateAll((tabs) =>
    tabs.map((tab) => tab.textContent?.trim()),
  );
  for (const label of ["Use Stock", "Stock In", "Correct Count", "Undo Record", "Enroll New Product", "Suspend Product"]) {
    if (!actionLabels.includes(label)) {
      throw new Error(`Expected action label "${label}" in Stock Actions selector.`);
    }
  }
  await addProduct("Tonic Water");
  await page.getByLabel("Reason").fill("Browser smoke service usage");
  await page.getByRole("button", { name: "Save Action" }).click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  const queuedCount = await page.locator("[data-work-queue-card]").count();
  if (queuedCount !== 1) {
    throw new Error(`Expected one queued event after one append click, saw ${queuedCount}.`);
  }
  const activeNavCountColors = await page.evaluate(() => {
    const badge = document.querySelector(".nav-item.is-active[data-view='compose'] .nav-count");
    if (!badge) return null;
    const probe = document.createElement("span");
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--color-primary");
    document.body.append(probe);
    const primary = getComputedStyle(probe).color;
    probe.remove();
    const badgeStyles = getComputedStyle(badge);
    return {
      background: badgeStyles.backgroundColor,
      color: badgeStyles.color,
      primary,
    };
  });
  if (!activeNavCountColors) {
    throw new Error("Expected active Stock Actions nav count badge after queueing work.");
  }
  if (activeNavCountColors.background !== "rgb(255, 255, 255)" || activeNavCountColors.color !== activeNavCountColors.primary) {
    throw new Error(
      `Expected active Stock Actions count badge to be white with primary text, saw ${activeNavCountColors.background} / ${activeNavCountColors.color}.`,
    );
  }
  await page.locator(".work-queue-list").getByText("Use Stock", { exact: true }).waitFor();
  await page.locator(".work-queue-list").getByText("Juniper Gin").waitFor();
  await page.locator(".work-queue-list").getByText("Grouped work: 2 events", { exact: true }).waitFor();
  const sendWorkNavCount = await page.getByRole("button", { name: /Send Work/ }).count();
  if (sendWorkNavCount !== 0) {
    throw new Error(`Expected no Send Work navigation button, saw ${sendWorkNavCount}.`);
  }

  await page.getByRole("button", { name: "Audit Trail" }).click();
  await page.getByRole("heading", { name: "Audit Trail" }).waitFor();
  await page.getByLabel("Search audit trail").fill("Tonic");
  await page.locator("[data-audit-row]").filter({ hasText: "Tonic Water" }).first().waitFor();
  await page.getByLabel("Search audit trail").fill("");
  await page.locator("[data-audit-row]").first().click();
  await page.locator("[data-record-detail-panel]").getByText("Technical details", { exact: true }).waitFor();
  await expectRecordWorkspaceFits("Audit Trail");
  await page.locator("[data-record-detail-panel]").getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  await page.locator(".action-type-tab.is-active").getByText("Undo Record", { exact: true }).waitFor();
  await page.getByText("Reversal Amount", { exact: true }).waitFor();
  const queuedAfterPrepare = await page.locator("[data-work-queue-card]").count();
  if (queuedAfterPrepare !== 1) {
    throw new Error(`Preparing a reverse record should not queue work immediately; saw ${queuedAfterPrepare} rows.`);
  }

  await page.getByRole("button", { name: "Products" }).click();
  await page.getByRole("heading", { name: "Products", exact: true }).waitFor();
  await expectFilterTabsNotClipped("Products");
  if (await page.locator(".product-workspace .panel-header h2", { hasText: "Product Catalog" }).count()) {
    throw new Error("Products should not repeat the Product Catalog table title.");
  }
  await page.getByLabel("Search products").fill("Tonic");
  await page.locator(".product-table").getByText("Tonic Water", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Suspended", exact: true }).click();
  await page.getByText("No products match these filters.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.locator(".product-table").getByText("Tonic Water", { exact: true }).waitFor();
  const directProductActionCount = await page.getByRole("button", { name: /Deactivate|Reactivate|Add Product/ }).count();
  if (directProductActionCount !== 0) {
    throw new Error(`Expected Products to be catalog-only, saw ${directProductActionCount} direct product action buttons.`);
  }

  await page.locator(".nav-item[data-view='compose']").click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  await chooseAction("Enroll New Product");
  await page.getByLabel("Product Name").fill("Smoke Bitters");
  await page.getByLabel("Category").fill("Bar");
  await page.getByLabel("Unit").fill("bottle");
  await saveActionByDomClick();
  await page.locator(".work-queue-list").getByText("Enroll New Product", { exact: true }).waitFor();

  await chooseAction("Suspend Product");
  await chooseProduct("Tonic Water");
  page.once("dialog", async (dialog) => dialog.accept());
  await saveActionByDomClick();
  await page.locator(".work-queue-list").getByText("Suspend Product", { exact: true }).waitFor();
  await page.locator(".work-queue-list").getByText("Grouped work: 3 events", { exact: true }).waitFor();

  await chooseAction("Correct Count");
  await chooseProduct("Juniper Gin");
  await addProduct("Harbor Rum");
  await page.getByText("Physical Counts", { exact: true }).waitFor();
  await setPhysicalCount("prod-gin", 99);
  await setPhysicalCount("prod-rum", 88);
  await saveActionByDomClick();
  const correctionWorkCard = page.locator("[data-work-queue-card]").filter({ hasText: "Correct Stock Count" }).first();
  await correctionWorkCard.waitFor();
  await correctionWorkCard.getByText("Grouped work: 2 events", { exact: true }).waitFor();
  const queuedCorrectionCounts = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("stockledger-local-prototype-state-v1") || "{}")
      .outbox
      .filter((event) => event.type === "STOCK_ADJUSTMENT" && `${event.reason ?? ""}`.startsWith("Physical count"))
      .map((event) => [event.product_name, event.reason])
      .sort(),
  );
  if (
    queuedCorrectionCounts.length !== 2 ||
    queuedCorrectionCounts[0]?.[0] !== "Harbor Rum" ||
    !queuedCorrectionCounts[0]?.[1]?.startsWith("Physical count 88 vs system ") ||
    queuedCorrectionCounts[1]?.[0] !== "Juniper Gin" ||
    !queuedCorrectionCounts[1]?.[1]?.startsWith("Physical count 99 vs system ")
  ) {
    throw new Error(`Expected separate physical count reasons per corrected product, saw ${JSON.stringify(queuedCorrectionCounts)}.`);
  }

  await page.locator(".nav-item[data-view='sales']").click();
  await page.getByRole("heading", { name: "Sales", exact: true }).waitFor();
  await expectFilterTabsNotClipped("Sales");
  if (await page.locator(".sales-record-panel .panel-header h2", { hasText: "Sales Records" }).count()) {
    throw new Error("Sales should not repeat the Sales Records table title.");
  }
  if (await page.getByRole("button", { name: "Fulfill Sale", exact: true }).count()) {
    throw new Error("Sales tab should not fulfill stock directly; use Stock Actions with optional sale details.");
  }

  await page.locator(".nav-item[data-view='purchases']").click();
  await page.getByRole("heading", { name: "Purchases", exact: true }).waitFor();
  await expectFilterTabsNotClipped("Purchases");
  if (await page.locator(".purchase-record-workspace").count()) {
    const repeatedPurchaseTitle = await page.locator(".business-record-panel .panel-header h2", { hasText: "Receiving Records" }).count();
    if (repeatedPurchaseTitle) {
      throw new Error("Purchases should not repeat the Receiving Records table title.");
    }
  }
  await page.locator("[data-purchase-row]").filter({ hasText: "Coastal Spirits Supply" }).first().waitFor();
  if (await page.getByRole("button", { name: "Receive Purchase", exact: true }).count()) {
    throw new Error("Purchases tab should not receive stock directly; use Stock Actions with optional purchase details.");
  }

  await page.locator(".nav-item[data-view='compose']").click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  await chooseAction("Use Stock");
  await chooseProduct("Juniper Gin");
  await addProduct("Harbor Rum");
  await setProductAmount("prod-gin", 2);
  await setProductAmount("prod-rum", 3);
  await page.getByLabel("Attach sale details").check();
  await page.getByLabel("Sale Notes").fill("Event service use");
  await saveActionByDomClick();
  await page.getByText("Sale recorded locally. 2 STOCK_OUT events are waiting to send.", { exact: true }).waitFor();
  await page.locator("[data-work-queue-card]").filter({ hasText: "Sale - Harbor Room - 2 products" }).first().waitFor();
  const queuedSaleQuantities = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("stockledger-local-prototype-state-v1") || "{}")
      .outbox
      .filter((event) => event.source_label === "Sale - Harbor Room - 2 products")
      .map((event) => [event.product_name, Number(event.quantity)])
      .sort(),
  );
  if (JSON.stringify(queuedSaleQuantities) !== JSON.stringify([["Harbor Rum", 3], ["Juniper Gin", 2]])) {
    throw new Error(`Expected separate sale quantities per product, saw ${JSON.stringify(queuedSaleQuantities)}.`);
  }

  await chooseAction("Stock In");
  await chooseProduct("Harbor Rum");
  await addProduct("Fresh Lime");
  await setProductAmount("prod-rum", 4);
  await setProductAmount("prod-lime", 5);
  await page.getByLabel("Attach purchase details").check();
  await page.getByLabel("Receiving Notes").fill("Matched supplier delivery");
  await saveActionByDomClick();
  await page.getByText("Purchase recorded locally. 2 STOCK_IN events are waiting to send.", { exact: true }).waitFor();
  await page.locator("[data-work-queue-card]").filter({ hasText: "Purchase - Coastal Spirits Supply - 2 products" }).first().waitFor();
  const queuedPurchaseQuantities = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("stockledger-local-prototype-state-v1") || "{}")
      .outbox
      .filter((event) => event.source_label === "Purchase - Coastal Spirits Supply - 2 products")
      .map((event) => [event.product_name, Number(event.quantity)])
      .sort(),
  );
  if (JSON.stringify(queuedPurchaseQuantities) !== JSON.stringify([["Fresh Lime", 5], ["Harbor Rum", 4]])) {
    throw new Error(`Expected separate purchase quantities per product, saw ${JSON.stringify(queuedPurchaseQuantities)}.`);
  }

  await page.locator(".nav-item[data-view='sales']").click();
  await page.getByRole("heading", { name: "Sales", exact: true }).waitFor();
  await page.locator("[data-sale-row]").filter({ hasText: "Harbor Room" }).filter({ hasText: "2 products" }).waitFor();
  await page.locator("[data-sale-row]").filter({ hasText: "Harbor Room" }).filter({ hasText: "2 products" }).click();
  await page.locator("[data-record-detail-panel]").getByText("Technical source", { exact: true }).waitFor();
  await expectRecordWorkspaceFits("Sales");

  await page.locator(".nav-item[data-view='purchases']").click();
  await page.getByRole("heading", { name: "Purchases", exact: true }).waitFor();
  await page.getByLabel("Search purchases").fill("Coastal");
  await page.locator("[data-purchase-row]").filter({ hasText: "Matched supplier delivery" }).filter({ hasText: "2 products" }).waitFor();
  await page.getByLabel("Search purchases").fill("");
  await page.locator("[data-purchase-row]").filter({ hasText: "Matched supplier delivery" }).filter({ hasText: "2 products" }).click();
  await page.locator("[data-record-detail-panel]").getByText("Technical source", { exact: true }).waitFor();
  await expectRecordWorkspaceFits("Purchases");

  await page.locator(".nav-item[data-view='reports']").click();
  await page.getByRole("heading", { name: "Reports", exact: true }).waitFor();
  await page.getByText("Sales by Client", { exact: true }).waitFor();
  await page.getByText("Harbor Room", { exact: true }).waitFor();
  await page.getByText("Receiving by Supplier", { exact: true }).waitFor();
  await page.getByText("Coastal Spirits Supply", { exact: true }).waitFor();
  await page.getByText("Export Boundary", { exact: true }).waitFor();

  await page.locator(".nav-item[data-view='compose']").click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  const saleWorkCard = page
    .locator("[data-work-queue-card]")
    .filter({ hasText: "Sale - Harbor Room - 2 products" })
    .first();
  await saleWorkCard.waitFor();
  await saleWorkCard.getByText("Grouped work: 2 events", { exact: true }).waitFor();
  const purchaseWorkCard = page
    .locator("[data-work-queue-card]")
    .filter({ hasText: "Purchase - Coastal Spirits Supply - 2 products" })
    .first();
  await purchaseWorkCard.waitFor();
  await purchaseWorkCard.getByText("Grouped work: 2 events", { exact: true }).waitFor();
  const queuedAfterBusinessWork = await page.locator("[data-work-queue-card]").count();
  if (queuedAfterBusinessWork < 5) {
    throw new Error(`Expected stock, lifecycle, sale, and purchase work cards; saw ${queuedAfterBusinessWork}.`);
  }

  await page.locator("[data-action='toggle-account']").click();
  await page.getByRole("button", { name: "Offline" }).click();
  await page.getByRole("button", { name: "Send Saved Work", exact: true }).click();
  await page.getByText(/saved movement\(s\) sent successfully/).waitFor();
  await page.getByText("No Work Waiting", { exact: true }).waitFor();
  await page.locator(".nav-item[data-view='audit']").click();
  await page.getByRole("heading", { name: "Audit Trail" }).waitFor();
  await page.getByText("Sale - Harbor Room - 2 products").first().waitFor();

  if (errors.length > 0) {
    throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  }

  console.log(`Browser smoke passed at ${url}`);
} finally {
  await browser.close();
}
