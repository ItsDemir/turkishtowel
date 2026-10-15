'use strict';

// Templates and the values every page shares.
//
// Views are plain HTML files. {{> name}} pulls in views/partials/name.html, {{key}}
// inserts an HTML-escaped value and {{{key}}} inserts trusted markup.

const fs = require('fs');
const path = require('path');

const config = require('../config');
const { escapeHtml, formatPrice, formatDate } = require('../format');
const { imageTag, shareUrl } = require('./images');
const { CATEGORIES, SITE_IMAGES } = require('../catalog');
const markup = require('./markup');
const shipping = require('./shipping');

const VIEWS_DIR = path.join(__dirname, '..', 'views');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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

const templateCache = new Map();

function readTemplate(name) {
  if (templateCache.has(name)) return templateCache.get(name);
  const source = fs.readFileSync(path.join(VIEWS_DIR, `${name}.html`), 'utf8');
  if (IS_PRODUCTION) templateCache.set(name, source);
  return source;
}

const TOKEN = /\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g;

function render(name, data = {}) {
  const source = readTemplate(name).replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, partial) => readTemplate(`partials/${partial}`));
  return source.replace(TOKEN, (_, rawKey, escapedKey) => {
    const value = data[rawKey || escapedKey];
    if (value === undefined || value === null) return '';
    return rawKey ? String(value) : escapeHtml(value);
  });
}

function absoluteUrl(url) {
  return url.startsWith('/') ? `${SITE_URL}${url}` : url;
}

// Campaign dates are calendar days in US Eastern time.
function campaignLive(now = shipping.today()) {
  const { startsOn, endsOn } = config.campaign;
  if (!startsOn || !endsOn) return false;
  return now >= new Date(`${startsOn}T00:00:00Z`) && now <= new Date(`${endsOn}T00:00:00Z`);
}

function orderByLine() {
  const { orderBy, orderByLabel } = config.campaign;
  if (!orderBy || !campaignLive()) return '';
  const date = new Date(`${orderBy}T00:00:00Z`);
  if (shipping.today() > date) return '';
  return `Order by ${formatDate(date)} for ${orderByLabel}`;
}

function announcements() {
  const { shipping: ship, offers } = config;
  return [
    `Free US shipping on orders over ${formatPrice(ship.freeThreshold)}`,
    `${offers.welcome.percent}% off your first order when you join our list`,
    ship.dutiesIncluded ? 'No customs fees. Duties included.' : null,
    orderByLine() || null,
  ].filter(Boolean);
}

function announcementBar() {
  const messages = announcements();
  if (messages.length === 0) return '';
  return `
  <div class="announce" data-announce role="region" aria-label="Offers">
    <div class="announce__track" aria-live="off">${messages
      .map((message, index) => `<p class="announce__message${index === 0 ? ' is-active' : ''}"${index === 0 ? '' : ' aria-hidden="true"'}>${escapeHtml(message)}</p>`)
      .join('')}</div>
    <button class="announce__close" type="button" data-announce-close aria-label="Dismiss offers">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
    </button>
  </div>`;
}

// The Shop menu: every category with its picture and its lowest price.
function megaMenu(products) {
  const tiles = CATEGORIES.map((category) => {
    const items = products.filter((product) => product.category === category.slug);
    return `
            <li><a class="mega__tile" href="${markup.categoryHref(category)}">
              <span class="mega__media media">${imageTag(category.image, { widths: [320, 480], sizes: '(max-width: 1200px) 16vw, 200px' })}</span>
              <span class="mega__name">${escapeHtml(category.name)}</span>
              <span class="mega__meta">${escapeHtml(markup.fromPrice(items))}</span>
            </a></li>`;
  }).join('');
  return `<ul class="mega__grid">${tiles}
          </ul>
          <ul class="mega__links">
            <li><a href="/shop">Shop all towels</a></li>
            <li><a href="/beach-and-pool">Beach &amp; Pool</a></li>
            <li><a href="/gifts">Gifts</a></li>
            <li><a href="/faq#product">Which towel is right for me?</a></li>
          </ul>`;
}

