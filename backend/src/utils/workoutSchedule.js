/**
 * Shared helpers for turning a user's workout schedule into per-day
 * training/rest classification and pre/post-workout meal tagging. Used by
 * both the meal plan generator (macro cycling, day-aware generation) and
 * the log/dashboard controller (day-aware target comparison), so both
 * stay in agreement about what "today" means for a given user.
 */

// Which meal slot counts as closest-before / closest-after the workout,
// based on roughly when in the day the user trains. Only two options are
// offered deliberately - meal slots don't carry a clock time, so a third
// "midday" option would be ambiguous about whether it comes before or
// after lunch.
const WORKOUT_TIMING_SLOTS = {
  morning: { pre: 'breakfast', post: 'lunch' },
  evening: { pre: 'lunch', post: 'dinner' },
};

/**
 * Whether a given day-of-week is a training or rest day for this user.
 *
 * workout_days is nullable and deliberately distinct from an empty array:
 * `null`/`undefined` means the user has never configured a workout
 * schedule (an existing account predating this feature, or a profile
 * never touched since) - returns `undefined` so callers can leave macro
 * ratios at their original, uncycled values instead of silently treating
 * every day as a lower-carb rest day. An empty array means the user
 * explicitly said they don't train any day - every day is then a real
 * rest day.
 *
 * @returns {'training' | 'rest' | undefined}
 */
function getDayType(user, dayOfWeek) {
  if (!Array.isArray(user?.workout_days)) return undefined;
  return user.workout_days.includes(dayOfWeek) ? 'training' : 'rest';
}

/**
 * Which pre/post-workout tag (if any) applies to a specific meal slot on
 * a specific day for this user.
 *
 * @returns {'pre-workout' | 'post-workout' | null}
 */
function getWorkoutMealTag(user, dayOfWeek, slot) {
  if (getDayType(user, dayOfWeek) !== 'training') return null;

  const timing = user?.workout_time_of_day || 'morning';
  const slots = WORKOUT_TIMING_SLOTS[timing] || WORKOUT_TIMING_SLOTS.morning;

  if (slot === slots.pre) return 'pre-workout';
  if (slot === slots.post) return 'post-workout';
  return null;
}

module.exports = { getDayType, getWorkoutMealTag, WORKOUT_TIMING_SLOTS };
