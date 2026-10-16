'use strict';

require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');

const config = require('./config');
const db = require('./db');
const store = require('./store');
const reviews = require('./lib/reviews');
const seo = require('./lib/seo');
const shipping = require('./lib/shipping');
const checkout = require('./lib/checkout');
const { subscribe } = require('./lib/subscribe');
const { sendSupportMessage, sendReviewNotice } = require('./email');
const { render, pageData, absoluteUrl, SITE_URL, PORT, IS_PRODUCTION, campaignLive, orderByLine } = require('./lib/render');
const { imageTag, pictureTag, imageUrl, shareUrl } = require('./lib/images');
const markup = require('./lib/markup');
const { escapeHtml, formatPrice, firstName, sizeLabel, sizeShort, formatDate } = require('./format');
const { CATEGORIES, SITE_IMAGES, WEAVES, COLORS, OCCASIONS } = require('./catalog');
const FAQ = require('./content/faq');

const { HttpError } = checkout;
const PUBLIC_DIR = path.join(__dirname, 'public');
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helpers for the pages

function featuredItems(products, limit = 4) {
  return products.filter((product) => product.featured && !product.isSet).slice(0, limit);
}

function featuredSets(products, limit = 3) {
  return products.filter((product) => product.featured && product.isSet).slice(0, limit);
}

function setsContaining(products, slug) {
  return products.filter((product) => product.isSet && product.contents.some((piece) => piece.slug === slug));
}

// Related pieces: never the current product. Pieces that share a color come first, then
// the categories that complete a bathroom, then sets that include this piece.
const COMPLEMENTS = {
  'bath-towels': ['hand-towels', 'washcloths', 'bath-sheets'],
  'hand-towels': ['bath-towels', 'washcloths', 'guest-towels'],
  washcloths: ['bath-towels', 'hand-towels', 'guest-towels'],
  'guest-towels': ['hand-towels', 'washcloths', 'bath-towels'],
  'bath-sheets': ['bath-towels', 'hand-towels', 'washcloths'],
  'towel-sets': ['towel-sets', 'bath-sheets', 'bath-towels'],
};

function pairsWellWith(products, product, limit = 4) {
  const colors = new Set(product.variants.map((variant) => variant.key));
  const order = COMPLEMENTS[product.category] || [];
  const scored = products
    .filter((other) => other.slug !== product.slug)
    .map((other, position) => {
      let score = 0;
      if (other.variants.some((variant) => colors.has(variant.key))) score += 4;
      const index = order.indexOf(other.category);
      if (index !== -1) score += 3 - index;
      if (other.category === product.category && product.category !== 'towel-sets') score -= 2;
      if (other.isSet && other.contents.some((piece) => piece.slug === product.slug)) score += 3;
      return { other, score, position };
    })
    .sort((a, b) => b.score - a.score || a.position - b.position);
  return scored.slice(0, limit).map(({ other }) => other);
}

// Filters on the shop pages. The server applies them so that filtered addresses work
// without JavaScript, and shop.js applies them again instantly as they change.
const PRICE_BANDS = [
  { key: 'under-25', label: `Under ${formatPrice(2500)}`, min: 0, max: 2499 },
  { key: '25-50', label: `${formatPrice(2500)} to ${formatPrice(5000)}`, min: 2500, max: 5000 },
  { key: '50-100', label: `${formatPrice(5000)} to ${formatPrice(10000)}`, min: 5001, max: 10000 },
  { key: 'over-100', label: `Over ${formatPrice(10000)}`, min: 10001, max: Infinity },
];
const SORTS = [
  ['featured', 'Featured'],
  ['price-asc', 'Price, low to high'],
  ['price-desc', 'Price, high to low'],
  ['newest', 'Newest'],
];

function listParam(value) {
  return typeof value === 'string' && value ? value.split(',').filter(Boolean) : [];
}

function readFilters(query) {
  const sort = SORTS.some(([key]) => key === query.sort) ? query.sort : 'featured';
  return {
    category: listParam(query.category),
    color: listParam(query.color),
    weave: listParam(query.weave),
    price: listParam(query.price),
    sort,
  };
}

function applyFilters(products, filters) {
  const bands = PRICE_BANDS.filter((band) => filters.price.includes(band.key));
  const shown = products
    .map((product, position) => ({ product, position }))
    .filter(({ product }) => !filters.category.length || filters.category.includes(product.category))
    .filter(({ product }) => !filters.color.length || product.variants.some((variant) => filters.color.includes(variant.key)))
    .filter(({ product }) => !filters.weave.length || filters.weave.includes(product.weaveKey || 'set'))
    .filter(({ product }) => !bands.length || bands.some((band) => product.price >= band.min && product.price <= band.max));
  const by = {
    'price-asc': (a, b) => a.product.price - b.product.price || a.position - b.position,
    'price-desc': (a, b) => b.product.price - a.product.price || a.position - b.position,
    newest: (a, b) => Number(b.product.newArrival) - Number(a.product.newArrival) || a.position - b.position,
    featured: (a, b) => a.position - b.position,
  }[filters.sort];
  return shown.sort(by).map(({ product }) => product);
}

function check(name, value, chosen) {
  return `${chosen.includes(value) ? ' checked' : ''} name="${name}" value="${escapeHtml(value)}"`;
}

function filterBar(products, filters, { showCategory }) {
  const colorKeys = new Set(products.flatMap((product) => product.variants.map((variant) => variant.key)));
  const colors = Object.values(COLORS).filter((color) => colorKeys.has(db.slugify(color.name)));
  const weaves = Object.entries(WEAVES).filter(([key]) => products.some((product) => product.weaveKey === key));
  const hasSets = products.some((product) => product.isSet);

  const categoryGroup = showCategory
    ? `
          <fieldset class="filter">
            <legend class="filter__legend">Category</legend>
            <div class="filter__options">${CATEGORIES.map(
              (category) => `
              <label class="chip"><input type="checkbox"${check('category', category.slug, filters.category)}><span>${escapeHtml(category.name)}</span></label>`
            ).join('')}
            </div>
          </fieldset>`
    : '';

  return `
      <form class="filters" data-filters action="" method="get" aria-label="Filter and sort">
        <button class="filters__toggle" type="button" data-filters-toggle aria-expanded="false" aria-controls="filter-panel">Filter and sort</button>
        <div class="filters__panel" id="filter-panel" data-filters-panel>${categoryGroup}
          <fieldset class="filter">
            <legend class="filter__legend">Color</legend>
            <div class="filter__options filter__options--swatches">${colors
              .map((color) => {
                const key = db.slugify(color.name);
                return `
              <label class="swatch-check" title="${escapeHtml(color.name)}"><input type="checkbox"${check('color', key, filters.color)}><span class="swatch swatch--large" style="${markup.swatchStyle(color)}"></span><span class="visually-hidden">${escapeHtml(color.name)}</span></label>`;
              })
              .join('')}
            </div>
          </fieldset>
          <fieldset class="filter">
            <legend class="filter__legend">Weave</legend>
            <div class="filter__options">${weaves
              .map(([key, weave]) => `
              <label class="chip"><input type="checkbox"${check('weave', key, filters.weave)}><span>${escapeHtml(weave.filter)}</span></label>`)
              .join('')}${hasSets ? `
              <label class="chip"><input type="checkbox"${check('weave', 'set', filters.weave)}><span>Sets</span></label>` : ''}
            </div>
          </fieldset>
          <fieldset class="filter">
            <legend class="filter__legend">Price</legend>
            <div class="filter__options">${PRICE_BANDS.map(
              (band) => `
              <label class="chip"><input type="checkbox"${check('price', band.key, filters.price)}><span>${escapeHtml(band.label)}</span></label>`
            ).join('')}
            </div>
          </fieldset>
          <div class="filters__actions">
            <button class="btn btn--dark filters__apply" type="submit">Show results</button>
            <a class="link-button" href="?" data-filters-clear>Clear all</a>
          </div>
        </div>
        <div class="filters__bar">
          <p class="filters__count" role="status" data-filters-count></p>
          <label class="sort">
            <span class="sort__label">Sort</span>
            <select name="sort" data-sort>${SORTS.map(([key, label]) => `<option value="${key}"${filters.sort === key ? ' selected' : ''}>${label}</option>`).join('')}</select>
          </label>
        </div>
      </form>`;
}

