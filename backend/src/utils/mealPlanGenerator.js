const Recipe = require('../models/Recipe');
const MealPlan = require('../models/MealPlan');
const PlannedMeal = require('../models/PlannedMeal');

class MealPlanGenerator {
  constructor() {
    this.mealSlots = ['breakfast', 'lunch', 'dinner', 'snack'];
    this.daysOfWeek = [0, 1, 2, 3, 4, 5, 6]; // 0=Sunday, 6=Saturday
    this.macroTolerance = 0.1; // 10% tolerance for macro targets
  }

  /**
   * Generate a full week meal plan for a user
   */
  async generateWeeklyPlan(user, options = {}) {
    const {
      weekStartDate = this.getCurrentWeekStart(),
      regenerate = false,
      existingMealPlan = null,
    } = options;

    try {
      // Get user's macro targets (calculate if not set)
      const macroTargets = this.getUserMacroTargets(user);

      // Determine which meals to plan based on eating-out frequency
      const mealsToPlan = this.calculateMealsToPlan(user.eating_out_frequency);

      // Fetch suitable recipes based on user preferences
      const suitableRecipes = await this.fetchSuitableRecipes(user);

      if (suitableRecipes.length === 0) {
        throw new Error('No suitable recipes found matching your preferences');
      }

      // Generate meal assignments
      const mealAssignments = await this.assignMealsToSlots(
        suitableRecipes,
        macroTargets,
        mealsToPlan,
        existingMealPlan
      );

      // Calculate daily macro totals
      const dailyMacros = this.calculateDailyMacros(mealAssignments, suitableRecipes);

      // Adjust meal assignments to better hit macro targets
      const adjustedAssignments = this.adjustForMacroTargets(
        mealAssignments,
        suitableRecipes,
        macroTargets,
        dailyMacros
      );

      // Save to database
      const mealPlan = await this.saveMealPlan(
        user.id,
        weekStartDate,
        user.goal,
        adjustedAssignments,
        regenerate
      );

      return {
        mealPlan,
        assignments: adjustedAssignments,
        dailyMacros: this.calculateDailyMacros(adjustedAssignments, suitableRecipes),
        weeklyMacros: this.calculateWeeklyMacros(adjustedAssignments, suitableRecipes),
        macroTargets,
      };
    } catch (error) {
      console.error('Error generating meal plan:', error);
      throw error;
    }
  }

