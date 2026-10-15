'use strict';

// The products as the pages see them: the words and pictures from catalog.js, live stock
// from SQLite, real photos from public/products and review summaries.

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

function listProducts() {
  const stock = db.stockMap();
  return PRODUCTS.map((product) => build(product, stock));
}

function getProduct(slug) {
  const product = PRODUCTS.find((entry) => entry.slug === slug);
  return product ? build(product, db.stockMap()) : null;
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

module.exports = { listProducts, getProduct, imagesFor, forSeeding, CATEGORIES, OCCASIONS, WEAVES };
