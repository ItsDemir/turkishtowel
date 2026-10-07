'use strict';

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const express = require('express');
const Stripe = require('stripe');

const db = require('./db');
const { CATEGORIES, SITE_IMAGES } = require('./catalogue');
const { sendOrderConfirmation } = require('./email');
const { escapeHtml, formatPrice, firstName } = require('./format');

const PORT = Number(process.env.PORT) || 3000;
// On Vercel a production deployment is reached at the project's own address, which is the
// one customers return to from Stripe. Other deployments use their own address. Set
// SITE_URL to override either, for example for a custom domain.
const VERCEL_HOST =
  process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_URL;
const DEFAULT_SITE_URL = VERCEL_HOST ? `https://${VERCEL_HOST}` : `http://localhost:${PORT}`;
const SITE_URL = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const CURRENCY = 'gbp';
const FREE_DELIVERY_THRESHOLD = 10000; // pence, shown as "Free delivery over £100"
const DELIVERY_FEE = 500; // pence, charged below the threshold
const MAX_LINE_QUANTITY = 10;
const MAX_CART_LINES = 20;
const STORE_TAG = 'pamuq';
const SHIPPING_COUNTRIES = [
  'GB', 'IE', 'FR', 'DE', 'NL', 'BE', 'LU', 'ES', 'PT', 'IT', 'AT', 'DK', 'SE', 'FI', 'NO',
  'CH', 'PL', 'CZ', 'GR', 'US', 'CA', 'AU', 'NZ',
];

const VIEWS_DIR = path.join(__dirname, 'views');
const PUBLIC_DIR = path.join(__dirname, 'public');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Templates
//
// Views are plain HTML files. {{> name}} pulls in views/partials/name.html,
// {{key}} inserts an HTML-escaped value and {{{key}}} inserts trusted markup.

const templateCache = new Map();

function readTemplate(name) {
  if (templateCache.has(name)) return templateCache.get(name);
  const source = fs.readFileSync(path.join(VIEWS_DIR, `${name}.html`), 'utf8');
  if (IS_PRODUCTION) templateCache.set(name, source);
  return source;
}

const TOKEN = /\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g;

function render(name, data = {}) {
  const source = readTemplate(name).replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, partial) =>
    readTemplate(`partials/${partial}`)
  );
  return source.replace(TOKEN, (_, rawKey, escapedKey) => {
    const value = data[rawKey || escapedKey];
    if (value === undefined || value === null) return '';
    return rawKey ? String(value) : escapeHtml(value);
  });
}

function absoluteUrl(url) {
  return url.startsWith('/') ? `${SITE_URL}${url}` : url;
}

// Values every page needs: the document head, the nav state and the delivery wording.
function pageData(page, { title, description, urlPath = '/', ogType = 'website', ogImage = SITE_IMAGES.hero.url, noindex = false, scripts = '', ...extra }) {
  return {
    page,
    title,
    description,
    canonicalUrl: `${SITE_URL}${urlPath}`,
    ogType,
    ogImage: absoluteUrl(sizedImage(ogImage, 1200)),
    robots: noindex ? '<meta name="robots" content="noindex">' : '',
    navShop: page === 'shop' ? ' aria-current="page"' : '',
    navSets: page === 'sets' ? ' aria-current="page"' : '',
    scripts,
    year: new Date().getFullYear(),
    freeDeliveryPence: FREE_DELIVERY_THRESHOLD,
    freeDeliveryLabel: formatPrice(FREE_DELIVERY_THRESHOLD),
    deliveryFeeLabel: formatPrice(DELIVERY_FEE),
    ...extra,
  };
}

// Image and swatch markup

const UNSPLASH = /^https:\/\/images\.unsplash\.com\//;
const PEXELS = /^https:\/\/images\.pexels\.com\//;
const HEX_COLOUR = /^#[0-9a-f]{3,8}$/i;

