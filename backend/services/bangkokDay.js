// The user-facing "today" is the Asia/Bangkok calendar day. Bangkok has no DST,
// so a fixed +7h offset is always exact. Returns UTC ISO bounds [start, end).
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getBangkokDayRangeISO(now = new Date()) {
  const bangkokNow = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const startUTC = Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate()) - BANGKOK_OFFSET_MS;
  return { startISO: new Date(startUTC).toISOString(), endISO: new Date(startUTC + DAY_MS).toISOString() };
}

// Today's Bangkok calendar date as 'YYYY-MM-DD'.
function getBangkokYmd(now = new Date()) {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

module.exports = { getBangkokDayRangeISO, getBangkokYmd };
