'use strict';

require('dotenv').config({ quiet: true });

const config = require('./config');
const { escapeHtml, formatPrice, firstName } = require('./format');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SUBJECT = 'Your Pamuq order is confirmed';
const DEFAULT_FROM = 'Pamuq <onboarding@resend.dev>';

// Email clients cannot load web fonts reliably, so Georgia stands in for Cormorant Garamond.
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Helvetica, Arial, sans-serif";

const COLOR = {
  background: '#0f0e0c',
  sand: '#e2d5bc',
  white: '#f5f0e8',
  olive: '#7a7560',
  border: '#2a2820',
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en-US'], { type: 'region' });
  } catch {
    return null;
  }
})();

function countryName(code) {
  if (!code) return '';
  try {
    return (regionNames && regionNames.of(code)) || code;
  } catch {
    return code;
  }
}

function addressLines(order) {
  const address = order.shippingAddress;
  if (!address) return [];
  return [
    order.shippingName || order.name,
    address.line1,
    address.line2,
    // US style: "Austin, TX 78701".
    [address.city, [address.state, address.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    countryName(address.country),
  ].filter(Boolean);
}

function senderAddress(from) {
  const match = String(from).match(/<([^>]+)>/);
  return (match ? match[1] : String(from)).trim();
}

function describeItem(item) {
  const color = item.color ? `${item.color}, ` : '';
  return `${color}quantity ${item.quantity}`;
}

const SHIPS_WITHIN = `Your towels are being woven and prepared. They ship within ${config.shipping.makeDays.min} to ${config.shipping.makeDays.max} business days.`;

function shippingLabel(order) {
  return order.shipping === 0 ? 'Free' : formatPrice(order.shipping);
}

function buildOrderEmail(order, { siteUrl = '', from = DEFAULT_FROM } = {}) {
  const name = firstName(order.name);
  const greeting = name ? `Thank you, ${name}.` : 'Thank you.';
  const preheader = `Order ${order.orderNumber} is confirmed. ${SHIPS_WITHIN}`;
  const unsubscribe = `mailto:${senderAddress(from)}?subject=Unsubscribe`;
  const address = addressLines(order);

  const itemRows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:18px 0;border-top:1px solid ${COLOR.border};font-family:${SERIF};font-size:20px;font-style:italic;line-height:1.3;color:${COLOR.white};">
            ${escapeHtml(item.name)}
            <div style="padding-top:4px;font-family:${SANS};font-size:13px;font-style:normal;color:${COLOR.olive};">${escapeHtml(describeItem(item))}</div>
          </td>
          <td align="right" valign="top" style="padding:18px 0;border-top:1px solid ${COLOR.border};font-family:${SANS};font-size:15px;color:${COLOR.sand};">${escapeHtml(formatPrice(item.lineTotal))}</td>
        </tr>`
    )
    .join('');

  const totalRow = (label, value, strong) => `
        <tr>
          <td style="padding:${strong ? '18px' : '6px'} 0 ${strong ? '0' : '6px'};${strong ? `border-top:1px solid ${COLOR.border};` : ''}font-family:${SANS};font-size:${strong ? '16px' : '14px'};color:${strong ? COLOR.white : COLOR.olive};">${escapeHtml(label)}</td>
          <td align="right" style="padding:${strong ? '18px' : '6px'} 0 ${strong ? '0' : '6px'};${strong ? `border-top:1px solid ${COLOR.border};` : ''}font-family:${SANS};font-size:${strong ? '16px' : '14px'};color:${strong ? COLOR.white : COLOR.sand};">${escapeHtml(value)}</td>
        </tr>`;

  const addressBlock = address.length
    ? `
          <tr>
            <td style="padding:40px 0 0;font-family:${SANS};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${COLOR.olive};">Shipping to</td>
          </tr>
          <tr>
            <td style="padding:12px 0 0;font-family:${SANS};font-size:15px;line-height:1.7;color:${COLOR.sand};">${address.map(escapeHtml).join('<br>')}</td>
          </tr>`
    : '';

  const html = `<!doctype html>
<html lang="en-US">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.background};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.background};">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.background}" style="background-color:${COLOR.background};">
    <tr>
      <td align="center" style="padding:56px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
          <tr>
            <td style="padding-bottom:56px;font-family:${SERIF};font-size:18px;font-weight:normal;letter-spacing:0.18em;color:${COLOR.white};">PAMUQ</td>
          </tr>
          <tr>
            <td style="font-family:${SERIF};font-size:46px;font-weight:normal;line-height:1.15;letter-spacing:-0.02em;color:${COLOR.white};">${escapeHtml(greeting)}</td>
          </tr>
          <tr>
            <td style="padding:20px 0 0;font-family:${SANS};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${COLOR.olive};">Order number</td>
          </tr>
          <tr>
            <td style="padding:6px 0 40px;font-family:${SANS};font-size:16px;color:${COLOR.sand};">${escapeHtml(order.orderNumber)}</td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${itemRows}
                <tr><td colspan="2" style="border-top:1px solid ${COLOR.border};font-size:0;line-height:0;height:12px;">&nbsp;</td></tr>
                ${totalRow('Subtotal', formatPrice(order.subtotal), false)}
                ${totalRow('Shipping', shippingLabel(order), false)}
                ${totalRow('Total', formatPrice(order.total), true)}
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${addressBlock}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:48px 0 0;font-family:${SANS};font-size:15px;line-height:1.75;color:${COLOR.sand};">${escapeHtml(SHIPS_WITHIN)}${order.gift ? `<br><br>Your gift message: “${escapeHtml(order.gift.message)}”` : ''}</td>
          </tr>
          <tr>
            <td style="padding:64px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-top:28px;border-top:1px solid ${COLOR.border};font-family:${SERIF};font-size:16px;font-weight:normal;letter-spacing:0.18em;color:${COLOR.white};">
                    ${siteUrl ? `<a href="${escapeHtml(siteUrl)}" style="color:${COLOR.white};text-decoration:none;">PAMUQ</a>` : 'PAMUQ'}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;font-family:${SANS};font-size:12px;line-height:1.7;color:${COLOR.olive};">
                    You are receiving this email because you placed an order with Pamuq.<br>
                    ${config.company.address ? `${escapeHtml(config.company.address)}<br>` : ''}
                    <a href="${escapeHtml(unsubscribe)}" style="color:${COLOR.olive};text-decoration:underline;">Unsubscribe</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    greeting,
    '',
    `Order number: ${order.orderNumber}`,
    '',
    ...order.items.map(
      (item) => `${item.name} (${describeItem(item)}): ${formatPrice(item.lineTotal)}`
    ),
    '',
    `Subtotal: ${formatPrice(order.subtotal)}`,
    `Shipping: ${shippingLabel(order)}`,
    `Total: ${formatPrice(order.total)}`,
    ...(address.length ? ['', 'Shipping to:', ...address] : []),
    '',
    SHIPS_WITHIN,
    ...(order.gift ? [`Your gift message: "${order.gift.message}"`] : []),
    '',
    'PAMUQ',
    ...(config.company.address ? [config.company.address] : []),
    `Unsubscribe: ${unsubscribe}`,
  ].join('\n');

  return { subject: SUBJECT, html, text };
}

// Returns { sent: false } when no API key is configured, so a store without email set
// up still takes orders. Any failure from Resend is thrown for the caller to log.
async function sendOrderConfirmation(order, { siteUrl = '' } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false };

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const { subject, html, text } = buildOrderEmail(order, { siteUrl, from });

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Lets Resend drop a duplicate if the same confirmation is submitted twice.
      'Idempotency-Key': `order-confirmation/${order.orderNumber}`,
    },
    body: JSON.stringify({ from, to: [order.email], subject, html, text }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend responded with ${response.status} ${detail}`.trim());
  }
  return { sent: true };
}

// Sends a message from the contact form to the support address. Resolves to
// { sent: false } when email is not set up, so the caller can tell the visitor.
async function sendSupportMessage({ name, email, orderNumber, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = config.support.email;
  if (!apiKey || !to) return { sent: false };

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const text = [`From: ${name} <${email}>`, orderNumber ? `Order: ${orderNumber}` : '', '', message].filter((line, index) => line || index > 1).join('\n');
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], reply_to: email, subject: `Contact form: ${name}`, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Resend responded with ${response.status}`);
  return { sent: true };
}

module.exports = { sendOrderConfirmation, sendSupportMessage, buildOrderEmail };
