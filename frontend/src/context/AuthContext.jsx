import { createContext, useContext, useState } from 'react';

// Placeholder for Auth Context
// This will be implemented when building the auth feature

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  // Placeholder auth methods
  const login = async (email, password) => {
    // To be implemented
  };

  const register = async (userData) => {
    // To be implemented
  };

  const logout = () => {
    // To be implemented
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
