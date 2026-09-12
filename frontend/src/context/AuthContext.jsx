import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, if a token is already stored, try to restore the session.
  useEffect(() => {
    const restoreSession = async () => {
      if (!api.getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user: profile } = await api.auth.getProfile();
        setUser(profile);
      } catch {
        api.auth.setToken(null);
      } finally {
        setLoading(false);
      }
    };
    restoreSession();
  }, []);

  const login = async (email, password) => {
    const data = await api.auth.login(email, password);
    api.auth.setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (userData) => {
    const data = await api.auth.register(userData);
    api.auth.setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    api.auth.setToken(null);
    setUser(null);
  };

  /** Merge fresh fields into the current user (e.g. after a profile edit). */
  const updateUser = (partialUser) => {
    setUser((current) => ({ ...current, ...partialUser }));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
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
