// Tax documents (migration 022): private JPEGs attached to an income line or
// a deduction, and 50 ทวิ reading with OpenAI Vision. Paths are
// <line_user_id>/<ms>-<8 hex>.jpg in the private 'tax-documents' bucket and
// are signed (1 hour) on every read. Document contents are never logged.
const crypto = require('crypto');
const sharp = require('sharp');
const OpenAI = require('openai');
const supabase = require('../../config/supabase');

const BUCKET = 'tax-documents';
const KINDS = ['50tawi', 'insurance', 'fund', 'donation', 'other'];
const COLUMNS = 'id, kind, income_id, claim_key, storage_path, file_name, extracted, created_at';
const MAX_BASE64 = 9 * 1024 * 1024; // under express.json's 10mb
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45000 });

class DocumentError extends Error {}

// Which kind of document proves a deduction.
function kindForClaim(key) {
  if (/insurance/.test(key)) return 'insurance';
  if (/rmf|esg|nsf|provident|gpf|teachers/.test(key)) return 'fund';
  if (/donation|political/.test(key)) return 'donation';
  return 'other';
}

async function toJpeg(imageBase64) {
  if (typeof imageBase64 !== 'string' || !imageBase64 || imageBase64.length > MAX_BASE64) throw new DocumentError('Send a photo or scan under 6 MB');
  try {
    return await sharp(Buffer.from(imageBase64, 'base64')).rotate().resize({ width: 1600, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  } catch {
    throw new DocumentError("That file isn't an image we can read. Send a photo, or a PDF (the app turns its first page into an image).");
  }
}

// -> the saved row
async function saveDocument(lineUserId, year, { imageBase64, kind = 'other', incomeId = null, claimKey = null, fileName = null, extracted = null }) {
  if (!KINDS.includes(kind)) throw new DocumentError(`kind must be one of ${KINDS.join(', ')}`);
  const jpeg = await toJpeg(imageBase64);
  const path = `${lineUserId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data, error: dbError } = await supabase.from('tax_documents').insert({
    line_user_id: lineUserId, tax_year: year, kind, income_id: incomeId, claim_key: claimKey, storage_path: path,
    file_name: fileName ? String(fileName).slice(0, 200) : null, extracted,
  }).select(COLUMNS).single();
  if (dbError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw dbError;
  }
  return data;
}

async function listDocuments(lineUserId, year) {
  const { data, error } = await supabase.from('tax_documents').select(COLUMNS).eq('line_user_id', lineUserId).eq('tax_year', year).order('created_at');
  if (error) throw error;
  if (!data.length) return [];
  const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrls(data.map((d) => d.storage_path), 60 * 60);
  if (signError) console.error('[tax] signing documents failed:', signError.message);
  const urls = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
  return data.map(({ storage_path: p, ...d }) => ({ ...d, url: urls.get(p) || null }));
}

async function getDocument(lineUserId, year, id) {
  const { data, error } = await supabase.from('tax_documents').select(COLUMNS).eq('id', id).eq('line_user_id', lineUserId).eq('tax_year', year).maybeSingle();
  if (error) throw error;
  return data;
}

async function linkDocument(lineUserId, year, id, { incomeId = null, claimKey = null }) {
  const { data, error } = await supabase.from('tax_documents').update({ income_id: incomeId, claim_key: claimKey })
    .eq('id', id).eq('line_user_id', lineUserId).eq('tax_year', year).select(COLUMNS).maybeSingle();
  if (error) throw error;
  return data;
}

async function deleteDocument(lineUserId, year, id) {
  const doc = await getDocument(lineUserId, year, id);
  if (!doc) return;
  await supabase.from('tax_documents').delete().eq('id', id).eq('line_user_id', lineUserId);
  const { error } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  if (error) console.error('[tax] removing a document file failed:', error.message);
}

// ---- 50 ทวิ reading ----
const TYPE_TO_KIND = { '40(1)': 'salary', '40(2)': 'freelance', '40(3)': 'royalty', '40(4)': 'interest', '40(5)': 'rent_building', '40(7)': 'contracting' };
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(/[,\s฿]/g, '')) : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

// Model output -> safe values (also used by tests).
function interpret50Tawi(x) {
  const type = /^40\([1-8]\)$/.test(x.income_type || '') ? x.income_type : null;
  const amount = num(x.amount_paid);
  const withheld = num(x.tax_withheld);
  const out = {
    is50Tawi: Boolean(x.is_50tawi) && amount !== null,
    payer: typeof x.payer_name === 'string' ? x.payer_name.trim().slice(0, 200) || null : null,
    incomeType: type,
    kind: type ? TYPE_TO_KIND[type] || null : null,
    amount,
    withheld: withheld !== null && amount !== null && withheld > amount ? null : withheld,
    socialSecurity: num(x.social_security),
    providentFund: num(x.provident_fund),
    yearBE: Number.isInteger(Number(x.tax_year_be)) && Number(x.tax_year_be) > 2500 ? Number(x.tax_year_be) : null,
  };
  return out;
}

async function read50Tawi(imageBase64) {
  const jpeg = await toJpeg(imageBase64);
  const prompt = `This should be a Thai withholding tax certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย, "50 ทวิ"). Return ONLY a JSON object:
"is_50tawi" (boolean),
"payer_name" (string: the payer / employer, ผู้มีหน้าที่หักภาษี ณ ที่จ่าย, or null),
"income_type" (the income line with the largest amount as "40(1)" ... "40(8)": เงินเดือน ค่าจ้าง = 40(1); ค่าธรรมเนียม ค่านายหน้า = 40(2); ค่าลิขสิทธิ์ = 40(3); ดอกเบี้ย เงินปันผล = 40(4); otherwise the section printed, or null),
"amount_paid" (number: total amount paid, จำนวนเงินที่จ่าย, for the year),
"tax_withheld" (number: total tax withheld, ภาษีที่หักและนำส่งไว้),
"social_security" (number or null: เงินสมทบจ่ายเข้ากองทุนประกันสังคม),
"provident_fund" (number or null: เงินสะสมจ่ายเข้ากองทุนสำรองเลี้ยงชีพ),
"tax_year_be" (number: the Buddhist-era year the income was paid, or null).`;
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } }] }],
  });
  return interpret50Tawi(JSON.parse(completion.choices[0].message.content || '{}'));
}

module.exports = { BUCKET, KINDS, DocumentError, kindForClaim, saveDocument, listDocuments, getDocument, linkDocument, deleteDocument, read50Tawi, interpret50Tawi };
