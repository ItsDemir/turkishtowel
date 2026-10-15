'use strict';

// Image URLs and markup. Pexels and Unsplash resize on request. On Vercel every picture,
// local or remote, goes through Vercel Image Optimization (/_vercel/image, configured in
// vercel.json), which serves AVIF or WebP from this site's own domain. If that ever fails
// the browser falls back to the original address (see site.js).

const { escapeHtml } = require('../format');

const UNSPLASH = /^https:\/\/images\.unsplash\.com\//;
const PEXELS = /^https:\/\/images\.pexels\.com\//;

const OPTIMIZER = Boolean(process.env.VERCEL) && process.env.IMAGE_OPTIMIZER !== 'off';
// Must match "sizes" in vercel.json.
const OPTIMIZER_WIDTHS = [160, 320, 480, 640, 750, 828, 1080, 1200, 1600, 1920, 2400];

function isRemote(src) {
  return UNSPLASH.test(src) || PEXELS.test(src);
}

function resizable(src) {
  return isRemote(src) || OPTIMIZER;
}

// The address of the picture at a width, optionally cropped to a ratio such as [4, 5].
function remoteUrl(src, width, ratio) {
  if (!isRemote(src)) return src;
  const url = new URL(src);
  if (PEXELS.test(src)) {
    url.searchParams.set('auto', 'compress');
    url.searchParams.set('cs', 'tinysrgb');
  } else {
    url.searchParams.set('auto', 'format');
    url.searchParams.set('q', '80');
  }
  url.searchParams.set('w', String(width));
  if (ratio) {
    url.searchParams.set('h', String(Math.round((width * ratio[1]) / ratio[0])));
    url.searchParams.set('fit', 'crop');
  }
  return url.toString();
}

function optimizerWidth(width) {
  return OPTIMIZER_WIDTHS.find((candidate) => candidate >= width) || OPTIMIZER_WIDTHS[OPTIMIZER_WIDTHS.length - 1];
}

function imageUrl(src, width, ratio) {
  if (!OPTIMIZER) return remoteUrl(src, width, ratio);
  // The optimizer is given a large original and does the resizing itself.
  const original = remoteUrl(src, 2400, ratio);
  return `/_vercel/image?url=${encodeURIComponent(original)}&w=${optimizerWidth(width)}&q=75`;
}

function srcset(src, widths, ratio) {
  if (!resizable(src)) return '';
  const seen = new Set();
  return widths
    .map((width) => (OPTIMIZER ? optimizerWidth(width) : width))
    .filter((width) => !seen.has(width) && seen.add(width))
    .map((width) => `${imageUrl(src, width, ratio)} ${width}w`)
    .join(', ');
}

// An <img>. Pictures below the fold load lazily; the hero and the main product picture
// pass eager to load first.
function imageTag(image, { widths = [480, 750, 1080], sizes = '100vw', eager = false, ratio = null, className = '', attrs = '' } = {}) {
  if (!image || !image.src) return '';
  const set = srcset(image.src, widths, ratio);
  const middle = widths[Math.min(1, widths.length - 1)];
  return [
    '<img',
    className ? ` class="${className}"` : '',
    attrs ? ` ${attrs}` : '',
    ` src="${escapeHtml(imageUrl(image.src, middle, ratio))}"`,
    set ? ` srcset="${escapeHtml(set)}" sizes="${escapeHtml(sizes)}"` : '',
    OPTIMIZER ? ` data-fallback="${escapeHtml(remoteUrl(image.src, middle, ratio))}"` : '',
    ` alt="${escapeHtml(image.alt || '')}"`,
    eager ? ' fetchpriority="high"' : ' loading="lazy"',
    ' decoding="async">',
  ].join('');
}

// Art direction: a portrait crop for phones and the full picture for larger screens, so a
// headline never sits on the busy part of the frame.
function pictureTag(image, { className = '', eager = false } = {}) {
  if (!image || !image.src) return '';
  const portrait = srcset(image.src, [480, 750, 1080], [4, 5]);
  const source = portrait
    ? `<source media="(max-width: 768px)" srcset="${escapeHtml(portrait)}" sizes="100vw">`
    : '';
  return `<picture>${source}${imageTag(image, { widths: [1080, 1600, 2400], sizes: '100vw', eager, className })}</picture>`;
}

// A plain address for Open Graph and structured data, which need a fixed absolute URL.
function shareUrl(src, width = 1200) {
  return remoteUrl(src, width);
}

module.exports = { imageTag, pictureTag, imageUrl, shareUrl, remoteUrl, OPTIMIZER, OPTIMIZER_WIDTHS };
