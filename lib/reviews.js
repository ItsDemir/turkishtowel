'use strict';

// Customer reviews. They are read from data/reviews.json for now, behind this small
// adapter, so that moving to Judge.me, Okendo, Yotpo or Stamped later only means
// rewriting load(). The file ships empty: nothing here is ever invented.
//
// A review looks like:
// { productSlug, rating (1 to 5), title, body, authorFirstName, authorLastInitial,
//   location, colorPurchased, verifiedPurchase, date (YYYY-MM-DD), photos: [url] }
//
// Every published review is shown, whatever its rating. Display code must never filter
// out or hide low ratings.

function load() {
  try {
    const rows = require('../data/reviews.json');
    return Array.isArray(rows) ? rows.filter(valid) : [];
  } catch {
    return [];
  }
}

function valid(review) {
  return (
    review &&
    typeof review.productSlug === 'string' &&
    Number.isInteger(review.rating) &&
    review.rating >= 1 &&
    review.rating <= 5 &&
    typeof review.body === 'string' &&
    typeof review.authorFirstName === 'string'
  );
}

const REVIEWS = load();

function forProduct(slug) {
  return REVIEWS.filter((review) => review.productSlug === slug);
}

// { count, average, breakdown: { 5: n, 4: n, ... } } or null when there are none.
function summary(slug) {
  const reviews = forProduct(slug);
  if (reviews.length === 0) return null;
  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let total = 0;
  for (const review of reviews) {
    breakdown[review.rating] += 1;
    total += review.rating;
  }
  return { count: reviews.length, average: Math.round((total / reviews.length) * 10) / 10, breakdown };
}

function all() {
  return REVIEWS.slice();
}

module.exports = { forProduct, summary, all };
