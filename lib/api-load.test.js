const test = require('node:test');
const assert = require('node:assert/strict');

test('Vercel API handlers load with the installed SDKs', () => {
  const whatsapp = require('../api/whatsapp');
  const mcp = require('../api/mcp');

  assert.equal(typeof whatsapp, 'function');
  assert.equal(typeof mcp, 'function');
  assert.equal(whatsapp.config.api.bodyParser, false);
});