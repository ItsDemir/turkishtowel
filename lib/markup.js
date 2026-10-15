'use strict';

// Pieces of HTML used on several pages: product cards, set features, swatches, the trust
// row under Add to Cart, star ratings and the size guide.

const config = require('../config');
const { escapeHtml, formatPrice, sizeLabel, sizeShort, inches } = require('../format');
const { imageTag } = require('./images');
const { CATEGORIES } = require('../catalog');

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((category) => [category.slug, category]));

function safeHex(value) {
  return HEX_COLOR.test(value) ? value : '#cbb89a';
}

function swatchStyle(variant) {
  const [first, second] = variant.swatch;
  return second
    ? `--swatch:linear-gradient(135deg,${safeHex(first)} 50%,${safeHex(second)} 50%)`
    : `--swatch:${safeHex(first)}`;
}

// A frame takes the color of the towel while its photograph loads.
function toneStyle(variant) {
  return `--tone:${safeHex(variant.swatch[0])}`;
}

function categoryHref(category) {
  return category.slug === 'towel-sets' ? '/sets' : `/shop/${category.slug}`;
}

function pieceCount(product) {
  return product.contents.reduce((sum, piece) => sum + piece.quantity, 0);
}

function piecesValue(product) {
  return product.contents.reduce((sum, piece) => sum + piece.quantity * piece.price, 0);
}

// The price, with the pieces' total struck through only when a set really costs less.
function priceMarkup(product, className = 'price') {
  const value = product.isSet ? piecesValue(product) : 0;
  const was = value > product.price ? ` <s class="${className}__was"><span class="visually-hidden">Bought separately </span>${formatPrice(value)}</s>` : '';
  return `<span class="${className}">${formatPrice(product.price)}${was}</span>`;
}

function payLaterNote(price) {
  const { payLater } = config.payments;
  if (!payLater.enabled || price < payLater.minimum) return '';
  const part = Math.ceil(price / payLater.installments);
  return `<p class="pay-later">Or ${payLater.installments} interest free payments of ${formatPrice(part)} with ${escapeHtml(payLater.provider)}</p>`;
}

function stars(average, { label = true } = {}) {
  const rounded = Math.round(average * 2) / 2;
  const icons = [1, 2, 3, 4, 5]
    .map((n) => {
      const fill = rounded >= n ? 'full' : rounded >= n - 0.5 ? 'half' : 'empty';
      return `<span class="star star--${fill}" aria-hidden="true"></span>`;
    })
    .join('');
  return `<span class="stars">${icons}${label ? `<span class="visually-hidden">Rated ${average} out of 5</span>` : ''}</span>`;
}

function swatchList(product, { size = 'small' } = {}) {
  const names = product.variants.map((variant) => variant.color).join(', ');
  const dots = product.variants
    .map((variant) => `<span class="swatch swatch--${size}" style="${swatchStyle(variant)}" aria-hidden="true"></span>`)
    .join('');
  return `<span class="swatches"><span class="visually-hidden">${product.variants.length} ${product.variants.length === 1 ? 'color' : 'colors'}: ${escapeHtml(names)}</span>${dots}</span>`;
}

function leadVariant(product) {
  return product.variants.find((variant) => variant.stock > 0) || product.variants[0];
}

function cardImages(product) {
  const lead = leadVariant(product);
  const images = lead.images.length > 0 ? lead.images : product.images;
  return [images[0], images[1] || null];
}

// Everything the cart needs to add this product in its first available color.
function quickAddData(product) {
  const lead = leadVariant(product);
  const image = (lead.images[0] || product.images[0]).src;
  return [
    `data-quick-add`,
    `data-id="${escapeHtml(lead.sku)}"`,
    `data-slug="${escapeHtml(product.slug)}"`,
    `data-name="${escapeHtml(product.name)}"`,
    `data-color="${escapeHtml(lead.color)}"`,
    `data-price="${product.price}"`,
    `data-image="${escapeHtml(image)}"`,
  ].join(' ');
}

const CARD_SIZES = '(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 420px';

