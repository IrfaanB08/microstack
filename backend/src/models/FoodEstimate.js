const pool = require('../config/database');

class FoodEstimate {
  static async findByNormalizedDescription(normalizedDescription) {
    const query = 'SELECT * FROM food_estimates WHERE normalized_description = $1';
    const result = await pool.query(query, [normalizedDescription]);
    return result.rows[0];
  }

  /**
   * Insert a freshly-looked-up estimate into the cache. Uses an upsert so
   * that two requests racing to estimate the same never-before-seen
   * description don't collide on the unique constraint - the second write
   * just refreshes the row instead of erroring.
   */
  static async create({ normalized_description, description, calories, protein_g, carbs_g, fat_g, source }) {
    const query = `
      INSERT INTO food_estimates (normalized_description, description, calories, protein_g, carbs_g, fat_g, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (normalized_description) DO UPDATE SET
        calories = EXCLUDED.calories,
        protein_g = EXCLUDED.protein_g,
        carbs_g = EXCLUDED.carbs_g,
        fat_g = EXCLUDED.fat_g,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const values = [
      normalized_description,
      description,
      calories || 0,
      protein_g || 0,
      carbs_g || 0,
      fat_g || 0,
      source || 'spoonacular',
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async count() {
    const query = 'SELECT COUNT(*) as count FROM food_estimates';
    const result = await pool.query(query);
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = FoodEstimate;
