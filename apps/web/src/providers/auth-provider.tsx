"use client";

import * as api from "@/lib/api-client";
import { clearTokens, getAccessToken, getUserId, setTokens } from "@/lib/auth";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface AuthContextValue {
  /** Current user ID (null when logged out) */
  userId: string | null;
  /** True while we check localStorage on mount */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from localStorage
  useEffect(() => {
    const token = getAccessToken();
    const uid = getUserId();
    if (token && uid) setUserId(uid);
    setLoading(false);
  }, []);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setTokens(res.token, res.user.id);
    setUserId(res.user.id);
  }, []);

  const handleRegister = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await api.register(email, username, password);
      setTokens(res.token, res.user.id);
      setUserId(res.user.id);
    },
    [],
  );

  const handleLogout = useCallback(() => {
    clearTokens();
    setUserId(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      userId,
      loading,
      login: handleLogin,
      register: handleRegister,
      logout: handleLogout,
    }),
    [userId, loading, handleLogin, handleRegister, handleLogout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
