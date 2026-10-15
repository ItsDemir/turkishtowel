'use strict';

// Every business setting lives here: money, shipping, offers, contact details, social
// links and the brand facts the copy is built from. Prices themselves live with each
// product in catalog.js. Amounts are integers in cents.

require('dotenv').config({ quiet: true });

module.exports = {
  brand: {
    name: 'Pamuq',
    // Where the towels are actually woven. Every "woven in" and "made in" line on the
    // site reads this value, so change it here if production moves.
    madeIn: 'Denizli, Turkey',
    madeInCountry: 'Turkey',
    // The mood, not the origin. Bodrum is used for imagery, names and campaign lines.
    inspiredBy: 'Bodrum',
    fiberContent: '100% Turkish cotton',
    originLine: 'Inspired by Bodrum. Woven in Turkey.',
  },

  currency: { code: 'USD', locale: 'en-US' },

  shipping: {
    country: 'US',
    freeThreshold: 10000, // TODO: confirm once real shipping costs from Turkey are known
    flatRate: 1000, // charged below the free shipping threshold
    // Woven to order, then shipped from Turkey. Counted in US business days.
    makeDays: { min: 5, max: 7 },
    transitDays: { min: 4, max: 7 },
    // Set to true only once shipping is Delivered Duty Paid (or from a US warehouse), so
    // that customers never pay import fees at the door. It switches on the "Duties
    // included" lines across the site.
    dutiesIncluded: false,
  },

  returns: { days: 30 },

  offers: {
    // The code must also exist as a promotion code in the Stripe Dashboard.
    welcome: { percent: 10, code: 'WELCOME10' },
  },

  gifts: { messageMax: 200 },

  // Shown under Add to Cart and in the footer. List only what Stripe Checkout has
  // switched on in the Dashboard.
  payments: {
    methods: ['Visa', 'Mastercard', 'Amex', 'Discover', 'Apple Pay', 'Google Pay'],
    payLater: { enabled: false, provider: 'Klarna', installments: 4, minimum: 5000 },
  },

  support: {
    email: process.env.SUPPORT_EMAIL || '', // TODO: add the support address
    responseTime: 'We reply within one business day.',
  },

  company: {
    legalName: process.env.COMPANY_LEGAL_NAME || '', // TODO
    address: process.env.COMPANY_ADDRESS || '', // TODO: needed for CAN-SPAM in marketing email
  },

  // Icons with an empty address are hidden.
  social: {
    instagram: '',
    pinterest: '',
    tiktok: '',
  },

  // A seasonal slot on the homepage. Shown only between the two dates.
  campaign: {
    startsOn: '2026-11-01',
    endsOn: '2026-12-24',
    eyebrow: 'The holiday edit',
    title: 'Give the towels they would never buy themselves.',
    text: 'Every set arrives in a cotton gift bag.',
    link: { href: '/gifts', label: 'Shop gifts' },
    // Last day to order for delivery by the holiday, given weaving and shipping time.
    orderBy: '2026-12-01',
    orderByLabel: 'holiday delivery',
  },

  analytics: {
    // Vercel Web Analytics. Switch it on in the Vercel dashboard first, then set
    // VERCEL_ANALYTICS=1 in the project's environment variables.
    vercel: process.env.VERCEL_ANALYTICS === '1',
  },
};
