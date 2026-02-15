import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import 'dotenv/config';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/game_master';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Ensure pgvector extension exists before running schema migrations
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });

  await pool.end();
  console.log('Migrations complete');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
