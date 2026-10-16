'use strict';

require('dotenv').config({ quiet: true });

const fs = require('fs');
const os = require('os');
const path = require('path');

// The database keeps what changes while the shop runs: stock, orders, newsletter sign ups,
// review submissions and contact messages. Product words and pictures live in catalog.js.
//
// With TURSO_DATABASE_URL and TURSO_AUTH_TOKEN set, it is a Turso database (SQLite in the
// cloud), which keeps everything between deploys and is shared by every Vercel instance.
// Without them it is a SQLite file on this machine. On Vercel that file lives in the
// temporary folder for as long as one function instance does, which is enough to look at
// the site but not to keep anything. See the README.
//
// Every function here is async, whichever database is in use.

const TURSO_URL = process.env.TURSO_DATABASE_URL || '';

const DEFAULT_DB_PATH = process.env.VERCEL ? path.join(os.tmpdir(), 'pamuq.db') : path.join(__dirname, 'pamuq.db');
const DB_PATH = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : DEFAULT_DB_PATH;

// Used when a color in the catalog does not say how many units are in stock.
const DEFAULT_STOCK = 40;

// A statement is [sql, args]. Args are an array for ? placeholders or an object for @name
// placeholders. Results are { rows, rowsAffected } with rows as plain objects.

function localDriver() {
  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const prepared = new Map();
  function run(sql, args = []) {
    let statement = prepared.get(sql);
    if (!statement) {
      statement = sqlite.prepare(sql);
      prepared.set(sql, statement);
    }
    const params = Array.isArray(args) ? args : [args];
    if (statement.reader) return { rows: statement.all(...params), rowsAffected: 0 };
    return { rows: [], rowsAffected: statement.run(...params).changes };
  }

  return {
    name: DB_PATH,
    durable: !process.env.VERCEL,
    execute: async (sql, args) => run(sql, args),
    batch: async (statements) => sqlite.transaction(() => statements.map(([sql, args]) => run(sql, args)))(),
    script: async (sql) => sqlite.exec(sql),
    close: () => sqlite.close(),
  };
}

function tursoDriver() {
  // The web build talks to Turso over HTTPS and needs no native code.
  const { createClient } = require('@libsql/client/web');
  const client = createClient({ url: TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  const plain = (result) => ({
    rows: result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]]))),
    rowsAffected: result.rowsAffected,
  });

  return {
    name: TURSO_URL.replace(/^(\w+:\/\/)?([^/?]+).*$/, '$2'),
    durable: true,
    execute: async (sql, args = []) => plain(await client.execute({ sql, args })),
    batch: async (statements) => (await client.batch(statements.map(([sql, args = []]) => ({ sql, args })), 'write')).map(plain),
    script: (sql) => client.executeMultiple(sql),
    close: () => client.close(),
  };
}

const driver = TURSO_URL ? tursoDriver() : localDriver();

const SCHEMA = `
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
`;

async function columnsOf(table) {
  const { rows } = await driver.execute(`PRAGMA table_info(${table})`);
  return new Set(rows.map((column) => column.name));
}

// Columns added after the first release. A database made by an earlier version gains
// them here.
async function addColumns(table, columns) {
  const existing = await columnsOf(table);
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) await driver.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

async function migrate() {
  await driver.script(SCHEMA);
  // The variants table spelled its color column the British way before the US launch.
  if ((await columnsOf('variants')).has('colour')) await driver.execute('ALTER TABLE variants RENAME COLUMN colour TO color');
  await addColumns('products', { kind: "TEXT NOT NULL DEFAULT 'item'" });
  // stock_taken records that an order's units have come out of stock. Orders stored
  // before the column existed had theirs taken at the time, hence the default of 1.
  await addColumns('orders', { gift: 'TEXT', stock_taken: 'INTEGER NOT NULL DEFAULT 1' });
}

// The schema is checked once per process, before the first query.
let migrated = null;
function ready() {
  migrated ??= migrate().catch((error) => {
    migrated = null;
    throw error;
  });
  return migrated;
}

async function execute(sql, args) {
  await ready();
  return driver.execute(sql, args);
}

async function batch(statements) {
  await ready();
  return driver.batch(statements);
}

async function first(sql, args) {
  return (await execute(sql, args)).rows[0] || null;
}

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

async function countProducts() {
  return (await first('SELECT COUNT(*) AS n FROM products')).n;
}

// sku → units in stock, for every color of every product.
async function stockMap() {
  const { rows } = await execute('SELECT sku, stock FROM variants');
  return new Map(rows.map((row) => [row.sku, row.stock]));
}

