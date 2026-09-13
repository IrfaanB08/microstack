import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import './Screen.css';
import './ShoppingListScreen.css';

const AISLE_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'frozen', 'pantry', 'beverages', 'snacks', 'household', 'other'];
const AISLE_LABELS = {
  produce: 'Produce',
  meat: 'Meat & Seafood',
  dairy: 'Dairy & Eggs',
  bakery: 'Bakery',
  frozen: 'Frozen',
  pantry: 'Pantry',
  beverages: 'Beverages',
  snacks: 'Snacks',
  household: 'Household',
  other: 'Other',
};

function ShoppingListScreen() {
  const [mealPlanId, setMealPlanId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noMealPlan, setNoMealPlan] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');
  const [addError, setAddError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoMealPlan(false);
    try {
      const weekData = await api.mealPlans.getWeek();
      const planId = weekData.mealPlan.id;
      setMealPlanId(planId);
      const listData = await api.shoppingLists.get(planId);
      setItems(listData.items);
    } catch (err) {
      if (err.status === 404) {
        setNoMealPlan(true);
      } else {
        setError(err.message || 'Failed to load shopping list');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (item) => {
    const nextChecked = !item.checked;
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, checked: nextChecked } : i)));
    try {
      await api.shoppingLists.toggleItem(item.id);
    } catch (err) {
      // Roll back on failure
      setItems((current) => current.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i)));
      setError(err.message || 'Failed to update item');
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const data = await api.shoppingLists.regenerate(mealPlanId);
      setItems(data.items);
    } catch (err) {
      setError(err.message || 'Failed to regenerate shopping list');
    } finally {
      setRegenerating(false);
    }
  };

  const handleAddItem = async (event) => {
    event.preventDefault();
    setAddError(null);
    if (!newItemName.trim()) {
      setAddError('Enter an item name');
      return;
    }
    setAdding(true);
    try {
      const data = await api.shoppingLists.addItem(mealPlanId, {
        ingredient_name: newItemName.trim(),
        quantity: newItemQuantity.trim() || null,
      });
      setItems((current) => [...current, data.item]);
      setNewItemName('');
      setNewItemQuantity('');
    } catch (err) {
      setAddError(err.message || 'Failed to add item');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveItem = async (itemId) => {
    const previous = items;
    setItems((current) => current.filter((i) => i.id !== itemId));
    try {
      await api.shoppingLists.removeItem(itemId);
    } catch (err) {
      setItems(previous);
      setError(err.message || 'Failed to remove item');
    }
  };

  if (loading) {
    return <div className="screen-status">Loading your shopping list…</div>;
  }

  if (noMealPlan) {
    return (
      <div className="screen">
        <header className="screen-header"><h1>Shopping List</h1></header>
        <div className="screen-card">
          <p className="screen-hint">
            You don’t have a meal plan yet - generate one from the Meal Plan tab and your shopping list will
            be built from it automatically.
          </p>
        </div>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="screen-status screen-status--error">
        <p>{error}</p>
        <button className="btn btn-primary" onClick={load}>Retry</button>
      </div>
    );
  }

  const checkedCount = items.filter((i) => i.checked).length;
  const sharedCount = items.filter((i) => i.sharedAcrossMeals).length;
  const groupedByAisle = {};
  for (const item of items) {
    const category = item.grocery_aisle_category || 'other';
    if (!groupedByAisle[category]) groupedByAisle[category] = [];
    groupedByAisle[category].push(item);
  }
  // Within each aisle, float shared-ingredient items to the top so they
  // stand out as worth buying in bulk, without breaking the aisle
  // grouping that makes the list usable while actually shopping.
  for (const category of Object.keys(groupedByAisle)) {
    groupedByAisle[category].sort((a, b) => {
      if (a.sharedAcrossMeals === b.sharedAcrossMeals) return 0;
      return a.sharedAcrossMeals ? -1 : 1;
    });
  }
  const aislesPresent = AISLE_ORDER.filter((aisle) => groupedByAisle[aisle]?.length > 0);

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Shopping List</h1>
          <p className="screen-subtitle">
            {checkedCount} / {items.length} checked off
            {sharedCount > 0 && ` · ${sharedCount} shared across meals`}
          </p>
        </div>
        <button className="btn btn-secondary btn-small" onClick={handleRegenerate} disabled={regenerating}>
          {regenerating ? 'Rebuilding…' : 'Rebuild from plan'}
        </button>
      </header>

      {error && <p className="screen-inline-error">{error}</p>}

      {items.length > 0 && (
        <div className="shopping-progress-track">
          <div
            className="shopping-progress-fill"
            style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%` }}
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="screen-card">
          <p className="screen-hint">Your shopping list is empty. Rebuild it from your current meal plan below.</p>
        </div>
      ) : (
        aislesPresent.map((aisle) => (
          <div key={aisle} className="screen-card">
            <h2>{AISLE_LABELS[aisle] || aisle}</h2>
            <ul className="shopping-item-list">
              {groupedByAisle[aisle].map((item) => (
                <li
                  key={item.id}
                  className={`shopping-item${item.sharedAcrossMeals ? ' shopping-item--shared' : ''}`}
                >
                  <label className="shopping-item-label">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggle(item)}
                    />
                    <span className="shopping-item-text">
                      <span className={`shopping-item-name${item.checked ? ' shopping-item-name--checked' : ''}`}>
                        {item.ingredient_name}
                        {(item.quantity || item.unit) && (
                          <span className="shopping-item-qty"> &middot; {item.quantity} {item.unit || ''}</span>
                        )}
                      </span>
                      {item.sharedAcrossMeals && (
                        <span
                          className="shopping-item-shared-badge"
                          title={item.usedInRecipes?.length ? `Used in: ${item.usedInRecipes.join(', ')}` : undefined}
                        >
                          🔄 Used in {item.mealCount} meals this week
                        </span>
                      )}
                    </span>
                  </label>
                  <button
                    className="shopping-item-delete"
                    onClick={() => handleRemoveItem(item.id)}
                    aria-label={`Remove ${item.ingredient_name}`}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <div className="screen-card">
        <h2>Add an item</h2>
        <form className="add-item-form" onSubmit={handleAddItem}>
          <input
            type="text"
            placeholder="Item name"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="add-item-name"
          />
          <input
            type="text"
            placeholder="Qty (optional)"
            value={newItemQuantity}
            onChange={(e) => setNewItemQuantity(e.target.value)}
            className="add-item-qty"
          />
          <button type="submit" className="btn btn-primary btn-small" disabled={adding}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>
        {addError && <p className="screen-inline-error">{addError}</p>}
      </div>
    </div>
  );
}

export default ShoppingListScreen;
