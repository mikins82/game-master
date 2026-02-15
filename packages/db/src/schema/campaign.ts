import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appUser } from "./app-user.js";

export const campaign = pgTable("campaign", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  ruleset: text("ruleset").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
});
