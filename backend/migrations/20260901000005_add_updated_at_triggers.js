/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Create function to update updated_at timestamp
  pgm.createFunction(
    'update_updated_at_column',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    `
  );

  // Add triggers to all tables with updated_at
  const tables = [
    'users',
    'recipes',
    'meal_plans',
    'shopping_list_items',
    'log_entries',
  ];

  tables.forEach((table) => {
    pgm.createTrigger(table, 'update_updated_at', {
      when: 'BEFORE',
      operation: 'UPDATE',
      level: 'ROW',
      function: 'update_updated_at_column',
    });
  });
};

exports.down = (pgm) => {
  const tables = [
    'users',
    'recipes',
    'meal_plans',
    'shopping_list_items',
    'log_entries',
  ];

  tables.forEach((table) => {
    pgm.dropTrigger(table, 'update_updated_at');
  });

  pgm.dropFunction('update_updated_at_column', []);
};
