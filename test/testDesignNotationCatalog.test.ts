import { describe, expect, it } from "vitest";
import { testDesignNotationCatalog } from "../src/resources/testDesignNotationCatalog.js";
import { registeredToolNames } from "../src/resources/nextToolCatalog.js";
import type { TestDesignNotationTarget } from "../src/types.js";

describe("testDesignNotationCatalog", () => {
  it("記法IDが一意で、3記法（リスト／ダイアグラム／マトリクス）を並列に保持する", () => {
    const ids = testDesignNotationCatalog.notations.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["NTN-FV", "NTN-NGT", "NTN-YMX"]);

    const kinds = testDesignNotationCatalog.notations.map((n) => n.structureKind);
    expect(kinds).toEqual(["list", "diagram", "matrix"]);
  });

  it("各記法が必須要素と出典・注意事項を持つ", () => {
    for (const notation of testDesignNotationCatalog.notations) {
      expect(notation.nameJa.length).toBeGreaterThan(0);
      expect(notation.expresses.length).toBeGreaterThan(0);
      expect(notation.suitableWhen.length).toBeGreaterThan(0);
      expect(notation.caution.length).toBeGreaterThan(0);
      expect(notation.sourceNote.length).toBeGreaterThan(0);
      expect(notation.elements.length).toBeGreaterThanOrEqual(4);
      // 必須要素が1件以上あり、各要素が定義と「未記入だと何を主張できなくなるか」を持つ
      expect(notation.elements.some((e) => e.required)).toBe(true);
      for (const element of notation.elements) {
        expect(element.id.length).toBeGreaterThan(0);
        expect(element.nameJa.length).toBeGreaterThan(0);
        expect(element.definition.length).toBeGreaterThan(0);
        expect(element.emptyMeaning.length).toBeGreaterThan(0);
      }
      const elementIds = notation.elements.map((e) => e.id);
      expect(new Set(elementIds).size).toBe(elementIds.length);
    }
  });

  it("判定区分IDが一意で TDN-01 から連番になっている", () => {
    const ids = testDesignNotationCatalog.auditCategories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      Array.from({ length: ids.length }, (_, i) => `TDN-${String(i + 1).padStart(2, "0")}`)
    );
    expect(ids).toContain("TDN-25");
  });

  it("全判定区分が appliesTo・重大度・説明・対処を持つ", () => {
    const validTargets: TestDesignNotationTarget[] = [
      "fv-table",
      "ngt",
      "yumotsuyo-matrix",
      "cross-notation",
    ];
    for (const category of testDesignNotationCatalog.auditCategories) {
      expect(category.appliesTo.length).toBeGreaterThanOrEqual(1);
      for (const target of category.appliesTo) {
        expect(validTargets).toContain(target);
      }
      expect(["high", "medium", "info"]).toContain(category.severity);
      expect(category.definition.length).toBeGreaterThan(0);
      expect(category.recommendedAction.length).toBeGreaterThan(0);
    }
  });

  it("各記法の auditCategoryIds が実在する判定区分IDのみを指す", () => {
    const known = new Set(testDesignNotationCatalog.auditCategories.map((c) => c.id));
    for (const notation of testDesignNotationCatalog.notations) {
      expect(notation.auditCategoryIds.length).toBeGreaterThan(0);
      for (const id of notation.auditCategoryIds) {
        expect(known.has(id)).toBe(true);
      }
      expect(new Set(notation.auditCategoryIds).size).toBe(notation.auditCategoryIds.length);
    }
  });

  it("全判定区分がいずれかの記法から参照されている", () => {
    const referenced = new Set(
      testDesignNotationCatalog.notations.flatMap((n) => n.auditCategoryIds)
    );
    for (const category of testDesignNotationCatalog.auditCategories) {
      expect(referenced.has(category.id)).toBe(true);
    }
  });

  it("relatedToolNames が本MCPに登録済みのツール名のみを指す", () => {
    for (const notation of testDesignNotationCatalog.notations) {
      expect(notation.relatedToolNames.length).toBeGreaterThan(0);
      for (const toolName of notation.relatedToolNames) {
        expect(registeredToolNames).toContain(toolName);
      }
    }
  });

  it("外部資料の所在（URL）は記載するが逐語転載はしない旨を note で明示する", () => {
    expect(testDesignNotationCatalog.note).toContain("逐語転載");
    for (const notation of testDesignNotationCatalog.notations) {
      expect(notation.sourceNote).toContain("逐語転載ではない");
    }
  });

  it("網羅率・充填率は分母を併記する旨を notes で明示する", () => {
    expect(testDesignNotationCatalog.notes.some((n) => n.includes("分母"))).toBe(true);
  });
});
