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
  await page.locator("[data-select-trigger='product_id']").click();
  await page.getByRole("option", { name: label, exact: true }).click();
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
  await page.getByRole("button", { name: /Open Stock Overview/ }).click();
  await page.getByRole("heading", { name: "Stock Overview" }).waitFor();
  await page.locator(".nav-item[data-view='compose']").click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  await page.getByText("Work to Send", { exact: true }).waitFor();
  const actionLabels = await page.locator(".action-type-tab").evaluateAll((tabs) =>
    tabs.map((tab) => tab.textContent?.trim()),
  );
  for (const label of ["Stock In", "Use Stock", "Correct Count", "Reverse", "Enroll", "Suspend"]) {
    if (!actionLabels.includes(label)) {
      throw new Error(`Expected action label "${label}" in Stock Actions selector.`);
    }
  }
  await page.getByLabel("Reason").fill("Browser smoke service usage");
  await page.getByRole("button", { name: "Save Action" }).click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  const queuedCount = await page.locator("[data-work-queue-card]").count();
  if (queuedCount !== 1) {
    throw new Error(`Expected one queued event after one append click, saw ${queuedCount}.`);
  }
  await page.locator(".work-queue-list").getByText("Use Stock", { exact: true }).waitFor();
  await page.locator(".work-queue-list").getByText("Juniper Gin").waitFor();
  const sendWorkNavCount = await page.getByRole("button", { name: /Send Work/ }).count();
  if (sendWorkNavCount !== 0) {
    throw new Error(`Expected no Send Work navigation button, saw ${sendWorkNavCount}.`);
  }

  await page.getByRole("button", { name: "Audit" }).click();
  await page.getByRole("heading", { name: "History" }).waitFor();
  await page.getByRole("button", { name: "Prepare reverse record" }).first().click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  await page.locator(".action-type-tab.is-active").getByText("Reverse", { exact: true }).waitFor();
  await page.getByText("Reversal Amount", { exact: true }).waitFor();
  const queuedAfterPrepare = await page.locator("[data-work-queue-card]").count();
  if (queuedAfterPrepare !== 1) {
    throw new Error(`Preparing a reverse record should not queue work immediately; saw ${queuedAfterPrepare} rows.`);
  }

  await page.getByRole("button", { name: "Products" }).click();
  await page.getByRole("heading", { name: "Products", exact: true }).waitFor();
  const directProductActionCount = await page.getByRole("button", { name: /Deactivate|Reactivate|Add Product/ }).count();
  if (directProductActionCount !== 0) {
    throw new Error(`Expected Products to be catalog-only, saw ${directProductActionCount} direct product action buttons.`);
  }

  await page.locator(".nav-item[data-view='compose']").click();
  await page.getByRole("heading", { name: "Stock Actions" }).waitFor();
  await chooseAction("Enroll");
  await page.getByLabel("Product Name").fill("Smoke Bitters");
  await page.getByLabel("Category").fill("Bar");
  await page.getByLabel("Unit").fill("bottle");
  await saveActionByDomClick();
  await page.locator(".work-queue-list").getByText("Enroll Product", { exact: true }).waitFor();

  await chooseAction("Suspend");
  await chooseProduct("Tonic Water");
  page.once("dialog", async (dialog) => dialog.accept());
  await saveActionByDomClick();
  await page.locator(".work-queue-list").getByText("Suspend Product", { exact: true }).waitFor();
  await page.locator(".work-queue-list").getByText("Grouped work: 3 events", { exact: true }).waitFor();

  await page.locator("[data-action='toggle-account']").click();
  await page.getByRole("button", { name: "Offline" }).click();
  await page.getByRole("button", { name: "Send Saved Work", exact: true }).click();
  await page.getByText(/saved movement\(s\) sent successfully/).waitFor();
  await page.getByText("No Work Waiting", { exact: true }).waitFor();

  if (errors.length > 0) {
    throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  }

  console.log(`Browser smoke passed at ${url}`);
} finally {
  await browser.close();
}
