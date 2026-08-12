import { describe, expect, it } from "vitest";
import {
  MAX_PRIORITIZED_FINDING_ROWS,
  UNRESOLVED_SECTION_LABEL,
  distinctInOrder,
  formatFindingPriorityBasis,
  isSectionResolved,
  rankFindingPriorities,
  renderFindingPriorityLegendLine,
  renderSeverityDivergenceLine,
  scoreFindingPriority,
  type FindingPriorityInput,
  type FindingPrioritySeverity,
} from "../src/findingPriority.js";
import { extractIdOccurrences } from "../src/testBasisAnalysis.js";

// --- 配点表の独立再宣言（src から import しない。二重管理を検査で固定する） ---

const EXPECTED_SEVERITY_POINTS: Record<FindingPrioritySeverity, number> = {
  high: 30,
  medium: 15,
  low: 5,
  info: 0,
};

function expectedImpactedIdPoints(n: number): number {
  if (n === 0) return 0;
  if (n === 1) return 2;
  if (n === 2) return 4;
  if (n <= 4) return 6;
  if (n <= 9) return 8;
  return 10;
}

function expectedCrossDocumentPoints(d: number): number {
  if (d <= 1) return 0;
  if (d === 2) return 6;
  if (d === 3) return 8;
  return 10;
}

function expectedSectionPoints(resolved: boolean): number {
  return resolved ? 5 : 0;
}

const SEVERITIES: FindingPrioritySeverity[] = ["high", "medium", "low", "info"];
const ID_COUNTS = [0, 1, 2, 3, 4, 5, 9, 10, 25];
const DOC_COUNTS = [0, 1, 2, 3, 4, 7];

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `REQ-${String(i + 1).padStart(3, "0")}`);
}
function docs(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `doc${String(i + 1).padStart(2, "0")}.md`);
}

interface Combo {
  severity: FindingPrioritySeverity;
  idCount: number;
  docCount: number;
  sectionResolved: boolean;
}

const ALL_COMBOS: Combo[] = [];
for (const severity of SEVERITIES) {
  for (const idCount of ID_COUNTS) {
    for (const docCount of DOC_COUNTS) {
      for (const sectionResolved of [true, false]) {
        ALL_COMBOS.push({ severity, idCount, docCount, sectionResolved });
      }
    }
  }
}

function factorsOf(c: Combo) {
  return {
    severity: c.severity,
    impactedIds: ids(c.idCount),
    documents: docs(c.docCount),
    sectionResolved: c.sectionResolved,
  };
}

function expectedScore(c: Combo): number {
  return (
    EXPECTED_SEVERITY_POINTS[c.severity] +
    expectedImpactedIdPoints(c.idCount) +
    expectedCrossDocumentPoints(c.docCount) +
    expectedSectionPoints(c.sectionResolved)
  );
}

describe("scoreFindingPriority - 配点表の独立再計算", () => {
  it("組合せ数が 4 × 9 × 6 × 2 = 432 である", () => {
    expect(ALL_COMBOS.length).toBe(432);
  });

  it("全432ケースで points 各項と score 総和がテスト側の再計算と一致する", () => {
    for (const c of ALL_COMBOS) {
      const { points, score } = scoreFindingPriority(factorsOf(c));
      expect(points.severity).toBe(EXPECTED_SEVERITY_POINTS[c.severity]);
      expect(points.impactedId).toBe(expectedImpactedIdPoints(c.idCount));
      expect(points.crossDocument).toBe(expectedCrossDocumentPoints(c.docCount));
      expect(points.sectionResolved).toBe(expectedSectionPoints(c.sectionResolved));
      expect(score).toBe(
        points.severity + points.impactedId + points.crossDocument + points.sectionResolved
      );
      expect(score).toBe(expectedScore(c));
      expect(score).toBeLessThanOrEqual(55);
    }
  });

  it("最大点は 55（high + 影響ID10件以上 + 4文書以上 + 章節解決）", () => {
    const max = Math.max(...ALL_COMBOS.map((c) => scoreFindingPriority(factorsOf(c)).score));
    expect(max).toBe(55);
  });
});

