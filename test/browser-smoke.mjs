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
  await page.getByRole("button", { name: /Action\s+Record Movement/ }).click();
  await page.getByRole("heading", { name: "Record Movement" }).waitFor();
  await page.getByLabel("Reason").fill("Browser smoke service usage");
  await page.getByRole("button", { name: "Save Movement" }).click();
  await page.getByRole("heading", { name: "Send Work" }).waitFor();
  const queuedCount = await page.locator("tbody tr").count();
  if (queuedCount !== 1) {
    throw new Error(`Expected one queued event after one append click, saw ${queuedCount}.`);
  }
  await page.getByRole("table").getByText("Record Use", { exact: true }).waitFor();
  await page.getByRole("table").getByText("Juniper Gin").waitFor();
  await page.getByRole("button", { name: "Offline" }).click();
  await page.getByRole("button", { name: "Send Work", exact: true }).click();
  await page.getByText(/saved movement\(s\) sent successfully/).waitFor();

  if (errors.length > 0) {
    throw new Error(`Browser console errors:\n${errors.join("\n")}`);
  }

  console.log(`Browser smoke passed at ${url}`);
} finally {
  await browser.close();
}
