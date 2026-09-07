const crypto = require('crypto');

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expected) {
  const actual = crypto.scryptSync(password, salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

function createSessionToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { randomId, hashPassword, verifyPassword, createSessionToken, hashToken };
