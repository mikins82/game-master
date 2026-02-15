// ---------------------------------------------------------------------------
// Simple in-memory sliding-window rate limiter for the REST API
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

// ---------------------------------------------------------------------------
// Core rate-limiter logic
// ---------------------------------------------------------------------------

interface Window {
  timestamps: number[];
}

export class RateLimiter {
  private windows = new Map<string, Window>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {
    // Periodic cleanup every 60 s
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  /** Returns true if the request is allowed, false if rate-limited. */
  check(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let win = this.windows.get(key);
    if (!win) {
      win = { timestamps: [] };
      this.windows.set(key, win);
    }

    // Drop expired timestamps
    win.timestamps = win.timestamps.filter((t) => t > cutoff);

    if (win.timestamps.length >= this.maxRequests) {
      return false;
    }

    win.timestamps.push(now);
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [key, win] of this.windows) {
      win.timestamps = win.timestamps.filter((t) => t > cutoff);
      if (win.timestamps.length === 0) {
        this.windows.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.windows.clear();
  }
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

const globalLimiter = new RateLimiter(100, 60_000); // 100 req / min
const authLimiter = new RateLimiter(10, 60_000); // 10 req / min

async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  app.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ip = request.ip;

      // Tighter limit on auth endpoints
      const isAuth = request.url.startsWith("/api/auth");
      const limiter = isAuth ? authLimiter : globalLimiter;

      if (!limiter.check(ip)) {
        return reply.status(429).send({
          error: "Too Many Requests",
          retryAfter: 60,
        });
      }
    },
  );

  app.addHook("onClose", async () => {
    globalLimiter.destroy();
    authLimiter.destroy();
  });
}

export default fp(rateLimitPlugin, { name: "rate-limit" });
