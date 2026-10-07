'use strict';

// Everything about the range that is not stock: the six categories, the weaves, the
// colourways and the photography. seed.js loads the products below into SQLite, and the
// server reads the categories and site photography from here.
//
// Photography is placeholder stock from Pexels and Unsplash, written as photo IDs. To
// use your own pictures, put the files in public/images/, swap an ID for a path such as
// '/images/ege-bath-towel.jpg', and restart the server (or run `node seed.js`). Stock
// and orders are never touched. See the README.

// Bump this whenever PRODUCTS changes, so that a running database is re-seeded on start.
const CATALOGUE_VERSION = 2;

const pexels = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`;
const unsplash = (id) => `https://images.unsplash.com/photo-${id}?w=1400&q=80`;
const local = (value) => (value.startsWith('/') ? value : null);
const picture = (source, alt) => ({ url: local(source) || pexels(source), alt });

const PHOTOS = {
  beigeStackStool: picture('4210372', 'Light beige towels folded and stacked on a white stool against a pale wall'),
  towelsSoapStool: picture('4210371', 'Folded towels with natural soap and a body brush on a minimal stool'),
  soapBrushTowels: picture('4210374', 'A bar of natural soap and a wooden brush resting on folded towels'),
  hangingAccessories: picture('4210310', 'Towels and natural bath accessories hanging on a wall rail'),
  beigeHooks: picture('4238996', 'Three beige towels hanging on hooks against a tiled bathroom wall'),
  rolledBasket: picture('282892', 'White towels rolled and stacked in a woven basket'),
  rolledNeutral: picture('45980', 'Rolled bath towels in soft neutral tones'),
  wickerBasket: picture('19014649', 'A choice of rolled towels in a wicker basket'),
  stripedBathEdge: picture('12679', 'A white towel with grey stripes folded over the edge of a bath'),
  whiteTable: picture('7691101', 'Folded white towels on a white table'),
  rackStack: picture('271711', 'A stack of folded towels on a bathroom rack'),
  spaBathroom: picture('6620703', 'A modern bathroom laid out with towels and spa essentials'),
  foldedCloseUp: picture('11733651', 'Close up of the folded edge of a cotton towel'),
  blueCloseUp: picture('28762830', 'Close up of folded blue cotton textiles'),
  beigeBathroom: picture('7045714', 'A calm beige bathroom with a white bathtub'),
  freestandingTub: picture('6207947', 'A freestanding bathtub in a minimal modern bathroom'),
  marbleTiles: picture('16249146', 'A bathroom finished in white marble tiles'),
  marbleWall: picture('7166635', 'A modern bathroom with a marble wall'),
  bathtubHung: picture('534116', 'A towel hung over the side of a bathtub'),
  whiteBathroom: picture('6587855', 'A bright bathroom with white walls and a contemporary bathtub'),
  handbasin: picture('5860599', 'A bathroom with a flat stone handbasin'),
  afterBath: picture('8955914', 'A woman wrapped in a soft white towel after a bath'),
  cottonBranch: picture('6168151', 'A branch of a cotton plant with open bolls'),
  cottonFlower: picture('3158017', 'A ripe cotton boll, soft and white'),
};

// Photography for the homepage and editorial sections. The hero is the original
// photograph of the Aegean coast.
const SITE_IMAGES = {
  hero: {
    url: unsplash('1533105079780-92b9be482077'),
    alt: 'Whitewashed houses and blue domes above the Aegean sea in afternoon light',
  },
  hands: {
    url: unsplash('1565193566173-7a0ee3dbe261'),
    alt: "A weaver's hands at work",
  },
  why: PHOTOS.afterBath,
  whyDetail: PHOTOS.foldedCloseUp,
  cotton: PHOTOS.cottonBranch,
  cottonDetail: PHOTOS.cottonFlower,
  sets: PHOTOS.spaBathroom,
};

