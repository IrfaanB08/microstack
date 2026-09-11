/**
 * One-time (or resumable) backfill for the `recipes.servings` column.
 *
 * Existing recipes were seeded before we captured Spoonacular's `servings`
 * field, so ingredient-scaling code (batch-prep instructions, shopping
 * list aggregation) has no way to tell "this ingredient list makes 6
 * servings" from "this ingredient list makes 1 serving". This script
 * re-fetches each recipe's original serving count from Spoonacular
 * (1 getRecipeInformation call per recipe) and fills the column in.
 *
 * Resumable by design: it only ever selects recipes WHERE servings IS
 * NULL, so if the free-tier daily quota (150 requests/day) runs out
 * partway through, re-running the script tomorrow picks up exactly where
 * it left off - no separate progress file needed.
 */

require('dotenv').config();
const pool = require('../src/config/database');
const Recipe = require('../src/models/Recipe');
const SpoonacularClient = require('../src/utils/spoonacularClient');
const RateLimiter = require('../src/utils/rateLimiter');

class ServingsBackfiller {
  constructor(options = {}) {
    this.apiKey = process.env.SPOONACULAR_API_KEY;
    if (!this.apiKey) {
      throw new Error('SPOONACULAR_API_KEY not found in environment variables');
    }

    this.client = new SpoonacularClient(this.apiKey);
    this.rateLimiter = new RateLimiter({
      maxRequestsPerDay: options.maxRequestsPerDay || 150,
      requestDelay: options.requestDelay || 1000,
    });

    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.limit = options.limit || null; // cap candidates processed this run, for a cheap sanity check

    this.stats = {
      totalCandidates: 0,
      updated: 0,
      failed: 0,
      skippedNoSpoonacularId: 0,
      stoppedForRateLimit: false,
    };
  }

  /** Recipes that still need a servings value backfilled. */
  async getRecipesNeedingServings() {
    const query = `
      SELECT id, name, spoonacular_id
      FROM recipes
      WHERE servings IS NULL
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async run() {
    console.log('Starting recipe servings backfill...');
    console.log(`Dry run: ${this.dryRun}`);
    console.log(`Rate limit: ${this.rateLimiter.maxRequestsPerDay} requests/day\n`);

    let candidates = await this.getRecipesNeedingServings();
    this.stats.totalCandidates = candidates.length;
    console.log(`Found ${candidates.length} recipe(s) still missing a servings value.`);

    if (candidates.length === 0) {
      console.log('Nothing to do - every recipe already has a servings value.');
      return this.stats;
    }

    if (this.limit) {
      candidates = candidates.slice(0, this.limit);
      console.log(`--limit ${this.limit} passed: only processing the first ${candidates.length} this run.`);
    }

    for (const recipe of candidates) {
      if (!recipe.spoonacular_id) {
        if (this.verbose) {
          console.log(`Skipping "${recipe.name}" - no spoonacular_id to look up.`);
        }
        this.stats.skippedNoSpoonacularId++;
        continue;
      }

      const canProceed = this.rateLimiter.canMakeRequest();
      if (!canProceed.canProceed) {
        console.log(
          `\nDaily rate limit reached (${this.rateLimiter.maxRequestsPerDay} requests/day). ` +
          `${this.stats.updated} recipe(s) updated this run. Re-run this script (on a new day) to ` +
          `continue - it automatically picks up where it left off.`
        );
        this.stats.stoppedForRateLimit = true;
        break;
      }

      await this.rateLimiter.waitForDelay();

      try {
        const info = await this.client.getRecipeInformation(recipe.spoonacular_id);
        this.rateLimiter.recordRequest();

        const servings = parseInt(info.servings, 10);
        if (!Number.isFinite(servings) || servings <= 0) {
          console.log(`  "${recipe.name}" - Spoonacular returned no usable servings value, skipping.`);
          this.stats.failed++;
          continue;
        }

        if (this.dryRun) {
          console.log(`[DRY RUN] Would set "${recipe.name}" servings = ${servings}`);
        } else {
          await Recipe.update(recipe.id, { servings });
          if (this.verbose) {
            console.log(`✓ "${recipe.name}" servings = ${servings}`);
          }
        }
        this.stats.updated++;
      } catch (error) {
        // The request still counts against the day's quota even though it failed.
        this.rateLimiter.recordRequest();
        console.error(`  Failed to fetch servings for "${recipe.name}" (spoonacular_id=${recipe.spoonacular_id}): ${error.message}`);
        this.stats.failed++;

        // Our in-process rate limiter only tracks this run - it can't see
        // quota used by an earlier run today (or by seedRecipes.js). If
        // Spoonacular itself says the real quota is exhausted, stop now
        // instead of burning through the rest of the list with the same
        // failure.
        if (error.message.includes('quota exceeded')) {
          console.log(
            `\nSpoonacular's daily quota is exhausted (not just our local counter). ` +
            `${this.stats.updated} recipe(s) updated this run. Re-run this script tomorrow to continue.`
          );
          this.stats.stoppedForRateLimit = true;
          break;
        }
      }
    }

    console.log('\n=== Backfill run complete ===');
    console.log('Stats:', this.stats);
    console.log('Rate limiter stats:', this.rateLimiter.getStats());

    const remaining = this.stats.totalCandidates - this.stats.updated - this.stats.failed - this.stats.skippedNoSpoonacularId;
    if (remaining > 0) {
      console.log(`\n${remaining} recipe(s) still need backfilling. Re-run this script to continue.`);
    }

    return this.stats;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));

  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    limit: limitArg ? parseInt(limitArg.split('=')[1], 10) : null,
  };

  try {
    const backfiller = new ServingsBackfiller(options);
    await backfiller.run();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ServingsBackfiller;
