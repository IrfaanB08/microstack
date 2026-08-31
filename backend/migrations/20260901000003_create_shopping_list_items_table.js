/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('shopping_list_items', {
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
    ingredient_name: {
      type: 'varchar(255)',
      notNull: true,
    },
    quantity: {
      type: 'varchar(100)',
    },
    unit: {
      type: 'varchar(50)',
    },
    grocery_aisle_category: {
      type: 'varchar(100)',
      check: "grocery_aisle_category IN ('produce', 'dairy', 'meat', 'bakery', 'frozen', 'pantry', 'beverages', 'snacks', 'household', 'other')",
    },
    checked: {
      type: 'boolean',
      notNull: true,
      default: false,
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

  pgm.createIndex('shopping_list_items', 'meal_plan_id');
  pgm.createIndex('shopping_list_items', 'grocery_aisle_category');
  // Index for checking off items
  pgm.createIndex('shopping_list_items', ['meal_plan_id', 'checked']);
};

exports.down = (pgm) => {
  pgm.dropTable('shopping_list_items');
};
