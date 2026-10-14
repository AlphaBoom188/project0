const crypto = require('crypto');

// Short-lived holding area for a parsed-but-unsaved transaction awaiting a
// Confirm/Cancel tap in LINE. Deliberately in-memory (not a DB table): this
// state is only ever needed for a few minutes and only within this process.
const TTL_MS = 10 * 60 * 1000;
const store = new Map();

function sweep() {
  const now = Date.now();
  for (const [token, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(token);
  }
}

function create(data) {
  sweep();
  const token = crypto.randomBytes(6).toString('hex');
  store.set(token, { data, expiresAt: Date.now() + TTL_MS });
  return token;
}

function get(token) {
  const entry = store.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(token);
    return null;
  }
  return entry.data;
}

function remove(token) {
  store.delete(token);
}

module.exports = { create, get, remove };
