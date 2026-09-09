const express = require('express');
const router = express.Router();
const mealPlanController = require('../controllers/mealPlanController');
const authMiddleware = require('../middleware/auth');

// All meal plan routes require authentication
router.use(authMiddleware);

// Generate a new weekly meal plan
router.post('/generate', mealPlanController.generateWeeklyPlan);

// Get user's meal plan for a specific week (optional, defaults to most recent)
router.get('/week/:week_start_date?', mealPlanController.getWeeklyPlan);

// Get all meal plans for a user
router.get('/', mealPlanController.getUserMealPlans);

// Swap a single meal in an existing plan
router.put('/:meal_plan_id/swap', mealPlanController.swapMeal);

// Regenerate a single day's meals
router.put('/:meal_plan_id/regenerate-day', mealPlanController.regenerateDay);

// Delete a meal plan
router.delete('/:meal_plan_id', mealPlanController.deleteMealPlan);

module.exports = router;