function mobileMenu() {
  const categories = CATEGORIES.map(
    (category) => `
            <li><a class="mobile-menu__category" href="${markup.categoryHref(category)}">
              <span class="mobile-menu__thumb media">${imageTag(category.image, { widths: [160], sizes: '64px' })}</span>
              <span>${escapeHtml(category.name)}</span>
            </a></li>`
  ).join('');
  return `<ul class="mobile-menu__categories">${categories}
          </ul>
          <ul class="mobile-menu__links">
            <li><a href="/shop">Shop all</a></li>
            <li><a href="/sets">Sets</a></li>
            <li><a href="/beach-and-pool">Beach &amp; Pool</a></li>
            <li><a href="/gifts">Gifts</a></li>
            <li><a href="/about">Our Story</a></li>
            <li><a href="/faq">FAQ</a></li>
            <li><a href="/contact">Contact</a></li>
          </ul>
          <p class="mobile-menu__offer">${escapeHtml(announcements()[0] || '')}</p>`;
}

const SOCIAL_ICONS = {
  instagram: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="16.8" cy="7.2" r="0.6" fill="currentColor"/></svg>',
  pinterest: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M11 8.5c3-1 5 .5 5 3 0 2.5-2 4-3.6 3.4M11.6 9.5L9.5 20"/></svg>',
  tiktok: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.5 2.5 2.5 4 5 4"/></svg>',
};

function socialLinks() {
  const links = Object.entries(config.social)
    .filter(([, url]) => url)
    .map(([name, url]) => `<li><a href="${escapeHtml(url)}" rel="noopener" aria-label="Pamuq on ${name[0].toUpperCase()}${name.slice(1)}">${SOCIAL_ICONS[name] || name}</a></li>`)
    .join('');
  return links ? `<ul class="social">${links}</ul>` : '';
}

function footerContact() {
  const lines = [];
  if (config.support.email) lines.push(`<a href="mailto:${escapeHtml(config.support.email)}">${escapeHtml(config.support.email)}</a>`);
  lines.push(escapeHtml(config.support.responseTime));
  return lines.map((line) => `<p>${line}</p>`).join('');
}

function analyticsScript() {
  if (!config.analytics.vercel) return '';
  return '<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script><script defer src="/_vercel/insights/script.js"></script>';
}

// Pages that open with a full width photograph, under a transparent header.
const HERO_PAGES = new Set(['home', 'sets', 'beach', 'gifts']);

const NAV_PAGES = { shop: 'navShop', sets: 'navSets', beach: 'navBeach', gifts: 'navGifts', about: 'navAbout' };

// Values every page needs: the document head, the header and footer, and the money and
// shipping settings the scripts read from <body>.
function pageData(page, { title, description, urlPath = '/', ogType = 'website', ogImage = SITE_IMAGES.hero, noindex = false, scripts = '', jsonLd = '', products = [], popup = true, ...extra }) {
  const current = {};
  for (const [key, field] of Object.entries(NAV_PAGES)) current[field] = page === key ? ' aria-current="page"' : '';
  const shareImage = typeof ogImage === 'string' ? ogImage : ogImage.src;
  return {
    page,
    bodyClass: HERO_PAGES.has(page) ? 'has-hero' : '',
    title,
    description,
    canonicalUrl: `${SITE_URL}${urlPath}`,
    ogType,
    ogImage: absoluteUrl(shareUrl(shareImage, 1200)),
    robots: noindex ? '<meta name="robots" content="noindex">' : '',
    ...current,
    announcementBar: announcementBar(),
    megaMenu: megaMenu(products),
    mobileMenu: mobileMenu(),
    socialLinks: socialLinks(),
    footerContact: footerContact(),
    payments: markup.paymentList(),
    originLine: config.brand.originLine,
    companyLine: [config.company.legalName, config.company.address].filter(Boolean).join(' · '),
    welcomePercent: config.offers.welcome.percent,
    welcomeCode: config.offers.welcome.code,
    popup: popup ? 'on' : 'off',
    analytics: analyticsScript(),
    jsonLd,
    scripts,
    year: new Date().getFullYear(),
    locale: config.currency.locale,
    currency: config.currency.code,
    freeShippingCents: config.shipping.freeThreshold,
    flatRateCents: config.shipping.flatRate,
    freeShippingLabel: formatPrice(config.shipping.freeThreshold),
    flatRateLabel: formatPrice(config.shipping.flatRate),
    returnDays: config.returns.days,
    giftMessageMax: config.gifts.messageMax,
    madeIn: config.brand.madeIn,
    madeInCountry: config.brand.madeInCountry,
    fiberContent: config.brand.fiberContent,
    ...extra,
  };
}

module.exports = { render, pageData, absoluteUrl, SITE_URL, PORT, IS_PRODUCTION, campaignLive, orderByLine, announcements };
