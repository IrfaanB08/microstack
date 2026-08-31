const pool = require('../config/database');

class PlannedMeal {
  static async create({ meal_plan_id, recipe_id, day_of_week, meal_slot }) {
    const query = `
      INSERT INTO planned_meals (meal_plan_id, recipe_id, day_of_week, meal_slot)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [meal_plan_id, recipe_id, day_of_week, meal_slot];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM planned_meals WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findByMealPlanId(mealPlanId) {
    const query = `
      SELECT pm.*, r.name as recipe_name, r.ingredients, r.steps, r.calories, r.protein_g, r.carbs_g, r.fat_g, r.prep_time_minutes, r.tags
      FROM planned_meals pm
      JOIN recipes r ON pm.recipe_id = r.id
      WHERE pm.meal_plan_id = $1
      ORDER BY pm.day_of_week, pm.meal_slot
    `;
    const result = await pool.query(query, [mealPlanId]);
    return result.rows;
  }

  static async findByMealPlanIdAndDay(mealPlanId, dayOfWeek) {
    const query = `
      SELECT pm.*, r.name as recipe_name, r.ingredients, r.steps, r.calories, r.protein_g, r.carbs_g, r.fat_g, r.prep_time_minutes, r.tags
      FROM planned_meals pm
      JOIN recipes r ON pm.recipe_id = r.id
      WHERE pm.meal_plan_id = $1 AND pm.day_of_week = $2
      ORDER BY pm.meal_slot
    `;
    const result = await pool.query(query, [mealPlanId, dayOfWeek]);
    return result.rows;
  }

  static async update(id, plannedMealData) {
    const { recipe_id, day_of_week, meal_slot } = plannedMealData;
    const query = `
      UPDATE planned_meals 
      SET 
        recipe_id = COALESCE($1, recipe_id),
        day_of_week = COALESCE($2, day_of_week),
        meal_slot = COALESCE($3, meal_slot)
      WHERE id = $4 
      RETURNING *
    `;
    const values = [recipe_id, day_of_week, meal_slot, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM planned_meals WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async deleteByMealPlanId(mealPlanId) {
    const query = 'DELETE FROM planned_meals WHERE meal_plan_id = $1 RETURNING *';
    const result = await pool.query(query, [mealPlanId]);
    return result.rows;
  }
}

module.exports = PlannedMeal;
