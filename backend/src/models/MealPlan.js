const pool = require('../config/database');

class MealPlan {
  static async create({ user_id, week_start_date, goal }) {
    const query = `
      INSERT INTO meal_plans (user_id, week_start_date, goal)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [user_id, week_start_date, goal];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM meal_plans WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findByUserAndWeek(userId, weekStartDate) {
    const query = `
      SELECT * FROM meal_plans 
      WHERE user_id = $1 AND week_start_date = $2
    `;
    const result = await pool.query(query, [userId, weekStartDate]);
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const query = `
      SELECT * FROM meal_plans 
      WHERE user_id = $1 
      ORDER BY week_start_date DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async update(id, mealPlanData) {
    const { goal } = mealPlanData;
    const query = `
      UPDATE meal_plans 
      SET 
        goal = COALESCE($1, goal),
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 
      RETURNING *
    `;
    const values = [goal, id];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM meal_plans WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = MealPlan;
