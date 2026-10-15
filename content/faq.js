'use strict';

// Questions and answers for /faq. The same text feeds the page and its FAQPage
// structured data, so the two never disagree. Answers are plain text.

const config = require('../config');
const { formatPrice, sizeLabel } = require('../format');
const { CATEGORIES, WEAVES } = require('../catalog');

const { shipping, returns, offers, brand } = config;
const sizes = CATEGORIES.filter((category) => category.size)
  .map((category) => `${category.singular}: ${sizeLabel(category.size)}`)
  .join('. ');

const duties = shipping.dutiesIncluded
  ? 'No. Duties and import fees are paid before your order leaves us, so there are no surprise fees at the door.'
  : 'We are setting up duty paid shipping so that you never pay anything at the door. Until then, US import duties may apply to your order, and we will tell you the exact position before you pay.';

module.exports = [
  {
    id: 'product',
    title: 'The towels',
    questions: [
      {
        q: 'What is Turkish cotton, and what makes Aegean cotton special?',
        text: 'Turkish cotton is cotton grown and woven in Turkey. Cotton from the Aegean region has long fibers, which spin into smooth, strong yarn. That is why a good Turkish towel feels soft from the first use, absorbs quickly and lasts for years.',
      },
      {
        q: 'What does gsm mean, and which weight should I pick?',
        text: `Gsm is grams per square meter, the density of the towel. Higher means plusher and heavier. ${Object.values(WEAVES)
          .map((weave) => `${weave.name} is ${weave.gsm} gsm: ${weave.weightNote}`)
          .join('. ')}. If you want a classic hotel feel, choose Ege Plush. If you want something that dries fast, choose waffle or peshtemal.`,
      },
      {
        q: 'Plush, ribbed, waffle or peshtemal: what is the difference?',
        text: 'Plush is dense loop terry, the deepest and most absorbent. Ribbed terry is a little lighter, with a crisp, tailored feel. Waffle is a light honeycomb weave that dries quickly and exfoliates gently. A peshtemal is the original Turkish towel: thin, flat woven and fringed, ideal for the beach, the pool and travel.',
      },
      {
        q: 'Will they shed lint?',
        text: 'A little in the first few washes, as with any new cotton towel. Long fibers mean far less lint than ordinary towels, and it stops after the first washes.',
      },
      {
        q: 'Do the colors fade?',
        text: 'Our colors are fast, but wash darker colors with similar shades for the first few washes. Avoid bleach and strong stain removers, which fade any cotton.',
      },
      {
        q: 'What sizes are your towels in inches?',
        text: `${sizes}. Most American bath towels are about 30 × 56 in, so if you like a big towel, choose a bath sheet.`,
      },
    ],
  },
  {
    id: 'care',
    title: 'Care',
    questions: [
      {
        q: 'How should I wash new towels?',
        text: 'Wash them before the first use, warm, with similar colors and a little less detergent than usual. New cotton grows more absorbent over its first few washes.',
      },
      {
        q: 'Why no fabric softener?',
        text: 'Softener coats the cotton fibers with a waxy film. The towel feels slippery rather than soft and absorbs far less water. Good cotton does not need it.',
      },
      {
        q: 'Can I tumble dry them?',
        text: 'Yes, on low or medium heat. Shake towels out before drying to lift the loops, and take them out while very slightly warm. Peshtemals dry fastest on a line.',
      },
    ],
  },
  {
    id: 'shipping',
    title: 'Shipping',
    questions: [
      {
        q: 'Where do you ship from?',
        text: `Every towel is woven to order in ${brand.madeIn} and shipped to you from Turkey by express courier.`,
      },
      {
        q: 'How long does US shipping take?',
        text: `Towels are woven to order and ship in ${shipping.makeDays.min} to ${shipping.makeDays.max} business days. Express transit to the US then takes ${shipping.transitDays.min} to ${shipping.transitDays.max} business days. Each product page shows an expected arrival window.`,
      },
      {
        q: 'How much is shipping?',
        text: `Free on US orders over ${formatPrice(shipping.freeThreshold)}. Below that, shipping is a flat ${formatPrice(shipping.flatRate)}. We currently ship within the United States.`,
      },
      {
        q: 'Will I pay customs duties or import fees?',
        text: duties,
      },
    ],
  },
  {
    id: 'returns',
    title: 'Returns',
    questions: [
      {
        q: 'What is your return policy?',
        text: `You can return towels within ${returns.days} days of delivery, unwashed and in their original packaging, for a full refund of the item price.`,
      },
      {
        q: 'How do I start a return?',
        text: 'Send us a message through the contact page with your order number. We will reply with return instructions within one business day.',
      },
      {
        q: 'Who pays for return shipping?',
        text: 'Return shipping is paid by the customer, unless your order arrived damaged or we sent the wrong item. In that case we cover it.',
      },
    ],
  },
  {
    id: 'gifts',
    title: 'Gifts',
    questions: [
      {
        q: 'Do your sets come gift wrapped?',
        text: 'Every set arrives in a reusable cotton gift bag at no extra cost.',
      },
      {
        q: 'Can I add a gift message?',
        text: `Yes. Tick "This is a gift" in your cart to add a message of up to ${config.gifts.messageMax} characters. We print it on a card inside the parcel.`,
      },
      {
        q: 'Can I hide the prices?',
        text: 'Yes. Gift orders can leave prices off the packing slip, so the recipient only sees the towels and your message.',
      },
      {
        q: 'Is there a discount for joining the newsletter?',
        text: `Yes. Join our list and take ${offers.welcome.percent}% off your first order.`,
      },
    ],
  },
];
