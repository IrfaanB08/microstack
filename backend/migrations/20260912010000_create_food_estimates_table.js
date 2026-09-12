/**
 * A shared cache of macro estimates for free-text food descriptions,
 * keyed by a normalized version of the description. Looked up before
 * ever calling Spoonacular's Guess Nutrition by Dish Name endpoint so
 * that a common food ("chicken breast", "rice", "eggs") only ever costs
 * one API call across the whole user base, not one per user per day.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('food_estimates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    // Cache key: lowercase, trimmed, punctuation stripped. See
    // src/utils/foodEstimator.js's normalizeDescription().
    normalized_description: {
      type: 'varchar(255)',
      notNull: true,
    },
    // The original text that produced this estimate, kept for debugging.
    description: {
      type: 'text',
      notNull: true,
    },
    calories: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    protein_g: {
      type: 'decimal(8,2)',
      notNull: true,
      default: 0,
    },
    carbs_g: {
      type: 'decimal(8,2)',
      notNull: true,
      default: 0,
    },
    fat_g: {
      type: 'decimal(8,2)',
      notNull: true,
      default: 0,
    },
    // Where the estimate came from - lets us tell real lookups apart from
    // any future manual seeding of common foods.
    source: {
      type: 'varchar(50)',
      notNull: true,
      default: 'spoonacular',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('food_estimates', 'unique_normalized_description', {
    unique: ['normalized_description'],
  });

  // Reuses the update_updated_at_column() function created in
  // 20260901000005_add_updated_at_triggers.js.
  pgm.createTrigger('food_estimates', 'update_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'update_updated_at_column',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('food_estimates', 'update_updated_at');
  pgm.dropTable('food_estimates');
};
