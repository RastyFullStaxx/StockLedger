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
- Client menus can translate one fulfilled sale into grouped `STOCK_OUT` events from recipe lines.
- Suppliers show products supplied, receiving history, reliability signals, and hidden commercial terms.
- Locations show replayed stock balances, low/negative review signals, and recent location activity.
- Reports summarize stock health, client sales, supplier receiving, movement mix, source activity, and review signals.
- Audit trail rows keep business source labels visible while hiding batch/idempotency internals in technical details.
- Users & Roles shows access scope, role matrix, device trust, and sensitive-access review without exposing full staff PII.
- Settings shows tenant defaults, numbering rules, privacy guardrails, and the split CI verification lanes.

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

Run the full local verification loop with one command:

```bash
npm run verify
```

This runs unit tests, builds the app, starts a temporary Vite dev server on an open local port, runs the browser smoke against that exact server, stops the server, and keeps per-step logs in a temp folder printed by the command.

For quick server-free checks:

```bash
npm run verify:quick
npm run verify:build
```

For UI-only work, run the browser smoke without repeating unit tests and production build:

```bash
npm run verify:ui
```

For debugging browser failures, keep the temporary server alive after a failed run:

```bash
npm run verify:debug
```

You can also run the smoke test manually against an already-running server:

```bash
npm run smoke:browser
```

The unit tests cover replay, validation, atomic sync rejection, idempotency, and audit trail ordering.
The browser smoke uses Playwright Chromium to load the local UI, check the expanded module navigation, verify client/supplier/menu/location/report/user/settings pages, create stock actions, post a menu-based fulfilled sale as grouped `STOCK_OUT` work, receive a purchase as `STOCK_IN`, verify Work to Send, sync the batch, and confirm source labels in Audit Trail.

## CI Strategy

GitHub Actions runs three lanes in parallel so failures arrive sooner:

- `verify:quick` for unit tests and verification helper tests.
- `verify:build` for production bundle checks.
- `verify:ui` for the browser smoke against a temporary Vite server.

## Browser Runtime Note

Playwright Chromium is installed through `@playwright/test` and `npx playwright install chromium`.
This WSL environment does not allow sudo package installation, so the missing Chromium shared libraries are staged locally under `.playwright-libs/` and ignored by git. If Chromium fails to launch on another machine, run:

```bash
npx playwright install chromium
npx playwright install-deps chromium
```

## Prototype Boundary

This is a browser-local working prototype. It stores demo state in `localStorage` and uses a simulated server ledger plus outbox. It does not replace the planned NestJS backend, PostgreSQL tenant databases, Prisma schemas, Electron SQLite storage, JWT/RBAC, or real tenant isolation.
