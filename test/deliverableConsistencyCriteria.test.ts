import { describe, expect, it } from "vitest";
import { deliverableConsistencyCriteria } from "../src/resources/deliverableConsistencyCriteria.js";

describe("deliverableConsistencyCriteria", () => {
  it("DCC-01〜DCC-17 が順序どおり重複なく定義されている", () => {
    const ids = deliverableConsistencyCriteria.categories.map((c) => c.id);
    const expected = Array.from({ length: 17 }, (_, i) => `DCC-${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("各判定区分の severity / nameJa / definition / recommendedAction が妥当である", () => {
    for (const c of deliverableConsistencyCriteria.categories) {
      expect(["high", "medium", "info"], c.id).toContain(c.severity);
      expect(c.nameJa.trim().length, c.id).toBeGreaterThan(0);
      expect(c.definition.trim().length, c.id).toBeGreaterThan(0);
      expect(c.recommendedAction.trim().length, c.id).toBeGreaterThan(0);
    }
  });

  it("共通項目種別が DSI-01〜DSI-06 で、キーワードが1件以上ある", () => {
    const ids = deliverableConsistencyCriteria.sharedItemKinds.map((k) => k.id);
    expect(ids).toEqual(["DSI-01", "DSI-02", "DSI-03", "DSI-04", "DSI-05", "DSI-06"]);
    for (const kind of deliverableConsistencyCriteria.sharedItemKinds) {
      expect(kind.label.trim().length, kind.id).toBeGreaterThan(0);
      expect(kind.headingKeywords.length, kind.id).toBeGreaterThan(0);
      expect(kind.bodyKeywords.length, kind.id).toBeGreaterThan(0);
    }
  });

  it("読了状態語彙に必要な語を含む", () => {
    expect(deliverableConsistencyCriteria.unreadStateWords).toContain("未読");
    expect(deliverableConsistencyCriteria.unreadStateWords).toContain("未読解");
    expect(deliverableConsistencyCriteria.readStateWords).toContain("精読");
  });

  it("notes に決定的層の限界と任意入力未指定の扱いが明記されている", () => {
    const notes = deliverableConsistencyCriteria.notes;
    expect(notes.some((n) => n.includes("候補0件は不整合が無いことを意味しない"))).toBe(true);
    expect(notes.some((n) => n.includes("意味的層"))).toBe(true);
    expect(
      notes.some(
        (n) =>
          n.includes("declaredReferencedDocuments") &&
          n.includes("idPrefixOwners") &&
          n.includes("countClaimSubjects") &&
          n.includes("検査不能")
      )
    ).toBe(true);
  });

  it("notes に網羅率母集団照合の検査不能条件が明記されている", () => {
    const notes = deliverableConsistencyCriteria.notes;
    expect(notes.some((n) => n.includes("母集団") && n.includes("検査不能"))).toBe(true);
  });

  it("countClaimSubjectDefaults の各要素が keyword 非空・idPrefixCandidates 1件以上を持つ", () => {
    const defaults = deliverableConsistencyCriteria.countClaimSubjectDefaults;
    expect(defaults.length).toBeGreaterThan(0);
    for (const d of defaults) {
      expect(d.keyword.trim().length).toBeGreaterThan(0);
      expect(d.idPrefixCandidates.length).toBeGreaterThan(0);
    }
  });

  it("achievementRatioKeywords が網羅率・カバレッジを含む", () => {
    expect(deliverableConsistencyCriteria.achievementRatioKeywords).toContain("網羅率");
    expect(deliverableConsistencyCriteria.achievementRatioKeywords).toContain("カバレッジ");
  });

  it("achievementRatioExclusionWords が目標・閾値を含む", () => {
    expect(deliverableConsistencyCriteria.achievementRatioExclusionWords).toContain("目標");
    expect(deliverableConsistencyCriteria.achievementRatioExclusionWords).toContain("閾値");
  });

  it("JSON として公開可能（stringify → parse で等価）", () => {
    const roundTripped = JSON.parse(JSON.stringify(deliverableConsistencyCriteria));
    expect(roundTripped).toEqual(deliverableConsistencyCriteria);
  });
});
