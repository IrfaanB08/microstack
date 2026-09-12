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
   * Calculate which meals to plan (home-cooked) vs. skip (eaten out),
   * based on eating-out frequency.
   *
   * eating_out_frequency counts individual MEALS per week eaten out, not
   * days (see users.eating_out_frequency's 0-21 check constraint: 3
   * meals/day x 7 days) - the frontend's slider and label ("meals per
   * week") agree. Skips are chosen in priority order (dinner first, as
   * the most commonly-eaten-out meal, then lunch, breakfast, and finally
   * snack), but within each priority level they're spread evenly across
   * the 7 days (via the same floor(i * 7/n) trick used to distribute n
   * items across 7 slots as uniformly as integer math allows) rather
   * than filling day 0, 1, 2... in a block. A moderate frequency should
   * take one meal off of several different days, not remove several
   * meals from a couple of days while the rest of the week is untouched.
   */
  calculateMealsToPlan(eatingOutFrequency) {
    const totalWeeklyMeals = this.daysOfWeek.length * this.mealSlots.length; // 28
    const mealsToSkip = Math.min(Math.max(eatingOutFrequency || 0, 0), totalWeeklyMeals);

    const mealsToPlan = {};
    for (const day of this.daysOfWeek) {
      mealsToPlan[day] = {};
      for (const slot of this.mealSlots) {
        mealsToPlan[day][slot] = true;
      }
    }

    const skipPriority = ['dinner', 'lunch', 'breakfast', 'snack'];
    const daysInWeek = this.daysOfWeek.length;
    let remaining = mealsToSkip;

    for (const slot of skipPriority) {
      if (remaining <= 0) break;

      const skipsThisSlot = Math.min(remaining, daysInWeek);
      const step = daysInWeek / skipsThisSlot;
      for (let i = 0; i < skipsThisSlot; i++) {
        const day = this.daysOfWeek[Math.floor(i * step)];
        mealsToPlan[day][slot] = false;
      }
      remaining -= skipsThisSlot;
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

        // Calculate this slot's share of the day's REMAINING budget across
        // all four macros - not just calories - so recipe selection can
        // weigh protein/carbs/fat too, not only whether calories add up.
        const dayMacrosSoFar = this.sumMealMacros(this.mealSlots.map((s) => assignments[day][s]));
        const remainingSlots = this.mealSlots.filter(s =>
          !assignments[day][s] && mealsToPlan[day]?.[s]
        ).length;
        const slotDivisor = remainingSlots > 0 ? remainingSlots : 1;

        const targetPerSlot = {
          calories: (macroTargetsByDay[day].calories - dayMacrosSoFar.calories) / slotDivisor,
          protein_g: (macroTargetsByDay[day].protein_g - dayMacrosSoFar.protein_g) / slotDivisor,
          carbs_g: (macroTargetsByDay[day].carbs_g - dayMacrosSoFar.carbs_g) / slotDivisor,
          fat_g: (macroTargetsByDay[day].fat_g - dayMacrosSoFar.fat_g) / slotDivisor,
        };

        // Get suitable recipes for this slot - preferring ones not used
        // yet this week for variety. If every suitable recipe has
        // already been used (a small pool relative to how many meals
        // need planning, e.g. a very restrictive diet or a low
        // eating-out frequency leaving many slots to fill), fall back to
        // the full suitable pool and allow a repeat rather than leaving
        // this slot - and the rest of the day - completely unplanned.
        let slotRecipes = this.getRecipesForSlot(recipes, slot, usedRecipes);
        if (slotRecipes.length === 0) {
          slotRecipes = this.getRecipesForSlot(recipes, slot, new Set());
        }

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

            // Scale the chosen recipe's portion to close the remaining
            // calorie gap (capped at 1.5x). Scaling by calories keeps the
            // recipe's own macro ratio intact - which is the best a single
            // recipe can do; selectRecipeForSlot already picked WHICH
            // recipe based on fit across all four macros, not just this one.
            const recipeCalories = parseFloat(selectedRecipe.calories) || 1;
            const portionMultiplier = Math.min(1.5, Math.max(1.0, targetPerSlot.calories / recipeCalories));

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

        const dayCaloriesSoFar = this.sumMealMacros(Object.values(assignments[day])).calories;
        const remainingSlots = this.mealSlots.filter(
          (s) => !assignments[day][s] && mealsToPlan[day]?.[s]
        ).length;
        const targetForSlot = remainingSlots > 0
          ? (macroTargetsByDay[day].calories - dayCaloriesSoFar) / remainingSlots
          : 0;

        // Batch mode doesn't choose WHICH recipe per day (selectBatchRecipePool
        // already did that, weighing all four macros) - only how much of it,
        // so scaling by calories alone is fine here; it keeps the recipe's
        // own macro ratio intact.
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
   * mealsToPlan / eating-out frequency) gets the suitable recipe that
   * best fits an even share of the daily target across calories,
   * protein, carbs, AND fat (see scoreMacroFit) - not calories alone -
   * this typically yields 3-4 unique recipes for the whole week, each one
   * repeated across every day that slot is planned.
   */
  selectBatchRecipePool(recipes, macroTargetsByDay, mealsToPlan) {
    const pool = {};
    const usedRecipeIds = new Set();
    // Targets can differ slightly day to day (macro cycling) - average
    // across the week since one anchor recipe per slot has to serve every
    // day that slot is planned.
    const avgDailyTarget = this.averageMacroTargets(macroTargetsByDay);
    const approxTargetPerSlot = {
      calories: avgDailyTarget.calories / this.mealSlots.length,
      protein_g: avgDailyTarget.protein_g / this.mealSlots.length,
      carbs_g: avgDailyTarget.carbs_g / this.mealSlots.length,
      fat_g: avgDailyTarget.fat_g / this.mealSlots.length,
    };

    for (const slot of this.mealSlots) {
      const slotNeeded = this.daysOfWeek.some((day) => mealsToPlan[day]?.[slot]);
      if (!slotNeeded) continue;

      const candidates = this.getRecipesForSlot(recipes, slot, usedRecipeIds);
      if (candidates.length === 0) continue;

      let best = null;
      let bestScore = Infinity;
      for (const recipe of candidates) {
        const score = this.scoreMacroFit(this.sumMealMacros([recipe]), approxTargetPerSlot);
        if (score < bestScore) {
          bestScore = score;
          best = recipe;
        }
      }

      if (best) {
        pool[slot] = best;
        usedRecipeIds.add(best.id);
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
   * Select a recipe for a specific slot considering macros.
   *
   * Scores every candidate by how well ITS OWN macros fit this slot's
   * share of the day's remaining budget across calories, protein, carbs,
   * AND fat (see scoreMacroFit) - not by calorie closeness alone, which
   * previously let a calorie-matched but protein-poor recipe win over one
   * that fit the full macro picture better.
   */
  selectRecipeForSlot(recipes, slot, macroTargets, currentAssignments, currentDay, mealsToPlan) {
    const dayMacrosSoFar = this.sumMealMacros(Object.values(currentAssignments[currentDay] || {}));

    const remainingSlots = this.mealSlots.filter(s =>
      !currentAssignments[currentDay]?.[s] && mealsToPlan[currentDay]?.[s]
    ).length;
    const slotDivisor = remainingSlots > 0 ? remainingSlots : 1;

    const targetPerSlot = {
      calories: (macroTargets.calories - dayMacrosSoFar.calories) / slotDivisor,
      protein_g: (macroTargets.protein_g - dayMacrosSoFar.protein_g) / slotDivisor,
      carbs_g: (macroTargets.carbs_g - dayMacrosSoFar.carbs_g) / slotDivisor,
      fat_g: (macroTargets.fat_g - dayMacrosSoFar.fat_g) / slotDivisor,
    };

    let best = null;
    let bestScore = Infinity;
    for (const recipe of recipes) {
      const score = this.scoreMacroFit(this.sumMealMacros([recipe]), targetPerSlot);
      if (score < bestScore) {
        bestScore = score;
        best = recipe;
      }
    }

    return best;
  }

  /**
   * Combine multiple recipes to hit a slot's macro target.
   *
   * Every candidate combination is scored by scoreMacroFit across
   * calories, protein, carbs, AND fat together - not by calorie
   * closeness alone. A combination that lands on the right calorie count
   * by pairing two high-fat/low-protein recipes now loses to one that's
   * a bit further off on calories but far closer on protein, since each
   * macro contributes to the score in proportion to its own target
   * rather than calories (the largest number) drowning out the rest.
   *
   * @param {object} targetMacros - {calories, protein_g, carbs_g, fat_g}
   */
  combineRecipesForSlot(recipes, targetMacros, usedRecipes, slot) {
    // Allow more recipe reuse to avoid running out
    const availableRecipes = recipes.length > 30 ? recipes.filter(r => !usedRecipes.has(r.id)) : recipes;

    if (availableRecipes.length === 0) return null;

    // For snack slot, limit to 1-2 items and lower calorie ceiling
    if (slot === 'snack') {
      const snackCeiling = 600; // Max 600 calories for snacks
      const adjustedTarget = { ...targetMacros, calories: Math.min(targetMacros.calories, snackCeiling) };

      // Try combinations of 2 recipes, keeping the best-scoring one that
      // still falls in the sane 200-600 calorie range for a snack.
      let bestSnackCombo = null;
      let bestSnackScore = Infinity;
      for (let i = 0; i < availableRecipes.length; i++) {
        for (let j = i + 1; j < availableRecipes.length; j++) {
          const combo = [availableRecipes[i], availableRecipes[j]];
          const comboMacros = this.sumMealMacros(combo);
          if (comboMacros.calories < 200 || comboMacros.calories > snackCeiling) continue;

          const score = this.scoreMacroFit(comboMacros, adjustedTarget);
          if (score < bestSnackScore) {
            bestSnackScore = score;
            bestSnackCombo = { recipes: combo, totalCalories: comboMacros.calories, isCombined: true };
          }
        }
      }
      if (bestSnackCombo) return bestSnackCombo;

      // Fallback to single recipe
      let bestSingle = null;
      let bestSingleScore = Infinity;
      for (const recipe of availableRecipes) {
        const score = this.scoreMacroFit(this.sumMealMacros([recipe]), adjustedTarget);
        if (score < bestSingleScore) {
          bestSingleScore = score;
          bestSingle = recipe;
        }
      }

      if (bestSingle) {
        return {
          recipes: [bestSingle],
          totalCalories: parseFloat(bestSingle.calories),
          isCombined: false,
        };
      }

      return null;
    }

    // For main meals (breakfast, lunch, dinner), find the best combination overall
    let bestCombination = null;
    let bestScore = Infinity;

    const tryCombo = (combo) => {
      const comboMacros = this.sumMealMacros(combo);
      const score = this.scoreMacroFit(comboMacros, targetMacros);
      if (score < bestScore) {
        bestScore = score;
        bestCombination = { recipes: combo, totalCalories: comboMacros.calories, isCombined: true };
      }
    };

    // Try combinations of 2 recipes
    for (let i = 0; i < availableRecipes.length; i++) {
      for (let j = i + 1; j < availableRecipes.length; j++) {
        tryCombo([availableRecipes[i], availableRecipes[j]]);
      }
    }

    // Try combinations of 3 recipes
    for (let i = 0; i < availableRecipes.length; i++) {
      for (let j = i + 1; j < availableRecipes.length; j++) {
        for (let k = j + 1; k < availableRecipes.length; k++) {
          tryCombo([availableRecipes[i], availableRecipes[j], availableRecipes[k]]);
        }
      }
    }

    // For larger targets, try combinations of 4 recipes
    if (targetMacros.calories > 800) {
      for (let i = 0; i < availableRecipes.length; i++) {
        for (let j = i + 1; j < availableRecipes.length; j++) {
          for (let k = j + 1; k < availableRecipes.length; k++) {
            for (let l = k + 1; l < availableRecipes.length; l++) {
              tryCombo([availableRecipes[i], availableRecipes[j], availableRecipes[k], availableRecipes[l]]);
            }
          }
        }
      }
    }

    // Return the best combination found (even if not perfect)
    return bestCombination;
  }

  /**
   * Sum calories/protein/carbs/fat across a list of meals or raw recipes.
   * Each entry is either a plain recipe (used as-is, multiplier 1), an
   * already-assigned single recipe carrying an optional
   * _portionMultiplier, or a combined meal carrying
   * _isCombined/_combinationRecipes. Shared by the day-so-far tallies in
   * assignMealsToSlots/selectRecipeForSlot and by calculateDailyMacros,
   * so "how much of the day is already spoken for" is computed the same
   * way everywhere instead of three slightly different reduces.
   */
  sumMealMacros(meals) {
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
   * Average a per-day macro target map into one target - used where a
   * single recipe/anchor has to serve every day of the week (batch mode's
   * anchor pool), since macro cycling can make targets differ slightly
   * day to day.
   */
  averageMacroTargets(macroTargetsByDay) {
    const sum = this.sumMealMacros(this.daysOfWeek.map((day) => macroTargetsByDay[day]));
    const n = this.daysOfWeek.length;
    return { calories: sum.calories / n, protein_g: sum.protein_g / n, carbs_g: sum.carbs_g / n, fat_g: sum.fat_g / n };
  }

  /**
   * Score how well a candidate's macros fit a target, across calories,
   * protein, carbs, AND fat - not calories alone. Each macro's error is
   * expressed as a fraction of ITS OWN target (not raw grams/calories),
   * so a 50% miss on fat (a typically-small number) counts the same as a
   * 50% miss on calories (a typically-large one) - otherwise calories
   * would dominate the score and a combination could look "good" while
   * badly missing protein, which is exactly the bug this replaces.
   * Lower is better; 0 is a perfect match on all four.
   */
  scoreMacroFit(candidateMacros, targetMacros) {
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

  /**
   * Calculate daily macro totals
   */
  calculateDailyMacros(assignments, recipes) {
    const dailyMacros = {};

    for (const day of this.daysOfWeek) {
      dailyMacros[day] = this.sumMealMacros(this.mealSlots.map((slot) => assignments[day][slot]));
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

        // Same repeat-rather-than-blank fallback as the main weekly
        // assignment loop - see assignMealsToSlots.
        let slotRecipes = this.getRecipesForSlot(suitableRecipes, slot, usedRecipes);
        if (slotRecipes.length === 0) {
          slotRecipes = this.getRecipesForSlot(suitableRecipes, slot, new Set());
        }
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
