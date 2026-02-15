"use client";

import type { ConnectionState } from "@/hooks/use-game-socket";
import { cn } from "@/lib/utils";

const stateConfig: Record<
  ConnectionState,
  { label: string; color: string; pulse: boolean }
> = {
  disconnected: { label: "Disconnected", color: "bg-gray-500", pulse: false },
  connecting: { label: "Connecting...", color: "bg-yellow-500", pulse: true },
  authenticating: {
    label: "Authenticating...",
    color: "bg-yellow-500",
    pulse: true,
  },
  joined: { label: "Connected", color: "bg-emerald-500", pulse: false },
  error: { label: "Error", color: "bg-red-500", pulse: false },
};

interface ConnectionIndicatorProps {
  state: ConnectionState;
  onReconnect?: () => void;
}

export function ConnectionIndicator({
  state,
  onReconnect,
}: ConnectionIndicatorProps) {
  const config = stateConfig[state];

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              config.color,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            config.color,
          )}
        />
      </span>
      <span className="text-xs text-gray-400">{config.label}</span>
      {(state === "disconnected" || state === "error") && onReconnect && (
        <button
          onClick={onReconnect}
          className="text-xs text-gold-400 hover:underline"
        >
          Reconnect
        </button>
      )}
    </div>
  );
}
