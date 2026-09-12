import './App.css'
import { useAuth } from './context/AuthContext'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

function App() {
  const { user, loading } = useAuth()

  return (
    <div className="app">
      <header className="app-header">
        <h1>Microstack</h1>
        <p>Meal-prep and macro-tracking for gym-goers</p>
      </header>
      <main className={`app-main${user ? ' app-main--dashboard' : ''}`}>
        {loading ? (
          <p>Loading…</p>
        ) : user ? (
          <Dashboard />
        ) : (
          <Login />
        )}
      </main>
    </div>
  )
}

export default App
