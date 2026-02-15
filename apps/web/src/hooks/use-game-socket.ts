"use client";

import type {
  ClientMessage,
  GameSnapshot,
  ServerEvent,
  ServerMessage,
} from "@game-master/shared";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "joined"
  | "error";

export interface UseGameSocketOptions {
  /** WebSocket server URL (e.g. ws://localhost:4001) */
  wsUrl: string;
  /** Short-lived WS token from POST /api/ws-token */
  token: string;
  /** Campaign to join after auth */
  campaignId: string;
  /** Optional character id to include in actions */
  characterId?: string;
  /** Enable auto-connect (default true) */
  enabled?: boolean;
}

export interface UseGameSocketReturn {
  connectionState: ConnectionState;
  /** Latest snapshot (from server.joined) */
  snapshot: GameSnapshot | null;
  /** All received events, in seq order */
  events: ServerEvent[];
  /** Last seq seen — for reconnect */
  lastSeqSeen: number;
  /** Send a player action */
  sendAction: (text: string) => void;
  /** Force reconnect */
  reconnect: () => void;
  /** Latest error message */
  error: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PING_INTERVAL_MS = 25_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGameSocket(
  options: UseGameSocketOptions,
): UseGameSocketReturn {
  const { wsUrl, token, campaignId, characterId, enabled = true } = options;

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const intentionalCloseRef = useRef(false);

  // ── send helper ──────────────────────────────────────────────────────────

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // ── cleanup ──────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // ── process server messages ──────────────────────────────────────────────

  const handleMessage = useCallback(
    (raw: string) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(raw) as ServerMessage;
      } catch {
        return; // ignore malformed
      }

      switch (msg.type) {
        case "server.hello":
          // Authenticated — now join the campaign
          setConnectionState("authenticating");
          send({
            type: "client.join",
            campaign_id: campaignId,
            last_seq_seen:
              lastSeqRef.current > 0 ? lastSeqRef.current : undefined,
          });
          break;

        case "server.joined":
          setConnectionState("joined");
          setSnapshot(msg.snapshot);
          reconnectAttemptRef.current = 0;
          setError(null);
          if (msg.events.length > 0) {
            setEvents((prev) => {
              const merged = dedupeEvents(prev, msg.events);
              lastSeqRef.current = merged[merged.length - 1]?.seq ?? 0;
              return merged;
            });
            // Ack the highest seq
            const maxSeq = msg.events[msg.events.length - 1]!.seq;
            send({ type: "client.ack", seq: maxSeq });
          }
          break;

        case "server.events":
          setEvents((prev) => {
            const merged = dedupeEvents(prev, msg.events);
            lastSeqRef.current = merged[merged.length - 1]?.seq ?? 0;
            return merged;
          });
          // Ack the batch
          {
            const maxSeq = msg.events[msg.events.length - 1]!.seq;
            send({ type: "client.ack", seq: maxSeq });
          }
          break;

        case "server.error":
          setError(msg.message);
          break;

        case "server.pong":
          // keepalive acknowledged — nothing to do
          break;
      }
    },
    [campaignId, send],
  );

  // ── connect ──────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    cleanup();
    intentionalCloseRef.current = false;
    setConnectionState("connecting");
    setError(null);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState("authenticating");
      send({ type: "client.hello", token });

      // Start ping timer
      pingTimerRef.current = setInterval(() => {
        send({ type: "client.ping", ts: Date.now() });
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (e) => {
      if (typeof e.data === "string") handleMessage(e.data);
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
    };

    ws.onclose = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }

      if (intentionalCloseRef.current) {
        setConnectionState("disconnected");
        return;
      }

      // Auto-reconnect with exponential backoff
      setConnectionState("disconnected");
      const attempt = reconnectAttemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        setError("Max reconnection attempts reached");
        setConnectionState("error");
        return;
      }

      const delay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * 2 ** attempt,
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectAttemptRef.current = attempt + 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [wsUrl, token, cleanup, send, handleMessage]);

  // ── sendAction ───────────────────────────────────────────────────────────

  const sendAction = useCallback(
    (text: string) => {
      send({
        type: "client.player_action",
        campaign_id: campaignId,
        client_msg_id: crypto.randomUUID(),
        text,
        character_id: characterId,
      });
    },
    [campaignId, characterId, send],
  );

  // ── lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    connect();
    return cleanup;
  }, [enabled, connect, cleanup]);

  return {
    connectionState,
    snapshot,
    events,
    lastSeqSeen: lastSeqRef.current,
    sendAction,
    reconnect: connect,
    error,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Merge new events into existing list, deduplicate by seq, sort ascending */
function dedupeEvents(
  existing: ServerEvent[],
  incoming: ServerEvent[],
): ServerEvent[] {
  const map = new Map<number, ServerEvent>();
  for (const e of existing) map.set(e.seq, e);
  for (const e of incoming) map.set(e.seq, e);
  return Array.from(map.values()).sort((a, b) => a.seq - b.seq);
}
