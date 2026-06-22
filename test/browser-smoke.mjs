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
  await page.getByText("House Pour Menu", { exact: true }).waitFor();
  await page.locator("[data-client-row]").filter({ hasText: "Harbor Room" }).click();
  await page.getByText("Private contact", { exact: true }).first().waitFor();
  await page.locator(".nav-item[data-view='suppliers']").click();
  await page.getByText("Coastal Spirits Supply", { exact: true }).waitFor();
  await page.getByLabel("Search suppliers").fill("Marketline");
  await page.locator("[data-supplier-row]").filter({ hasText: "Marketline Produce" }).waitFor();
  await page.getByLabel("Search suppliers").fill("");
  await page.locator("[data-supplier-row]").filter({ hasText: "Coastal Spirits Supply" }).click();
  await page.getByText("Sensitive terms", { exact: true }).first().waitFor();
  await page.locator(".nav-item[data-view='menus']").click();
  await page.getByText("Juniper Gin & Tonic", { exact: true }).waitFor();
  await page.locator("[data-menu-row]").filter({ hasText: "House Pour Menu" }).click();
  await page.getByText("Technical details", { exact: true }).first().waitFor();
  await page.getByText("Fulfillment Rule", { exact: true }).waitFor();
  await page.locator(".nav-item[data-view='locations']").click();
  await page.getByRole("button", { name: "Add Location", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add Location", exact: true }).click();
  await page.getByRole("dialog", { name: "Add Location" }).waitFor();
  await page.getByLabel("Location Name").fill("Smoke Patio");
  await page.getByLabel("Owner").fill("Service team");
  await page.getByRole("button", { name: "Save Location", exact: true }).click();
  await page.locator("[data-location-row]").filter({ hasText: "Smoke Patio" }).waitFor();
  await page.locator("[data-location-row]").filter({ hasText: "Main Bar" }).click();
  await page.locator("[data-record-detail-panel]").getByText("Technical details", { exact: true }).waitFor();
  await page.locator(".nav-item[data-view='users']").click();
  await page.getByText("Role Matrix", { exact: true }).waitFor();
  await page.getByText("Device Trust", { exact: true }).waitFor();
  await page.locator("[data-user-row]").filter({ hasText: "Mara V." }).click();
  await page.getByText("Private staff details", { exact: true }).first().waitFor();
  await page.locator(".nav-item[data-view='settings']").click();
  await page.getByRole("heading", { name: "CI Lanes", exact: true }).waitFor();
  await page.getByText("npm run verify:ui", { exact: true }).waitFor();
  await page.getByText("Pipeline Strategy", { exact: true }).waitFor();

  await page.locator(".nav-item[data-view='dashboard']").click();
  await page.getByRole("heading", { name: "Stock Overview" }).waitFor();
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
  await page.locator("[data-audit-row]").first().click();
  await page.locator("[data-record-detail-panel]").getByText("Technical details", { exact: true }).waitFor();
  await page.locator("[data-record-detail-panel]").getByRole("button", { name: "Prepare undo record" }).click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  await page.locator(".action-type-tab.is-active").getByText("Undo Record", { exact: true }).waitFor();
  await page.getByText("Reversal Amount", { exact: true }).waitFor();
  const queuedAfterPrepare = await page.locator("[data-work-queue-card]").count();
  if (queuedAfterPrepare !== 1) {
    throw new Error(`Preparing a reverse record should not queue work immediately; saw ${queuedAfterPrepare} rows.`);
  }

  await page.getByRole("button", { name: "Products" }).click();
  await page.getByRole("heading", { name: "Products", exact: true }).waitFor();
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

  await page.locator(".nav-item[data-view='menus']").click();
  await page.locator("[data-menu-row]").filter({ hasText: "Event Service Menu" }).click();
  await page.getByRole("button", { name: "Fulfill Sale", exact: true }).click();
  await page.getByRole("heading", { name: "Sales", exact: true }).waitFor();
  await page.getByRole("button", { name: "Fulfill Sale", exact: true }).click();
  await page.getByText("Sale fulfilled locally. 2 STOCK_OUT events are waiting to send.", { exact: true }).waitFor();
  await page.locator("[data-sale-row]").filter({ hasText: "Sunfold Events" }).waitFor();
  await page.locator("[data-sale-row]").filter({ hasText: "Harbor Rum Lime Service" }).waitFor();
  await page.locator("[data-sale-row]").filter({ hasText: "Sunfold Events" }).click();
  await page.locator("[data-record-detail-panel]").getByText("Technical source", { exact: true }).waitFor();

  await page.locator(".nav-item[data-view='purchases']").click();
  await page.getByRole("heading", { name: "Purchases", exact: true }).waitFor();
  await page.getByRole("button", { name: "Receive Purchase", exact: true }).click();
  await page.getByText("Purchase received locally. STOCK_IN is waiting to send.", { exact: true }).waitFor();
  await page.locator(".business-record-panel").getByText("Coastal Spirits Supply", { exact: true }).waitFor();
  await page.locator("[data-purchase-row]").filter({ hasText: "Coastal Spirits Supply" }).click();
  await page.locator("[data-record-detail-panel]").getByText("Technical source", { exact: true }).waitFor();

  await page.locator(".nav-item[data-view='reports']").click();
  await page.getByRole("heading", { name: "Reports", exact: true }).waitFor();
  await page.getByText("Sales by Client", { exact: true }).waitFor();
  await page.getByText("Sunfold Events", { exact: true }).waitFor();
  await page.getByText("Receiving by Supplier", { exact: true }).waitFor();
  await page.getByText("Coastal Spirits Supply", { exact: true }).waitFor();
  await page.getByText("Export Boundary", { exact: true }).waitFor();

  await page.locator(".nav-item[data-view='compose']").click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  const saleWorkCard = page
    .locator("[data-work-queue-card]")
    .filter({ hasText: "Sale - Sunfold Events - Harbor Rum Lime Service" })
    .first();
  await saleWorkCard.waitFor();
  await saleWorkCard.getByText("Grouped work: 2 events", { exact: true }).waitFor();
  await page.locator(".work-queue-list").getByText("Stock In", { exact: true }).waitFor();
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
  await page.getByText("Sale - Sunfold Events - Harbor Rum Lime Service").first().waitFor();

  if (errors.length > 0) {
    throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  }

  console.log(`Browser smoke passed at ${url}`);
} finally {
  await browser.close();
}
