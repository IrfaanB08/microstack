import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import DietaryPreferencesPicker from '../DietaryPreferencesPicker';
import WorkoutDaysPicker from '../WorkoutDaysPicker';
import '../Screen.css';
import './Onboarding.css';

const STEP_TITLES = [
  'Welcome', 'Your goal', 'Body stats', 'Workout schedule', 'Your targets',
  'Dietary preferences', 'Budget & prep time', 'Eating out', 'Your first week',
];
const TOTAL_STEPS = STEP_TITLES.length;

const GOALS = [
  { value: 'cut', label: 'Cut', description: 'Lose fat with a calorie deficit' },
  { value: 'bulk', label: 'Bulk', description: 'Build muscle with a calorie surplus' },
  { value: 'maintain', label: 'Maintain', description: 'Stay at your current weight' },
  { value: 'recomp', label: 'Recomp', description: 'Small deficit while building muscle' },
];

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary — little or no exercise' },
  { value: 'light', label: 'Light — exercise 1-3 days/week' },
  { value: 'moderate', label: 'Moderate — exercise 3-5 days/week' },
  { value: 'active', label: 'Active — exercise 6-7 days/week' },
  { value: 'very_active', label: 'Very active — twice a day' },
];

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const INITIAL_DATA = {
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
  eating_out_frequency: 3,
};

function isBodyStatsValid(data) {
  const w = Number(data.weight_kg);
  const h = Number(data.height_cm);
  const a = Number(data.age);
  return w >= 30 && w <= 300 && h >= 100 && h <= 250 && a >= 16 && a <= 100;
}

/**
 * Guided multi-step setup for new users: goal, body stats, a macro-target
 * reveal, dietary preferences, budget/prep-time, eating-out frequency, and
 * a preview of their generated first week. Profile fields are saved once,
 * right before generating the preview, so an abandoned run doesn't leave
 * partial data behind - the user just lands back here next time (see
 * App.jsx's needsOnboarding check).
 */
