import { describe, expect, it } from "vitest";
import {
  basisContradictionCriteria,
  ENTITY_NAME_FRAGMENT_RULES,
  ENTITY_NAME_MIN_LENGTH,
  ENTITY_NAME_SYMBOL_ONLY_PATTERN,
  ENTITY_NAME_TRAILING_REJECT_CHARS,
} from "../src/resources/basisContradictionCriteria.js";

describe("basisContradictionCriteria", () => {
  it("BC-01〜BC-10 の10区分が重複なく定義され、severity が high|medium|info のいずれかである", () => {
    const ids = basisContradictionCriteria.categories.map((c) => c.id);
    const expected = Array.from({ length: 10 }, (_, i) => `BC-${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of basisContradictionCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
      expect(c.nameJa.length).toBeGreaterThan(0);
      expect(c.definition.length).toBeGreaterThan(0);
      expect(c.recommendedAction.length).toBeGreaterThan(0);
    }
  });

  it("notes に『候補0件は矛盾が無いことを意味しない』旨の記載がある", () => {
    expect(basisContradictionCriteria.notes.some((n) => n.includes("候補0件は矛盾が無いことを意味しない"))).toBe(true);
  });

  it("is JSON serializable so it can be exposed as a resource", () => {
    const json = JSON.stringify(basisContradictionCriteria, null, 2);
    expect(JSON.parse(json)).toEqual(basisContradictionCriteria);
  });
});

describe("ENTITY_NAME_FRAGMENT_RULES (NF-01〜NF-04): 名称抽出の抽出品質フィルタ", () => {
  it("NF-01〜NF-04の4件が重複なく定義され、nameJa/definitionが空でない", () => {
    const ids = ENTITY_NAME_FRAGMENT_RULES.map((r) => r.id);
    expect(ids).toEqual(["NF-01", "NF-02", "NF-03", "NF-04"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of ENTITY_NAME_FRAGMENT_RULES) {
      expect(r.nameJa.length).toBeGreaterThan(0);
      expect(r.definition.length).toBeGreaterThan(0);
    }
  });

  it("ENTITY_NAME_MIN_LENGTH は 3", () => {
    expect(ENTITY_NAME_MIN_LENGTH).toBe(3);
  });

  it("ENTITY_NAME_TRAILING_REJECT_CHARS は助詞9語(の/を/に/は/が/で/と/や/へ)をすべて含む", () => {
    for (const particle of ["の", "を", "に", "は", "が", "で", "と", "や", "へ"]) {
      expect(ENTITY_NAME_TRAILING_REJECT_CHARS.has(particle)).toBe(true);
    }
  });

  it("ENTITY_NAME_SYMBOL_ONLY_PATTERN は ~ ～ 〜 に一致し、『予約~購入』には一致しない", () => {
    expect(ENTITY_NAME_SYMBOL_ONLY_PATTERN.test("~")).toBe(true);
    expect(ENTITY_NAME_SYMBOL_ONLY_PATTERN.test("～")).toBe(true);
    expect(ENTITY_NAME_SYMBOL_ONLY_PATTERN.test("〜")).toBe(true);
    expect(ENTITY_NAME_SYMBOL_ONLY_PATTERN.test("予約~購入")).toBe(false);
  });
});
