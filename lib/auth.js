const { createHmac, timingSafeEqual } = require('node:crypto');

function safeEqual(value, expected) {
  if (typeof value !== 'string' || typeof expected !== 'string' || !value || !expected) return false;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function isOwnerPhoneNumber(value, configuredOwner) {
  const phone = normalizePhoneNumber(value);
  const owner = normalizePhoneNumber(configuredOwner);
  return Boolean(phone && owner && safeEqual(phone, owner));
}

function hasBearerToken(request, expectedToken) {
  const authorization = request.headers?.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return Boolean(match && safeEqual(match[1], expectedToken));
}

function isValidWhatsAppSignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || !appSecret) return false;
  const digest = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqual(signature, `sha256=${digest}`);
}

module.exports = { hasBearerToken, isOwnerPhoneNumber, isValidWhatsAppSignature, normalizePhoneNumber, safeEqual };