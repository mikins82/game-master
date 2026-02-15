import { describe, expect, it } from "vitest";
import { parseFormula, rollDice } from "../tools/dice.js";

// ---------------------------------------------------------------------------
// parseFormula
// ---------------------------------------------------------------------------

describe("parseFormula", () => {
  it("parses simple formula like 1d20", () => {
    const result = parseFormula("1d20");
    expect(result).toEqual({ count: 1, sides: 20, modifier: 0 });
  });

  it("parses formula with positive modifier", () => {
    const result = parseFormula("2d6+3");
    expect(result).toEqual({ count: 2, sides: 6, modifier: 3 });
  });

  it("parses formula with negative modifier", () => {
    const result = parseFormula("3d8-2");
    expect(result).toEqual({ count: 3, sides: 8, modifier: -2 });
  });

  it("handles whitespace", () => {
    const result = parseFormula("  1d20+5  ");
    expect(result).toEqual({ count: 1, sides: 20, modifier: 5 });
  });

  it("is case insensitive", () => {
    const result = parseFormula("1D20");
    expect(result).toEqual({ count: 1, sides: 20, modifier: 0 });
  });

  it("rejects invalid formula", () => {
    expect(() => parseFormula("abc")).toThrow("Invalid dice formula");
    expect(() => parseFormula("d20")).toThrow("Invalid dice formula");
    expect(() => parseFormula("1d")).toThrow("Invalid dice formula");
    expect(() => parseFormula("")).toThrow("Invalid dice formula");
  });

  it("rejects count out of range", () => {
    expect(() => parseFormula("0d20")).toThrow("Dice count must be");
    expect(() => parseFormula("101d20")).toThrow("Dice count must be");
  });

  it("rejects sides out of range", () => {
    expect(() => parseFormula("1d1")).toThrow("Dice sides must be");
    expect(() => parseFormula("1d101")).toThrow("Dice sides must be");
  });
});

// ---------------------------------------------------------------------------
// rollDice
// ---------------------------------------------------------------------------

describe("rollDice", () => {
  it("returns correct number of rolls", () => {
    const result = rollDice("3d6");
    expect(result.rolls).toHaveLength(3);
  });

  it("all rolls are within valid range", () => {
    for (let i = 0; i < 50; i++) {
      const result = rollDice("2d6+3");
      for (const roll of result.rolls) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      }
    }
  });

  it("total equals sum of rolls plus modifier", () => {
    const result = rollDice("2d6+3");
    const sum = result.rolls.reduce((a, b) => a + b, 0);
    expect(result.total).toBe(sum + 3);
  });

  it("total with negative modifier", () => {
    const result = rollDice("1d20-2");
    const sum = result.rolls.reduce((a, b) => a + b, 0);
    expect(result.total).toBe(sum - 2);
  });

  it("total without modifier", () => {
    const result = rollDice("4d6");
    const sum = result.rolls.reduce((a, b) => a + b, 0);
    expect(result.total).toBe(sum);
    expect(result.modifier).toBe(0);
  });

  it("returns the formula in the result", () => {
    const result = rollDice("1d20+5");
    expect(result.formula).toBe("1d20+5");
  });

  it("produces an HMAC signature", () => {
    const result = rollDice("1d20");
    expect(result.signed).toBeTruthy();
    expect(result.signed).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("different rolls produce different signatures", () => {
    // Run enough times that at least two should differ in rolls
    const signatures = new Set<string>();
    for (let i = 0; i < 20; i++) {
      signatures.add(rollDice("1d20").signed);
    }
    // Signatures include a timestamp, so even identical rolls differ
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("rejects invalid formula", () => {
    expect(() => rollDice("not-a-formula")).toThrow("Invalid dice formula");
  });
});
