const Recipe = require('../models/Recipe');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MEAL_SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_SLOT_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * Builds deterministic, template-based batch-prep (or daily-cooking)
 * instructions for a generated meal plan. No AI generation involved -
 * everything is derived from the recipe's own ingredients/steps plus a
 * handful of fixed instructional templates.
 */
class BatchPrepGenerator {
  /**
   * @param {object} user - needs `prep_time_preference` ('batch' | 'daily')
   * @param {Array} plannedMeals - rows from PlannedMeal.findByMealPlanId
   *   (already joined with recipe name/ingredients/steps/macros)
   */
  generate(user, plannedMeals) {
    const prepStyle = user.prep_time_preference === 'batch' ? 'batch' : 'daily';

    const sessions = prepStyle === 'batch'
      ? this.buildBatchSessions(plannedMeals)
      : this.buildDailySessions(plannedMeals);

    return {
      prepStyle,
      guidance: prepStyle === 'batch'
        ? 'Cook each recipe once, portion it into containers for every day it\'s used, and refrigerate or freeze until ready to eat.'
        : 'Meals are cooked fresh right before eating, so there\'s nothing to batch - just follow each day\'s steps as you go.',
      sessions,
      totalSessions: sessions.length,
      totalPrepTimeMinutes: sessions.reduce((sum, s) => sum + s.estimatedPrepTimeMinutes, 0),
    };
  }

  /**
   * Batch mode: group planned meals by recipe. A recipe's prep day is the
   * earliest day of the week it's needed, and it's cooked once in a batch
   * sized for every occurrence, then portioned out for the rest of the week.
   */
  buildBatchSessions(plannedMeals) {
    const byRecipe = new Map();

    for (const meal of plannedMeals) {
      if (!byRecipe.has(meal.recipe_id)) {
        byRecipe.set(meal.recipe_id, { recipe: meal, occurrences: [] });
      }
      byRecipe.get(meal.recipe_id).occurrences.push({
        day_of_week: meal.day_of_week,
        meal_slot: meal.meal_slot,
      });
    }

    const recipeGroups = Array.from(byRecipe.values()).map((group) => {
      const occurrences = this.sortOccurrences(group.occurrences);
      return {
        recipe: group.recipe,
        occurrences,
        prepDay: occurrences[0].day_of_week,
        servings: occurrences.length,
      };
    });

    const sessionsByDay = new Map();
    for (const group of recipeGroups) {
      if (!sessionsByDay.has(group.prepDay)) sessionsByDay.set(group.prepDay, []);
      sessionsByDay.get(group.prepDay).push(group);
    }

    return Array.from(sessionsByDay.keys())
      .sort((a, b) => a - b)
      .map((day) => {
        const recipes = sessionsByDay.get(day)
          .sort((a, b) => a.recipe.recipe_name.localeCompare(b.recipe.recipe_name))
          .map((group) => this.buildRecipePrepCard(group.recipe, group.servings, group.occurrences, true));

        return this.buildSession(day, recipes);
      });
  }

  /**
   * Daily mode: no batching. One session per day that has planned meals,
   * with each meal cooked fresh for a single serving.
   */
  buildDailySessions(plannedMeals) {
    const byDay = new Map();
    for (const meal of plannedMeals) {
      if (!byDay.has(meal.day_of_week)) byDay.set(meal.day_of_week, []);
      byDay.get(meal.day_of_week).push(meal);
    }

    return Array.from(byDay.keys())
      .sort((a, b) => a - b)
      .map((day) => {
        const recipes = byDay.get(day)
          .sort((a, b) => this.slotIndex(a.meal_slot) - this.slotIndex(b.meal_slot))
          .map((meal) => this.buildRecipePrepCard(
            meal,
            1,
            [{ day_of_week: meal.day_of_week, meal_slot: meal.meal_slot }],
            false
          ));

        return this.buildSession(day, recipes);
      });
  }

  buildSession(day, recipes) {
    return {
      prepDay: day,
      prepDayName: DAY_NAMES[day],
      recipes,
      estimatedPrepTimeMinutes: recipes.reduce((sum, r) => sum + r.estimatedTimeMinutes, 0),
    };
  }

