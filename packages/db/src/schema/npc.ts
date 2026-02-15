import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { campaign } from "./campaign.js";

export const npc = pgTable("npc", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
});
