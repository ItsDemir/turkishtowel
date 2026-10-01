'use strict';

require('dotenv').config({ quiet: true });

const db = require('./db');

// Placeholder photography from Unsplash, written as photo IDs. To use your own pictures,
// put the files in public/images/, replace an ID with a path such as
// '/images/hammam-classic-stone.jpg', and run `node seed.js` again. Stock levels and
// orders are never touched by a re-seed. See the README.
const photo = (id) => `https://images.unsplash.com/photo-${id}?w=1400&q=80`;
const picture = (idOrPath) => (idOrPath.startsWith('/') ? idOrPath : photo(idOrPath));

// Shared gallery pictures. Each product shows three of these beside its colour photo.
const SCENES = {
  village: { url: picture('1570077188670-e3a8d69ac5ff'), alt: 'Whitewashed village above a sunlit Aegean bay' },
  harbour: { url: picture('1533105079780-92b9be482077'), alt: 'Whitewashed houses and blue domes on the Aegean coast' },
  hands: { url: picture('1565193566173-7a0ee3dbe261'), alt: 'Hands of a craftsperson at work' },
  beach: { url: picture('1507525428034-b723cf961d3e'), alt: 'Clear water and pale sand on a quiet beach' },
  shore: { url: picture('1519046904884-53103b34b206'), alt: 'Soft waves arriving on a sunlit shore' },
  cliffs: { url: picture('1516483638261-f4dbaf036963'), alt: 'Pastel houses above the Mediterranean' },
  waves: { url: picture('1505118380757-91f5f5632de0'), alt: 'Waves rolling onto a sandy shore' },
};

// A colour has one swatch hex, or two for striped towels. Its family groups it under
// one of the filter swatches on the collection page. The fourth argument is the colour's
// photograph: an Unsplash photo ID or a path under public/images.
function colour(name, family, swatch, photograph, product) {
  return {
    name,
    family,
    swatch,
    image: picture(photograph),
    imageAlt: `${product} peshtemal in ${name}`,
  };
}

const PRODUCTS = [
  {
    slug: 'hammam-classic',
    name: 'Hammam Classic',
    price: 6800,
    description:
      'The towel that started everything. Flat-woven in a traditional diamond pattern, light enough to fold into a jacket pocket, absorbent enough to replace a bath towel.',
    dimensions: '90cm × 180cm',
    weight: '380g',
    newArrival: false,
    colours: [
      colour('Stone', 'neutral', ['#b5ad9f'], '1540555700478-4be289fbecef', 'Hammam Classic'),
      colour('Indigo', 'blue', ['#3a4468'], '1540518614846-7eded433c457', 'Hammam Classic'),
      colour('Ivory', 'neutral', ['#ebe4d3'], '1505693416388-ac5ce068fe85', 'Hammam Classic'),
      colour('Sage', 'green', ['#98a387'], '1515377905703-c4788e51af15', 'Hammam Classic'),
    ],
    gallery: [SCENES.village, SCENES.hands, SCENES.beach],
  },
  {
    slug: 'sultan-stripe',
    name: 'Sultan Stripe',
    price: 7400,
    description:
      'A bolder take on the peshtemal form. Wide alternating stripes woven on a 120-year-old shuttle loom. The kind of towel that looks intentional on a sunlounger.',
    dimensions: '95cm × 185cm',
    weight: '420g',
    newArrival: true,
    colours: [
      colour('Sand & Ivory', 'neutral', ['#cdb893', '#ece5d4'], '1522771739844-6a9f6d5f14af', 'Sultan Stripe'),
      colour('Charcoal & Natural', 'dark', ['#3b3a37', '#d3c8b0'], '1519823551278-64ac92734fb1', 'Sultan Stripe'),
      colour('Dusty Rose & White', 'warm', ['#c99d98', '#f2eee6'], '1544161515-4ab6ce6db874', 'Sultan Stripe'),
    ],
    gallery: [SCENES.shore, SCENES.hands, SCENES.cliffs],
  },
  {
    slug: 'aegean-waffle',
    name: 'Aegean Waffle',
    price: 7800,
    description:
      'A waffle weave that moves between towel and throw. Heavier than our classics, with a texture that holds warmth. Made for cooler evenings and longer baths.',
    dimensions: '100cm × 190cm',
    weight: '520g',
    newArrival: true,
    colours: [
      colour('Natural', 'neutral', ['#d6caad'], '1600566752355-35792bedcfea', 'Aegean Waffle'),
      colour('Slate', 'blue', ['#667180'], '1556228720-195a672e8a03', 'Aegean Waffle'),
      colour('Clay', 'warm', ['#b4775b'], '1584622650111-993a426fbf0a', 'Aegean Waffle'),
    ],
    gallery: [SCENES.harbour, SCENES.waves, SCENES.hands],
  },
  {
    slug: 'fine-hammam-set',
    name: 'Fine Hammam Set',
    price: 12800,
    description:
      'Two Hammam Classics in matching colour, packaged in unbleached cotton wrapping. The only gift that gets better after the first wash.',
    dimensions: '2 × 90cm × 180cm',
    weight: '760g',
    newArrival: true,
    colours: [
      colour('Ivory', 'neutral', ['#ebe4d3'], '1631889993959-41b4e9c6e3c5', 'Fine Hammam Set'),
      colour('Stone', 'neutral', ['#b5ad9f'], '1620626011761-996317b8d101', 'Fine Hammam Set'),
    ],
    gallery: [SCENES.beach, SCENES.village, SCENES.cliffs],
  },
];

function seed() {
  db.upsertCatalogue(PRODUCTS);
  return PRODUCTS.length;
}

if (require.main === module) {
  const count = seed();
  process.stdout.write(`Seeded ${count} products into ${db.DB_PATH}\n`);
  db.close();
}

module.exports = { seed, PRODUCTS };
