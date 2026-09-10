/**
 * Normalize Spoonacular API recipe data to our Recipe schema
 */

class RecipeNormalizer {
  /**
   * Generate meal type tags based on recipe name and characteristics
   */
  static generateMealTypeTags(recipe) {
    const mealTypeTags = [];
    const name = recipe.title.toLowerCase();

    const breakfastKeywords = [
      'oatmeal', 'oats', 'pancake', 'waffle', 'crepe', 'french toast',
      'smoothie', 'cereal', 'granola', 'yogurt', 'parfait', 'toast',
      'bagel', 'muffin', 'scone', 'breakfast', 'omelette', 'scrambled',
      'fried egg', 'poached egg', 'overnight', 'breakfast bowl', 'burrito',
      'porridge', 'biscuit', 'grits', 'quinoa breakfast',
    ];

    const lunchKeywords = [
      'salad', 'sandwich', 'wrap', 'bowl', 'tacos', 'burrito',
      'soup', 'stew', 'chili', 'rice bowl', 'grain bowl',
      'lunch', 'midday', 'light', 'quick lunch',
    ];

    const dinnerKeywords = [
      'curry', 'stir fry', 'roast', 'grilled', 'baked', 'steak',
      'chicken', 'beef', 'pork', 'fish', 'seafood', 'pasta',
      'casserole', 'lasagna', 'stuffed', 'dinner', 'main dish',
      'dinner plate', 'protein', 'meal prep',
    ];

    const snackKeywords = [
      'smoothie', 'energy', 'protein bar', 'trail mix', 'nuts',
      'dip', 'hummus', 'chips', 'crackers', 'bites', 'balls',
      'snack', 'finger food', 'appetizer', 'treat', 'dessert',
    ];

    // Check for breakfast keywords
    if (breakfastKeywords.some(keyword => name.includes(keyword))) {
      mealTypeTags.push('breakfast');
    }

    // Check for lunch keywords
    if (lunchKeywords.some(keyword => name.includes(keyword))) {
      mealTypeTags.push('lunch');
    }

    // Check for dinner keywords
    if (dinnerKeywords.some(keyword => name.includes(keyword))) {
      mealTypeTags.push('dinner');
    }

    // Check for snack keywords
    if (snackKeywords.some(keyword => name.includes(keyword))) {
      mealTypeTags.push('snack');
    }

    // Special cases for foods that fit multiple meal types
    if (name.includes('smoothie') && !mealTypeTags.includes('breakfast')) {
      mealTypeTags.push('breakfast', 'snack');
    }

    if (name.includes('oatmeal') && !mealTypeTags.includes('breakfast')) {
      mealTypeTags.push('breakfast');
    }

    if (name.includes('salad') && !mealTypeTags.includes('lunch')) {
      mealTypeTags.push('lunch', 'dinner');
    }

    // If no tags found, add generic 'any' tag
    if (mealTypeTags.length === 0) {
      mealTypeTags.push('any');
    }

    return mealTypeTags;
  }

  /**
   * Generate tags based on recipe properties
   */
  static generateTags(recipe) {
    const tags = [];

    // Protein-based tags
    const proteinPer100Cal = recipe.nutrition?.nutrients?.find(n => n.name === 'Protein');
    if (proteinPer100Cal) {
      const proteinRatio = proteinPer100Cal.amount / recipe.nutrition.calories;
      if (proteinRatio > 0.3) {
        tags.push('high-protein');
      }
    }

    // Budget tag (based on cost per serving if available)
    if (recipe.pricePerServing) {
      const costPerServing = recipe.pricePerServing / 100; // Convert cents to dollars
      if (costPerServing < 3) {
        tags.push('budget');
      } else if (costPerServing > 8) {
        tags.push('expensive');
      }
    }

    // Diet-based tags
    if (recipe.vegetarian) tags.push('vegetarian');
    if (recipe.vegan) tags.push('vegan');
    if (recipe.glutenFree) tags.push('gluten-free');
    if (recipe.dairyFree) tags.push('dairy-free');
    if (recipe.ketogenic) tags.push('keto');
    if (recipe.paleo) tags.push('paleo');

    // Prep time tags
    if (recipe.readyInMinutes <= 15) {
      tags.push('quick');
    } else if (recipe.readyInMinutes <= 30) {
      tags.push('30-min');
    } else if (recipe.readyInMinutes > 60) {
      tags.push('slow-cook');
    }

    // Health tags
    if (recipe.veryHealthy) tags.push('healthy');
    if (recipe.veryPopular) tags.push('popular');

    return tags;
  }

  /**
   * Normalize ingredients to our schema format
   */
  static normalizeIngredients(extendedIngredients) {
    if (!extendedIngredients || !Array.isArray(extendedIngredients)) {
      return [];
    }

    return extendedIngredients.map(ingredient => ({
      name: ingredient.name || ingredient.original,
      quantity: ingredient.amount || ingredient.original,
      unit: ingredient.unit || '',
      original: ingredient.original,
    }));
  }

