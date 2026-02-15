import { EventCard } from "@/components/session/event-card";
import type { EventName, ServerEvent } from "@game-master/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function makeEvent(
  eventName: EventName,
  payload: Record<string, unknown>,
  seq = 1,
): ServerEvent {
  return {
    seq,
    event_name: eventName,
    payload,
    occurred_at: "2025-01-15T12:00:00Z",
  };
}

describe("EventCard", () => {
  it("renders dm_narration with text", () => {
    const event = makeEvent("dm_narration", {
      text: "You enter a dimly lit tavern.",
    });
    render(<EventCard event={event} />);
    expect(
      screen.getByText("You enter a dimly lit tavern."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("event-dm_narration")).toBeInTheDocument();
  });

  it("renders dm_narration with options", () => {
    const event = makeEvent("dm_narration", {
      text: "What do you do?",
      options: ["Talk to bartender", "Sit down", "Leave"],
    });
    render(<EventCard event={event} />);
    expect(screen.getByText("Talk to bartender")).toBeInTheDocument();
    expect(screen.getByText("Sit down")).toBeInTheDocument();
    expect(screen.getByText("Leave")).toBeInTheDocument();
  });

  it("renders roll_result with formula and total", () => {
    const event = makeEvent("roll_result", {
      request_id: "00000000-0000-0000-0000-000000000001",
      formula: "1d20+5",
      rolls: [14],
      total: 19,
      signed: "sig123",
    });
    render(<EventCard event={event} />);
    expect(screen.getByText("1d20+5")).toBeInTheDocument();
    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getByText("[14]")).toBeInTheDocument();
  });

  it("renders player_action", () => {
    const event = makeEvent("player_action", {
      user_id: "00000000-0000-0000-0000-000000000002",
      client_msg_id: "00000000-0000-0000-0000-000000000003",
      text: "I kick the door open",
    });
    render(<EventCard event={event} />);
    expect(screen.getByText(/I kick the door open/)).toBeInTheDocument();
  });

  it("renders state_patch_applied", () => {
    const event = makeEvent("state_patch_applied", {
      request_id: "00000000-0000-0000-0000-000000000004",
      applied: [
        {
          op: "set",
          target: "character:abc",
          path: "/resources/hp_current",
          value: 15,
        },
      ],
      rejected: [],
    });
    render(<EventCard event={event} />);
    expect(screen.getByText("1 patch(es) applied")).toBeInTheDocument();
  });

  it("renders entity_created", () => {
    const event = makeEvent("entity_created", {
      entity_ref: "npc:00000000-0000-0000-0000-000000000005",
      name: "Gundren Rockseeker",
      data: { role: "quest_giver" },
    });
    render(<EventCard event={event} />);
    expect(screen.getByText("Gundren Rockseeker")).toBeInTheDocument();
  });

  it("renders audio_cue", () => {
    const event = makeEvent("audio_cue", {
      cue: "tavern_ambience",
      intensity: "mid",
    });
    render(<EventCard event={event} />);
    expect(screen.getByText(/tavern_ambience/)).toBeInTheDocument();
  });

  it("renders error_note", () => {
    const event = makeEvent("error_note", {
      message: "Something went wrong",
    });
    render(<EventCard event={event} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders roll_requested", () => {
    const event = makeEvent("roll_requested", {
      request_id: "00000000-0000-0000-0000-000000000006",
      formula: "2d6+3",
      reason: "Damage roll",
    });
    render(<EventCard event={event} />);
    expect(screen.getByText("2d6+3")).toBeInTheDocument();
    expect(screen.getByText(/Damage roll/)).toBeInTheDocument();
  });

  it("renders state_patch_requested", () => {
    const event = makeEvent("state_patch_requested", {
      request_id: "00000000-0000-0000-0000-000000000007",
      reason: "Apply fire damage",
      patches: [{ op: "inc", target: "npc:abc", path: "/data/hp", value: -5 }],
    });
    render(<EventCard event={event} />);
    expect(screen.getByText(/Apply fire damage/)).toBeInTheDocument();
  });

  it("shows seq number for each event", () => {
    const event = makeEvent("dm_narration", { text: "Hello" }, 42);
    render(<EventCard event={event} />);
    expect(screen.getByText("#42")).toBeInTheDocument();
  });
});
