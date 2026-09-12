/**
 * Auto-estimates macros for a free-text food description using
 * Spoonacular's Guess Nutrition by Dish Name endpoint, backed by a shared
 * local cache (the food_estimates table).
 *
 * This only runs for manual log entries that didn't match anything in the
 * user's meal plan AND where the user left calories blank - if they typed
 * their own numbers, those are used as-is and this is never called (see
 * logController.logFood). The cache is checked first and is shared across
 * every user, since a description like "chicken breast" means the same
 * thing no matter who logs it - so common foods should cost at most one
 * API call, ever, not one per user per day.
 */

const SpoonacularClient = require('./spoonacularClient');
const RateLimiter = require('./rateLimiter');
const FoodEstimate = require('../models/FoodEstimate');

const spoonacular = new SpoonacularClient(process.env.SPOONACULAR_API_KEY);

// Tracks today's Spoonacular usage in-process. This resets when the server
// restarts, same limitation the existing recipe-seeding scripts already
// accept - the authoritative backstop is still the 402 the API itself
// returns, which markExhausted() below latches onto.
const limiter = new RateLimiter({
  maxRequestsPerDay: parseInt(process.env.SPOONACULAR_DAILY_LIMIT, 10) || 150,
});

/**
 * Canonicalize a description into a cache key: lowercase, trimmed, common
 * punctuation stripped, whitespace collapsed. Deliberately just literal
 * text normalization (not word-overlap like foodMatcher's matcher) so the
 * cache key is stable and predictable.
 */
function normalizeDescription(text) {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"()]/g, '')
    .replace(/\s+/g, ' ');
}

/** Accepts either a plain number or a string like "24g" from the API. */
function parseNutrientValue(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const match = String(raw).match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * @param {string} description free-text food description
 * @returns {Promise<{
 *   status: 'cache_hit' | 'api_hit' | 'unavailable' | 'not_found',
 *   estimate?: { calories: number, protein_g: number, carbs_g: number, fat_g: number },
 *   message?: string,
 * }>}
 */
async function estimateNutrition(description) {
  const normalized = normalizeDescription(description);
  if (!normalized) {
    return { status: 'not_found', message: 'No description to estimate from.' };
  }

  const cached = await FoodEstimate.findByNormalizedDescription(normalized);
  if (cached) {
    return {
      status: 'cache_hit',
      estimate: {
        calories: cached.calories,
        protein_g: cached.protein_g,
        carbs_g: cached.carbs_g,
        fat_g: cached.fat_g,
      },
    };
  }

  if (!process.env.SPOONACULAR_API_KEY) {
    return {
      status: 'unavailable',
      message: 'Calorie estimation is not configured on this server. Please enter calories manually.',
    };
  }

  const quota = limiter.canMakeRequest();
  if (!quota.canProceed) {
    return {
      status: 'unavailable',
      message: "Calorie estimation is temporarily unavailable (today's lookup limit has been reached). Please enter calories manually.",
    };
  }

  try {
    await limiter.waitForDelay();
    const result = await spoonacular.guessNutritionByDishName(description);
    limiter.recordRequest();

    const calories = parseNutrientValue(result?.calories?.value);
    const protein_g = parseNutrientValue(result?.protein?.value);
    const carbs_g = parseNutrientValue(result?.carbs?.value);
    const fat_g = parseNutrientValue(result?.fat?.value);

    if (calories === null) {
      // Spoonacular answered but had nothing usable to say about this
      // description - not a quota problem, just an unrecognized dish.
      return {
        status: 'not_found',
        message: "We couldn't estimate macros for that description. Please enter calories manually.",
      };
    }

    const saved = await FoodEstimate.create({
      normalized_description: normalized,
      description: description.trim(),
      calories: Math.round(calories),
      protein_g: protein_g || 0,
      carbs_g: carbs_g || 0,
      fat_g: fat_g || 0,
      source: 'spoonacular',
    });

    return {
      status: 'api_hit',
      estimate: {
        calories: saved.calories,
        protein_g: saved.protein_g,
        carbs_g: saved.carbs_g,
        fat_g: saved.fat_g,
      },
    };
  } catch (error) {
    if (/quota exceeded/i.test(error.message)) {
      limiter.markExhausted();
    }
    console.error('Nutrition estimate failed:', error.message);
    return {
      status: 'unavailable',
      message: 'Calorie estimation is temporarily unavailable right now. Please enter calories manually.',
    };
  }
}

module.exports = {
  estimateNutrition,
  normalizeDescription,
  getRateLimiterStats: () => limiter.getStats(),
};
