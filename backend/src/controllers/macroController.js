const MacroCalculator = require('../utils/macroCalculator');

const macroController = {
  calculateTargets: (req, res) => {
    try {
      const { bodyStats, goal, activityLevel, dayType } = req.body;

      // Validate required fields
      if (!bodyStats || !goal || !activityLevel) {
        return res.status(400).json({
          error: 'Missing required fields: bodyStats, goal, and activityLevel are required',
        });
      }

      // Validate body stats
      try {
        MacroCalculator.validateBodyStats(bodyStats);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }

      // Validate goal
      const validGoals = ['bulk', 'cut', 'maintain', 'recomp'];
      if (!validGoals.includes(goal)) {
        return res.status(400).json({
          error: `Invalid goal. Must be one of: ${validGoals.join(', ')}`,
        });
      }

      // Validate activity level
      const validActivityLevels = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
      if (!validActivityLevels.includes(activityLevel)) {
        return res.status(400).json({
          error: `Invalid activity level. Must be one of: ${validActivityLevels.join(', ')}`,
        });
      }

      // Validate day type if provided (optional - lets a caller preview a
      // training-day or rest-day target specifically; omit for the plain
      // goal-based target with no macro cycling applied)
      if (dayType !== undefined && dayType !== 'training' && dayType !== 'rest') {
        return res.status(400).json({
          error: "Invalid dayType. Must be 'training' or 'rest' if provided.",
        });
      }

      // Calculate targets
      const targets = MacroCalculator.calculateTargets(bodyStats, goal, activityLevel, dayType);

      res.json({
        success: true,
        targets,
      });
    } catch (error) {
      console.error('Error calculating macro targets:', error);
      res.status(500).json({
        error: 'Failed to calculate macro targets',
        message: error.message,
      });
    }
  },
};

module.exports = macroController;
