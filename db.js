'use strict';

require('dotenv').config({ quiet: true });

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

// On Vercel the project folder is read-only and only the temporary folder can be written
// to. A database kept there lives for as long as one function instance does, which is
// enough to look at the site but not to keep orders. See the README.
const DEFAULT_DB_PATH = process.env.VERCEL ? path.join(os.tmpdir(), 'pamuq.db') : path.join(__dirname, 'pamuq.db');

const DB_PATH = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : DEFAULT_DB_PATH;

// Used when a colour in the seed data does not say how many units are in stock.
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

  -- One row per purchasable colour. The sku doubles as the cart item id.
  CREATE TABLE IF NOT EXISTS variants (
    sku        TEXT    PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    colour     TEXT    NOT NULL,
    family     TEXT    NOT NULL,
    swatch     TEXT    NOT NULL,
    image      TEXT    NOT NULL,
    image_alt  TEXT    NOT NULL,
    stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    position   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS variants_product ON variants (product_id);

  CREATE TABLE IF NOT EXISTS gallery_images (
    id         INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url        TEXT    NOT NULL,
    alt        TEXT    NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS gallery_product ON gallery_images (product_id);

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
    currency          TEXT    NOT NULL DEFAULT 'gbp',
    emailed_at        TEXT,
    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id         INTEGER PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

const q = {
  countProducts: db.prepare('SELECT COUNT(*) AS n FROM products'),
  allProducts: db.prepare('SELECT * FROM products ORDER BY position, id'),
  productBySlug: db.prepare('SELECT * FROM products WHERE slug = ?'),
  allVariants: db.prepare('SELECT * FROM variants ORDER BY product_id, position'),
  variantsForProduct: db.prepare('SELECT * FROM variants WHERE product_id = ? ORDER BY position'),
  allGallery: db.prepare('SELECT * FROM gallery_images ORDER BY product_id, position'),
  galleryForProduct: db.prepare('SELECT * FROM gallery_images WHERE product_id = ? ORDER BY position'),
  variantBySku: db.prepare(`
    SELECT v.sku, v.colour, v.image, v.image_alt, v.stock, p.slug, p.name, p.price
    FROM variants v JOIN products p ON p.id = v.product_id
    WHERE v.sku = ?
  `),

  upsertProduct: db.prepare(`
    INSERT INTO products (slug, name, price, description, dimensions, weight, new_arrival, position)
    VALUES (@slug, @name, @price, @description, @dimensions, @weight, @newArrival, @position)
    ON CONFLICT (slug) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      description = excluded.description,
      dimensions = excluded.dimensions,
      weight = excluded.weight,
      new_arrival = excluded.new_arrival,
      position = excluded.position
  `),
  // Stock is deliberately left out of the update so that re-seeding never resets inventory.
  upsertVariant: db.prepare(`
    INSERT INTO variants (sku, product_id, colour, family, swatch, image, image_alt, stock, position)
    VALUES (@sku, @productId, @colour, @family, @swatch, @image, @imageAlt, @stock, @position)
    ON CONFLICT (sku) DO UPDATE SET
      product_id = excluded.product_id,
      colour = excluded.colour,
      family = excluded.family,
      swatch = excluded.swatch,
      image = excluded.image,
      image_alt = excluded.image_alt,
      position = excluded.position
  `),
  deleteVariant: db.prepare('DELETE FROM variants WHERE sku = ?'),
  deleteGallery: db.prepare('DELETE FROM gallery_images WHERE product_id = ?'),
  insertGallery: db.prepare(`
    INSERT INTO gallery_images (product_id, url, alt, position)
    VALUES (@productId, @url, @alt, @position)
  `),
  deleteProduct: db.prepare('DELETE FROM products WHERE id = ?'),

  orderBySession: db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?'),
  orderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
  orderByNumber: db.prepare('SELECT 1 FROM orders WHERE order_number = ?'),
  insertOrder: db.prepare(`
    INSERT INTO orders (
      order_number, stripe_session_id, email, customer_name, phone, shipping_name,
      shipping_address, items, subtotal, shipping, total, currency
    ) VALUES (
      @orderNumber, @stripeSessionId, @email, @name, @phone, @shippingName,
      @shippingAddress, @items, @subtotal, @shipping, @total, @currency
    )
  `),
  decrementStock: db.prepare('UPDATE variants SET stock = MAX(stock - ?, 0) WHERE sku = ?'),
  markEmailed: db.prepare("UPDATE orders SET emailed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),

  addSubscriber: db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)'),
};

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return groups;
}

function toVariant(row) {
  return {
    sku: row.sku,
    colour: row.colour,
    family: row.family,
    swatch: row.swatch.split(','),
    image: row.image,
    imageAlt: row.image_alt,
    stock: row.stock,
  };
}

function toProduct(row, variants, gallery) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: row.price,
    description: row.description,
    dimensions: row.dimensions,
    weight: row.weight,
    newArrival: row.new_arrival === 1,
    variants: variants.map(toVariant),
    gallery: gallery.map((image) => ({ url: image.url, alt: image.alt })),
  };
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
    emailedAt: row.emailed_at,
    createdAt: row.created_at,
  };
}

