/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // How many servings the recipe's stored ingredient quantities are for.
  // Left nullable (no default) on purpose: existing recipes start out NULL
  // so a backfill script can find them via `WHERE servings IS NULL` and
  // fetch the real value from Spoonacular. Ingredient-scaling code treats
  // NULL/unknown as 1 serving until backfilled.
  pgm.addColumns('recipes', {
    servings: {
      type: 'integer',
      allowNull: true,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('recipes', 'servings');
};