// The order here is the order of the shop. Sizes are the standard UK sizes for each.
const CATEGORIES = [
  {
    slug: 'bath-towels',
    name: 'Bath Towels',
    singular: 'Bath towel',
    size: '70 × 140 cm',
    intro: 'The towel you reach for every day, so it should be the best one you own. Generous, absorbent and heavy enough to feel like a ritual.',
    image: PHOTOS.beigeHooks,
  },
  {
    slug: 'hand-towels',
    name: 'Hand Towels',
    singular: 'Hand towel',
    size: '50 × 90 cm',
    intro: 'Used more than any other towel in the house. Ours are dense enough to dry hands in one pass and handsome enough to hang by the basin.',
    image: PHOTOS.towelsSoapStool,
  },
  {
    slug: 'washcloths',
    name: 'Washcloths',
    singular: 'Washcloth',
    size: '30 × 30 cm',
    intro: 'Small squares of the same cotton, for the face and the bath. Gentle enough for every morning, sturdy enough for years of them.',
    image: PHOTOS.whiteTable,
  },
  {
    slug: 'guest-towels',
    name: 'Guest Towels',
    singular: 'Guest towel',
    size: '40 × 60 cm',
    intro: 'A fresh towel for every visitor. Folded beside the basin, they quietly say that someone thought about the details.',
    image: PHOTOS.rolledBasket,
  },
  {
    slug: 'bath-sheets',
    name: 'Bath Sheets',
    singular: 'Bath sheet',
    size: '100 × 180 cm',
    intro: 'Wrap yourself completely. Our largest towels, for long baths, slow Sundays and anyone who has ever wished a towel were bigger.',
    image: PHOTOS.marbleWall,
  },
  {
    slug: 'towel-sets',
    name: 'Towel Sets',
    singular: 'Towel set',
    size: 'Curated sets',
    intro: 'Collections composed in our studio to work together, presented in a cotton gift bag. Each one is sold only as a complete set.',
    image: PHOTOS.wickerBasket,
  },
];

// The four weaves. Each product names its weave, and the product page explains it.
const WEAVES = {
  ege: {
    name: 'Ege Plush',
    material: '100% long-staple Aegean cotton',
    weave: 'Dense loop terry',
    gsm: 700,
    feel: 'Deep, cushioned and very absorbent. The towel most people imagine when they think of a luxury hotel.',
  },
  assos: {
    name: 'Assos Rib',
    material: '100% long-staple Aegean cotton',
    weave: 'Ribbed terry',
    gsm: 550,
    feel: 'Fine vertical ribs that feel crisp against the skin and dry a little faster than plush.',
  },
  datca: {
    name: 'Datça Waffle',
    material: '100% long-staple Aegean cotton',
    weave: 'Honeycomb waffle',
    gsm: 380,
    feel: 'Light and textured, with a gentle exfoliating touch. Dries quickly, packs small and softens with use.',
  },
  bodrum: {
    name: 'Bodrum Peshtemal',
    material: '100% long-staple Aegean cotton',
    weave: 'Flat woven, hand knotted fringe',
    gsm: 240,
    feel: 'The traditional hammam cloth. Thin, quick drying and surprisingly absorbent, with a fringe knotted by hand.',
  },
};

// The eight colourways. A swatch is one hex, or two for striped weaves.
const COLOURS = {
  salt: { name: 'Salt', swatch: ['#f3efe6'] },
  rawCotton: { name: 'Raw Cotton', swatch: ['#e6dcc8'] },
  sandstone: { name: 'Sandstone', swatch: ['#cbb89a'] },
  pamukkale: { name: 'Pamukkale', swatch: ['#d9e1e0'] },
  oliveGrove: { name: 'Olive Grove', swatch: ['#9ea38a'] },
  aegean: { name: 'Aegean', swatch: ['#3e5469'] },
  terracotta: { name: 'Terracotta', swatch: ['#b7765a'] },
  basalt: { name: 'Basalt', swatch: ['#45423d'] },
  saltStripe: { name: 'Salt & Aegean Stripe', swatch: ['#f3efe6', '#3e5469'] },
  sandStripe: { name: 'Sand & Basalt Stripe', swatch: ['#cbb89a', '#45423d'] },
};

const colours = (...keys) => keys.map((key) => COLOURS[key]);

const SIGNATURE = colours('salt', 'rawCotton', 'sandstone', 'oliveGrove', 'aegean', 'terracotta', 'basalt');
const RIB = colours('salt', 'sandstone', 'pamukkale', 'oliveGrove', 'basalt');
const WAFFLE = colours('salt', 'rawCotton', 'pamukkale', 'terracotta');
const PESHTEMAL = colours('saltStripe', 'sandStripe', 'rawCotton');
const SET_COLOURS = colours('salt', 'rawCotton', 'sandstone', 'aegean');

function item({ slug, name, category, weave, price, summary, description, image, gallery, palette, featured = false, newArrival = false }) {
  const spec = WEAVES[weave];
  const size = CATEGORIES.find((entry) => entry.slug === category).size;
  return {
    slug,
    name,
    category,
    kind: 'item',
    price,
    summary,
    description,
    size,
    material: spec.material,
    weave: spec.weave,
    weight: `${spec.gsm} gsm`,
    collection: spec.name,
    feel: spec.feel,
    featured,
    newArrival,
    image,
    gallery,
    colours: palette,
    contents: [],
  };
}