// Unsplash and Pexels serve any width on request. Local files in public/images are used
// as they are.
function sizedImage(url, width) {
  if (UNSPLASH.test(url)) {
    const sized = new URL(url);
    sized.searchParams.set('w', String(width));
    sized.searchParams.set('q', '80');
    sized.searchParams.set('auto', 'format');
    return sized.toString();
  }
  if (PEXELS.test(url)) {
    const sized = new URL(url);
    sized.searchParams.set('auto', 'compress');
    sized.searchParams.set('cs', 'tinysrgb');
    sized.searchParams.set('w', String(width));
    return sized.toString();
  }
  return url;
}

function srcsetFor(url, widths) {
  if (!UNSPLASH.test(url) && !PEXELS.test(url)) return '';
  return widths.map((width) => `${sizedImage(url, width)} ${width}w`).join(', ');
}

function imageTag(url, alt, { widths = [600, 900, 1400], sizes = '100vw', eager = false, className = '', attrs = '' } = {}) {
  const srcset = srcsetFor(url, widths);
  const src = sizedImage(url, widths[Math.min(1, widths.length - 1)]);
  return [
    '<img',
    className ? ` class="${className}"` : '',
    attrs ? ` ${attrs}` : '',
    ` src="${escapeHtml(src)}"`,
    srcset ? ` srcset="${escapeHtml(srcset)}" sizes="${escapeHtml(sizes)}"` : '',
    ` alt="${escapeHtml(alt)}"`,
    eager ? ' fetchpriority="high"' : ' loading="lazy"',
    ' decoding="async">',
  ].join('');
}

function safeHex(value) {
  return HEX_COLOUR.test(value) ? value : '#b5ad9f';
}

// Picture frames show the colourway of the towel until the photograph has loaded.
function toneStyle(variant) {
  const [first, second = first] = variant.swatch;
  return `--tone-a:${safeHex(first)};--tone-b:${safeHex(second)}`;
}

function swatchStyle(variant) {
  const [first, second] = variant.swatch;
  return second
    ? `--swatch:linear-gradient(135deg,${safeHex(first)} 50%,${safeHex(second)} 50%)`
    : `--swatch:${safeHex(first)}`;
}

const CARD_SIZES = {
  grid: '(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 420px',
  wide: '(max-width: 768px) 100vw, 50vw',
};

const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((category) => [category.slug, category]));

function swatchList(product, { size = 'small' } = {}) {
  const names = product.variants.map((variant) => variant.colour).join(', ');
  const dots = product.variants
    .map((variant) => `<span class="swatch swatch--${size}" style="${swatchStyle(variant)}" title="${escapeHtml(variant.colour)}" aria-hidden="true"></span>`)
    .join('');
  return `<span class="swatches"><span class="visually-hidden">${product.variants.length} colours: ${escapeHtml(names)}</span>${dots}</span>`;
}

function pieceCount(product) {
  return product.contents.reduce((sum, piece) => sum + piece.quantity, 0);
}

function piecesValue(product) {
  return product.contents.reduce((sum, piece) => sum + piece.quantity * piece.price, 0);
}

// One product in a grid. Every card carries the facts a careful buyer looks for: what it
// is, its size, its cotton and weight, its colours and its price.
function productCard(product, { sizes = CARD_SIZES.grid } = {}) {
  const lead = product.variants[0];
  const badge = product.isSet
    ? '<span class="card__badge">Sold only as a set</span>'
    : product.newArrival
      ? '<span class="card__badge">New</span>'
      : '';
  const specs = product.isSet
    ? [`${pieceCount(product)} pieces`, 'Aegean cotton']
    : [product.size, `${product.weight} Aegean cotton`];

  return `
          <li class="card reveal">
            <a class="card__link" href="/product/${escapeHtml(product.slug)}">
              <span class="card__media media media--portrait" style="${toneStyle(lead)}">
                ${imageTag(product.image.url, product.image.alt, { widths: [480, 720, 1000], sizes })}
                ${badge}
              </span>
              <span class="card__body">
                <span class="card__eyebrow">${escapeHtml(product.collection)}</span>
                <span class="card__name">${escapeHtml(product.name)}</span>
                <span class="card__summary">${escapeHtml(product.summary)}</span>
                <span class="card__specs">${specs.map((spec) => `<span>${escapeHtml(spec)}</span>`).join('')}</span>
                <span class="card__row">
                  <span class="card__price">${formatPrice(product.price)}</span>
                  ${swatchList(product)}
                </span>
                <span class="card__cta">${product.isSet ? 'Shop the set' : 'Shop now'}<span aria-hidden="true"> →</span></span>
              </span>
            </a>
          </li>`;
}

