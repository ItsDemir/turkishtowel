'use strict';

const config = require('./config');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

const wholeFormatter = new Intl.NumberFormat(config.currency.locale, {
  style: 'currency',
  currency: config.currency.code,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const centsFormatter = new Intl.NumberFormat(config.currency.locale, {
  style: 'currency',
  currency: config.currency.code,
});

// Prices are integers in cents. Whole dollars drop the decimals, so 5800 is "$58".
function formatPrice(cents) {
  const amount = Math.round(Number(cents) || 0);
  return amount % 100 === 0 ? wholeFormatter.format(amount / 100) : centsFormatter.format(amount / 100);
}

// Sizes are stored in centimeters and shown in inches first, rounded to the nearest
// half inch (a value on the quarter, such as 15.75, rounds up), so the two can never
// drift apart.
function inches(cm) {
  const value = Math.round((cm / 2.54) * 2 + 0.02) / 2;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function sizeLabel(size) {
  if (!size || !size.w) return '';
  return `${inches(size.w)} × ${inches(size.h)} in (${size.w} × ${size.h} cm)`;
}

function sizeShort(size) {
  if (!size || !size.w) return '';
  return `${inches(size.w)} × ${inches(size.h)} in`;
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

// "October 14", in the store's locale and in US Eastern time.
function formatDate(date) {
  return new Intl.DateTimeFormat(config.currency.locale, { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
}

module.exports = { escapeHtml, formatPrice, inches, sizeLabel, sizeShort, firstName, formatDate };
