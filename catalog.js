'use strict';

// The range: categories, weaves, colorways, products, sets and the stock photography that
// stands in until real product photos exist. SQLite only keeps stock and orders; every
// word and picture on the site comes from here.
//
// Real photos go in public/products/{product}/{color}/01.jpg (see the README there).
// They replace the stock photos below automatically, color by color.

// Bump this whenever PRODUCTS changes, so that a running database is re-seeded on start.
const CATALOG_VERSION = 4;

const pexels = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`;
const picture = (id, alt) => ({ src: id.startsWith('/') ? id : pexels(id), alt });

// Stock photography from Pexels (free to use). Most of the towel shots come from one
// photographer's series, so the light and tone stay consistent across the site.
const PHOTOS = {
  beigeStackStool: picture('4210372', 'Light beige towels folded and stacked on a white stool'),
  towelsSoapStool: picture('4210371', 'Folded towels with natural soap and a body brush on a stool'),
  soapBrushTowels: picture('4210374', 'Small folded towels with a bar of natural soap and a wooden brush'),
  hangingRail: picture('4210310', 'Towels hanging from a wall rail beside natural bath accessories'),
  beigeHooks: picture('4238996', 'Three beige bath towels hanging on hooks against a tiled wall'),
  rolledBasket: picture('282892', 'White guest towels rolled and stacked in a woven basket'),
  rolledNeutral: picture('45980', 'Small towels rolled in soft neutral tones'),
  wickerBasket: picture('19014649', 'A set of rolled towels in a wicker basket'),
  stripedBathEdge: picture('12679', 'A white towel with gray stripes folded over the edge of a bath'),
  whiteTable: picture('7691101', 'A stack of folded white towels on a white table'),
  rackStack: picture('271711', 'A stack of folded towels on a bathroom rack'),
  spaBathroom: picture('6620703', 'Towels laid out in a calm bathroom with spa essentials'),
  bathtubHung: picture('534116', 'A large towel hung over the side of a bathtub'),
  faceTowel: picture('8142193', 'A white towel hanging in a bathroom'),
  holdingStack: picture('6466228', 'A stack of folded white towels held in two hands, showing their size'),
  carryingStack: picture('6466230', 'A tall stack of white towels carried in both arms'),
  ribbonTowels: picture('1304110', 'Two white towels tied with ribbon, ready to give'),
  hotelStack: picture('15195270', 'Fresh towels stacked beside flowers in a guest room'),
  towelOnBed: picture('2092060', 'A folded white towel laid on a bed'),
  blueStripeFringe: picture('30982095', 'A blue and white striped Turkish towel with a knotted fringe'),
  stripeSunglasses: picture('30982097', 'A striped Turkish towel with sunglasses, ready for summer'),
  stripeOnSand: picture('30982098', 'A striped Turkish towel and sunglasses on warm sand'),
  poolLoungers: picture('9043966', 'Sun loungers beside a turquoise pool'),
  bodrumCastle: picture('17500896', 'The tower of Bodrum Castle against a clear Aegean sky'),
  loomHand: picture('6634341', "A weaver's hand guiding thread on a wooden loom"),
  loomWeaver: picture('6634700', 'A weaver seated at a loom in the workshop'),
  cottonBranch: picture('6168151', 'A branch of a cotton plant with open bolls'),
  cottonFlower: picture('3158017', 'A ripe cotton boll, soft and white'),
};

// Photography for the pages. Swap any of these for a path under public/ to use your own.
const SITE_IMAGES = {
  // The homepage hero. TODO: replace with a commissioned Bodrum coastline photograph.
  hero: PHOTOS.bodrumCastle,
  why: PHOTOS.beigeStackStool,
  whyDetail: PHOTOS.soapBrushTowels,
  bodrum: PHOTOS.stripeOnSand,
  cotton: PHOTOS.cottonBranch,
  cottonDetail: PHOTOS.cottonFlower,
  workshop: PHOTOS.loomHand,
  workshopWide: PHOTOS.loomWeaver,
  sets: PHOTOS.rackStack,
  gifts: PHOTOS.ribbonTowels,
  beach: PHOTOS.stripeOnSand,
  beachDetail: PHOTOS.poolLoungers,
  founder: null, // TODO: a portrait of the founder
};

// The order here is the order of the shop. Sizes are stored in centimeters and shown in
// inches first (see format.js).
const CATEGORIES = [
  {
    slug: 'bath-towels',
    name: 'Bath Towels',
    singular: 'Bath towel',
    size: { w: 70, h: 140 },
    intro: 'The Turkish cotton bath towel you reach for every day, so it should be the best one you own. Generous, absorbent and heavy enough to feel like a ritual.',
    image: PHOTOS.beigeHooks,
  },
  {
    slug: 'hand-towels',
    name: 'Hand Towels',
    singular: 'Hand towel',
    size: { w: 50, h: 90 },
    intro: 'Used more than any other towel in the house. Ours are dense enough to dry hands in one pass and handsome enough to hang by the basin.',
    image: PHOTOS.towelsSoapStool,
  },
  {
    slug: 'washcloths',
    name: 'Washcloths',
    singular: 'Washcloth',
    size: { w: 30, h: 30 },
    intro: 'Small squares of the same Turkish cotton, for the face and the bath. Gentle enough for every morning, sturdy enough for years of them.',
    image: PHOTOS.soapBrushTowels,
  },
  {
    slug: 'guest-towels',
    name: 'Guest Towels',
    singular: 'Guest towel',
    size: { w: 40, h: 60 },
    intro: 'A fresh towel for every visitor. Folded beside the basin, they quietly say that someone thought about the details.',
    image: PHOTOS.rolledBasket,
  },
  {
    slug: 'bath-sheets',
    name: 'Bath Sheets',
    singular: 'Bath sheet',
    size: { w: 100, h: 180 },
    intro: 'Wrap yourself completely. Our largest towels, and the right pick if you are used to a big American bath towel.',
    image: PHOTOS.bathtubHung,
  },
  {
    slug: 'towel-sets',
    name: 'Towel Sets',
    singular: 'Towel set',
    size: null,
    intro: 'Collections composed to work together, presented in a cotton gift bag. Each one is sold only as a complete set.',
    image: PHOTOS.ribbonTowels,
  },
];

// The four weaves. Each product names its weave, and the product page explains it.
const WEAVES = {
  ege: {
    name: 'Ege Plush',
    filter: 'Plush',
    weave: 'Dense loop terry',
    gsm: 700,
    weightNote: 'heavy, plush, hotel weight',
    feel: 'Deep, cushioned and very absorbent. The towel most people imagine when they think of a luxury hotel.',
  },
  assos: {
    name: 'Assos Rib',
    filter: 'Ribbed',
    weave: 'Ribbed terry',
    gsm: 550,
    weightNote: 'medium weight, crisp and quick to dry',
    feel: 'Fine vertical ribs that feel crisp against the skin and dry a little faster than plush.',
  },
  datca: {
    name: 'Datça Waffle',
    filter: 'Waffle',
    weave: 'Honeycomb waffle',
    gsm: 380,
    weightNote: 'light, airy and fast drying',
    feel: 'Light and textured, with a gentle exfoliating touch. Dries quickly, packs small and softens with use.',
  },
  bodrum: {
    name: 'Bodrum Peshtemal',
    filter: 'Peshtemal',
    weave: 'Flat woven, hand knotted fringe',
    gsm: 240,
    weightNote: 'very light, packs small',
    feel: 'The traditional hammam cloth and the original Turkish towel. Thin, quick drying and surprisingly absorbent, with a fringe knotted by hand.',
  },
};

// The eight colorways, plus two woven stripes. A swatch is one hex, or two for stripes.
const COLORS = {
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

const colors = (...keys) => keys.map((key) => COLORS[key]);

const SIGNATURE = colors('salt', 'rawCotton', 'sandstone', 'oliveGrove', 'aegean', 'terracotta', 'basalt');
const RIB = colors('salt', 'sandstone', 'pamukkale', 'oliveGrove', 'basalt');
const WAFFLE = colors('salt', 'rawCotton', 'pamukkale', 'terracotta');
const PESHTEMAL = colors('saltStripe', 'sandStripe', 'rawCotton');
const SET_COLORS = colors('salt', 'rawCotton', 'sandstone', 'aegean');

function item({ slug, name, category, weave, price, summary, description, images, palette, featured = false, newArrival = false, beach = false }) {
  const spec = WEAVES[weave];
  return {
    slug,
    name,
    category,
    kind: 'item',
    weaveKey: weave,
    price,
    summary,
    description,
    size: CATEGORIES.find((entry) => entry.slug === category).size,
    weave: spec.weave,
    gsm: spec.gsm,
    weightNote: spec.weightNote,
    collection: spec.name,
    feel: spec.feel,
    featured,
    newArrival,
    beach,
    images,
    colors: palette,
    contents: [],
  };
}

const ITEMS = [
  item({
    slug: 'ege-bath-towel',
    name: 'Ege Bath Towel',
    category: 'bath-towels',
    weave: 'ege',
    price: 5800,
    summary: 'Our signature plush terry. Deep, soft and generously absorbent.',
    description:
      'The towel at the heart of Pamuq. Long staple Aegean cotton is woven into dense, springy loops that drink water in seconds and feel cushioned against the skin. A double stitched hem keeps its shape for years.',
    images: [PHOTOS.beigeStackStool, PHOTOS.soapBrushTowels, PHOTOS.beigeHooks, PHOTOS.hangingRail],
    palette: SIGNATURE,
    featured: true,
  }),
  item({
    slug: 'assos-rib-bath-towel',
    name: 'Assos Rib Bath Towel',
    category: 'bath-towels',
    weave: 'assos',
    price: 6200,
    summary: 'Fine ribbed terry with a crisp, tailored hand.',
    description:
      'Fine vertical ribs give this towel a tailored look and a fresh, slightly crisp feel. Lighter than plush, so it dries between uses even in a busy bathroom, and the ribs soften beautifully with washing.',
    images: [PHOTOS.beigeHooks, PHOTOS.hangingRail, PHOTOS.rackStack],
    palette: RIB,
    newArrival: true,
  }),
  item({
    slug: 'datca-waffle-bath-towel',
    name: 'Datça Waffle Bath Towel',
    category: 'bath-towels',
    weave: 'datca',
    price: 4800,
    summary: 'Light honeycomb waffle that dries fast and packs small.',
    description:
      'A deep honeycomb weave that is light in the hand and quick to dry. The texture is gently invigorating after a shower, and it folds into almost nothing for travel, the pool or the beach.',
    images: [PHOTOS.bathtubHung, PHOTOS.faceTowel, PHOTOS.rolledNeutral],
    palette: WAFFLE,
    featured: true,
    beach: true,
  }),
  item({
    slug: 'ege-hand-towel',
    name: 'Ege Hand Towel',
    category: 'hand-towels',
    weave: 'ege',
    price: 3200,
    summary: 'Signature plush terry, sized for the basin.',
    description:
      'The same dense loops as our signature bath towel, sized to hang by the basin. It dries hands in a single pass and still looks freshly folded at the end of the day.',
    images: [PHOTOS.towelsSoapStool, PHOTOS.soapBrushTowels, PHOTOS.beigeStackStool],
    palette: SIGNATURE,
  }),
  item({
    slug: 'assos-rib-hand-towel',
    name: 'Assos Rib Hand Towel',
    category: 'hand-towels',
    weave: 'assos',
    price: 3400,
    summary: 'Crisp ribbed terry with a tailored finish.',
    description:
      'Ribbed terry with a clean, architectural line. It hangs flat and neat on a rail and feels pleasantly crisp in the hand.',
    images: [PHOTOS.hangingRail, PHOTOS.beigeHooks, PHOTOS.faceTowel],
    palette: RIB,
  }),
  item({
    slug: 'datca-waffle-hand-towel',
    name: 'Datça Waffle Hand Towel',
    category: 'hand-towels',
    weave: 'datca',
    price: 2800,
    summary: 'Light honeycomb texture that is always dry by morning.',
    description:
      'A light honeycomb towel that dries quickly between uses, which makes it the natural choice for a busy family bathroom or a kitchen.',
    images: [PHOTOS.faceTowel, PHOTOS.rolledNeutral, PHOTOS.bathtubHung],
    palette: WAFFLE,
  }),
  item({
    slug: 'ege-washcloth',
    name: 'Ege Washcloth',
    category: 'washcloths',
    weave: 'ege',
    price: 1400,
    summary: 'Plush terry for the face. Gentle enough for every morning.',
    description:
      'A small square of our signature terry. The long cotton fibers stay soft against the face, and the dense loops hold warm water for a proper morning ritual.',
    images: [PHOTOS.soapBrushTowels, PHOTOS.towelsSoapStool, PHOTOS.beigeStackStool],
    palette: SIGNATURE,
    featured: true,
  }),
  item({
    slug: 'datca-waffle-washcloth',
    name: 'Datça Waffle Washcloth',
    category: 'washcloths',
    weave: 'datca',
    price: 1200,
    summary: 'A light exfoliating texture that dries quickly.',
    description:
      'The honeycomb weave gives a gentle exfoliating touch in the bath and dries quickly afterwards, so it always feels fresh.',
    images: [PHOTOS.rolledNeutral, PHOTOS.whiteTable, PHOTOS.faceTowel],
    palette: WAFFLE,
  }),
  item({
    slug: 'ege-guest-towel',
    name: 'Ege Guest Towel',
    category: 'guest-towels',
    weave: 'ege',
    price: 2200,
    summary: 'A small plush towel to fold beside the basin for visitors.',
    description:
      'Fold a stack beside the basin so that every guest has a fresh towel of their own. The same plush terry as our signature range, in a size made for hands.',
    images: [PHOTOS.rolledBasket, PHOTOS.hotelStack, PHOTOS.towelsSoapStool],
    palette: SIGNATURE,
  }),
  item({
    slug: 'bodrum-guest-towel',
    name: 'Bodrum Guest Towel',
    category: 'guest-towels',
    weave: 'bodrum',
    price: 2400,
    summary: 'A small flat woven peshtemal with a fringe knotted by hand.',
    description:
      'A small peshtemal, the traditional Turkish towel, with stripes woven in and a fringe knotted by hand. Light and quick drying, for the guest bath, the gym bag or the pool.',
    images: [PHOTOS.stripeSunglasses, PHOTOS.stripedBathEdge, PHOTOS.blueStripeFringe],
    palette: PESHTEMAL,
    featured: true,
    newArrival: true,
    beach: true,
  }),
  item({
    slug: 'ege-bath-sheet',
    name: 'Ege Bath Sheet',
    category: 'bath-sheets',
    weave: 'ege',
    price: 9800,
    summary: 'Our signature plush terry, large enough to wrap in completely.',
    description:
      'Everything we love about the Ege bath towel, in a size that wraps all the way around. Heavy, warm and deeply absorbent, it turns stepping out of the bath into the best part of it.',
    images: [PHOTOS.holdingStack, PHOTOS.beigeStackStool, PHOTOS.towelOnBed],
    palette: SIGNATURE,
  }),
  item({
    slug: 'assos-rib-bath-sheet',
    name: 'Assos Rib Bath Sheet',
    category: 'bath-sheets',
    weave: 'assos',
    price: 10800,
    summary: 'Ribbed terry in a generous size, with a tailored drape.',
    description:
      'A full size bath sheet in our fine ribbed terry. It drapes cleanly, dries faster than plush and keeps its crisp texture wash after wash.',
    images: [PHOTOS.rackStack, PHOTOS.beigeHooks, PHOTOS.bathtubHung],
    palette: RIB,
  }),
  item({
    slug: 'bodrum-peshtemal',
    name: 'Bodrum Peshtemal',
    category: 'bath-sheets',
    weave: 'bodrum',
    price: 6800,
    summary: 'The full size Turkish beach towel. Light, striped and quick drying.',
    description:
      'The cloth of the Turkish hammam, flat woven in full size with stripes and a hand knotted fringe. It dries in a fraction of the time of terry, sand shakes straight off, and it doubles as a throw or a wrap on cooler evenings.',
    images: [PHOTOS.blueStripeFringe, PHOTOS.stripeOnSand, PHOTOS.poolLoungers],
    palette: PESHTEMAL,
    featured: true,
    beach: true,
  }),
];

const BY_SLUG = Object.fromEntries(ITEMS.map((entry) => [entry.slug, entry]));

// A set lists what is inside. Its price is about 10% below the pieces bought separately.
function set({ slug, name, price, summary, description, images, contents, featured = false, newArrival = false, beach = false }) {
  const pieces = contents.map(([quantity, itemSlug]) => {
    const piece = BY_SLUG[itemSlug];
    return { quantity, name: piece.name, size: piece.size, slug: itemSlug, price: piece.price, category: piece.category };
  });
  return {
    slug,
    name,
    category: 'towel-sets',
    kind: 'set',
    weaveKey: null,
    price,
    summary,
    description,
    size: null,
    weave: 'Mixed, see what is inside',
    gsm: null,
    weightNote: '',
    collection: 'Curated set',
    feel: 'Composed so that every piece works together. Each set is sold only as a whole.',
    featured,
    newArrival,
    beach,
    images,
    colors: SET_COLORS,
    contents: pieces,
  };
}

const SETS = [
  set({
    slug: 'the-essential-trio',
    name: 'The Essential Trio',
    price: 9400,
    summary: 'One bath towel, one hand towel and one washcloth in Ege Plush.',
    description:
      'Everything one person needs, in our signature plush. The simplest way to discover what a really good towel feels like, and the gift we recommend most.',
    images: [PHOTOS.wickerBasket, PHOTOS.beigeStackStool, PHOTOS.towelsSoapStool, PHOTOS.soapBrushTowels],
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
    price: 18800,
    summary: 'Two of everything in Ege Plush, for a shared bathroom.',
    description:
      'Two bath towels, two hand towels and two washcloths, in one color so the bathroom feels considered. A favorite for wedding registries, new homes and anniversaries.',
    images: [PHOTOS.ribbonTowels, PHOTOS.holdingStack, PHOTOS.beigeHooks],
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
    price: 12200,
    summary: 'Guest towels, hand towels and washcloths for a welcoming guest room.',
    description:
      'Two guest towels, two hand towels and two washcloths, so a visitor never has to ask. Folded by the basin, it makes a small bathroom feel like a good hotel.',
    images: [PHOTOS.hotelStack, PHOTOS.rolledBasket, PHOTOS.towelsSoapStool],
    contents: [
      [2, 'ege-guest-towel'],
      [2, 'ege-hand-towel'],
      [2, 'ege-washcloth'],
    ],
  }),
  set({
    slug: 'the-full-bathroom-set',
    name: 'The Full Bathroom Set',
    price: 42800,
    summary: 'Twelve pieces that dress an entire bathroom, from bath sheets to washcloths.',
    description:
      'Two bath sheets, two bath towels, two hand towels, two guest towels and four washcloths, all in Ege Plush and one color. The complete bathroom, done once and done properly.',
    images: [PHOTOS.whiteTable, PHOTOS.carryingStack, PHOTOS.rackStack],
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
    price: 22400,
    summary: 'A ribbed bath sheet, a waffle towel, a peshtemal and two waffle washcloths.',
    description:
      'Our tribute to the Turkish hammam. A generous ribbed bath sheet, a light waffle towel, a striped peshtemal and two exfoliating washcloths. Run a bath, light a candle and take your time.',
    images: [PHOTOS.spaBathroom, PHOTOS.blueStripeFringe, PHOTOS.bathtubHung],
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

// Gift guides on /gifts. Each occasion names the pieces it suggests.
const OCCASIONS = [
  { slug: 'wedding-registry', name: 'Wedding registry', note: 'Two of everything, in one color.', products: ['the-couples-set', 'the-full-bathroom-set', 'ege-bath-sheet'] },
  { slug: 'housewarming', name: 'Housewarming', note: 'For the first guest bathroom.', products: ['the-guest-bathroom-set', 'the-essential-trio', 'ege-guest-towel'] },
  { slug: 'mothers-day', name: "Mother's Day", note: 'An afternoon to herself, in towel form.', products: ['the-hammam-spa-set', 'ege-bath-sheet', 'the-essential-trio'] },
  { slug: 'holidays', name: 'The holidays', note: 'Wrapped, ready and easy to love.', products: ['the-essential-trio', 'bodrum-peshtemal', 'the-hammam-spa-set'] },
  { slug: 'for-yourself', name: 'For yourself', note: 'Because you use it every day.', products: ['ege-bath-sheet', 'assos-rib-bath-towel', 'datca-waffle-bath-towel'] },
];

module.exports = { CATALOG_VERSION, CATEGORIES, PRODUCTS, SITE_IMAGES, WEAVES, COLORS, OCCASIONS };