function countLabel(count) {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`;
}

function breadcrumbNav(trail) {
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${trail
    .map(([name, url], index) =>
      index === trail.length - 1
        ? `<span aria-current="page">${escapeHtml(name)}</span>`
        : `<a href="${url}">${escapeHtml(name)}</a><span aria-hidden="true">/</span>`
    )
    .join('')}</nav>`;
}

function editorialImage(image, sizes, options = {}) {
  return imageTag(image, { widths: [480, 750, 1080, 1600], sizes, ...options });
}

function signupSection(source) {
  return render('partials/signup', { welcomePercent: config.offers.welcome.percent, source });
}

function categoryNav(current) {
  const links = [
    { href: '/shop', name: 'All', slug: 'all' },
    ...CATEGORIES.map((category) => ({ href: markup.categoryHref(category), name: category.name, slug: category.slug })),
    { href: '/beach-and-pool', name: 'Beach & Pool', slug: 'beach' },
  ];
  return `
      <nav class="cat-nav" aria-label="Categories">
        <ul class="cat-nav__list">${links
          .map((link) => `<li><a href="${link.href}"${link.slug === current ? ' aria-current="page"' : ''}>${escapeHtml(link.name)}</a></li>`)
          .join('')}
        </ul>
      </nav>`;
}

// App

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

app.use(express.static(PUBLIC_DIR, { index: false, maxAge: IS_PRODUCTION ? '1d' : 0 }));

// Before the first request, the database is brought up to date: a fresh database, or one
// seeded from an older catalog, is loaded from catalog.js (stock levels and orders are
// kept). Every request then has current stock. If the database cannot be reached, pages
// still render from catalog.js and anything that needs the database reports an error.
const { seed, CATALOG_VERSION } = require('./seed');

let booted = null;
function boot() {
  booted ??= (async () => {
    if ((await db.countProducts()) === 0 || (await db.catalogVersion()) < CATALOG_VERSION) await seed();
  })().catch((error) => {
    booted = null;
    throw error;
  });
  return booted;
}

app.use(async (req, res, next) => {
  try {
    await boot();
    await store.refreshStock();
  } catch (error) {
    console.error(`The database (${db.NAME}) could not be read: ${error.message}`);
  }
  next();
});

// Stripe signs the exact bytes it sends, so this route needs the raw body. It is
// registered with its own parser and no other route reads the body before it.
app.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set, so webhooks are being refused.');
    return res.status(503).json({ error: 'Webhook signing secret is not configured.' });
  }

  let event;
  try {
    event = checkout.Stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), secret);
  } catch {
    return res.status(400).json({ error: 'Signature verification failed.' });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = await checkout.retrieveSession(event.data.object.id);
    await checkout.fulfilOrder(session);
  }
  res.json({ received: true });
});

const formParsers = (limit) => [express.json({ limit }), express.urlencoded({ extended: false, limit })];

// Pages

app.get('/', (req, res) => {
  const products = store.listProducts();
  const inCategory = (slug) => products.filter((product) => product.category === slug);
  const allReviews = reviews.all();
  const campaign = config.campaign;

  res.type('html').send(
    render(
      'index',
      pageData('home', {
        title: 'Pamuq | Luxury Turkish Towels, Woven from Aegean Cotton',
        description: `Turkish cotton bath towels, bath sheets, peshtemals and gift sets, woven from long staple Aegean cotton. Free US shipping over ${formatPrice(config.shipping.freeThreshold)}.`,
        urlPath: '/',
        products,
        jsonLd: markup.jsonLd(seo.organization()),
        heroImage: pictureTag(SITE_IMAGES.hero, { className: 'hero__image', eager: true }),
        campaign: campaignLive()
          ? `
    <section class="campaign" aria-labelledby="campaign-title">
      <div class="container campaign__inner">
        <p class="eyebrow eyebrow--dark">${escapeHtml(campaign.eyebrow)}</p>
        <h2 class="campaign__title" id="campaign-title">${escapeHtml(campaign.title)}</h2>
        <p class="campaign__text">${escapeHtml(campaign.text)}${orderByLine() ? ` <strong>${escapeHtml(orderByLine())}.</strong>` : ''}</p>
        <a class="btn btn--dark" href="${escapeHtml(campaign.link.href)}">${escapeHtml(campaign.link.label)}</a>
      </div>
    </section>`
          : '',
        categoryTiles: CATEGORIES.map((category, index) => markup.categoryTile(category, inCategory(category.slug), index)).join(''),
        bestsellers: featuredItems(products).map((product, position) => markup.productCard(product, { position })).join(''),
        featuredSets: featuredSets(products).map((product, position) => markup.productCard(product, { position })).join(''),
        whyImage: editorialImage(SITE_IMAGES.why, '(max-width: 900px) 100vw, 45vw'),
        whyDetail: editorialImage(SITE_IMAGES.whyDetail, '(max-width: 900px) 45vw, 20vw'),
        bodrumImage: editorialImage(SITE_IMAGES.bodrum, '(max-width: 900px) 100vw, 50vw'),
        cottonImage: editorialImage(SITE_IMAGES.cotton, '(max-width: 900px) 100vw, 50vw'),
        cottonDetail: editorialImage(SITE_IMAGES.cottonDetail, '(max-width: 900px) 45vw, 22vw'),
        workshopImage: editorialImage(SITE_IMAGES.workshop, '(max-width: 900px) 100vw, 40vw'),
        // Shown only once there are at least three real reviews.
        testimonials:
          allReviews.length >= 3
            ? `
    <section class="section testimonials" aria-labelledby="testimonials-title">
      <div class="container">
        <h2 class="section-title" id="testimonials-title">What people say</h2>
        <ul class="testimonials__list">${allReviews
          .slice(-3)
          .reverse()
          .map(
            (review) => `
          <li class="testimonial">${markup.stars(review.rating)}<blockquote><p>${escapeHtml(review.body)}</p></blockquote><p class="testimonial__by">${escapeHtml(review.authorFirstName)} ${escapeHtml(review.authorLastInitial || '')}${review.location ? `, ${escapeHtml(review.location)}` : ''}</p></li>`
          )
          .join('')}
        </ul>
      </div>
    </section>`
            : '',
        signup: signupSection('homepage'),
      })
    )
  );
});

