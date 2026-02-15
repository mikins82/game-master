import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { campaign } from "./campaign.js";

export const gameEvent = pgTable(
  "game_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    eventName: text("event_name").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Uniqueness constraint per campaign — also serves as the replay index
    uniqueIndex("game_event_campaign_id_seq_uniq").on(t.campaignId, t.seq),
  ],
);
