import { useState } from 'react';
import './DietaryPreferencesPicker.css';

// The first three are structured tags the meal planner matches against a
// recipe's own tags; the rest are treated as words to avoid in a recipe's
// ingredient list (see mealPlanGenerator.js's fetchSuitableRecipes filter).
const OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'dairy', label: 'Dairy-free' },
  { value: 'nuts', label: 'Nut-free' },
  { value: 'shellfish', label: 'Shellfish-free' },
  { value: 'pork', label: 'Pork-free' },
  { value: 'egg', label: 'Egg-free' },
];

/**
 * Controlled multi-select for dietary preferences, shared by Onboarding
 * and the Profile screen so both stay in sync with what the meal planner
 * actually understands. `value` / `onChange` carry the plain string array
 * stored on the user (users.dietary_preferences).
 */
function DietaryPreferencesPicker({ value, onChange }) {
  const knownValues = new Set(OPTIONS.map((o) => o.value));
  const customValues = value.filter((v) => !knownValues.has(v));
  const [customText, setCustomText] = useState(customValues.join(', '));

  const toggleOption = (optionValue) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const commitCustomText = () => {
    const parsed = customText
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const deduped = [...new Set(parsed)];
    onChange([...value.filter((v) => knownValues.has(v)), ...deduped]);
  };

  return (
    <div className="dietary-picker">
      <div className="checkbox-grid">
        {OPTIONS.map((option) => (
          <label key={option.value} className="checkbox-option">
            <input
              type="checkbox"
              checked={value.includes(option.value)}
              onChange={() => toggleOption(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <label className="field dietary-custom-field">
        <span>Other foods to avoid (comma separated)</span>
        <input
          type="text"
          placeholder="e.g. mushrooms, cilantro"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onBlur={commitCustomText}
        />
      </label>
    </div>
  );
}

export default DietaryPreferencesPicker;
