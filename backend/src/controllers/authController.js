const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authController = {
  register: async (req, res) => {
    try {
      const { email, password, goal } = req.body;

      // Validate required fields
      if (!email || !password || !goal) {
        return res.status(400).json({
          error: 'Missing required fields: email, password, and goal are required',
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          error: 'Password must be at least 8 characters long',
        });
      }

      // Validate goal
      const validGoals = ['bulk', 'cut', 'maintain', 'recomp'];
      if (!validGoals.includes(goal)) {
        return res.status(400).json({
          error: `Invalid goal. Must be one of: ${validGoals.join(', ')}`,
        });
      }

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      // Hash password
      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);

      // Create user
      const user = await User.create({
        email,
        password_hash,
        goal,
      });

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          goal: user.goal,
          created_at: user.created_at,
        },
        token,
      });
    } catch (error) {
      console.error('Error registering user:', error);
      res.status(500).json({
        error: 'Failed to register user',
        message: error.message,
      });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          error: 'Missing required fields: email and password are required',
        });
      }

      // Find user by email
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          goal: user.goal,
          // Include profile fields if they exist
          weight_kg: user.weight_kg,
          height_cm: user.height_cm,
          age: user.age,
          sex: user.sex,
          activity_level: user.activity_level,
          dietary_preferences: user.dietary_preferences,
          weekly_grocery_budget: user.weekly_grocery_budget,
          prep_time_preference: user.prep_time_preference,
          eating_out_frequency: user.eating_out_frequency,
          created_at: user.created_at,
        },
        token,
      });
    } catch (error) {
      console.error('Error logging in user:', error);
      res.status(500).json({
        error: 'Failed to login',
        message: error.message,
      });
    }
  },

  getProfile: async (req, res) => {
    try {
      // User ID is available from the auth middleware
      const userId = req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Return user profile without password hash
      const { password_hash, ...userProfile } = user;

      res.json({
        success: true,
        user: userProfile,
      });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({
        error: 'Failed to fetch user profile',
        message: error.message,
      });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const userId = req.user.userId;
      const profileData = req.body;

      // Validate dietary preferences if provided
      if (profileData.dietary_preferences) {
        if (!Array.isArray(profileData.dietary_preferences)) {
          return res.status(400).json({
            error: 'dietary_preferences must be an array',
          });
        }
      }

      // Validate prep time preference if provided
      if (profileData.prep_time_preference) {
        const validPreferences = ['batch', 'daily'];
        if (!validPreferences.includes(profileData.prep_time_preference)) {
          return res.status(400).json({
            error: `Invalid prep_time_preference. Must be one of: ${validPreferences.join(', ')}`,
          });
        }
      }

      // Validate activity level if provided
      if (profileData.activity_level) {
        const validLevels = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
        if (!validLevels.includes(profileData.activity_level)) {
          return res.status(400).json({
            error: `Invalid activity_level. Must be one of: ${validLevels.join(', ')}`,
          });
        }
      }

      // Validate workout days if provided - day_of_week integers (0=Sunday..6=Saturday),
      // matching the convention planned_meals already uses. An empty array is valid -
      // it explicitly means "I don't train any day".
      if (profileData.workout_days) {
        if (!Array.isArray(profileData.workout_days)
          || !profileData.workout_days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
          return res.status(400).json({
            error: 'workout_days must be an array of integers 0-6 (0=Sunday, 6=Saturday)',
          });
        }
      }

      // Validate workout time of day if provided
      if (profileData.workout_time_of_day) {
        const validTimings = ['morning', 'evening'];
        if (!validTimings.includes(profileData.workout_time_of_day)) {
          return res.status(400).json({
            error: `Invalid workout_time_of_day. Must be one of: ${validTimings.join(', ')}`,
          });
        }
      }

      // Validate eating-out frequency if provided. This counts individual
      // MEALS per week eaten out, not days (the mealPlanGenerator maps it
      // 1:1 onto meal slots, and the onboarding/profile UI both label it
      // "meals per week") - 0-21 covers every meal of every day, matching
      // the users.eating_out_frequency check constraint. Without this,
      // an out-of-range value reaches the database and comes back as a
      // raw constraint-violation error instead of a clean 400.
      if (profileData.eating_out_frequency !== undefined && profileData.eating_out_frequency !== null) {
        const frequency = profileData.eating_out_frequency;
        if (!Number.isInteger(frequency) || frequency < 0 || frequency > 21) {
          return res.status(400).json({
            error: 'eating_out_frequency must be an integer between 0 and 21 (meals per week eaten out)',
          });
        }
      }

      // Update user profile
      const updatedUser = await User.updateProfile(userId, profileData);

      // Return updated profile without password hash
      const { password_hash, ...userProfile } = updatedUser;

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: userProfile,
      });
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).json({
        error: 'Failed to update user profile',
        message: error.message,
      });
    }
  },
};

module.exports = authController;
