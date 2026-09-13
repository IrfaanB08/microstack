/**
 * Restaurant/eating-out suggestions for a meal slot marked "eating out"
 * in a generated plan (see mealPlanGenerator.calculateMealsToPlan).
 *
 * There's no live restaurant-menu API integrated, so these are generic
 * dish CATEGORIES, not real menu items - each with a typical macro
 * RATIO (what fraction of its calories tend to come from protein, carbs,
 * and fat) rather than a fixed size. Given the user's remaining macro
 * budget for that meal, each candidate category is scaled to that
 * calorie level using the same protein/carbs/fat-ratio math
 * MacroCalculator already uses for daily targets, then scored against
 * the target across all four macros (see macroScoring.js) - the same
 * way a nutrition-aware person eyeballing a menu would think "the
 * grilled chicken plate is probably closer to what I need right now
 * than the pasta." The best-fitting 2-3 categories are returned.
 */

const MacroCalculator = require('./macroCalculator');
const { scoreMacroFit } = require('./macroScoring');

// Ratios are typical, not exact - they describe a realistic restaurant
// version of the dish, not a specific recipe. Rows apply to whichever
// meal slots they'd plausibly be ordered for.
const DISH_CATEGORIES = [
  { name: 'Grilled chicken or fish with vegetables', description: 'Grilled protein plate with steamed or roasted vegetables', slots: ['lunch', 'dinner'], ratios: { protein: 0.45, carbs: 0.20, fat: 0.35 } },
  { name: 'Protein and rice bowl', description: 'Burrito bowl, teriyaki bowl, or similar protein-and-grain bowl', slots: ['lunch', 'dinner'], ratios: { protein: 0.35, carbs: 0.40, fat: 0.25 } },
  { name: 'Sushi or poke bowl', description: 'Raw or cooked fish over rice with vegetables', slots: ['lunch', 'dinner'], ratios: { protein: 0.30, carbs: 0.45, fat: 0.25 } },
  { name: 'Stir-fry with protein', description: 'Stir-fried protein and vegetables, usually with rice or noodles', slots: ['lunch', 'dinner'], ratios: { protein: 0.35, carbs: 0.35, fat: 0.30 } },
  { name: 'Salad with grilled protein', description: 'Large salad topped with grilled chicken, steak, or salmon', slots: ['lunch', 'dinner'], ratios: { protein: 0.35, carbs: 0.25, fat: 0.40 } },
  { name: 'Pasta or noodle dish', description: 'Pasta or noodles with a protein and sauce', slots: ['lunch', 'dinner'], ratios: { protein: 0.20, carbs: 0.50, fat: 0.30 } },
  { name: 'Sandwich or wrap', description: 'Deli sandwich or wrap with a side', slots: ['breakfast', 'lunch', 'dinner'], ratios: { protein: 0.25, carbs: 0.45, fat: 0.30 } },
  { name: 'Burger with a side', description: 'Burger (any protein) with fries, salad, or a similar side', slots: ['lunch', 'dinner'], ratios: { protein: 0.25, carbs: 0.40, fat: 0.35 } },
  { name: 'Soup with bread or a side salad', description: 'Broth or cream-based soup with a light side', slots: ['lunch', 'dinner'], ratios: { protein: 0.20, carbs: 0.45, fat: 0.35 } },
  { name: 'Eggs with toast and fruit', description: 'Egg-based breakfast plate with toast and fruit', slots: ['breakfast'], ratios: { protein: 0.30, carbs: 0.40, fat: 0.30 } },
  { name: 'Oatmeal or yogurt parfait', description: 'Oatmeal or yogurt with fruit and granola', slots: ['breakfast'], ratios: { protein: 0.20, carbs: 0.55, fat: 0.25 } },
  { name: 'Breakfast burrito or sandwich', description: 'Egg, cheese, and a protein wrapped or on bread', slots: ['breakfast'], ratios: { protein: 0.25, carbs: 0.45, fat: 0.30 } },
  { name: 'Pancakes or waffles with a protein side', description: 'Pancakes or waffles with eggs, bacon, or sausage on the side', slots: ['breakfast'], ratios: { protein: 0.20, carbs: 0.55, fat: 0.25 } },
  { name: 'Protein smoothie', description: 'Fruit and protein powder or yogurt, blended', slots: ['breakfast', 'snack'], ratios: { protein: 0.35, carbs: 0.45, fat: 0.20 } },
  { name: 'Greek yogurt with fruit and nuts', description: 'Greek yogurt topped with fruit and a handful of nuts', slots: ['snack'], ratios: { protein: 0.30, carbs: 0.40, fat: 0.30 } },
  { name: 'Protein bar or shake', description: 'Packaged protein bar or a ready-to-drink shake', slots: ['snack'], ratios: { protein: 0.40, carbs: 0.35, fat: 0.25 } },
  { name: 'Hummus with vegetables or crackers', description: 'Hummus or a similar dip with vegetables or whole-grain crackers', slots: ['snack'], ratios: { protein: 0.15, carbs: 0.50, fat: 0.35 } },
  { name: 'Nuts and fruit', description: 'A handful of nuts with a piece of fruit', slots: ['snack'], ratios: { protein: 0.15, carbs: 0.40, fat: 0.45 } },
];

// A near-zero remaining budget (the day's other meals already used most
// of the target) would otherwise scale every category down to a
// nonsensical near-zero-gram "dish" - floor it at something a person
// could plausibly order.
const MIN_SUGGESTION_CALORIES = 150;

/**
 * @param {'breakfast'|'lunch'|'dinner'|'snack'} slot
 * @param {{calories:number, protein_g:number, carbs_g:number, fat_g:number}} targetMacros
 *   - the remaining macro budget this one eating-out meal should aim for
 * @param {number} count - how many suggestions to return (default 3)
 * @returns {Array<{name:string, description:string, calories:number, protein_g:number, carbs_g:number, fat_g:number}>}
 */
function suggestEatingOutOptions(slot, targetMacros, count = 3) {
  const candidates = DISH_CATEGORIES.filter((category) => category.slots.includes(slot));
  const targetCalories = Math.max(targetMacros.calories || 0, MIN_SUGGESTION_CALORIES);
  const scaledTarget = { ...targetMacros, calories: targetCalories };

  const scored = candidates.map((category) => {
    const macros = MacroCalculator.calculateMacros(
      targetCalories, category.ratios.protein, category.ratios.carbs, category.ratios.fat
    );
    const candidateMacros = {
      calories: targetCalories,
      protein_g: macros.proteinG,
      carbs_g: macros.carbsG,
      fat_g: macros.fatG,
    };
    return {
      name: category.name,
      description: category.description,
      ...candidateMacros,
      score: scoreMacroFit(candidateMacros, scaledTarget),
    };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, count).map(({ score, ...suggestion }) => suggestion);
}

module.exports = { suggestEatingOutOptions, DISH_CATEGORIES };
