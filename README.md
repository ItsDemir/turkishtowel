# Pamuq

A direct to consumer store for luxury Turkish towels, sold in the US. The towels are woven from 100% Turkish cotton in Denizli, Turkey, and the brand takes its mood from Bodrum on the Aegean coast. It is a small stack that you own end to end: plain HTML, CSS and JavaScript in the browser, a thin Node and Express server, Stripe Checkout for payment, Resend for order and support emails and a single SQLite file for orders and stock. There is no Shopify, no WooCommerce and no platform fee.

The live site is https://turkishtowel.vercel.app.

## Ground rules the code follows

* **US conventions.** Prices in USD, American spelling, sizes in inches first with centimeters second, dates such as October 15, 2026, and shipping counted in US business days.
* **No invented social proof.** No made up reviews, ratings, review counts, press logos, "as seen in" badges or "people are viewing this" counters. Reviews ship empty and only real ones are ever shown, low ratings included.
* **No fake scarcity.** No countdown timers or invented stock warnings.
* **Truthful origin.** Every product page states its fiber content and "Made in Turkey". Every "woven in" and "made in" line reads `brand.madeIn` in `config.js`. Bodrum is the inspiration, never the claimed place of manufacture.
* **Settings, not hard coding.** Money, shipping, offers, contact details and brand facts live in `config.js`. Products live in `catalog.js`.

## Pages

* `/` the homepage: Bodrum hero, categories, best sellers, why a good towel matters, sets, the Bodrum and Denizli story, the welcome offer
* `/shop` every towel, with filters for category, weave, color and price and a sort order. `/shop/:category` opens it on one category: `bath-towels`, `hand-towels`, `washcloths`, `guest-towels` or `bath-sheets` (`/shop/towel-sets` redirects to `/sets`)
* `/sets` the curated sets, sold only as a whole
* `/beach-and-pool` the peshtemal and the towels that suit the beach
* `/gifts` sets, gifts by price and gifts by occasion
* `/product/:slug` a product page: gallery per color with zoom, size in inches and centimeters, weave and weight, care, what is inside a set, shipping estimate in real dates, reviews and related pieces
* `/cart` the cart, with gift options. A drawer also slides in from the right on every page
* `/checkout` not a page: the cart is posted here and the server sends the customer to Stripe
* `/order-confirmed` the thank you page, which checks the payment with Stripe
* `/about`, `/contact`, `/faq`
* `/shipping`, `/returns`, `/privacy`, `/terms`, `/accessibility` the policies. Each carries a `TODO: review with a lawyer` comment and must be checked by one before launch
* `/sitemap.xml`, `/robots.txt`, `/feeds/google.xml` (Google Merchant Center feed), `/catalog.json`, `/site.webmanifest`

The old `/collection` address redirects to `/shop`.

## The range

`catalog.js` holds the whole range:

* **Four weaves**, named after places on the Aegean coast: Ege Plush (700 gsm loop terry), Assos Rib (550 gsm ribbed terry), Datça Waffle (380 gsm honeycomb) and Bodrum Peshtemal (240 gsm flat weave with a hand knotted fringe).
* **Six categories**: washcloths 12 × 12 in, guest towels 16 × 23.5 in, hand towels 19.5 × 35.5 in, bath towels 27.5 × 55 in, bath sheets 39.5 × 71 in, and towel sets. Sizes are stored in centimeters and converted to the nearest half inch for display (`format.js`), so the two can never disagree.
* **Ten colorways**: Salt, Raw Cotton, Sandstone, Pamukkale, Olive Grove, Aegean, Terracotta and Basalt, plus two woven stripes for the peshtemal.
* **Five sets**, each one product with its own price about 10% below its pieces bought separately.

Prices in USD:

| Product | Price |
| --- | --- |
| Ege Bath Towel | $58 |
| Assos Rib Bath Towel | $62 |
| Datça Waffle Bath Towel | $48 |
| Ege Hand Towel | $32 |
| Assos Rib Hand Towel | $34 |
| Datça Waffle Hand Towel | $28 |
| Ege Washcloth | $14 |
| Datça Waffle Washcloth | $12 |
| Ege Guest Towel | $22 |
| Bodrum Guest Towel | $24 |
| Ege Bath Sheet | $98 |
| Assos Rib Bath Sheet | $108 |
| Bodrum Peshtemal | $68 |
| The Essential Trio | $94 |
| The Couple's Set | $188 |
| The Guest Bathroom Set | $122 |
| The Full Bathroom Set | $428 |
| The Hammam Spa Set | $224 |

