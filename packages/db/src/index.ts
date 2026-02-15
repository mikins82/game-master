// ---------------------------------------------------------------------------
// @game-master/db — barrel export
// ---------------------------------------------------------------------------

// Schema tables
export {
  appUser,
  campaign,
  campaignPlayer,
  campaignSummary,
  character,
  gameEvent,
  gameSnapshot,
  location,
  npc,
  ragChunk,
  ragDocument,
} from "./schema/index.js";

// Client factory + types
export { createDb, type Database } from "./client.js";
