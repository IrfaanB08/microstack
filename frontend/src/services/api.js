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
    setToken,
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
    generate: (options) => request('/meal-plans/generate', { method: 'POST', body: JSON.stringify(options || {}) }),
  },
};
