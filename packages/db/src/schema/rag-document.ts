import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { campaign } from "./campaign.js";

export const ragDocument = pgTable("rag_document", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").references(() => campaign.id, {
    onDelete: "set null",
  }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  status: text("status").notNull().default("pending"),
  meta: jsonb("meta").default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
});