function contentsList(product, className = 'contents') {
  return `<ul class="${className}">${product.contents
    .map(
      (piece) => `
              <li><span class="contents__qty">${piece.quantity} ×</span><span class="contents__name">${escapeHtml(piece.name)}</span><span class="contents__size">${escapeHtml(piece.size)}</span></li>`
    )
    .join('')}
            </ul>`;
}

// A set on the sets page: a large photograph beside everything that is inside it.
function setFeature(product, index) {
  const lead = product.variants[0];
  const value = piecesValue(product);
  return `
        <article class="set-feature reveal${index % 2 ? ' set-feature--reverse' : ''}" id="${escapeHtml(product.slug)}" aria-labelledby="${escapeHtml(product.slug)}-name">
          <a class="set-feature__media media" href="/product/${escapeHtml(product.slug)}" tabindex="-1" aria-hidden="true" style="${toneStyle(lead)}">
            ${imageTag(product.image.url, product.image.alt, { widths: [700, 1000, 1400], sizes: CARD_SIZES.wide })}
          </a>
          <div class="set-feature__body">
            <p class="set-badge">Curated set · sold only together</p>
            <h2 class="set-feature__name" id="${escapeHtml(product.slug)}-name"><a href="/product/${escapeHtml(product.slug)}">${escapeHtml(product.name)}</a></h2>
            <p class="set-feature__text">${escapeHtml(product.description)}</p>
            <h3 class="label">What is inside</h3>
            ${contentsList(product)}
            <div class="set-feature__foot">
              <p class="set-feature__price">${formatPrice(product.price)}${value > product.price ? `<span class="set-feature__value">Pieces separately ${formatPrice(value)}</span>` : ''}</p>
              ${swatchList(product, { size: 'medium' })}
            </div>
            <a class="btn btn--dark" href="/product/${escapeHtml(product.slug)}">Shop the set</a>
          </div>
        </article>`;
}

function fromPrice(products) {
  const prices = products.map((product) => product.price);
  return prices.length ? `From ${formatPrice(Math.min(...prices))}` : '';
}

function categoryHref(category) {
  return category.slug === 'towel-sets' ? '/sets' : `/shop/${category.slug}`;
}

function categoryTile(category, products, index) {
  return `
          <li class="tile reveal tile--${index + 1}">
            <a class="tile__link" href="${categoryHref(category)}">
              <span class="tile__media media">
                ${imageTag(category.image.url, category.image.alt, { widths: [600, 900, 1300], sizes: index === 0 ? '(max-width: 768px) 100vw, 50vw' : '(max-width: 768px) 100vw, 25vw' })}
              </span>
              <span class="tile__caption">
                <span class="tile__name">${escapeHtml(category.name)}</span>
                <span class="tile__meta">${escapeHtml(category.size)} · ${escapeHtml(fromPrice(products))}</span>
              </span>
            </a>
          </li>`;
}

function categoryNav(current) {
  const links = [{ href: '/shop', name: 'All', slug: 'all' }, ...CATEGORIES.map((category) => ({ href: categoryHref(category), name: category.name, slug: category.slug }))];
  return `
      <nav class="cat-nav" aria-label="Categories">
        <ul class="cat-nav__list">${links
          .map((link) => `<li><a href="${link.href}"${link.slug === current ? ' aria-current="page"' : ''}>${escapeHtml(link.name)}</a></li>`)
          .join('')}
        </ul>
      </nav>`;
}

function productGrid(products) {
  return `<ul class="grid">${products.map((product) => productCard(product)).join('')}
        </ul>`;
}