function Onboarding({ onComplete, onSkip }) {
  const { updateUser } = useAuth();
  const [step, setStep] = useState(0);
  const [data, setData] = useState(INITIAL_DATA);
  const [error, setError] = useState(null);

  const [macroTargets, setMacroTargets] = useState(null);
  const [calculatingMacros, setCalculatingMacros] = useState(false);

  const [finishing, setFinishing] = useState(false);
  const [planPreview, setPlanPreview] = useState(null);

  const merge = (partial) => setData((current) => ({ ...current, ...partial }));

  // Auto-calculate the macro-reveal once body stats, goal, and workout
  // schedule are known. Shows a single flat target if no training days
  // are set, or a training-day vs rest-day comparison if they are.
  useEffect(() => {
    if (step !== 4 || macroTargets || calculatingMacros) return;
    setCalculatingMacros(true);
    setError(null);

    const bodyStats = {
      weight_kg: Number(data.weight_kg),
      height_cm: Number(data.height_cm),
      age: Number(data.age),
      sex: data.sex,
    };
    const base = { bodyStats, goal: data.goal, activityLevel: data.activity_level };
    const hasWorkoutDays = data.workout_days.length > 0;

    const request = hasWorkoutDays
      ? Promise.all([
          api.macros.calculate({ ...base, dayType: 'training' }),
          api.macros.calculate({ ...base, dayType: 'rest' }),
        ]).then(([training, rest]) => ({ training: training.targets, rest: rest.targets }))
      : api.macros.calculate(base).then((result) => ({ neutral: result.targets }));

    request
      .then(setMacroTargets)
      .catch((err) => setError(err.message || 'Failed to calculate your targets'))
      .finally(() => setCalculatingMacros(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const goNext = () => {
    setError(null);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };
  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const finishSetup = async () => {
    setFinishing(true);
    setError(null);
    try {
      const profilePayload = {
        goal: data.goal,
        weight_kg: Number(data.weight_kg),
        height_cm: Number(data.height_cm),
        age: Number(data.age),
        sex: data.sex,
        activity_level: data.activity_level,
        // Sent even when empty - an empty array is a deliberate "I don't
        // train any day" answer, distinct from never having set this at
        // all (see workoutSchedule.js on the backend).
        workout_days: data.workout_days,
        workout_time_of_day: data.workout_time_of_day,
        dietary_preferences: data.dietary_preferences,
        weekly_grocery_budget: data.weekly_grocery_budget === '' ? null : Number(data.weekly_grocery_budget),
        prep_time_preference: data.prep_time_preference,
        eating_out_frequency: Number(data.eating_out_frequency) || 0,
      };
      const profileResult = await api.auth.updateProfile(profilePayload);
      updateUser(profileResult.user);

      try {
        await api.mealPlans.generate({});
      } catch (genErr) {
        // A plan for the current week already exists (e.g. re-running
        // onboarding) - that's fine, just show what's there.
        if (genErr.status !== 409) throw genErr;
      }

      const week = await api.mealPlans.getWeek();
      setPlanPreview(week);
      setStep(8);
    } catch (err) {
      setError(err.message || 'Something went wrong finishing setup');
    } finally {
      setFinishing(false);
    }
  };

  const canProceed = () => {
    if (step === 2) return isBodyStatsValid(data);
    return true;
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        {step > 0 && step < 8 && (
          <div className="onboarding-progress">
            {STEP_TITLES.slice(1, 8).map((title, idx) => (
              <span
                key={title}
                className={`onboarding-dot${idx + 1 === step ? ' onboarding-dot--active' : ''}${idx + 1 < step ? ' onboarding-dot--done' : ''}`}
              />
            ))}
          </div>
        )}

        {error && <p className="screen-inline-error">{error}</p>}

        {step === 0 && <WelcomeStep onNext={goNext} onSkip={onSkip} />}
        {step === 1 && <GoalStep data={data} merge={merge} />}
        {step === 2 && <BodyStatsStep data={data} merge={merge} />}
        {step === 3 && <WorkoutScheduleStep data={data} merge={merge} />}
        {step === 4 && <MacroRevealStep calculating={calculatingMacros} targets={macroTargets} />}
        {step === 5 && <DietaryStep data={data} merge={merge} />}
        {step === 6 && <BudgetPrepStep data={data} merge={merge} />}
        {step === 7 && <EatingOutStep data={data} merge={merge} />}
        {step === 8 && <PlanPreviewStep planData={planPreview} macroTargets={macroTargets} onComplete={onComplete} />}

        {step > 0 && step < 8 && (
          <div className="onboarding-nav">
            <button type="button" className="btn btn-secondary" onClick={goBack}>Back</button>
            {step === 7 ? (
              <button type="button" className="btn btn-primary" onClick={finishSetup} disabled={finishing}>
                {finishing ? 'Building your plan…' : 'Generate my first week'}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={goNext} disabled={!canProceed()}>
                Continue
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WelcomeStep({ onNext, onSkip }) {
  return (
    <div className="onboarding-step">
      <h1>Welcome to Microstack</h1>
      <p className="screen-hint">
        Let’s set up your goals and body stats so we can calculate your daily macro targets and build your
        first week of meals. It only takes a couple of minutes.
      </p>
      <button type="button" className="btn btn-primary onboarding-full-width" onClick={onNext}>Get started</button>
      <button type="button" className="btn btn-secondary onboarding-full-width" onClick={onSkip}>
        Skip for now
      </button>
    </div>
  );
}

function GoalStep({ data, merge }) {
  return (
    <div className="onboarding-step">
      <h2>What’s your goal?</h2>
      <p className="screen-hint">This shapes your calorie target and macro split.</p>
      <div className="option-cards">
        {GOALS.map((g) => (
          <button
            type="button"
            key={g.value}
            className={`option-card${data.goal === g.value ? ' option-card--selected' : ''}`}
            onClick={() => merge({ goal: g.value })}
          >
            <span className="option-card-title">{g.label}</span>
            <span className="option-card-description">{g.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BodyStatsStep({ data, merge }) {
  return (
    <div className="onboarding-step">
      <h2>Tell us about yourself</h2>
      <p className="screen-hint">We use these to estimate your calorie needs.</p>
      <div className="field-stack">
        <div className="field-row">
          <label className="field">
            <span>Weight (kg)</span>
            <input type="number" min="30" max="300" value={data.weight_kg} onChange={(e) => merge({ weight_kg: e.target.value })} />
          </label>
          <label className="field">
            <span>Height (cm)</span>
            <input type="number" min="100" max="250" value={data.height_cm} onChange={(e) => merge({ height_cm: e.target.value })} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Age</span>
            <input type="number" min="16" max="100" value={data.age} onChange={(e) => merge({ age: e.target.value })} />
          </label>
          <label className="field">
            <span>Sex</span>
            <select value={data.sex} onChange={(e) => merge({ sex: e.target.value })}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Activity level</span>
          <select value={data.activity_level} onChange={(e) => merge({ activity_level: e.target.value })}>
            {ACTIVITY_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

function MacroRevealGrid({ targets }) {
  return (
    <div className="macro-reveal-grid">
      <div className="macro-reveal-item">
        <span className="macro-reveal-value">{targets.calories}</span>
        <span className="macro-reveal-label">Calories</span>
      </div>
      <div className="macro-reveal-item">
        <span className="macro-reveal-value">{targets.protein_g}g</span>
        <span className="macro-reveal-label">Protein</span>
      </div>
      <div className="macro-reveal-item">
        <span className="macro-reveal-value">{targets.carbs_g}g</span>
        <span className="macro-reveal-label">Carbs</span>
      </div>
      <div className="macro-reveal-item">
        <span className="macro-reveal-value">{targets.fat_g}g</span>
        <span className="macro-reveal-label">Fat</span>
      </div>
    </div>
  );
}

function MacroRevealStep({ calculating, targets }) {
  return (
    <div className="onboarding-step">
      <h2>Your daily targets</h2>
      {calculating && <p className="screen-hint">Calculating…</p>}

      {targets?.neutral && (
        <>
          <p className="screen-hint">Based on your stats and goal, here’s what we recommend each day:</p>
          <MacroRevealGrid targets={targets.neutral} />
        </>
      )}

      {targets?.training && targets?.rest && (
        <>
          <p className="screen-hint">
            Same total calories every day - carbs shift up on training days to fuel recovery, and fat shifts
            up on rest days:
          </p>
          <p className="macro-reveal-daytype-label">🏋️ Training day</p>
          <MacroRevealGrid targets={targets.training} />
          <p className="macro-reveal-daytype-label">😴 Rest day</p>
          <MacroRevealGrid targets={targets.rest} />
        </>
      )}

      {targets && (
        <p className="screen-hint">
          You can fine-tune your goal, stats, or workout days any time from your Profile - targets update
          automatically.
        </p>
      )}
    </div>
  );
}

function WorkoutScheduleStep({ data, merge }) {
  return (
    <div className="onboarding-step">
      <h2>When do you train?</h2>
      <p className="screen-hint">
        We’ll shift your carbs up on training days and tag the meal right before/after your workout. Leave
        every day off if you don’t have a regular schedule.
      </p>
      <WorkoutDaysPicker
        workoutDays={data.workout_days}
        workoutTimeOfDay={data.workout_time_of_day}
        onChangeDays={(workout_days) => merge({ workout_days })}
        onChangeTiming={(workout_time_of_day) => merge({ workout_time_of_day })}
      />
    </div>
  );
}

function DietaryStep({ data, merge }) {
  return (
    <div className="onboarding-step">
      <h2>Any dietary preferences?</h2>
      <p className="screen-hint">We’ll only plan meals that fit these. Leave everything unchecked if none apply.</p>
      <DietaryPreferencesPicker
        value={data.dietary_preferences}
        onChange={(dietary_preferences) => merge({ dietary_preferences })}
      />
    </div>
  );
}

function BudgetPrepStep({ data, merge }) {
  return (
    <div className="onboarding-step">
      <h2>Budget &amp; prep time</h2>
      <div className="field-stack">
        <label className="field">
          <span>Weekly grocery budget ($, optional)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={data.weekly_grocery_budget}
            onChange={(e) => merge({ weekly_grocery_budget: e.target.value })}
          />
        </label>
        <div>
          <p className="screen-hint">How do you like to cook?</p>
          <div className="option-cards">
            <button
              type="button"
              className={`option-card${data.prep_time_preference === 'batch' ? ' option-card--selected' : ''}`}
              onClick={() => merge({ prep_time_preference: 'batch' })}
            >
              <span className="option-card-title">Batch cook</span>
              <span className="option-card-description">Cook once, portion for the week</span>
            </button>
            <button
              type="button"
              className={`option-card${data.prep_time_preference === 'daily' ? ' option-card--selected' : ''}`}
              onClick={() => merge({ prep_time_preference: 'daily' })}
            >
              <span className="option-card-title">Cook daily</span>
              <span className="option-card-description">Fresh meals each day</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EatingOutStep({ data, merge }) {
  return (
    <div className="onboarding-step">
      <h2>Eating out</h2>
      <p className="screen-hint">
        How many meals per week do you typically eat out or order in? We’ll plan fewer home-cooked meals to
        leave room for it.
      </p>
      <label className="field">
        <span>{data.eating_out_frequency} meal{Number(data.eating_out_frequency) === 1 ? '' : 's'} per week</span>
        <input
          type="range"
          min="0"
          max="21"
          value={data.eating_out_frequency}
          onChange={(e) => merge({ eating_out_frequency: e.target.value })}
        />
      </label>
    </div>
  );
}

function PlanPreviewStep({ planData, macroTargets, onComplete }) {
  if (!planData) {
    return (
      <div className="onboarding-step">
        <h2>Building your plan…</h2>
        <p className="screen-hint">This will just take a moment.</p>
      </div>
    );
  }

  return (
    <div className="onboarding-step">
      <h2>Your first week is ready 🎉</h2>
      {macroTargets?.neutral && (
        <p className="screen-hint">
          Daily target: {macroTargets.neutral.calories} cal &middot; {macroTargets.neutral.protein_g}g P &middot;{' '}
          {macroTargets.neutral.carbs_g}g C &middot; {macroTargets.neutral.fat_g}g F
        </p>
      )}
      {macroTargets?.training && macroTargets?.rest && (
        <p className="screen-hint">
          🏋️ Training day: {macroTargets.training.calories} cal &middot; {macroTargets.training.carbs_g}g C &middot;{' '}
          {macroTargets.training.fat_g}g F &nbsp;|&nbsp; 😴 Rest day: {macroTargets.rest.calories} cal &middot;{' '}
          {macroTargets.rest.carbs_g}g C &middot; {macroTargets.rest.fat_g}g F
        </p>
      )}
      <div className="plan-preview-list">
        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
          const dayPlan = planData.weeklyPlan[day];
          const meals = MEAL_SLOTS.map((slot) => dayPlan[slot]).filter(Boolean);
          if (meals.length === 0) return null;
          return (
            <div key={day} className="plan-preview-day">
              <span className="plan-preview-day-name">{DAY_NAMES[day]}</span>
              <span className="plan-preview-meals">{meals.map((m) => m.recipe_name).join(' · ')}</span>
            </div>
          );
        })}
      </div>
      <button type="button" className="btn btn-primary onboarding-full-width" onClick={onComplete}>
        Go to my dashboard
      </button>
    </div>
  );
}

export default Onboarding;
