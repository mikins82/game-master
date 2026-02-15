# Todo

- **PostgreSQL port conflict:** The system has a PostgreSQL 17 instance on port 5432 (installed via `/Library/PostgreSQL/17/`). The Docker pgvector container conflicts with it. Either:
  - Stop the system PG17 when using Docker, or
  - Permanently remap the Docker Compose port to 5433 and set `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/game_master` in `.env`.
