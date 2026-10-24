// Loads the app's TypeScript modules (with the @/ path alias) for node:test suites.
// App code gets tests/next-server.cjs for next/server so after() tasks can be run on demand.
const path = require('path');
const root = path.resolve(__dirname, '..');
module.exports = require('jiti')(__filename, {
    alias: { '@': root, 'next/server': path.join(__dirname, 'next-server.cjs') },
    interopDefault: true,
    cache: false,
});