// Looks up one purchasable color together with the price of its product.
async function getVariant(sku) {
  const row = await first(
    `SELECT v.sku, v.color, v.image, v.image_alt, v.stock, p.slug, p.name, p.price, p.kind
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE v.sku = ?`,
    [sku]
  );
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

const UPSERT_PRODUCT = `
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
`;

// Stock is deliberately left out of the update so that re-seeding never resets inventory.
const UPSERT_VARIANT = `
  INSERT INTO variants (sku, product_id, color, family, swatch, image, image_alt, stock, position)
  VALUES (@sku, (SELECT id FROM products WHERE slug = @slug), @color, @family, @swatch, @image, @imageAlt, @stock, @position)
  ON CONFLICT (sku) DO UPDATE SET
    product_id = excluded.product_id,
    color = excluded.color,
    family = excluded.family,
    swatch = excluded.swatch,
    image = excluded.image,
    image_alt = excluded.image_alt,
    position = excluded.position
`;

const placeholders = (list) => list.map(() => '?').join(', ');

// Makes the database match the catalog, in one transaction. Safe to run repeatedly: stock
// levels and orders are never touched. Each product arrives with its colors already
// resolved to a sku and a picture (see seed.js).
async function upsertCatalog(products) {
  const statements = [];
  const slugs = products.map((product) => product.slug);

  products.forEach((product, position) => {
    statements.push([
      UPSERT_PRODUCT,
      {
        slug: product.slug,
        name: product.name,
        price: product.price,
        description: product.summary,
        dimensions: JSON.stringify(product.size || null),
        weight: product.gsm ? `${product.gsm} gsm` : '',
        newArrival: product.newArrival ? 1 : 0,
        position,
        kind: product.kind,
      },
    ]);
    product.variants.forEach((variant, colorPosition) => {
      statements.push([
        UPSERT_VARIANT,
        {
          sku: variant.sku,
          slug: product.slug,
          color: variant.color,
          family: variant.key,
          swatch: variant.swatch.join(','),
          image: variant.image,
          imageAlt: variant.imageAlt,
          stock: variant.stock ?? DEFAULT_STOCK,
          position: colorPosition,
        },
      ]);
    });
    const skus = product.variants.map((variant) => variant.sku);
    statements.push([
      `DELETE FROM variants WHERE product_id = (SELECT id FROM products WHERE slug = ?) AND sku NOT IN (${placeholders(skus)})`,
      [product.slug, ...skus],
    ]);
  });

  // Products no longer in the catalog, and their colors.
  statements.push([`DELETE FROM variants WHERE product_id IN (SELECT id FROM products WHERE slug NOT IN (${placeholders(slugs)}))`, slugs]);
  statements.push([`DELETE FROM products WHERE slug NOT IN (${placeholders(slugs)})`, slugs]);

  await batch(statements);
}

const INSERT_ORDER = `
  INSERT INTO orders (
    order_number, stripe_session_id, email, customer_name, phone, shipping_name,
    shipping_address, items, subtotal, shipping, total, currency, gift, stock_taken
  ) VALUES (
    @orderNumber, @stripeSessionId, @email, @name, @phone, @shippingName,
    @shippingAddress, @items, @subtotal, @shipping, @total, @currency, @gift, 0
  )
  ON CONFLICT (stripe_session_id) DO NOTHING
`;

// Inserts the order unless the Stripe session has already been recorded, and takes the
// purchased units out of stock exactly once. Webhook retries and a reloaded confirmation
// page both arrive here, often at the same moment on different instances, so the whole
// thing is one transaction and the second call returns the existing order with
// created: false.
async function recordOrder(data) {
  const values = {
    stripeSessionId: data.stripeSessionId,
    email: data.email,
    name: data.name ?? null,
    phone: data.phone ?? null,
    shippingName: data.shippingName ?? null,
    shippingAddress: data.shippingAddress ? JSON.stringify(data.shippingAddress) : null,
    items: JSON.stringify(data.items),
    subtotal: data.subtotal,
    shipping: data.shipping,
    total: data.total,
    currency: data.currency,
    gift: data.gift ? JSON.stringify(data.gift) : null,
  };
  const stockUpdates = data.items
    .filter((item) => item.sku)
    .map((item) => [
      `UPDATE variants SET stock = MAX(stock - ?, 0)
       WHERE sku = ? AND (SELECT stock_taken FROM orders WHERE stripe_session_id = ?) = 0`,
      [item.quantity, item.sku, data.stripeSessionId],
    ]);

  // Order numbers are PAM- and the time in milliseconds. Two orders in the same
  // millisecond are unlikely but possible, and the second simply takes the next number.
  const stamp = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    try {
      const [inserted] = await batch([
        [INSERT_ORDER, { ...values, orderNumber: `PAM-${stamp + attempt}` }],
        ...stockUpdates,
        ['UPDATE orders SET stock_taken = 1 WHERE stripe_session_id = ?', [data.stripeSessionId]],
      ]);
      const row = await first('SELECT * FROM orders WHERE stripe_session_id = ?', [data.stripeSessionId]);
      return { order: toOrder(row), created: inserted.rowsAffected === 1 };
    } catch (error) {
      if (attempt < 5 && /UNIQUE constraint failed: orders\.order_number/.test(error.message)) continue;
      throw error;
    }
  }
}

async function getOrder(id) {
  const row = await first('SELECT * FROM orders WHERE id = ?', [id]);
  return row ? toOrder(row) : null;
}

async function markOrderEmailed(id) {
  await execute("UPDATE orders SET emailed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [id]);
}

// Resolves to true when the address is new, false when it was already subscribed.
async function addSubscriber(email) {
  return (await execute('INSERT OR IGNORE INTO subscribers (email) VALUES (?)', [email])).rowsAffected === 1;
}

async function addReviewSubmission(review) {
  await execute(
    `INSERT INTO review_submissions (product_slug, rating, title, body, name, email, location, color)
     VALUES (@productSlug, @rating, @title, @body, @name, @email, @location, @color)`,
    review
  );
}

async function addContactMessage(message) {
  await execute(
    `INSERT INTO contact_messages (name, email, order_number, message)
     VALUES (@name, @email, @orderNumber, @message)`,
    message
  );
}

async function catalogVersion() {
  const row = await first('SELECT value FROM meta WHERE key = ?', ['catalog_version']);
  return row ? Number(row.value) : 0;
}

async function setCatalogVersion(version) {
  await execute('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
    'catalog_version',
    String(version),
  ]);
}

function close() {
  driver.close();
}

module.exports = {
  // Where the data lives, for log lines: a file path or the Turso host.
  NAME: driver.name,
  DB_PATH,
  // False only for Vercel's temporary folder, which is emptied whenever an instance ends.
  DURABLE: driver.durable,
  REMOTE: Boolean(TURSO_URL),
  ready,
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
