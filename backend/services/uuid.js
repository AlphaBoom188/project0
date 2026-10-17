// Postgres rejects a malformed uuid with a 500-shaped error ("invalid input
// syntax for type uuid"), so ids from the URL/query are checked up front.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

// For router.param(name, requireUuidParam('bill')): a clean 400 before any
// handler runs, instead of the raw Postgres error surfacing as a 500.
function requireUuidParam(label) {
  return (req, res, next, value) => {
    if (!isUuid(value)) return res.status(400).json({ error: `Invalid ${label} id` });
    next();
  };
}

module.exports = { isUuid, requireUuidParam };
