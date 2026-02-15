"use client";

import type { AuthContextValue } from "@/providers/auth-provider";
import { AuthContext } from "@/providers/auth-provider";
import { useContext } from "react";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
