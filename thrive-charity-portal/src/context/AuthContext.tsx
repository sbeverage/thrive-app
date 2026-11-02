import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getStoredToken, getStoredUser, clearSession, signIn, signUp } from '../lib/auth';
import type { AuthUser } from '../lib/auth';

interface AuthShape {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (p: { email: string; password: string; firstName: string; lastName?: string }) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthShape | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Trust the stored token until a request proves otherwise. api.ts clears
    // the session on any 401, so a stale token self-corrects on first use
    // rather than blocking the first paint on a round trip.
    if (getStoredToken()) setUser(getStoredUser());
    setLoading(false);
  }, []);

  const value = useMemo<AuthShape>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const { user: u } = await signIn({ email, password });
        setUser(u);
      },
      register: async (p) => {
        const { user: u } = await signUp(p);
        setUser(u);
      },
      logout: () => {
        clearSession();
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useAuth(): AuthShape {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
