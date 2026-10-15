'use strict';

// Real product photography, dropped into public/products/{product}/{color}/ as numbered
// files such as 01-folded.jpg. A color with no folder uses the product's default/ folder,
// and a product with neither uses the stock photos in catalog.js.
//
// Locally the folders are read when the server starts. On Vercel the function cannot see
// public/, so it reads public/products/manifest.json, which `npm run photos` writes and
// the Vercel build regenerates.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public', 'products');
const IMAGE_FILE = /\.(jpe?g|png|webp|avif)$/i;

function scan() {
  const manifest = {};
  if (!fs.existsSync(ROOT)) return manifest;
  for (const product of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!product.isDirectory()) continue;
    for (const color of fs.readdirSync(path.join(ROOT, product.name), { withFileTypes: true })) {
      if (!color.isDirectory()) continue;
      const files = fs
        .readdirSync(path.join(ROOT, product.name, color.name))
        .filter((file) => IMAGE_FILE.test(file))
        .sort();
      if (files.length === 0) continue;
      manifest[product.name] ??= {};
      manifest[product.name][color.name] = files.map((file) => `/products/${product.name}/${color.name}/${file}`);
    }
  }
  return manifest;
}

function load() {
  const scanned = scan();
  if (Object.keys(scanned).length > 0) return scanned;
  try {
    return require('../public/products/manifest.json');
  } catch {
    return {};
  }
}

const MANIFEST = load();

// "03-texture-close-up.jpg" becomes "texture close up".
function shotName(file) {
  const base = path.basename(file).replace(IMAGE_FILE, '');
  const words = base.replace(/^\d+[-_ ]*/, '').replace(/[-_]+/g, ' ').trim();
  return words;
}

// Photos for one color of one product, as [{ src, alt }], or [] when there are none.
function forColor(productSlug, colorKey, productName, colorName) {
  const files = (MANIFEST[productSlug] && MANIFEST[productSlug][colorKey]) || [];
  return files.map((src, index) => {
    const shot = shotName(src);
    const subject = colorName ? `${productName} in ${colorName}` : productName;
    return { src, alt: shot ? `${subject}, ${shot}` : `${subject}, photo ${index + 1}` };
  });
}

module.exports = { scan, forColor, ROOT };
