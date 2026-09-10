const express = require('express');
const router = express.Router();
const shoppingListController = require('../controllers/shoppingListController');
const authMiddleware = require('../middleware/auth');

// All shopping list routes require authentication
router.use(authMiddleware);

// Get the shopping list for a meal plan (auto-generates it if it doesn't exist yet)
router.get('/:meal_plan_id', shoppingListController.getShoppingList);

// Rebuild the shopping list from the meal plan's current planned meals
router.post('/:meal_plan_id/regenerate', shoppingListController.regenerateShoppingList);

// Manually add an item to a meal plan's shopping list
router.post('/:meal_plan_id/items', shoppingListController.addItem);

// Update a shopping list item
router.put('/items/:item_id', shoppingListController.updateItem);

// Toggle a shopping list item's checked state
router.put('/items/:item_id/toggle', shoppingListController.toggleItem);

// Delete a shopping list item
router.delete('/items/:item_id', shoppingListController.deleteItem);

module.exports = router;
