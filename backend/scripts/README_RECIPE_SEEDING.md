# Recipe Seeding Script Documentation

## Overview
The recipe seeding script (`seedRecipes.js`) populates your Recipe table with diverse recipes from the Spoonacular API, normalizing them to your schema and tagging them appropriately.

## Usage

### Basic Usage
```bash
# Seed 200 recipes (default)
npm run seed:recipes

# Seed specific number of recipes
npm run seed:recipes 100

# Dry run (no database changes, verbose output)
npm run seed:recipes:dry

# Custom batch size and target
node scripts/seedRecipes.js 50 5 --verbose
```

### Options
- `targetCount` (default: 200) - Total recipes to fetch
- `batchSize` (default: 10) - Recipes per search query
- `--dry-run` - Validate without database changes
- `--verbose` - Detailed logging
- `--continue-on-error` - Continue if individual queries fail

## Cost and Rate-Limit Implications

### Spoonacular Free Tier Limits
- **150 requests/day** on free tier
- **1 request/second** recommended delay
- **No monthly cost** for free tier

### Current Approach Costs

#### Recipe Seeding Phase
- **Initial seed (200 recipes)**: ~20-25 requests (using complexSearch with addRecipeInformation)
- **Time to complete**: ~30-40 seconds (with 1-second delays)
- **API calls**: One search returns multiple recipes (more efficient)

#### Ongoing Costs
- **Near-zero** after initial seeding
- **No daily recurring costs** for recipe access
- **Recipes stored locally** in your database

### As User Numbers Grow

#### Recipe Database Scaling
- **No additional API costs** - recipes are stored locally
- **Same 200+ recipes** serve unlimited users
- **Query performance** depends on your database, not API limits

#### Potential Future API Needs
1. **Dynamic recipe updates** (if you want fresh content)
   - Cost: ~150 requests/day for updates
   - Solution: Cache updates, batch processing

2. **User-specific recipe recommendations**
   - Cost: Additional API calls per user
   - Solution: Build recommendation engine using local data

3. **Recipe image hosting**
   - Spoonacular provides image URLs
   - Consider hosting images locally for performance

### Scaling Recommendations

#### Phase 1: MVP (Current)
- ✅ Seed 200+ recipes once
- ✅ Use Spoonacular image URLs
- ✅ No recurring API costs
- ✅ Scale to 10,000+ users with same API usage

#### Phase 2: Growth (1,000+ users)
- Consider upgrading to Spoonacular paid tier ($0.007/request)
- Implement recipe caching for popular searches
- Add user-generated recipes to reduce API dependency

#### Phase 3: Scale (10,000+ users)
- Build internal recipe recommendation system
- Migrate images to CDN (CloudFront/S3)
- Consider alternative recipe databases or user-generated content

### Rate Limiting Strategy

The script implements intelligent rate limiting:

```javascript
// Current configuration
maxRequestsPerDay: 150
requestDelay: 1000 (1 second)
```

**Features:**
- **Automatic daily reset** at midnight
- **Progress tracking** with remaining requests
- **Time estimation** for batch operations
- **Graceful stopping** when limits reached

**Example Time Estimates:**
- 10 requests: ~15 seconds
- 50 requests: ~1 minute
- 150 requests: ~3 minutes

### Monitoring and Maintenance

#### Track Usage
```javascript
// Built-in stats tracking
const stats = rateLimiter.getStats();
console.log(stats);
// { dailyRequestCount: 45, remainingRequests: 105, ... }
```

#### Recipe Database Health
- Monitor duplicate rates during seeding
- Track validation failures
- Audit tag distribution for balance

#### Upgrade Triggers
Consider upgrading Spoonacular plan when:
- Daily API requests consistently exceed 150
- You need real-time recipe updates
- User experience requires more diverse recipes

### Alternative Approaches

#### Option 1: User-Generated Recipes
- **Cost**: Free
- **Pros**: Community engagement, unique content
- **Cons**: Requires content moderation, slower initial growth

#### Option 2: Open Recipe Databases
- **Cost**: Free
- **Sources**: RecipeDB, Food.com (API)
- **Pros**: No rate limits, diverse content
- **Cons**: Variable data quality, less structured

#### Option 3: Hybrid Approach
- **Cost**: Low (reduced API usage)
- **Strategy**: Seed core recipes, augment with user content
- **Pros**: Best of both worlds, scalable
- **Cons**: More complex implementation

## Troubleshooting

### API Connection Issues
If you experience timeouts or connection errors:
1. Check your internet connection
2. Verify SPOONACULAR_API_KEY is valid
3. Try the test script: `node scripts/testSpoonacular.js`

### Rate Limit Errors
If you hit rate limits:
1. Wait for daily reset (midnight UTC)
2. Reduce batch size: `node scripts/seedRecipes.js 50 5`
3. Use `--continue-on-error` to skip failed queries

### Database Errors
If database operations fail:
1. Verify DATABASE_URL in .env
2. Check database connection
3. Use `--dry-run` to validate before actual seeding

## Maintenance Schedule

### Weekly
- Monitor recipe database size and diversity
- Check tag distribution for balance
- Review user feedback on recipe quality

### Monthly
- Consider adding new recipe categories
- Update search queries for trending foods
- Audit and remove low-quality recipes

### Quarterly
- Evaluate API usage patterns
- Consider plan upgrades if needed
- Review recipe performance metrics

## Future Enhancements

### Planned Features
- [ ] Incremental recipe updates (add new recipes weekly)
- [ ] Recipe quality scoring system
- [ ] Automatic duplicate detection with fuzzy matching
- [ ] User preference-based recipe recommendations
- [ ] Recipe popularity tracking

### Scalability Improvements
- [ ] Background job processing for large batches
- [ ] Redis caching for popular recipes
- [ ] CDN integration for recipe images
- [ ] Recipe search optimization with full-text search
