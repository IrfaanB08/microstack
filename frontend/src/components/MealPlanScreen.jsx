import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { addDays, dayLabel, formatWeekRangeLabel } from '../utils/date';
import './Screen.css';
import './MealPlanScreen.css';

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const DAYS = [0, 1, 2, 3, 4, 5, 6];

function formatMacro(value) {
  return Math.round(Number(value) || 0);
}

function MealPlanScreen() {
  const [weekStartDate, setWeekStartDate] = useState(null);
  const [planData, setPlanData] = useState(null); // { mealPlan, weeklyPlan, dailyTotals, weeklyTotals }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [swappingKey, setSwappingKey] = useState(null);

  const [prepOpen, setPrepOpen] = useState(false);
  const [prepData, setPrepData] = useState(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepError, setPrepError] = useState(null);

  const loadWeek = useCallback(async (targetWeekStartDate) => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await api.mealPlans.getWeek(targetWeekStartDate);
      setPlanData(data);
      setWeekStartDate(data.mealPlan.week_start_date);
    } catch (err) {
      if (err.status === 404) {
        setNotFound(true);
        setPlanData(null);
        if (targetWeekStartDate) setWeekStartDate(targetWeekStartDate);
      } else {
        setError(err.message || 'Failed to load meal plan');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const handleGenerate = async (regenerate) => {
    setGenerating(true);
    setError(null);
    try {
      await api.mealPlans.generate({
        week_start_date: weekStartDate || undefined,
        regenerate,
      });
      await loadWeek(weekStartDate || undefined);
      setPrepData(null);
      setPrepOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to generate meal plan');
    } finally {
      setGenerating(false);
    }
  };

  const handleSwap = async (day, slot) => {
    const key = `${day}-${slot}`;
    setSwappingKey(key);
    setError(null);
    try {
      await api.mealPlans.swapMeal(planData.mealPlan.id, day, slot);
      await loadWeek(weekStartDate);
      setPrepData(null); // ingredients/prep steps are now stale
    } catch (err) {
      setError(err.message || 'Failed to swap meal');
    } finally {
      setSwappingKey(null);
    }
  };

  const handleTogglePrep = async () => {
    if (prepOpen) {
      setPrepOpen(false);
      return;
    }
    setPrepOpen(true);
    if (prepData || !planData) return;
    setPrepLoading(true);
    setPrepError(null);
    try {
      const data = await api.mealPlans.getPrepInstructions(planData.mealPlan.id);
      setPrepData(data);
    } catch (err) {
      setPrepError(err.message || 'Failed to load prep instructions');
    } finally {
      setPrepLoading(false);
    }
  };

  const goToWeek = (offsetDays) => {
    const target = addDays(weekStartDate, offsetDays);
    loadWeek(target);
    setPrepData(null);
    setPrepOpen(false);
  };

  if (loading) {
    return <div className="screen-status">Loading your meal plan…</div>;
  }

  if (error && !planData && !notFound) {
    return (
      <div className="screen-status screen-status--error">
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => loadWeek(weekStartDate)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Meal Plan</h1>
          {weekStartDate && <p className="screen-subtitle">{formatWeekRangeLabel(weekStartDate)}</p>}
        </div>
        {weekStartDate && (
          <div className="week-nav">
            <button className="btn btn-secondary btn-small" onClick={() => goToWeek(-7)}>‹ Prev</button>
            <button className="btn btn-secondary btn-small" onClick={() => goToWeek(7)}>Next ›</button>
          </div>
        )}
      </header>

      {error && <p className="screen-inline-error">{error}</p>}

      {notFound ? (
        <div className="screen-card">
          <h2>No plan for this week</h2>
          <p className="screen-hint">Generate one based on your goals and preferences.</p>
          <button className="btn btn-primary" onClick={() => handleGenerate(false)} disabled={generating}>
            {generating ? 'Generating…' : 'Generate this week’s plan'}
          </button>
        </div>
      ) : (
        <>
          <div className="screen-card meal-plan-actions">
            <button className="btn btn-secondary btn-small" onClick={() => handleGenerate(true)} disabled={generating}>
              {generating ? 'Regenerating…' : 'Regenerate week'}
            </button>
            <button className="btn btn-secondary btn-small" onClick={handleTogglePrep}>
              {prepOpen ? 'Hide prep instructions' : 'View batch-prep instructions'}
            </button>
          </div>

          {prepOpen && (
            <div className="screen-card">
              <h2>Prep instructions</h2>
              {prepLoading && <p className="screen-hint">Loading prep instructions…</p>}
              {prepError && <p className="screen-inline-error">{prepError}</p>}
              {prepData && (
                <div className="prep-panel">
                  <p className="screen-hint">{prepData.guidance}</p>
                  {prepData.sessions.map((session) => (
                    <div key={session.prepDay} className="prep-session">
                      <h3>{session.prepDayName} &middot; {session.estimatedPrepTimeMinutes} min</h3>
                      {session.recipes.map((recipe) => (
                        <details key={recipe.recipeId} className="prep-recipe">
                          <summary>
                            {recipe.recipeName} &middot; {recipe.servingsNeeded} serving{recipe.servingsNeeded === 1 ? '' : 's'}
                            <span className="prep-recipe-used"> (for {recipe.usedFor.join(', ')})</span>
                          </summary>
                          <div className="prep-recipe-body">
                            <p className="prep-subheading">Ingredients</p>
                            <ul>
                              {recipe.ingredients.map((line, idx) => <li key={idx}>{line}</li>)}
                            </ul>
                            <p className="prep-subheading">Steps</p>
                            <ol>
                              {recipe.steps.map((step, idx) => <li key={idx}>{step}</li>)}
                            </ol>
                          </div>
                        </details>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {DAYS.map((day) => {
            const dayPlan = planData.weeklyPlan[day];
            const totals = planData.dailyTotals[day];
            return (
              <div key={day} className="screen-card">
                <div className="day-card-header">
                  <h2>{dayLabel(weekStartDate, day)}</h2>
                  {totals && totals.calories > 0 && (
                    <span className="day-card-totals">
                      {formatMacro(totals.calories)} cal &middot; {formatMacro(totals.protein_g)}g P &middot;{' '}
                      {formatMacro(totals.carbs_g)}g C &middot; {formatMacro(totals.fat_g)}g F
                    </span>
                  )}
                </div>
                <ul className="meal-slot-list">
                  {MEAL_SLOTS.map((slot) => {
                    const meal = dayPlan[slot];
                    const key = `${day}-${slot}`;
                    return (
                      <li key={slot} className="meal-slot-item">
                        <div className="meal-slot-row">
                          <span className="meal-slot-label">{MEAL_SLOT_LABELS[slot]}</span>
                          {meal ? (
                            <>
                              <div className="meal-slot-details">
                                <span className="meal-slot-name">{meal.recipe_name}</span>
                                <span className="meal-slot-macros">
                                  {formatMacro(meal.calories)} cal &middot; {formatMacro(meal.protein_g)}g P &middot;{' '}
                                  {formatMacro(meal.carbs_g)}g C &middot; {formatMacro(meal.fat_g)}g F &middot;{' '}
                                  {meal.prep_time_minutes} min
                                </span>
                              </div>
                              <button
                                className="btn btn-secondary btn-small"
                                onClick={() => handleSwap(day, slot)}
                                disabled={swappingKey === key}
                              >
                                {swappingKey === key ? 'Swapping…' : 'Swap'}
                              </button>
                            </>
                          ) : (
                            <span className="meal-slot-empty">Nothing planned</span>
                          )}
                        </div>
                        {meal && (
                          <details className="meal-slot-prep">
                            <summary>How to prepare</summary>
                            <div className="meal-slot-prep-body">
                              <p className="prep-subheading">Ingredients</p>
                              {meal.ingredients && meal.ingredients.length > 0 ? (
                                <ul>
                                  {meal.ingredients.map((ingredient, idx) => (
                                    <li key={idx}>
                                      {ingredient.original
                                        || [ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(' ')}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="screen-hint">No ingredients saved for this recipe.</p>
                              )}
                              <p className="prep-subheading">Steps</p>
                              {meal.steps && meal.steps.length > 0 ? (
                                <ol>
                                  {meal.steps.map((step, idx) => (
                                    <li key={idx}>{typeof step === 'string' ? step : step.step}</li>
                                  ))}
                                </ol>
                              ) : (
                                <p className="screen-hint">No steps saved for this recipe.</p>
                              )}
                            </div>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default MealPlanScreen;
