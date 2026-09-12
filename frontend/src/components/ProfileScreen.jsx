import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import DietaryPreferencesPicker from './DietaryPreferencesPicker';
import WorkoutDaysPicker from './WorkoutDaysPicker';
import './Screen.css';
import './ProfileScreen.css';

const GOALS = [
  { value: 'cut', label: 'Cut', description: 'Lose fat, calorie deficit' },
  { value: 'bulk', label: 'Bulk', description: 'Build muscle, calorie surplus' },
  { value: 'maintain', label: 'Maintain', description: 'Stay at current weight' },
  { value: 'recomp', label: 'Recomp', description: 'Small deficit, build muscle' },
];

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary (little or no exercise)' },
  { value: 'light', label: 'Light (1-3 days/week)' },
  { value: 'moderate', label: 'Moderate (3-5 days/week)' },
  { value: 'active', label: 'Active (6-7 days/week)' },
  { value: 'very_active', label: 'Very active (twice a day)' },
];

const EMPTY_FORM = {
  goal: 'maintain',
  weight_kg: '',
  height_cm: '',
  age: '',
  sex: 'male',
  activity_level: 'moderate',
  workout_days: [],
  workout_time_of_day: 'morning',
  dietary_preferences: [],
  weekly_grocery_budget: '',
  prep_time_preference: 'batch',
  eating_out_frequency: 0,
};

function toFormValues(profile) {
  return {
    goal: profile.goal || 'maintain',
    weight_kg: profile.weight_kg ?? '',
    height_cm: profile.height_cm ?? '',
    age: profile.age ?? '',
    sex: profile.sex || 'male',
    activity_level: profile.activity_level || 'moderate',
    // workout_days is null on the server until the user has explicitly
    // configured it (see workoutSchedule.js) - default to an empty array
    // just so the picker has something to render against.
    workout_days: profile.workout_days || [],
    workout_time_of_day: profile.workout_time_of_day || 'morning',
    dietary_preferences: profile.dietary_preferences || [],
    weekly_grocery_budget: profile.weekly_grocery_budget ?? '',
    prep_time_preference: profile.prep_time_preference || 'batch',
    eating_out_frequency: profile.eating_out_frequency ?? 0,
  };
}

