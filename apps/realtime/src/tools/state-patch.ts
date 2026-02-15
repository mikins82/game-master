import type { GameSnapshot, PatchEntry } from "@game-master/shared";
import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PatchValidationResult = {
  applied: PatchEntry[];
  rejected: { patch: PatchEntry; reason: string }[];
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate all patches against the current state.
 * Snapshot patches are validated (dry-run) but NOT applied yet — the actual
 * snapshot mutation happens inside the `appendEvent` transaction.
 * Entity patches (character/npc/location) are applied to their DB rows immediately.
 */
export async function validatePatches(
  pool: Pool,
  campaignId: string,
  currentSnapshot: GameSnapshot,
  patches: PatchEntry[],
): Promise<PatchValidationResult> {
  const applied: PatchEntry[] = [];
  const rejected: { patch: PatchEntry; reason: string }[] = [];

  for (const patch of patches) {
    try {
      if (patch.target === "snapshot") {
        // Dry-run: verify the patch is applicable without mutating
        applyPatchToObject(structuredClone(currentSnapshot), patch);
        applied.push(patch);
      } else {
        // Entity patch — validate + apply to DB
        await applyEntityPatch(pool, campaignId, patch);
        applied.push(patch);
      }
    } catch (err) {
      rejected.push({
        patch,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { applied, rejected };
}

/**
 * Apply validated snapshot patches to a snapshot object.
 * Called inside the appendEvent transaction with the actual current snapshot.
 */
export function applySnapshotPatches(
  snapshot: GameSnapshot,
  patches: PatchEntry[],
): GameSnapshot {
  let result = structuredClone(snapshot);
  for (const patch of patches) {
    if (patch.target === "snapshot") {
      result = applyPatchToObject(result, patch) as GameSnapshot;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Patch application helpers
// ---------------------------------------------------------------------------

function applyPatchToObject(
  obj: Record<string, unknown>,
  patch: PatchEntry,
): Record<string, unknown> {
  const rawPath = patch.path.replace(/^\//, "");
  const path = rawPath === "" ? [] : rawPath.split("/");

  switch (patch.op) {
    case "set":
      setNested(obj, path, patch.value);
      break;

    case "inc": {
      const current = getNested(obj, path);
      if (typeof current !== "number") {
        throw new Error(`Cannot inc non-number at ${patch.path}`);
      }
      if (typeof patch.value !== "number") {
        throw new Error("Inc value must be a number");
      }
      setNested(obj, path, current + (patch.value as number));
      break;
    }

    case "push": {
      const arr = getNested(obj, path);
      if (!Array.isArray(arr)) {
        throw new Error(`Cannot push to non-array at ${patch.path}`);
      }
      arr.push(patch.value);
      break;
    }

    case "remove": {
      if (path.length === 0) throw new Error("Cannot remove root");
      const parentPath = path.slice(0, -1);
      const key = path[path.length - 1];
      const parent = parentPath.length > 0 ? getNested(obj, parentPath) : obj;

      if (Array.isArray(parent)) {
        const idx = parseInt(key, 10);
        if (isNaN(idx)) throw new Error(`Invalid array index: ${key}`);
        parent.splice(idx, 1);
      } else if (typeof parent === "object" && parent !== null) {
        delete (parent as Record<string, unknown>)[key];
      } else {
        throw new Error(`Cannot remove from non-object at ${patch.path}`);
      }
      break;
    }

    default:
      throw new Error(`Unknown patch op: ${patch.op}`);
  }

  return obj;
}

// ---------------------------------------------------------------------------
// Entity patch (character / npc / location)
// ---------------------------------------------------------------------------

async function applyEntityPatch(
  pool: Pool,
  campaignId: string,
  patch: PatchEntry,
): Promise<void> {
  const [entityType, entityId] = patch.target.split(":");
  if (!entityId) throw new Error(`Invalid target: ${patch.target}`);

  const table = entityType; // "character" | "npc" | "location"
  if (!["character", "npc", "location"].includes(table)) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }

  // Read current entity data
  const res = await pool.query(
    `SELECT data FROM "${table}" WHERE id = $1 AND campaign_id = $2`,
    [entityId, campaignId],
  );
  if (res.rowCount === 0) {
    throw new Error(
      `${entityType}:${entityId} not found in campaign ${campaignId}`,
    );
  }

  const data = res.rows[0].data as Record<string, unknown>;
  applyPatchToObject(data, {
    ...patch,
    target: "snapshot" as PatchEntry["target"],
  });

  await pool.query(
    `UPDATE "${table}" SET data = $1::jsonb, updated_at = now() WHERE id = $2 AND campaign_id = $3`,
    [JSON.stringify(data), entityId, campaignId],
  );
}

// ---------------------------------------------------------------------------
// Nested object helpers
// ---------------------------------------------------------------------------

function getNested(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const idx = parseInt(key, 10);
      current = current[idx];
    } else {
      current = (current as Record<string, unknown>)[key];
    }
  }
  return current;
}

function setNested(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (
      current[key] === undefined ||
      current[key] === null ||
      typeof current[key] !== "object"
    ) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = value;
}
