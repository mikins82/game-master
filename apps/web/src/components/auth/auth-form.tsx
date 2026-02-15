"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const { login, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isLogin = mode === "login";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, username, password);
      }
      router.push("/campaigns");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <h1 className="text-2xl font-bold text-gray-100">
          {isLogin ? "Welcome Back" : "Create Account"}
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          {isLogin
            ? "Sign in to continue your adventure"
            : "Begin your journey as a Game Master"}
        </p>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="adventurer@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          {!isLogin && (
            <Input
              id="username"
              label="Username"
              type="text"
              placeholder="Choose a username"
              required
              minLength={3}
              maxLength={50}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          )}

          <Input
            id="password"
            label="Password"
            type="password"
            placeholder="Enter your password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
        </CardContent>

        <CardFooter className="flex-col gap-3">
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
          </Button>

          <p className="text-sm text-gray-400">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="text-gold-400 hover:underline"
            >
              {isLogin ? "Register" : "Sign In"}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
