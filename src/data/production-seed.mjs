import { createInventoryEvent, summarizeStock, validateEvent } from "../domain/ledger.mjs";
import {
  DEFAULT_CLIENTS,
  DEFAULT_MENU_ITEMS,
  DEFAULT_PRODUCTS,
  DEFAULT_SUPPLIERS,
  defaultLocations,
  defaultProducts,
  defaultState,
  tenant,
} from "./demo-data.mjs";

export const PRODUCTION_SEED_NOW = Date.parse("2026-06-23T08:30:00+08:00");

const EXTRA_PRODUCTS = [
  product("prod-vodka", "Silver Vodka", "Spirits", "bottle", 8),
  product("prod-whiskey", "North Rye Whiskey", "Spirits", "bottle", 6),
  product("prod-tequila", "Blue Agave Tequila", "Spirits", "bottle", 5),
  product("prod-vermouth", "Dry Vermouth", "Spirits", "bottle", 4),
  product("prod-soda", "Soda Water", "Mixer", "case", 9),
  product("prod-ginger", "Ginger Beer", "Mixer", "case", 7),
  product("prod-mint", "Fresh Mint", "Kitchen", "bundle", 10),
  product("prod-orange", "Orange Peel", "Kitchen", "kg", 4),
  product("prod-bitters", "Aromatic Bitters", "Bar", "bottle", 3),
  product("prod-ice", "Service Ice", "Operations", "bag", 20),
  {
    ...product("prod-elderflower", "Elderflower Cordial", "Mixer", "bottle", 4),
    is_active: false,
    deactivated_at: new Date(PRODUCTION_SEED_NOW - 1000 * 60 * 60 * 12).toISOString(),
    deactivated_by: "Mara Velasco",
    deactivated_reason: "Supplier recall hold",
  },
];

const EXTRA_LOCATIONS = [
  { id: "loc-rooftop-bar", name: "Rooftop Bar", kind: "Service", owner: "Bar team", status: "Active" },
  { id: "loc-event-hall", name: "Event Hall", kind: "Service", owner: "Events team", status: "Active" },
  { id: "loc-cold-room", name: "Cold Room", kind: "Storage", owner: "Kitchen team", status: "Active" },
  { id: "loc-receiving-dock", name: "Receiving Dock", kind: "Delivery", owner: "Receiving team", status: "Active" },
  { id: "loc-quarantine", name: "Quarantine Shelf", kind: "Storage", owner: "Inventory team", status: "Active" },
];

const PURCHASE_BATCHES = [
  {
    id: "prod-seed-purchase-spirits-001",
    supplier_id: "supplier-coastal",
    supplier: "Coastal Spirits Supply",
    location: "Dry Store / Cellar",
    notes: "Morning spirits delivery across primary stores.",
    items: [
      ["prod-gin", "Dry Store", 72],
      ["prod-rum", "Cellar", 48],
      ["prod-vodka", "Dry Store", 36],
      ["prod-whiskey", "Cellar", 30],
      ["prod-tequila", "Cellar", 28],
      ["prod-vermouth", "Cellar", 18],
    ],
  },
  {
    id: "prod-seed-purchase-produce-001",
    supplier_id: "supplier-marketline",
    supplier: "Marketline Produce",
    location: "Cold Room / Kitchen",
    notes: "Daily produce and garnish receiving.",
    items: [
      ["prod-lime", "Cold Room", 96],
      ["prod-mint", "Cold Room", 28],
      ["prod-orange", "Kitchen", 22],
      ["prod-ice", "Receiving Dock", 80],
    ],
  },
  {
    id: "prod-seed-purchase-mixers-001",
    supplier_id: "supplier-cellar",
    supplier: "Cellar & Case Distribution",
    location: "Dry Store",
    notes: "Mixer case delivery for weekend forecast.",
    items: [
      ["prod-tonic", "Dry Store", 54],
      ["prod-soda", "Dry Store", 42],
      ["prod-ginger", "Dry Store", 32],
      ["prod-bitters", "Main Bar", 9],
    ],
  },
];

