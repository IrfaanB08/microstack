const pool = require('../config/database');

class Recipe {
  static async create(recipeData) {
    const {
      name,
      ingredients,
      steps,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      prep_time_minutes,
      tags,
    } = recipeData;

    const query = `
      INSERT INTO recipes (name, ingredients, steps, calories, protein_g, carbs_g, fat_g, prep_time_minutes, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      name,
      JSON.stringify(ingredients || []),
      JSON.stringify(steps || []),
      calories || 0,
      protein_g || 0,
      carbs_g || 0,
      fat_g || 0,
      prep_time_minutes || 0,
      JSON.stringify(tags || []),
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM recipes WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    let query = 'SELECT * FROM recipes WHERE 1=1';
    const values = [];
    let paramCount = 0;

    if (filters.tags && filters.tags.length > 0) {
      paramCount++;
      query += ` AND tags @> $${paramCount}`;
      values.push(JSON.stringify(filters.tags));
    }

    if (filters.max_prep_time) {
      paramCount++;
      query += ` AND prep_time_minutes <= $${paramCount}`;
      values.push(filters.max_prep_time);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async update(id, recipeData) {
    const {
      name,
      ingredients,
      steps,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      prep_time_minutes,
      tags,
    } = recipeData;

    const query = `
      UPDATE recipes 
      SET 
        name = COALESCE($1, name),
        ingredients = COALESCE($2, ingredients),
        steps = COALESCE($3, steps),
        calories = COALESCE($4, calories),
        protein_g = COALESCE($5, protein_g),
        carbs_g = COALESCE($6, carbs_g),
        fat_g = COALESCE($7, fat_g),
        prep_time_minutes = COALESCE($8, prep_time_minutes),
        tags = COALESCE($9, tags),
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $10 
      RETURNING *
    `;
    const values = [
      name,
      ingredients ? JSON.stringify(ingredients) : null,
      steps ? JSON.stringify(steps) : null,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      prep_time_minutes,
      tags ? JSON.stringify(tags) : null,
      id,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM recipes WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = Recipe;
