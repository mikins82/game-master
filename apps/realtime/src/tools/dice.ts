import { createHmac, randomInt } from "node:crypto";
import { env } from "../env.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedFormula = {
  count: number;
  sides: number;
  modifier: number;
};

export type DiceRollResult = {
  formula: string;
  rolls: number[];
  modifier: number;
  total: number;
  signed: string;
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a dice formula string into its component parts.
 *
 * Supported formats:
 *   "1d20", "2d6+3", "3d8-2", "1d20+5", "4d6"
 */
export function parseFormula(formula: string): ParsedFormula {
  const match = formula.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) {
    throw new Error(`Invalid dice formula: "${formula}"`);
  }

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  if (count < 1 || count > 100) {
    throw new Error("Dice count must be between 1 and 100");
  }
  if (sides < 2 || sides > 100) {
    throw new Error("Dice sides must be between 2 and 100");
  }

  return { count, sides, modifier };
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

/**
 * Roll dice using server-side cryptographic RNG.
 * Returns individual rolls, total (with modifier), and an HMAC signature.
 */
export function rollDice(formula: string): DiceRollResult {
  const { count, sides, modifier } = parseFormula(formula);

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    // randomInt(min, max) — min is inclusive, max is exclusive
    rolls.push(randomInt(1, sides + 1));
  }

  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + modifier;

  const signed = signRoll(formula, rolls, total);

  return { formula, rolls, modifier, total, signed };
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Create an HMAC-SHA256 signature for a roll result.
 * Includes a timestamp to prevent replay.
 */
function signRoll(formula: string, rolls: number[], total: number): string {
  const data = JSON.stringify({ formula, rolls, total, ts: Date.now() });
  return createHmac("sha256", env.DICE_SIGNING_SECRET)
    .update(data)
    .digest("hex");
}
