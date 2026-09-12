// Date helpers shared by the Meal Plan screen (and anything else that
// needs to navigate/display week-based data). Dates everywhere in this
// app are plain 'YYYY-MM-DD' calendar days with no time component -
// parsing them via their numeric parts (rather than `new Date(str)`,
// which treats the string as UTC midnight) keeps day-of-week and
// add/subtract math correct regardless of the browser's timezone.

export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

export function formatWeekRangeLabel(weekStartDate) {
  const start = parseDate(weekStartDate);
  const end = parseDate(addDays(weekStartDate, 6));
  const opts = { month: 'short', day: 'numeric' };
  const startLabel = start.toLocaleDateString(undefined, opts);
  const endLabel = end.toLocaleDateString(undefined, { ...opts, year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

export function dayLabel(weekStartDate, dayOfWeek) {
  const date = parseDate(addDays(weekStartDate, dayOfWeek));
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function shortDayName(dayOfWeek) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return names[dayOfWeek];
}
