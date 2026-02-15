import type { GameSnapshot, ServerEvent } from "@game-master/shared";
import type { Pool } from "pg";

export type AppendResult = {
  event: ServerEvent;
  snapshot: GameSnapshot;
};

/**
 * Atomically append a game event and optionally update the campaign snapshot.
 *
 * Uses row-level locking (`SELECT … FOR UPDATE`) to guarantee monotonic seq
 * within a single transaction: lock snapshot → read last_seq → insert event
 * with last_seq + 1 → update snapshot → commit.
 */
export async function appendEvent(
  pool: Pool,
  campaignId: string,
  eventName: string,
  payload: Record<string, unknown>,
  snapshotUpdater?: (current: GameSnapshot) => GameSnapshot,
): Promise<AppendResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the snapshot row for this campaign
    const snapRes = await client.query(
      `SELECT last_seq, snapshot FROM game_snapshot WHERE campaign_id = $1 FOR UPDATE`,
      [campaignId],
    );
    if (snapRes.rowCount === 0) {
      throw new Error(`No snapshot found for campaign ${campaignId}`);
    }

    const lastSeq: number = snapRes.rows[0].last_seq;
    const currentSnapshot: GameSnapshot = snapRes.rows[0].snapshot;
    const nextSeq = lastSeq + 1;

    // Insert the event
    const eventRes = await client.query(
      `INSERT INTO game_event (campaign_id, seq, event_name, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING created_at`,
      [campaignId, nextSeq, eventName, JSON.stringify(payload)],
    );
    const createdAt: Date = eventRes.rows[0].created_at;

    // Update snapshot
    const newSnapshot = snapshotUpdater
      ? snapshotUpdater(currentSnapshot)
      : currentSnapshot;

    await client.query(
      `UPDATE game_snapshot
       SET last_seq = $2, snapshot = $3::jsonb, updated_at = now()
       WHERE campaign_id = $1`,
      [campaignId, nextSeq, JSON.stringify(newSnapshot)],
    );

    await client.query("COMMIT");

    const serverEvent: ServerEvent = {
      seq: nextSeq,
      event_name: eventName as ServerEvent["event_name"],
      payload,
      occurred_at: createdAt.toISOString(),
    };

    return { event: serverEvent, snapshot: newSnapshot };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Read the current snapshot for a campaign.
 */
export async function readSnapshot(
  pool: Pool,
  campaignId: string,
): Promise<{ lastSeq: number; snapshot: GameSnapshot }> {
  const res = await pool.query(
    `SELECT last_seq, snapshot FROM game_snapshot WHERE campaign_id = $1`,
    [campaignId],
  );
  if (res.rowCount === 0) {
    throw new Error(`No snapshot found for campaign ${campaignId}`);
  }
  return {
    lastSeq: res.rows[0].last_seq,
    snapshot: res.rows[0].snapshot,
  };
}

/**
 * Read events after a given seq number for replay on reconnect/join.
 */
export async function readEventsAfter(
  pool: Pool,
  campaignId: string,
  afterSeq: number,
  limit = 500,
): Promise<ServerEvent[]> {
  const res = await pool.query(
    `SELECT seq, event_name, payload, created_at
     FROM game_event
     WHERE campaign_id = $1 AND seq > $2
     ORDER BY seq ASC
     LIMIT $3`,
    [campaignId, afterSeq, limit],
  );
  return res.rows.map((row) => ({
    seq: row.seq,
    event_name: row.event_name,
    payload: row.payload,
    occurred_at: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Ensure a snapshot row exists for a campaign. Creates a default one if missing.
 * Uses `ON CONFLICT` for idempotency.
 */
export async function ensureSnapshot(
  pool: Pool,
  campaignId: string,
  initialSnapshot: GameSnapshot,
): Promise<void> {
  await pool.query(
    `INSERT INTO game_snapshot (campaign_id, last_seq, snapshot)
     VALUES ($1, 0, $2::jsonb)
     ON CONFLICT (campaign_id) DO NOTHING`,
    [campaignId, JSON.stringify(initialSnapshot)],
  );
}
