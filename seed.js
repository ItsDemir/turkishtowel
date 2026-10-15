'use strict';

require('dotenv').config({ quiet: true });

const db = require('./db');
const store = require('./store');
const { CATALOG_VERSION, PRODUCTS } = require('./catalog');

// Loads the catalog into SQLite. Safe to run again: it updates products, colors and
// pictures, removes products that are no longer sold, and never touches stock levels or
// orders.
function seed() {
  db.upsertCatalog(store.forSeeding());
  db.setCatalogVersion(CATALOG_VERSION);
  return PRODUCTS.length;
}

if (require.main === module) {
  const count = seed();
  process.stdout.write(`Seeded ${count} products into ${db.DB_PATH}\n`);
  db.close();
}

module.exports = { seed, CATALOG_VERSION };
