# Pamuq

A direct to consumer store for hand-loomed Turkish peshtemal towels, woven in the Aegean. It is a small stack that you own end to end: plain HTML, CSS and JavaScript in the browser, a thin Node and Express server, Stripe for payment, Resend for order emails and a single SQLite file for orders and stock. There is no Shopify, no WooCommerce and no platform fee.

## What is in it

Six pages, all served by Express with a shared header and footer:

* `/` the homepage
* `/collection` every product, with a colour filter
* `/product/:slug` a product page with gallery, colours and an accordion
* `/cart` the bag
* `/checkout` not a page: the bag is posted here and the server sends the customer to Stripe
* `/order-confirmed` the thank you page, which checks the payment with Stripe

The bag also has a drawer that slides in from the right when something is added.

## Prerequisites

* Node 22 or newer. The current better-sqlite3 needs it, and Node 18 and 20 are no longer supported by the Node project.
* A Stripe account. Test mode is enough to start.
* The [Stripe CLI](https://docs.stripe.com/stripe-cli) for receiving webhooks on your own machine.
* A Resend account and an API key.

## Setup

```bash
git clone <your repository URL>
cd turkishtowel
npm install
cp .env.example .env
```

Open `.env` and fill in:

* `STRIPE_SECRET_KEY` your test secret key, which starts with `sk_test_`
* `STRIPE_WEBHOOK_SECRET` the signing secret that `stripe listen` prints, see below
* `RESEND_API_KEY` your Resend key, which starts with `re_`
* `PORT` defaults to 3000

Three more settings are optional:

* `SITE_URL` the public address of the site, used for Stripe return links and links in emails. It defaults to `http://localhost:PORT`.
* `EMAIL_FROM` the sender of the order emails. The default is Resend's sandbox sender, which only delivers to the email address of your own Resend account. Verify a domain in Resend to send to customers.
* `DATABASE_PATH` where the SQLite file lives. It defaults to `pamuq.db` in the project folder.

## Run

```bash
node seed.js
node server.js
```

Then open http://localhost:3000. The same commands are available as `npm run seed`, `npm start` and `npm run dev` (which restarts on file changes).

`seed.js` loads the four products. It is safe to run again: it updates products, colours and pictures and never touches stock levels or orders. If you forget it, the server seeds an empty database by itself when it starts.

The site works without any keys, so you can browse and style it first. Checkout needs `STRIPE_SECRET_KEY`, the webhook needs `STRIPE_WEBHOOK_SECRET` and emails need `RESEND_API_KEY`.

## Stripe webhook setup

In a second terminal, with the server running:

```bash
stripe login
stripe listen --forward-to localhost:3000/webhook
```

The CLI prints a signing secret that starts with `whsec_`. Put it in `.env` as `STRIPE_WEBHOOK_SECRET` and restart the server.

Now take a test payment. Add a towel to the bag, choose Proceed to checkout and pay with card number `4242 4242 4242 4242`, any future expiry date and any three digit CVC. Stripe sends the customer to `/order-confirmed`, and at about the same moment sends `checkout.session.completed` to `/webhook`.

Either one records the order in SQLite, takes the units out of stock and sends the confirmation email. The two can arrive in any order, or together, and the order is still stored once and the email sent once. If Resend is down when the order arrives, the order is kept and the email is tried again the next time the confirmation page is opened.

Two details worth knowing:

* Only Checkout Sessions created by this site become orders. They carry the metadata `store=pamuq`, so events from other projects on the same Stripe account, and fixtures from `stripe trigger`, are acknowledged and ignored. Use a test payment instead.
* The webhook handler also accepts `checkout.session.async_payment_succeeded`, for payment methods that confirm later.

## How it works

* **The bag** lives in `localStorage` under `pamuq_cart` as a JSON array of `{ id, slug, name, colour, price, quantity, image }`. The server keeps no basket.
* **Checkout** is a POST to `/checkout`. The server reads only the item ids and quantities from the request and takes names and prices from the database, so an edited bag cannot change what is charged. It creates a Stripe Checkout Session in `payment` mode, in GBP, with the shipping address and phone number required, and sends the customer to Stripe's hosted page. A plain form post is answered with a 303 redirect, and the bag page asks for JSON so it can show errors in place.
* **Delivery** is free over £100 and £5 below that. Both numbers, the list of countries Stripe will accept an address from, and the largest quantity per line are constants at the top of `server.js`.
* **Stock** is one number per colour in the `variants` table. Checkout refuses a bag that asks for more than is in stock, and a paid order takes its units out. A sold out colour shows as sold out on its product page.
* **Money** is stored and calculated in pence as integers everywhere. Prices are only turned into text, such as £68, when they are displayed.
* **Orders** go in the `orders` table, with the order number `PAM-` followed by a timestamp. Newsletter sign ups go in `subscribers`.
* **Stripe.js** is loaded from `https://js.stripe.com/v3/` on the bag page only, so that Stripe can spot fraud on the way to Checkout. The payment itself is a redirect, so no publishable key is needed.
* **The bag icon** is the Tabler Icons `shopping-bag` drawing, inlined as SVG so that the site needs no icon font.

## Adding your own product images

The pictures are Unsplash placeholders. I chose their photo IDs without being able to preview them, so check each one, and swap any that do not suit. If a photo cannot load, its frame shows the colour of the towel instead, so a bad ID looks tidy rather than broken.

To use your own photographs:

1. Export each picture as a JPEG in portrait 4:5, about 1400 pixels wide, and copy it into `public/images/`. A good naming scheme is the product and colour, such as `hammam-classic-stone.jpg`.
2. In `seed.js`, replace the Unsplash photo ID in each `colour(...)` call with the path of your file, for example `'/images/hammam-classic-stone.jpg'`. Do the same for the gallery scenes near the top of the file, which are written as `picture('...')`.
3. Do the same for the homepage hero and the brand story picture in `SITE_IMAGES` at the top of `server.js`.
4. Update the alt text beside each picture so it describes the new photograph.
5. Run `node seed.js` and refresh. Stock and orders are untouched.

Unsplash resizes pictures on request, but local files are served as they are, so export them at sensible sizes.

## Going live

1. **Stripe.** In the Dashboard, switch to live mode and copy the live secret key into `STRIPE_SECRET_KEY`. Under Developers and Webhooks, add an endpoint at `https://your-domain/webhook` for the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`, then copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
2. **Resend.** Verify your sending domain, then set `EMAIL_FROM` to an address on it, for example `Pamuq <orders@your-domain>`. The unsubscribe link in the email is a placeholder that opens a message to that address, so swap in your mailing list provider's link when you have one.
3. **Site address.** Set `SITE_URL` to the public https address and `NODE_ENV` to `production`, which also turns on template caching.
4. **Deploy** to Railway, Render or Fly.io. The start command is `npm start`, and the build step is `npm install`. The hosts set `PORT` themselves.
5. **Keep the database.** SQLite is a single file, so it needs storage that survives a restart. Create a volume or persistent disk, mount it at `/data`, and set `DATABASE_PATH=/data/pamuq.db`. On Fly.io that is `fly volumes create`, on Railway a Volume, on Render a Disk. Without one, orders disappear on every deploy. Back it up by copying the file, or with `sqlite3 pamuq.db ".backup backup.db"`.
6. **First start.** The server seeds an empty database by itself. Run a test purchase in live mode with a real card, then refund it from the Dashboard.

## Previewing on Vercel

This is for looking at the site at a shareable address. It is not a way to run the shop.

Vercel runs the server as short-lived functions with no persistent disk. On Vercel the SQLite file therefore lives in the temporary folder, each function instance gets its own copy, and a copy starts empty and is seeded again whenever an instance starts. Pages, product browsing, the bag and the drawer all work. Orders, stock levels and newsletter sign ups are not kept, and a test payment can be recorded twice if two instances handle it. Do not point live Stripe keys at a preview. A real shop on Vercel needs its data in a hosted database, which is a separate change.

To deploy from the Vercel dashboard, choose Add New, then Project, import this GitHub repository, leave the framework preset as Other, and deploy. Vercel builds `main` as the production deployment and every other branch as a preview, and builds again on each push.

To deploy from your own machine instead, which needs no GitHub connection:

```bash
git checkout main
git pull
npx vercel
```

Log in when asked, accept the defaults, and open the address it prints. Add `--prod` to the last command to publish it as the production deployment.

Good to know:

* No settings are required. Without `SITE_URL`, the site uses the project's own address on a production deployment and the deployment's address on a preview. Set `SITE_URL` for a custom domain.
* To try checkout on a preview, add a test `STRIPE_SECRET_KEY` and a `RESEND_API_KEY` under Environment Variables in the project settings. `STRIPE_WEBHOOK_SECRET` is not needed, because the confirmation page records the order and sends the email by itself.
* Vercel puts a login in front of preview addresses and the long deployment addresses (Deployment Protection), so anyone who is not on your team sees a Vercel sign in page there. The project's own production address, such as `https://turkishtowel.vercel.app`, is public. To share a preview, turn protection off for previews or create a shareable link in the project settings.
* How it is wired: `api/index.js` hands the Express app to Vercel as one function, and `vercel.json` sends every request that is not a file in `public/` to it. The entry point also removes the request and response helpers that Vercel adds, so Express reads request bodies and sends responses the way it does everywhere else.

## Project layout

```
server.js              Express server, routes and Stripe logic
seed.js                loads the products into SQLite
db.js                  SQLite setup and queries
email.js               the order confirmation email and the Resend call
format.js              price formatting and HTML escaping shared by the two above
package.json
.env.example
api/index.js           the entry point Vercel uses for a preview
vercel.json            sends requests to that entry point
public/
  css/main.css         every style on the site
  js/cart.js           the bag, the header count and the drawer
  js/product.js        colour swatches, gallery, add to bag, accordion
  js/site.js           header, colour filter, newsletter, failed pictures
  images/              put your own photographs here
views/
  partials/header.html the document head and the site header
  partials/footer.html the footer, the drawer and the scripts
  index.html  collection.html  product.html  cart.html  order-confirmed.html
  error.html           used for pages that are not found
```

A few small additions to the layout in the brief: `format.js`, because the server and the email both need the same price formatting and escaping, `js/site.js`, for behaviour that every page shares, and `api/index.js` with `vercel.json` for the Vercel preview.

## Design notes

* The palette, type scale and motion rules from the brief are CSS variables and rules at the top of `main.css`. Only the hero fades in on load, only the bag drawer slides, and every transition and animation is switched off for visitors who ask for reduced motion.
* Every interactive element works from the keyboard. The drawer makes the page behind it inert while it is open, closes on Escape and returns focus to where it came from.
* The olive used for secondary text, `#7a7560`, has a contrast of 4.17 to 1 on the page background. That is just under the 4.5 to 1 that WCAG AA asks for at small sizes. Changing `--olive` to `#807b65` clears it with almost no visible difference.
* The breakpoint is 768px. There is no tablet layout.
