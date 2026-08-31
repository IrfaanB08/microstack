# Database Schema Relationships

## Core Entity Relationships

### User → MealPlan (One-to-Many)
- **Relationship**: One user can have multiple meal plans (one per week)
- **Foreign Key**: `meal_plans.user_id` → `users.id`
- **Constraint**: Unique constraint on `(user_id, week_start_date)` ensures one meal plan per user per week
- **Cascade**: When a user is deleted, all their meal plans are deleted

### MealPlan → PlannedMeal (One-to-Many)
- **Relationship**: One meal plan contains multiple planned meals
- **Foreign Key**: `planned_meals.meal_plan_id` → `meal_plans.id`
- **Cascade**: When a meal plan is deleted, all its planned meals are deleted
- **Structure**: Each planned meal represents a specific meal slot (breakfast/lunch/dinner/snack) on a specific day (0-6, Sunday-Saturday)

### Recipe → PlannedMeal (One-to-Many)
- **Relationship**: One recipe can be used in multiple planned meals across different meal plans
- **Foreign Key**: `planned_meals.recipe_id` → `recipes.id`
- **Restrict**: Cannot delete a recipe if it's referenced by planned meals
- **Purpose**: This allows recipe reuse across different users and meal plans

### MealPlan → ShoppingListItem (One-to-Many)
- **Relationship**: One meal plan has multiple shopping list items
- **Foreign Key**: `shopping_list_items.meal_plan_id` → `meal_plans.id`
- **Cascade**: When a meal plan is deleted, all its shopping list items are deleted
- **Automatic Updates**: Shopping list items should be regenerated when meal plans change

### User → LogEntry (One-to-Many)
- **Relationship**: One user can have multiple log entries
- **Foreign Key**: `log_entries.user_id` → `users.id`
- **Cascade**: When a user is deleted, all their log entries are deleted
- **Purpose**: Tracks daily food consumption and macro intake

### PlannedMeal → LogEntry (Optional One-to-One)
- **Relationship**: A log entry can optionally reference a planned meal
- **Foreign Key**: `log_entries.planned_meal_id` → `planned_meals.id`
- **Set Null**: If a planned meal is deleted, the log entry reference is set to null
- **Purpose**: Allows tracking when a user actually ate what was planned

## Shopping List Automatic Updates

### How Shopping Lists Relate to Meal Plans

The shopping list is **derived** from the meal plan through this chain:

```
MealPlan → PlannedMeal → Recipe → Ingredients → ShoppingListItem
```

**Update Flow:**
1. When a meal plan is created/modified:
   - The system queries all `PlannedMeal` records for that `meal_plan_id`
   - For each planned meal, it fetches the associated `Recipe`
   - It extracts ingredients from the recipe's `ingredients` JSONB field
   - It aggregates ingredients (combining quantities for same items)
   - It creates `ShoppingListItem` records with aggregated quantities

2. When a meal plan is deleted:
   - CASCADE delete automatically removes all associated shopping list items

**Implementation Notes:**
- Shopping list items are stored as separate entities, not computed views
- This allows manual editing of shopping lists (checking off items, adding extras)
- The `regenerateForMealPlan()` method in the ShoppingListItem model handles the aggregation logic
- Grocery aisle categorization helps organize the shopping list by store sections

**Key Design Decisions:**
- Shopping list items reference `meal_plan_id` directly, not individual `planned_meal_id`
- This simplifies the schema and allows easier bulk operations
- Aggregation happens at the application level, not database triggers
- This gives flexibility for manual modifications while maintaining the relationship

## Data Flow Example

**Creating a weekly meal plan:**
1. User creates `MealPlan` with `week_start_date`
2. System creates 28 `PlannedMeal` records (7 days × 4 meal slots)
3. Each `PlannedMeal` references a `Recipe`
4. System aggregates all recipe ingredients
5. System creates `ShoppingListItem` records with combined quantities
6. User can check off items as they shop

**Logging food consumption:**
1. User can create `LogEntry` with `source='manual'` for ad-hoc logging
2. Or user can create `LogEntry` with `source='plan'` and `planned_meal_id` to log eating a planned meal
3. System can track adherence to meal plans by comparing planned vs. logged meals

## JSONB Fields

Several fields use JSONB for flexible data storage:

- **User.dietary_preferences**: Array of strings like `["vegetarian", "gluten-free", "no-nuts"]`
- **Recipe.ingredients**: Array of objects like `[{"name": "chicken", "quantity": "500", "unit": "g"}]`
- **Recipe.steps**: Array of strings or objects for cooking instructions
- **Recipe.tags**: Array of strings like `["high-protein", "budget", "quick"]`

JSONB fields support:
- Efficient querying with GIN indexes
- Flexible schema evolution
- Complex data structures without additional tables
- PostgreSQL operators for containment and existence checks

## Constraints and Validation

**Check Constraints:**
- User goals: `bulk`, `cut`, `maintain`, `recomp`
- Activity levels: `sedentary`, `light`, `moderate`, `active`, `very_active`
- Prep time preferences: `batch`, `daily`
- Meal slots: `breakfast`, `lunch`, `dinner`, `snack`
- Log sources: `manual`, `plan`
- Grocery aisles: Standard store categories

**Unique Constraints:**
- User email addresses
- User + week start date (one meal plan per user per week)

**Foreign Key Constraints:**
- All relationships maintain referential integrity
- CASCADE deletes for user-owned data
- RESTRICT deletes for shared entities (recipes)
