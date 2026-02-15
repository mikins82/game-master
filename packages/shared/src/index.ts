// ---------------------------------------------------------------------------
// @game-master/shared — barrel export
// ---------------------------------------------------------------------------

// Enums
export {
  ClientMessageType,
  EntityType,
  EventName,
  GameMode,
  Intensity,
  PatchOp,
  ServerMessageType,
  ToolName,
} from "./enums.js";

// Tool schemas + shared references
export {
  ActorRef,
  ApplyStatePatchTool,
  CreateEntityTool,
  EntityRef,
  PatchEntry,
  PatchTarget,
  RagSearchTool,
  RollTool,
  ToolCall,
  TriggerAudioTool,
} from "./tools.js";

// Event payload schemas
export {
  AudioCuePayload,
  DmNarrationPayload,
  EntityCreatedPayload,
  ErrorNotePayload,
  GameEventPayload,
  PlayerActionPayload,
  RollRequestedPayload,
  RollResultPayload,
  StatePatchAppliedPayload,
  StatePatchRequestedPayload,
} from "./events.js";

// Snapshot
export { GameSnapshot, RulesFlags, TurnState } from "./snapshot.js";

// WebSocket messages — Client
export {
  ClientAck,
  ClientHello,
  ClientJoin,
  ClientMessage,
  ClientPing,
  ClientPlayerAction,
} from "./ws-messages.js";

// WebSocket messages — Server
export {
  ServerError,
  ServerEvent,
  ServerEvents,
  ServerHello,
  ServerJoined,
  ServerMessage,
  ServerPong,
} from "./ws-messages.js";
