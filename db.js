'use strict';

require('dotenv').config({ quiet: true });

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

// SQLite keeps what changes while the shop runs: stock, orders, newsletter sign ups,
// review submissions and contact messages. Product words and pictures live in catalog.js.
//
// On Vercel the project folder is read-only and only the temporary folder can be written
// to. A database kept there lives for as long as one function instance does, which is
// enough to look at the site but not to keep orders. See the README.
const DEFAULT_DB_PATH = process.env.VERCEL ? path.join(os.tmpdir(), 'pamuq.db') : path.join(__dirname, 'pamuq.db');

const DB_PATH = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : DEFAULT_DB_PATH;

// Used when a color in the catalog does not say how many units are in stock.
const DEFAULT_STOCK = 40;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY,
    slug        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    price       INTEGER NOT NULL CHECK (price > 0),
    description TEXT    NOT NULL,
    dimensions  TEXT    NOT NULL,
    weight      TEXT    NOT NULL,
    new_arrival INTEGER NOT NULL DEFAULT 0,
    position    INTEGER NOT NULL DEFAULT 0
  );

  -- One row per purchasable color. The sku doubles as the cart item id.
  CREATE TABLE IF NOT EXISTS variants (
    sku        TEXT    PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color      TEXT    NOT NULL,
    family     TEXT    NOT NULL,
    swatch     TEXT    NOT NULL,
    image      TEXT    NOT NULL,
    image_alt  TEXT    NOT NULL,
    stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    position   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS variants_product ON variants (product_id);

  CREATE TABLE IF NOT EXISTS orders (
    id                INTEGER PRIMARY KEY,
    order_number      TEXT    NOT NULL UNIQUE,
    stripe_session_id TEXT    NOT NULL UNIQUE,
    email             TEXT    NOT NULL,
    customer_name     TEXT,
    phone             TEXT,
    shipping_name     TEXT,
    shipping_address  TEXT,
    items             TEXT    NOT NULL,
    subtotal          INTEGER NOT NULL,
    shipping          INTEGER NOT NULL DEFAULT 0,
    total             INTEGER NOT NULL,
    currency          TEXT    NOT NULL DEFAULT 'usd',
    emailed_at        TEXT,
    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id         INTEGER PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- Reviews sent from product pages, waiting to be checked and published. Every genuine
  -- review is published whatever its rating.
  CREATE TABLE IF NOT EXISTS review_submissions (
    id           INTEGER PRIMARY KEY,
    product_slug TEXT    NOT NULL,
    rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title        TEXT    NOT NULL,
    body         TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    email        TEXT    NOT NULL,
    location     TEXT,
    color        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    order_number TEXT,
    message      TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Columns added after the first release. A database made by an earlier version gains
// them here.
function addColumns(table, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

// The variants table spelled its color column the British way before the US launch.
const variantColumns = new Set(db.prepare('PRAGMA table_info(variants)').all().map((column) => column.name));
if (variantColumns.has('colour')) db.exec('ALTER TABLE variants RENAME COLUMN colour TO color');

addColumns('products', { kind: "TEXT NOT NULL DEFAULT 'item'" });
addColumns('orders', { gift: 'TEXT' });

const q = {
  countProducts: db.prepare('SELECT COUNT(*) AS n FROM products'),
  allProducts: db.prepare('SELECT * FROM products ORDER BY position, id'),
  productBySlug: db.prepare('SELECT * FROM products WHERE slug = ?'),
  allStock: db.prepare('SELECT sku, stock FROM variants'),
  variantsForProduct: db.prepare('SELECT * FROM variants WHERE product_id = ? ORDER BY position'),
  variantBySku: db.prepare(`
    SELECT v.sku, v.color, v.image, v.image_alt, v.stock, p.slug, p.name, p.price, p.kind
    FROM variants v JOIN products p ON p.id = v.product_id
    WHERE v.sku = ?
  `),

  upsertProduct: db.prepare(`
    INSERT INTO products (slug, name, price, description, dimensions, weight, new_arrival, position, kind)
    VALUES (@slug, @name, @price, @description, @dimensions, @weight, @newArrival, @position, @kind)
    ON CONFLICT (slug) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      description = excluded.description,
      dimensions = excluded.dimensions,
      weight = excluded.weight,
      new_arrival = excluded.new_arrival,
      position = excluded.position,
      kind = excluded.kind
  `),
  // Stock is deliberately left out of the update so that re-seeding never resets inventory.
  upsertVariant: db.prepare(`
    INSERT INTO variants (sku, product_id, color, family, swatch, image, image_alt, stock, position)
    VALUES (@sku, @productId, @color, @family, @swatch, @image, @imageAlt, @stock, @position)
    ON CONFLICT (sku) DO UPDATE SET
      product_id = excluded.product_id,
      color = excluded.color,
      family = excluded.family,
      swatch = excluded.swatch,
      image = excluded.image,
      image_alt = excluded.image_alt,
      position = excluded.position
  `),
  deleteVariant: db.prepare('DELETE FROM variants WHERE sku = ?'),
  deleteProduct: db.prepare('DELETE FROM products WHERE id = ?'),

  orderBySession: db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?'),
  orderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
  orderByNumber: db.prepare('SELECT 1 FROM orders WHERE order_number = ?'),
  insertOrder: db.prepare(`
    INSERT INTO orders (
      order_number, stripe_session_id, email, customer_name, phone, shipping_name,
      shipping_address, items, subtotal, shipping, total, currency, gift
    ) VALUES (
      @orderNumber, @stripeSessionId, @email, @name, @phone, @shippingName,
      @shippingAddress, @items, @subtotal, @shipping, @total, @currency, @gift
    )
  `),
  decrementStock: db.prepare('UPDATE variants SET stock = MAX(stock - ?, 0) WHERE sku = ?'),
  markEmailed: db.prepare("UPDATE orders SET emailed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),

  addSubscriber: db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)'),
  addReview: db.prepare(`
    INSERT INTO review_submissions (product_slug, rating, title, body, name, email, location, color)
    VALUES (@productSlug, @rating, @title, @body, @name, @email, @location, @color)
  `),
  addMessage: db.prepare(`
    INSERT INTO contact_messages (name, email, order_number, message)
    VALUES (@name, @email, @orderNumber, @message)
  `),

  getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
  setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
};

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    stripeSessionId: row.stripe_session_id,
    email: row.email,
    name: row.customer_name,
    phone: row.phone,
    shippingName: row.shipping_name,
    shippingAddress: row.shipping_address ? JSON.parse(row.shipping_address) : null,
    items: JSON.parse(row.items),
    subtotal: row.subtotal,
    shipping: row.shipping,
    total: row.total,
    currency: row.currency,
    gift: row.gift ? JSON.parse(row.gift) : null,
    emailedAt: row.emailed_at,
    createdAt: row.created_at,
  };
}

function countProducts() {
  return q.countProducts.get().n;
}

// sku → units in stock, for every color of every product.
function stockMap() {
  return new Map(q.allStock.all().map((row) => [row.sku, row.stock]));
}

// Looks up one purchasable color together with the price of its product.
function getVariant(sku) {
  const row = q.variantBySku.get(sku);
  if (!row) return null;
  return {
    sku: row.sku,
    color: row.color,
    image: row.image,
    imageAlt: row.image_alt,
    stock: row.stock,
    productSlug: row.slug,
    productName: row.name,
    price: row.price,
    isSet: row.kind === 'set',
  };
}

// Makes the database match the catalog. Safe to run repeatedly: stock levels and orders
// are never touched. Each product arrives with its colors already resolved to a sku and
// a picture (see seed.js).
const upsertCatalog = db.transaction((products) => {
  const keptSlugs = new Set();

  products.forEach((product, position) => {
    keptSlugs.add(product.slug);
    q.upsertProduct.run({
      slug: product.slug,
      name: product.name,
      price: product.price,
      description: product.summary,
      dimensions: JSON.stringify(product.size || null),
      weight: product.gsm ? `${product.gsm} gsm` : '',
      newArrival: product.newArrival ? 1 : 0,
      position,
      kind: product.kind,
    });
    const { id: productId } = q.productBySlug.get(product.slug);

    const keptSkus = new Set();
    product.variants.forEach((variant, colorPosition) => {
      keptSkus.add(variant.sku);
      q.upsertVariant.run({
        sku: variant.sku,
        productId,
        color: variant.color,
        family: variant.key,
        swatch: variant.swatch.join(','),
        image: variant.image,
        imageAlt: variant.imageAlt,
        stock: variant.stock ?? DEFAULT_STOCK,
        position: colorPosition,
      });
    });
    for (const variant of q.variantsForProduct.all(productId)) {
      if (!keptSkus.has(variant.sku)) q.deleteVariant.run(variant.sku);
    }
  });

  for (const row of q.allProducts.all()) {
    if (!keptSlugs.has(row.slug)) q.deleteProduct.run(row.id);
  }
});

function nextOrderNumber() {
  let stamp = Date.now();
  while (q.orderByNumber.get(`PAM-${stamp}`)) stamp += 1;
  return `PAM-${stamp}`;
}

// Inserts the order unless the Stripe session has already been recorded, and takes the
// purchased units out of stock. Webhook retries and a reloaded confirmation page both
// arrive here, so the second call returns the existing order with created: false.
const recordOrder = db.transaction((data) => {
  const existing = q.orderBySession.get(data.stripeSessionId);
  if (existing) return { order: toOrder(existing), created: false };

  q.insertOrder.run({
    orderNumber: nextOrderNumber(),
    stripeSessionId: data.stripeSessionId,
    email: data.email,
    name: data.name,
    phone: data.phone,
    shippingName: data.shippingName,
    shippingAddress: data.shippingAddress ? JSON.stringify(data.shippingAddress) : null,
    items: JSON.stringify(data.items),
    subtotal: data.subtotal,
    shipping: data.shipping,
    total: data.total,
    currency: data.currency,
    gift: data.gift ? JSON.stringify(data.gift) : null,
  });
  for (const item of data.items) {
    if (item.sku) q.decrementStock.run(item.quantity, item.sku);
  }
  return { order: toOrder(q.orderBySession.get(data.stripeSessionId)), created: true };
});

function getOrder(id) {
  const row = q.orderById.get(id);
  return row ? toOrder(row) : null;
}

function markOrderEmailed(id) {
  q.markEmailed.run(id);
}

// Returns true when the address is new, false when it was already subscribed.
function addSubscriber(email) {
  return q.addSubscriber.run(email).changes === 1;
}

function addReviewSubmission(review) {
  q.addReview.run(review);
}

function addContactMessage(message) {
  q.addMessage.run(message);
}

function catalogVersion() {
  const row = q.getMeta.get('catalog_version');
  return row ? Number(row.value) : 0;
}

function setCatalogVersion(version) {
  q.setMeta.run('catalog_version', String(version));
}

function close() {
  db.close();
}

module.exports = {
  DB_PATH,
  slugify,
  countProducts,
  stockMap,
  getVariant,
  upsertCatalog,
  recordOrder,
  getOrder,
  markOrderEmailed,
  addSubscriber,
  addReviewSubmission,
  addContactMessage,
  catalogVersion,
  setCatalogVersion,
  close,
};
