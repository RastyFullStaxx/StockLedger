# Style System Layout

This stylesheet stack follows a senior-style layering model:

- `styles.css`: entrypoint; imports by layer priority.
- `tokens.css`: legacy compatibility entry that points to `tokens/index.css`.
- `tokens/*`: design tokens split by responsibility (`colors`, `typography`, `surface`, `spacing`, `controls`).
- `base.css`: global reset and foundational element styles.
- `layout.css`: application shell, sidebar, topbar, and structural tokens.
- `components.css`: shared UI patterns reused across multiple screens.
- `pages/*.css`: per-screen styles for home, compose, stock, products, outbox, reconcile, audit.
- `global.css`: archived legacy monolith kept for reference only, no active import.

Organization conventions:

- `components.css` contains primitives, utility wrappers, and component state visuals only.
- Page files own all viewport-specific behavior for their selectors.
- Page classes should be prefixed with the feature domain (`stock-*`, `outbox-*`, `audit-*`, `reconcile-*`, `product-*`, `landing-*`).
