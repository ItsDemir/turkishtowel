'use strict';

// Stripe Checkout: the cart is priced from the database, sent to Stripe's hosted page in
// US dollars with US shipping, and recorded as an order once paid.
//
// Payment methods (Apple Pay, Google Pay, Link, Klarna or Afterpay) are switched on in
// the Stripe Dashboard; no code change is needed. Sales tax: turn on Stripe Tax in the
// Dashboard, then set STRIPE_AUTOMATIC_TAX=1.

const Stripe = require('stripe');

const config = require('../config');
const db = require('../db');
const { sendOrderConfirmation } = require('../email');
const { remoteUrl } = require('./images');
const { SITE_URL, IS_PRODUCTION } = require('./render');

const CURRENCY = config.currency.code.toLowerCase();
const MAX_LINE_QUANTITY = 10;
const MAX_CART_LINES = 20;
const STORE_TAG = 'pamuq';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

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
// come from the database, so a tampered cart cannot change what is charged.
function readCart(body) {
  let raw = body && (body.items ?? body.cart);
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, 'Your cart is empty.');
  if (raw.length > MAX_CART_LINES) throw new HttpError(400, 'There are too many different items in your cart.');

  const quantities = new Map();
  for (const entry of raw) {
    const id = typeof entry?.id === 'string' ? entry.id : '';
    const quantity = Number(entry?.quantity);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw new HttpError(400, 'Your cart could not be read. Please refresh the page and try again.');
    }
    quantities.set(id, Math.min((quantities.get(id) || 0) + quantity, MAX_LINE_QUANTITY));
  }
  return [...quantities].map(([id, quantity]) => ({ id, quantity }));
}

// { isGift, message, hidePrices } from the cart page, trimmed to what Stripe metadata
// can hold.
function readGift(body) {
  const gift = body && typeof body.gift === 'object' && body.gift ? body.gift : null;
  if (!gift || !gift.isGift) return null;
  const message = String(gift.message || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, config.gifts.messageMax);
  return { isGift: true, message, hidePrices: Boolean(gift.hidePrices) };
}

function priceCart(lines) {
  let subtotal = 0;
  const items = lines.map(({ id, quantity }) => {
    const variant = db.getVariant(id);
    if (!variant) {
      throw new HttpError(400, 'An item in your cart is no longer available. Please remove it and try again.');
    }
    if (variant.stock < quantity) {
      throw new HttpError(
        409,
        variant.stock === 0
          ? `${variant.productName} in ${variant.color} is sold out. Please remove it from your cart.`
          : `Only ${variant.stock} of ${variant.productName} in ${variant.color} left. Please lower the quantity.`
      );
    }
    subtotal += variant.price * quantity;
    return { ...variant, quantity };
  });
  return { items, subtotal };
}

function shippingAmount(subtotal) {
  return subtotal >= config.shipping.freeThreshold ? 0 : config.shipping.flatRate;
}

// Stripe only accepts images it can reach over https.
function checkoutImage(url) {
  if (url.startsWith('https://')) return remoteUrl(url, 800);
  if (url.startsWith('/') && SITE_URL.startsWith('https://')) return `${SITE_URL}${url}`;
  return null;
}

async function createCheckoutSession({ items, subtotal }, gift) {
  const amount = shippingAmount(subtotal);
  const { makeDays, transitDays } = config.shipping;

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
            description: `Color: ${item.color}`,
            metadata: { sku: item.sku, color: item.color },
            ...(image ? { images: [image] } : {}),
          },
        },
      };
    }),
    shipping_address_collection: { allowed_countries: [config.shipping.country] },
    phone_number_collection: { enabled: true },
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount, currency: CURRENCY },
          display_name: amount === 0 ? 'Free US shipping' : 'US shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: makeDays.min + transitDays.min },
            maximum: { unit: 'business_day', value: makeDays.max + transitDays.max },
          },
        },
      },
    ],
    // Lets customers enter codes such as the welcome offer. The codes themselves are
    // created as promotion codes in the Stripe Dashboard.
    allow_promotion_codes: true,
    ...(process.env.STRIPE_AUTOMATIC_TAX === '1' ? { automatic_tax: { enabled: true } } : {}),
    metadata: {
      store: STORE_TAG,
      ...(gift
        ? { gift: 'yes', gift_message: gift.message, gift_hide_prices: gift.hidePrices ? 'yes' : 'no' }
        : {}),
    },
    success_url: `${SITE_URL}/order/success?session_id={CHECKOUT_SESSION_ID}`,
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
  const metadata = session.metadata || {};

  const items = (session.line_items?.data || []).map((line) => {
    const product = line.price && typeof line.price.product === 'object' ? line.price.product : null;
    return {
      sku: product?.metadata?.sku || null,
      name: product?.name || line.description,
      color: product?.metadata?.color || null,
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
    gift: metadata.gift === 'yes' ? { message: metadata.gift_message || '', hidePrices: metadata.gift_hide_prices === 'yes' } : null,
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

module.exports = {
  HttpError,
  Stripe,
  stripe,
  readCart,
  readGift,
  priceCart,
  shippingAmount,
  createCheckoutSession,
  isOurSession,
  retrieveSession,
  fulfilOrder,
};
