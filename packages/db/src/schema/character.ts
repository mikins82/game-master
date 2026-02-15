import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appUser } from "./app-user.js";
import { campaign } from "./campaign.js";

export const character = pgTable("character", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
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
