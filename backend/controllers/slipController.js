// Bulk e-slip import (services/slipImport.js). Errors are logged by class and
// status only: never slip contents (names, account numbers, amounts).
const { readSlip, importSlips, undoSlips } = require('../services/slipImport');

const handle = (name, fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error(`Error in slips.${name}: ${error.constructor.name}${error.status ? ` ${error.status}` : ''}${error.code ? ` ${error.code}` : ''}`);
    res.status(500).json({ error: "Couldn't read this slip. Please try again." });
  }
};

module.exports = {
  // POST /api/slips/:u/read { image_base64, image_sha256, qr }
  read: handle('read', (req) => readSlip(req.params.line_user_id, req.body || {})),
  // POST /api/slips/:u/import { rows }
  import: handle('import', (req) => importSlips(req.params.line_user_id, (req.body || {}).rows)),
  // POST /api/slips/:u/undo { rows: the import's `imported` list }
  undo: handle('undo', (req) => undoSlips(req.params.line_user_id, (req.body || {}).rows)),
};
