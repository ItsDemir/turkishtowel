'use strict';

// Writes public/products/manifest.json from the photos in public/products, so that the
// site on Vercel knows which real photos exist. Run it after adding photos:
//   npm run photos

const fs = require('fs');
const path = require('path');
const { scan, ROOT } = require('../lib/photos');

const manifest = scan();
fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const count = Object.values(manifest).reduce((sum, colors) => sum + Object.values(colors).reduce((n, files) => n + files.length, 0), 0);
process.stdout.write(`Found ${count} product photos in ${Object.keys(manifest).length} products.\n`);