const TRANSFERS = [
  ["prod-gin", "Dry Store", "Main Bar", 16, "Opening service par"],
  ["prod-gin", "Dry Store", "Rooftop Bar", 10, "Rooftop par setup"],
  ["prod-rum", "Cellar", "Main Bar", 12, "Main bar par"],
  ["prod-rum", "Cellar", "Event Hall", 8, "Event station setup"],
  ["prod-vodka", "Dry Store", "Main Bar", 10, "Weekend vodka par"],
  ["prod-vodka", "Dry Store", "Rooftop Bar", 8, "Rooftop vodka par"],
  ["prod-whiskey", "Cellar", "Main Bar", 8, "Whiskey flight prep"],
  ["prod-tequila", "Cellar", "Main Bar", 8, "Margarita station prep"],
  ["prod-vermouth", "Cellar", "Main Bar", 6, "Martini station prep"],
  ["prod-tonic", "Dry Store", "Main Bar", 14, "Mixer par"],
  ["prod-tonic", "Dry Store", "Rooftop Bar", 10, "Rooftop mixer par"],
  ["prod-soda", "Dry Store", "Main Bar", 12, "Mixer par"],
  ["prod-ginger", "Dry Store", "Event Hall", 8, "Event mixer setup"],
  ["prod-lime", "Cold Room", "Kitchen", 24, "Prep station stock"],
  ["prod-lime", "Kitchen", "Main Bar", 10, "Bar garnish prep"],
  ["prod-lime", "Kitchen", "Rooftop Bar", 6, "Rooftop garnish prep"],
  ["prod-mint", "Cold Room", "Main Bar", 8, "Mojito garnish prep"],
  ["prod-orange", "Kitchen", "Main Bar", 5, "Old fashioned garnish prep"],
  ["prod-ice", "Receiving Dock", "Main Bar", 30, "Service ice par"],
  ["prod-ice", "Receiving Dock", "Event Hall", 20, "Event service ice"],
];

const SALES = [
  {
    id: "prod-seed-sale-harbor-001",
    client_id: "client-harbor-room",
    sale_type: "recurring",
    sale_mode: "menu_item",
    menu_item_id: "menu-item-gin-tonic",
    item_label: "Juniper Gin & Tonic",
    location: "Main Bar",
    notes: "Lunch service recurring menu fulfillment.",
    items: [
      ["prod-gin", 3],
      ["prod-tonic", 3],
    ],
  },
  {
    id: "prod-seed-sale-sunfold-001",
    client_id: "client-sunfold-events",
    sale_type: "one_time",
    sale_mode: "direct_stock",
    menu_item_id: null,
    item_label: "Event spirit package",
    location: "Event Hall",
    notes: "Afternoon event bar package.",
    items: [
      ["prod-rum", 5],
      ["prod-ginger", 3],
      ["prod-ice", 8],
    ],
  },
  {
    id: "prod-seed-sale-north-pier-001",
    client_id: "client-north-pier",
    sale_type: "recurring",
    sale_mode: "direct_stock",
    menu_item_id: null,
    item_label: "Cafe garnish refill",
    location: "Kitchen",
    notes: "Wholesale lime prep pack.",
    items: [["prod-lime", 8]],
  },
  {
    id: "prod-seed-sale-rooftop-001",
    client_id: "client-harbor-room",
    sale_type: "recurring",
    sale_mode: "direct_stock",
    menu_item_id: null,
    item_label: "Rooftop service usage",
    location: "Rooftop Bar",
    notes: "Rooftop opening rush usage.",
    items: [
      ["prod-vodka", 2],
      ["prod-tonic", 2],
      ["prod-lime", 2],
    ],
  },
  {
    id: "prod-seed-sale-mainbar-001",
    client_id: "client-harbor-room",
    sale_type: "recurring",
    sale_mode: "direct_stock",
    menu_item_id: null,
    item_label: "Main Bar service usage",
    location: "Main Bar",
    notes: "Post-shift usage capture.",
    items: [
      ["prod-whiskey", 2],
      ["prod-orange", 2],
      ["prod-bitters", 1],
      ["prod-ice", 10],
    ],
  },
  {
    id: "prod-seed-sale-tequila-001",
    client_id: "client-sunfold-events",
    sale_type: "one_time",
    sale_mode: "direct_stock",
    menu_item_id: null,
    item_label: "Tequila station service",
    location: "Main Bar",
    notes: "Evening margarita station usage.",
    items: [
      ["prod-tequila", 3],
      ["prod-lime", 4],
      ["prod-soda", 2],
    ],
  },
];

const ADJUSTMENTS = [
  ["prod-tonic", "Main Bar", -1, "Physical count mismatch after lunch close"],
  ["prod-lime", "Main Bar", -1, "Prep tray shrinkage recorded"],
  ["prod-mint", "Main Bar", -2, "Wilted bundles removed"],
  ["prod-ice", "Event Hall", -4, "Melt loss after event setup"],
  ["prod-bitters", "Main Bar", 1, "Found sealed bottle behind service well"],
  ["prod-soda", "Dry Store", -2, "Case split variance"],
];