const ITEMS = [
  item({
    slug: 'ege-bath-towel',
    name: 'Ege Bath Towel',
    category: 'bath-towels',
    weave: 'ege',
    price: 4200,
    summary: 'Our signature plush terry. Deep, soft and generously absorbent.',
    description:
      'The towel at the heart of Pamuq. Long-staple Aegean cotton is woven into dense, springy loops that drink water in seconds and feel cushioned against the skin. A double stitched hem keeps its shape for years.',
    image: PHOTOS.beigeStackStool,
    gallery: [PHOTOS.foldedCloseUp, PHOTOS.beigeBathroom, PHOTOS.hangingAccessories],
    palette: SIGNATURE,
    featured: true,
  }),
  item({
    slug: 'assos-rib-bath-towel',
    name: 'Assos Rib Bath Towel',
    category: 'bath-towels',
    weave: 'assos',
    price: 4600,
    summary: 'Fine ribbed terry with a crisp, tailored hand.',
    description:
      'Fine vertical ribs give this towel a tailored look and a fresh, slightly crisp feel. Lighter than plush, so it dries between uses even in a busy bathroom, and the ribs soften beautifully with washing.',
    image: PHOTOS.beigeHooks,
    gallery: [PHOTOS.foldedCloseUp, PHOTOS.marbleTiles, PHOTOS.rackStack],
    palette: RIB,
    newArrival: true,
  }),
  item({
    slug: 'datca-waffle-bath-towel',
    name: 'Datça Waffle Bath Towel',
    category: 'bath-towels',
    weave: 'datca',
    price: 3800,
    summary: 'Light honeycomb waffle that dries fast and packs small.',
    description:
      'A deep honeycomb weave that is light in the hand and quick to dry. The texture is gently invigorating after a shower, and it folds into almost nothing for travel or the beach.',
    image: PHOTOS.bathtubHung,
    gallery: [PHOTOS.whiteBathroom, PHOTOS.foldedCloseUp, PHOTOS.freestandingTub],
    palette: WAFFLE,
    featured: true,
  }),
  item({
    slug: 'ege-hand-towel',
    name: 'Ege Hand Towel',
    category: 'hand-towels',
    weave: 'ege',
    price: 2400,
    summary: 'Signature plush terry, sized for the basin.',
    description:
      'The same dense loops as our signature bath towel, sized to hang by the basin. It dries hands in a single pass and still looks freshly folded at the end of the day.',
    image: PHOTOS.towelsSoapStool,
    gallery: [PHOTOS.handbasin, PHOTOS.foldedCloseUp, PHOTOS.beigeStackStool],
    palette: SIGNATURE,
  }),
  item({
    slug: 'assos-rib-hand-towel',
    name: 'Assos Rib Hand Towel',
    category: 'hand-towels',
    weave: 'assos',
    price: 2600,
    summary: 'Crisp ribbed terry with a tailored finish.',
    description:
      'Ribbed terry with a clean, architectural line. It hangs flat and neat on a rail and feels pleasantly crisp in the hand.',
    image: PHOTOS.hangingAccessories,
    gallery: [PHOTOS.marbleTiles, PHOTOS.foldedCloseUp, PHOTOS.beigeHooks],
    palette: RIB,
  }),
  item({
    slug: 'datca-waffle-hand-towel',
    name: 'Datça Waffle Hand Towel',
    category: 'hand-towels',
    weave: 'datca',
    price: 2200,
    summary: 'Light honeycomb texture that is always dry by morning.',
    description:
      'A light honeycomb towel that dries quickly between uses, which makes it the natural choice for a busy family bathroom or a kitchen.',
    image: PHOTOS.rolledNeutral,
    gallery: [PHOTOS.whiteBathroom, PHOTOS.foldedCloseUp, PHOTOS.handbasin],
    palette: WAFFLE,
  }),
  item({
    slug: 'ege-washcloth',
    name: 'Ege Washcloth',
    category: 'washcloths',
    weave: 'ege',
    price: 1000,
    summary: 'Plush terry for the face. Gentle enough for every morning.',
    description:
      'A small square of our signature terry. The long cotton fibres stay soft against the face, and the dense loops hold warm water for a proper morning ritual.',
    image: PHOTOS.soapBrushTowels,
    gallery: [PHOTOS.foldedCloseUp, PHOTOS.handbasin, PHOTOS.towelsSoapStool],
    palette: SIGNATURE,
    featured: true,
  }),
  item({
    slug: 'datca-waffle-washcloth',
    name: 'Datça Waffle Washcloth',
    category: 'washcloths',
    weave: 'datca',
    price: 900,
    summary: 'A light exfoliating texture that dries quickly.',
    description:
      'The honeycomb weave gives a gentle exfoliating touch in the bath and dries quickly afterwards, so it always feels fresh.',
    image: PHOTOS.whiteTable,
    gallery: [PHOTOS.foldedCloseUp, PHOTOS.whiteBathroom, PHOTOS.rolledNeutral],
    palette: WAFFLE,
  }),
  item({
    slug: 'ege-guest-towel',
    name: 'Ege Guest Towel',
    category: 'guest-towels',
    weave: 'ege',
    price: 1600,
    summary: 'A small plush towel to fold beside the basin for visitors.',
    description:
      'Fold a stack beside the basin so that every guest has a fresh towel of their own. The same plush terry as our signature range, in a size made for hands.',
    image: PHOTOS.rolledBasket,
    gallery: [PHOTOS.handbasin, PHOTOS.foldedCloseUp, PHOTOS.wickerBasket],
    palette: SIGNATURE,
  }),
  item({
    slug: 'bodrum-guest-towel',
    name: 'Bodrum Guest Towel',
    category: 'guest-towels',
    weave: 'bodrum',
    price: 1800,
    summary: 'Flat woven peshtemal with a fringe knotted by hand.',
    description:
      'A small peshtemal, the traditional hammam cloth, with stripes woven in and a fringe knotted by hand. Light, quick drying and a lovely surprise for guests.',
    image: PHOTOS.stripedBathEdge,
    gallery: [PHOTOS.blueCloseUp, PHOTOS.handbasin, PHOTOS.rolledBasket],
    palette: PESHTEMAL,
    featured: true,
    newArrival: true,
  }),
  item({
    slug: 'ege-bath-sheet',
    name: 'Ege Bath Sheet',
    category: 'bath-sheets',
    weave: 'ege',
    price: 7200,
    summary: 'Our signature plush terry, large enough to wrap in completely.',
    description:
      'Everything we love about the Ege bath towel, in a size that wraps all the way around. Heavy, warm and deeply absorbent, it turns stepping out of the bath into the best part of it.',
    image: PHOTOS.freestandingTub,
    gallery: [PHOTOS.foldedCloseUp, PHOTOS.beigeBathroom, PHOTOS.beigeStackStool],
    palette: SIGNATURE,
  }),
  item({
    slug: 'assos-rib-bath-sheet',
    name: 'Assos Rib Bath Sheet',
    category: 'bath-sheets',
    weave: 'assos',
    price: 7800,
    summary: 'Ribbed terry in a generous size, with a tailored drape.',
    description:
      'A full size bath sheet in our fine ribbed terry. It drapes cleanly, dries faster than plush and keeps its crisp texture wash after wash.',
    image: PHOTOS.marbleWall,
    gallery: [PHOTOS.marbleTiles, PHOTOS.foldedCloseUp, PHOTOS.beigeHooks],
    palette: RIB,
  }),
  item({
    slug: 'bodrum-peshtemal',
    name: 'Bodrum Peshtemal',
    category: 'bath-sheets',
    weave: 'bodrum',
    price: 4800,
    summary: 'The traditional hammam towel. Light, striped and quick drying.',
    description:
      'The cloth of the Turkish hammam, flat woven in bath sheet size with stripes and a hand knotted fringe. It dries in a fraction of the time of terry and doubles as a beach towel, a throw or a wrap.',
    image: PHOTOS.blueCloseUp,
    gallery: [PHOTOS.stripedBathEdge, PHOTOS.whiteBathroom, PHOTOS.rolledNeutral],
    palette: PESHTEMAL,
    featured: true,
  }),
];

