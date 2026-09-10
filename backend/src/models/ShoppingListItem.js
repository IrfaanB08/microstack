const pool = require('../config/database');
const PlannedMeal = require('./PlannedMeal');
const GroceryCategorizer = require('../utils/groceryCategorizer');

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

  /**
   * Aggregate ingredients from every planned meal in a meal plan and
   * (re)generate the shopping list items for it. Existing items (and any
   * manual checked-off state) are replaced.
   */
  static async regenerateForMealPlan(mealPlanId) {
    // Clear out the previous list
    await pool.query('DELETE FROM shopping_list_items WHERE meal_plan_id = $1', [mealPlanId]);

    const plannedMeals = await PlannedMeal.findByMealPlanId(mealPlanId);
    const aggregated = this.aggregateIngredients(plannedMeals);

    if (aggregated.length === 0) {
      return [];
    }

    const values = [];
    const rows = [];
    let paramCount = 0;

    for (const item of aggregated) {
      const category = GroceryCategorizer.categorize(item.ingredient_name);
      rows.push(
        `($${++paramCount}, $${++paramCount}, $${++paramCount}, $${++paramCount}, $${++paramCount})`
      );
      values.push(mealPlanId, item.ingredient_name, item.quantity, item.unit, category);
    }

    const query = `
      INSERT INTO shopping_list_items (meal_plan_id, ingredient_name, quantity, unit, grocery_aisle_category)
      VALUES ${rows.join(', ')}
      RETURNING *
    `;
    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Combine ingredients across all recipes in a set of planned meals,
   * summing quantities for ingredients that share the same name and unit.
   */
  static aggregateIngredients(plannedMeals) {
    const grouped = new Map();

    for (const plannedMeal of plannedMeals) {
      const ingredients = plannedMeal.ingredients || [];

      for (const ingredient of ingredients) {
        const name = (ingredient.name || ingredient.original || '').toString().trim();
        if (!name) continue;

        const unit = (ingredient.unit || '').toString().trim();
        const key = `${name.toLowerCase()}::${unit.toLowerCase()}`;
        const numericQuantity = parseFloat(ingredient.quantity);
        const hasNumericQuantity = !Number.isNaN(numericQuantity);

        if (!grouped.has(key)) {
          grouped.set(key, {
            ingredient_name: name,
            unit,
            numericTotal: hasNumericQuantity ? numericQuantity : 0,
            hasNumeric: hasNumericQuantity,
            nonNumericParts: hasNumericQuantity ? [] : [String(ingredient.quantity || '').trim()].filter(Boolean),
          });
        } else {
          const entry = grouped.get(key);
          if (hasNumericQuantity) {
            entry.numericTotal += numericQuantity;
            entry.hasNumeric = true;
          } else {
            const part = String(ingredient.quantity || '').trim();
            if (part && !entry.nonNumericParts.includes(part)) entry.nonNumericParts.push(part);
          }
        }
      }
    }

    return Array.from(grouped.values()).map((entry) => {
      let quantity;
      if (entry.hasNumeric && entry.nonNumericParts.length === 0) {
        // Trim trailing zeros (e.g. 2.50 -> 2.5, 3.00 -> 3)
        quantity = String(Math.round(entry.numericTotal * 100) / 100);
      } else if (entry.hasNumeric) {
        quantity = [String(Math.round(entry.numericTotal * 100) / 100), ...entry.nonNumericParts].join(' + ');
      } else {
        quantity = entry.nonNumericParts.join(' + ') || null;
      }

      return {
        ingredient_name: entry.ingredient_name,
        quantity,
        unit: entry.unit || null,
      };
    });
  }
}

module.exports = ShoppingListItem;
