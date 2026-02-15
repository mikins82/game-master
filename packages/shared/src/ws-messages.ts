import { z } from "zod";
import { EventName } from "./enums.js";
import { GameSnapshot } from "./snapshot.js";

// ═══════════════════════════════════════════════════════════════════════════
// Client -> Server Messages
// ═══════════════════════════════════════════════════════════════════════════

export const ClientHello = z.object({
  type: z.literal("client.hello"),
  token: z.string().min(1),
});
export type ClientHello = z.infer<typeof ClientHello>;

export const ClientJoin = z.object({
  type: z.literal("client.join"),
  campaign_id: z.string().uuid(),
  last_seq_seen: z.number().int().nonnegative().optional(),
});
export type ClientJoin = z.infer<typeof ClientJoin>;

export const ClientPlayerAction = z.object({
  type: z.literal("client.player_action"),
  campaign_id: z.string().uuid(),
  client_msg_id: z.string().uuid(),
  text: z.string().min(1),
  character_id: z.string().uuid().optional(),
});
export type ClientPlayerAction = z.infer<typeof ClientPlayerAction>;

export const ClientAck = z.object({
  type: z.literal("client.ack"),
  seq: z.number().int().positive(),
});
export type ClientAck = z.infer<typeof ClientAck>;

export const ClientPing = z.object({
  type: z.literal("client.ping"),
  ts: z.number().optional(),
});
export type ClientPing = z.infer<typeof ClientPing>;

export const ClientMessage = z.discriminatedUnion("type", [
  ClientHello,
  ClientJoin,
  ClientPlayerAction,
  ClientAck,
  ClientPing,
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ═══════════════════════════════════════════════════════════════════════════
// Server -> Client Messages
// ═══════════════════════════════════════════════════════════════════════════

/** A single event within a server.events batch */
export const ServerEvent = z.object({
  seq: z.number().int().positive(),
  event_name: EventName,
  payload: z.record(z.unknown()),
  occurred_at: z.string().datetime(),
});
export type ServerEvent = z.infer<typeof ServerEvent>;

export const ServerHello = z.object({
  type: z.literal("server.hello"),
  user_id: z.string().uuid(),
});
export type ServerHello = z.infer<typeof ServerHello>;

export const ServerJoined = z.object({
  type: z.literal("server.joined"),
  campaign_id: z.string().uuid(),
  snapshot: GameSnapshot,
  events: z.array(ServerEvent),
});
export type ServerJoined = z.infer<typeof ServerJoined>;

export const ServerEvents = z.object({
  type: z.literal("server.events"),
  campaign_id: z.string().uuid(),
  events: z.array(ServerEvent).min(1),
});
export type ServerEvents = z.infer<typeof ServerEvents>;

export const ServerError = z.object({
  type: z.literal("server.error"),
  message: z.string().min(1),
  code: z.string().optional(),
});
export type ServerError = z.infer<typeof ServerError>;

export const ServerPong = z.object({
  type: z.literal("server.pong"),
  ts: z.number().optional(),
});
export type ServerPong = z.infer<typeof ServerPong>;

export const ServerMessage = z.discriminatedUnion("type", [
  ServerHello,
  ServerJoined,
  ServerEvents,
  ServerError,
  ServerPong,
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
