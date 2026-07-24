import { describe, expect, it } from "vitest";
import { jstqbGlossary } from "../src/resources/jstqbGlossary.js";

describe("jstqbGlossary", () => {
  it("has unique term ids", () => {
    const ids = jstqbGlossary.terms.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-empty nameJa, nameEn, definition for every term", () => {
    for (const term of jstqbGlossary.terms) {
      expect(term.nameJa.trim().length).toBeGreaterThan(0);
      expect(term.nameEn.trim().length).toBeGreaterThan(0);
      expect(term.definition.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses only allowed category values", () => {
    const allowed = new Set([
      "test-level",
      "test-type",
      "criteria",
      "test-condition",
      "test-perspective",
      "review-type",
    ]);
    for (const term of jstqbGlossary.terms) {
      expect(allowed.has(term.category)).toBe(true);
    }
  });

  it("defines exactly 4 test-level terms", () => {
    const ids = jstqbGlossary.terms
      .filter((t) => t.category === "test-level")
      .map((t) => t.id)
      .sort();
    expect(ids).toEqual(
      ["acceptance-testing", "component-testing", "integration-testing", "system-testing"].sort()
    );
  });

  it("defines exactly 4 review-type terms", () => {
    const ids = jstqbGlossary.terms
      .filter((t) => t.category === "review-type")
      .map((t) => t.id)
      .sort();
    expect(ids).toEqual(
      ["informal-review", "inspection", "technical-review", "walkthrough"].sort()
    );
  });
});