  /**
   * Normalize steps to our schema format
   */
  static normalizeSteps(analyzedInstructions, instructions) {
    // Try analyzedInstructions first (structured data)
    if (analyzedInstructions && Array.isArray(analyzedInstructions) && analyzedInstructions.length > 0) {
      const steps = [];
      analyzedInstructions.forEach(instruction => {
        if (instruction.steps && Array.isArray(instruction.steps)) {
          instruction.steps.forEach(step => {
            steps.push({
              number: step.number,
              step: step.step,
              ingredients: step.ingredients?.map(i => i.name) || [],
              equipment: step.equipment?.map(e => e.name) || [],
            });
          });
        }
      });

      if (steps.length > 0) {
        return steps;
      }
    }

    // Fallback to simple instructions array
    if (instructions && Array.isArray(instructions) && instructions.length > 0) {
      return instructions.map((instruction, index) => ({
        number: index + 1,
        step: typeof instruction === 'string' ? instruction : instruction.step || instruction,
        ingredients: [],
        equipment: [],
      }));
    }

    // If neither is available, return empty array
    return [];
  }

  /**
   * Extract macro information
   */
  static extractMacros(nutrition) {
    if (!nutrition) {
      return {
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
      };
    }

    // Handle different possible nutrition data structures
    let nutrients = [];
    let calories = 0;

    // Structure 1: nutrition.nutrients array (from addRecipeNutrition)
    if (nutrition.nutrients && Array.isArray(nutrition.nutrients)) {
      nutrients = nutrition.nutrients;
      // Try to get calories from the nutrients array as well
      const calorieNutrient = nutrients.find(n => n.name === 'Calories');
      calories = calorieNutrient ? calorieNutrient.amount : (nutrition.calories || 0);
    }
    // Structure 2: Direct nutrition properties
    else if (nutrition.protein || nutrition.carbs || nutrition.fat) {
      return {
        calories: Math.round(nutrition.calories || 0),
        protein_g: Math.round((nutrition.protein || 0) * 10) / 10,
        carbs_g: Math.round((nutrition.carbs || 0) * 10) / 10,
        fat_g: Math.round((nutrition.fat || 0) * 10) / 10,
      };
    }
    // Structure 3: nutrition.nutrition array (nested structure)
    else if (nutrition.nutrition && Array.isArray(nutrition.nutrition.nutrients)) {
      nutrients = nutrition.nutrition.nutrients;
      const calorieNutrient = nutrients.find(n => n.name === 'Calories');
      calories = calorieNutrient ? calorieNutrient.amount : (nutrition.nutrition.calories || 0);
    }

    const getNutrient = (name) => {
      const nutrient = nutrients.find(n => n.name === name);
      return nutrient ? nutrient.amount : 0;
    };

    return {
      calories: Math.round(calories),
      protein_g: Math.round(getNutrient('Protein') * 10) / 10,
      carbs_g: Math.round(getNutrient('Carbohydrates') * 10) / 10,
      fat_g: Math.round(getNutrient('Fat') * 10) / 10,
    };
  }

  /**
   * Main normalization function
   */
  static normalize(spoonacularRecipe) {
    const macros = this.extractMacros(spoonacularRecipe.nutrition);
    const tags = this.generateTags(spoonacularRecipe);
    const mealTypeTags = this.generateMealTypeTags(spoonacularRecipe);
    const ingredients = this.normalizeIngredients(spoonacularRecipe.extendedIngredients);
    const steps = this.normalizeSteps(spoonacularRecipe.analyzedInstructions, spoonacularRecipe.instructions);

    return {
      name: spoonacularRecipe.title,
      ingredients,
      steps,
      ...macros,
      prep_time_minutes: spoonacularRecipe.readyInMinutes || 0,
      tags,
      meal_type_tags: mealTypeTags,
      // Store original Spoonacular ID for reference
      spoonacular_id: spoonacularRecipe.id,
      source_url: spoonacularRecipe.sourceUrl,
      image_url: spoonacularRecipe.image,
    };
  }

  /**
   * Validate normalized recipe data
   */
  static validate(normalizedRecipe) {
    const errors = [];

    if (!normalizedRecipe.name || normalizedRecipe.name.trim() === '') {
      errors.push('Recipe name is required');
    }

    if (!Array.isArray(normalizedRecipe.ingredients)) {
      errors.push('Ingredients must be an array');
    }

    if (!Array.isArray(normalizedRecipe.steps)) {
      errors.push('Steps must be an array');
    }

    // Allow empty steps array (recipes without instructions during initial seeding)
    // Steps can be populated later with follow-up API calls

    if (normalizedRecipe.calories < 0) {
      errors.push('Calories cannot be negative');
    }

    if (normalizedRecipe.prep_time_minutes < 0) {
      errors.push('Prep time cannot be negative');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

module.exports = RecipeNormalizer;
