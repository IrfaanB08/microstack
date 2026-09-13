const ShoppingListItem = require('../models/ShoppingListItem');
const MealPlan = require('../models/MealPlan');
const PlannedMeal = require('../models/PlannedMeal');

/**
 * Verify the meal plan exists and belongs to the requesting user.
 * Returns the meal plan, or sends an error response and returns null.
 */
const authorizeMealPlanAccess = async (req, res, mealPlanId) => {
  const mealPlan = await MealPlan.findById(mealPlanId);
  if (!mealPlan) {
    res.status(404).json({ error: 'Meal plan not found' });
    return null;
  }
  if (mealPlan.user_id !== req.user.userId) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return mealPlan;
};

const shoppingListController = {
  /**
   * Get the shopping list for a meal plan, grouped by grocery aisle.
   */
  getShoppingList: async (req, res) => {
    try {
      const { meal_plan_id } = req.params;

      const mealPlan = await authorizeMealPlanAccess(req, res, meal_plan_id);
      if (!mealPlan) return;

      let items = await ShoppingListItem.findByMealPlanId(meal_plan_id);

      // Auto-generate the list on first request if it hasn't been built yet
      if (items.length === 0) {
        items = await ShoppingListItem.regenerateForMealPlan(meal_plan_id);
      }

      // Flag ingredients shared across 2+ meals this week - buying them
      // together in bulk saves a trip (and often money) rather than
      // treating every occurrence as unrelated. Purely informational:
      // it's laid on top of the already-aggregated items and never
      // changes a quantity.
      const plannedMeals = await PlannedMeal.findByMealPlanId(meal_plan_id);
      const occurrenceCounts = ShoppingListItem.countIngredientOccurrences(plannedMeals);

      const annotatedItems = items.map((item) => {
        const key = ShoppingListItem.buildIngredientKey(item.ingredient_name, item.unit);
        const occurrence = occurrenceCounts.get(key);
        const mealCount = occurrence ? occurrence.mealCount : 0;
        return {
          ...item,
          mealCount,
          usedInRecipes: occurrence ? occurrence.recipeNames : [],
          sharedAcrossMeals: mealCount >= 2,
        };
      });

      const groupedByAisle = {};
      for (const item of annotatedItems) {
        const category = item.grocery_aisle_category || 'other';
        if (!groupedByAisle[category]) groupedByAisle[category] = [];
        groupedByAisle[category].push(item);
      }

      res.json({
        success: true,
        mealPlanId: meal_plan_id,
        items: annotatedItems,
        groupedByAisle,
        totalItems: annotatedItems.length,
        checkedItems: annotatedItems.filter((i) => i.checked).length,
        sharedItemCount: annotatedItems.filter((i) => i.sharedAcrossMeals).length,
      });
    } catch (error) {
      console.error('Error getting shopping list:', error);
      res.status(500).json({
        error: 'Failed to get shopping list',
        message: error.message,
      });
    }
  },

  /**
   * Rebuild the shopping list from the meal plan's current planned meals.
   * Use this after meals have changed and the list needs to catch up.
   */
  regenerateShoppingList: async (req, res) => {
    try {
      const { meal_plan_id } = req.params;

      const mealPlan = await authorizeMealPlanAccess(req, res, meal_plan_id);
      if (!mealPlan) return;

      const items = await ShoppingListItem.regenerateForMealPlan(meal_plan_id);

      res.json({
        success: true,
        message: 'Shopping list regenerated successfully',
        items,
      });
    } catch (error) {
      console.error('Error regenerating shopping list:', error);
      res.status(500).json({
        error: 'Failed to regenerate shopping list',
        message: error.message,
      });
    }
  },

  /**
   * Manually add an extra item to a meal plan's shopping list.
   */
  addItem: async (req, res) => {
    try {
      const { meal_plan_id } = req.params;
      const { ingredient_name, quantity, unit, grocery_aisle_category } = req.body;

      if (!ingredient_name || !ingredient_name.trim()) {
        return res.status(400).json({ error: 'ingredient_name is required' });
      }

      const mealPlan = await authorizeMealPlanAccess(req, res, meal_plan_id);
      if (!mealPlan) return;

      const item = await ShoppingListItem.create({
        meal_plan_id,
        ingredient_name: ingredient_name.trim(),
        quantity: quantity ?? null,
        unit: unit ?? null,
        grocery_aisle_category: grocery_aisle_category || 'other',
      });

      res.status(201).json({
        success: true,
        message: 'Item added to shopping list',
        item,
      });
    } catch (error) {
      console.error('Error adding shopping list item:', error);
      res.status(500).json({
        error: 'Failed to add shopping list item',
        message: error.message,
      });
    }
  },

  /**
   * Edit an existing shopping list item (name, quantity, unit, category).
   */
  updateItem: async (req, res) => {
    try {
      const { item_id } = req.params;
      const { ingredient_name, quantity, unit, grocery_aisle_category, checked } = req.body;

      const existingItem = await ShoppingListItem.findById(item_id);
      if (!existingItem) {
        return res.status(404).json({ error: 'Shopping list item not found' });
      }

      const mealPlan = await authorizeMealPlanAccess(req, res, existingItem.meal_plan_id);
      if (!mealPlan) return;

      const updatedItem = await ShoppingListItem.update(item_id, {
        ingredient_name,
        quantity,
        unit,
        grocery_aisle_category,
        checked,
      });

      res.json({
        success: true,
        message: 'Shopping list item updated',
        item: updatedItem,
      });
    } catch (error) {
      console.error('Error updating shopping list item:', error);
      res.status(500).json({
        error: 'Failed to update shopping list item',
        message: error.message,
      });
    }
  },

  /**
   * Toggle an item's checked-off state (used while shopping).
   */
  toggleItem: async (req, res) => {
    try {
      const { item_id } = req.params;

      const existingItem = await ShoppingListItem.findById(item_id);
      if (!existingItem) {
        return res.status(404).json({ error: 'Shopping list item not found' });
      }

      const mealPlan = await authorizeMealPlanAccess(req, res, existingItem.meal_plan_id);
      if (!mealPlan) return;

      const updatedItem = await ShoppingListItem.toggleChecked(item_id);

      res.json({
        success: true,
        item: updatedItem,
      });
    } catch (error) {
      console.error('Error toggling shopping list item:', error);
      res.status(500).json({
        error: 'Failed to toggle shopping list item',
        message: error.message,
      });
    }
  },

  /**
   * Remove an item from the shopping list.
   */
  deleteItem: async (req, res) => {
    try {
      const { item_id } = req.params;

      const existingItem = await ShoppingListItem.findById(item_id);
      if (!existingItem) {
        return res.status(404).json({ error: 'Shopping list item not found' });
      }

      const mealPlan = await authorizeMealPlanAccess(req, res, existingItem.meal_plan_id);
      if (!mealPlan) return;

      await ShoppingListItem.delete(item_id);

      res.json({
        success: true,
        message: 'Shopping list item deleted',
      });
    } catch (error) {
      console.error('Error deleting shopping list item:', error);
      res.status(500).json({
        error: 'Failed to delete shopping list item',
        message: error.message,
      });
    }
  },
};

module.exports = shoppingListController;
