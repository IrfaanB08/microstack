import './WorkoutDaysPicker.css';

// Displayed Mon-Sun (the usual week view), but each value is the
// day_of_week integer the rest of the app already uses everywhere
// (0=Sunday..6=Saturday - see planned_meals.day_of_week).
const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

/**
 * Controlled 7-day toggle plus a "roughly when do you train" selector,
 * shared by Onboarding and the Profile screen so both stay in sync with
 * what the meal planner (macro cycling, pre/post-workout tagging)
 * actually understands. `workoutDays` / `workoutTimeOfDay` mirror
 * users.workout_days / users.workout_time_of_day.
 */
function WorkoutDaysPicker({ workoutDays, workoutTimeOfDay, onChangeDays, onChangeTiming }) {
  const toggleDay = (day) => {
    if (workoutDays.includes(day)) {
      onChangeDays(workoutDays.filter((d) => d !== day));
    } else {
      onChangeDays([...workoutDays, day].sort((a, b) => a - b));
    }
  };

  return (
    <div className="workout-days-picker">
      <div className="day-toggle-row">
        {DAYS.map((day) => (
          <button
            type="button"
            key={day.value}
            className={`day-toggle${workoutDays.includes(day.value) ? ' day-toggle--active' : ''}`}
            onClick={() => toggleDay(day.value)}
          >
            {day.label}
          </button>
        ))}
      </div>

      {workoutDays.length === 0 ? (
        <p className="workout-days-hint">
          No training days selected - every day will use your regular macro targets.
        </p>
      ) : (
        <label className="field workout-timing-field">
          <span>Roughly when do you train?</span>
          <select value={workoutTimeOfDay} onChange={(e) => onChangeTiming(e.target.value)}>
            <option value="morning">Morning (breakfast = pre-workout, lunch = post-workout)</option>
            <option value="evening">Afternoon/evening (lunch = pre-workout, dinner = post-workout)</option>
          </select>
        </label>
      )}
    </div>
  );
}

export default WorkoutDaysPicker;
