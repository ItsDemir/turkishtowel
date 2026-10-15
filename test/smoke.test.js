'use strict';

// Smoke tests: run with `npm test`. They boot the app against a throwaway database and
// check the rules the store must never break (US formatting, truthful origin, no
// invented reviews) along with every public route.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pamuq-test-'));
process.env.DATABASE_PATH = path.join(tmp, 'test.db');
delete process.env.STRIPE_SECRET_KEY;
delete process.env.RESEND_API_KEY;

const { formatPrice, inches, sizeLabel } = require('../format');
const shipping = require('../lib/shipping');
const store = require('../store');
const reviews = require('../lib/reviews');
const app = require('../server');
const db = require('../db');

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function get(urlPath) {
  const res = await fetch(base + urlPath, { redirect: 'manual' });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

test('prices are US dollars, whole dollars without cents', () => {
  assert.equal(formatPrice(5800), '$58');
  assert.equal(formatPrice(5850), '$58.50');
  assert.equal(formatPrice(12400), '$124');
});

test('sizes show inches first, rounded to the half inch', () => {
  const cases = { 30: '12', 40: '16', 50: '19.5', 70: '27.5', 90: '35.5', 100: '39.5', 140: '55', 180: '71' };
  for (const [cm, expected] of Object.entries(cases)) assert.equal(inches(Number(cm)), expected, `${cm} cm`);
  assert.equal(sizeLabel({ w: 70, h: 140 }), '27.5 × 55 in (70 × 140 cm)');
});

test('shipping estimates skip weekends and federal holidays', () => {
  const holidays = shipping.federalHolidays(2026);
  assert.ok(holidays.has('2026-07-03'), 'Independence Day falls on a Saturday and is observed on Friday');
  assert.ok(holidays.has('2026-11-26'), 'Thanksgiving');
  assert.ok(holidays.has('2026-12-25'), 'Christmas Day');
  // Wednesday Nov 25 plus one business day skips Thanksgiving to Friday Nov 27.
  const next = shipping.addBusinessDays(new Date(Date.UTC(2026, 10, 25)), 1);
  assert.equal(next.toISOString().slice(0, 10), '2026-11-27');
  // Friday plus one business day is Monday.
  const monday = shipping.addBusinessDays(new Date(Date.UTC(2026, 9, 16)), 1);
  assert.equal(monday.toISOString().slice(0, 10), '2026-10-19');
});

test('every product has a price, colors and photos', () => {
  const products = store.listProducts();
  assert.ok(products.length > 0);
  for (const product of products) {
    assert.ok(Number.isInteger(product.price) && product.price > 0, `${product.slug} price`);
    assert.ok(product.colors.length > 0, `${product.slug} colors`);
    assert.ok(store.imagesFor(product, product.colors[0].key).length > 0, `${product.slug} photos`);
  }
});

test('reviews ship empty and nothing is invented', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'reviews.json'), 'utf8'));
  assert.deepEqual(rows, []);
  for (const product of store.listProducts()) assert.equal(reviews.summary(product.slug), null);
});

const ROUTES = [
  '/',
  '/shop',
  '/shop/bath-towels',
  '/sets',
  '/beach-and-pool',
  '/gifts',
  '/about',
  '/contact',
  '/faq',
  '/cart',
  '/shipping',
  '/returns',
  '/privacy',
  '/terms',
  '/accessibility',
];

test('every public page renders in US English and dollars', async () => {
  for (const route of ROUTES) {
    const page = await get(route);
    assert.equal(page.status, 200, route);
    assert.match(page.text, /<html lang="en-US"/, `${route} lang`);
    assert.doesNotMatch(page.text, /£|GBP|\bcolour|\bcatalogue\b/i, `${route} UK leftovers`);
  }
});

test('every product page states fiber content and Made in Turkey, with no rating', async () => {
  for (const product of store.listProducts()) {
    const page = await get(`/product/${product.slug}`);
    assert.equal(page.status, 200, product.slug);
    assert.match(page.text, /Made in Turkey/, `${product.slug} origin`);
    assert.match(page.text, /100% (Aegean|Turkish) cotton/i, `${product.slug} fiber`);
    assert.doesNotMatch(page.text, /aggregateRating|ratingValue/, `${product.slug} rating`);
  }
});

test('feeds, sitemap and the old collection URL', async () => {
  const sitemap = await get('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.text, /<urlset/);
  const robots = await get('/robots.txt');
  assert.match(robots.text, /Sitemap:/);
  const feed = await get('/feeds/google.xml');
  assert.equal(feed.status, 200);
  assert.match(feed.text, /USD/);
  const catalog = await get('/catalog.json');
  assert.equal(catalog.status, 200);
  const old = await get('/collection');
  assert.equal(old.status, 301);
  assert.equal(old.headers.get('location'), '/shop');
});

test('unknown pages return 404', async () => {
  assert.equal((await get('/product/no-such-towel')).status, 404);
  assert.equal((await get('/no-such-page')).status, 404);
});
