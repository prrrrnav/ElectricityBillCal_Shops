const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { hasBearerToken, isOwnerPhoneNumber, isValidWhatsAppSignature } = require('./auth');

test('restricts WhatsApp commands to the configured owner number', () => {
  assert.equal(isOwnerPhoneNumber('+91 98765 43210', '919876543210'), true);
  assert.equal(isOwnerPhoneNumber('919876543211', '919876543210'), false);
  assert.equal(isOwnerPhoneNumber('', '919876543210'), false);
});

test('requires the exact configured MCP bearer token', () => {
  assert.equal(hasBearerToken({ headers: { authorization: 'Bearer secret-token' } }, 'secret-token'), true);
  assert.equal(hasBearerToken({ headers: { authorization: 'Bearer wrong' } }, 'secret-token'), false);
  assert.equal(hasBearerToken({ headers: {} }, 'secret-token'), false);
});

test('validates WhatsApp signatures over the raw request body', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = 'app-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  assert.equal(isValidWhatsAppSignature(body, signature, secret), true);
  assert.equal(isValidWhatsAppSignature(body, signature, 'wrong-secret'), false);
  assert.equal(isValidWhatsAppSignature(Buffer.from('tampered'), signature, secret), false);
});