function colourOption(variant, selected) {
  const [toneA, toneB = toneA] = variant.swatch;
  const soldOut = variant.stock < 1;
  return `
              <label class="colour-option${soldOut ? ' is-soldout' : ''}">
                <input type="radio" name="colour" value="${escapeHtml(variant.sku)}"
                  data-colour="${escapeHtml(variant.colour)}" data-stock="${variant.stock}"
                  data-image="${escapeHtml(variant.image)}" data-alt="${escapeHtml(variant.imageAlt)}"
                  data-tone-a="${safeHex(toneA)}" data-tone-b="${safeHex(toneB)}"${variant.sku === selected.sku ? ' checked' : ''}>
                <span class="swatch swatch--large" style="${swatchStyle(variant)}"></span>
                <span class="visually-hidden">${escapeHtml(variant.colour)}${soldOut ? ' (sold out)' : ''}</span>
              </label>`;
}

// Stripe

let stripeClient = null;

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set, so checkout is switched off.');
    throw new HttpError(
      503,
      IS_PRODUCTION
        ? 'Checkout is not available right now. Please try again shortly.'
        : 'Checkout is switched off because STRIPE_SECRET_KEY is not set in .env.'
    );
  }
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return stripeClient;
}

// Reads { items: [{ id, quantity }] } from JSON, or a form field named "cart" holding
// that same array as JSON. Only the id and quantity are used: names and prices always
// come from the database, so a tampered bag cannot change what is charged.
function readCart(body) {
  let raw = body && (body.items ?? body.cart);
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, 'Your bag is empty.');
  if (raw.length > MAX_CART_LINES) throw new HttpError(400, 'There are too many different items in your bag.');

  const quantities = new Map();
  for (const entry of raw) {
    const id = typeof entry?.id === 'string' ? entry.id : '';
    const quantity = Number(entry?.quantity);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw new HttpError(400, 'Your bag could not be read. Please refresh the page and try again.');
    }
    quantities.set(id, Math.min((quantities.get(id) || 0) + quantity, MAX_LINE_QUANTITY));
  }
  return [...quantities].map(([id, quantity]) => ({ id, quantity }));
}

function priceCart(lines) {
  let subtotal = 0;
  const items = lines.map(({ id, quantity }) => {
    const variant = db.getVariant(id);
    if (!variant) {
      throw new HttpError(400, 'An item in your bag is no longer available. Please remove it and try again.');
    }
    if (variant.stock < quantity) {
      throw new HttpError(
        409,
        variant.stock === 0
          ? `${variant.productName} in ${variant.colour} is sold out. Please remove it from your bag.`
          : `Only ${variant.stock} of ${variant.productName} in ${variant.colour} left. Please lower the quantity.`
      );
    }
    subtotal += variant.price * quantity;
    return { ...variant, quantity };
  });
  return { items, subtotal };
}

// Stripe only accepts images it can reach over https.
function checkoutImage(url) {
  if (url.startsWith('https://')) return sizedImage(url, 800);
  if (url.startsWith('/') && SITE_URL.startsWith('https://')) return `${SITE_URL}${url}`;
  return null;
}

async function createCheckoutSession({ items, subtotal }) {
  const deliveryAmount = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;

  return stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: items.map((item) => {
      const image = checkoutImage(item.image);
      return {
        quantity: item.quantity,
        price_data: {
          currency: CURRENCY,
          unit_amount: item.price,
          product_data: {
            name: item.productName,
            description: `Colour: ${item.colour}`,
            metadata: { sku: item.sku, colour: item.colour },
            ...(image ? { images: [image] } : {}),
          },
        },
      };
    }),
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
    phone_number_collection: { enabled: true },
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: deliveryAmount, currency: CURRENCY },
          display_name: deliveryAmount === 0 ? 'Free delivery' : 'Standard delivery',
        },
      },
    ],
    metadata: { store: STORE_TAG },
    success_url: `${SITE_URL}/order-confirmed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/cart`,
  });
}

// Stripe sends webhooks for every Checkout Session on the account, including ones
// created by other projects or by `stripe trigger`. Only sessions tagged by this site
// become orders.
function isOurSession(session) {
  return session.metadata?.store === STORE_TAG;
}

function retrieveSession(sessionId) {
  return stripe().checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'line_items.data.price.product'],
  });
}

