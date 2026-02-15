import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { appUser } from "./app-user.js";
import { campaign } from "./campaign.js";

export const campaignPlayer = pgTable(
  "campaign_player",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("player"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("campaign_player_campaign_id_user_id_uniq").on(
      t.campaignId,
      t.userId,
    ),
  ],
);
