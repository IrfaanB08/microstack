/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumns('recipes', {
    spoonacular_id: {
      type: 'integer',
      allowNull: true,
    },
    source_url: {
      type: 'text',
      allowNull: true,
    },
    image_url: {
      type: 'text',
      allowNull: true,
    },
  });

  pgm.createIndex('recipes', 'spoonacular_id', { unique: false });
};

exports.down = (pgm) => {
  pgm.dropIndex('recipes', 'spoonacular_id');
  pgm.dropColumns('recipes', ['spoonacular_id', 'source_url', 'image_url']);
};
