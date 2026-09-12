import { useEffect, useState } from 'react'
import './App.css'
import { useAuth } from './context/AuthContext'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import MealPlanScreen from './components/MealPlanScreen'
import ShoppingListScreen from './components/ShoppingListScreen'
import ProfileScreen from './components/ProfileScreen'
import NavBar from './components/NavBar'
import Onboarding from './components/onboarding/Onboarding'

const SCREENS = {
  dashboard: Dashboard,
  mealPlan: MealPlanScreen,
  shoppingList: ShoppingListScreen,
  profile: ProfileScreen,
};

function AuthenticatedApp() {
  const [view, setView] = useState('dashboard');
  const ActiveScreen = SCREENS[view] || Dashboard;

  return (
    <div className="app-shell">
      <NavBar active={view} onNavigate={setView} />
      <div className="app-shell-content">
        <ActiveScreen />
      </div>
    </div>
  );
}

function App() {
  const { user, loading } = useAuth()

  // Whether onboarding is showing for this session. `null` means "not yet
  // decided". Decided once per login (from whether body stats are set at
  // that moment) rather than recomputed on every user-object change -
  // otherwise the moment onboarding's own final step saves body stats,
  // this would flip and yank the flow away before the user ever sees the
  // "your first week is ready" preview it ends with.
  const [onboardingActive, setOnboardingActive] = useState(null)

  useEffect(() => {
    if (!user) {
      setOnboardingActive(null)
      return
    }
    if (onboardingActive === null) {
      setOnboardingActive(!user.weight_kg)
    }
  }, [user, onboardingActive])

  if (loading) {
    return (
      <div className="app">
        <div className="app-loading">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Microstack</h1>
          <p>Meal-prep and macro-tracking for gym-goers</p>
        </header>
        <main className="app-main">
          <Login />
        </main>
      </div>
    )
  }

  if (onboardingActive === null) {
    // Still deciding whether this login needs onboarding - avoids a flash
    // of the dashboard before flipping to onboarding (or vice versa).
    return (
      <div className="app">
        <div className="app-loading">Loading…</div>
      </div>
    )
  }

  if (onboardingActive) {
    return (
      <div className="app">
        <Onboarding onComplete={() => setOnboardingActive(false)} onSkip={() => setOnboardingActive(false)} />
      </div>
    )
  }

  return (
    <div className="app">
      <AuthenticatedApp />
    </div>
  )
}

export default App
