# Recipe Seeding

This directory contains scripts for seeding the Microstack database with recipes from the Spoonacular API.

## Overview

The recipe seeding system populates the `recipes` table with diverse, macro-rich recipes suitable for meal planning. It uses the Spoonacular API to fetch recipes with nutrition data, normalizes them for the database, and handles rate limiting to stay within API limits.

## Configuration

### Environment Variables
- `SPOONACULAR_API_KEY`: Your Spoonacular API key (required)
- `DATABASE_URL`: PostgreSQL connection string (from main backend config)

### Seed Script Options
- `--dry-run`: Simulate seeding without database changes
- `--verbose`: Show detailed processing information
- `--continue-on-error`: Continue processing even if individual recipes fail
- `<target_count>`: Number of recipes to seed (default: 300)
- `<batch_size>`: Recipes per search query (default: 10)

## Usage

### Basic Seeding
```bash
npm run seed:recipes
```

### Dry Run (Test Without Database Changes)
```bash
npm run seed:recipes:dry
```

### With Options
```bash
node scripts/seedRecipes.js --dry-run --verbose 300 10
```

## Search Query Strategy

The seeder uses **47 diverse search queries** across multiple categories to ensure recipe variety:

### Protein Sources (15 queries)
- **Meats**: chicken breast, turkey breast, salmon, tuna, lean beef, shrimp
- **Dairy/Eggs**: eggs, egg white omelette, cottage cheese, greek yogurt
- **Plant-based**: tofu, tofu scramble, tempeh, seitan, edamame

### Meal-Specific (10 queries)
- **Breakfast**: overnight oats, protein pancakes, protein smoothie, oatmeal, breakfast bowl, breakfast burrito
- **Snacks**: protein balls, protein bar, energy bites, high protein snack

### Cuisines (10 queries)
Italian, Mexican, Asian, Indian, Thai, Korean, Mediterranean, Japanese, Greek, Lebanese

### Cooking Styles (7 queries)
Slow cooker, air fryer, meal prep bowl, sheet pan dinner, one pot meal, grilled, baked

### Additional Categories (5 queries)
Healthy options, muscle building, meal prep friendly, budget-friendly, vegetarian/vegan

## Features

### Rate Limiting
- Respects Spoonacular's 150 requests/day free tier limit
- Implements delays between requests
- Tracks remaining quota and provides time estimates

### Recipe Normalization
- Extracts nutrition data (calories, protein, carbs, fat)
- Normalizes ingredients and cooking steps
- Adds relevant tags for categorization
- Handles Spoonacular API response variations

### Duplicate Detection
- Checks for existing recipes by name
- Skips duplicates to maintain data integrity
- Reports duplicate statistics

### Error Handling
- Continues on individual recipe failures
- Detailed error reporting
- Configurable error tolerance

## Cost Analysis

### API Usage
- **Initial Seeding**: 47 API calls (one per search query)
- **With Instructions**: 97 API calls (47 search + 50 popular recipes with instructions)
- **Cost**: $0 (within free tier limits)

### Database Impact
- **Target**: 300 recipes
- **Current**: Check with `SELECT COUNT(*) FROM recipes`
- **Growth**: ~2.5x increase in search diversity from previous version

## Files

- `seedRecipes.js`: Main seeding script
- `spoonacularClient.js`: API client for Spoonacular
- `recipeNormalizer.js`: Recipe data normalization
- `rateLimiter.js`: API rate limiting
- `COST_ANALYSIS.md`: Detailed cost and API usage analysis

## Troubleshooting

### Duplicate Recipes
If you see high duplicate rates:
- Run multiple seed runs on different days
- Use `--continue-on-error` to handle API edge cases
- The expanded query list reduces future duplication

### Rate Limiting
If you hit rate limits:
- Wait until the next day's quota resets
- Reduce batch size: `node scripts/seedRecipes.js 300 5`
- Use the rate limiter stats to estimate completion time

### API Key Issues
- Ensure `SPOONACULAR_API_KEY` is set in `.env`
- Verify your API key has access to the recipe endpoints
- Check Spoonacular API status page for outages

## Future Enhancements

- [ ] Add recipe instruction population script
- [ ] Implement recipe image downloading
- [ ] Add recipe rating/quality scoring
- [ ] Implement automatic recipe categorization
- [ ] Add recipe difficulty rating
