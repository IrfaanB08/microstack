import './NavBar.css';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Today', icon: '🏠' },
  { key: 'mealPlan', label: 'Meal Plan', icon: '📅' },
  { key: 'shoppingList', label: 'Shopping', icon: '🛒' },
  { key: 'profile', label: 'Profile', icon: '👤' },
];

/**
 * App-wide navigation. Renders as a bottom tab bar on narrow (mobile)
 * viewports and as a left sidebar on wider ones - same markup, the
 * layout switch is pure CSS (see NavBar.css).
 */
function NavBar({ active, onNavigate }) {
  return (
    <nav className="nav-bar" aria-label="Main navigation">
      <div className="nav-brand">Microstack</div>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`nav-item${active === item.key ? ' nav-item--active' : ''}`}
          onClick={() => onNavigate(item.key)}
          aria-current={active === item.key ? 'page' : undefined}
        >
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default NavBar;
