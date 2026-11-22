const supabase = require('../config/supabase');
const { extractReceiptFromImage } = require('../services/receiptExtraction');
const { slipKey } = require('../services/slipQr');

const ocrController = {
  // Scan a receipt/slip image, extract transaction details, and check for duplicates
  async scanReceipt(req, res) {
    try {
      const { line_user_id } = req.params;
      const { image_base64, slip_hash, qr } = req.body;

      if (!image_base64) {
        return res.status(400).json({ error: 'image_base64 is required' });
      }

      if (!slip_hash) {
        return res.status(400).json({ error: 'slip_hash is required' });
      }

      // The key the entry is saved with (shared with the bulk slip import:
      // the slip QR when the phone decoded one, else the image hash), plus the
      // image key and the raw hash for entries recorded before.
      const key = slipKey(line_user_id, { qr, imageSha256: slip_hash });
      const imageKey = slipKey(line_user_id, { imageSha256: slip_hash });
      // Fail fast on a known duplicate before spending an OCR call
      const { data: found, error: findError } = await supabase.from('transactions').select('id, transaction_date, amount')
        .eq('line_user_id', line_user_id).in('slip_hash', [key, imageKey, slip_hash].filter(Boolean)).limit(1);
      if (findError) throw findError;
      const existing = found[0];

      if (existing) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: 'This receipt has already been recorded.',
          existing_transaction: existing,
        });
      }

      const data = await extractReceiptFromImage(line_user_id, image_base64);

      res.json({ success: true, duplicate: false, data: { ...data, slip_key: key } });
    } catch (error) {
      console.error('Error in scanReceipt:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = ocrController;
