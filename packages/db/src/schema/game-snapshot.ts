import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { campaign } from "./campaign.js";

export const gameSnapshot = pgTable(
  "game_snapshot",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    lastSeq: integer("last_seq").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    // One snapshot per campaign
    uniqueIndex("game_snapshot_campaign_id_uniq").on(t.campaignId),
  ],
);
