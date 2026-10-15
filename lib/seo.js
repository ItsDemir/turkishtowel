'use strict';

// Structured data (JSON-LD) for search engines and Pinterest Rich Pins.

const config = require('../config');
const { absoluteUrl, SITE_URL } = require('./render');
const { shareUrl } = require('./images');
const { inches } = require('../format');

const money = (cents) => (cents / 100).toFixed(2);

function organization() {
  const sameAs = Object.values(config.social).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: config.brand.name,
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    ...(sameAs.length ? { sameAs } : {}),
    ...(config.support.email ? { contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: config.support.email, areaServed: 'US' } } : {}),
  };
}

function shippingDetails(price) {
  const { shipping } = config;
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: money(price >= shipping.freeThreshold ? 0 : shipping.flatRate), currency: config.currency.code },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: shipping.country },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: shipping.makeDays.min, maxValue: shipping.makeDays.max, unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: shipping.transitDays.min, maxValue: shipping.transitDays.max, unitCode: 'DAY' },
    },
  };
}

function returnPolicy() {
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: config.shipping.country,
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: config.returns.days,
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: 'https://schema.org/ReturnShippingFees',
  };
}

function product(item, { variant, images, url }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    description: item.description,
    image: images.slice(0, 4).map((image) => absoluteUrl(shareUrl(image.src, 1200))),
    sku: variant.sku,
    brand: { '@type': 'Brand', name: config.brand.name },
    material: config.brand.fiberContent,
    color: variant.color,
    countryOfOrigin: config.brand.madeInCountry,
    ...(item.size ? { size: `${inches(item.size.w)} x ${inches(item.size.h)} in` } : {}),
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(url),
      priceCurrency: config.currency.code,
      price: money(item.price),
      availability: variant.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      shippingDetails: shippingDetails(item.price),
      hasMerchantReturnPolicy: returnPolicy(),
    },
  };
  // Ratings are added only when real reviews exist.
  if (item.rating) {
    data.aggregateRating = { '@type': 'AggregateRating', ratingValue: item.rating.average, reviewCount: item.rating.count };
  }
  if (item.reviews && item.reviews.length) {
    data.review = item.reviews.slice(0, 10).map((review) => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5 },
      author: { '@type': 'Person', name: `${review.authorFirstName} ${review.authorLastInitial || ''}`.trim() },
      ...(review.date ? { datePublished: review.date } : {}),
      ...(review.title ? { name: review.title } : {}),
      reviewBody: review.body,
    }));
  }
  return data;
}

function breadcrumbs(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, url], index) => ({ '@type': 'ListItem', position: index + 1, name, item: absoluteUrl(url) })),
  };
}

function faqPage(groups) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: groups.flatMap((group) =>
      group.questions.map((entry) => ({ '@type': 'Question', name: entry.q, acceptedAnswer: { '@type': 'Answer', text: entry.text } }))
    ),
  };
}

module.exports = { organization, product, breadcrumbs, faqPage, shippingDetails, returnPolicy };