const BY_SLUG = Object.fromEntries(ITEMS.map((entry) => [entry.slug, entry]));

// A set lists what is inside. Its price is set below the pieces bought separately.
function set({ slug, name, price, summary, description, image, gallery, contents, featured = false, newArrival = false }) {
  const pieces = contents.map(([quantity, itemSlug]) => {
    const piece = BY_SLUG[itemSlug];
    return { quantity, name: piece.name, size: piece.size, slug: itemSlug, price: piece.price };
  });
  return {
    slug,
    name,
    category: 'towel-sets',
    kind: 'set',
    price,
    summary,
    description,
    size: `${pieces.reduce((sum, piece) => sum + piece.quantity, 0)} pieces`,
    material: '100% long-staple Aegean cotton',
    weave: 'Mixed, see what is inside',
    weight: 'Presented in a cotton gift bag',
    collection: 'Curated set',
    feel: 'Composed in our studio so that every piece works together. Each set is sold only as a whole.',
    featured,
    newArrival,
    image,
    gallery,
    colours: SET_COLOURS,
    contents: pieces,
  };
}

const SETS = [
  set({
    slug: 'the-essential-trio',
    name: 'The Essential Trio',
    price: 6800,
    summary: 'One bath towel, one hand towel and one washcloth in Ege Plush.',
    description:
      'Everything one person needs, in our signature plush. The simplest way to discover what a really good towel feels like, and the gift we recommend most.',
    image: PHOTOS.wickerBasket,
    gallery: [PHOTOS.beigeStackStool, PHOTOS.towelsSoapStool, PHOTOS.soapBrushTowels],
    contents: [
      [1, 'ege-bath-towel'],
      [1, 'ege-hand-towel'],
      [1, 'ege-washcloth'],
    ],
    featured: true,
  }),
  set({
    slug: 'the-couples-set',
    name: "The Couple's Set",
    price: 13600,
    summary: 'Two of everything in Ege Plush, for a shared bathroom.',
    description:
      'Two bath towels, two hand towels and two washcloths, in one colour so the bathroom feels considered. A favourite for weddings, new homes and anniversaries.',
    image: PHOTOS.rackStack,
    gallery: [PHOTOS.beigeHooks, PHOTOS.beigeBathroom, PHOTOS.foldedCloseUp],
    contents: [
      [2, 'ege-bath-towel'],
      [2, 'ege-hand-towel'],
      [2, 'ege-washcloth'],
    ],
    featured: true,
  }),
  set({
    slug: 'the-guest-bathroom-set',
    name: 'The Guest Bathroom Set',
    price: 8900,
    summary: 'Guest towels, hand towels and washcloths for a welcoming guest room.',
    description:
      'Two guest towels, two hand towels and two washcloths, so a visitor never has to ask. Folded by the basin, it makes a small bathroom feel like a hotel.',
    image: PHOTOS.handbasin,
    gallery: [PHOTOS.rolledBasket, PHOTOS.towelsSoapStool, PHOTOS.foldedCloseUp],
    contents: [
      [2, 'ege-guest-towel'],
      [2, 'ege-hand-towel'],
      [2, 'ege-washcloth'],
    ],
  }),
  set({
    slug: 'the-full-bathroom-set',
    name: 'The Full Bathroom Set',
    price: 31000,
    summary: 'Twelve pieces that dress an entire bathroom, from bath sheets to washcloths.',
    description:
      'Two bath sheets, two bath towels, two hand towels, two guest towels and four washcloths, all in Ege Plush and one colour. The complete bathroom, done once and done properly.',
    image: PHOTOS.whiteBathroom,
    gallery: [PHOTOS.rackStack, PHOTOS.freestandingTub, PHOTOS.beigeStackStool],
    contents: [
      [2, 'ege-bath-sheet'],
      [2, 'ege-bath-towel'],
      [2, 'ege-hand-towel'],
      [2, 'ege-guest-towel'],
      [4, 'ege-washcloth'],
    ],
    newArrival: true,
  }),
  set({
    slug: 'the-hammam-spa-set',
    name: 'The Hammam Spa Set',
    price: 16800,
    summary: 'A ribbed bath sheet, a waffle towel, a peshtemal and two waffle washcloths.',
    description:
      'Our tribute to the Turkish hammam. A generous ribbed bath sheet, a light waffle towel, a striped peshtemal and two exfoliating washcloths. Run a bath, light a candle and take your time.',
    image: PHOTOS.spaBathroom,
    gallery: [PHOTOS.stripedBathEdge, PHOTOS.bathtubHung, PHOTOS.blueCloseUp],
    contents: [
      [1, 'assos-rib-bath-sheet'],
      [1, 'datca-waffle-bath-towel'],
      [1, 'bodrum-peshtemal'],
      [2, 'datca-waffle-washcloth'],
    ],
    featured: true,
  }),
];

const PRODUCTS = [...ITEMS, ...SETS];

module.exports = { CATALOGUE_VERSION, CATEGORIES, PRODUCTS, SITE_IMAGES, WEAVES };
