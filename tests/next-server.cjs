// next/server for tests: the real module, except after() queues its task so a
// test decides when "post-response" work runs (real after() needs a request scope)
const real = require('module').createRequire(__filename)('next/server');

const pending = [];

module.exports = {
    ...real,
    after: task => { pending.push(task); },
    pendingAfterTasks: () => pending.length,
    runAfterTasks: () => Promise.all(pending.splice(0).map(task => (typeof task === 'function' ? task() : task))),
};
