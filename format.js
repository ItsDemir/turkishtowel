'use strict';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

// Prices are integers in pence. Whole pounds drop the decimals, so 6800 becomes "£68".
function formatPrice(pence) {
  const amount = Math.round(Number(pence) || 0);
  const pounds = Math.trunc(amount / 100).toLocaleString('en-GB');
  const rest = Math.abs(amount % 100);
  return rest === 0 ? `£${pounds}` : `£${pounds}.${String(rest).padStart(2, '0')}`;
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

module.exports = { escapeHtml, formatPrice, firstName };