// One product in a grid: what it is, its size, its cotton and weight, its colors, its
// price and a way in. Data attributes feed the shop filters.
function productCard(product, { position = 0, sizes = CARD_SIZES, quickAdd = true, hidden = false } = {}) {
  const lead = leadVariant(product);
  const [first, second] = cardImages(product);
  const badge = product.isSet
    ? '<span class="card__badge">Sold only as a set</span>'
    : product.newArrival
      ? '<span class="card__badge">New</span>'
      : '';
  const specs = product.isSet
    ? [`${pieceCount(product)} pieces`, config.brand.fiberContent]
    : [sizeShort(product.size), `${product.gsm} gsm cotton`];
  const soldOut = product.variants.every((variant) => variant.stock < 1);
  const rating = product.rating ? `<span class="card__rating">${stars(product.rating.average)}<span class="card__rating-count">(${product.rating.count})</span></span>` : '';

  return `
          <li class="card${second ? ' card--has-alt' : ''}"${hidden ? ' hidden' : ''} data-card data-category="${escapeHtml(product.category)}" data-colors="${escapeHtml(product.variants.map((variant) => variant.key).join(' '))}" data-weave="${escapeHtml(product.weaveKey || 'set')}" data-price="${product.price}" data-position="${position}" data-new="${product.newArrival ? 1 : 0}" data-name="${escapeHtml(product.name)}">
            <a class="card__link" href="/product/${escapeHtml(product.slug)}">
              <span class="card__media media media--portrait" style="${toneStyle(lead)}">
                ${imageTag(first, { widths: [320, 480, 750], sizes })}
                ${second ? imageTag(second, { widths: [320, 480, 750], sizes, className: 'card__alt' }) : ''}
                ${badge}
              </span>
              <span class="card__body">
                <span class="card__eyebrow">${escapeHtml(product.collection)}</span>
                <span class="card__name">${escapeHtml(product.name)}</span>
                ${rating}
                <span class="card__summary">${escapeHtml(product.summary)}</span>
                <span class="card__specs">${specs.map((spec) => `<span>${escapeHtml(spec)}</span>`).join('')}</span>
                <span class="card__row">
                  ${priceMarkup(product, 'card__price')}
                  ${swatchList(product)}
                </span>
                <span class="card__cta">${product.isSet ? 'Shop the set' : 'Shop now'}<span aria-hidden="true"> →</span></span>
              </span>
            </a>
            ${quickAdd && !soldOut ? `<div class="card__overlay"><button class="card__quick" type="button" ${quickAddData(product)}>Quick add<span class="visually-hidden"> ${escapeHtml(product.name)} in ${escapeHtml(lead.color)}</span></button></div>` : ''}
          </li>`;
}

function productGrid(products, { className = 'grid', quickAdd = true } = {}) {
  return `<ul class="${className}" data-grid>${products.map((product, position) => productCard(product, { position, quickAdd })).join('')}
        </ul>`;
}

function contentsList(product) {
  return `<ul class="contents">${product.contents
    .map(
      (piece) => `
              <li><span class="contents__qty">${piece.quantity} ×</span><a class="contents__name" href="/product/${escapeHtml(piece.slug)}">${escapeHtml(piece.name)}</a><span class="contents__size">${escapeHtml(sizeShort(piece.size))}</span></li>`
    )
    .join('')}
            </ul>`;
}

