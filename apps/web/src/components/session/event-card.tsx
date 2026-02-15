"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EventName, ServerEvent } from "@game-master/shared";

// ── event type → visual config ──────────────────────────────────────────────

type BadgeVariant =
  | "default"
  | "gold"
  | "blue"
  | "green"
  | "red"
  | "purple"
  | "teal"
  | "pink";

const eventConfig: Record<
  EventName,
  { label: string; badge: BadgeVariant; accent: string }
> = {
  player_action: {
    label: "Action",
    badge: "green",
    accent: "border-l-emerald-500",
  },
  dm_narration: {
    label: "DM",
    badge: "gold",
    accent: "border-l-gold-400",
  },
  roll_requested: {
    label: "Roll Req",
    badge: "blue",
    accent: "border-l-blue-500",
  },
  roll_result: {
    label: "Roll",
    badge: "blue",
    accent: "border-l-blue-400",
  },
  state_patch_requested: {
    label: "Patch Req",
    badge: "purple",
    accent: "border-l-purple-500",
  },
  state_patch_applied: {
    label: "Patch",
    badge: "purple",
    accent: "border-l-purple-400",
  },
  entity_created: {
    label: "Entity",
    badge: "teal",
    accent: "border-l-teal-500",
  },
  audio_cue: {
    label: "Audio",
    badge: "pink",
    accent: "border-l-pink-500",
  },
  error_note: {
    label: "Error",
    badge: "red",
    accent: "border-l-red-500",
  },
};

// ── Component ───────────────────────────────────────────────────────────────

interface EventCardProps {
  event: ServerEvent;
}

export function EventCard({ event }: EventCardProps) {
  const config = eventConfig[event.event_name] ?? {
    label: event.event_name,
    badge: "default" as BadgeVariant,
    accent: "border-l-gray-500",
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-surface-600 bg-surface-800 px-4 py-3 border-l-4",
        config.accent,
      )}
      data-testid={`event-${event.event_name}`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={config.badge}>{config.label}</Badge>
          <span className="text-xs text-gray-500">#{event.seq}</span>
        </div>
        <time className="text-xs text-gray-500">
          {new Date(event.occurred_at).toLocaleTimeString()}
        </time>
      </div>

      {/* Body — render based on event type */}
      <EventBody eventName={event.event_name} payload={event.payload} />
    </div>
  );
}

// ── Payload renderers ───────────────────────────────────────────────────────

function EventBody({
  eventName,
  payload,
}: {
  eventName: EventName;
  payload: Record<string, unknown>;
}) {
  switch (eventName) {
    case "player_action":
      return (
        <p className="text-sm text-gray-300">
          <span className="font-medium text-emerald-400">Player:</span>{" "}
          {String(payload.text ?? "")}
        </p>
      );

    case "dm_narration":
      return (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
            {String(payload.text ?? "")}
          </p>
          {Array.isArray(payload.options) && payload.options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {payload.options.map((opt: unknown, i: number) => (
                <span
                  key={i}
                  className="rounded-md border border-surface-500 bg-surface-700 px-3 py-1 text-xs text-gray-300"
                >
                  {String(opt)}
                </span>
              ))}
            </div>
          )}
        </div>
      );

    case "roll_result":
      return (
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono text-blue-400">
            {String(payload.formula ?? "")}
          </span>
          <span className="text-gray-400">→</span>
          <span className="text-lg font-bold text-blue-300">
            {String(payload.total ?? "")}
          </span>
          {Array.isArray(payload.rolls) && (
            <span className="text-xs text-gray-500">
              [{payload.rolls.join(", ")}]
            </span>
          )}
        </div>
      );

    case "roll_requested":
      return (
        <p className="text-sm text-gray-400">
          Rolling{" "}
          <span className="font-mono text-blue-400">
            {String(payload.formula ?? "")}
          </span>
          {payload.reason ? ` — ${String(payload.reason)}` : ""}
        </p>
      );

    case "state_patch_applied":
      return (
        <div className="text-sm">
          {Array.isArray(payload.applied) && (
            <p className="text-purple-300">
              {payload.applied.length} patch(es) applied
            </p>
          )}
          {Array.isArray(payload.rejected) &&
            (payload.rejected as Array<{ reason: string }>).length > 0 && (
              <p className="text-red-400">
                {(payload.rejected as unknown[]).length} patch(es) rejected
              </p>
            )}
        </div>
      );

    case "state_patch_requested":
      return (
        <p className="text-sm text-gray-400">
          State patch requested: {String(payload.reason ?? "")}
        </p>
      );

    case "entity_created":
      return (
        <p className="text-sm text-teal-300">
          Created:{" "}
          <span className="font-semibold">{String(payload.name ?? "")}</span>
          <span className="ml-2 text-xs text-gray-500">
            ({String(payload.entity_ref ?? "")})
          </span>
        </p>
      );

    case "audio_cue":
      return (
        <p className="text-sm text-pink-300">
          🔊 {String(payload.cue ?? "")}{" "}
          {payload.intensity ? (
            <span className="text-xs text-gray-500">
              ({String(payload.intensity)})
            </span>
          ) : null}
        </p>
      );

    case "error_note":
      return (
        <p className="text-sm text-red-400">{String(payload.message ?? "")}</p>
      );

    default:
      return (
        <pre className="text-xs text-gray-500">
          {JSON.stringify(payload, null, 2)}
        </pre>
      );
  }
}