To change a price, edit it in `catalog.js` (in cents), bump `CATALOG_VERSION` at the top of the file and deploy.

## Settings (`config.js`)

* `brand` the name, where the towels are made, the fiber content and the origin line.
* `shipping` the free shipping threshold ($100), the flat rate below it ($10), the weaving and transit times used for the arrival dates, and `dutiesIncluded`, which turns on the "Duties included" lines once shipping is Delivered Duty Paid.
* `returns` the return window in days.
* `offers.welcome` the 10% first order offer and its code, `WELCOME10`. The code must also be created as a promotion code in the Stripe Dashboard.
* `payments` the payment methods shown under Add to Cart and in the footer, and the optional pay later line.
* `support`, `company` the support address, the legal name and the mailing address, read from environment variables.
* `social` Instagram, Pinterest and TikTok links. Empty ones are hidden.
* `campaign` the seasonal homepage slot and its dates.
* `analytics` switches Vercel Web Analytics on.

## Setup

Node 22 or newer is required.

```bash
git clone <your repository URL>
cd turkishtowel
npm install
cp .env.example .env
npm start
```

Then open http://localhost:3000. The site works without any keys, so you can browse it first. `npm run dev` restarts on file changes and `npm test` runs the smoke tests.

The server seeds an empty database by itself and re-seeds whenever `CATALOG_VERSION` is higher than the one the database was seeded with. `npm run seed` does the same by hand. Seeding never touches stock levels or orders.

### Environment variables

| Variable | Needed for |
| --- | --- |
| `STRIPE_SECRET_KEY` | Checkout. Starts with `sk_test_` or `sk_live_`. |
| `STRIPE_WEBHOOK_SECRET` | The `/webhook` endpoint. Starts with `whsec_`. |
| `STRIPE_AUTOMATIC_TAX` | Set to `1` after turning on Stripe Tax in the Dashboard, so sales tax is calculated at checkout. |
| `RESEND_API_KEY` | Order confirmations and contact form messages. |
| `EMAIL_FROM` | The sender, on a domain verified in Resend, for example `Pamuq <orders@pamuq.com>`. |
| `SUPPORT_EMAIL` | Shown on the contact page and policies, and where contact form messages are sent. |
| `COMPANY_LEGAL_NAME` | Used in the terms and privacy policy. |
| `COMPANY_ADDRESS` | The business mailing address. Required by CAN-SPAM in every marketing email. |
| `KLAVIYO_API_KEY`, `KLAVIYO_LIST_ID` | Optional. Newsletter sign ups are always kept in SQLite and are also added to this Klaviyo list when set. |
| `VERCEL_ANALYTICS` | Set to `1` after turning on Web Analytics in the Vercel project. |
| `IMAGE_OPTIMIZER` | Set to `off` to stop routing photos through Vercel Image Optimization. |
| `SITE_URL` | The public https address, used in Stripe return links, emails, canonical links and the sitemap. |
| `DATABASE_PATH` | Where the SQLite file lives. Defaults to `pamuq.db`. |
| `PORT` | Defaults to 3000. |

## Stripe

* Checkout is a Stripe Checkout Session in USD that accepts US shipping addresses only. The server reads only product ids and quantities from the cart and takes names and prices from `catalog.js`, so an edited cart cannot change what is charged.
* Shipping is added by the server: free from $100, otherwise $10.
* **Payment methods** (cards, Apple Pay, Google Pay, Link, Klarna, Afterpay) are switched on in the Stripe Dashboard, not in code. Keep `payments.methods` in `config.js` in step with what is switched on.
* **Discount codes** are Stripe promotion codes. Create `WELCOME10` (10% off, first order only) in the Dashboard.
* **Sales tax**: turn on Stripe Tax, register in the states where you have nexus, then set `STRIPE_AUTOMATIC_TAX=1`.
* **Gift orders**: the cart can mark an order as a gift with a message and hidden prices. Both are stored with the order and printed on the confirmation email.

### Webhook

Locally, with the server running:

```bash
stripe listen --forward-to localhost:3000/webhook
```