export function buildProductionSeedState({ now = PRODUCTION_SEED_NOW } = {}) {
  const products = productionProducts(now);
  const locations = productionLocations();
  const { events, saleEventIndex, purchaseEventIndex, revertTarget } = buildProductionSeedEvents(products, now);
  const queued = buildProductionOutbox(products, events.length + 1, now);

  return {
    ...defaultState(),
    serverLedger: events,
    outbox: queued,
    online: true,
    activeView: "home",
    products,
    locations,
    stockView: "detail",
    selectedLocation: "Main Bar",
    productFilter: "all",
    locationFilter: "all",
    stockSearch: "",
    sales: buildProductionSales(saleEventIndex, now),
    purchases: buildProductionPurchases(purchaseEventIndex, now),
    lastSync: new Date(now - 8000).toISOString(),
    auditViewFilter: "all",
    auditSearch: "",
    auditProductFilter: "all",
    saleViewFilter: "all",
    purchaseViewFilter: "all",
    supplierViewFilter: "all",
    locationViewFilter: "all",
    selectedAuditEventId: revertTarget,
    form: {
      ...defaultState().form,
      type: "STOCK_OUT",
      product_id: "prod-lime",
      product_ids: ["prod-lime", "prod-tonic"],
      from_location: "Main Bar",
      quantity: 1,
      reason: "Production seed starting action",
    },
  };
}

export function productionSeedSummary(state = buildProductionSeedState()) {
  const stockRows = summarizeStock(state.serverLedger, state.products, state.locations);
  return {
    products: state.products.length,
    activeProducts: state.products.filter((product) => product.is_active !== false).length,
    locations: state.locations.length,
    ledgerEvents: state.serverLedger.length,
    queuedEvents: state.outbox.length,
    sales: state.sales.length,
    purchases: state.purchases.length,
    stockRows: stockRows.length,
    lowOrNegativeRows: stockRows.filter((row) => Number(row.quantity) <= productLow(state.products, row.product_id)).length,
    invalidEvents: [...state.serverLedger, ...state.outbox].filter((event) => !validateEvent(event).valid).length,
  };
}

export function productionProducts(now = PRODUCTION_SEED_NOW) {
  const created = new Date(now - 1000 * 60 * 60 * 36).toISOString();
  return [
    ...defaultProducts(),
    ...EXTRA_PRODUCTS,
    product("prod-coconut", "Coconut Cream", "Mixer", "can", 6, { created_at: created }),
    product("prod-coffee", "Cold Brew Coffee", "Kitchen", "liter", 5, { created_at: created }),
  ].map((item) => ({ ...item }));
}

export function productionLocations() {
  return [...defaultLocations(), ...EXTRA_LOCATIONS].map((location) => ({ ...location }));
}

