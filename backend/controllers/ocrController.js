const { findDuplicateBySlipHash, extractReceiptFromImage } = require('../services/receiptExtraction');

const ocrController = {
  // Scan a receipt/slip image, extract transaction details, and check for duplicates
  async scanReceipt(req, res) {
    try {
      const { line_user_id } = req.params;
      const { image_base64, slip_hash } = req.body;

      if (!image_base64) {
        return res.status(400).json({ error: 'image_base64 is required' });
      }

      if (!slip_hash) {
        return res.status(400).json({ error: 'slip_hash is required' });
      }

      // Fail fast on a known duplicate before spending an OCR call
      const existing = await findDuplicateBySlipHash(line_user_id, slip_hash);

      if (existing) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: 'This receipt has already been recorded.',
          existing_transaction: existing,
        });
      }

      const data = await extractReceiptFromImage(line_user_id, image_base64);

      res.json({ success: true, duplicate: false, data });
    } catch (error) {
      console.error('Error in scanReceipt:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = ocrController;
