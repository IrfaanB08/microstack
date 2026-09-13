const MealPlanGenerator = require('../utils/mealPlanGenerator');
const BatchPrepGenerator = require('../utils/batchPrepGenerator');
const MealPlan = require('../models/MealPlan');
const PlannedMeal = require('../models/PlannedMeal');
const LogEntry = require('../models/LogEntry');
const User = require('../models/User');
const ShoppingListItem = require('../models/ShoppingListItem');
const { getDayType, getWorkoutMealTag } = require('../utils/workoutSchedule');
const { suggestEatingOutOptions } = require('../utils/eatingOutSuggestions');
const { addDays } = require('../utils/dateHelpers');

const mealPlanController = {
  /**
   * Generate a new weekly meal plan
   */
  generateWeeklyPlan: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { week_start_date, regenerate } = req.body;

      // Get user profile
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if user has required profile data
      if (!user.weight_kg || !user.height_cm || !user.age || !user.sex || !user.activity_level) {
        return res.status(400).json({
          error: 'Incomplete user profile. Please complete your profile with body stats and activity level.',
        });
      }

      const generator = new MealPlanGenerator();

      // Resolve the week this plan is for, using the same default (current
      // week's Sunday) the generator itself would fall back to, so the
      // duplicate check below always looks at the right week - whether or
      // not the caller explicitly passed one.
      const effectiveWeekStartDate = (week_start_date || generator.getCurrentWeekStart()).split('T')[0];

      // Check if a meal plan already exists for that week
      const existingPlan = await MealPlan.findByUserAndWeek(userId, effectiveWeekStartDate);
      if (existingPlan && !regenerate) {
        return res.status(409).json({
          error: 'You already have a meal plan for this week',
          message: 'Pass "regenerate: true" if you want to replace it.',
          mealPlan: existingPlan,
        });
      }

      const options = {
        weekStartDate: effectiveWeekStartDate,
        regenerate: regenerate || false,
        existingMealPlan: existingPlan || null,
      };

      // Generate meal plan
      const result = await generator.generateWeeklyPlan(user, options);

      // Keep the shopping list in sync with the freshly planned meals
      await ShoppingListItem.regenerateForMealPlan(result.mealPlan.id);

      res.json({
        success: true,
        message: 'Meal plan generated successfully',
        ...result,
      });
    } catch (error) {
      console.error('Error generating meal plan:', error);
      res.status(500).json({
        error: 'Failed to generate meal plan',
        message: error.message,
      });
    }
  },

  /**
   * Get user's meal plan for a specific week
   */
  getWeeklyPlan: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { week_start_date } = req.params;

      let mealPlan;

      // If week_start_date is provided, try to find that specific plan
      if (week_start_date) {
        mealPlan = await MealPlan.findByUserAndWeek(userId, week_start_date);
        if (!mealPlan) {
          return res.status(404).json({ error: 'Meal plan not found for this week' });
        }
      } else {
        // Get the most recent meal plan for the user
        const mealPlans = await MealPlan.findByUserId(userId);
        if (!mealPlans || mealPlans.length === 0) {
          return res.status(404).json({ error: 'No meal plans found for this user' });
        }
        mealPlan = mealPlans[0];
      }

      // Fetch the user - needed for per-day macro targets (macro cycling)
      // and pre/post-workout meal tagging.
      const user = await User.findById(userId);

      // Get planned meals with recipe details
      const plannedMeals = await PlannedMeal.findByMealPlanId(mealPlan.id);

      // Group by day and meal slot
      const weeklyPlan = {};
      for (let i = 0; i < 7; i++) {
        weeklyPlan[i] = {
          breakfast: null,
          lunch: null,
          dinner: null,
          snack: null,
        };
      }

      for (const plannedMeal of plannedMeals) {
        const day = plannedMeal.day_of_week;
        const slot = plannedMeal.meal_slot;

        if (weeklyPlan[day]) {
          weeklyPlan[day][slot] = {
            planned_meal_id: plannedMeal.id,
            recipe_id: plannedMeal.recipe_id,
            recipe_name: plannedMeal.recipe_name,
            calories: plannedMeal.calories,
            protein_g: plannedMeal.protein_g,
            carbs_g: plannedMeal.carbs_g,
            fat_g: plannedMeal.fat_g,
            prep_time_minutes: plannedMeal.prep_time_minutes,
            tags: plannedMeal.tags,
            ingredients: plannedMeal.ingredients,
            steps: plannedMeal.steps,
            workoutTag: getWorkoutMealTag(user, day, slot),
          };
        }
      }

      // Calculate daily and weekly totals - what the PLAN calls for that
      // day (the sum of that day's assigned recipes), not what the user
      // actually ate. See dailyLoggedTotals below for real logged intake.
      const dailyTotals = {};
      const weeklyTotals = {
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
      };

      for (let i = 0; i < 7; i++) {
        dailyTotals[i] = {
          calories: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
        };

        for (const slot of ['breakfast', 'lunch', 'dinner', 'snack']) {
          const meal = weeklyPlan[i][slot];
          if (meal) {
            // protein_g/carbs_g/fat_g are decimal columns, which pg returns
            // as strings (e.g. "18.20") - Number(...) them before adding,
            // or `+=` silently concatenates instead of summing.
            dailyTotals[i].calories += Number(meal.calories) || 0;
            dailyTotals[i].protein_g += Number(meal.protein_g) || 0;
            dailyTotals[i].carbs_g += Number(meal.carbs_g) || 0;
            dailyTotals[i].fat_g += Number(meal.fat_g) || 0;

            weeklyTotals.calories += Number(meal.calories) || 0;
            weeklyTotals.protein_g += Number(meal.protein_g) || 0;
            weeklyTotals.carbs_g += Number(meal.carbs_g) || 0;
            weeklyTotals.fat_g += Number(meal.fat_g) || 0;
          }
        }
      }

      // What the user actually LOGGED (via the food-logging feature) on
      // each day of this week - as distinct from dailyTotals above, which
      // is just what the plan calls for. Each day of the week is its own
      // real calendar date (week_start_date + day offset), so this has to
      // query log_entries once per date rather than assuming "today" -
      // a day with no log entries yet correctly comes back all zeros.
      const weekStartDate = mealPlan.week_start_date;
      const dailyLoggedTotals = {};
      await Promise.all(
        [0, 1, 2, 3, 4, 5, 6].map(async (day) => {
          const date = addDays(weekStartDate, day);
          const row = await LogEntry.getDailyTotals(userId, date);
          dailyLoggedTotals[day] = {
            calories: Number(row.total_calories) || 0,
            protein_g: Number(row.total_protein) || 0,
            carbs_g: Number(row.total_carbs) || 0,
            fat_g: Number(row.total_fat) || 0,
          };
        })
      );

      // Each day's actual macro target (same calories every day; carbs/fat
      // cycled toward carbs on a training day or fat on a rest day - see
      // MealPlanGenerator.getUserMacroTargetsForWeek). dayTypes lets the
      // frontend show a "Training day" / "Rest day" label without
      // re-deriving it from workout_days itself.
      const generator = new MealPlanGenerator();
      const dailyTargets = user ? generator.getUserMacroTargetsForWeek(user) : null;
      const dayTypes = {};
      for (let i = 0; i < 7; i++) {
        dayTypes[i] = getDayType(user, i) || 'neutral';
      }

      // For each "eating out" slot (no home-cooked meal planned), suggest
      // 2-3 restaurant-style dish categories sized to what's left of that
      // day's macro budget after the home-cooked meals already planned -
      // split evenly across however many eating-out slots that day has.
      const eatingOutSuggestions = {};
      if (dailyTargets) {
        for (let day = 0; day < 7; day++) {
          const eatingOutSlots = ['breakfast', 'lunch', 'dinner', 'snack'].filter(
            (slot) => !weeklyPlan[day][slot]
          );
          if (eatingOutSlots.length === 0) continue;

          const target = dailyTargets[day];
          const actual = dailyTotals[day];
          const remainingBudget = {
            calories: Math.max(0, target.calories - actual.calories),
            protein_g: Math.max(0, target.protein_g - actual.protein_g),
            carbs_g: Math.max(0, target.carbs_g - actual.carbs_g),
            fat_g: Math.max(0, target.fat_g - actual.fat_g),
          };
          const budgetPerSlot = {
            calories: remainingBudget.calories / eatingOutSlots.length,
            protein_g: remainingBudget.protein_g / eatingOutSlots.length,
            carbs_g: remainingBudget.carbs_g / eatingOutSlots.length,
            fat_g: remainingBudget.fat_g / eatingOutSlots.length,
          };

          eatingOutSuggestions[day] = {};
          for (const slot of eatingOutSlots) {
            eatingOutSuggestions[day][slot] = suggestEatingOutOptions(slot, budgetPerSlot);
          }
        }
      }

      res.json({
        success: true,
        mealPlan: {
          id: mealPlan.id,
          user_id: mealPlan.user_id,
          week_start_date: mealPlan.week_start_date,
          goal: mealPlan.goal,
          created_at: mealPlan.created_at,
        },
        weeklyPlan,
        dailyTotals,
        weeklyTotals,
        dailyLoggedTotals,
        eatingOutSuggestions,
        dailyTargets,
        dayTypes,
      });
    } catch (error) {
      console.error('Error getting meal plan:', error);
      res.status(500).json({
        error: 'Failed to get meal plan',
        message: error.message,
      });
    }
  },

  /**
   * Get all meal plans for a user
   */
  getUserMealPlans: async (req, res) => {
    try {
      const userId = req.user.userId;

      const mealPlans = await MealPlan.findByUserId(userId);

      res.json({
        success: true,
        mealPlans,
      });
    } catch (error) {
      console.error('Error getting user meal plans:', error);
      res.status(500).json({
        error: 'Failed to get user meal plans',
        message: error.message,
      });
    }
  },

  /**
   * Swap a single meal in an existing plan
   */
  swapMeal: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { meal_plan_id } = req.params;
      const { day, slot } = req.body;

      if (day === undefined || !slot) {
        return res.status(400).json({ 
          error: 'day and slot are required' 
        });
      }

      if (day < 0 || day > 6) {
        return res.status(400).json({ 
          error: 'day must be between 0 (Sunday) and 6 (Saturday)' 
        });
      }

      const validSlots = ['breakfast', 'lunch', 'dinner', 'snack'];
      if (!validSlots.includes(slot)) {
        return res.status(400).json({ 
          error: `slot must be one of: ${validSlots.join(', ')}` 
        });
      }

      // Verify meal plan belongs to user
      const mealPlan = await MealPlan.findById(meal_plan_id);
      if (!mealPlan) {
        return res.status(404).json({ error: 'Meal plan not found' });
      }

      if (mealPlan.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const generator = new MealPlanGenerator();
      const result = await generator.swapMeal(meal_plan_id, day, slot);

      // Keep the shopping list in sync with the updated meal
      await ShoppingListItem.regenerateForMealPlan(meal_plan_id);

      res.json({
        success: true,
        message: 'Meal swapped successfully',
        ...result,
      });
    } catch (error) {
      console.error('Error swapping meal:', error);
      res.status(500).json({
        error: 'Failed to swap meal',
        message: error.message,
      });
    }
  },

  /**
   * Regenerate a single day's meals
   */
  regenerateDay: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { meal_plan_id } = req.params;
      const { day } = req.body;

      if (day === undefined) {
        return res.status(400).json({ 
          error: 'day is required' 
        });
      }

      if (day < 0 || day > 6) {
        return res.status(400).json({ 
          error: 'day must be between 0 (Sunday) and 6 (Saturday)' 
        });
      }

      // Verify meal plan belongs to user
      const mealPlan = await MealPlan.findById(meal_plan_id);
      if (!mealPlan) {
        return res.status(404).json({ error: 'Meal plan not found' });
      }

      if (mealPlan.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const generator = new MealPlanGenerator();
      const result = await generator.regenerateDay(meal_plan_id, day);

      // Keep the shopping list in sync with the regenerated day's meals
      await ShoppingListItem.regenerateForMealPlan(meal_plan_id);

      res.json({
        success: true,
        message: 'Day regenerated successfully',
        ...result,
      });
    } catch (error) {
      console.error('Error regenerating day:', error);
      res.status(500).json({
        error: 'Failed to regenerate day',
        message: error.message,
      });
    }
  },

  /**
   * Delete a meal plan
   */
  deleteMealPlan: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { meal_plan_id } = req.params;

      // Verify meal plan belongs to user
      const mealPlan = await MealPlan.findById(meal_plan_id);
      if (!mealPlan) {
        return res.status(404).json({ error: 'Meal plan not found' });
      }

      if (mealPlan.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Delete meal plan (cascade will delete planned meals)
      await MealPlan.delete(meal_plan_id);

      res.json({
        success: true,
        message: 'Meal plan deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting meal plan:', error);
      res.status(500).json({
        error: 'Failed to delete meal plan',
        message: error.message,
      });
    }
  },

  /**
   * Get batch-prep (or daily-cooking) instructions for a meal plan.
   * Groups meals into prep sessions based on the user's batch vs daily
   * preference and generates deterministic, template-based cooking and
   * portioning steps - no AI generation involved.
   */
  getPrepInstructions: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { meal_plan_id } = req.params;

      // Verify meal plan belongs to user
      const mealPlan = await MealPlan.findById(meal_plan_id);
      if (!mealPlan) {
        return res.status(404).json({ error: 'Meal plan not found' });
      }

      if (mealPlan.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const plannedMeals = await PlannedMeal.findByMealPlanId(meal_plan_id);

      const generator = new BatchPrepGenerator();
      const prepInstructions = generator.generate(user, plannedMeals);

      res.json({
        success: true,
        mealPlanId: meal_plan_id,
        ...prepInstructions,
      });
    } catch (error) {
      console.error('Error generating prep instructions:', error);
      res.status(500).json({
        error: 'Failed to generate prep instructions',
        message: error.message,
      });
    }
  },
};

module.exports = mealPlanController;
