const supabase = require('../config/supabase');
const { BUCKET } = require('./receiptThumbnail');

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour -- long enough for a client to load it, short enough to not leak indefinitely

// Converts a stored thumbnail object path into a short-lived signed URL.
// Returns null for anything falsy (no thumbnail) rather than throwing, so
// callers can map over a list of transactions without per-row branching.
async function signThumbnailPath(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error('Error signing thumbnail URL:', error.message);
    return null;
  }
  return data.signedUrl;
}

// Signs the thumbnail_url field on a single transaction object (or array of them) in place-safe fashion.
async function withSignedThumbnails(transactionOrList) {
  if (Array.isArray(transactionOrList)) {
    return Promise.all(transactionOrList.map(withSignedThumbnails));
  }
  if (!transactionOrList) return transactionOrList;
  const signedUrl = await signThumbnailPath(transactionOrList.thumbnail_url);
  return { ...transactionOrList, thumbnail_url: signedUrl };
}

module.exports = { signThumbnailPath, withSignedThumbnails };
