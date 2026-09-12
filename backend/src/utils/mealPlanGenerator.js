const Recipe = require('../models/Recipe');
const MealPlan = require('../models/MealPlan');
const PlannedMeal = require('../models/PlannedMeal');
const { getTodayDate, getWeekStartDate } = require('./dateHelpers');
const { getDayType } = require('./workoutSchedule');

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
      // Get the user's macro targets for each day of the week - training
      // days and rest days get their own (macro-cycled) target instead of
      // one flat target shared across the whole week.
      const macroTargetsByDay = this.getUserMacroTargetsForWeek(user);

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
        macroTargetsByDay,
        mealsToPlan,
        existingMealPlan,
        user.prep_time_preference
      );

      // Calculate daily macro totals
      const dailyMacros = this.calculateDailyMacros(mealAssignments, suitableRecipes);

      // Adjust meal assignments to better hit macro targets
      const adjustedAssignments = this.adjustForMacroTargets(
        mealAssignments,
        suitableRecipes,
        macroTargetsByDay,
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
        macroTargetsByDay,
      };
    } catch (error) {
      console.error('Error generating meal plan:', error);
      throw error;
    }
  }

  /**
   * Get current week start date (Sunday), as a plain 'YYYY-MM-DD' string.
   *
   * Delegates to dateHelpers rather than doing this inline: the previous
   * implementation built the date at local midnight and read it back via
   * `.toISOString()`, which converts to UTC and silently returns the
   * previous calendar day whenever the server's timezone is ahead of UTC.
   * That's not just a display glitch - the shifted string is what gets
   * stored as meal_plans.week_start_date, so plans generated without an
   * explicit week (e.g. right after onboarding) landed on the wrong week
   * and became invisible to lookups that compute the correct Sunday.
   */
  getCurrentWeekStart() {
    return getWeekStartDate(getTodayDate());
  }

  /**
   * Get user's macro targets (calculate if not set), with no day-specific
   * macro cycling applied. Kept for callers that genuinely want one flat
   * target regardless of day (e.g. a generic "your targets" preview);
   * meal plan generation itself uses getUserMacroTargetsForDay/-ForWeek
   * below so training and rest days get their own cycled targets.
   */
  getUserMacroTargets(user) {
    return this.getUserMacroTargetsForDay(user, undefined);
  }

  /**
   * Get the user's macro targets for one specific day of the week -
   * same total calories as any other day, but with carbs/fat cycled
   * toward carbs on a training day or fat on a rest day (see
   * MacroCalculator.getMacroRatios). Pass `dayOfWeek: undefined` for the
   * plain, uncycled targets.
   */
  getUserMacroTargetsForDay(user, dayOfWeek) {
    const dayType = dayOfWeek === undefined ? undefined : getDayType(user, dayOfWeek);

    // If user has body stats, calculate targets
    if (user.weight_kg && user.height_cm && user.age && user.sex && user.activity_level) {
      const MacroCalculator = require('./macroCalculator');
      const bodyStats = {
        weight_kg: user.weight_kg,
        height_cm: user.height_cm,
        age: user.age,
        sex: user.sex,
      };
      return MacroCalculator.calculateTargets(bodyStats, user.goal, user.activity_level, dayType);
    }

    // Default targets if body stats not available - macro cycling needs
    // real body stats to compute a calorie base to shift within, so this
    // fallback stays flat regardless of day type.
    return {
      calories: 2000,
      protein_g: 150,
      carbs_g: 200,
      fat_g: 65,
      dayType: dayType || 'neutral',
    };
  }

  /**
   * Get the user's macro targets for every day of the week at once, keyed
   * by day_of_week (0=Sunday..6=Saturday) - what generateWeeklyPlan uses
   * so each day's slot-filling and macro reporting reflects that day's
   * own (possibly cycled) target instead of one shared flat value.
   */
  getUserMacroTargetsForWeek(user) {
    const targetsByDay = {};
    for (const day of this.daysOfWeek) {
      targetsByDay[day] = this.getUserMacroTargetsForDay(user, day);
    }
    return targetsByDay;
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
   * Assign recipes to meal slots.
   *
   * Daily-preference users get the variety-maximizing behavior below (a
   * different recipe for nearly every slot). Batch-preference users are
   * routed to assignMealsToSlotsBatch instead, which deliberately repeats
   * a small pool of recipes so there's something worth batch-cooking.
   */
  async assignMealsToSlots(recipes, macroTargetsByDay, mealsToPlan, existingMealPlan = null, prepTimePreference = 'daily') {
    if (prepTimePreference === 'batch') {
      return this.assignMealsToSlotsBatch(recipes, macroTargetsByDay, mealsToPlan);
    }

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

        // Calculate target calories for this slot with adaptive approach
        const dayCaloriesSoFar = Object.values(assignments[day] || {})
          .filter(r => r !== null)
          .reduce((sum, r) => {
            if (r._isCombined && r._combinationRecipes) {
              return sum + r._totalCalories;
            }
            const multiplier = r._portionMultiplier || 1.0;
            return sum + ((parseFloat(r.calories) || 0) * multiplier);
          }, 0);
        
        const remainingCalories = macroTargetsByDay[day].calories - dayCaloriesSoFar;
        const remainingSlots = this.mealSlots.filter(s =>
          !assignments[day][s] && mealsToPlan[day]?.[s]
        ).length;

        // Use adaptive target based on remaining budget
        const targetPerSlot = remainingSlots > 0 ? remainingCalories / remainingSlots : 0;

        // Get suitable recipes for this slot
        const slotRecipes = this.getRecipesForSlot(recipes, slot, usedRecipes);

        if (slotRecipes.length > 0) {
          // Try to combine 2-3 recipes to hit target
          const mealCombination = this.combineRecipesForSlot(slotRecipes, targetPerSlot, usedRecipes, slot);
          
          if (mealCombination) {
            // Mark all recipes in combination as used
            mealCombination.recipes.forEach(r => usedRecipes.add(r.id));
            
            // Store as combined meal with realistic portion scaling
            assignments[day][slot] = {
              _isCombined: mealCombination.isCombined,
              _combinationRecipes: mealCombination.recipes,
              _totalCalories: mealCombination.totalCalories,
              // For database compatibility, use first recipe as primary
              ...mealCombination.recipes[0],
            };
          } else {
            // Fallback to single recipe with realistic portion scaling (max 1.5x)
            const selectedRecipe = this.selectRecipeForSlot(
              slotRecipes,
              slot,
              macroTargetsByDay[day],
              assignments,
              day,
              mealsToPlan
            );
            
            // Calculate realistic portion multiplier (capped at 1.5x)
            const recipeCalories = parseFloat(selectedRecipe.calories) || 1;
            const portionMultiplier = Math.min(1.5, Math.max(1.0, targetPerSlot / recipeCalories));
            
            assignments[day][slot] = {
              ...selectedRecipe,
              _portionMultiplier: portionMultiplier,
            };
            
            usedRecipes.add(selectedRecipe.id);
          }
        } else {
          assignments[day][slot] = null;
        }
      }
    }

    return assignments;
  }

  /**
   * Assign recipes for a batch-preference week: instead of a different
   * recipe per slot, pick one "anchor" recipe per meal-slot type
   * (breakfast/lunch/dinner/snack) and repeat it on every day that slot is
   * planned. This is what makes batch cooking worthwhile - the same
   * recipe, cooked once in bulk, covers most/all of the week for that
   * meal, with portions scaled to approximate each day's remaining
   * calorie budget (same portion-scaling approach as the single-recipe
   * fallback above, capped at 1.5x).
   */
  assignMealsToSlotsBatch(recipes, macroTargetsByDay, mealsToPlan) {
    const assignments = {};
    const anchorPool = this.selectBatchRecipePool(recipes, macroTargetsByDay, mealsToPlan);

    for (const day of this.daysOfWeek) {
      assignments[day] = {};

      for (const slot of this.mealSlots) {
        if (!mealsToPlan[day] || !mealsToPlan[day][slot]) {
          assignments[day][slot] = null;
          continue;
        }

        const anchorRecipe = anchorPool[slot];
        if (!anchorRecipe) {
          assignments[day][slot] = null;
          continue;
        }

        const dayCaloriesSoFar = Object.values(assignments[day])
          .filter((r) => r !== null)
          .reduce((sum, r) => sum + (parseFloat(r.calories) || 0) * (r._portionMultiplier || 1.0), 0);

        const remainingCalories = macroTargetsByDay[day].calories - dayCaloriesSoFar;
        const remainingSlots = this.mealSlots.filter(
          (s) => !assignments[day][s] && mealsToPlan[day]?.[s]
        ).length;
        const targetForSlot = remainingSlots > 0 ? remainingCalories / remainingSlots : 0;

        const recipeCalories = parseFloat(anchorRecipe.calories) || 1;
        const portionMultiplier = Math.min(1.5, Math.max(1.0, targetForSlot / recipeCalories));

        assignments[day][slot] = {
          ...anchorRecipe,
          _portionMultiplier: portionMultiplier,
        };
      }
    }

    return assignments;
  }

  /**
   * Choose one anchor recipe per meal-slot type for a batch-preference
   * week. Each slot type that's actually needed this week (per
   * mealsToPlan / eating-out frequency) gets the suitable recipe whose
   * calories land closest to an even share of the daily calorie target -
   * this typically yields 3-4 unique recipes for the whole week, each one
   * repeated across every day that slot is planned.
   */
  selectBatchRecipePool(recipes, macroTargetsByDay, mealsToPlan) {
    const pool = {};
    const usedRecipeIds = new Set();
    // Calorie targets are the same every day (macro cycling only shifts
    // carbs/fat) - average across the week purely as a defensive guard in
    // case that ever changes, rather than assuming day 0 is representative.
    const avgDailyCalories = this.daysOfWeek.reduce(
      (sum, day) => sum + macroTargetsByDay[day].calories, 0
    ) / this.daysOfWeek.length;
    const approxTargetPerSlot = avgDailyCalories / this.mealSlots.length;

    for (const slot of this.mealSlots) {
      const slotNeeded = this.daysOfWeek.some((day) => mealsToPlan[day]?.[slot]);
      if (!slotNeeded) continue;

      const candidates = this.getRecipesForSlot(recipes, slot, usedRecipeIds);
      if (candidates.length === 0) continue;

      const best = candidates.reduce((best, recipe) => {
        const diff = Math.abs((parseFloat(recipe.calories) || 0) - approxTargetPerSlot);
        return diff < best.diff ? { recipe, diff } : best;
      }, { recipe: null, diff: Infinity });

      if (best.recipe) {
        pool[slot] = best.recipe;
        usedRecipeIds.add(best.recipe.id);
      }
    }

    return pool;
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
      
      const mealTypeTags = recipe.meal_type_tags || [];
      
      // Prefer recipes tagged for this meal type
      if (mealTypeTags.includes(slot)) return true;
      
      // Allow recipes tagged as 'any' for any slot
      if (mealTypeTags.includes('any')) return true;
      
      // For snack slot, be more restrictive (only snack-tagged or any-tagged)
      if (slot === 'snack') {
        return mealTypeTags.includes('snack') || mealTypeTags.includes('any');
      }
      
      // For other slots, allow recipes without specific meal type tags
      return mealTypeTags.length === 0;
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
      .reduce((sum, r) => {
        if (r._isCombined && r._combinationRecipes) {
          return sum + r._totalCalories;
        }
        const multiplier = r._portionMultiplier || 1.0;
        return sum + ((parseFloat(r.calories) || 0) * multiplier);
      }, 0);
    
    const remainingCalories = macroTargets.calories - dayCaloriesSoFar;
    const remainingSlots = this.mealSlots.filter(s =>
      !currentAssignments[currentDay]?.[s] && mealsToPlan[currentDay]?.[s]
    ).length;
    
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
  combineRecipesForSlot(recipes, targetCalories, usedRecipes, slot) {
    // Allow more recipe reuse to avoid running out
    const availableRecipes = recipes.length > 30 ? recipes.filter(r => !usedRecipes.has(r.id)) : recipes;
    
    if (availableRecipes.length === 0) return null;

    // For snack slot, limit to 1-2 items and lower calorie ceiling
    if (slot === 'snack') {
      const snackCeiling = 600; // Max 600 calories for snacks
      const adjustedTarget = Math.min(targetCalories, snackCeiling);
      
      // Try combinations of 2 recipes only
      for (let i = 0; i < availableRecipes.length; i++) {
        for (let j = i + 1; j < availableRecipes.length; j++) {
          const combo = [availableRecipes[i], availableRecipes[j]];
          const totalCalories = combo.reduce((sum, r) => sum + parseFloat(r.calories), 0);
          
          // For snacks, accept anything within 200-600 calories
          if (totalCalories >= 200 && totalCalories <= snackCeiling) {
            return {
              recipes: combo,
              totalCalories: totalCalories,
              isCombined: true,
            };
          }
        }
      }
      
      // Fallback to single recipe
      const bestSingle = availableRecipes.reduce((best, r) => {
        const calories = parseFloat(r.calories);
        const diff = Math.abs(calories - adjustedTarget);
        return diff < best.diff ? { recipe: r, diff } : best;
      }, { recipe: null, diff: Infinity });
      
      if (bestSingle.recipe) {
        return {
          recipes: [bestSingle.recipe],
          totalCalories: parseFloat(bestSingle.recipe.calories),
          isCombined: false,
        };
      }
      
      return null;
    }

    // For main meals (breakfast, lunch, dinner), find the best combination overall
    let bestCombination = null;
    let bestDiff = Infinity;

    // Try combinations of 2 recipes
    for (let i = 0; i < availableRecipes.length; i++) {
      for (let j = i + 1; j < availableRecipes.length; j++) {
        const combo = [availableRecipes[i], availableRecipes[j]];
        const totalCalories = combo.reduce((sum, r) => sum + parseFloat(r.calories), 0);
        const diff = Math.abs(totalCalories - targetCalories);
        
        if (diff < bestDiff) {
          bestDiff = diff;
          bestCombination = {
            recipes: combo,
            totalCalories: totalCalories,
            isCombined: true,
          };
        }
      }
    }

    // Try combinations of 3 recipes
    for (let i = 0; i < availableRecipes.length; i++) {
      for (let j = i + 1; j < availableRecipes.length; j++) {
        for (let k = j + 1; k < availableRecipes.length; k++) {
          const combo = [availableRecipes[i], availableRecipes[j], availableRecipes[k]];
          const totalCalories = combo.reduce((sum, r) => sum + parseFloat(r.calories), 0);
          const diff = Math.abs(totalCalories - targetCalories);
          
          if (diff < bestDiff) {
            bestDiff = diff;
            bestCombination = {
              recipes: combo,
              totalCalories: totalCalories,
              isCombined: true,
            };
          }
        }
      }
    }

    // For larger targets, try combinations of 4 recipes
    if (targetCalories > 800) {
      for (let i = 0; i < availableRecipes.length; i++) {
        for (let j = i + 1; j < availableRecipes.length; j++) {
          for (let k = j + 1; k < availableRecipes.length; k++) {
            for (let l = k + 1; l < availableRecipes.length; l++) {
              const combo = [availableRecipes[i], availableRecipes[j], availableRecipes[k], availableRecipes[l]];
              const totalCalories = combo.reduce((sum, r) => sum + parseFloat(r.calories), 0);
              const diff = Math.abs(totalCalories - targetCalories);
              
              if (diff < bestDiff) {
                bestDiff = diff;
                bestCombination = {
                  recipes: combo,
                  totalCalories: totalCalories,
                  isCombined: true,
                };
              }
            }
          }
        }
      }
    }

    // Return the best combination found (even if not perfect)
    return bestCombination;
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
          // Handle combined meals
          if (meal._isCombined && meal._combinationRecipes) {
            const combinedMacros = meal._combinationRecipes.reduce((sum, r) => ({
              calories: sum.calories + (parseFloat(r.calories) || 0),
              protein_g: sum.protein_g + (parseFloat(r.protein_g) || 0),
              carbs_g: sum.carbs_g + (parseFloat(r.carbs_g) || 0),
              fat_g: sum.fat_g + (parseFloat(r.fat_g) || 0),
            }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

            dailyMacros[day].calories += combinedMacros.calories;
            dailyMacros[day].protein_g += combinedMacros.protein_g;
            dailyMacros[day].carbs_g += combinedMacros.carbs_g;
            dailyMacros[day].fat_g += combinedMacros.fat_g;
          } else {
            // Single recipe with portion multiplier
            const multiplier = meal._portionMultiplier || 1.0;
            dailyMacros[day].calories += (parseFloat(meal.calories) || 0) * multiplier;
            dailyMacros[day].protein_g += (parseFloat(meal.protein_g) || 0) * multiplier;
            dailyMacros[day].carbs_g += (parseFloat(meal.carbs_g) || 0) * multiplier;
            dailyMacros[day].fat_g += (parseFloat(meal.fat_g) || 0) * multiplier;
          }
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
  adjustForMacroTargets(assignments, recipes, macroTargetsByDay, dailyMacros) {
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

      // Build the same day-aware calorie budget the main generator uses:
      // every OTHER already-planned meal that day counts against the
      // day's target, and the slot being swapped is the one remaining
      // slot to fill with whatever budget is left. Without this,
      // selectRecipeForSlot sees an empty day (no calories accounted for
      // and no remaining slots), so `targetPerSlot` collapses to 0 and it
      // always picks the lowest-calorie recipe available - e.g. swapping
      // in an 87-calorie snack for what should be a full lunch.
      const otherMealsThatDay = {};
      for (const plannedMeal of plannedMeals) {
        if (plannedMeal.meal_slot !== slot) {
          otherMealsThatDay[plannedMeal.meal_slot] = plannedMeal;
        }
      }
      const currentAssignments = { [day]: otherMealsThatDay };
      const mealsToPlan = { [day]: { [slot]: true } };

      // Select new recipe
      const newRecipe = this.selectRecipeForSlot(
        availableRecipes,
        slot,
        this.getUserMacroTargetsForDay(user, day),
        currentAssignments,
        day,
        mealsToPlan
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
      const macroTargets = this.getUserMacroTargetsForDay(user, day);
      const suitableRecipes = await this.fetchSuitableRecipes(user);
      const mealsToPlan = this.calculateMealsToPlan(user.eating_out_frequency);

      const dayAssignments = {};
      const usedRecipes = new Set();
      // Wraps the live dayAssignments object (mutated below as each slot is
      // filled) under its day index, in the shape selectRecipeForSlot
      // expects. Because this wraps the same object by reference, each
      // later slot in this loop sees every earlier slot already committed
      // this pass - the same day-aware budget tracking swapMeal now uses,
      // instead of scoring every slot as if the day were still empty.
      const currentAssignments = { [day]: dayAssignments };

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
            currentAssignments,
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