// Newer Stripe API versions keep the shipping address under collected_information.
function orderFromSession(session) {
  const customer = session.customer_details || {};
  const shipping = session.collected_information?.shipping_details || null;
  const address = shipping?.address || customer.address || null;

  const items = (session.line_items?.data || []).map((line) => {
    const product = line.price && typeof line.price.product === 'object' ? line.price.product : null;
    return {
      sku: product?.metadata?.sku || null,
      name: product?.name || line.description,
      colour: product?.metadata?.colour || null,
      quantity: line.quantity,
      unitAmount: line.price?.unit_amount ?? Math.round(line.amount_subtotal / line.quantity),
      lineTotal: line.amount_total,
    };
  });

  return {
    stripeSessionId: session.id,
    email: customer.email,
    name: customer.name || shipping?.name || null,
    phone: customer.phone || null,
    shippingName: shipping?.name || customer.name || null,
    shippingAddress: address
      ? {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postal_code: address.postal_code,
          country: address.country,
        }
      : null,
    items,
    subtotal: session.amount_subtotal,
    shipping: session.total_details?.amount_shipping ?? 0,
    total: session.amount_total,
    currency: session.currency || CURRENCY,
  };
}

// Both the webhook and the confirmation page call this, in whichever order they arrive.
// The order is stored once, and the email is sent once even when both arrive together.
const emailJobs = new Map();

function ensureConfirmationEmail(order) {
  if (order.emailedAt) return Promise.resolve(order);

  let job = emailJobs.get(order.id);
  if (!job) {
    job = sendOrderConfirmation(order, { siteUrl: SITE_URL })
      .then((result) => {
        if (result.sent) db.markOrderEmailed(order.id);
      })
      .catch((error) => {
        console.error(`Confirmation email for ${order.orderNumber} failed: ${error.message}`);
      })
      .finally(() => emailJobs.delete(order.id));
    emailJobs.set(order.id, job);
  }
  return job.then(() => db.getOrder(order.id));
}

// Resolves to null for sessions that are unpaid or were not created by this site.
async function fulfilOrder(session) {
  if (!isOurSession(session) || session.payment_status !== 'paid') return null;
  const { order } = db.recordOrder(orderFromSession(session));
  return ensureConfirmationEmail(order);
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
    event = Stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), secret);
  } catch {
    return res.status(400).json({ error: 'Signature verification failed.' });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = await retrieveSession(event.data.object.id);
    await fulfilOrder(session);
  }
  res.json({ received: true });
});

function editorialImage(image, sizes, className = '') {
  return imageTag(image.url, image.alt, { widths: [700, 1000, 1500], sizes, className });
}

app.get('/', (req, res) => {
  const products = db.listProducts();
  const inCategory = (slug) => products.filter((product) => product.category === slug);

  res.type('html').send(
    render(
      'index',
      pageData('home', {
        title: 'Pamuq | Luxury Turkish cotton towels from the Aegean',
        description:
          'Bath towels, hand towels, bath sheets and curated sets woven from long-staple Aegean cotton in Denizli, Turkey. Soft, absorbent and made to last.',
        urlPath: '/',
        heroImage: imageTag(SITE_IMAGES.hero.url, SITE_IMAGES.hero.alt, {
          widths: [900, 1400, 2000],
          sizes: '100vw',
          eager: true,
          className: 'hero__image',
        }),
        categoryTiles: CATEGORIES.map((category, index) => categoryTile(category, inCategory(category.slug), index)).join(''),
        bestsellers: db.listFeatured({ limit: 4 }).map((product) => productCard(product)).join(''),
        featuredSets: db.listFeatured({ sets: true, limit: 3 }).map((product) => productCard(product)).join(''),
        whyImage: editorialImage(SITE_IMAGES.why, '(max-width: 768px) 100vw, 45vw'),
        whyDetail: editorialImage(SITE_IMAGES.whyDetail, '(max-width: 768px) 60vw, 20vw'),
        cottonImage: editorialImage(SITE_IMAGES.cotton, '(max-width: 768px) 100vw, 50vw'),
        cottonDetail: editorialImage(SITE_IMAGES.cottonDetail, '(max-width: 768px) 60vw, 22vw'),
        handsImage: editorialImage(SITE_IMAGES.hands, '(max-width: 768px) 100vw, 40vw'),
      })
    )
  );
});

