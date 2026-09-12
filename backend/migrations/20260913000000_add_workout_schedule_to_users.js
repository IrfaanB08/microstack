/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumns('users', {
    // Days of the week the user trains, using the same day_of_week
    // convention as planned_meals (0=Sunday..6=Saturday).
    //
    // Deliberately nullable with no default, and distinct from an empty
    // array: NULL means the user has never configured a workout schedule
    // (existing accounts predating this feature, or a profile never
    // touched since) - every day keeps the original flat macro ratios,
    // no cycling, so nothing changes for them until they visit Profile.
    // A non-null array - even an empty one, meaning "I don't train" -
    // means the user has explicitly set this; days in the array become
    // "training" days and every other day becomes a real "rest" day with
    // the lower-carb shift applied.
    workout_days: {
      type: 'jsonb',
    },
    // Roughly when the user trains on a training day, used to decide
    // which meal slot is closest before/after the workout (pre/post-
    // workout tagging). Only meaningful once workout_days is set.
    workout_time_of_day: {
      type: 'varchar(20)',
      check: "workout_time_of_day IN ('morning', 'evening')",
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('users', ['workout_days', 'workout_time_of_day']);
};
