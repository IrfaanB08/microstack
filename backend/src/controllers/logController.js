const LogEntry = require('../models/LogEntry');
const MealPlan = require('../models/MealPlan');
const PlannedMeal = require('../models/PlannedMeal');
const Recipe = require('../models/Recipe');
const User = require('../models/User');
const MacroCalculator = require('../utils/macroCalculator');
const { matchPlannedMeal } = require('../utils/foodMatcher');
const { estimateNutrition } = require('../utils/foodEstimator');
const { getTodayDate, isValidDateString, getDayOfWeek, getWeekStartDate } = require('../utils/dateHelpers');
const { getDayType, getWorkoutMealTag } = require('../utils/workoutSchedule');

const MACRO_FIELDS = ['calories', 'protein_g', 'carbs_g', 'fat_g'];

/**
 * Validate that any provided macro fields are non-negative numbers.
 * Returns an error message string, or null if everything checks out.
 */
function validateMacroFields(body) {
  for (const field of MACRO_FIELDS) {
    const value = body[field];
    if (value !== undefined && value !== null && (isNaN(value) || Number(value) < 0)) {
      return `${field} must be a non-negative number`;
    }
  }
  return null;
}

const logController = {
  /**
   * Log a food entry for the day. Supports two flows:
   *  - Explicit: the request names a planned_meal_id (e.g. a "log this
   *    meal" button on the plan), and macros/description default to that
   *    meal's recipe.
   *  - Manual: the request is free-text (food_description + macros).
   *    Manual entries are checked against today's planned meals and,
   *    when the description looks like one of them, are linked up
   *    automatically so the dashboard can show it against the plan.
   */
  logFood: async (req, res) => {
    try {
      const userId = req.user.userId;
      let { date, food_description, calories, protein_g, carbs_g, fat_g, planned_meal_id } = req.body;

      date = date || getTodayDate();
      if (!isValidDateString(date)) {
        return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      }

      if (!planned_meal_id && !(food_description && food_description.trim())) {
        return res.status(400).json({
          error: 'food_description is required for a manual log entry',
        });
      }

      const macroError = validateMacroFields(req.body);
      if (macroError) {
        return res.status(400).json({ error: macroError });
      }

      let resolvedPlannedMealId = null;
      let source = 'manual';
      let matchedMeal = null;
      let estimated = false;
      let estimateSource = null;

      if (planned_meal_id) {
        // Explicit "log this planned meal" action.
        const plannedMeal = await PlannedMeal.findById(planned_meal_id);
        if (!plannedMeal) {
          return res.status(404).json({ error: 'Planned meal not found' });
        }

        const mealPlan = await MealPlan.findById(plannedMeal.meal_plan_id);
        if (!mealPlan || mealPlan.user_id !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const recipe = await Recipe.findById(plannedMeal.recipe_id);

        resolvedPlannedMealId = plannedMeal.id;
        source = 'plan';
        matchedMeal = {
          planned_meal_id: plannedMeal.id,
          meal_slot: plannedMeal.meal_slot,
          recipe_name: recipe ? recipe.name : null,
          matchType: 'explicit',
        };

        if (!food_description || !food_description.trim()) {
          food_description = recipe ? recipe.name : 'Planned meal';
        }
        if (calories === undefined || calories === null) calories = recipe?.calories;
        if (protein_g === undefined || protein_g === null) protein_g = recipe?.protein_g;
        if (carbs_g === undefined || carbs_g === null) carbs_g = recipe?.carbs_g;
        if (fat_g === undefined || fat_g === null) fat_g = recipe?.fat_g;
      } else {
        // Manual entry - try to match it against today's plan.
        const dayOfWeek = getDayOfWeek(date);
        const weekStartDate = getWeekStartDate(date);
        const mealPlan = await MealPlan.findByUserAndWeek(userId, weekStartDate);

        if (mealPlan) {
          const todaysMeals = await PlannedMeal.findByMealPlanIdAndDay(mealPlan.id, dayOfWeek);
          const match = matchPlannedMeal(food_description, todaysMeals);

          if (match) {
            resolvedPlannedMealId = match.meal.id;
            source = 'plan';
            matchedMeal = {
              planned_meal_id: match.meal.id,
              meal_slot: match.meal.meal_slot,
              recipe_name: match.meal.recipe_name,
              matchType: 'auto',
              confidence: Math.round(match.score * 100) / 100,
            };

            // Only fill in macros the user didn't already type themselves.
            if (calories === undefined || calories === null) calories = match.meal.calories;
            if (protein_g === undefined || protein_g === null) protein_g = match.meal.protein_g;
            if (carbs_g === undefined || carbs_g === null) carbs_g = match.meal.carbs_g;
            if (fat_g === undefined || fat_g === null) fat_g = match.meal.fat_g;
          }
        }
      }

      // A manual entry that didn't match anything in the plan has no
      // source of truth for its macros. If the user also left calories
      // blank (rather than typing their own numbers as an override), try
      // to auto-estimate from the description instead of silently
      // recording a zero-calorie meal. Providing calories always wins -
      // it's treated as the user overriding any estimate.
      if (!planned_meal_id && source === 'manual' && (calories === undefined || calories === null)) {
        const result = await estimateNutrition(food_description);

        if (result.status === 'cache_hit' || result.status === 'api_hit') {
          calories = result.estimate.calories;
          if (protein_g === undefined || protein_g === null) protein_g = result.estimate.protein_g;
          if (carbs_g === undefined || carbs_g === null) carbs_g = result.estimate.carbs_g;
          if (fat_g === undefined || fat_g === null) fat_g = result.estimate.fat_g;
          estimated = true;
          estimateSource = result.status === 'cache_hit' ? 'cache' : 'api';
        } else {
          // 'unavailable' (quota exhausted / API down) or 'not_found'
          // (description not recognized) - fall back to the previous
          // behavior of requiring the user to type calories themselves.
          return res.status(400).json({ error: result.message, estimateUnavailable: true });
        }
      }

      const entry = await LogEntry.create({
        user_id: userId,
        date,
        planned_meal_id: resolvedPlannedMealId,
        food_description,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        source,
        estimated,
      });

      res.status(201).json({
        success: true,
        entry,
        matched: !!matchedMeal,
        matchedMeal,
        estimated,
        estimateSource,
      });
    } catch (error) {
      console.error('Error logging food:', error);
      res.status(500).json({ error: 'Failed to log food', message: error.message });
    }
  },

  /**
   * List log entries for a given day (defaults to today).
   */
  getLogsForDate: async (req, res) => {
    try {
      const userId = req.user.userId;
      const date = req.query.date || getTodayDate();

      if (!isValidDateString(date)) {
        return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      }

      const entries = await LogEntry.findByDate(userId, date);
      res.json({ success: true, date, entries });
    } catch (error) {
      console.error('Error fetching log entries:', error);
      res.status(500).json({ error: 'Failed to fetch log entries', message: error.message });
    }
  },

  /**
   * Edit a previously logged entry (e.g. correcting a manually-typed macro).
   */
  updateLogEntry: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      const existing = await LogEntry.findById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Log entry not found' });
      }
      if (existing.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const macroError = validateMacroFields(req.body);
      if (macroError) {
        return res.status(400).json({ error: macroError });
      }

      const { food_description, calories, protein_g, carbs_g, fat_g, planned_meal_id, source } = req.body;
      const updated = await LogEntry.update(id, {
        food_description,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        planned_meal_id,
        source,
      });

      res.json({ success: true, entry: updated });
    } catch (error) {
      console.error('Error updating log entry:', error);
      res.status(500).json({ error: 'Failed to update log entry', message: error.message });
    }
  },

  /**
   * Remove a logged entry.
   */
  deleteLogEntry: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      const existing = await LogEntry.findById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Log entry not found' });
      }
      if (existing.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await LogEntry.delete(id);
      res.json({ success: true, message: 'Log entry deleted successfully' });
    } catch (error) {
      console.error('Error deleting log entry:', error);
      res.status(500).json({ error: 'Failed to delete log entry', message: error.message });
    }
  },

  /**
   * The dashboard's main data source: today's (or any day's) logged
   * macros compared against the user's targets in real time, plus that
   * day's planned meals and whether each has been logged yet.
   */
  getDailySummary: async (req, res) => {
    try {
      const userId = req.user.userId;
      const date = req.query.date || getTodayDate();

      if (!isValidDateString(date)) {
        return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Needed both for day-aware macro targets (cycled toward carbs on a
      // training day, fat on a rest day) and for locating this date's
      // planned meals further down.
      const dayOfWeek = getDayOfWeek(date);
      const dayType = getDayType(user, dayOfWeek) || 'neutral';

      let targets = null;
      const targetsAvailable = !!(
        user.weight_kg && user.height_cm && user.age && user.sex && user.activity_level
      );

      if (targetsAvailable) {
        const bodyStats = {
          weight_kg: user.weight_kg,
          height_cm: user.height_cm,
          age: user.age,
          sex: user.sex,
        };
        targets = MacroCalculator.calculateTargets(bodyStats, user.goal, user.activity_level, getDayType(user, dayOfWeek));
      }

      const [entries, totalsRow] = await Promise.all([
        LogEntry.findByDate(userId, date),
        LogEntry.getDailyTotals(userId, date),
      ]);

      const consumed = {
        calories: Number(totalsRow.total_calories) || 0,
        protein_g: Number(totalsRow.total_protein) || 0,
        carbs_g: Number(totalsRow.total_carbs) || 0,
        fat_g: Number(totalsRow.total_fat) || 0,
      };

      let remaining = null;
      let percentages = null;

      if (targetsAvailable) {
        remaining = {
          calories: targets.calories - consumed.calories,
          protein_g: targets.protein_g - consumed.protein_g,
          carbs_g: targets.carbs_g - consumed.carbs_g,
          fat_g: targets.fat_g - consumed.fat_g,
        };
        percentages = {};
        for (const field of MACRO_FIELDS) {
          percentages[field] = targets[field] > 0
            ? Math.round((consumed[field] / targets[field]) * 1000) / 10
            : null;
        }
      }

      // Today's planned meals, if the user has a meal plan for this week.
      const weekStartDate = getWeekStartDate(date);
      const mealPlan = await MealPlan.findByUserAndWeek(userId, weekStartDate);

      let plannedMeals = [];
      if (mealPlan) {
        const todaysMeals = await PlannedMeal.findByMealPlanIdAndDay(mealPlan.id, dayOfWeek);
        const loggedPlannedMealIds = new Set(
          entries.filter((entry) => entry.planned_meal_id).map((entry) => entry.planned_meal_id)
        );

        plannedMeals = todaysMeals.map((meal) => ({
          planned_meal_id: meal.id,
          meal_slot: meal.meal_slot,
          recipe_id: meal.recipe_id,
          recipe_name: meal.recipe_name,
          calories: meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fat_g: meal.fat_g,
          prep_time_minutes: meal.prep_time_minutes,
          logged: loggedPlannedMealIds.has(meal.id),
          workoutTag: getWorkoutMealTag(user, dayOfWeek, meal.meal_slot),
        }));
      }

      res.json({
        success: true,
        date,
        dayType,
        targetsAvailable,
        targets,
        consumed,
        remaining,
        percentages,
        entryCount: entries.length,
        entries,
        hasMealPlan: !!mealPlan,
        mealPlanId: mealPlan ? mealPlan.id : null,
        plannedMeals,
      });
    } catch (error) {
      console.error('Error getting daily summary:', error);
      res.status(500).json({ error: 'Failed to get daily summary', message: error.message });
    }
  },
};

module.exports = logController;
