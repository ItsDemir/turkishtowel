'use strict';

// The products as the pages see them: the words and pictures from catalog.js, live stock
// from the database, real photos from public/products and review summaries.

const db = require('./db');
const photos = require('./lib/photos');
const reviews = require('./lib/reviews');
const { PRODUCTS, CATEGORIES, OCCASIONS, WEAVES } = require('./catalog');

function variantsFor(product, stock) {
  return product.colors.map((color) => {
    const key = db.slugify(color.name);
    const sku = `${product.slug}-${key}`;
    const own = photos.forColor(product.slug, key, product.name, color.name);
    return {
      sku,
      key,
      color: color.name,
      swatch: color.swatch,
      stock: stock ? (stock.has(sku) ? stock.get(sku) : 0) : undefined,
      images: own,
    };
  });
}

function build(product, stock) {
  const defaults = photos.forColor(product.slug, 'default', product.name);
  const variants = variantsFor(product, stock);
  return {
    ...product,
    isSet: product.kind === 'set',
    // The product's own photos, then the stock stand-ins.
    images: defaults.length > 0 ? defaults : product.images,
    variants,
    rating: reviews.summary(product.slug),
  };
}

// Stock levels are read before each request (see server.js) and kept for a short while,
// so that pages do not wait on a remote database every time. Checkout always reads fresh
// stock. A local file is fast enough to read every time.
const STOCK_TTL = db.REMOTE ? 30 * 1000 : 0;
let stock = null;
let stockAt = 0;
let loading = null;

function refreshStock() {
  if (stock && Date.now() - stockAt < STOCK_TTL) return Promise.resolve();
  loading ??= db
    .stockMap()
    .then((map) => {
      stock = map;
      stockAt = Date.now();
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

// After an order, so that the next page shows the new stock.
function forgetStock() {
  stockAt = 0;
}

function listProducts() {
  return PRODUCTS.map((product) => build(product, stock));
}

function getProduct(slug) {
  const product = PRODUCTS.find((entry) => entry.slug === slug);
  return product ? build(product, stock) : null;
}

// The first photo of a color: its own, or the product's.
function imagesFor(product, variant) {
  return variant && variant.images.length > 0 ? variant.images : product.images;
}

// Products ready for the database, each color with a sku and its lead picture.
function forSeeding() {
  return PRODUCTS.map((product) => {
    const built = build(product, null);
    return {
      ...built,
      variants: built.variants.map((variant) => {
        const lead = imagesFor(built, variant)[0];
        return { ...variant, stock: undefined, image: lead.src, imageAlt: lead.alt };
      }),
    };
  });
}

module.exports = { listProducts, getProduct, imagesFor, forSeeding, refreshStock, forgetStock, CATEGORIES, OCCASIONS, WEAVES };
