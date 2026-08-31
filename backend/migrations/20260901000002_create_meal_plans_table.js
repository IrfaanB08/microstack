/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // MealPlan table - represents a weekly meal plan for a user
  pgm.createTable('meal_plans', {
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
    week_start_date: {
      type: 'date',
      notNull: true,
    },
    goal: {
      type: 'varchar(50)',
      notNull: true,
      check: "goal IN ('bulk', 'cut', 'maintain', 'recomp')",
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

  // Unique constraint: one meal plan per user per week
  pgm.addConstraint('meal_plans', 'unique_user_week', {
    unique: ['user_id', 'week_start_date'],
  });

  pgm.createIndex('meal_plans', 'user_id');
  pgm.createIndex('meal_plans', 'week_start_date');

  // PlannedMeal table - individual meals within a meal plan
  pgm.createTable('planned_meals', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    meal_plan_id: {
      type: 'uuid',
      notNull: true,
      references: 'meal_plans(id)',
      onDelete: 'cascade',
    },
    recipe_id: {
      type: 'uuid',
      notNull: true,
      references: 'recipes(id)',
      onDelete: 'restrict',
    },
    day_of_week: {
      type: 'integer',
      notNull: true,
      check: 'day_of_week >= 0 AND day_of_week <= 6', // 0=Sunday, 6=Saturday
    },
    meal_slot: {
      type: 'varchar(50)',
      notNull: true,
      check: "meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')",
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('planned_meals', 'meal_plan_id');
  pgm.createIndex('planned_meals', 'recipe_id');
  // Composite index for querying meals by plan and day
  pgm.createIndex('planned_meals', ['meal_plan_id', 'day_of_week', 'meal_slot']);
};

exports.down = (pgm) => {
  pgm.dropTable('planned_meals');
  pgm.dropTable('meal_plans');
};