function ProfileScreen() {
  const { user, updateUser, logout } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Whether the loaded profile already had a workout schedule configured
  // (workout_days non-null), and whether the user has touched that
  // section in this session. Saving the form should only send
  // workout_days/workout_time_of_day when one of these is true - a user
  // who never configured a schedule and just saves an unrelated field
  // (like their weight) shouldn't silently turn on "every day is a rest
  // day" macro cycling just because the picker defaults to nothing
  // selected. See toFormValues() and workoutSchedule.js on the backend.
  const [workoutDaysEverConfigured, setWorkoutDaysEverConfigured] = useState(false);
  const [workoutDaysTouched, setWorkoutDaysTouched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.auth.getProfile();
        setForm(toFormValues(data.user));
        setWorkoutDaysEverConfigured(data.user.workout_days !== null && data.user.workout_days !== undefined);
      } catch (err) {
        setError(err.message || 'Failed to load your profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setField = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      const payload = {
        goal: form.goal,
        weight_kg: form.weight_kg === '' ? null : Number(form.weight_kg),
        height_cm: form.height_cm === '' ? null : Number(form.height_cm),
        age: form.age === '' ? null : Number(form.age),
        sex: form.sex,
        activity_level: form.activity_level,
        dietary_preferences: form.dietary_preferences,
        weekly_grocery_budget: form.weekly_grocery_budget === '' ? null : Number(form.weekly_grocery_budget),
        prep_time_preference: form.prep_time_preference,
        eating_out_frequency: Number(form.eating_out_frequency) || 0,
      };
      if (workoutDaysEverConfigured || workoutDaysTouched) {
        payload.workout_days = form.workout_days;
        payload.workout_time_of_day = form.workout_time_of_day;
      }
      const data = await api.auth.updateProfile(payload);
      updateUser(data.user);
      setForm(toFormValues(data.user));
      setWorkoutDaysEverConfigured(data.user.workout_days !== null && data.user.workout_days !== undefined);
      setSaved(true);
    } catch (err) {
      setSaveError(err.message || 'Failed to save your profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="screen-status">Loading your profile…</div>;
  }

  if (error) {
    return (
      <div className="screen-status screen-status--error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Profile</h1>
          <p className="screen-subtitle">{user?.email}</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="profile-form">
        <div className="screen-card">
          <h2>Goal</h2>
          <div className="option-cards">
            {GOALS.map((g) => (
              <button
                type="button"
                key={g.value}
                className={`option-card${form.goal === g.value ? ' option-card--selected' : ''}`}
                onClick={() => setField('goal')(g.value)}
              >
                <span className="option-card-title">{g.label}</span>
                <span className="option-card-description">{g.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="screen-card">
          <h2>Body stats</h2>
          <p className="screen-hint profile-section-hint">
            Used to calculate your daily calorie and macro targets.
          </p>
          <div className="field-stack">
            <div className="field-row">
              <label className="field">
                <span>Weight (kg)</span>
                <input type="number" min="30" max="300" value={form.weight_kg} onChange={(e) => setField('weight_kg')(e.target.value)} />
              </label>
              <label className="field">
                <span>Height (cm)</span>
                <input type="number" min="100" max="250" value={form.height_cm} onChange={(e) => setField('height_cm')(e.target.value)} />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Age</span>
                <input type="number" min="16" max="100" value={form.age} onChange={(e) => setField('age')(e.target.value)} />
              </label>
              <label className="field">
                <span>Sex</span>
                <select value={form.sex} onChange={(e) => setField('sex')(e.target.value)}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Activity level</span>
              <select value={form.activity_level} onChange={(e) => setField('activity_level')(e.target.value)}>
                {ACTIVITY_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="screen-card">
          <h2>Workout schedule</h2>
          <p className="screen-hint profile-section-hint">
            Shifts your carbs up on training days and tags the meal right before/after your workout.
          </p>
          <WorkoutDaysPicker
            workoutDays={form.workout_days}
            workoutTimeOfDay={form.workout_time_of_day}
            onChangeDays={(workout_days) => {
              setWorkoutDaysTouched(true);
              setField('workout_days')(workout_days);
            }}
            onChangeTiming={(workout_time_of_day) => {
              setWorkoutDaysTouched(true);
              setField('workout_time_of_day')(workout_time_of_day);
            }}
          />
        </div>

        <div className="screen-card">
          <h2>Dietary preferences</h2>
          <DietaryPreferencesPicker
            value={form.dietary_preferences}
            onChange={setField('dietary_preferences')}
          />
        </div>

        <div className="screen-card">
          <h2>Budget &amp; prep time</h2>
          <div className="field-stack">
            <label className="field">
              <span>Weekly grocery budget ($)</span>
              <input type="number" min="0" step="0.01" value={form.weekly_grocery_budget} onChange={(e) => setField('weekly_grocery_budget')(e.target.value)} />
            </label>
            <label className="field">
              <span>Prep time preference</span>
              <select value={form.prep_time_preference} onChange={(e) => setField('prep_time_preference')(e.target.value)}>
                <option value="batch">Batch cook once a week</option>
                <option value="daily">Cook fresh daily</option>
              </select>
            </label>
          </div>
        </div>

        <div className="screen-card">
          <h2>Eating out</h2>
          <label className="field">
            <span>How many meals per week do you eat out? ({form.eating_out_frequency})</span>
            <input
              type="range"
              min="0"
              max="21"
              value={form.eating_out_frequency}
              onChange={(e) => setField('eating_out_frequency')(e.target.value)}
            />
          </label>
        </div>

        {saveError && <p className="screen-inline-error">{saveError}</p>}
        {saved && <p className="screen-inline-success">Profile saved.</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <div className="screen-card">
        <button type="button" className="btn btn-danger" onClick={logout}>Log out</button>
      </div>
    </div>
  );
}

export default ProfileScreen;
