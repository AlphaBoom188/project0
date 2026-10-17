// Postgres rejects a malformed uuid with a 500-shaped error ("invalid input
// syntax for type uuid"), so ids from the URL/query are checked up front.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

module.exports = { isUuid };
