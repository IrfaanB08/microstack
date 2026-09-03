const SpoonacularClient = require('../src/utils/spoonacularClient');
const RecipeNormalizer = require('../src/utils/recipeNormalizer');
const RateLimiter = require('../src/utils/rateLimiter');
require('dotenv').config();

async function testSpoonacularIntegration() {
  console.log('Testing Spoonacular API integration...');

  if (!process.env.SPOONACULAR_API_KEY) {
    console.error('SPOONACULAR_API_KEY not found in environment variables');
    process.exit(1);
  }

  const client = new SpoonacularClient(process.env.SPOONACULAR_API_KEY);
  const normalizer = RecipeNormalizer;
  const rateLimiter = new RateLimiter({ maxRequestsPerDay: 150, requestDelay: 1000 });

  try {
    console.log('\n1. Testing recipe search (without instructions)...');
    const statsBefore = client.getStats().totalRequests;
    const searchResults = await client.searchRecipes({
      query: 'chicken breast',
      minProtein: 20,
      number: 3,
      includeInstructions: false, // Don't fetch instructions (default for seeding)
    });
    const statsAfter = client.getStats().totalRequests;
    const requestsMade = statsAfter - statsBefore;
    console.log(`API requests made: ${requestsMade} (search only)`);
    
    // Record the request
    rateLimiter.recordRequest();

    await rateLimiter.waitForDelay();

    console.log('\n1b. Testing recipe search (with instructions)...');
    const statsBefore2 = client.getStats().totalRequests;
    const searchResultsWithInstructions = await client.searchRecipes({
      query: 'chicken breast',
      minProtein: 20,
      number: 2, // Smaller batch for instruction test
      includeInstructions: true, // Fetch instructions
    });
    const statsAfter2 = client.getStats().totalRequests;
    const requestsMade2 = statsAfter2 - statsBefore2;
    console.log(`API requests made: ${requestsMade2} (search + instruction calls)`);
    
    // Record the requests
    for (let i = 0; i < requestsMade2; i++) {
      rateLimiter.recordRequest();
    }

    console.log(`Found ${searchResults.results?.length || 0} recipes`);
    console.log('First recipe:', searchResults.results[0]?.title);

    await rateLimiter.waitForDelay();

    console.log('\n2. Testing recipe normalization (with instructions)...');
    if (searchResultsWithInstructions.results && searchResultsWithInstructions.results.length > 0) {
      const sampleRecipe = searchResultsWithInstructions.results[0];
      
      // Debug: Show the raw API response structure
      console.log('Raw API response structure:', {
        hasNutrition: !!sampleRecipe.nutrition,
        hasAnalyzedInstructions: !!sampleRecipe.analyzedInstructions,
        hasInstructions: !!sampleRecipe.instructions,
        nutritionKeys: sampleRecipe.nutrition ? Object.keys(sampleRecipe.nutrition) : [],
        analyzedInstructionsLength: sampleRecipe.analyzedInstructions?.length || 0,
        instructionsLength: sampleRecipe.instructions?.length || 0,
      });

      // Show nutrition data if available
      if (sampleRecipe.nutrition) {
        console.log('Nutrition data:', {
          calories: sampleRecipe.nutrition.calories,
          nutrients: sampleRecipe.nutrition.nutrients?.slice(0, 5).map(n => ({
            name: n.name,
            amount: n.amount,
            unit: n.unit
          })) || 'No nutrients array',
        });
      }

      const normalized = normalizer.normalize(sampleRecipe);
      
      console.log('Normalized recipe:', {
        name: normalized.name,
        calories: normalized.calories,
        protein_g: normalized.protein_g,
        carbs_g: normalized.carbs_g,
        fat_g: normalized.fat_g,
        prep_time_minutes: normalized.prep_time_minutes,
        tags: normalized.tags,
        ingredients_count: normalized.ingredients.length,
        steps_count: normalized.steps.length,
        first_step: normalized.steps[0] || 'No steps',
      });

      const validation = normalizer.validate(normalized);
      console.log('Validation:', validation);
    }

    await rateLimiter.waitForDelay();

    console.log('\n3. Testing rate limiter...');
    console.log('Rate limiter stats:', rateLimiter.getStats());
    const timeEstimate = rateLimiter.estimateTimeForBatch(10);
    console.log('Time estimate for 10 requests:', timeEstimate);

    console.log('\n4. Testing Spoonacular client stats...');
    console.log('Client stats:', client.getStats());

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testSpoonacularIntegration();
