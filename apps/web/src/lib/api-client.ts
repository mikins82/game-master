// ---------------------------------------------------------------------------
// REST API client — talks to apps/api
// ---------------------------------------------------------------------------

import { getAccessToken } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// ── helpers ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? res.statusText, body);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; username: string };
}

export function register(email: string, username: string, password: string) {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
}

export function login(email: string, password: string) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refreshToken() {
  return request<{ token: string }>("/auth/refresh", {
    method: "POST",
  });
}

// ── Campaigns ────────────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  ownerId: string;
  name: string;
  ruleset: string;
  createdAt: string;
  updatedAt: string;
}

export async function listCampaigns() {
  const res = await request<{ campaigns: Campaign[] }>("/campaigns");
  return res.campaigns;
}

export async function getCampaign(id: string) {
  const res = await request<{ campaign: Campaign; players: unknown[] }>(
    `/campaigns/${id}`,
  );
  return res.campaign;
}

export async function createCampaign(name: string, ruleset: string) {
  const res = await request<{ campaign: Campaign }>("/campaigns", {
    method: "POST",
    body: JSON.stringify({ name, ruleset }),
  });
  return res.campaign;
}

export function joinCampaign(id: string) {
  return request<{ message: string }>(`/campaigns/${id}/join`, {
    method: "POST",
  });
}

// ── Characters ───────────────────────────────────────────────────────────────

export interface Character {
  id: string;
  campaignId: string;
  userId: string;
  name: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export async function listCharacters(campaignId: string) {
  const res = await request<{ characters: Character[] }>(
    `/characters?campaign_id=${campaignId}`,
  );
  return res.characters;
}

export async function createCharacter(
  campaignId: string,
  name: string,
  data: Record<string, unknown> = {},
) {
  const res = await request<{ character: Character }>("/characters", {
    method: "POST",
    body: JSON.stringify({ campaign_id: campaignId, name, data }),
  });
  return res.character;
}

// ── WS Token ─────────────────────────────────────────────────────────────────

export interface WsTokenResponse {
  token: string;
}

export function getWsToken(campaignId: string) {
  return request<WsTokenResponse>("/ws-token", {
    method: "POST",
    body: JSON.stringify({ campaign_id: campaignId }),
  });
}
