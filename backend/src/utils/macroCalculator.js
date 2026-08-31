/**
 * Macro Calculator using Mifflin-St Jeor Equation
 * Calculates daily calorie and macro targets based on user stats and goals
 */

class MacroCalculator {
  /**
   * Calculate Basal Metabolic Rate (BMR) using Mifflin-St Jeor Equation
   * Men: (10 × weight) + (6.25 × height) - (5 × age) + 5
   * Women: (10 × weight) + (6.25 × height) - (5 × age) - 161
   */
  static calculateBMR(weightKg, heightCm, age, sex) {
    if (!weightKg || !heightCm || !age || !sex) {
      throw new Error('Missing required parameters for BMR calculation');
    }

    const weight = parseFloat(weightKg);
    const height = parseFloat(heightCm);
    const ageNum = parseInt(age);

    let bmr = (10 * weight) + (6.25 * height) - (5 * ageNum);

    if (sex.toLowerCase() === 'male') {
      bmr += 5;
    } else if (sex.toLowerCase() === 'female') {
      bmr -= 161;
    } else {
      // For 'other', use an average of male/female formulas
      bmr -= 78; // Approximately halfway between +5 and -161
    }

    return Math.round(bmr);
  }

  /**
   * Activity multipliers for different activity levels
   */
  static getActivityMultiplier(activityLevel) {
    const multipliers = {
      sedentary: 1.2,      // Little or no exercise
      light: 1.375,        // Light exercise (1-3 days/week)
      moderate: 1.55,     // Moderate exercise (3-5 days/week)
      active: 1.725,      // Heavy exercise (6-7 days/week)
      very_active: 1.9,   // Very heavy exercise (twice per day)
    };

    return multipliers[activityLevel] || 1.2;
  }

  /**
   * Calculate Total Daily Energy Expenditure (TDEE)
   */
  static calculateTDEE(bmr, activityLevel) {
    const multiplier = this.getActivityMultiplier(activityLevel);
    return Math.round(bmr * multiplier);
  }

  /**
   * Calculate calorie adjustment based on goal
   */
  static getCalorieAdjustment(goal) {
    const adjustments = {
      bulk: 500,      // Surplus for muscle gain
      cut: -500,      // Deficit for fat loss
      maintain: 0,    // Maintain current weight
      recomp: -200,   // Small deficit for body recomposition
    };

    return adjustments[goal] || 0;
  }

  /**
   * Calculate macro ratios based on goal
   */
  static getMacroRatios(goal) {
    const ratios = {
      bulk: { protein: 0.3, carbs: 0.45, fat: 0.25 },      // Higher carbs for energy
      cut: { protein: 0.4, carbs: 0.3, fat: 0.3 },        // Higher protein for satiety
      maintain: { protein: 0.3, carbs: 0.4, fat: 0.3 },    // Balanced approach
      recomp: { protein: 0.35, carbs: 0.35, fat: 0.3 },    // Higher protein for muscle retention
    };

    return ratios[goal] || ratios.maintain;
  }

  /**
   * Calculate daily macro targets in grams
   */
  static calculateMacros(calories, proteinRatio, carbsRatio, fatRatio) {
    // Protein: 4 calories per gram
    // Carbs: 4 calories per gram
    // Fat: 9 calories per gram

    const proteinG = Math.round((calories * proteinRatio) / 4);
    const carbsG = Math.round((calories * carbsRatio) / 4);
    const fatG = Math.round((calories * fatRatio) / 9);

    return { proteinG, carbsG, fatG };
  }

  /**
   * Main calculation function - returns complete macro targets
   */
  static calculateTargets(bodyStats, goal, activityLevel) {
    const { weight_kg, height_cm, age, sex } = bodyStats;

    // Calculate BMR
    const bmr = this.calculateBMR(weight_kg, height_cm, age, sex);

    // Calculate TDEE
    const tdee = this.calculateTDEE(bmr, activityLevel);

    // Apply goal-based calorie adjustment
    const calorieAdjustment = this.getCalorieAdjustment(goal);
    const targetCalories = tdee + calorieAdjustment;

    // Get macro ratios for goal
    const { protein, carbs, fat } = this.getMacroRatios(goal);

    // Calculate macro grams
    const macros = this.calculateMacros(targetCalories, protein, carbs, fat);

    return {
      calories: targetCalories,
      protein_g: macros.proteinG,
      carbs_g: macros.carbsG,
      fat_g: macros.fatG,
      bmr,
      tdee,
      activity_multiplier: this.getActivityMultiplier(activityLevel),
      calorie_adjustment: calorieAdjustment,
    };
  }

  /**
   * Validate body stats for calculation
   */
  static validateBodyStats(bodyStats) {
    const { weight_kg, height_cm, age, sex } = bodyStats;

    if (!weight_kg || weight_kg < 30 || weight_kg > 300) {
      throw new Error('Invalid weight. Must be between 30-300 kg.');
    }

    if (!height_cm || height_cm < 100 || height_cm > 250) {
      throw new Error('Invalid height. Must be between 100-250 cm.');
    }

    if (!age || age < 16 || age > 100) {
      throw new Error('Invalid age. Must be between 16-100 years.');
    }

    if (!sex || !['male', 'female', 'other'].includes(sex.toLowerCase())) {
      throw new Error('Invalid sex. Must be male, female, or other.');
    }

    return true;
  }
}

module.exports = MacroCalculator;