  /**
   * Build the full instruction card for one recipe: scaled ingredient list,
   * cooking steps, and portioning/storage steps.
   */
  buildRecipePrepCard(recipe, servings, occurrences, isBatch) {
    // Recipe ingredient quantities are for whatever serving count the
    // recipe originally yields (e.g. a chili that serves 6), not for one
    // serving. Scale down to a single serving first, then up by however
    // many servings we actually need this week - otherwise "servings" ends
    // up multiplying the wrong base amount.
    const recipeYield = Recipe.resolveServings(recipe);
    const scaleFactor = servings / recipeYield;

    const ingredients = (recipe.ingredients || []).map((ingredient) =>
      this.formatIngredientLine(ingredient.name, this.scaleQuantity(ingredient.quantity, scaleFactor), ingredient.unit)
    );

    const steps = [
      ...this.buildCookingSteps(recipe, servings, isBatch),
      ...this.buildPortioningSteps(recipe, servings, occurrences, isBatch),
    ];

    return {
      recipeId: recipe.recipe_id,
      recipeName: recipe.recipe_name,
      servingsNeeded: servings,
      usedFor: occurrences.map((o) => this.formatOccurrence(o)),
      ingredients,
      steps,
      estimatedTimeMinutes: recipe.prep_time_minutes || 0,
      macrosPerServing: {
        calories: recipe.calories,
        protein_g: recipe.protein_g,
        carbs_g: recipe.carbs_g,
        fat_g: recipe.fat_g,
      },
    };
  }

  buildCookingSteps(recipe, servings, isBatch) {
    const steps = [];
    const recipeYield = Recipe.resolveServings(recipe);

    if (isBatch && servings !== recipeYield) {
      const scaleFactor = Math.round((servings / recipeYield) * 100) / 100;
      steps.push(
        `This recipe normally makes ${recipeYield} serving${recipeYield === 1 ? '' : 's'} - the ingredient amounts ` +
        `above are already scaled ${scaleFactor}x to make ${servings} servings for this batch.`
      );
    }

    const recipeSteps = recipe.steps || [];
    if (recipeSteps.length > 0) {
      for (const step of recipeSteps) {
        const text = typeof step === 'string' ? step : step.step;
        if (text) steps.push(text);
      }
    } else {
      // Fallback template for recipes without stored instructions
      steps.push(`Prepare all ingredients for ${recipe.recipe_name}.`);
      steps.push(`Cook ${recipe.recipe_name} using your preferred method until fully cooked through.`);
    }

    return steps;
  }

  buildPortioningSteps(recipe, servings, occurrences, isBatch) {
    if (!isBatch) {
      return ['Serve immediately.'];
    }

    const labels = occurrences.map((o) => this.formatOccurrence(o));
    const steps = [
      `Let ${recipe.recipe_name} cool slightly, then divide into ${servings} equal portion${servings === 1 ? '' : 's'} in airtight containers.`,
      `Label the container${servings === 1 ? '' : 's'} for: ${labels.join(', ')}.`,
    ];

    const days = occurrences.map((o) => o.day_of_week);
    const spanDays = Math.max(...days) - Math.min(...days);
    steps.push(
      spanDays >= 4
        ? 'Refrigerate the portions you\'ll eat within 4 days; freeze the rest and move them to the fridge to thaw the night before.'
        : 'Refrigerate all portions until ready to eat.'
    );

    return steps;
  }

  /** Multiply a numeric ingredient quantity by an arbitrary scale factor. */
  scaleQuantity(quantity, multiplier) {
    const numericQuantity = parseFloat(quantity);
    if (Number.isNaN(numericQuantity)) return quantity;
    const scaled = numericQuantity * multiplier;
    return String(Math.round(scaled * 100) / 100);
  }

  formatIngredientLine(name, quantity, unit) {
    const amount = [quantity, unit].filter(Boolean).join(' ');
    return amount ? `${amount} ${name}` : name;
  }

  formatOccurrence(occurrence) {
    const slotLabel = MEAL_SLOT_LABELS[occurrence.meal_slot] || occurrence.meal_slot;
    return `${DAY_NAMES[occurrence.day_of_week]} ${slotLabel}`;
  }

  slotIndex(slot) {
    const index = MEAL_SLOT_ORDER.indexOf(slot);
    return index === -1 ? MEAL_SLOT_ORDER.length : index;
  }

  sortOccurrences(occurrences) {
    return [...occurrences].sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
      return this.slotIndex(a.meal_slot) - this.slotIndex(b.meal_slot);
    });
  }
}

module.exports = BatchPrepGenerator;
