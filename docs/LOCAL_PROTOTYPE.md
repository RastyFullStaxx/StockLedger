# StockLedger Local Prototype

This prototype makes the StockLedger event model usable locally before the production NestJS, PostgreSQL, Electron, and SQLite layers are built.

## What It Proves

- Inventory writes are events, not direct stock edits.
- Stock balances are derived from deterministic event replay.
- Offline work lands in a local outbox first.
- Sync is simulated as an atomic batch: one invalid event rejects the full batch.
- Idempotency keys make duplicate retries safe.
- Reconciliation creates `STOCK_ADJUSTMENT` events instead of overwriting stock.
- Reverts create compensating `STOCK_REVERT` events while preserving original history.

## Run Locally

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The default development URL is:

```text
http://127.0.0.1:5173
```

## Verify

```bash
npm test
npm run build
npm run smoke:browser
```

The unit tests cover replay, validation, atomic sync rejection, idempotency, and audit trail ordering.
The browser smoke uses Playwright Chromium to load the local UI, create an event, verify the outbox, and sync the batch.

## Browser Runtime Note

Playwright Chromium is installed through `@playwright/test` and `npx playwright install chromium`.
This WSL environment does not allow sudo package installation, so the missing Chromium shared libraries are staged locally under `.playwright-libs/` and ignored by git. If Chromium fails to launch on another machine, run:

```bash
npx playwright install chromium
npx playwright install-deps chromium
```

## Prototype Boundary

This is a browser-local working prototype. It stores demo state in `localStorage` and uses a simulated server ledger plus outbox. It does not replace the planned NestJS backend, PostgreSQL tenant databases, Prisma schemas, Electron SQLite storage, JWT/RBAC, or real tenant isolation.
