'use strict';

require('dotenv').config({ quiet: true });

const db = require('./db');
const store = require('./store');
const { CATALOG_VERSION, PRODUCTS } = require('./catalog');

// Loads the catalog into the database. Safe to run again: it updates products, colors
// and pictures, removes products that are no longer sold, and never touches stock levels
// or orders.
async function seed() {
  await db.upsertCatalog(store.forSeeding());
  await db.setCatalogVersion(CATALOG_VERSION);
  return PRODUCTS.length;
}

if (require.main === module) {
  seed()
    .then((count) => process.stdout.write(`Seeded ${count} products into ${db.NAME}\n`))
    .catch((error) => {
      console.error(`Seeding failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { seed, CATALOG_VERSION };
