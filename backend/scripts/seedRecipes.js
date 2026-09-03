const Recipe = require('../src/models/Recipe');
const SpoonacularClient = require('../src/utils/spoonacularClient');
const RecipeNormalizer = require('../src/utils/recipeNormalizer');
const RateLimiter = require('../src/utils/rateLimiter');
require('dotenv').config();

class RecipeSeeder {
  constructor(options = {}) {
    this.apiKey = process.env.SPOONACULAR_API_KEY;
    if (!this.apiKey) {
      throw new Error('SPOONACULAR_API_KEY not found in environment variables');
    }

    this.client = new SpoonacularClient(this.apiKey);
    this.normalizer = RecipeNormalizer;
    this.rateLimiter = new RateLimiter({
      maxRequestsPerDay: options.maxRequestsPerDay || 150,
      requestDelay: options.requestDelay || 1000,
    });

    this.targetCount = options.targetCount || 150; // Reduced to stay within API limits
    this.batchSize = options.batchSize || 10; // Batch size for search results
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.continueOnError = options.continueOnError || false;

    this.stats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      duplicates: 0,
    };
  }

  /**
   * Generate diverse search queries to get varied recipes
   */
  generateSearchQueries() {
    const queries = [
      // High protein meals
      { query: 'chicken breast', minProtein: 25, number: this.batchSize },
      { query: 'salmon', minProtein: 20, number: this.batchSize },
      { query: 'eggs', minProtein: 15, number: this.batchSize },

      // Budget-friendly
      { query: 'pasta', maxReadyTime: 30, number: this.batchSize },
      { query: 'rice', maxReadyTime: 30, number: this.batchSize },
      { query: 'beans', maxReadyTime: 45, number: this.batchSize },

      // Vegetarian
      { query: 'vegetarian stir fry', diet: ['vegetarian'], number: this.batchSize },
      { query: 'tofu', diet: ['vegetarian'], number: this.batchSize },
      { query: 'lentils', diet: ['vegetarian'], number: this.batchSize },

      // Quick meals
      { query: 'quick dinner', maxReadyTime: 20, number: this.batchSize },
      { query: '15 minute meal', maxReadyTime: 15, number: this.batchSize },

      // Different cuisines
      { query: 'italian pasta', number: this.batchSize },
      { query: 'mexican chicken', number: this.batchSize },
      { query: 'asian stir fry', number: this.batchSize },
      { query: 'indian curry', number: this.batchSize },

      // Healthy options
      { query: 'healthy salad', number: this.batchSize },
      { query: 'grilled vegetables', number: this.batchSize },

      // Muscle building
      { query: 'bodybuilding meal', minProtein: 30, number: this.batchSize },
      { query: 'post workout', minProtein: 25, number: this.batchSize },
    ];

    return queries;
  }

  /**
   * Process a single recipe
   */
  async processRecipe(spoonacularRecipe) {
    try {
      // Normalize the recipe
      const normalized = this.normalizer.normalize(spoonacularRecipe);

      // Validate
      const validation = this.normalizer.validate(normalized);
      if (!validation.isValid) {
        if (this.verbose) {
          console.log(`Skipping invalid recipe: ${normalized.name}`, validation.errors);
        }
        this.stats.skipped++;
        return { success: false, reason: 'validation_failed', errors: validation.errors };
      }

      // Check for duplicates (by name) - skip in dry-run mode
      if (!this.dryRun) {
        const existingRecipe = await this.checkForDuplicate(normalized.name);
        if (existingRecipe) {
          if (this.verbose) {
            console.log(`Skipping duplicate recipe: ${normalized.name}`);
          }
          this.stats.duplicates++;
          return { success: false, reason: 'duplicate' };
        }
      }

      // Store in database (unless dry run)
      if (!this.dryRun) {
        const created = await Recipe.create(normalized);
        if (this.verbose) {
          console.log(`✓ Created recipe: ${normalized.name}`);
        }
        this.stats.successful++;
        return { success: true, recipe: created };
      } else {
        if (this.verbose) {
          console.log(`[DRY RUN] Would create: ${normalized.name}`);
        }
        this.stats.successful++;
        return { success: true, recipe: normalized };
      }
    } catch (error) {
      console.error(`Error processing recipe: ${error.message}`);
      this.stats.failed++;
      return { success: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Check for duplicate recipe by name
   */
  async checkForDuplicate(recipeName) {
    if (this.dryRun) {
      return null; // Skip duplicate check in dry-run mode
    }

    try {
      // Simple check by name - could be enhanced with fuzzy matching
      const query = 'SELECT id FROM recipes WHERE LOWER(name) = LOWER($1) LIMIT 1';
      const pool = require('../src/config/database');
      const result = await pool.query(query, [recipeName]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error checking for duplicate:', error.message);
      return null;
    }
  }

  /**
   * Process a batch of recipes from search results
   */
  async processRecipeBatch(results) {
    if (!results || !results.results || results.results.length === 0) {
      return 0;
    }

    let processed = 0;
    for (const recipe of results.results) {
      // Check rate limit before each request
      const canProceed = this.rateLimiter.canMakeRequest();
      if (!canProceed.canProceed) {
        console.log('Rate limit reached. Stopping.');
        break;
      }

      // Wait for rate limiting delay
      await this.rateLimiter.waitForDelay();

      // Process the recipe
      const result = await this.processRecipe(recipe);
      this.rateLimiter.recordRequest();
      this.stats.totalProcessed++;
      processed++;

      // Check if we've reached target
      if (this.stats.successful >= this.targetCount) {
        console.log(`Target count of ${this.targetCount} recipes reached.`);
        break;
      }
    }

    return processed;
  }

  /**
   * Main seeding function
   */
  async seed() {
    console.log('Starting recipe seeding...');
    console.log(`Target: ${this.targetCount} recipes`);
    console.log(`Batch size: ${this.batchSize}`);
    console.log(`Dry run: ${this.dryRun}`);
    console.log(`Rate limit: ${this.rateLimiter.maxRequestsPerDay} requests/day`);

    const queries = this.generateSearchQueries();
    console.log(`Generated ${queries.length} search queries`);

    try {
      for (let i = 0; i < queries.length; i++) {
        // Check if we've reached target
        if (this.stats.successful >= this.targetCount) {
          console.log(`Target count of ${this.targetCount} recipes reached.`);
          break;
        }

        // Check rate limit
        const canProceed = this.rateLimiter.canMakeRequest();
        if (!canProceed.canProceed) {
          console.log('Daily rate limit reached. Stopping.');
          break;
        }

        const query = queries[i];
        console.log(`\nProcessing query ${i + 1}/${queries.length}: ${query.query}`);

        // Wait for rate limiting
        await this.rateLimiter.waitForDelay();

        // Fetch recipes (without instructions to save API calls)
        try {
          const results = await this.client.searchRecipes({
            ...query,
            includeInstructions: false, // Don't fetch instructions during initial seeding
          });
          this.rateLimiter.recordRequest();

          console.log(`Found ${results.results?.length || 0} recipes`);

          // Process the batch
          await this.processRecipeBatch(results);

          // Progress update
          console.log(`Progress: ${this.stats.successful}/${this.targetCount} recipes created`);
          console.log(`Stats: ${this.stats.successful} successful, ${this.stats.failed} failed, ${this.stats.skipped} skipped, ${this.stats.duplicates} duplicates`);

        } catch (error) {
          console.error(`Error with query "${query.query}": ${error.message}`);
          if (!this.continueOnError) {
            throw error;
          }
        }
      }

      console.log('\n=== Seeding Complete ===');
      console.log('Final Stats:', this.stats);
      console.log('Rate Limiter Stats:', this.rateLimiter.getStats());

      return this.stats;

    } catch (error) {
      console.error('Fatal error during seeding:', error);
      throw error;
    }
  }

  /**
   * Get current database recipe count
   */
  async getCurrentCount() {
    if (this.dryRun) {
      console.log('Skipping database count check in dry-run mode');
      return 0;
    }

    try {
      const pool = require('../src/config/database');
      const result = await pool.query('SELECT COUNT(*) as count FROM recipes');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting current count:', error.message);
      console.log('Continuing without database count check...');
      return 0;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    targetCount: 200,
    batchSize: 10,
    dryRun: false,
    verbose: false,
    continueOnError: false,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--continue-on-error') {
      options.continueOnError = true;
    } else if (!isNaN(parseInt(arg))) {
      // First number is target count, second is batch size
      if (options.targetCount === 200) {
        options.targetCount = parseInt(arg);
      } else {
        options.batchSize = parseInt(arg);
      }
    }
  }

  try {
    const seeder = new RecipeSeeder(options);
    const currentCount = await seeder.getCurrentCount();
    console.log(`Current recipe count in database: ${currentCount}`);

    if (currentCount > 0 && !options.dryRun) {
      console.log('Database already contains recipes. Consider using --dry-run first.');
    }

    await seeder.seed();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = RecipeSeeder;