// The old collection page lives on as the shop.
app.get('/collection', (req, res) => res.redirect(301, '/shop'));

function renderShop(req, res, { category = null } = {}) {
  const all = store.listProducts();
  const pool = category ? all.filter((product) => product.category === category.slug) : all;
  const filters = readFilters(req.query);
  if (category) filters.category = [];
  const shown = applyFilters(pool, filters);
  const urlPath = category ? `/shop/${category.slug}` : '/shop';
  const trail = category ? [['Home', '/'], ['Shop', '/shop'], [category.name, urlPath]] : [['Home', '/'], ['Shop', '/shop']];
  const sets = all.filter((product) => product.isSet);
  const setsCategory = markup.CATEGORY_BY_SLUG.get('towel-sets');

  res.type('html').send(
    render(
      'shop',
      pageData('shop', {
        title: category ? `Turkish Cotton ${category.name} | Pamuq` : 'Shop Turkish Towels | Pamuq',
        description: category ? category.intro : `Shop Turkish cotton bath towels, hand towels, washcloths, guest towels, bath sheets and gift sets. Free US shipping over ${formatPrice(config.shipping.freeThreshold)}.`,
        urlPath,
        products: all,
        ogImage: category ? category.image : SITE_IMAGES.hero,
        scripts: '<script src="/js/shop.js" defer></script>',
        jsonLd: markup.jsonLd(seo.breadcrumbs(trail)),
        breadcrumb: breadcrumbNav(trail),
        eyebrow: category ? `${category.size ? sizeShort(category.size) : 'Curated sets'} · ${markup.fromPrice(pool)}` : 'The collection',
        heading: category ? `Turkish Cotton ${category.name}` : 'Turkish towels worth reaching for',
        intro: category
          ? category.intro
          : `Four weaves, eight colorways and every size a bathroom needs, woven from long staple Aegean cotton in ${config.brand.madeIn} and finished by hand.`,
        categoryNav: categoryNav(category ? category.slug : 'all'),
        filters: filterBar(pool, filters, { showCategory: !category }),
        count: countLabel(shown.length),
        // Every card is on the page, in the chosen order, with the ones that do not match
        // hidden, so that shop.js can widen the filters again without a page load.
        grid: `<ul class="grid" data-grid>${[...shown, ...pool.filter((product) => !shown.includes(product))]
          .map((product) => markup.productCard(product, { position: pool.indexOf(product), hidden: !shown.includes(product) }))
          .join('')}
        </ul>`,
        empty: shown.length === 0 ? '' : ' hidden',
        setsBanner: category
          ? ''
          : `
      <aside class="sets-banner" aria-labelledby="sets-banner-title">
        <div class="sets-banner__media media">${editorialImage(setsCategory.image, '(max-width: 768px) 100vw, 50vw')}</div>
        <div class="sets-banner__body">
          <p class="eyebrow eyebrow--dark">Curated sets</p>
          <h2 class="sets-banner__title" id="sets-banner-title">Composed to be together</h2>
          <p class="sets-banner__text">${sets.length} sets, each sold only as a whole and presented in a cotton gift bag, for about 10% less than the pieces alone.</p>
          <a class="btn btn--dark" href="/sets">Explore the sets</a>
        </div>
      </aside>`,
      })
    )
  );
}

app.get('/shop', (req, res) => renderShop(req, res));

app.get('/shop/:category', (req, res, next) => {
  const category = markup.CATEGORY_BY_SLUG.get(req.params.category);
  if (!category) return next();
  if (category.slug === 'towel-sets') return res.redirect(301, '/sets');
  renderShop(req, res, { category });
});

app.get('/sets', (req, res) => {
  const products = store.listProducts();
  const sets = products.filter((product) => product.isSet);
  const trail = [['Home', '/'], ['Sets', '/sets']];
  res.type('html').send(
    render(
      'sets',
      pageData('sets', {
        title: 'Turkish Towel Gift Sets | Pamuq',
        description: 'Curated sets of Turkish cotton towels, composed to work together, presented in a cotton gift bag and sold only as a complete set.',
        urlPath: '/sets',
        products,
        ogImage: SITE_IMAGES.sets,
        jsonLd: markup.jsonLd(seo.breadcrumbs(trail)),
        categoryNav: categoryNav('towel-sets'),
        setsImage: pictureTag(SITE_IMAGES.sets, { className: 'sets-hero__image', eager: true }),
        sets: sets.map(markup.setFeature).join(''),
      })
    )
  );
});

app.get('/beach-and-pool', (req, res) => {
  const products = store.listProducts();
  const beach = products.filter((product) => product.beach);
  const trail = [['Home', '/'], ['Beach & Pool', '/beach-and-pool']];
  res.type('html').send(
    render(
      'beach',
      pageData('beach', {
        title: 'Turkish Beach Towels and Peshtemals | Pamuq',
        description: `Turkish beach towels and peshtemals from the beaches of Bodrum. Quick drying, light, and sand shakes straight off. Free US shipping over ${formatPrice(config.shipping.freeThreshold)}.`,
        urlPath: '/beach-and-pool',
        products,
        ogImage: SITE_IMAGES.beach,
        jsonLd: markup.jsonLd(seo.breadcrumbs(trail)),
        breadcrumb: breadcrumbNav(trail),
        heroImage: pictureTag(SITE_IMAGES.beach, { className: 'collection-hero__image', eager: true }),
        detailImage: editorialImage(SITE_IMAGES.beachDetail, '(max-width: 900px) 100vw, 45vw'),
        categoryNav: categoryNav('beach'),
        grid: markup.productGrid(beach),
        count: countLabel(beach.length),
      })
    )
  );
});

