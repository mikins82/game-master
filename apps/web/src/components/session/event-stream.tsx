"use client";

import type { ServerEvent } from "@game-master/shared";
import { useEffect, useRef } from "react";
import { EventCard } from "./event-card";

interface EventStreamProps {
  events: ServerEvent[];
}

export function EventStream({ events }: EventStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500">
        <p className="text-sm">
          No events yet. Send an action to begin the adventure.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {events.map((event) => (
        <EventCard key={event.seq} event={event} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