describe("scoreFindingPriority - 帯境界", () => {
  function bandOfScore(score: number): string {
    // score をちょうど作れる因子を選ぶ: severity 点 + 影響ID点 で調整する
    const combo = ALL_COMBOS.find((c) => expectedScore(c) === score);
    expect(combo, `score=${score} を作れる組合せが必要`).toBeDefined();
    return scoreFindingPriority(factorsOf(combo!)).band;
  }

  it("39/40 が P2/P1、29/30 が P3/P2、19/20 が P4/P3 に分かれる", () => {
    expect(bandOfScore(39)).toBe("P2");
    expect(bandOfScore(40)).toBe("P1");
    expect(bandOfScore(29)).toBe("P3");
    expect(bandOfScore(30)).toBe("P2");
    expect(bandOfScore(19)).toBe("P4");
    expect(bandOfScore(20)).toBe("P3");
  });
});

function inputOf(id: string, c: Combo): FindingPriorityInput {
  return { id, categoryId: "TEST", place: "doc01.md:1 見出し", ...factorsOf(c) };
}

describe("rankFindingPriorities - 不変条件", () => {
  it("不変条件1: low の最大スコア(30) ≦ high の最小スコア(30) で、low が high より前に来る入力は存在しない", () => {
    const lowScores = ALL_COMBOS.filter((c) => c.severity === "low").map(expectedScore);
    const highScores = ALL_COMBOS.filter((c) => c.severity === "high").map(expectedScore);
    expect(Math.max(...lowScores)).toBe(30);
    expect(Math.min(...highScores)).toBe(30);
    expect(Math.max(...lowScores)).toBeLessThanOrEqual(Math.min(...highScores));

    const lowCombos = ALL_COMBOS.filter((c) => c.severity === "low");
    const highCombos = ALL_COMBOS.filter((c) => c.severity === "high");
    for (const low of lowCombos) {
      for (const high of highCombos) {
        // low を先に入力しても（同点なら severity tie-break で）high が先に来る
        const ranked = rankFindingPriorities([inputOf("LOW", low), inputOf("HIGH", high)]);
        expect(ranked[0].id).toBe("HIGH");
      }
    }
  });

  it("不変条件2: medium+影響ID10件+4文書+章節解決(=40) が high+影響ID0件+1文書+章節未解決(=30) より前に来る", () => {
    const mediumStrong: Combo = {
      severity: "medium",
      idCount: 10,
      docCount: 4,
      sectionResolved: true,
    };
    const highWeak: Combo = { severity: "high", idCount: 0, docCount: 1, sectionResolved: false };
    expect(expectedScore(mediumStrong)).toBe(40);
    expect(expectedScore(highWeak)).toBe(30);
    const ranked = rankFindingPriorities([inputOf("HIGH", highWeak), inputOf("MED", mediumStrong)]);
    expect(ranked[0].id).toBe("MED");
    expect(ranked[0].band).toBe("P1");
    expect(ranked[1].band).toBe("P2");
  });

  it("同一因子値どうしは severity 降順、完全同値は入力順を保ち、rank は1始まり連番になる", () => {
    const base = { idCount: 2, docCount: 2, sectionResolved: true };
    const inputs: FindingPriorityInput[] = [
      inputOf("A-info", { severity: "info", ...base }),
      inputOf("B-low", { severity: "low", ...base }),
      inputOf("C-high-1", { severity: "high", ...base }),
      inputOf("D-high-2", { severity: "high", ...base }),
      inputOf("E-medium", { severity: "medium", ...base }),
    ];
    const ranked = rankFindingPriorities(inputs);
    expect(ranked.map((r) => r.id)).toEqual([
      "C-high-1",
      "D-high-2",
      "E-medium",
      "B-low",
      "A-info",
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("完全同値（severity も因子も同一）は入力順を保つ", () => {
    const c: Combo = { severity: "medium", idCount: 1, docCount: 1, sectionResolved: false };
    const ranked = rankFindingPriorities([
      inputOf("X1", c),
      inputOf("X2", c),
      inputOf("X3", c),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["X1", "X2", "X3"]);
  });
});

describe("formatFindingPriorityBasis", () => {
  const many: Combo = { severity: "high", idCount: 5, docCount: 4, sectionResolved: true };

  it("既定で最大3件＋ほかN件、maxNames: Infinity で全件を出す", () => {
    const [r] = rankFindingPriorities([inputOf("F-01", many)]);
    const short = formatFindingPriorityBasis(r);
    expect(short).toContain("影響ID5件(REQ-001, REQ-002, REQ-003, ほか2件)=8");
    expect(short).toContain("文書4件(doc01.md, doc02.md, doc03.md, ほか1件)=10");
    expect(short).toContain("severity=high(30)");
    expect(short).toContain("章節解決=済(5)");

    const full = formatFindingPriorityBasis(r, { maxNames: Infinity });
    expect(full).toContain("影響ID5件(REQ-001, REQ-002, REQ-003, REQ-004, REQ-005)=8");
    expect(full).toContain("文書4件(doc01.md, doc02.md, doc03.md, doc04.md)=10");
    expect(full).not.toContain("ほか");
  });

  it("影響ID0件は「影響ID0件(-)=0」、章節未解決は「章節解決=未(0)」になる", () => {
    const [r] = rankFindingPriorities([
      inputOf("F-02", { severity: "low", idCount: 0, docCount: 0, sectionResolved: false }),
    ]);
    const basis = formatFindingPriorityBasis(r);
    expect(basis).toContain("影響ID0件(-)=0");
    expect(basis).toContain("文書0件(-)=0");
    expect(basis).toContain("章節解決=未(0)");
  });
});

describe("renderSeverityDivergenceLine", () => {
  it("逆転が0組なら undefined を返す", () => {
    const ranked = rankFindingPriorities([
      inputOf("H", { severity: "high", idCount: 10, docCount: 4, sectionResolved: true }),
      inputOf("L", { severity: "low", idCount: 0, docCount: 1, sectionResolved: false }),
    ]);
    expect(renderSeverityDivergenceLine(ranked)).toBeUndefined();
  });

  it("逆転があるとペア数と例を出す", () => {
    const ranked = rankFindingPriorities([
      inputOf("HIGHWEAK", { severity: "high", idCount: 0, docCount: 1, sectionResolved: false }),
      inputOf("MEDSTRONG", { severity: "medium", idCount: 10, docCount: 4, sectionResolved: true }),
    ]);
    const line = renderSeverityDivergenceLine(ranked);
    expect(line).toBeDefined();
    expect(line).toContain("severity宣言と実体因子の逆転: 1組");
    expect(line).toContain("MEDSTRONG [medium] スコア40");
    expect(line).toContain("HIGHWEAK [high] スコア30");
    expect(line).toContain("severity の妥当性を本文で確認すること");
  });
});

describe("distinctInOrder / isSectionResolved", () => {
  it("distinctInOrder は空文字・null・undefined を除き出現順で重複除去する", () => {
    expect(distinctInOrder(["b", "a", "b", "", undefined, null, "c", "a"])).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("isSectionResolved は「(見出しなし)」と空文字以外の見出しが1件以上あれば true", () => {
    expect(isSectionResolved([UNRESOLVED_SECTION_LABEL, "", undefined])).toBe(false);
    expect(isSectionResolved([UNRESOLVED_SECTION_LABEL, "3.1 予約一覧"])).toBe(true);
    expect(isSectionResolved([])).toBe(false);
  });
});

describe("UNRESOLVED_SECTION_LABEL の実体照合", () => {
  it("見出しの無い文書を extractIdOccurrences に通した heading の実値と文字列一致する", () => {
    const occurrences = extractIdOccurrences([
      { name: "no-heading.md", content: "W-001 見出しの無い文書での定義行" },
    ]);
    expect(occurrences.length).toBeGreaterThan(0);
    for (const occ of occurrences) {
      expect(occ.heading).toBe(UNRESOLVED_SECTION_LABEL);
    }
  });
});

describe("凡例行と件数上限の定数", () => {
  it("凡例行に全配点と帯境界と severity 非上書きの明示が含まれる", () => {
    const legend = renderFindingPriorityLegendLine();
    expect(legend).toContain("severity(high 30 / medium 15 / low 5 / info 0)");
    expect(legend).toContain("影響ID数(0件 0 / 1件 2 / 2件 4 / 3-4件 6 / 5-9件 8 / 10件以上 10)");
    expect(legend).toContain("文書横断(1文書以下 0 / 2文書 6 / 3文書 8 / 4文書以上 10)");
    expect(legend).toContain("章節解決(済 5 / 未 0)");
    expect(legend).toContain("最大55点");
    expect(legend).toContain("帯は P1:40点以上 / P2:30-39 / P3:20-29 / P4:20点未満");
    expect(legend).toContain("severity は判定区分ごとの固定値であり本スコアで上書きしない");
  });

  it("MAX_PRIORITIZED_FINDING_ROWS は 20 である", () => {
    expect(MAX_PRIORITIZED_FINDING_ROWS).toBe(20);
  });
});
