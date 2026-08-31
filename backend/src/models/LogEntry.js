const pool = require('../config/database');

class LogEntry {
  static async create(logData) {
    const {
      user_id,
      date,
      planned_meal_id,
      food_description,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      source,
    } = logData;

    const query = `
      INSERT INTO log_entries (user_id, date, planned_meal_id, food_description, calories, protein_g, carbs_g, fat_g, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      user_id,
      date,
      planned_meal_id,
      food_description,
      calories || 0,
      protein_g || 0,
      carbs_g || 0,
      fat_g || 0,
      source || 'manual',
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM log_entries WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findByUserId(userId, options = {}) {
    let query = `
      SELECT le.*, 
        CASE WHEN le.planned_meal_id IS NOT NULL 
          THEN (SELECT pm.meal_slot FROM planned_meals pm WHERE pm.id = le.planned_meal_id)
          ELSE NULL 
        END as meal_slot
      FROM log_entries le 
      WHERE le.user_id = $1
    `;
    const values = [userId];
    let paramCount = 1;

    if (options.startDate) {
      paramCount++;
      query += ` AND date >= $${paramCount}`;
      values.push(options.startDate);
    }

    if (options.endDate) {
      paramCount++;
      query += ` AND date <= $${paramCount}`;
      values.push(options.endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    if (options.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(options.limit);
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async findByDate(userId, date) {
    const query = `
      SELECT le.*, 
        CASE WHEN le.planned_meal_id IS NOT NULL 
          THEN (SELECT pm.meal_slot FROM planned_meals pm WHERE pm.id = le.planned_meal_id)
          ELSE NULL 
        END as meal_slot
      FROM log_entries le 
      WHERE le.user_id = $1 AND le.date = $2
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [userId, date]);
    return result.rows;
  }

  static async getDailyTotals(userId, date) {
    const query = `
      SELECT 
        SUM(calories) as total_calories,
        SUM(protein_g) as total_protein,
        SUM(carbs_g) as total_carbs,
        SUM(fat_g) as total_fat,
        COUNT(*) as entry_count
      FROM log_entries 
      WHERE user_id = $1 AND date = $2
    `;
    const result = await pool.query(query, [userId, date]);
    return result.rows[0];
  }

  static async update(id, logData) {
    const {
      planned_meal_id,
      food_description,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      source,
    } = logData;

    const query = `
      UPDATE log_entries 
      SET 
        planned_meal_id = COALESCE($1, planned_meal_id),
        food_description = COALESCE($2, food_description),
        calories = COALESCE($3, calories),
        protein_g = COALESCE($4, protein_g),
        carbs_g = COALESCE($5, carbs_g),
        fat_g = COALESCE($6, fat_g),
        source = COALESCE($7, source),
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $8 
      RETURNING *
    `;
    const values = [
      planned_meal_id,
      food_description,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      source,
      id,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM log_entries WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = LogEntry;
