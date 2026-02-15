# Local Dev and Deploy

## Environments

### Local Dev

- Docker services: Postgres (pgvector), Redis.
- Relaxed auth can be used only for local testing.
- Verbose logs enabled.

### Production Baseline

- JWT verification required for websocket connections.
- Internal service endpoints protected (shared secret or mTLS).
- Rate limiting enabled for API, websocket actions, and model calls.
- Structured usage/cost logging enabled.

## Local Bring-Up Checklist

1. Start infra (Postgres + Redis).
2. Run DB migrations.
3. Start `apps/realtime`.
4. Start `apps/api`.
5. Start `apps/llm-orchestrator`.
6. Start `apps/web`.

## Operational Guarantees to Validate in Dev

- Ordered event append and replay.
- Snapshot `last_seq` consistency.
- Gap detection and resync path in client.
- Tool execution authority stays in realtime.

## Deploy Progression

### Phase 1

- Single-node or minimal multi-service deployment.
- Managed Postgres/Redis preferred.

### Phase 2

- Multiple realtime instances behind load balancer.
- Redis pub/sub fan-out for cross-node event broadcast.

### Phase 3

- Autoscaling, deeper observability, and tighter SLO enforcement.

## Security Notes

- Any dev-mode auth bypass must be clearly disabled outside local.
- Never expose internal tool execution endpoints publicly.
- Keep secrets in env management, never hardcoded.
