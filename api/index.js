'use strict';

// Vercel entry point. The whole Express app runs as one function, and every request that
// is not a file in public/ is rewritten to it (see vercel.json).
const app = require('../server');

module.exports = (req, res) => {
  // Vercel decorates requests and responses with its own helpers. Remove them so that
  // Express parses bodies and sends responses the way it does everywhere else.
  for (const name of ['body', 'query', 'cookies']) delete req[name];
  for (const name of ['status', 'send', 'json', 'redirect']) delete res[name];

  return app(req, res);
};
