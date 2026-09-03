/**
 * Normalize Spoonacular API recipe data to our Recipe schema
 */

class RecipeNormalizer {
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

    // Meal type tags based on dish types
    if (recipe.dishTypes) {
      if (recipe.dishTypes.includes('breakfast')) tags.push('breakfast');
      if (recipe.dishTypes.includes('lunch')) tags.push('lunch');
      if (recipe.dishTypes.includes('dinner')) tags.push('dinner');
      if (recipe.dishTypes.includes('snack')) tags.push('snack');
    }

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
    const ingredients = this.normalizeIngredients(spoonacularRecipe.extendedIngredients);
    const steps = this.normalizeSteps(spoonacularRecipe.analyzedInstructions, spoonacularRecipe.instructions);

    return {
      name: spoonacularRecipe.title,
      ingredients,
      steps,
      ...macros,
      prep_time_minutes: spoonacularRecipe.readyInMinutes || 0,
      tags,
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
