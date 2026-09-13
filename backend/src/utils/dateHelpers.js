/**
 * Small date helpers shared by macro-logging code.
 *
 * Dates in this codebase are plain 'YYYY-MM-DD' calendar days with no time
 * component. Parsing them with `new Date('YYYY-MM-DD')` interprets the
 * string as UTC midnight, which can shift the weekday by one when the
 * server isn't running in UTC. `parseDate` below builds the Date from its
 * numeric parts instead, at local midnight, so `getDay()` always returns
 * the weekday the calendar date actually is.
 */

function getTodayDate() {
  return formatDate(new Date());
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isValidDateString(dateStr) {
  return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * 0 (Sunday) - 6 (Saturday), matching the day_of_week convention used by
 * planned_meals.
 */
function getDayOfWeek(dateStr) {
  return parseDate(dateStr).getDay();
}

/**
 * Sunday of the week containing dateStr, matching the week_start_date
 * convention used by meal_plans / MealPlanGenerator.getCurrentWeekStart().
 */
function getWeekStartDate(dateStr) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() - date.getDay());
  return formatDate(date);
}

/** Add (or subtract, with a negative count) days to a 'YYYY-MM-DD' date. */
function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

module.exports = {
  getTodayDate,
  isValidDateString,
  getDayOfWeek,
  getWeekStartDate,
  addDays,
};
