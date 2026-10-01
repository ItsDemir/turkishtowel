'use strict';

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const express = require('express');
const Stripe = require('stripe');

const db = require('./db');
const { sendOrderConfirmation } = require('./email');
const { escapeHtml, formatPrice, firstName } = require('./format');

const PORT = Number(process.env.PORT) || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
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

// Photography for the homepage. Catalogue photography lives in seed.js.
const SITE_IMAGES = {
  hero: {
    url: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=1400&q=80',
    alt: 'Whitewashed houses and blue domes above the Aegean sea in afternoon light',
  },
  story: {
    url: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=1400&q=80',
    alt: "A craftsperson's hands at work",
  },
};

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
    navCollection: page === 'collection' ? ' aria-current="page"' : '',
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
const HEX_COLOUR = /^#[0-9a-f]{3,8}$/i;

// Unsplash serves any width on request. Local files in public/images are used as they are.
function sizedImage(url, width) {
  if (!UNSPLASH.test(url)) return url;
  const sized = new URL(url);
  sized.searchParams.set('w', String(width));
  sized.searchParams.set('q', '80');
  sized.searchParams.set('auto', 'format');
  return sized.toString();
}

function srcsetFor(url, widths) {
  if (!UNSPLASH.test(url)) return '';
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
  strip: '(max-width: 768px) 78vw, 32vw',
  grid: '(max-width: 768px) 50vw, 32vw',
};

function productCard(product, { swatches, sizes }) {
  const lead = product.variants[0];
  const families = [...new Set(product.variants.map((variant) => variant.family))].join(' ');
  const colourNames = product.variants.map((variant) => variant.colour).join(', ');
  const swatchList = swatches
    ? `<span class="card__swatches"><span class="visually-hidden">Colours: ${escapeHtml(colourNames)}</span>${product.variants
        .map((variant) => `<span class="swatch swatch--small" style="${swatchStyle(variant)}" aria-hidden="true"></span>`)
        .join('')}</span>`
    : '';

  return `
        <li class="card" data-families="${escapeHtml(families)}">
          <a class="card__link" href="/product/${escapeHtml(product.slug)}">
            <span class="media media--portrait" style="${toneStyle(lead)}">${imageTag(lead.image, lead.imageAlt, { widths: [480, 720, 1000], sizes })}</span>
            <span class="card__name">${escapeHtml(product.name)}</span>
            ${swatchList}
            <span class="card__price">${formatPrice(product.price)}</span>
          </a>
        </li>`;
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

app.get('/', (req, res) => {
  const arrivals = db.listNewArrivals(3);
  res.type('html').send(
    render(
      'index',
      pageData('home', {
        title: 'Pamuq | Hand-loomed Turkish towels',
        description:
          'Hand-loomed peshtemal from Denizli, Turkey. Light, absorbent and softer with every wash, woven by the same family for three generations.',
        urlPath: '/',
        heroImage: imageTag(SITE_IMAGES.hero.url, SITE_IMAGES.hero.alt, {
          widths: [900, 1400, 2000],
          sizes: '100vw',
          eager: true,
          className: 'hero__image',
        }),
        storyImage: imageTag(SITE_IMAGES.story.url, SITE_IMAGES.story.alt, {
          widths: [600, 900, 1200],
          sizes: '(max-width: 768px) 100vw, 40vw',
        }),
        newArrivals: arrivals.map((product) => productCard(product, { swatches: false, sizes: CARD_SIZES.strip })).join(''),
      })
    )
  );
});

app.get('/collection', (req, res) => {
  const products = db.listProducts();
  res.type('html').send(
    render(
      'collection',
      pageData('collection', {
        title: 'The Collection | Pamuq',
        description: 'Every towel woven to order. Ships in 5 to 7 days.',
        urlPath: '/collection',
        products: products.map((product) => productCard(product, { swatches: true, sizes: CARD_SIZES.grid })).join(''),
      })
    )
  );
});

app.get('/product/:slug', (req, res, next) => {
  const product = db.getProduct(req.params.slug);
  if (!product || product.variants.length === 0) return next();

  const selected = product.variants.find((variant) => variant.stock > 0) || product.variants[0];
  const gallery = product.gallery.slice(0, 3);
  const mainSizes = '(max-width: 768px) 100vw, 55vw';

  const thumbs = [{ url: selected.image, alt: selected.imageAlt }, ...gallery]
    .map(
      (image, index) => `
              <li>
                <button class="thumb media media--portrait${index === 0 ? ' is-active' : ''}" type="button" data-thumb data-src="${escapeHtml(image.url)}" data-alt="${escapeHtml(image.alt)}"${index === 0 ? ` aria-current="true" style="${toneStyle(selected)}"` : ''}>
                  ${imageTag(image.url, image.alt, { widths: [160, 240, 360], sizes: '(max-width: 768px) 22vw, 12vw' })}
                </button>
              </li>`
    )
    .join('');

  res.type('html').send(
    render(
      'product',
      pageData('product', {
        title: `${product.name} | Pamuq`,
        description: product.description,
        urlPath: `/product/${product.slug}`,
        ogType: 'product',
        ogImage: selected.image,
        scripts: '<script src="/js/product.js" defer></script>',
        slug: product.slug,
        name: product.name,
        priceValue: product.price,
        price: formatPrice(product.price),
        productDescription: product.description,
        dimensions: product.dimensions,
        weight: product.weight,
        selectedColour: selected.colour,
        toneStyle: toneStyle(selected),
        mainImage: imageTag(selected.image, selected.imageAlt, {
          widths: [700, 1000, 1400],
          sizes: mainSizes,
          eager: true,
          className: 'gallery__layer is-active',
          attrs: 'data-gallery-layer',
        }),
        mainSizes,
        thumbs,
        colourOptions: product.variants.map((variant) => colourOption(variant, selected)).join(''),
        addLabel: selected.stock < 1 ? 'Sold out' : 'Add to bag',
        addDisabled: selected.stock < 1 ? ' disabled' : '',
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

if (db.countProducts() === 0) require('./seed').seed();

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
