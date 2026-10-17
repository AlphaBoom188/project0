// The user-facing "today" is the Asia/Bangkok calendar day. Bangkok has no DST,
// so a fixed +7h offset is always exact. Returns UTC ISO bounds [start, end).
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getBangkokDayRangeISO(now = new Date()) {
  const bangkokNow = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const startUTC = Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate()) - BANGKOK_OFFSET_MS;
  return { startISO: new Date(startUTC).toISOString(), endISO: new Date(startUTC + DAY_MS).toISOString() };
}

// Bangkok calendar fields of an instant: { year, month (0-based), day, weekday (0=Sun) }.
function bangkokParts(date = new Date()) {
  const b = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return { year: b.getUTCFullYear(), month: b.getUTCMonth(), day: b.getUTCDate(), weekday: b.getUTCDay() };
}

// The instant Bangkok midnight starts the given calendar date. Out-of-range
// month/day values roll over like Date.UTC (month -1 = December of last year).
function bangkokMidnight(year, month, day) {
  return new Date(Date.UTC(year, month, day) - BANGKOK_OFFSET_MS);
}

// Today's Bangkok calendar date as 'YYYY-MM-DD'.
function getBangkokYmd(now = new Date()) {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

module.exports = { getBangkokDayRangeISO, getBangkokYmd, bangkokParts, bangkokMidnight };
