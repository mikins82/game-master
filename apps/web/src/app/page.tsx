"use client";

import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Landing page — redirects to /campaigns (logged in) or /login (logged out) */
export default function HomePage() {
  const { userId, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(userId ? "/campaigns" : "/login");
  }, [userId, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
    </div>
  );
}
