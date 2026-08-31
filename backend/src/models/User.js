const pool = require('../config/database');

class User {
  static async create({ email, password_hash, goal }) {
    const query = `
      INSERT INTO users (email, password_hash, goal)
      VALUES ($1, $2, $3)
      RETURNING id, email, goal, created_at
    `;
    const values = [email, password_hash, goal];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async updateProfile(id, profileData) {
    const {
      goal,
      weight_kg,
      height_cm,
      age,
      sex,
      activity_level,
      dietary_preferences,
      weekly_grocery_budget,
      prep_time_preference,
      eating_out_frequency,
    } = profileData;

    const query = `
      UPDATE users 
      SET 
        goal = COALESCE($1, goal),
        weight_kg = COALESCE($2, weight_kg),
        height_cm = COALESCE($3, height_cm),
        age = COALESCE($4, age),
        sex = COALESCE($5, sex),
        activity_level = COALESCE($6, activity_level),
        dietary_preferences = COALESCE($7, dietary_preferences),
        weekly_grocery_budget = COALESCE($8, weekly_grocery_budget),
        prep_time_preference = COALESCE($9, prep_time_preference),
        eating_out_frequency = COALESCE($10, eating_out_frequency),
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $11 
      RETURNING *
    `;
    const values = [
      goal,
      weight_kg,
      height_cm,
      age,
      sex,
      activity_level,
      dietary_preferences,
      weekly_grocery_budget,
      prep_time_preference,
      eating_out_frequency,
      id,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async updateGoal(id, goal) {
    const query = `
      UPDATE users 
      SET goal = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 
      RETURNING *
    `;
    const result = await pool.query(query, [goal, id]);
    return result.rows[0];
  }
}

module.exports = User;
