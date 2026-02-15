import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { campaign } from "./campaign.js";

export const campaignSummary = pgTable("campaign_summary", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  fromSeq: integer("from_seq").notNull(),
  toSeq: integer("to_seq").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
