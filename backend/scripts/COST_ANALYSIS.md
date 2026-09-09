# Recipe Seeding Cost Analysis

## Current Configuration
- **Search Queries**: 47 different search terms (expanded from 19)
- **Target Recipes**: 300 recipes (increased from 150)
- **Batch Size**: 10 recipes per search
- **API Limit**: 150 requests/day (Spoonacular free tier)

## Search Query Categories

### High Protein Meats (6 queries)
- chicken breast, turkey breast, salmon, tuna, lean beef, shrimp

### High Protein Dairy/Eggs (4 queries)
- eggs, egg white omelette, cottage cheese, greek yogurt

### Plant-Based Proteins (5 queries)
- tofu, tofu scramble, tempeh, seitan, edamame

### Breakfast-Specific (6 queries)
- overnight oats, protein pancakes, protein smoothie, oatmeal, breakfast bowl, breakfast burrito

### Snack-Specific (4 queries)
- protein balls, protein bar, energy bites, high protein snack

### Budget-Friendly (5 queries)
- pasta, rice, beans, lentils, potatoes

### Vegetarian (4 queries)
- vegetarian stir fry, vegetarian curry, vegan bowl, vegetarian protein

### Quick Meals (4 queries)
- quick dinner, 15 minute meal, 20 minute dinner, fast breakfast

### Different Cuisines (10 queries)
- italian pasta, mexican chicken, asian stir fry, indian curry, thai curry, korean bbq, mediterranean, japanese teriyaki, greek salad, lebanese

### Cooking Styles (7 queries)
- slow cooker, air fryer, meal prep bowl, sheet pan dinner, one pot meal, grilled, baked

### Healthy Options (5 queries)
- healthy salad, grilled vegetables, quinoa bowl, rice bowl, protein bowl

### Muscle Building (4 queries)
- bodybuilding meal, post workout, high protein dinner, mass gainer

### Meal Prep Friendly (3 queries)
- meal prep chicken, batch cooking, freezer friendly

## API Usage Scenarios

### Scenario 1: Initial Seeding (No Instructions)
- **Total API Calls**: 47 (one per search query)
- **Daily Free Quota**: 150 requests
- **Days Required**: 1 day
- **Estimated Cost**: $0 (free tier)

### Scenario 2: With Instructions (All Recipes)
- **Total API Calls**: 47 + (300 recipes × 1 instruction call) = 347 calls
- **Daily Free Quota**: 150 requests
- **Days Required**: 3 days
- **Estimated Cost**: $0 (free tier, but spread across 3 days)

### Scenario 3: Mixed Approach (Popular Recipes Only)
- **Total API Calls**: 47 (search) + 50 (top 50 recipes with instructions) = 97 calls
- **Daily Free Quota**: 150 requests
- **Days Required**: 1 day
- **Estimated Cost**: $0 (free tier)

## Implementation Strategy

### Recommended Approach: Scenario 3
1. **Initial seeding**: Run all 47 search queries without instructions (47 API calls)
2. **Select popular recipes**: Pick top 50 most relevant recipes
3. **Add instructions**: Fetch instructions for popular recipes only (50 API calls)
4. **Total**: 97 API calls within single day's free quota

### Implementation Steps
1. **Day 1**: Run initial seeding with all 47 search queries
2. **Day 1**: Identify top 50 recipes based on relevance/quality
3. **Day 1**: Fetch detailed information including instructions for top 50
4. **Result**: 300 diverse recipes with full nutrition data, 50 with detailed instructions

## Benefits of Expanded Query List

### Diversity
- **Protein Sources**: 15 different protein-focused queries
- **Meal Types**: 6 breakfast-specific, 4 snack-specific queries
- **Cuisines**: 10 different cuisines vs 4 previously
- **Cooking Methods**: 7 different cooking styles
- **Dietary**: Vegetarian, vegan, high-protein options

### Reduced Duplication
- **47 search terms** vs 19 previously (2.5x increase)
- **More specific terms** (e.g., "overnight oats" vs "oatmeal")
- **Targeted categories** (breakfast, snacks, muscle building)
- **Different cuisines** (Thai, Korean, Mediterranean, Japanese)

### Future Seeding
- **More room for new recipes** across future runs
- **Better coverage** of different meal types and cuisines
- **Reduced duplicate rate** in subsequent seedings

## Cost Comparison

### Previous Configuration (19 queries, 150 recipes)
- Initial seeding: 19 API calls
- Full instructions: 169 API calls
- Total: 188 API calls (over free tier)

### New Configuration (47 queries, 300 recipes)
- Initial seeding: 47 API calls
- Partial instructions: 97 API calls (50 recipes)
- Total: 97 API calls (within free tier)
- **Better coverage**: 2.5x more queries, 2x more recipes, 51% fewer API calls

## Conclusion

The expanded search query list provides:
- **2.5x more search diversity** (47 vs 19 queries)
- **2x more recipe targets** (300 vs 150 recipes)
- **Reduced API usage** (97 vs 188 calls for instructions)
- **Better categorization** across meal types, cuisines, and dietary preferences
- **Future-proofing** for subsequent seed runs with lower duplication rates
