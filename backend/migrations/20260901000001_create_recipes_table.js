/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('recipes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    // Ingredients stored as JSONB array of objects: [{name, quantity, unit}]
    ingredients: {
      type: 'jsonb',
      notNull: true,
      default: '[]',
    },
    // Steps stored as JSONB array of strings or objects
    steps: {
      type: 'jsonb',
      notNull: true,
      default: '[]',
    },
    // Macros
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
    prep_time_minutes: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    // Tags stored as JSONB array of strings
    tags: {
      type: 'jsonb',
      default: '[]',
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

  pgm.createIndex('recipes', 'name');
  // GIN index for JSONB array searches on tags
  pgm.createIndex('recipes', 'tags', { method: 'gin' });
};

exports.down = (pgm) => {
  pgm.dropTable('recipes');
};
