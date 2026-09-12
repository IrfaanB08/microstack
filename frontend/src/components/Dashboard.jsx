import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import MacroProgress from './MacroProgress';
import './Dashboard.css';

const MEAL_SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_SLOT_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const EMPTY_FORM = { food_description: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' };

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** Turn a numeric-input string into a number, or undefined when left blank. */
function toNumberOrUndefined(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * Decimal macro columns (protein_g, carbs_g, fat_g) come back from Postgres
 * as strings like "20.00" - round them for a cleaner display.
 */
function formatMacro(value) {
  return Math.round(Number(value) || 0);
}

function Dashboard() {
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [banner, setBanner] = useState(null); // { type: 'matched' | 'estimated', ... }
  const [loggingMealId, setLoggingMealId] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      const data = await api.logs.getDailySummary();
      setSummary(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load today’s summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleLogPlannedMeal = async (plannedMealId) => {
    setLoggingMealId(plannedMealId);
    try {
      await api.logs.create({ planned_meal_id: plannedMealId });
      await loadSummary();
    } catch (err) {
      setError(err.message || 'Failed to log meal');
    } finally {
      setLoggingMealId(null);
    }
  };

  const handleFormChange = (field) => (event) => {
    setForm({ ...form, [field]: event.target.value });
  };

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    setBanner(null);

    if (!form.food_description.trim()) {
      setFormError('Enter what you ate');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        food_description: form.food_description.trim(),
        calories: toNumberOrUndefined(form.calories),
        protein_g: toNumberOrUndefined(form.protein_g),
        carbs_g: toNumberOrUndefined(form.carbs_g),
        fat_g: toNumberOrUndefined(form.fat_g),
      };
      const result = await api.logs.create(payload);
      setForm(EMPTY_FORM);
      if (result.matched) {
        setBanner({ type: 'matched', ...result.matchedMeal });
      } else if (result.estimated) {
        setBanner({ type: 'estimated', source: result.estimateSource, entry: result.entry });
      }
      await loadSummary();
    } catch (err) {
      setFormError(err.message || 'Failed to log food');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = async (id) => {
    try {
      await api.logs.remove(id);
      await loadSummary();
    } catch (err) {
      setError(err.message || 'Failed to delete entry');
    }
  };

  if (loading) {
    return <div className="dashboard-status">Loading today’s macros…</div>;
  }

  if (error && !summary) {
    return (
      <div className="dashboard-status dashboard-status--error">
        <p>{error}</p>
        <button onClick={loadSummary}>Retry</button>
      </div>
    );
  }

  const orderedPlannedMeals = MEAL_SLOT_ORDER.map((slot) => ({
    slot,
    meal: summary.plannedMeals.find((m) => m.meal_slot === slot) || null,
  }));

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Today</h1>
          <p className="dashboard-date">{todayLabel()}</p>
        </div>
        <div className="dashboard-header-actions">
          <span className="dashboard-user-email">{user?.email}</span>
          <button className="dashboard-logout" onClick={logout}>Log out</button>
        </div>
      </header>

      {error && <p className="dashboard-inline-error">{error}</p>}

      <section className="dashboard-card">
        <h2>Macros vs targets</h2>
        {!summary.targetsAvailable && (
          <p className="dashboard-hint">
            Complete your profile (weight, height, age, sex, activity level) to see personalized targets.
            Showing what you’ve logged today in the meantime.
          </p>
        )}
        <div className="macro-grid">
          <MacroProgress
            label="Calories"
            unit=""
            consumed={summary.consumed.calories}
            target={summary.targets?.calories}
            percentage={summary.percentages?.calories ?? null}
          />
          <MacroProgress
            label="Protein"
            unit="g"
            consumed={summary.consumed.protein_g}
            target={summary.targets?.protein_g}
            percentage={summary.percentages?.protein_g ?? null}
          />
          <MacroProgress
            label="Carbs"
            unit="g"
            consumed={summary.consumed.carbs_g}
            target={summary.targets?.carbs_g}
            percentage={summary.percentages?.carbs_g ?? null}
          />
          <MacroProgress
            label="Fat"
            unit="g"
            consumed={summary.consumed.fat_g}
            target={summary.targets?.fat_g}
            percentage={summary.percentages?.fat_g ?? null}
          />
        </div>
      </section>

      <section className="dashboard-card">
        <h2>Today’s planned meals</h2>
        {!summary.hasMealPlan ? (
          <p className="dashboard-hint">No meal plan generated for this week yet.</p>
        ) : (
          <ul className="planned-meal-list">
            {orderedPlannedMeals.map(({ slot, meal }) => (
              <li key={slot} className="planned-meal-item">
                <span className="planned-meal-slot">{MEAL_SLOT_LABELS[slot]}</span>
                {meal ? (
                  <>
                    <div className="planned-meal-details">
                      <span className="planned-meal-name">{meal.recipe_name}</span>
                      <span className="planned-meal-macros">
                        {meal.calories} cal &middot; {formatMacro(meal.protein_g)}g P &middot; {formatMacro(meal.carbs_g)}g C &middot; {formatMacro(meal.fat_g)}g F
                      </span>
                    </div>
                    {meal.logged ? (
                      <span className="planned-meal-logged">Logged ✓</span>
                    ) : (
                      <button
                        className="planned-meal-log-btn"
                        onClick={() => handleLogPlannedMeal(meal.planned_meal_id)}
                        disabled={loggingMealId === meal.planned_meal_id}
                      >
                        {loggingMealId === meal.planned_meal_id ? 'Logging…' : 'Log this meal'}
                      </button>
                    )}
                  </>
                ) : (
                  <span className="planned-meal-empty">Nothing planned</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dashboard-card">
        <h2>Log food</h2>
        <p className="dashboard-hint">
          Matches your typed description against today’s plan when it can. Otherwise leave the numbers
          blank and we’ll estimate them for you - or type your own to override the estimate.
        </p>
        <form className="log-food-form" onSubmit={handleManualSubmit}>
          <input
            type="text"
            placeholder="What did you eat?"
            value={form.food_description}
            onChange={handleFormChange('food_description')}
            className="log-food-description"
          />
          <div className="log-food-macros">
            <input type="number" min="0" placeholder="Calories (auto if blank)" value={form.calories} onChange={handleFormChange('calories')} />
            <input type="number" min="0" placeholder="Protein (g)" value={form.protein_g} onChange={handleFormChange('protein_g')} />
            <input type="number" min="0" placeholder="Carbs (g)" value={form.carbs_g} onChange={handleFormChange('carbs_g')} />
            <input type="number" min="0" placeholder="Fat (g)" value={form.fat_g} onChange={handleFormChange('fat_g')} />
          </div>
          {formError && <p className="dashboard-inline-error">{formError}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Logging…' : 'Log it'}
          </button>
        </form>
        {banner?.type === 'matched' && (
          <p className="match-banner">
            Matched to your planned {MEAL_SLOT_LABELS[banner.meal_slot] || banner.meal_slot}: {banner.recipe_name}
          </p>
        )}
        {banner?.type === 'estimated' && (
          <p className="match-banner">
            Estimated{banner.source === 'cache' ? '' : ' via Spoonacular'}: {banner.entry.calories} cal &middot;{' '}
            {formatMacro(banner.entry.protein_g)}g P &middot; {formatMacro(banner.entry.carbs_g)}g C &middot;{' '}
            {formatMacro(banner.entry.fat_g)}g F. Edit the entry below if that looks off.
          </p>
        )}
      </section>

      <section className="dashboard-card">
        <h2>Logged today ({summary.entryCount})</h2>
        {summary.entries.length === 0 ? (
          <p className="dashboard-hint">Nothing logged yet today.</p>
        ) : (
          <ul className="log-entry-list">
            {summary.entries.map((entry) => (
              <li key={entry.id} className="log-entry-item">
                <div className="log-entry-details">
                  <span className="log-entry-description">
                    {entry.food_description}
                    {entry.meal_slot && (
                      <span className="log-entry-tag"> · {MEAL_SLOT_LABELS[entry.meal_slot] || entry.meal_slot}</span>
                    )}
                    {entry.estimated && <span className="log-entry-tag"> · estimated</span>}
                  </span>
                  <span className="log-entry-macros">
                    {entry.calories} cal &middot; {formatMacro(entry.protein_g)}g P &middot; {formatMacro(entry.carbs_g)}g C &middot; {formatMacro(entry.fat_g)}g F
                  </span>
                </div>
                <button className="log-entry-delete" onClick={() => handleDeleteEntry(entry.id)} aria-label="Delete entry">
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
