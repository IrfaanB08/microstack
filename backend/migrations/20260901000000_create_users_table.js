/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true,
    },
    goal: {
      type: 'varchar(50)',
      notNull: true,
      check: "goal IN ('bulk', 'cut', 'maintain', 'recomp')",
    },
    // Body stats
    weight_kg: {
      type: 'decimal(5,2)',
    },
    height_cm: {
      type: 'decimal(5,2)',
    },
    age: {
      type: 'integer',
    },
    sex: {
      type: 'varchar(20)',
      check: "sex IN ('male', 'female', 'other')",
    },
    activity_level: {
      type: 'varchar(50)',
      check: "activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')",
    },
    // Dietary preferences (stored as JSONB array)
    dietary_preferences: {
      type: 'jsonb',
      default: '[]',
    },
    weekly_grocery_budget: {
      type: 'decimal(10,2)',
    },
    prep_time_preference: {
      type: 'varchar(50)',
      check: "prep_time_preference IN ('batch', 'daily')",
    },
    eating_out_frequency: {
      type: 'integer',
      check: 'eating_out_frequency >= 0 AND eating_out_frequency <= 21',
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

  pgm.createIndex('users', 'email');
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
