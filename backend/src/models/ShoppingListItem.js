const pool = require('../config/database');

class ShoppingListItem {
  static async create({ meal_plan_id, ingredient_name, quantity, unit, grocery_aisle_category }) {
    const query = `
      INSERT INTO shopping_list_items (meal_plan_id, ingredient_name, quantity, unit, grocery_aisle_category)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [meal_plan_id, ingredient_name, quantity, unit, grocery_aisle_category];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM shopping_list_items WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findByMealPlanId(mealPlanId) {
    const query = `
      SELECT * FROM shopping_list_items 
      WHERE meal_plan_id = $1 
      ORDER BY grocery_aisle_category, ingredient_name
    `;
    const result = await pool.query(query, [mealPlanId]);
    return result.rows;
  }

  static async update(id, itemData) {
    const { ingredient_name, quantity, unit, grocery_aisle_category, checked } = itemData;
    const query = `
      UPDATE shopping_list_items 
      SET 
        ingredient_name = COALESCE($1, ingredient_name),
        quantity = COALESCE($2, quantity),
        unit = COALESCE($3, unit),
        grocery_aisle_category = COALESCE($4, grocery_aisle_category),
        checked = COALESCE($5, checked),
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $6 
      RETURNING *
    `;
    const values = [ingredient_name, quantity, unit, grocery_aisle_category, checked, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async toggleChecked(id) {
    const query = `
      UPDATE shopping_list_items 
      SET checked = NOT checked, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM shopping_list_items WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async deleteByMealPlanId(mealPlanId) {
    const query = 'DELETE FROM shopping_list_items WHERE meal_plan_id = $1 RETURNING *';
    const result = await pool.query(query, [mealPlanId]);
    return result.rows;
  }

  static async regenerateForMealPlan(mealPlanId) {
    // This method would aggregate ingredients from all planned meals
    // and create/update shopping list items
    // Implementation would be added when meal plan generation is built
    const query = `
      DELETE FROM shopping_list_items WHERE meal_plan_id = $1
    `;
    await pool.query(query, [mealPlanId]);
    
    // Future implementation would:
    // 1. Get all planned meals for the meal plan
    // 2. Extract and aggregate ingredients from recipes
    // 3. Create shopping list items with combined quantities
    // 4. Categorize by grocery aisle
    
    return [];
  }
}

module.exports = ShoppingListItem;
