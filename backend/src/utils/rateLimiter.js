/**
 * Rate limiter for API requests to handle free tier constraints
 * Spoonacular free tier: 150 requests/day
 */

class RateLimiter {
  constructor(options = {}) {
    this.maxRequestsPerDay = options.maxRequestsPerDay || 150;
    this.requestDelay = options.requestDelay || 1000; // 1 second between requests
    this.dailyRequestCount = 0;
    this.requestHistory = [];
    this.lastRequestTime = 0;
  }

  /**
   * Check if we can make a request based on daily limits
   */
  canMakeRequest() {
    // Reset daily count if it's a new day
    this.resetIfNeeded();

    if (this.dailyRequestCount >= this.maxRequestsPerDay) {
      return {
        canProceed: false,
        reason: 'Daily limit exceeded',
        remainingRequests: 0,
      };
    }

    return {
      canProceed: true,
      remainingRequests: this.maxRequestsPerDay - this.dailyRequestCount,
    };
  }

  /**
   * Wait for the appropriate delay between requests
   */
  async waitForDelay() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.requestDelay) {
      const delayNeeded = this.requestDelay - timeSinceLastRequest;
      await this.sleep(delayNeeded);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Record a request
   */
  recordRequest() {
    this.dailyRequestCount++;
    this.requestHistory.push({
      timestamp: new Date().toISOString(),
      count: this.dailyRequestCount,
    });
  }

  /**
   * Reset daily count if it's a new day
   */
  resetIfNeeded() {
    if (this.requestHistory.length === 0) {
      return;
    }

    const lastRequest = this.requestHistory[this.requestHistory.length - 1];
    const lastRequestDate = new Date(lastRequest.timestamp);
    const now = new Date();

    // Reset if it's a new day
    if (lastRequestDate.getDate() !== now.getDate() ||
        lastRequestDate.getMonth() !== now.getMonth() ||
        lastRequestDate.getFullYear() !== now.getFullYear()) {
      this.dailyRequestCount = 0;
      this.requestHistory = [];
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    this.resetIfNeeded();
    return {
      dailyRequestCount: this.dailyRequestCount,
      remainingRequests: this.maxRequestsPerDay - this.dailyRequestCount,
      maxRequestsPerDay: this.maxRequestsPerDay,
      requestHistory: this.requestHistory,
    };
  }

  /**
   * Reset the limiter (useful for testing)
   */
  reset() {
    this.dailyRequestCount = 0;
    this.requestHistory = [];
    this.lastRequestTime = 0;
  }

  /**
   * Calculate estimated time to complete batch of requests
   */
  estimateTimeForBatch(numRequests) {
    const canProceed = this.canMakeRequest();
    if (!canProceed.canProceed) {
      return null; // Can't proceed
    }

    const availableRequests = canProceed.remainingRequests;
    const requestsToMake = Math.min(numRequests, availableRequests);

    // Time = (delay between requests * requests) + API processing time estimate
    const estimatedMs = (this.requestDelay * requestsToMake) + (requestsToMake * 500);
    const estimatedSeconds = Math.ceil(estimatedMs / 1000);
    const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

    return {
      requestsToMake,
      estimatedSeconds,
      estimatedMinutes,
      estimatedHours: Math.ceil(estimatedMinutes / 60),
    };
  }
}

module.exports = RateLimiter;