function countProducts() {
  return q.countProducts.get().n;
}

function listProducts() {
  const variants = groupBy(q.allVariants.all(), 'product_id');
  const gallery = groupBy(q.allGallery.all(), 'product_id');
  return q.allProducts
    .all()
    .map((row) => toProduct(row, variants.get(row.id) || [], gallery.get(row.id) || []));
}

function listNewArrivals(limit = 3) {
  return listProducts()
    .filter((product) => product.newArrival)
    .slice(0, limit);
}

function getProduct(slug) {
  const row = q.productBySlug.get(slug);
  if (!row) return null;
  return toProduct(row, q.variantsForProduct.all(row.id), q.galleryForProduct.all(row.id));
}

// Looks up one purchasable colour together with the price of its product.
function getVariant(sku) {
  const row = q.variantBySku.get(sku);
  if (!row) return null;
  return {
    sku: row.sku,
    colour: row.colour,
    image: row.image,
    imageAlt: row.image_alt,
    stock: row.stock,
    productSlug: row.slug,
    productName: row.name,
    price: row.price,
  };
}

// Makes the database match the given catalogue. Safe to run repeatedly: stock levels
// and orders are never touched, only products, colours and images.
const upsertCatalogue = db.transaction((products) => {
  const keptSlugs = new Set();

  products.forEach((product, position) => {
    keptSlugs.add(product.slug);
    q.upsertProduct.run({
      slug: product.slug,
      name: product.name,
      price: product.price,
      description: product.description,
      dimensions: product.dimensions,
      weight: product.weight,
      newArrival: product.newArrival ? 1 : 0,
      position,
    });
    const { id: productId } = q.productBySlug.get(product.slug);

    const keptSkus = new Set();
    product.colours.forEach((colour, colourPosition) => {
      const sku = `${product.slug}-${slugify(colour.name)}`;
      keptSkus.add(sku);
      q.upsertVariant.run({
        sku,
        productId,
        colour: colour.name,
        family: colour.family,
        swatch: colour.swatch.join(','),
        image: colour.image,
        imageAlt: colour.imageAlt,
        stock: colour.stock ?? DEFAULT_STOCK,
        position: colourPosition,
      });
    });
    for (const variant of q.variantsForProduct.all(productId)) {
      if (!keptSkus.has(variant.sku)) q.deleteVariant.run(variant.sku);
    }

    q.deleteGallery.run(productId);
    product.gallery.forEach((image, imagePosition) => {
      q.insertGallery.run({ productId, url: image.url, alt: image.alt, position: imagePosition });
    });
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

function close() {
  db.close();
}

module.exports = {
  DB_PATH,
  countProducts,
  listProducts,
  listNewArrivals,
  getProduct,
  getVariant,
  upsertCatalogue,
  recordOrder,
  getOrder,
  markOrderEmailed,
  addSubscriber,
  close,
};
