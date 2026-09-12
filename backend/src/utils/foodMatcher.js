/**
 * Heuristic matcher that links a manually-typed food description to one of
 * the user's planned meals for the day, so a logged entry like "chicken
 * salad" gets associated with a planned "Grilled Chicken Salad" lunch
 * instead of being tracked as an unrelated manual entry.
 *
 * This is intentionally simple word-overlap scoring rather than anything
 * that calls out to an external service - manual logging has no photo or
 * barcode input to work from yet, just free text.
 */

const STOPWORDS = new Set([
  'with', 'and', 'the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'style',
  'recipe', 'plate', 'bowl', 'serving', 'leftover', 'leftovers',
]);

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word));
}

/**
 * Jaccard similarity between the two word sets - shared words over the
 * total distinct words across both. Cheap, order-independent, and good
 * enough to tell "chicken salad" apart from "chicken stir fry".
 */
function scoreOverlap(wordsA, wordsB) {
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  let shared = 0;
  for (const word of setA) {
    if (setB.has(word)) shared++;
  }

  const unionSize = new Set([...setA, ...setB]).size;
  return shared / unionSize;
}

/**
 * @param {string} description - free-text food description the user typed
 * @param {Array<{recipe_name: string}>} plannedMeals - today's planned meals
 * @param {number} threshold - minimum score to count as a match
 * @returns {{ meal: object, score: number } | null}
 */
function matchPlannedMeal(description, plannedMeals, threshold = 0.34) {
  const inputWords = normalize(description);
  if (inputWords.length === 0 || !plannedMeals || plannedMeals.length === 0) {
    return null;
  }

  let best = null;
  let bestScore = 0;

  for (const meal of plannedMeals) {
    const score = scoreOverlap(inputWords, normalize(meal.recipe_name));
    if (score > bestScore) {
      bestScore = score;
      best = meal;
    }
  }

  return best && bestScore >= threshold ? { meal: best, score: bestScore } : null;
}

module.exports = { matchPlannedMeal, normalize };
