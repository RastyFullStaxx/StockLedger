# Client App Scaffold

StockLedger is planned as an offline-first system with a PC client and a future mobile client. This scaffold defines the boundaries before full implementation.

## PC Client

Path: `apps/desktop`

Planned role:
- Electron shell for the main bar terminal and back-office PC workflows.
- Local SQLite event store and outbox.
- Background sync worker for atomic batches.
- Device trust, local session lock, and audit-safe exports.

Initial screens to host:
- Home
- Stock Overview
- Stock Actions
- Audit Trail
- Products, Locations, Clients, Suppliers, Menus
- Sales, Purchases, Reports, Settings

## Mobile Client

Path: `apps/mobile`

Planned role:
- React Native app for quick counts, receiving checks, stock use, transfers, and audit lookup.
- Offline queue that mirrors the event schema used by the PC client.
- Camera/barcode hooks later, once product identity is stable.

Initial screens to host:
- Today
- Count
- Stock In
- Use Stock
- Move Stock
- Audit Lookup

## Shared Contract

Path to prepare later: `packages/client-core`

Shared client code should eventually hold:
- Canonical event types.
- Form validation shared by offline and online paths.
- Outbox serialization.
- Replay helpers needed on-device.
- Privacy-safe assistant retrieval snippets.

Do not let either client mutate stock directly. Both clients create immutable events, store them locally when offline, and send atomic batches when online.