  /**
   * Get current week start date (Sunday)
   */
  getCurrentWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    const sunday = new Date(now.setDate(diff));
    sunday.setHours(0, 0, 0, 0);
    // Return date in YYYY-MM-DD format
    return sunday.toISOString().split('T')[0];
  }

  /**
   * Get user's macro targets (calculate if not set)
   */
  getUserMacroTargets(user) {
    // If user has body stats, calculate targets
    if (user.weight_kg && user.height_cm && user.age && user.sex && user.activity_level) {
      const MacroCalculator = require('./macroCalculator');
      const bodyStats = {
        weight_kg: user.weight_kg,
        height_cm: user.height_cm,
        age: user.age,
        sex: user.sex,
      };
      return MacroCalculator.calculateTargets(bodyStats, user.goal, user.activity_level);
    }

    // Default targets if body stats not available
    return {
      calories: 2000,
      protein_g: 150,
      carbs_g: 200,
      fat_g: 65,
    };
  }

  /**
   * Calculate which meals to plan based on eating-out frequency
   */
  calculateMealsToPlan(eatingOutFrequency) {
    const mealsToPlan = {};
    const totalWeeklyMeals = 28; // 7 days × 4 meals
    const mealsToSkip = Math.min(eatingOutFrequency || 0, totalWeeklyMeals);

    // Skip dinner meals first, then lunch
    const skippedMeals = [];
    let mealsSkipped = 0;

    // Skip dinners first
    for (let day = 0; day < 7 && mealsSkipped < mealsToSkip; day++) {
      skippedMeals.push({ day, slot: 'dinner' });
      mealsSkipped++;
    }

    // Then skip lunches if needed
    for (let day = 0; day < 7 && mealsSkipped < mealsToSkip; day++) {
      skippedMeals.push({ day, slot: 'lunch' });
      mealsSkipped++;
    }

    // Mark which meals to plan
    for (const day of this.daysOfWeek) {
      mealsToPlan[day] = {};
      for (const slot of this.mealSlots) {
        const isSkipped = skippedMeals.some(m => m.day === day && m.slot === slot);
        mealsToPlan[day][slot] = !isSkipped;
      }
    }

    return mealsToPlan;
  }

  /**
   * Fetch suitable recipes based on user preferences
   */
  async fetchSuitableRecipes(user) {
    try {
      // Build recipe filters based on user preferences
      const filters = {
        limit: 500, // Get a large pool to choose from
      };

      // Filter by dietary preferences
      if (user.dietary_preferences && Array.isArray(user.dietary_preferences)) {
        const prefs = user.dietary_preferences;
        
        // Check for vegetarian/vegan
        if (prefs.includes('vegetarian') || prefs.includes('vegan')) {
          filters.tags = prefs.includes('vegan') ? ['vegan'] : ['vegetarian'];
        }

        // Check for other restrictions
        if (prefs.includes('gluten-free')) {
          filters.tags = filters.tags ? [...filters.tags, 'gluten-free'] : ['gluten-free'];
        }
      }

      // Filter by prep time preference
      if (user.prep_time_preference === 'batch') {
        // Batch cooking allows longer prep times
        filters.max_prep_time = 90;
      } else {
        // Daily cooking needs quick meals
        filters.max_prep_time = 30;
      }

      // Fetch recipes from database
      const recipes = await Recipe.findAll(filters);

      // Additional filtering for dietary preferences
      return recipes.filter(recipe => {
        // Check dietary preferences against recipe tags
        if (user.dietary_preferences && user.dietary_preferences.length > 0) {
          const recipeTags = recipe.tags || [];
          
          // If user wants vegetarian/vegan, recipe must match
          if (user.dietary_preferences.includes('vegetarian') && 
              !recipeTags.includes('vegetarian') && !recipeTags.includes('vegan')) {
            return false;
          }
          
          if (user.dietary_preferences.includes('vegan') && 
              !recipeTags.includes('vegan')) {
            return false;
          }

          // Check for allergens/dislikes
          const avoidList = user.dietary_preferences.filter(p => 
            !['vegetarian', 'vegan', 'gluten-free'].includes(p)
          );
          
          if (avoidList.length > 0) {
            // Simple check - avoid recipes with allergen names in ingredients
            const recipeIngredients = recipe.ingredients || [];
            const ingredientNames = recipeIngredients.map(i => 
              i.name?.toLowerCase() || ''
            );
            
            for (const avoid of avoidList) {
              if (ingredientNames.some(name => name.includes(avoid.toLowerCase()))) {
                return false;
              }
            }
          }
        }

        return true;
      });
    } catch (error) {
      console.error('Error fetching suitable recipes:', error);
      return [];
    }
  }

  /**
   * Assign recipes to meal slots
   */
  async assignMealsToSlots(recipes, macroTargets, mealsToPlan, existingMealPlan = null) {
    const assignments = {};
    const usedRecipes = new Set();

    // If regenerating, preserve existing assignments where possible
    let existingAssignments = {};
    if (existingMealPlan) {
      existingAssignments = await this.extractExistingAssignments(existingMealPlan);
    }

    for (const day of this.daysOfWeek) {
      assignments[day] = {};

      for (const slot of this.mealSlots) {
        // Skip if this meal slot should not be planned
        if (!mealsToPlan[day] || !mealsToPlan[day][slot]) {
          assignments[day][slot] = null;
          continue;
        }

        // Try to preserve existing assignment if regenerating
        if (existingAssignments[day] && existingAssignments[day][slot]) {
          const existingRecipe = existingAssignments[day][slot];
          if (!usedRecipes.has(existingRecipe.id)) {
            assignments[day][slot] = existingRecipe;
            usedRecipes.add(existingRecipe.id);
            continue;
          }
        }

        // Calculate target calories for this slot
        const dayCaloriesSoFar = Object.values(assignments[day] || {})
          .filter(r => r !== null)
          .reduce((sum, r) => {
            const multiplier = r._portionMultiplier || 1.0;
            return sum + ((parseFloat(r.calories) || 0) * multiplier);
          }, 0);
        
        const remainingCalories = macroTargets.calories - dayCaloriesSoFar;
        const remainingSlots = this.mealSlots.filter(s => 
          !assignments[day][s] && mealsToPlan[day]?.[s]
        ).length;
        
        const targetPerSlot = remainingSlots > 0 ? remainingCalories / remainingSlots : 0;

        // Get suitable recipes for this slot
        const slotRecipes = this.getRecipesForSlot(recipes, slot, usedRecipes);
        
        if (slotRecipes.length > 0) {
          // Calculate required portion multiplier to hit target
          const selectedRecipe = this.selectRecipeForSlot(
            slotRecipes, 
            slot, 
            macroTargets,
            assignments,
            day,
            mealsToPlan
          );
          
          // Calculate portion multiplier to hit target calories
          const recipeCalories = parseFloat(selectedRecipe.calories) || 1;
          const portionMultiplier = targetPerSlot / recipeCalories;
          
          // Store recipe with portion multiplier
          assignments[day][slot] = {
            ...selectedRecipe,
            _portionMultiplier: Math.max(0.5, Math.min(3.0, portionMultiplier)), // Clamp between 0.5x and 3x
          };
          
          usedRecipes.add(selectedRecipe.id);
        } else {
          assignments[day][slot] = null;
        }
      }
    }

    return assignments;
  }

  /**
   * Extract existing meal assignments from a meal plan
   */
  async extractExistingAssignments(mealPlan) {
    try {
      const plannedMeals = await PlannedMeal.findByMealPlanId(mealPlan.id);
      const assignments = {};

      for (const plannedMeal of plannedMeals) {
        const day = plannedMeal.day_of_week;
        const slot = plannedMeal.meal_slot;
        
        if (!assignments[day]) {
          assignments[day] = {};
        }
        
        // Get recipe details
        const recipe = await Recipe.findById(plannedMeal.recipe_id);
        if (recipe) {
          assignments[day][slot] = recipe;
        }
      }

      return assignments;
    } catch (error) {
      console.error('Error extracting existing assignments:', error);
      return {};
    }
  }

  /**
   * Get suitable recipes for a specific meal slot
   */
  getRecipesForSlot(recipes, slot, usedRecipes) {
    // Filter by meal type tags if available
    const slotSpecificRecipes = recipes.filter(recipe => {
      if (usedRecipes.has(recipe.id)) return false;
      
      const tags = recipe.tags || [];
      
      // Prefer recipes tagged for this meal type
      if (tags.includes(slot)) return true;
      
      // Allow any recipe if no specific tag
      return true;
    });

    return slotSpecificRecipes;
  }

  /**
   * Select a recipe for a specific slot considering macros
   */
  selectRecipeForSlot(recipes, slot, macroTargets, currentAssignments, currentDay, mealsToPlan) {
    // Calculate remaining calorie budget for the day
    const dayCaloriesSoFar = Object.values(currentAssignments[currentDay] || {})
      .filter(r => r !== null)
      .reduce((sum, r) => sum + (parseFloat(r.calories) || 0), 0);
    
    const remainingCalories = macroTargets.calories - dayCaloriesSoFar;
    const remainingSlots = this.mealSlots.filter(s => 
      !currentAssignments[currentDay][s] && mealsToPlan[currentDay]?.[s]
    ).length;
    
    // Target calories per remaining slot
    const targetPerSlot = remainingSlots > 0 ? remainingCalories / remainingSlots : 0;

    // Find recipes closest to target calories
    const scoredRecipes = recipes.map(recipe => {
      const recipeCalories = parseFloat(recipe.calories) || 0;
      const calorieDiff = Math.abs(recipeCalories - targetPerSlot);
      
      // Score: closer to target is better
      return {
        recipe,
        score: calorieDiff,
        calories: recipeCalories,
      };
    });

    // Sort by score (lowest diff first)
    scoredRecipes.sort((a, b) => a.score - b.score);

    // Return the best matching recipe
    return scoredRecipes[0].recipe;
  }

  /**
   * Combine multiple recipes to hit calorie targets
   */
  combineRecipesForSlot(recipes, targetCalories, usedRecipes) {
    // Allow recipe reuse if we're running low on options
    const availableRecipes = recipes.length > 20 ? recipes.filter(r => !usedRecipes.has(r.id)) : recipes;
    
    // Try to find a single recipe close to target first
    const singleScores = availableRecipes.map(r => ({
      recipe: r,
      diff: Math.abs(parseFloat(r.calories) - targetCalories),
    })).sort((a, b) => a.diff - b.diff);

    // If a single recipe is within 20% of target, use it
    if (singleScores.length > 0 && singleScores[0].diff < targetCalories * 0.2) {
      return {
        recipes: [singleScores[0].recipe],
        totalCalories: parseFloat(singleScores[0].recipe.calories),
        isCombined: false,
      };
    }

    // Otherwise, try to combine 2-3 recipes
    const bestCombination = this.findBestRecipeCombination(availableRecipes, targetCalories);
    
    if (bestCombination) {
      return {
        recipes: bestCombination,
        totalCalories: bestCombination.reduce((sum, r) => sum + parseFloat(r.calories), 0),
        isCombined: true,
      };
    }

    // Fallback to single best recipe
    if (singleScores.length > 0) {
      return {
        recipes: [singleScores[0].recipe],
        totalCalories: parseFloat(singleScores[0].recipe.calories),
        isCombined: false,
      };
    }

    return null;
  }

  /**
   * Find best combination of recipes to hit target calories
   */
  findBestRecipeCombination(recipes, targetCalories) {
    // Try combinations of 2 recipes
    for (let i = 0; i < recipes.length; i++) {
      for (let j = i + 1; j < recipes.length; j++) {
        const combo = [recipes[i], recipes[j]];
        const totalCalories = combo.reduce((sum, r) => sum + parseFloat(r.calories), 0);
        const diff = Math.abs(totalCalories - targetCalories);
        
        if (diff < targetCalories * 0.25) { // Within 25% of target
          return combo;
        }
      }
    }

    // Try combinations of 3 recipes
    for (let i = 0; i < recipes.length; i++) {
      for (let j = i + 1; j < recipes.length; j++) {
        for (let k = j + 1; k < recipes.length; k++) {
          const combo = [recipes[i], recipes[j], recipes[k]];
          const totalCalories = combo.reduce((sum, r) => sum + parseFloat(r.calories), 0);
          const diff = Math.abs(totalCalories - targetCalories);
          
          if (diff < targetCalories * 0.2) { // Within 20% of target
            return combo;
          }
        }
      }
    }

    return null;
  }

  /**
   * Calculate daily macro totals
   */
  calculateDailyMacros(assignments, recipes) {
    const dailyMacros = {};

    for (const day of this.daysOfWeek) {
      dailyMacros[day] = {
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
      };

      for (const slot of this.mealSlots) {
        const meal = assignments[day][slot];
        if (meal) {
          // Handle portion multipliers
          const multiplier = meal._portionMultiplier || 1.0;
          
          dailyMacros[day].calories += (parseFloat(meal.calories) || 0) * multiplier;
          dailyMacros[day].protein_g += (parseFloat(meal.protein_g) || 0) * multiplier;
          dailyMacros[day].carbs_g += (parseFloat(meal.carbs_g) || 0) * multiplier;
          dailyMacros[day].fat_g += (parseFloat(meal.fat_g) || 0) * multiplier;
        }
      }
    }

    return dailyMacros;
  }

  /**
   * Calculate weekly macro totals
   */
  calculateWeeklyMacros(assignments, recipes) {
    const dailyMacros = this.calculateDailyMacros(assignments, recipes);
    const weeklyMacros = {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    };

    for (const day of this.daysOfWeek) {
      weeklyMacros.calories += parseFloat(dailyMacros[day].calories) || 0;
      weeklyMacros.protein_g += parseFloat(dailyMacros[day].protein_g) || 0;
      weeklyMacros.carbs_g += parseFloat(dailyMacros[day].carbs_g) || 0;
      weeklyMacros.fat_g += parseFloat(dailyMacros[day].fat_g) || 0;
    }

    return weeklyMacros;
  }

  /**
   * Adjust meal assignments to better hit macro targets
   */
  adjustForMacroTargets(assignments, recipes, macroTargets, dailyMacros) {
    // Skip adjustment to preserve combined meals
    // The combination logic already tries to hit targets
    return assignments;
  }

  /**
   * Save meal plan to database
   */
  async saveMealPlan(userId, weekStartDate, goal, assignments, regenerate = false) {
    try {
      // Ensure weekStartDate is in YYYY-MM-DD format
      const cleanWeekStartDate = weekStartDate.split('T')[0];

      // Check if meal plan already exists for this week
      let mealPlan = await MealPlan.findByUserAndWeek(userId, cleanWeekStartDate);

      // Delete existing meal plan if regenerating
      if (mealPlan && regenerate) {
        await PlannedMeal.deleteByMealPlanId(mealPlan.id);
        await MealPlan.delete(mealPlan.id);
        mealPlan = null;
      }

      // Create new meal plan
      mealPlan = await MealPlan.create({
        user_id: userId,
        week_start_date: cleanWeekStartDate,
        goal,
      });

      // Create planned meals
      for (const day of this.daysOfWeek) {
        for (const slot of this.mealSlots) {
          const meal = assignments[day][slot];
          if (meal) {
            // For combined meals, use the primary recipe (first one)
            // In production, you'd want to store the combination information
            const recipeId = meal._isCombined ? meal._combinationRecipes[0].id : meal.id;
            
            await PlannedMeal.create({
              meal_plan_id: mealPlan.id,
              recipe_id: recipeId,
              day_of_week: day,
              meal_slot: slot,
            });
          }
        }
      }

      return mealPlan;
    } catch (error) {
      console.error('Error saving meal plan:', error);
      throw error;
    }
  }

  /**
   * Swap a single meal in an existing plan
   */
  async swapMeal(mealPlanId, day, slot, userPreferences) {
    try {
      const mealPlan = await MealPlan.findById(mealPlanId);
      if (!mealPlan) {
        throw new Error('Meal plan not found');
      }

      const User = require('../models/User');
      const user = await User.findById(mealPlan.user_id);
      if (!user) {
        throw new Error('User not found');
      }

      // Get current assignment
      const plannedMeals = await PlannedMeal.findByMealPlanIdAndDay(mealPlanId, day);
      const currentPlannedMeal = plannedMeals.find(pm => pm.meal_slot === slot);

      if (!currentPlannedMeal) {
        throw new Error('No meal found for this slot');
      }

      // Get suitable recipes (excluding current recipe)
      const suitableRecipes = await this.fetchSuitableRecipes(user);
      const availableRecipes = suitableRecipes.filter(r => 
        r.id !== currentPlannedMeal.recipe_id
      );

      if (availableRecipes.length === 0) {
        throw new Error('No alternative recipes available');
      }

      // Select new recipe
      const newRecipe = this.selectRecipeForSlot(
        availableRecipes, 
        slot, 
        this.getUserMacroTargets(user),
        {},
        day,
        {}
      );

      // Update planned meal
      const updatedPlannedMeal = await PlannedMeal.update(currentPlannedMeal.id, {
        recipe_id: newRecipe.id,
      });

      return {
        previousRecipeId: currentPlannedMeal.recipe_id,
        newRecipe,
        updatedPlannedMeal,
      };
    } catch (error) {
      console.error('Error swapping meal:', error);
      throw error;
    }
  }

  /**
   * Regenerate a single day's meals
   */
  async regenerateDay(mealPlanId, day, userPreferences) {
    try {
      const mealPlan = await MealPlan.findById(mealPlanId);
      if (!mealPlan) {
        throw new Error('Meal plan not found');
      }

      const User = require('../models/User');
      const user = await User.findById(mealPlan.user_id);
      if (!user) {
        throw new Error('User not found');
      }

      // Delete existing meals for this day
      const plannedMeals = await PlannedMeal.findByMealPlanIdAndDay(mealPlanId, day);
      for (const pm of plannedMeals) {
        await PlannedMeal.delete(pm.id);
      }

      // Generate new assignments for this day
      const macroTargets = this.getUserMacroTargets(user);
      const suitableRecipes = await this.fetchSuitableRecipes(user);
      const mealsToPlan = this.calculateMealsToPlan(user.eating_out_frequency);

      const dayAssignments = {};
      const usedRecipes = new Set();

      for (const slot of this.mealSlots) {
        if (!mealsToPlan[day] || !mealsToPlan[day][slot]) {
          dayAssignments[slot] = null;
          continue;
        }

        const slotRecipes = this.getRecipesForSlot(suitableRecipes, slot, usedRecipes);
        if (slotRecipes.length > 0) {
          const selectedRecipe = this.selectRecipeForSlot(
            slotRecipes, 
            slot, 
            macroTargets,
            {},
            day,
            mealsToPlan
          );
          dayAssignments[slot] = selectedRecipe;
          usedRecipes.add(selectedRecipe.id);
        } else {
          dayAssignments[slot] = null;
        }
      }

      // Create new planned meals
      for (const slot of this.mealSlots) {
        const recipe = dayAssignments[slot];
        if (recipe) {
          await PlannedMeal.create({
            meal_plan_id: mealPlan.id,
            recipe_id: recipe.id,
            day_of_week: day,
            meal_slot: slot,
          });
        }
      }

      return {
        day,
        assignments: dayAssignments,
        mealPlan,
      };
    } catch (error) {
      console.error('Error regenerating day:', error);
      throw error;
    }
  }
}

module.exports = MealPlanGenerator;
