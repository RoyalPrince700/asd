import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function boot() {
      if (!getToken()) {
        setReady(true);
        return;
      }
      try {
        const data = await api.me();
        setUser(data.user);
      } catch {
        setToken(null);
        setUser(null);
      } finally {
        setReady(true);
      }
    }
    boot();
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      async refreshUser() {
        if (!getToken()) return null;
        const data = await api.me();
        setUser(data.user);
        return data.user;
      },
      async login(email, password) {
        const data = await api.login(email, password);
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      async register(name, email, password) {
        const data = await api.register(name, email, password);
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      logout() {
        setToken(null);
        setUser(null);
      },
    }),
    [user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
