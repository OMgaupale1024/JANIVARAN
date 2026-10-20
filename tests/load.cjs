// Loads the app's TypeScript modules (with the @/ path alias) for node:test suites
const path = require('path');
const root = path.resolve(__dirname, '..');
module.exports = require('jiti')(__filename, { alias: { '@': root }, interopDefault: true, cache: false });
