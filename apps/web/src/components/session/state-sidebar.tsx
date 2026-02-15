"use client";

import { Badge } from "@/components/ui/badge";
import type { GameSnapshot } from "@game-master/shared";

interface StateSidebarProps {
  snapshot: GameSnapshot | null;
  lastSeq: number;
}

export function StateSidebar({ snapshot, lastSeq }: StateSidebarProps) {
  if (!snapshot) {
    return (
      <aside className="w-72 shrink-0 border-l border-surface-600 bg-surface-800 p-4">
        <p className="text-sm text-gray-500">Waiting for game state...</p>
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-surface-600 bg-surface-800 p-4">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-400">
        Game State
      </h2>

      <div className="space-y-4">
        {/* Mode */}
        <Section title="Mode">
          <Badge variant={snapshot.mode === "combat" ? "red" : "green"}>
            {snapshot.mode.toUpperCase()}
          </Badge>
        </Section>

        {/* Ruleset */}
        <Section title="Ruleset">
          <span className="text-sm text-gray-200">{snapshot.ruleset}</span>
        </Section>

        {/* Location */}
        {snapshot.location_ref && (
          <Section title="Location">
            <span className="text-sm text-gray-200">
              {snapshot.location_ref}
            </span>
          </Section>
        )}

        {/* Scene Summary */}
        {snapshot.scene_summary && (
          <Section title="Scene">
            <p className="text-sm leading-relaxed text-gray-300">
              {snapshot.scene_summary}
            </p>
          </Section>
        )}

        {/* Turn State (combat) */}
        {snapshot.turn_state && (
          <Section title="Turn">
            <div className="space-y-1 text-sm text-gray-300">
              <p>Round: {snapshot.turn_state.round}</p>
              {snapshot.turn_state.active_entity_ref && (
                <p>
                  Active:{" "}
                  <span className="text-gold-400">
                    {snapshot.turn_state.active_entity_ref}
                  </span>
                </p>
              )}
              {snapshot.turn_state.initiative_order &&
                snapshot.turn_state.initiative_order.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-400">Initiative:</p>
                    <ol className="ml-4 list-decimal text-xs text-gray-400">
                      {snapshot.turn_state.initiative_order.map((ref, i) => (
                        <li
                          key={i}
                          className={
                            ref === snapshot.turn_state?.active_entity_ref
                              ? "text-gold-400"
                              : ""
                          }
                        >
                          {ref}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
            </div>
          </Section>
        )}

        {/* Rules Flags */}
        <Section title="Rules">
          <Badge variant="default">{snapshot.rules_flags.strictness}</Badge>
        </Section>

        {/* Seq counter */}
        <Section title="Events">
          <span className="font-mono text-xs text-gray-500">
            last_seq: {lastSeq}
          </span>
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h3>
      {children}
    </div>
  );
}