// The old collection page lives on as the shop.
app.get('/collection', (req, res) => res.redirect(301, '/shop'));

app.get('/shop', (req, res) => {
  const products = db.listProducts();
  const sections = CATEGORIES.filter((category) => category.slug !== 'towel-sets')
    .map((category) => {
      const items = products.filter((product) => product.category === category.slug);
      return `
      <section class="shop-section" id="${category.slug}" aria-labelledby="${category.slug}-title">
        <header class="shop-section__head reveal">
          <div>
            <h2 class="shop-section__title" id="${category.slug}-title">${escapeHtml(category.name)}</h2>
            <p class="shop-section__meta">${escapeHtml(category.size)} · ${items.length} ${items.length === 1 ? 'style' : 'styles'}</p>
          </div>
          <p class="shop-section__intro">${escapeHtml(category.intro)}</p>
        </header>
        ${productGrid(items)}
      </section>`;
    })
    .join('');

  const sets = products.filter((product) => product.isSet);
  const setsCategory = CATEGORY_BY_SLUG.get('towel-sets');

  res.type('html').send(
    render(
      'shop',
      pageData('shop', {
        title: 'Shop all towels | Pamuq',
        description: 'Bath towels, hand towels, washcloths, guest towels, bath sheets and curated sets in long-staple Aegean cotton.',
        urlPath: '/shop',
        eyebrow: 'The collection',
        heading: 'Towels worth reaching for',
        intro:
          'Four weaves, eight colourways and every size a bathroom needs. Each piece is woven from long-staple Aegean cotton in Denizli and finished by hand.',
        categoryNav: categoryNav('all'),
        sections,
        setsBanner: `
      <aside class="sets-banner reveal" aria-labelledby="sets-banner-title">
        <div class="sets-banner__media media">${editorialImage(setsCategory.image, '(max-width: 768px) 100vw, 50vw')}</div>
        <div class="sets-banner__body">
          <p class="eyebrow eyebrow--dark">Curated sets</p>
          <h2 class="sets-banner__title" id="sets-banner-title">Composed to be together</h2>
          <p class="sets-banner__text">${sets.length} sets, each sold only as a whole and presented in a cotton gift bag. From the Essential Trio to the Full Bathroom Set.</p>
          <a class="btn btn--dark" href="/sets">Explore the sets</a>
        </div>
      </aside>`,
      })
    )
  );
});

app.get('/shop/:category', (req, res, next) => {
  const category = CATEGORY_BY_SLUG.get(req.params.category);
  if (!category) return next();
  if (category.slug === 'towel-sets') return res.redirect(301, '/sets');

  const items = db.listCategory(category.slug);
  res.type('html').send(
    render(
      'shop',
      pageData('shop', {
        title: `${category.name} | Pamuq`,
        description: category.intro,
        urlPath: `/shop/${category.slug}`,
        ogImage: category.image.url,
        eyebrow: `${category.size} · ${fromPrice(items)}`,
        heading: category.name,
        intro: category.intro,
        categoryNav: categoryNav(category.slug),
        sections: `
      <section class="shop-section shop-section--single" aria-label="${escapeHtml(category.name)}">
        ${productGrid(items)}
      </section>`,
        setsBanner: '',
      })
    )
  );
});

app.get('/sets', (req, res) => {
  const sets = db.listCategory('towel-sets');
  const category = CATEGORY_BY_SLUG.get('towel-sets');
  res.type('html').send(
    render(
      'sets',
      pageData('sets', {
        title: 'Towel Sets | Pamuq',
        description: 'Curated sets of Aegean cotton towels, composed to work together and sold only as a complete set.',
        urlPath: '/sets',
        ogImage: SITE_IMAGES.sets.url,
        categoryNav: categoryNav(category.slug),
        setsImage: imageTag(SITE_IMAGES.sets.url, SITE_IMAGES.sets.alt, {
          widths: [900, 1400, 2000],
          sizes: '100vw',
          eager: true,
          className: 'sets-hero__image',
        }),
        sets: sets.map(setFeature).join(''),
      })
    )
  );
});

