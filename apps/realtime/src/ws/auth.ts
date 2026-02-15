import * as jose from "jose";
import { env } from "../env.js";

export type AuthPayload = {
  userId: string;
};

/**
 * Verify a WebSocket authentication token.
 *
 * - Dev mode: accepts `dev:<user_id>` tokens or returns a default dev user.
 * - Production mode: verifies a JWT signed with JWT_SECRET.
 */
export async function verifyWsToken(token: string): Promise<AuthPayload> {
  if (env.AUTH_MODE === "dev") {
    if (token.startsWith("dev:")) {
      return { userId: token.slice(4) };
    }
    // Accept any non-empty token in dev mode
    return { userId: "00000000-0000-0000-0000-000000000001" };
  }

  // Production: verify JWT
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const { payload } = await jose.jwtVerify(token, secret);

  if (!payload.sub) {
    throw new Error("Missing sub claim in JWT");
  }

  return { userId: payload.sub };
}
