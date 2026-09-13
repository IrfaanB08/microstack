const pool = require('../config/database');
const PlannedMeal = require('./PlannedMeal');
const Recipe = require('./Recipe');
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
   * The grouping key used everywhere an ingredient needs to be matched
   * across recipes - same name and unit, case-insensitive. Shared so
   * aggregateIngredients (quantities) and countIngredientOccurrences
   * (the "used in N meals" flag) agree on what counts as "the same
   * ingredient" without the two ever drifting apart.
   */
  static buildIngredientKey(name, unit) {
    return `${(name || '').toString().trim().toLowerCase()}::${(unit || '').toString().trim().toLowerCase()}`;
  }

  /**
   * Combine ingredients across all recipes in a set of planned meals,
   * summing quantities for ingredients that share the same name and unit.
   *
   * Each recipe's stored ingredient quantities are for whatever serving
   * count the recipe originally yields (e.g. a chili that serves 6), not
   * for the single serving a planned meal actually represents. Every
   * numeric quantity is divided by the recipe's servings first so what
   * gets summed - and ultimately shopped for - is a true per-serving
   * amount for each occurrence in the plan.
   */
  static aggregateIngredients(plannedMeals) {
    const grouped = new Map();

    for (const plannedMeal of plannedMeals) {
      const ingredients = plannedMeal.ingredients || [];
      const recipeYield = Recipe.resolveServings(plannedMeal);

      for (const ingredient of ingredients) {
        const name = (ingredient.name || ingredient.original || '').toString().trim();
        if (!name) continue;

        const unit = (ingredient.unit || '').toString().trim();
        const key = this.buildIngredientKey(name, unit);
        const rawQuantity = parseFloat(ingredient.quantity);
        const hasNumericQuantity = !Number.isNaN(rawQuantity);
        const numericQuantity = hasNumericQuantity ? rawQuantity / recipeYield : rawQuantity;

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

  /**
   * For each distinct ingredient (same name+unit grouping aggregateIngredients
   * uses), count how many separate planned meals - not just how many times
   * the ingredient line appears - call for it this week, and which recipes
   * those are. This is the "leftover/batch" signal: an ingredient needed by
   * 2+ different meals is worth buying in bulk rather than thinking of each
   * occurrence as unrelated. Purely informational - it doesn't touch the
   * quantities aggregateIngredients computes.
   *
   * A recipe that lists the same ingredient on two lines (e.g. "salt" for
   * both the marinade and the sauce) only counts once per meal - the count
   * is "how many meals", not "how many ingredient lines".
   */
  static countIngredientOccurrences(plannedMeals) {
    const counts = new Map();

    for (const plannedMeal of plannedMeals) {
      const ingredients = plannedMeal.ingredients || [];
      const seenInThisMeal = new Set();

      for (const ingredient of ingredients) {
        const name = (ingredient.name || ingredient.original || '').toString().trim();
        if (!name) continue;

        const unit = (ingredient.unit || '').toString().trim();
        const key = this.buildIngredientKey(name, unit);
        if (seenInThisMeal.has(key)) continue;
        seenInThisMeal.add(key);

        if (!counts.has(key)) {
          counts.set(key, { mealCount: 0, recipeNames: new Set() });
        }
        const entry = counts.get(key);
        entry.mealCount += 1;
        if (plannedMeal.recipe_name) entry.recipeNames.add(plannedMeal.recipe_name);
      }
    }

    const result = new Map();
    for (const [key, entry] of counts) {
      result.set(key, { mealCount: entry.mealCount, recipeNames: Array.from(entry.recipeNames) });
    }
    return result;
  }
}

module.exports = ShoppingListItem;