app.get('/product/:slug', (req, res, next) => {
  const product = db.getProduct(req.params.slug);
  if (!product || product.variants.length === 0) return next();

  const category = CATEGORY_BY_SLUG.get(product.category);
  const selected = product.variants.find((variant) => variant.stock > 0) || product.variants[0];
  const images = [product.image, ...product.gallery].slice(0, 4);
  const mainSizes = '(max-width: 768px) 100vw, 55vw';

  const thumbs = images
    .map(
      (image, index) => `
              <li>
                <button class="thumb media media--portrait${index === 0 ? ' is-active' : ''}" type="button" data-thumb data-src="${escapeHtml(image.url)}" data-alt="${escapeHtml(image.alt)}" aria-label="Show picture ${index + 1} of ${images.length}"${index === 0 ? ' aria-current="true"' : ''}>
                  ${imageTag(image.url, image.alt, { widths: [160, 240, 360], sizes: '(max-width: 768px) 22vw, 12vw' })}
                </button>
              </li>`
    )
    .join('');

  // Related pieces: other sets for a set, otherwise the rest of the category, then the
  // sets that include this piece.
  const all = db.listProducts();
  const related = (
    product.isSet
      ? all.filter((other) => other.isSet && other.slug !== product.slug)
      : [
          ...all.filter((other) => other.category === product.category && other.slug !== product.slug),
          ...all.filter((other) => other.isSet && other.contents.some((piece) => piece.slug === product.slug)),
        ]
  ).slice(0, 4);

  const specs = product.isSet
    ? [
        ['Pieces', `${pieceCount(product)} pieces`],
        ['Material', product.material],
        ['Presentation', 'Cotton gift bag'],
      ]
    : [
        ['Size', product.size],
        ['Material', product.material],
        ['Weave', product.weave],
        ['Weight', product.weight],
      ];
  const value = product.isSet ? piecesValue(product) : 0;

  res.type('html').send(
    render(
      'product',
      pageData('product', {
        title: `${product.name} | Pamuq`,
        description: product.summary || product.description,
        urlPath: `/product/${product.slug}`,
        ogType: 'product',
        ogImage: product.image.url,
        scripts: '<script src="/js/product.js" defer></script>',
        slug: product.slug,
        name: product.name,
        priceValue: product.price,
        price: formatPrice(product.price),
        priceNote: value > product.price ? `Pieces bought separately ${formatPrice(value)}` : '',
        categoryName: category ? category.name : 'Shop',
        categoryHref: category ? categoryHref(category) : '/shop',
        collection: product.collection,
        summary: product.summary,
        productDescription: product.description,
        feel: product.feel,
        specs: specs.map(([term, detail]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(detail)}</dd></div>`).join(''),
        setContents: product.isSet
          ? `
        <div class="pdp__set">
          <p class="set-badge">Curated set · sold only together</p>
          <h2 class="label">What is inside</h2>
          ${contentsList(product)}
        </div>`
          : '',
        selectedColour: selected.colour,
        toneStyle: toneStyle(selected),
        mainImage: imageTag(product.image.url, product.image.alt, {
          widths: [700, 1000, 1400],
          sizes: mainSizes,
          eager: true,
          className: 'gallery__layer is-active',
          attrs: 'data-gallery-layer',
        }),
        mainSizes,
        thumbs,
        colourOptions: product.variants.map((variant) => colourOption(variant, selected)).join(''),
        colourCount: product.variants.length,
        addLabel: selected.stock < 1 ? 'Sold out' : product.isSet ? 'Add set to bag' : 'Add to bag',
        addReady: product.isSet ? 'Add set to bag' : 'Add to bag',
        addDisabled: selected.stock < 1 ? ' disabled' : '',
        related: related.map((other) => productCard(other)).join(''),
        sizeGuide: CATEGORIES.filter((entry) => entry.slug !== 'towel-sets')
          .map((entry) => `<div><dt>${escapeHtml(entry.singular)}</dt><dd>${escapeHtml(entry.size)}</dd></div>`)
          .join(''),
        relatedTitle: product.isSet ? 'More curated sets' : 'Complete the bathroom',
      })
    )
  );
});

app.get('/cart', (req, res) => {
  res.set('Cache-Control', 'no-store').type('html').send(
    render(
      'cart',
      pageData('cart', {
        title: 'Your bag | Pamuq',
        description: 'Review the towels in your bag.',
        urlPath: '/cart',
        noindex: true,
        // Stripe asks for Stripe.js on the pages leading to Checkout so that it can
        // spot fraud. The payment itself is a redirect to Stripe's hosted page.
        scripts: '<script src="https://js.stripe.com/v3/" async></script>',
      })
    )
  );
});

// The cart page posts the bag here. Only ids and quantities are read from it: the
// session is built from database prices. Browsers that submit a plain form are
// redirected straight to Stripe, while the cart page's own fetch asks for JSON.
app.post(
  '/checkout',
  express.json({ limit: '20kb' }),
  express.urlencoded({ extended: false, limit: '20kb' }),
  async (req, res) => {
    const pricedCart = priceCart(readCart(req.body));
    const session = await createCheckoutSession(pricedCart);
    if (!session.url) throw new HttpError(502, 'Stripe did not return a checkout address.');

    if ((req.get('accept') || '').includes('application/json')) return res.json({ url: session.url });
    res.redirect(303, session.url);
  }
);

app.get('/order-confirmed', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  const confirmation = (status, details) =>
    res.status(status).type('html').send(
      render(
        'order-confirmed',
        pageData('order', {
          title: 'Order confirmed | Pamuq',
          description: 'Your Pamuq order.',
          urlPath: '/order-confirmed',
          noindex: true,
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
    session = await retrieveSession(sessionId);
  } catch (error) {
    if (error.code === 'resource_missing') {
      return confirmation(404, {
        heading: 'We could not find that order.',
        lead: 'Please check the link in your confirmation email.',
      });
    }
    throw error;
  }

  if (!isOurSession(session)) {
    return confirmation(404, {
      heading: 'We could not find that order.',
      lead: 'Please check the link in your confirmation email.',
    });
  }

  if (session.payment_status !== 'paid') {
    return confirmation(409, {
      heading: 'Your payment has not completed.',
      lead: 'Nothing has been charged yet. You can return to your bag and try again.',
    });
  }

  const order = await fulfilOrder(session);
  const name = firstName(order.name);

  confirmation(200, {
    paid: 'true',
    heading: name ? `Thank you, ${name}.` : 'Thank you.',
    lead: 'Your towels are being prepared. They ship within 5 to 7 days.',
    details: orderDetails(order),
  });
});

function orderDetails(order) {
  const rows = order.items
    .map(
      (item) => `
          <li class="summary__row">
            <span>
              <span class="summary__name">${escapeHtml(item.name)}</span>
              <span class="summary__meta">${escapeHtml(item.colour ? `${item.colour}, ` : '')}quantity ${item.quantity}</span>
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
            <span>Delivery</span>
            <span class="summary__amount">${order.shipping === 0 ? 'Free' : formatPrice(order.shipping)}</span>
          </li>
          <li class="summary__row summary__row--total">
            <span>Total</span>
            <span class="summary__amount">${formatPrice(order.total)}</span>
          </li>
        </ul>
        <p class="confirmation__email">${emailNote}</p>`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/newsletter', express.json({ limit: '2kb' }), express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'Please enter a valid email address.');
  }
  // The answer is the same for new and existing subscribers.
  db.addSubscriber(email);
  res.json({ ok: true });
});

app.use((req, res) => {
  res.status(404).type('html').send(
    render(
      'error',
      pageData('error', {
        title: 'Page not found | Pamuq',
        description: 'This page could not be found.',
        noindex: true,
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

// A fresh database, or one seeded from an older catalogue, is loaded from catalogue.js.
// Stock levels and orders are kept.
{
  const { seed, CATALOGUE_VERSION } = require('./seed');
  if (db.countProducts() === 0 || db.catalogueVersion() !== CATALOGUE_VERSION) seed();
}

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
