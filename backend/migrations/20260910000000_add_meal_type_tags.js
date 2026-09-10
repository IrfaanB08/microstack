/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add meal_type_tags column as JSONB array for explicit meal type assignments
  pgm.addColumns('recipes', {
    meal_type_tags: {
      type: 'jsonb',
      default: '[]',
    },
  });

  // Add GIN index for efficient meal type queries
  pgm.createIndex('recipes', 'meal_type_tags', { method: 'gin' });
};

exports.down = (pgm) => {
  pgm.dropIndex('recipes', 'meal_type_tags');
  pgm.dropColumns('recipes', 'meal_type_tags');
};
