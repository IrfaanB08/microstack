/**
 * Categorize grocery ingredients into store aisle sections.
 * Must match the `grocery_aisle_category` check constraint on shopping_list_items:
 * produce, dairy, meat, bakery, frozen, pantry, beverages, snacks, household, other
 */

const CATEGORY_KEYWORDS = {
  produce: [
    'lettuce', 'spinach', 'kale', 'arugula', 'tomato', 'onion', 'garlic', 'pepper',
    'carrot', 'celery', 'cucumber', 'broccoli', 'cauliflower', 'zucchini', 'squash',
    'potato', 'sweet potato', 'mushroom', 'avocado', 'lime', 'lemon', 'apple',
    'banana', 'berry', 'berries', 'grape', 'orange', 'mango', 'pineapple', 'peach',
    'pear', 'cherry', 'cilantro', 'parsley', 'basil', 'mint', 'ginger', 'scallion',
    'green onion', 'cabbage', 'corn', 'asparagus', 'eggplant', 'radish', 'beet',
    'herbs', 'shallot', 'leek', 'jalapeno', 'fresh',
  ],
  dairy: [
    'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'sour cream',
    'cottage cheese', 'cream cheese', 'mozzarella', 'parmesan', 'cheddar',
    'feta', 'ricotta', 'egg', 'eggs', 'half and half', 'ghee',
  ],
  meat: [
    'chicken', 'beef', 'pork', 'turkey', 'lamb', 'bacon', 'sausage', 'ham',
    'steak', 'ground beef', 'ground turkey', 'salmon', 'tuna', 'shrimp', 'fish',
    'cod', 'tilapia', 'crab', 'seafood', 'meat', 'mince', 'chorizo',
  ],
  bakery: [
    'bread', 'bagel', 'roll', 'bun', 'tortilla', 'pita', 'baguette', 'croissant',
    'muffin', 'naan', 'wrap', 'flatbread',
  ],
  frozen: [
    'frozen', 'ice cream', 'popsicle',
  ],
  beverages: [
    'water', 'juice', 'soda', 'coffee', 'tea', 'beer', 'wine', 'sparkling water',
    'almond milk', 'soy milk', 'oat milk', 'coconut milk', 'protein shake',
  ],
  snacks: [
    'chips', 'crackers', 'pretzel', 'popcorn', 'trail mix', 'granola bar',
    'protein bar', 'nuts', 'almonds', 'cashews', 'peanuts', 'candy', 'chocolate',
  ],
  pantry: [
    'rice', 'pasta', 'noodle', 'quinoa', 'oats', 'oatmeal', 'flour', 'sugar',
    'salt', 'pepper', 'spice', 'seasoning', 'oil', 'olive oil', 'vinegar',
    'sauce', 'broth', 'stock', 'bean', 'lentil', 'chickpea', 'can', 'canned',
    'tomato paste', 'tomato sauce', 'honey', 'syrup', 'peanut butter',
    'almond butter', 'jam', 'cereal', 'baking powder', 'baking soda', 'vanilla',
    'stevia', 'protein powder', 'breadcrumb', 'cornstarch', 'yeast', 'coconut',
  ],
  household: [
    'foil', 'plastic wrap', 'paper towel', 'napkin', 'ziploc', 'trash bag',
    'dish soap', 'sponge',
  ],
};

// Flattened once at module load: every (keyword, category) pair, longest
// keyword first, so a specific phrase like "tomato sauce" (pantry) beats a
// shorter generic one like "tomato" (produce) regardless of category order.
const KEYWORD_ENTRIES = Object.entries(CATEGORY_KEYWORDS)
  .flatMap(([category, keywords]) => keywords.map((keyword) => ({ category, keyword })))
  .sort((a, b) => b.keyword.length - a.keyword.length);

class GroceryCategorizer {
  /**
   * Determine the grocery aisle category for an ingredient name.
   * Falls back to 'other' if no keyword matches. When multiple keywords
   * match (e.g. both "tomato" and "tomato sauce"), the longest / most
   * specific keyword wins.
   */
  static categorize(ingredientName) {
    if (!ingredientName) return 'other';
    const name = ingredientName.toLowerCase();

    const match = KEYWORD_ENTRIES.find(({ keyword }) => name.includes(keyword));
    return match ? match.category : 'other';
  }
}

module.exports = GroceryCategorizer;
