'use strict';

require('dotenv').config({ quiet: true });

const db = require('./db');
const { CATALOGUE_VERSION, PRODUCTS } = require('./catalogue');

// Loads the catalogue from catalogue.js into SQLite. Safe to run again: it updates
// products, colours and pictures, and never touches stock levels or orders. Products
// that are no longer in the catalogue are removed.
function seed() {
  db.upsertCatalogue(
    PRODUCTS.map((product) => ({
      ...product,
      // Every colourway shares the product photography until a colour has its own
      // picture. Add `image` to a colour in catalogue.js to give it one.
      colours: product.colours.map((colour) => ({
        name: colour.name,
        family: colour.family || 'all',
        swatch: colour.swatch,
        image: colour.image ? colour.image.url : product.image.url,
        imageAlt: colour.image ? colour.image.alt : product.image.alt,
      })),
    }))
  );
  db.setCatalogueVersion(CATALOGUE_VERSION);
  return PRODUCTS.length;
}

if (require.main === module) {
  const count = seed();
  process.stdout.write(`Seeded ${count} products into ${db.DB_PATH}\n`);
  db.close();
}

module.exports = { seed, CATALOGUE_VERSION };
