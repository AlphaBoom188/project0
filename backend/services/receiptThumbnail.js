const sharp = require('sharp');
const crypto = require('crypto');
const supabase = require('../config/supabase');

const BUCKET = 'receipt-thumbnails';

// Resizes a receipt image down to a small JPEG and uploads it to the private
// bucket. Returns the storage object path (not a URL -- the bucket is private,
// so callers must mint a signed URL via signedUrl.js whenever they display it).
async function uploadThumbnail(lineUserId, imageBuffer) {
  const thumbnail = await sharp(imageBuffer)
    .resize({ width: 320, withoutEnlargement: true })
    .jpeg({ quality: 60 })
    .toBuffer();

  const path = `${lineUserId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, thumbnail, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) throw error;
  return path;
}

// thumbnail_url arrives from clients (LIFF, iOS) as the path the OCR endpoint
// handed them. The server later signs whatever path is stored, so a client
// could otherwise point its own transaction at ANOTHER user's receipt and get a
// working link to it. Only the exact shape uploadThumbnail() produces, inside
// the caller's own folder, is accepted.
function isOwnThumbnailPath(lineUserId, path) {
  if (typeof path !== 'string') return false;
  const slash = path.indexOf('/');
  return path.slice(0, slash) === lineUserId && /^\d+-[0-9a-f]{8}\.jpg$/.test(path.slice(slash + 1));
}

module.exports = { uploadThumbnail, isOwnThumbnailPath, BUCKET };
