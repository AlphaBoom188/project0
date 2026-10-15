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

module.exports = { uploadThumbnail, BUCKET };
