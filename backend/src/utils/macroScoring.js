/**
 * Generic macro-math helpers shared by anything that needs to compare a
 * candidate meal (or dish) against a macro target across all four
 * numbers - calories, protein, carbs, and fat - rather than calories
 * alone. Originally lived as instance methods on MealPlanGenerator, but
 * neither ever touched `this`, and the eating-out suggestion feature
 * needs the same scoring without a meal plan or a recipe in sight, so
 * they're pulled out here as plain functions.
 */

/**
 * Sum calories/protein/carbs/fat across a list of meals or raw recipes.
 * Each entry is either a plain recipe (used as-is, multiplier 1), an
 * already-assigned single recipe carrying an optional
 * _portionMultiplier, or a combined meal carrying
 * _isCombined/_combinationRecipes.
 */
function sumMealMacros(meals) {
  return meals.filter((m) => m !== null && m !== undefined).reduce((sum, meal) => {
    const parts = meal._isCombined && meal._combinationRecipes ? meal._combinationRecipes : [meal];
    const multiplier = meal._isCombined ? 1.0 : (meal._portionMultiplier || 1.0);
    for (const part of parts) {
      sum.calories += (parseFloat(part.calories) || 0) * multiplier;
      sum.protein_g += (parseFloat(part.protein_g) || 0) * multiplier;
      sum.carbs_g += (parseFloat(part.carbs_g) || 0) * multiplier;
      sum.fat_g += (parseFloat(part.fat_g) || 0) * multiplier;
    }
    return sum;
  }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
}

/**
 * Score how well a candidate's macros fit a target, across calories,
 * protein, carbs, AND fat - not calories alone. Each macro's error is
 * expressed as a fraction of ITS OWN target (not raw grams/calories), so
 * a 50% miss on fat (a typically-small number) counts the same as a 50%
 * miss on calories (a typically-large one) - otherwise calories would
 * dominate the score and a candidate could look "good" while badly
 * missing protein. Lower is better; 0 is a perfect match on all four.
 */
function scoreMacroFit(candidateMacros, targetMacros) {
  const fields = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
  let totalError = 0;
  for (const field of fields) {
    const target = targetMacros[field];
    const actual = candidateMacros[field] || 0;
    if (target > 0) {
      totalError += Math.abs(actual - target) / target;
    } else if (actual > 0) {
      // Already at or over budget for this macro - any amount is a
      // miss; scale by how much, so a small overage isn't scored the
      // same as a huge one.
      totalError += actual / (Math.abs(target) + 1);
    }
  }
  return totalError;
}

module.exports = { sumMealMacros, scoreMacroFit };
