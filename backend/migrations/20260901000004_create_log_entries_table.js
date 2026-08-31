/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('log_entries', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'cascade',
    },
    date: {
      type: 'date',
      notNull: true,
    },
    // Optional reference to a planned meal if logged from the plan
    planned_meal_id: {
      type: 'uuid',
      references: 'planned_meals(id)',
      onDelete: 'set null',
    },
    food_description: {
      type: 'text',
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
    source: {
      type: 'varchar(50)',
      notNull: true,
      check: "source IN ('manual', 'plan')",
      default: 'manual',
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

  pgm.createIndex('log_entries', 'user_id');
  pgm.createIndex('log_entries', 'date');
  // Composite index for querying user logs by date
  pgm.createIndex('log_entries', ['user_id', 'date']);
  pgm.createIndex('log_entries', 'planned_meal_id');
};

exports.down = (pgm) => {
  pgm.dropTable('log_entries');
};
