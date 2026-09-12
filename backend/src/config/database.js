const { Pool, types } = require('pg');
require('dotenv').config();

// Return DATE columns (OID 1082) as plain 'YYYY-MM-DD' strings instead of
// pg's default JS Date objects. Dates in this schema (week_start_date,
// log_entries.date, ...) have no time component, but a JS Date still has
// to represent one instant, so pg parses it as local midnight - which
// Express then serializes via toISOString(), converting to UTC and
// silently shifting the calendar day back by one whenever the server's
// timezone is ahead of UTC. Keeping these as plain strings sidesteps the
// conversion entirely, since there's no meaningful timezone for a bare
// calendar date to begin with.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;