app.get('/gifts', (req, res) => {
  const products = store.listProducts();
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const items = products.filter((product) => !product.isSet);
  const sections = [
    { id: 'sets', title: 'Curated sets', note: 'Every set arrives in a cotton gift bag.', list: products.filter((product) => product.isSet) },
    { id: 'under-30', title: `Under ${formatPrice(3000)}`, note: 'Small luxuries, easy to give.', list: items.filter((product) => product.price < 3000) },
    { id: 'under-100', title: `Under ${formatPrice(10000)}`, note: 'The towels people remember.', list: products.filter((product) => product.price >= 3000 && product.price < 10000) },
    {
      id: 'the-full-bathroom',
      title: 'The full bathroom',
      note: 'For a new home, done properly.',
      list: ['the-full-bathroom-set', 'the-couples-set', 'ege-bath-sheet', 'assos-rib-bath-sheet'].map((slug) => bySlug.get(slug)).filter(Boolean),
    },
  ];
  const occasions = OCCASIONS.map(
    (occasion) => `
        <section class="occasion" id="${occasion.slug}" aria-labelledby="${occasion.slug}-title">
          <header class="occasion__head">
            <h3 class="occasion__title" id="${occasion.slug}-title">${escapeHtml(occasion.name)}</h3>
            <p class="occasion__note">${escapeHtml(occasion.note)}</p>
          </header>
          ${markup.productGrid(occasion.products.map((slug) => bySlug.get(slug)).filter(Boolean), { className: 'grid grid--three' })}
        </section>`
  ).join('');

  res.type('html').send(
    render(
      'gifts',
      pageData('gifts', {
        title: 'Turkish Towel Gifts | Pamuq',
        description: 'Gifts of Turkish cotton towels: curated sets in a cotton gift bag, gifts under $30 and under $100, and ideas for weddings, housewarmings and the holidays.',
        urlPath: '/gifts',
        products,
        ogImage: SITE_IMAGES.gifts,
        heroImage: pictureTag(SITE_IMAGES.gifts, { className: 'collection-hero__image', eager: true }),
        jumpLinks: [...sections.map((section) => [section.id, section.title]), ...OCCASIONS.map((occasion) => [occasion.slug, occasion.name])]
          .map(([id, title]) => `<li><a href="#${id}">${escapeHtml(title)}</a></li>`)
          .join(''),
        sections: sections
          .map(
            (section) => `
      <section class="gift-section" id="${section.id}" aria-labelledby="${section.id}-title">
        <header class="section-head">
          <div>
            <h2 class="section-title" id="${section.id}-title">${escapeHtml(section.title)}</h2>
            <p class="section-lead">${escapeHtml(section.note)}</p>
          </div>
        </header>
        ${markup.productGrid(section.list, { className: 'grid grid--four' })}
      </section>`
          )
          .join(''),
        occasions,
        orderBy: orderByLine() ? `<p class="notice">${escapeHtml(orderByLine())}.</p>` : '',
      })
    )
  );
});

function galleryMarkup(images) {
  const thumbs = images
    .map(
      (image, index) => `
              <li>
                <button class="thumb media media--portrait${index === 0 ? ' is-active' : ''}" type="button" data-thumb="${index}" aria-label="Show picture ${index + 1} of ${images.length}"${index === 0 ? ' aria-current="true"' : ''}>
                  ${imageTag(image, { widths: [160, 320], sizes: '(max-width: 768px) 22vw, 10vw' })}
                </button>
              </li>`
    )
    .join('');
  return {
    thumbs,
    main: imageTag(images[0], { widths: [480, 750, 1080, 1600], sizes: '(max-width: 768px) 100vw, 55vw', eager: true, className: 'gallery__image', attrs: 'data-gallery-image' }),
  };
}

// The pictures a color shows, ready for product.js to swap in without a page load.
function galleryData(images) {
  return images.map((image) => ({
    alt: image.alt,
    src: imageUrl(image.src, 750),
    srcset: [480, 750, 1080, 1600].map((width) => `${imageUrl(image.src, width)} ${width}w`).join(', '),
    thumb: imageUrl(image.src, 320),
    large: imageUrl(image.src, 2400),
  }));
}

function colorOption(product, variant, selected) {
  const soldOut = variant.stock < 1;
  const images = store.imagesFor(product, variant);
  return `
              <label class="color-option${soldOut ? ' is-soldout' : ''}" title="${escapeHtml(variant.color)}">
                <input type="radio" name="color" value="${escapeHtml(variant.sku)}"
                  data-color="${escapeHtml(variant.color)}" data-key="${escapeHtml(variant.key)}" data-stock="${variant.stock}"
                  data-swatch="${escapeHtml(variant.swatch[0])}" data-cart-image="${escapeHtml(imageUrl(images[0].src, 320))}"
                  data-images="${escapeHtml(JSON.stringify(galleryData(images)))}"${variant.sku === selected.sku ? ' checked' : ''}>
                <span class="swatch swatch--large" style="${markup.swatchStyle(variant)}"></span>
                <span class="color-option__name" aria-hidden="true">${escapeHtml(variant.color)}</span>
                <span class="visually-hidden">${escapeHtml(variant.color)}${soldOut ? ' (sold out)' : ''}</span>
              </label>`;
}

function reviewsSection(product, list) {
  const summary = product.rating;
  const form = render('partials/review-form', {
    slug: product.slug,
    name: product.name,
    colors: product.variants.map((variant) => `<option>${escapeHtml(variant.color)}</option>`).join(''),
  });
  if (!summary) {
    return `
        <div class="reviews__empty">
          <p class="reviews__empty-title">Be the first to tell us how it feels.</p>
          <button class="btn btn--outline" type="button" data-review-toggle aria-expanded="false" aria-controls="review-form">Write a review</button>
        </div>
        ${form}`;
  }
  const bars = [5, 4, 3, 2, 1]
    .map((stars) => {
      const count = summary.breakdown[stars];
      const percent = Math.round((count / summary.count) * 100);
      return `<li><span>${stars} star</span><span class="bar" aria-hidden="true"><span style="width:${percent}%"></span></span><span>${count}</span></li>`;
    })
    .join('');
  const items = list
    .map(
      (review) => `
          <li class="review" data-review data-rating="${review.rating}" data-date="${escapeHtml(review.date || '')}">
            ${markup.stars(review.rating)}
            ${review.title ? `<h3 class="review__title">${escapeHtml(review.title)}</h3>` : ''}
            <p class="review__body">${escapeHtml(review.body)}</p>
            ${(review.photos || []).length ? `<ul class="review__photos">${review.photos.map((photo) => `<li>${imageTag({ src: photo, alt: `Photo from ${review.authorFirstName}` }, { widths: [160, 320], sizes: '120px' })}</li>`).join('')}</ul>` : ''}
            <p class="review__meta">${escapeHtml(review.authorFirstName)} ${escapeHtml(review.authorLastInitial || '')}${review.location ? `, ${escapeHtml(review.location)}` : ''}${review.colorPurchased ? ` · ${escapeHtml(review.colorPurchased)}` : ''}${review.date ? ` · ${escapeHtml(formatDate(new Date(`${review.date}T00:00:00Z`)))}` : ''}${review.verifiedPurchase ? ' · <span class="review__verified">Verified buyer</span>' : ''}</p>
          </li>`
    )
    .join('');
  return `
        <div class="reviews__summary">
          <p class="reviews__average">${summary.average}</p>
          ${markup.stars(summary.average)}
          <p class="reviews__count">${summary.count} ${summary.count === 1 ? 'review' : 'reviews'}</p>
          <ul class="reviews__bars">${bars}</ul>
          <button class="btn btn--outline" type="button" data-review-toggle aria-expanded="false" aria-controls="review-form">Write a review</button>
        </div>
        ${form}
        <div class="reviews__list">
          <label class="sort"><span class="sort__label">Sort</span><select data-review-sort><option value="newest">Newest</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option></select></label>
          <ul data-review-list>${items}</ul>
          <button class="btn btn--outline" type="button" data-review-more hidden>Load more reviews</button>
        </div>`;
}

