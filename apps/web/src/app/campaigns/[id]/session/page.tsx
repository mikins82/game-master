"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ConnectionIndicator } from "@/components/session/connection-indicator";
import { EventStream } from "@/components/session/event-stream";
import { ActionInput } from "@/components/session/action-input";
import { StateSidebar } from "@/components/session/state-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useGameSocket } from "@/hooks/use-game-socket";
import * as api from "@/lib/api-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8082/ws";

export default function SessionPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const characterId = searchParams.get("character") ?? undefined;
  const { userId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [wsToken, setWsToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Fetch WS token on mount
  useEffect(() => {
    if (authLoading || !userId) return;
    api
      .getWsToken(campaignId)
      .then((res) => setWsToken(res.token))
      .catch((err) =>
        setTokenError(err instanceof Error ? err.message : "Failed to get WS token"),
      );
  }, [campaignId, userId, authLoading]);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !userId) router.replace("/login");
  }, [authLoading, userId, router]);

  if (authLoading || !userId) {
    return <LoadingScreen />;
  }

  if (tokenError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-400">{tokenError}</p>
          <button
            onClick={() => router.push(`/campaigns/${campaignId}`)}
            className="mt-4 text-sm text-gold-400 hover:underline"
          >
            Back to campaign
          </button>
        </div>
      </div>
    );
  }

  if (!wsToken) {
    return <LoadingScreen />;
  }

  return (
    <GameSession
      wsToken={wsToken}
      campaignId={campaignId}
      characterId={characterId}
    />
  );
}

// ── Inner session component (only renders when token is ready) ──────────────

function GameSession({
  wsToken,
  campaignId,
  characterId,
}: {
  wsToken: string;
  campaignId: string;
  characterId?: string;
}) {
  const {
    connectionState,
    snapshot,
    events,
    lastSeqSeen,
    sendAction,
    reconnect,
    error,
  } = useGameSocket({
    wsUrl: WS_URL,
    token: wsToken,
    campaignId,
    characterId,
  });

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-surface-600 bg-surface-800 px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-gold-400">Game Master</h1>
          <ConnectionIndicator state={connectionState} onReconnect={reconnect} />
        </div>
        {error && (
          <span className="text-xs text-red-400">{error}</span>
        )}
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Event stream + input */}
        <main className="flex flex-1 flex-col">
          <EventStream events={events} />
          <ActionInput
            onSend={sendAction}
            disabled={connectionState !== "joined"}
          />
        </main>

        {/* State sidebar */}
        <StateSidebar snapshot={snapshot} lastSeq={lastSeqSeen} />
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
    </div>
  );
}
