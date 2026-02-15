import bcrypt from "bcrypt";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/game_master";

const SALT_ROUNDS = 10;

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  // 1. Create test user (password: "password123")
  const passwordHash = await bcrypt.hash("password123", SALT_ROUNDS);
  const [user] = await db
    .insert(schema.appUser)
    .values({
      email: "dm@example.com",
      username: "testdm",
      passwordHash,
    })
    .returning();

  // 2. Create test campaign
  const [camp] = await db
    .insert(schema.campaign)
    .values({
      name: "Lost Mines of Phandelver",
      ruleset: "dnd5e",
      ownerId: user.id,
    })
    .returning();

  // 3. Add user as DM in the campaign
  await db.insert(schema.campaignPlayer).values({
    campaignId: camp.id,
    userId: user.id,
    role: "dm",
  });

  // 4. Create a test character
  const [char] = await db
    .insert(schema.character)
    .values({
      campaignId: camp.id,
      userId: user.id,
      name: "Thorin Ironforge",
      data: { class: "fighter", level: 1, hp: 12, maxHp: 12 },
    })
    .returning();

  // 5. Create initial game snapshot (seq 0 — no events yet)
  await db.insert(schema.gameSnapshot).values({
    campaignId: camp.id,
    lastSeq: 0,
    snapshot: {
      campaign_id: camp.id,
      ruleset: "dnd5e",
      mode: "free",
      scene_summary: "The adventure begins...",
      rules_flags: { strictness: "standard" },
    },
  });

  await pool.end();

  console.log("Seed data created:");
  console.log(`  User:      ${user.id} (${user.username})`);
  console.log(`  Campaign:  ${camp.id} (${camp.name})`);
  console.log(`  Character: ${char.id} (${char.name})`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