// A set on the sets page: a large photograph beside everything that is inside it.
function setFeature(product, index) {
  const lead = leadVariant(product);
  const value = piecesValue(product);
  const saving = value - product.price;
  return `
        <article class="set-feature${index % 2 ? ' set-feature--reverse' : ''}" id="${escapeHtml(product.slug)}" aria-labelledby="${escapeHtml(product.slug)}-name">
          <a class="set-feature__media media" href="/product/${escapeHtml(product.slug)}" tabindex="-1" aria-hidden="true" style="${toneStyle(lead)}">
            ${imageTag(product.images[0], { widths: [480, 750, 1080, 1600], sizes: '(max-width: 900px) 100vw, 58vw' })}
          </a>
          <div class="set-feature__body">
            <p class="set-badge">Curated set · sold only together</p>
            <h2 class="set-feature__name" id="${escapeHtml(product.slug)}-name"><a href="/product/${escapeHtml(product.slug)}">${escapeHtml(product.name)}</a></h2>
            <p class="set-feature__text">${escapeHtml(product.description)}</p>
            <h3 class="label">What is inside</h3>
            ${contentsList(product)}
            <div class="set-feature__foot">
              <p class="set-feature__price">${priceMarkup(product, 'set-price')}${saving > 0 ? `<span class="set-feature__value">You save ${formatPrice(saving)}</span>` : ''}</p>
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

function categoryTile(category, products, index) {
  const size = category.size ? sizeShort(category.size) : 'Curated sets';
  return `
          <li class="tile tile--${index + 1}">
            <a class="tile__link" href="${categoryHref(category)}">
              <span class="tile__media media">
                ${imageTag(category.image, { widths: [480, 750, 1080], sizes: index === 0 ? '(max-width: 900px) 100vw, 50vw' : '(max-width: 900px) 50vw, 25vw' })}
              </span>
              <span class="tile__caption">
                <span class="tile__name">${escapeHtml(category.name)}</span>
                <span class="tile__meta">${escapeHtml(size)} · ${escapeHtml(fromPrice(products))}</span>
              </span>
            </a>
          </li>`;
}

function trustRow({ compact = false } = {}) {
  const { shipping, returns } = config;
  const items = [
    ['truck', `Free US shipping over ${formatPrice(shipping.freeThreshold)}`],
    ['return', `${returns.days} day returns`],
    shipping.dutiesIncluded ? ['globe', 'Duties and taxes included'] : null,
    ['lock', 'Secure checkout'],
  ].filter(Boolean);
  return `<ul class="trust${compact ? ' trust--compact' : ''}">${items
    .map(([icon, text]) => `<li>${ICONS[icon]}<span>${escapeHtml(text)}</span></li>`)
    .join('')}</ul>`;
}

function paymentList() {
  return `<ul class="payments" aria-label="Payment methods we accept">${config.payments.methods
    .map((method) => `<li>${escapeHtml(method)}</li>`)
    .join('')}</ul>`;
}

// Line icons drawn in the site's own stroke, so no icon font or image is needed.
const ICON_ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const ICONS = {
  truck: `<svg ${ICON_ATTRS}><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/></svg>`,
  return: `<svg ${ICON_ATTRS}><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-3"/></svg>`,
  globe: `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/></svg>`,
  lock: `<svg ${ICON_ATTRS}><rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
};

// Every towel drawn to scale beside a 5 ft 6 in figure.
function sizeGuideDiagram() {
  const pieces = CATEGORIES.filter((category) => category.size).sort((a, b) => a.size.w * a.size.h - b.size.w * b.size.h);
  const scale = 2; // pixels per inch
  const gap = 14;
  const personHeight = 66 * scale;
  const base = 170;
  let x = 10;
  const shapes = pieces.map((category) => {
    const w = Number(inches(category.size.w)) * scale;
    const h = Number(inches(category.size.h)) * scale;
    const shape = `
        <g>
          <rect x="${x}" y="${base - h}" width="${w}" height="${h}" class="size-guide__towel"/>
          <text x="${x + w / 2}" y="${base + 16}" text-anchor="middle" class="size-guide__label">${escapeHtml(category.singular)}</text>
          <text x="${x + w / 2}" y="${base + 30}" text-anchor="middle" class="size-guide__dims">${escapeHtml(sizeShort(category.size))}</text>
        </g>`;
    x += w + gap + 12;
    return shape;
  });
  const personX = x + 10;
  const head = 9;
  const person = `
        <g class="size-guide__person" aria-hidden="true">
          <circle cx="${personX + 16}" cy="${base - personHeight + head}" r="${head}"/>
          <path d="M${personX + 4} ${base - personHeight + 22} h24 l2 52 h-6 l-1 ${personHeight - 80} h-6 l-1 -${personHeight - 80 - 6} h-2 l-1 ${personHeight - 80 - 6} h-6 l-1 -${personHeight - 80} h-6 z"/>
          <text x="${personX + 16}" y="${base + 16}" text-anchor="middle" class="size-guide__label">5 ft 6 in</text>
        </g>`;
  const width = personX + 50;
  return `<figure class="size-guide">
      <svg viewBox="0 0 ${width} ${base + 40}" role="img" aria-labelledby="size-guide-title">
        <title id="size-guide-title">Each towel drawn to scale beside a 5 foot 6 inch person</title>${shapes.join('')}${person}
      </svg>
      <figcaption>Drawn to scale. Most American bath towels are about 30 × 56 in, so if you like a big towel, choose a bath sheet.</figcaption>
    </figure>`;
}

function jsonLd(data) {
  // < is escaped so that no text inside the data can close the script element.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

module.exports = {
  CATEGORY_BY_SLUG,
  safeHex,
  swatchStyle,
  toneStyle,
  categoryHref,
  pieceCount,
  piecesValue,
  priceMarkup,
  payLaterNote,
  stars,
  swatchList,
  leadVariant,
  productCard,
  productGrid,
  contentsList,
  setFeature,
  fromPrice,
  categoryTile,
  trustRow,
  paymentList,
  sizeGuideDiagram,
  jsonLd,
  ICONS,
  sizeLabel,
};