app.get('/product/:slug', (req, res, next) => {
  const product = store.getProduct(req.params.slug);
  if (!product || product.variants.length === 0) return next();

  const products = store.listProducts();
  const category = markup.CATEGORY_BY_SLUG.get(product.category);
  const requested = typeof req.query.color === 'string' ? product.variants.find((variant) => variant.key === req.query.color) : null;
  const selected = requested || markup.leadVariant(product);
  const images = store.imagesFor(product, selected);
  const gallery = galleryMarkup(images);
  const urlPath = `/product/${product.slug}`;
  const trail = [['Home', '/'], [category.name, markup.categoryHref(category)], [product.name, urlPath]];
  const productReviews = reviews.forProduct(product.slug);
  const estimate = shipping.estimate();

  const makeItASet = setsContaining(products, product.slug)
    .map((set) => {
      const saving = markup.piecesValue(set) - set.price;
      return `
          <a class="set-offer" href="/product/${escapeHtml(set.slug)}">
            <span class="set-offer__media media">${imageTag(set.images[0], { widths: [160, 320], sizes: '72px' })}</span>
            <span class="set-offer__body">
              <span class="set-offer__name">${escapeHtml(set.name)}</span>
              <span class="set-offer__text">${escapeHtml(set.summary)}</span>
              <span class="set-offer__price">${formatPrice(set.price)}${saving > 0 ? ` · you save ${formatPrice(saving)} on the pieces` : ''}</span>
            </span>
          </a>`;
    })
    .join('');

  const details = product.isSet
    ? [
        ['Pieces', `${markup.pieceCount(product)} pieces`],
        ['Fiber', config.brand.fiberContent],
        ['Origin', `Made in ${config.brand.madeInCountry}`],
        ['Presentation', 'Cotton gift bag'],
      ]
    : [
        ['Size', sizeLabel(product.size)],
        ['Fiber', config.brand.fiberContent],
        ['Weave', product.weave],
        ['Weight', `${product.gsm} gsm, ${product.weightNote}`],
        ['Origin', `Made in ${config.brand.madeInCountry}`],
      ];

  res.type('html').send(
    render(
      'product',
      pageData('product', {
        title: product.isSet ? `${product.name} | Turkish Cotton Towel Set | Pamuq` : `${product.name} | Turkish Cotton ${category.singular} | Pamuq`,
        description: `${product.summary} ${config.brand.fiberContent}, made in ${config.brand.madeInCountry}. ${formatPrice(product.price)}.`,
        urlPath,
        products,
        ogType: 'product',
        ogImage: images[0],
        scripts: '<script src="/js/product.js" defer></script>',
        jsonLd:
          markup.jsonLd(seo.product({ ...product, reviews: productReviews }, { variant: selected, images, url: urlPath })) +
          markup.jsonLd(seo.breadcrumbs(trail)),
        breadcrumb: breadcrumbNav(trail),
        slug: product.slug,
        name: product.name,
        priceValue: product.price,
        priceMarkup: markup.priceMarkup(product, 'pdp-price'),
        payLater: markup.payLaterNote(product.price),
        rating: product.rating
          ? `<a class="pdp__rating" href="#reviews">${markup.stars(product.rating.average)}<span>${product.rating.average} · ${product.rating.count} ${product.rating.count === 1 ? 'review' : 'reviews'}</span><span class="visually-hidden">, read reviews</span></a>`
          : '',
        collection: product.collection,
        summary: product.summary,
        productDescription: product.description,
        fiberLine: `${config.brand.fiberContent}. Made in ${config.brand.madeInCountry}.`,
        details: details.map(([term, detail]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(detail)}</dd></div>`).join(''),
        setContents: product.isSet
          ? `
        <div class="pdp__set">
          <p class="set-badge">Curated set · sold only together</p>
          <h2 class="label">What is inside</h2>
          ${markup.contentsList(product)}
        </div>`
          : '',
        selectedColor: selected.color,
        selectedKey: selected.key,
        selectedSwatch: markup.swatchStyle(selected),
        toneStyle: markup.toneStyle(selected),
        mainImage: gallery.main,
        thumbs: gallery.thumbs,
        colorOptions: product.variants.map((variant) => colorOption(product, variant, selected)).join(''),
        addLabel: selected.stock < 1 ? 'Sold out' : product.isSet ? 'Add set to cart' : 'Add to cart',
        addReady: product.isSet ? 'Add set to cart' : 'Add to cart',
        addDisabled: selected.stock < 1 ? ' disabled' : '',
        trustRow: markup.trustRow(),
        makeItASet: makeItASet ? `<div class="make-set"><p class="label">Make it a set</p>${makeItASet}</div>` : '',
        delivery: `Woven to order. Ships in ${estimate.shipsLabel}. Arrives between ${estimate.arrivesLabel}.`,
        feel: product.feel,
        sizeGuide: markup.sizeGuideDiagram(),
        sizeTable: CATEGORIES.filter((entry) => entry.size)
          .map((entry) => `<div><dt>${escapeHtml(entry.singular)}</dt><dd>${escapeHtml(sizeLabel(entry.size))}</dd></div>`)
          .join(''),
        reviews: reviewsSection(product, productReviews),
        related: pairsWellWith(products, product).map((other, position) => markup.productCard(other, { position })).join(''),
      })
    )
  );
});

app.get('/cart', (req, res) => {
  res.set('Cache-Control', 'no-store').type('html').send(
    render(
      'cart',
      pageData('cart', {
        title: 'Your cart | Pamuq',
        description: 'Review the towels in your cart.',
        urlPath: '/cart',
        noindex: true,
        popup: false,
        products: store.listProducts(),
        trustRow: markup.trustRow({ compact: true }),
        // Stripe asks for Stripe.js on the pages leading to Checkout so that it can
        // spot fraud. The payment itself is a redirect to Stripe's hosted page.
        scripts: '<script src="https://js.stripe.com/v3/" async></script>',
      })
    )
  );
});

// The cart page posts the cart here. Only ids and quantities are read from it: the
// session is built from database prices. Browsers that submit a plain form are
// redirected straight to Stripe, while the cart page's own fetch asks for JSON.
app.post('/checkout', ...formParsers('20kb'), async (req, res) => {
  const priced = await checkout.priceCart(checkout.readCart(req.body));
  const session = await checkout.createCheckoutSession(priced, checkout.readGift(req.body));
  if (!session.url) throw new HttpError(502, 'Stripe did not return a checkout address.');

  if ((req.get('accept') || '').includes('application/json')) return res.json({ url: session.url });
  res.redirect(303, session.url);
});

function orderDetails(order) {
  const rows = order.items
    .map(
      (item) => `
          <li class="summary__row">
            <span>
              <span class="summary__name">${escapeHtml(item.name)}</span>
              <span class="summary__meta">${escapeHtml(item.color ? `${item.color}, ` : '')}quantity ${item.quantity}</span>
            </span>
            <span class="summary__amount">${formatPrice(item.lineTotal)}</span>
          </li>`
    )
    .join('');

  const emailNote = order.emailedAt
    ? `Your order confirmation has been sent to ${escapeHtml(order.email)}.`
    : `We will send your order confirmation to ${escapeHtml(order.email)}.`;

  return `
        <p class="label">Order number</p>
        <p class="confirmation__number">${escapeHtml(order.orderNumber)}</p>
        <ul class="summary" aria-label="Order summary">${rows}
          <li class="summary__row summary__row--quiet">
            <span>Shipping</span>
            <span class="summary__amount">${order.shipping === 0 ? 'Free' : formatPrice(order.shipping)}</span>
          </li>
          <li class="summary__row summary__row--total">
            <span>Total</span>
            <span class="summary__amount">${formatPrice(order.total)}</span>
          </li>
        </ul>
        ${order.gift ? `<p class="confirmation__gift">Gift message: “${escapeHtml(order.gift.message)}”${order.gift.hidePrices ? ' Prices are left off the packing slip.' : ''}</p>` : ''}
        <p class="confirmation__email">${emailNote}</p>`;
}

async function orderPage(req, res) {
  res.set('Cache-Control', 'no-store');

  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  const confirmation = (status, details) =>
    res.status(status).type('html').send(
      render(
        'order-confirmed',
        pageData('order', {
          title: 'Order confirmed | Pamuq',
          description: 'Your Pamuq order.',
          urlPath: '/order/success',
          noindex: true,
          popup: false,
          products: store.listProducts(),
          paid: 'false',
          details: '',
          ...details,
        })
      )
    );

  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return confirmation(400, {
      heading: 'We could not find that order.',
      lead: 'The link may be incomplete. If you have just paid, your confirmation email will arrive shortly.',
    });
  }

  let session;
  try {
    session = await checkout.retrieveSession(sessionId);
  } catch (error) {
    if (error.code === 'resource_missing') {
      return confirmation(404, { heading: 'We could not find that order.', lead: 'Please check the link in your confirmation email.' });
    }
    throw error;
  }

  if (!checkout.isOurSession(session)) {
    return confirmation(404, { heading: 'We could not find that order.', lead: 'Please check the link in your confirmation email.' });
  }

  if (session.payment_status !== 'paid') {
    return confirmation(409, {
      heading: 'Your payment has not completed.',
      lead: 'Nothing has been charged yet. You can return to your cart and try again.',
    });
  }

  const order = await checkout.fulfilOrder(session);
  const name = firstName(order.name);
  const placed = order.createdAt ? new Date(`${order.createdAt.slice(0, 10)}T00:00:00Z`) : shipping.today();
  const window = shipping.estimate(placed);
  const shipsBy = shipping.addBusinessDays(placed, config.shipping.makeDays.max);

  confirmation(200, {
    paid: 'true',
    heading: name ? `Thank you, ${name}.` : 'Thank you.',
    lead: `Your towels are being woven. They ship by ${formatDate(shipsBy)} and should arrive between ${window.arrivesLabel}.`,
    details: orderDetails(order),
  });
}

app.get('/order/success', orderPage);
// Stripe sessions created before the move to /order/success still return here.
app.get('/order-confirmed', orderPage);

// Content pages

app.get('/about', (req, res) => {
  res.type('html').send(
    render(
      'about',
      pageData('about', {
        title: 'Our Story | Pamuq Turkish Towels',
        description: `Pamuq began on the Aegean coast of Turkey. Inspired by Bodrum, woven in ${config.brand.madeIn} from long staple Aegean cotton.`,
        urlPath: '/about',
        products: store.listProducts(),
        ogImage: SITE_IMAGES.bodrum,
        bodrumImage: editorialImage(SITE_IMAGES.bodrum, '(max-width: 900px) 100vw, 50vw'),
        workshopImage: editorialImage(SITE_IMAGES.workshopWide, '(max-width: 900px) 100vw, 50vw'),
        cottonImage: editorialImage(SITE_IMAGES.cotton, '(max-width: 900px) 100vw, 40vw'),
      })
    )
  );
});

app.get('/contact', (req, res) => {
  res.type('html').send(
    render(
      'contact',
      pageData('contact', {
        title: 'Contact Us | Pamuq',
        description: 'Questions about an order, a towel or a gift? Write to us. We reply within one business day.',
        urlPath: '/contact',
        products: store.listProducts(),
        supportEmail: config.support.email
          ? `<p class="contact__line">Email <a href="mailto:${escapeHtml(config.support.email)}">${escapeHtml(config.support.email)}</a></p>`
          : '',
        responseTime: config.support.responseTime,
        address: config.company.address ? `<p class="contact__line">${escapeHtml(config.company.address)}</p>` : '',
      })
    )
  );
});

app.get('/faq', (req, res) => {
  const groups = FAQ.map(
    (group) => `
      <section class="faq-group" id="${group.id}" aria-labelledby="${group.id}-title">
        <h2 class="faq-group__title" id="${group.id}-title">${escapeHtml(group.title)}</h2>
        <div class="accordion" data-accordion>${group.questions
          .map(
            (entry, index) => `
          <div class="accordion__item">
            <h3 class="accordion__heading">
              <button class="accordion__trigger" type="button" id="${group.id}-${index}-trigger" aria-expanded="false" aria-controls="${group.id}-${index}-panel" data-accordion-trigger>
                <span>${escapeHtml(entry.q)}</span>
                <span class="accordion__icon" aria-hidden="true"></span>
              </button>
            </h3>
            <div class="accordion__panel" id="${group.id}-${index}-panel" role="region" aria-labelledby="${group.id}-${index}-trigger">
              <div class="accordion__inner"><p>${escapeHtml(entry.text)}</p></div>
            </div>
          </div>`
          )
          .join('')}
        </div>
      </section>`
  ).join('');

  res.type('html').send(
    render(
      'faq',
      pageData('faq', {
        title: 'Turkish Towel FAQ | Pamuq',
        description: 'Answers about Turkish cotton, towel weights and sizes in inches, care, US shipping, duties, returns and gifts.',
        urlPath: '/faq',
        products: store.listProducts(),
        jsonLd: markup.jsonLd(seo.faqPage(FAQ)),
        jumpLinks: FAQ.map((group) => `<li><a href="#${group.id}">${escapeHtml(group.title)}</a></li>`).join(''),
        groups,
      })
    )
  );
});

const POLICIES = {
  shipping: { title: 'Shipping Policy', description: 'How and when Pamuq towels ship to the US, what shipping costs and what to expect at delivery.' },
  returns: { title: 'Returns & Refunds', description: `Returns within ${config.returns.days} days, unwashed and in the original packaging.` },
  privacy: { title: 'Privacy Policy', description: 'What personal information Pamuq collects, how it is used, and your choices, including for California residents.' },
  terms: { title: 'Terms of Service', description: 'The terms that apply when you use the Pamuq website and buy from us.' },
  accessibility: { title: 'Accessibility Statement', description: 'Our commitment to making the Pamuq website usable for everyone.' },
};

const POLICY_UPDATED = new Date(Date.UTC(2026, 9, 15));

for (const [slug, meta] of Object.entries(POLICIES)) {
  app.get(`/${slug}`, (req, res) => {
    const estimate = shipping.estimate();
    const shared = pageData('policy', { title: meta.title, description: meta.description, urlPath: `/${slug}` });
    res.type('html').send(
      render(
        'policy',
        pageData('policy', {
          title: `${meta.title} | Pamuq`,
          description: meta.description,
          urlPath: `/${slug}`,
          products: store.listProducts(),
          heading: meta.title,
          updated: formatDate(POLICY_UPDATED),
          body: render(`policies/${slug}`, {
            ...shared,
            supportEmailLink: config.support.email ? `<a href="mailto:${escapeHtml(config.support.email)}">${escapeHtml(config.support.email)}</a>` : '<a href="/contact">our contact page</a>',
            companyName: config.company.legalName || config.brand.name,
            companyAddress: config.company.address || 'Our mailing address is available on request.',
            makeMin: config.shipping.makeDays.min,
            makeMax: config.shipping.makeDays.max,
            transitMin: config.shipping.transitDays.min,
            transitMax: config.shipping.transitDays.max,
            arrivesExample: estimate.arrivesLabel,
            dutiesText: config.shipping.dutiesIncluded
              ? 'Every order ships Delivered Duty Paid. Duties and import fees are included in our prices and shipping, so there is nothing to pay at the door.'
              : 'We are moving to Delivered Duty Paid shipping, so that you never pay anything at the door. Until that is in place, US import duties may apply to your order, and we will tell you before you pay.',
          }),
        })
      )
    );
  });
}

// Forms

function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, '').trim().slice(0, max) : '';
}

function readEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  return email;
}

// Bots fill in every field, including the one hidden from people.
function isBot(body) {
  return Boolean(body && typeof body.company === 'string' && body.company.trim());
}

app.post('/newsletter', ...formParsers('2kb'), async (req, res) => {
  if (isBot(req.body)) return res.json({ ok: true, code: config.offers.welcome.code });
  const email = readEmail(req.body?.email);
  const source = ['footer', 'popup', 'homepage'].includes(req.body?.source) ? req.body.source : 'footer';
  const { isNew } = await subscribe(email, { source });
  res.json({
    ok: true,
    isNew,
    code: config.offers.welcome.code,
    message: isNew ? 'Welcome to Pamuq.' : 'You are already on our list.',
  });
});

app.post('/contact', ...formParsers('10kb'), async (req, res) => {
  if (isBot(req.body)) return res.json({ ok: true });
  const name = cleanText(req.body?.name, 120);
  const email = readEmail(req.body?.email);
  const orderNumber = cleanText(req.body?.order, 40);
  const message = cleanText(req.body?.message, 4000);
  if (!name) throw new HttpError(400, 'Please tell us your name.');
  if (message.length < 2) throw new HttpError(400, 'Please write your message.');

  const kept = await keep({ name, email, orderNumber: orderNumber || null, message }, db.addContactMessage, sendSupportMessage, 'Contact message');
  if (!kept) throw new HttpError(503, 'Our inbox is not connected yet, so we could not send your message. Please try again soon.');
  res.json({ ok: true });
});

// Stores a form submission and emails it to the support address, and says whether it
// reached the team. A contact message needs the email, because someone has to reply. A
// review only needs to be kept somewhere that lasts (not Vercel's temporary folder).
async function keep(data, save, send, label, { savedIsEnough = false } = {}) {
  let saved = false;
  try {
    await save(data);
    saved = db.DURABLE;
  } catch (error) {
    console.error(`${label} could not be saved: ${error.message}`);
  }
  try {
    if ((await send(data)).sent) return true;
    console.error(`${label} was not emailed: set RESEND_API_KEY and SUPPORT_EMAIL.`);
  } catch (error) {
    console.error(`${label} could not be emailed: ${error.message}`);
  }
  return savedIsEnough && saved;
}

// TODO: connect a review provider (Judge.me, Okendo, Yotpo or Stamped). Until then,
// submissions are stored in the database and emailed to the support address, for the team
// to check and publish to data/reviews.json.
app.post('/reviews', ...formParsers('10kb'), async (req, res) => {
  if (isBot(req.body)) return res.json({ ok: true });
  const productSlug = cleanText(req.body?.product, 80);
  if (!store.getProduct(productSlug)) throw new HttpError(400, 'That product could not be found.');
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Please choose a rating from 1 to 5 stars.');
  const title = cleanText(req.body?.title, 120);
  const body = cleanText(req.body?.body, 4000);
  const name = cleanText(req.body?.name, 80);
  if (!body) throw new HttpError(400, 'Please write your review.');
  if (!name) throw new HttpError(400, 'Please tell us your name.');
  const email = readEmail(req.body?.email);
  const review = {
    productSlug,
    productName: store.getProduct(productSlug).name,
    rating,
    title,
    body,
    name,
    email,
    location: cleanText(req.body?.location, 80) || null,
    color: cleanText(req.body?.color, 60) || null,
  };
  const kept = await keep(review, ({ productName, ...row }) => db.addReviewSubmission(row), sendReviewNotice, 'Review', { savedIsEnough: true });
  if (!kept) throw new HttpError(503, 'We could not send your review just now. Please try again soon.');
  res.json({ ok: true });
});

// Data for the scripts

// Fresh names, prices and pictures for the items in a cart, so that a cart saved before a
// price change, or holding something no longer sold, is put right when it is opened.
app.get('/api/cart', (req, res) => {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').slice(0, 40) : [];
  const products = store.listProducts();
  const items = {};
  for (const id of ids) {
    for (const product of products) {
      const variant = product.variants.find((entry) => entry.sku === id);
      if (!variant) continue;
      items[id] = {
        id,
        slug: product.slug,
        name: product.name,
        color: variant.color,
        price: product.price,
        stock: variant.stock,
        image: imageUrl(store.imagesFor(product, variant)[0].src, 320),
      };
    }
  }
  res.set('Cache-Control', 'no-store').json({ items });
});

// Search, the cart's suggestions and recently viewed all read this one list.
app.get('/catalog.json', (req, res) => {
  const products = store.listProducts();
  res.set('Cache-Control', 'public, max-age=300').json({
    products: products.map((product) => ({
      slug: product.slug,
      name: product.name,
      category: markup.CATEGORY_BY_SLUG.get(product.category).name,
      collection: product.collection,
      summary: product.summary,
      price: product.price,
      priceLabel: formatPrice(product.price),
      isSet: product.isSet,
      size: product.size ? sizeShort(product.size) : '',
      image: imageUrl(product.images[0].src, 320),
      colors: product.variants.map((variant) => ({
        sku: variant.sku,
        key: variant.key,
        name: variant.color,
        swatch: variant.swatch[0],
        stock: variant.stock,
        image: imageUrl(store.imagesFor(product, variant)[0].src, 320),
      })),
    })),
  });
});

// Search engines and shopping feeds

const STATIC_PATHS = ['/', '/shop', '/sets', '/beach-and-pool', '/gifts', '/about', '/contact', '/faq', ...Object.keys(POLICIES).map((slug) => `/${slug}`)];

app.get('/sitemap.xml', (req, res) => {
  const products = store.listProducts();
  const urls = [
    ...STATIC_PATHS,
    ...CATEGORIES.filter((category) => category.slug !== 'towel-sets').map((category) => `/shop/${category.slug}`),
    ...products.map((product) => `/product/${product.slug}`),
  ];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((url) => `  <url><loc>${escapeHtml(absoluteUrl(url))}</loc></url>`)
      .join('\n')}\n</urlset>\n`
  );
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

// A Google Merchant Center product feed. Every color is its own item, grouped by product.
app.get('/feeds/google.xml', (req, res) => {
  const products = store.listProducts();
  const money = (cents) => `${(cents / 100).toFixed(2)} ${config.currency.code}`;
  const items = products.flatMap((product) =>
    product.variants.map((variant) => {
      const images = store.imagesFor(product, variant);
      const category = markup.CATEGORY_BY_SLUG.get(product.category);
      return `
    <item>
      <g:id>${escapeHtml(variant.sku)}</g:id>
      <g:item_group_id>${escapeHtml(product.slug)}</g:item_group_id>
      <g:title>${escapeHtml(`${product.name}, ${variant.color}`)}</g:title>
      <g:description>${escapeHtml(`${product.description} ${config.brand.fiberContent}. Made in ${config.brand.madeInCountry}.`)}</g:description>
      <g:link>${escapeHtml(absoluteUrl(`/product/${product.slug}?color=${variant.key}`))}</g:link>
      <g:image_link>${escapeHtml(absoluteUrl(shareUrl(images[0].src, 1200)))}</g:image_link>${images
        .slice(1, 5)
        .map((image) => `\n      <g:additional_image_link>${escapeHtml(absoluteUrl(shareUrl(image.src, 1200)))}</g:additional_image_link>`)
        .join('')}
      <g:availability>${variant.stock > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>
      <g:price>${money(product.price)}</g:price>
      <g:brand>${escapeHtml(config.brand.name)}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:condition>new</g:condition>
      <g:color>${escapeHtml(variant.color)}</g:color>
      <g:material>${escapeHtml(config.brand.fiberContent)}</g:material>${product.size ? `\n      <g:size>${escapeHtml(sizeShort(product.size))}</g:size>` : ''}
      <g:product_type>${escapeHtml(`Home > Bath > ${category.name}`)}</g:product_type>
      <g:google_product_category>${escapeHtml('Home & Garden > Linens & Bedding > Towels')}</g:google_product_category>
      <g:shipping>
        <g:country>${config.shipping.country}</g:country>
        <g:price>${money(product.price >= config.shipping.freeThreshold ? 0 : config.shipping.flatRate)}</g:price>
      </g:shipping>
    </item>`;
    })
  );
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>${escapeHtml(config.brand.name)}</title>\n    <link>${escapeHtml(SITE_URL)}</link>\n    <description>Turkish cotton towels</description>${items.join('')}\n  </channel>\n</rss>\n`
  );
});

app.get('/site.webmanifest', (req, res) => {
  res.type('application/manifest+json').json({
    name: config.brand.name,
    short_name: config.brand.name,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: '#f6f1e9',
    background_color: '#f6f1e9',
    display: 'browser',
  });
});

// Errors

app.use((req, res) => {
  res.status(404).type('html').send(
    render(
      'error',
      pageData('error', {
        title: 'Page not found | Pamuq',
        description: 'This page could not be found.',
        noindex: true,
        products: store.listProducts(),
        heading: 'This page could not be found.',
        lead: 'It may have moved, or the link may be mistyped.',
      })
    )
  );
});

// Express 5 forwards errors thrown or rejected inside handlers to this function.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  const status = error.status >= 400 && error.status < 600 ? error.status : 500;
  if (status >= 500 && !(error instanceof HttpError)) console.error(error);

  let message = 'Something went wrong. Please try again.';
  if (error instanceof HttpError) message = error.message;
  else if (status < 500) message = 'That request could not be understood.';

  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(status).json({ error: message });

  res.status(status).type('html').send(
    render(
      'error',
      pageData('error', {
        title: 'Something went wrong | Pamuq',
        description: 'Something went wrong.',
        noindex: true,
        heading: 'Something went wrong.',
        lead: message,
      })
    )
  );
});

// Started with `node server.js` the app listens on a port. When api/index.js requires it
// on Vercel it is handed over as a function instead, and nothing listens.
if (require.main === module) {
  const server = app.listen(PORT, () => {
    process.stdout.write(`Pamuq is running at http://localhost:${PORT}\n`);
  });

  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Set PORT in .env to another number.` : error);
    process.exit(1);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => {
        db.close();
        process.exit(0);
      });
      server.closeIdleConnections();
      // Browsers keep connections open, so requests in flight get a few seconds and the
      // rest are cut.
      setTimeout(() => server.closeAllConnections(), 5000).unref();
    });
  }
}

module.exports = app;
