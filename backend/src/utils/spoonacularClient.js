const axios = require('axios');

class SpoonacularClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.spoonacular.com';
    this.requestCount = 0;
    this.requestLog = [];
  }

  /**
   * Generic request method with rate limiting awareness
   */
  async request(endpoint, params = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      params: {
        apiKey: this.apiKey,
        ...params,
      },
    };

    try {
      this.requestCount++;
      this.requestLog.push({
        timestamp: new Date().toISOString(),
        endpoint,
        params,
      });

      const response = await axios.get(url, config);
      return response.data;
    } catch (error) {
      if (error.response) {
        // Handle API errors
        if (error.response.status === 402) {
          throw new Error('Spoonacular API quota exceeded. Upgrade your plan or wait for reset.');
        }
        throw new Error(`Spoonacular API error: ${error.response.status} - ${error.response.data.message}`);
      }
      throw error;
    }
  }

  /**
   * Search recipes with filters
   */
  async searchRecipes(options = {}) {
    const {
      query = '',
      diet = [],
      intolerances = [],
      includeIngredients = [],
      excludeIngredients = [],
      minCalories = 0,
      maxCalories = 2000,
      minProtein = 0,
      maxPrepTime = 60,
      number = 10,
      offset = 0,
      includeInstructions = false, // Whether to make follow-up calls for instructions
    } = options;

    const params = {
      query,
      diet: diet.join(','),
      intolerances: intolerances.join(','),
      includeIngredients: includeIngredients.join(','),
      excludeIngredients: excludeIngredients.join(','),
      minCalories,
      maxCalories,
      minProtein,
      maxReadyTime: maxPrepTime,
      number,
      offset,
      addRecipeInformation: true, // Get detailed info in one request
      fillIngredients: true, // Get ingredient details
      addRecipeNutrition: true, // Get nutrition information
    };

    const results = await this.request('/recipes/complexSearch', params);

    // If instructions are requested and we have results, fetch them
    if (includeInstructions && results.results && results.results.length > 0) {
      for (const recipe of results.results) {
        try {
          const detailedInfo = await this.getRecipeInformation(recipe.id);
          // Merge the detailed info back into the recipe
          Object.assign(recipe, detailedInfo);
        } catch (error) {
          console.warn(`Failed to fetch instructions for recipe ${recipe.id}:`, error.message);
          // Continue with other recipes even if one fails
        }
      }
    }

    return results;
  }

  /**
   * Get detailed recipe information
   */
  async getRecipeInformation(recipeId) {
    return this.request(`/recipes/${recipeId}/information`, {
      includeNutrition: true,
      includeInstructions: true, // Get analyzed instructions
    });
  }

  /**
   * Get request statistics
   */
  getStats() {
    return {
      totalRequests: this.requestCount,
      recentRequests: this.requestLog.slice(-10),
    };
  }

  /**
   * Reset request counter (useful for testing)
   */
  resetStats() {
    this.requestCount = 0;
    this.requestLog = [];
  }
}

module.exports = SpoonacularClient;
