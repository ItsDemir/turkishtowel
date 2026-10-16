'use strict';

// Database tests. They run against a throwaway SQLite file, or against Turso (or a local
// libSQL server) when TURSO_DATABASE_URL is set, so the same rules hold for both.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pamuq-db-test-'));
process.env.DATABASE_PATH = path.join(tmp, 'test.db');

const db = require('../db');
const store = require('../store');
const { seed, CATALOG_VERSION } = require('../seed');

const unique = () => crypto.randomUUID();

before(async () => {
  await seed();
});

after(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function order(sessionId, items) {
  return {
    stripeSessionId: sessionId,
    email: 'buyer@example.com',
    name: 'Ada Buyer',
    phone: null,
    shippingName: 'Ada Buyer',
    shippingAddress: { line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
    items,
    subtotal: 5800,
    shipping: 1000,
    total: 6800,
    currency: 'usd',
    gift: null,
  };
}

test('seeding loads every color of every product and is safe to repeat', async () => {
  const products = store.forSeeding();
  const colors = products.reduce((sum, product) => sum + product.variants.length, 0);
  assert.equal(await db.countProducts(), products.length);
  assert.equal((await db.stockMap()).size, colors);
  assert.equal(await db.catalogVersion(), CATALOG_VERSION);

  const sku = products[0].variants[0].sku;
  const before = (await db.getVariant(sku)).stock;
  await seed();
  assert.equal((await db.getVariant(sku)).stock, before, 'seeding again never resets stock');
  assert.equal(await db.countProducts(), products.length);
});

test('a color is looked up with its product and price', async () => {
  const product = store.forSeeding()[0];
  const variant = await db.getVariant(product.variants[0].sku);
  assert.equal(variant.productSlug, product.slug);
  assert.equal(variant.price, product.price);
  assert.equal(await db.getVariant('no-such-sku'), null);
});

test('an order is stored once and takes stock once, even when recorded at the same moment', async () => {
  const sku = store.forSeeding()[1].variants[0].sku;
  const before = (await db.getVariant(sku)).stock;
  const sessionId = `cs_test_${unique()}`;
  const data = order(sessionId, [{ sku, name: 'Towel', color: 'Salt', quantity: 2, unitAmount: 2900, lineTotal: 5800 }]);

  const results = await Promise.all([db.recordOrder(data), db.recordOrder(data), db.recordOrder(data)]);
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(new Set(results.map((result) => result.order.id)).size, 1);
  assert.equal((await db.getVariant(sku)).stock, before - 2);

  const again = await db.recordOrder(data);
  assert.equal(again.created, false);
  assert.equal((await db.getVariant(sku)).stock, before - 2);

  const stored = await db.getOrder(again.order.id);
  assert.match(stored.orderNumber, /^PAM-\d+$/);
  assert.equal(stored.total, 6800);
  assert.equal(stored.currency, 'usd');
  assert.equal(stored.shippingAddress.state, 'TX');
  assert.equal(stored.emailedAt, null);
  await db.markOrderEmailed(stored.id);
  assert.ok((await db.getOrder(stored.id)).emailedAt);
});

test('two orders in the same millisecond get different order numbers', async () => {
  const realNow = Date.now;
  const frozen = realNow();
  Date.now = () => frozen;
  try {
    const first = await db.recordOrder(order(`cs_test_${unique()}`, []));
    const second = await db.recordOrder(order(`cs_test_${unique()}`, []));
    assert.equal(first.created && second.created, true);
    assert.notEqual(first.order.orderNumber, second.order.orderNumber);
  } finally {
    Date.now = realNow;
  }
});

test('stock never goes below zero', async () => {
  const sku = store.forSeeding()[2].variants[0].sku;
  const stock = (await db.getVariant(sku)).stock;
  await db.recordOrder(order(`cs_test_${unique()}`, [{ sku, name: 'Towel', color: 'Salt', quantity: stock + 5, unitAmount: 100, lineTotal: 100 }]));
  assert.equal((await db.getVariant(sku)).stock, 0);
});

test('sign ups are kept once per address, whatever the case', async () => {
  const email = `reader-${unique()}@example.com`;
  assert.equal(await db.addSubscriber(email), true);
  assert.equal(await db.addSubscriber(email), false);
  assert.equal(await db.addSubscriber(email.toUpperCase()), false);
});

test('review submissions and contact messages are stored', async () => {
  await db.addReviewSubmission({
    productSlug: 'ege-bath-towel',
    rating: 2,
    title: '',
    body: 'Thinner than I hoped.',
    name: 'Sam',
    email: 'sam@example.com',
    location: null,
    color: null,
  });
  await db.addContactMessage({ name: 'Sam', email: 'sam@example.com', orderNumber: null, message: 'Where is my order?' });
});
