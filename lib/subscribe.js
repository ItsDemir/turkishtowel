'use strict';

// Newsletter sign ups. Every address is kept in the database, and when Klaviyo is
// configured (KLAVIYO_API_KEY and KLAVIYO_LIST_ID) it is also subscribed there, which is
// where the welcome email with the first order code should be sent from. Any other
// provider only needs a new branch in sendToProvider().
//
// Marketing email must follow CAN-SPAM: include the business's physical address
// (config.company.address) and a working unsubscribe link in every template.

require('dotenv').config({ quiet: true });

const db = require('../db');

const KLAVIYO_ENDPOINT = 'https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs';
const KLAVIYO_REVISION = '2024-10-15';

async function sendToProvider(email, source) {
  const key = process.env.KLAVIYO_API_KEY;
  const list = process.env.KLAVIYO_LIST_ID;
  if (!key || !list) return { provider: null };

  const response = await fetch(KLAVIYO_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${key}`,
      revision: KLAVIYO_REVISION,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          custom_source: source,
          profiles: {
            data: [{ type: 'profile', attributes: { email, subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } } } }],
          },
        },
        relationships: { list: { data: { type: 'list', id: list } } },
      },
    }),
  });
  if (!response.ok) throw new Error(`Klaviyo responded with ${response.status}`);
  return { provider: 'klaviyo' };
}

// Resolves to { isNew } for a valid address. Duplicates are fine: the answer to the
// visitor is the same either way.
async function subscribe(email, { source = 'footer' } = {}) {
  let isNew = true;
  try {
    isNew = await db.addSubscriber(email);
  } catch (error) {
    console.error(`A sign up could not be saved: ${error.message}`);
  }
  try {
    await sendToProvider(email, `Website ${source}`);
  } catch (error) {
    console.error(`Newsletter provider failed for a sign up: ${error.message}`);
  }
  return { isNew };
}

module.exports = { subscribe };
