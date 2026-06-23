#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildProductionSeedState, productionSeedSummary } from "../src/data/production-seed.mjs";
import { STORAGE_KEY } from "../src/state/local-state.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.split("=");
    return [key.replace(/^--/, ""), value];
  }),
);
const outDir = path.resolve(rootDir, args.get("out-dir") ?? "tmp/production-seed");
const statePath = path.join(outDir, "stockledger-production-state.json");
const loaderPath = path.join(outDir, "load-production-seed.js");
const state = buildProductionSeedState();
const summary = productionSeedSummary(state);
const serializedState = JSON.stringify(state, null, 2);
const loader = `// Paste this in the browser console while StockLedger is open, then press Enter.
localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(state))});
location.reload();
`;

await mkdir(outDir, { recursive: true });
await writeFile(statePath, `${serializedState}\n`, "utf8");
await writeFile(loaderPath, loader, "utf8");

console.log("Production-like StockLedger seed generated.");
console.log(`State JSON: ${statePath}`);
console.log(`Browser loader: ${loaderPath}`);
console.log(`Storage key: ${STORAGE_KEY}`);
console.log(
  `Summary: ${summary.products} products, ${summary.locations} locations, ${summary.ledgerEvents} synced events, ${summary.queuedEvents} queued events, ${summary.sales} sales, ${summary.purchases} purchases.`,
);
