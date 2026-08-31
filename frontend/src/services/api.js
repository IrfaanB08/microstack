// API service for Microstack frontend
// This will be expanded with actual API calls as features are built

const API_BASE_URL = '/api';

export const api = {
  // Placeholder for future API calls
  // health check example
  health: async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.json();
  },
  
  // Future methods:
  // auth: { login, register, logout },
  // users: { getProfile, updateProfile },
  // mealPlans: { getWeeklyPlan, generatePlan },
  // shopping: { getList, updateItem },
};
