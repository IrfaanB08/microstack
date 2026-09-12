/**
 * Marks whether a log entry's macros came from an auto-estimate
 * (Spoonacular's Guess Nutrition, cached or freshly looked up) rather than
 * a plan match or numbers the user typed themselves - so the dashboard can
 * flag estimated entries as worth double-checking.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumns('log_entries', {
    estimated: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('log_entries', 'estimated');
};
