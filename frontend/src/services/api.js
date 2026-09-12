// API service for Microstack frontend

const API_BASE_URL = '/api';
const TOKEN_KEY = 'microstack_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // No JSON body (e.g. empty response) - fine for some endpoints.
  }

  if (!response.ok) {
    const error = new Error(body?.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export const api = {
  getToken,

  health: async () => request('/health'),

  auth: {
    login: (email, password) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (userData) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
    getProfile: () => request('/auth/profile'),
    updateProfile: (profileData) =>
      request('/auth/profile', { method: 'PUT', body: JSON.stringify(profileData) }),
    setToken,
  },

  macros: {
    calculate: (payload) => request('/macros/calculate', { method: 'POST', body: JSON.stringify(payload) }),
  },

  logs: {
    // Today's macros vs targets + today's planned meals, in one call.
    getDailySummary: (date) => request(`/logs/summary${date ? `?date=${date}` : ''}`),
    getForDate: (date) => request(`/logs${date ? `?date=${date}` : ''}`),
    create: (entry) => request('/logs', { method: 'POST', body: JSON.stringify(entry) }),
    update: (id, entry) => request(`/logs/${id}`, { method: 'PUT', body: JSON.stringify(entry) }),
    remove: (id) => request(`/logs/${id}`, { method: 'DELETE' }),
  },

  mealPlans: {
    getWeek: (weekStartDate) => request(`/meal-plans/week${weekStartDate ? `/${weekStartDate}` : ''}`),
    getAll: () => request('/meal-plans'),
    generate: (options) => request('/meal-plans/generate', { method: 'POST', body: JSON.stringify(options || {}) }),
    swapMeal: (mealPlanId, day, slot) =>
      request(`/meal-plans/${mealPlanId}/swap`, { method: 'PUT', body: JSON.stringify({ day, slot }) }),
    regenerateDay: (mealPlanId, day) =>
      request(`/meal-plans/${mealPlanId}/regenerate-day`, { method: 'PUT', body: JSON.stringify({ day }) }),
    getPrepInstructions: (mealPlanId) => request(`/meal-plans/${mealPlanId}/prep-instructions`),
  },

  shoppingLists: {
    get: (mealPlanId) => request(`/shopping-lists/${mealPlanId}`),
    regenerate: (mealPlanId) => request(`/shopping-lists/${mealPlanId}/regenerate`, { method: 'POST' }),
    addItem: (mealPlanId, item) =>
      request(`/shopping-lists/${mealPlanId}/items`, { method: 'POST', body: JSON.stringify(item) }),
    toggleItem: (itemId) => request(`/shopping-lists/items/${itemId}/toggle`, { method: 'PUT' }),
    removeItem: (itemId) => request(`/shopping-lists/items/${itemId}`, { method: 'DELETE' }),
  },
};