function buildProductionSeedEvents(products, now) {
  const productById = new Map(products.map((item) => [item.id, item]));
  const entries = [];
  const purchaseEventIndex = new Map();
  const saleEventIndex = new Map();
  const start = now - 1000 * 60 * 60 * 18;

  for (const batch of PURCHASE_BATCHES) {
    const firstSequence = entries.length + 1;
    for (const [productId, location, quantity] of batch.items) {
      entries.push({
        type: "STOCK_IN",
        product_id: productId,
        from_location: null,
        to_location: location,
        quantity,
        reason: batch.notes,
        source_type: "purchase",
        source_id: batch.id,
        source_label: `Purchase - ${batch.supplier} - ${batch.items.length} products`,
      });
    }
    purchaseEventIndex.set(batch.id, { firstSequence, eventCount: batch.items.length });
  }

  for (const [productId, fromLocation, toLocation, quantity, reason] of TRANSFERS) {
    entries.push({ type: "STOCK_TRANSFER", product_id: productId, from_location: fromLocation, to_location: toLocation, quantity, reason });
  }

  for (const sale of SALES) {
    const firstSequence = entries.length + 1;
    for (const [productId, quantity] of sale.items) {
      entries.push({
        type: "STOCK_OUT",
        product_id: productId,
        from_location: sale.location,
        to_location: null,
        quantity,
        reason: sale.notes,
        source_type: "sale",
        source_id: sale.id,
        source_label: `Sale - ${clientName(sale.client_id)} - ${sale.item_label}`,
      });
    }
    saleEventIndex.set(sale.id, { firstSequence, eventCount: sale.items.length });
  }

  for (const [productId, location, quantity, reason] of ADJUSTMENTS) {
    entries.push({ type: "STOCK_ADJUSTMENT", product_id: productId, from_location: null, to_location: location, quantity, reason });
  }

  entries.push(
    {
      type: "PRODUCT_CREATED",
      product_id: "prod-coconut",
      from_location: null,
      to_location: null,
      quantity: 0,
      reason: "Catalog enrollment for seasonal service",
      source_type: "catalog",
      source_id: "prod-coconut",
      source_label: "Catalog - Coconut Cream enrolled",
    },
    {
      type: "PRODUCT_CREATED",
      product_id: "prod-coffee",
      from_location: null,
      to_location: null,
      quantity: 0,
      reason: "Catalog enrollment for brunch service",
      source_type: "catalog",
      source_id: "prod-coffee",
      source_label: "Catalog - Cold Brew Coffee enrolled",
    },
    {
      type: "PRODUCT_DEACTIVATED",
      product_id: "prod-elderflower",
      from_location: null,
      to_location: null,
      quantity: 0,
      reason: "Supplier recall hold",
      source_type: "catalog",
      source_id: "prod-elderflower",
      source_label: "Catalog - Elderflower Cordial suspended",
    },
  );

  const revertOriginalSequence = saleEventIndex.get("prod-seed-sale-rooftop-001").firstSequence;
  entries.push({
    type: "STOCK_REVERT",
    product_id: "prod-vodka",
    from_location: "Rooftop Bar",
    to_location: null,
    quantity: 2,
    reason: "Duplicate rooftop vodka usage reversed",
    original_event_sequence: revertOriginalSequence,
  });

  const events = entries.map((entry, index) => {
    const sequence = index + 1;
    const originalEventId = entry.original_event_sequence ? `prod-event-${entry.original_event_sequence.toString().padStart(4, "0")}` : null;
    return createInventoryEvent({
      ...tenant,
      event_id: `prod-event-${sequence.toString().padStart(4, "0")}`,
      idempotency_key: `prod-idem-${sequence.toString().padStart(4, "0")}`,
      sync_batch_id: `prod-batch-${Math.ceil(sequence / 12).toString().padStart(3, "0")}`,
      type: entry.type,
      product_id: entry.product_id,
      product_name: productById.get(entry.product_id)?.name ?? entry.product_id,
      from_location: entry.from_location,
      to_location: entry.to_location,
      quantity: entry.quantity,
      reason: entry.reason,
      source_type: entry.source_type,
      source_id: entry.source_id,
      source_label: entry.source_label,
      original_event_id: originalEventId,
      sequence_number: sequence,
      timestamp: start + index * 1000 * 60 * 11,
      status: "synced",
    });
  });

  return {
    events,
    saleEventIndex,
    purchaseEventIndex,
    revertTarget: `prod-event-${revertOriginalSequence.toString().padStart(4, "0")}`,
  };
}