Put the `whsec_` secret it prints in `.env`. Pay with card `4242 4242 4242 4242`, any future date and any CVC. Both the confirmation page and the webhook record the order; whichever arrives first wins and the order is stored and emailed once. In production, add an endpoint at `https://your-domain/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.

Only sessions created by this site (metadata `store=pamuq`) become orders.

## Photography

Real product photos go in `public/products/{product}/{color}/` and replace the stock photos automatically, color by color. `public/products/README.md` has the folder names, the shot list and the priority order, and `docs/image-style-guide.md` has the look. After adding photos run `npm run photos` and commit the photos with `public/products/manifest.json`.

Until then the site uses free stock photography from Pexels, listed in `PHOTOS` at the top of `catalog.js`. The homepage hero, story, workshop and founder photos are in `SITE_IMAGES` in the same file.

On Vercel every photo, local or remote, is served through Vercel Image Optimization (`/_vercel/image`, set up in `vercel.json`), which resizes it for each screen and converts it to AVIF or WebP. If the optimizer ever fails, the browser falls back to the original file.

## Reviews

Reviews are read from `data/reviews.json` through the adapter in `lib/reviews.js`. The file ships empty. Reviews submitted on the site are stored in SQLite for you to check and are not published automatically. Moving to Judge.me, Okendo, Yotpo or Stamped only means rewriting `load()` in the adapter. Product structured data includes a rating only when real reviews exist.

## Analytics

`window.PamuqTrack(name, data)` in `public/js/cart.js` sends GA4 style ecommerce events (`view_item`, `select_item`, `add_to_cart`, `view_cart`, `begin_checkout`, `purchase` and `sign_up`) to Vercel Web Analytics or to Google Analytics, whichever is on the page. Nothing is sent when neither is installed. There are no advertising pixels, so there is no cookie banner; add one before adding any.

## Vercel

The site runs on Vercel from `main`. `api/index.js` hands the Express app to Vercel as one function, `vercel.json` routes every request that is not a file in `public/` to it, and the build step regenerates the photo manifest.

Vercel functions have no lasting disk, so SQLite lives in the temporary folder and starts fresh on each instance. Pages, the cart and checkout all work, and orders are still recorded in Stripe and emailed, but the order table, newsletter sign ups, review submissions and contact messages are not kept. Before taking real orders, move that data to a hosted database (Vercel Postgres, Neon, Turso or Supabase) or run the server on a host with a persistent disk (Railway, Render or Fly.io, with `DATABASE_PATH` on a volume).

## Project layout

```
server.js              routes
config.js              every business setting
catalog.js             categories, weaves, colors, products, sets, prices and stock photos
store.js               products as the pages see them: catalog plus stock, photos and reviews
db.js                  SQLite: stock, orders, subscribers, review submissions, messages
email.js               order confirmation and contact form emails through Resend
format.js              prices, sizes, dates and HTML escaping
seed.js                loads the catalog into SQLite
content/faq.js         the FAQ, also used for FAQPage structured data
data/reviews.json      published reviews (empty)
lib/
  checkout.js          cart pricing, the Stripe session and recording orders
  shipping.js          US business days and arrival dates
  images.js            image URLs, srcset and the Vercel optimizer
  photos.js            reads public/products
  reviews.js           the reviews adapter
  seo.js               structured data
  subscribe.js         newsletter sign ups and Klaviyo
  render.js, markup.js templates and shared markup
scripts/photos.js      writes public/products/manifest.json
test/smoke.test.js     smoke tests (npm test)
docs/                  the image style guide
api/index.js           the Vercel entry point
public/
  css/main.css         every style on the site
  js/cart.js           cart, drawer, free shipping bar, gift options, analytics helper
  js/product.js        gallery, zoom, swatches, add to cart, sticky bar
  js/shop.js           filters and sort
  js/site.js           header, mega menu, search, mobile menu, popup, announcement bar
  products/            real product photos
  icons/               favicon and app icons
views/                 pages, partials and policies
```

## Design notes

* Type is Cormorant Garamond for headings and Inter for text. Colors are CSS variables at the top of `main.css`.
* Mobile first, from 375px. Tap targets are at least 44px and form fields use 16px text so phones do not zoom.
* Motion is quiet and is switched off for visitors who ask for reduced motion. Nothing is hidden when JavaScript is off.
* Every interactive element works from the keyboard, with visible focus. The cart drawer, search, mobile menu and email popup keep focus inside while open, close on Escape and return focus to where they came from.
* Small text uses `--muted` and `--clay`, which pass WCAG AA contrast.