function buildProductionOutbox(products, sequenceStart, now) {
  const productById = new Map(products.map((item) => [item.id, item]));
  const entries = [
    {
      work_item_id: "prod-work-queued-sale-001",
      type: "STOCK_OUT",
      product_id: "prod-lime",
      from_location: "Main Bar",
      to_location: null,
      quantity: 1,
      reason: "Queued wholesale garnish pull",
      source_type: "sale",
      source_id: "prod-queued-sale-001",
      source_label: "Sale - North Pier Cafe - queued garnish pull",
    },
    {
      work_item_id: "prod-work-queued-sale-001",
      type: "STOCK_OUT",
      product_id: "prod-tonic",
      from_location: "Main Bar",
      to_location: null,
      quantity: 2,
      reason: "Queued wholesale mixer pull",
      source_type: "sale",
      source_id: "prod-queued-sale-001",
      source_label: "Sale - North Pier Cafe - queued garnish pull",
    },
    {
      work_item_id: "prod-work-queued-receive-001",
      type: "STOCK_IN",
      product_id: "prod-soda",
      from_location: null,
      to_location: "Receiving Dock",
      quantity: 12,
      reason: "Queued supplier drop awaiting send",
      source_type: "purchase",
      source_id: "prod-queued-purchase-001",
      source_label: "Purchase - Cellar & Case Distribution - queued cases",
    },
    {
      work_item_id: "prod-work-queued-move-001",
      type: "STOCK_TRANSFER",
      product_id: "prod-ice",
      from_location: "Receiving Dock",
      to_location: "Rooftop Bar",
      quantity: 8,
      reason: "Queued rooftop service restock",
    },
    {
      work_item_id: "prod-work-queued-count-001",
      type: "STOCK_ADJUSTMENT",
      product_id: "prod-mint",
      from_location: null,
      to_location: "Main Bar",
      quantity: -1,
      reason: "Queued physical count variance",
    },
  ];

  return entries.map((entry, index) => {
    const sequence = sequenceStart + index;
    return {
      ...createInventoryEvent({
        ...tenant,
        event_id: `prod-queued-event-${(index + 1).toString().padStart(3, "0")}`,
        idempotency_key: `prod-queued-idem-${(index + 1).toString().padStart(3, "0")}`,
        sync_batch_id: "prod-batch-queued-001",
        type: entry.type,
        product_id: entry.product_id,
        product_name: productById.get(entry.product_id)?.name ?? entry.product_id,
        from_location: entry.from_location,
        to_location: entry.to_location,
        quantity: entry.quantity,
        reason: entry.reason,
        source_type: entry.source_type,
        source_id: entry.source_id,
        source_label: entry.source_label,
        sequence_number: sequence,
        timestamp: now - 1000 * 60 * (20 - index * 3),
        status: "queued",
      }),
      work_item_id: entry.work_item_id,
    };
  });
}

function buildProductionSales(saleEventIndex, now) {
  return SALES.map((sale, index) => {
    const eventIndex = saleEventIndex.get(sale.id);
    const productIds = sale.items.map(([productId]) => productId);
    return {
      id: sale.id,
      client_id: sale.client_id,
      sale_type: sale.sale_type,
      sale_mode: sale.sale_mode,
      menu_item_id: sale.menu_item_id,
      product_id: productIds[0],
      product_ids: productIds,
      item_label: sale.item_label,
      location: sale.location,
      quantity: sale.items.reduce((total, [, quantity]) => total + quantity, 0),
      notes: sale.notes,
      event_id: `prod-event-${eventIndex.firstSequence.toString().padStart(4, "0")}`,
      event_count: eventIndex.eventCount,
      work_item_id: `prod-work-${sale.id}`,
      created_at: new Date(now - 1000 * 60 * (210 - index * 18)).toISOString(),
      status: "synced",
    };
  });
}

function buildProductionPurchases(purchaseEventIndex, now) {
  return PURCHASE_BATCHES.map((purchase, index) => {
    const eventIndex = purchaseEventIndex.get(purchase.id);
    const productIds = purchase.items.map(([productId]) => productId);
    return {
      id: purchase.id,
      supplier_id: purchase.supplier_id,
      product_id: productIds[0],
      product_ids: productIds,
      item_label: `${productIds.length} products`,
      location: purchase.location,
      quantity: purchase.items.reduce((total, [, , quantity]) => total + quantity, 0),
      notes: purchase.notes,
      event_id: `prod-event-${eventIndex.firstSequence.toString().padStart(4, "0")}`,
      event_count: eventIndex.eventCount,
      work_item_id: `prod-work-${purchase.id}`,
      created_at: new Date(now - 1000 * 60 * (320 - index * 20)).toISOString(),
      status: "synced",
    };
  });
}

function product(id, name, category, unit, low, extras = {}) {
  return {
    id,
    name,
    category,
    unit,
    low,
    is_active: true,
    deactivated_at: null,
    deactivated_by: null,
    deactivated_reason: null,
    reactivated_at: null,
    reactivated_by: null,
    ...extras,
  };
}

function clientName(clientId) {
  return DEFAULT_CLIENTS.find((client) => client.id === clientId)?.name ?? clientId;
}

function productLow(products, productId) {
  return products.find((product) => product.id === productId)?.low ?? 0;
}

export function productionSeedReferenceData() {
  return {
    products: [...DEFAULT_PRODUCTS, ...EXTRA_PRODUCTS].map((item) => ({ ...item })),
    locations: productionLocations(),
    clients: DEFAULT_CLIENTS.map((client) => ({ ...client })),
    suppliers: DEFAULT_SUPPLIERS.map((supplier) => ({ ...supplier })),
    menuItems: DEFAULT_MENU_ITEMS.map((item) => ({ ...item })),
  };
}
