import { describe, expect, it } from "vitest";
import {
  analyzeCoverageBalance,
  buildPerspectiveDistribution,
  buildPerspectiveLevelCrossTable,
  buildTechniqueDistribution,
  buildTestLevelDistribution,
  checkCaseIdGrounding,
  checkDeclaredDistributions,
  checkTermDefinitions,
  collectKnownTerms,
  collectKnownTermSurfaces,
  computeConcentrationMetrics,
  extractBodyCaseIds,
  extractCustomTermCandidates,
  extractTermDefinitions,
  findKnownTermVariants,
  findUnknownAxisDeclarations,
  UNASSIGNED_BUCKET_ID,
  UNKNOWN_BUCKET_ID,
} from "../src/coverageBalanceAnalysis.js";
import { coverageBalanceCriteria } from "../src/resources/coverageBalanceCriteria.js";
import type {
  CoverageBalanceDeliverable,
  CoverageBalanceTestCase,
} from "../src/types.js";

const cases: CoverageBalanceTestCase[] = [
  {
    caseId: "TCS-001",
    perspectiveCategoryId: "TPC-01",
    techniqueId: "boundary-value-analysis",
    testLevel: "system-testing",
  },
  {
    caseId: "TCS-002",
    perspectiveCategoryId: "TPC-01-02",
    techniqueId: "equivalence-partitioning",
    testLevel: "system-testing",
  },
  {
    caseId: "TCS-003",
    perspectiveCategoryId: "TPC-02",
    techniqueId: "boundary-value-analysis",
    testLevel: "component-testing",
  },
  { caseId: "TCS-004" },
];

function sumShares(rows: { sharePercent: number }[]): number {
  return rows.reduce((s, r) => s + r.sharePercent, 0);
}

describe("分布集計", () => {
  it("カタログの0件区分が分布行に含まれる", () => {
    const rows = buildPerspectiveDistribution(cases);
    const zero = rows.filter((r) => r.caseCount === 0 && r.id.startsWith("TPC-"));
    expect(zero.length).toBeGreaterThan(0);
    // TPC-01 は観点ID経由の1件を含めて2件に集約される
    expect(rows.find((r) => r.id === "TPC-01")?.caseCount).toBe(2);
    expect(rows.find((r) => r.id === "TPC-02")?.caseCount).toBe(1);
  });

  it("未指定行が必ず含まれる", () => {
    for (const rows of [
      buildPerspectiveDistribution(cases),
      buildTechniqueDistribution(cases),
      buildTestLevelDistribution(cases),
    ]) {
      const row = rows.find((r) => r.id === UNASSIGNED_BUCKET_ID);
      expect(row).toBeDefined();
      expect(row?.caseCount).toBe(1);
    }
  });

  it("構成比の合計が丸め誤差内で100になる", () => {
    for (const rows of [
      buildPerspectiveDistribution(cases),
      buildTechniqueDistribution(cases),
      buildTestLevelDistribution(cases),
    ]) {
      expect(Math.abs(sumShares(rows) - 100)).toBeLessThan(1);
    }
  });

  it("未知IDは未知バケットへ計上され、構成比の母集団から漏れない", () => {
    const rows = buildTechniqueDistribution([
      ...cases,
      { caseId: "TCS-005", techniqueId: "no-such-technique" },
    ]);
    expect(rows.find((r) => r.id === UNKNOWN_BUCKET_ID)?.caseCount).toBe(1);
    expect(Math.abs(sumShares(rows) - 100)).toBeLessThan(1);
  });

  it("テストレベル別分布のラベルが用語集の日本語名になる", () => {
    const rows = buildTestLevelDistribution(cases);
    expect(rows.find((r) => r.id === "system-testing")?.label).toContain("システム");
  });

  it("クロス表の行合計が観点別分布と一致する", () => {
    const cross = buildPerspectiveLevelCrossTable(cases);
    const rows = buildPerspectiveDistribution(cases);
    for (const row of cross.rows) {
      const dist = rows.find((r) => r.id === row.id);
      expect(row.total, row.id).toBe(dist?.caseCount ?? 0);
      expect(row.counts.reduce((a, b) => a + b, 0)).toBe(row.total);
    }
  });

  it("computeConcentrationMetrics は未指定・未知を除いた観測値を返す", () => {
    const m = computeConcentrationMetrics(buildPerspectiveDistribution(cases));
    expect(m.assignedCaseCount).toBe(3);
    expect(m.topShare).toBeCloseTo(66.7, 1);
    expect(m.topTwoShare).toBeCloseTo(100, 1);
    expect(m.zeroBucketCount).toBeGreaterThan(0);
  });
});

describe("CBC-01 / CBC-02 / CBC-03", () => {
  it("未知の観点カテゴリID・技法IDを検出する", () => {
    const findings = findUnknownAxisDeclarations([
      { caseId: "TCS-100", perspectiveCategoryId: "TPC-99", techniqueId: "unknown-technique" },
    ]);
    expect(findings.filter((f) => f.checkId === "CBC-01").map((f) => f.subject)).toEqual(["TPC-99"]);
    expect(findings.filter((f) => f.checkId === "CBC-02").map((f) => f.subject)).toEqual([
      "unknown-technique",
    ]);
  });

  it("既知IDでは CBC-01 / CBC-02 を出さない", () => {
    const findings = findUnknownAxisDeclarations([
      {
        caseId: "TCS-100",
        perspectiveCategoryId: "TPC-01-01",
        techniqueId: "boundary-value-analysis",
        testLevel: "system-testing",
      },
    ]);
    expect(findings.filter((f) => f.checkId === "CBC-01" || f.checkId === "CBC-02")).toHaveLength(0);
    expect(findings.filter((f) => f.checkId === "CBC-03")).toHaveLength(0);
  });

  it("未宣言の軸ごとに CBC-03 を出す", () => {
    const findings = findUnknownAxisDeclarations([{ caseId: "TCS-100" }]);
    const subjects = findings.filter((f) => f.checkId === "CBC-03").map((f) => f.subject);
    expect(subjects).toEqual(["観点カテゴリID", "技法ID", "テストレベル"]);
  });
});

describe("CBC-04", () => {
  const rows = {
    perspective: buildPerspectiveDistribution(cases),
    technique: buildTechniqueDistribution(cases),
    "test-level": buildTestLevelDistribution(cases),
  };

  it("宣言件数が一致していれば指摘しない", () => {
    const findings = checkDeclaredDistributions(
      [{ axis: "perspective", label: "TPC-01", declaredCount: 2 }],
      rows
    );
    expect(findings).toHaveLength(0);
  });

  it("宣言件数不一致のみ検出する", () => {
    const findings = checkDeclaredDistributions(
      [
        { axis: "perspective", label: "TPC-01", declaredCount: 2 },
        { axis: "perspective", label: "TPC-02", declaredCount: 5 },
      ],
      rows
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("CBC-04");
    expect(findings[0].subject).toBe("観点カテゴリ:TPC-02");
  });

  it("未指定なら検査しない（検査不能）", () => {
    expect(checkDeclaredDistributions(undefined, rows)).toHaveLength(0);
  });

  it("testCases 省略時（後方互換）は既存呼び出しが壊れない", () => {
    const findings = checkDeclaredDistributions(
      [{ axis: "perspective", label: "TPC-01", declaredCount: 2 }],
      rows
    );
    expect(findings).toHaveLength(0);
  });
});

describe("CBC-14", () => {
  const casesWithUnknownTechnique: CoverageBalanceTestCase[] = [
    ...cases,
    { caseId: "TCS-085", techniqueId: "load-test" },
    { caseId: "TCS-086", techniqueId: "load-test" },
  ];
  const rowsWithUnknownTechnique = {
    perspective: buildPerspectiveDistribution(casesWithUnknownTechnique),
    technique: buildTechniqueDistribution(casesWithUnknownTechnique),
    "test-level": buildTestLevelDistribution(casesWithUnknownTechnique),
  };

  it("カタログ外IDを宣言件数どおりに宣言した場合、CBC-14のみを出しCBC-04は出さない", () => {
    const findings = checkDeclaredDistributions(
      [{ axis: "technique", label: "load-test", declaredCount: 2 }],
      rowsWithUnknownTechnique,
      casesWithUnknownTechnique
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("CBC-14");
    expect(findings[0].subject).toBe("技法:load-test");
    expect(findings.some((f) => f.checkId === "CBC-04")).toBe(false);
  });

  it("カタログ外IDの宣言件数が実件数と食い違ってもCBC-14のみを出し、summaryに宣言件数・該当ケースIDを含む", () => {
    const findings = checkDeclaredDistributions(
      [{ axis: "technique", label: "load-test", declaredCount: 5 }],
      rowsWithUnknownTechnique,
      casesWithUnknownTechnique
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("CBC-14");
    expect(findings[0].summary).toContain("5");
    expect(findings[0].summary).toContain("TCS-085");
    expect(findings[0].summary).toContain("TCS-086");
    expect(findings[0].summary).not.toContain("実集計は0件である");
  });

  it("カタログにも実データにも存在しないラベルは従来通りCBC-04が0件断定を出す（回帰）", () => {
    const findings = checkDeclaredDistributions(
      [{ axis: "technique", label: "not-declared-anywhere", declaredCount: 3 }],
      rowsWithUnknownTechnique,
      casesWithUnknownTechnique
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("CBC-04");
    expect(findings[0].summary).toContain(
      "区分「not-declared-anywhere」は集計軸の区分として存在せず、実集計は0件である"
    );
  });
});

describe("CBC-05 / CBC-06", () => {
  const deliverables: CoverageBalanceDeliverable[] = [
    {
      name: "テスト設計書",
      content: ["# テストケース", "", "- TCS-001 入力上限", "- TCS-009 未投入のケース"].join("\n"),
    },
  ];

  it("本文に無い計上ケースIDを CBC-05 として検出する", () => {
    const findings = checkCaseIdGrounding(
      [{ caseId: "TCS-001" }, { caseId: "TCS-002" }],
      deliverables
    );
    const cbc05 = findings.filter((f) => f.checkId === "CBC-05");
    expect(cbc05.map((f) => f.subject)).toEqual(["TCS-002"]);
  });

  it("本文にあるが未投入のケースIDを CBC-06 として検出する", () => {
    const findings = checkCaseIdGrounding([{ caseId: "TCS-001" }], deliverables);
    const cbc06 = findings.filter((f) => f.checkId === "CBC-06");
    expect(cbc06.map((f) => f.subject)).toEqual(["TCS-009"]);
    expect(cbc06[0].places[0].deliverable).toBe("テスト設計書");
  });

  it("プレフィックスが異なるIDは CBC-06 の対象外", () => {
    const findings = checkCaseIdGrounding([{ caseId: "TCS-001" }, { caseId: "TCS-009" }], [
      { name: "設計書", content: "TCS-001 / TCS-009 / REQ-010" },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("deliverables 未指定なら検査しない（検査不能）", () => {
    expect(checkCaseIdGrounding([{ caseId: "TCS-001" }], undefined)).toHaveLength(0);
  });

  it("extractBodyCaseIds が出現位置を返す", () => {
    const occ = extractBodyCaseIds(deliverables);
    expect(occ.map((o) => o.caseId)).toEqual(["TCS-001", "TCS-009"]);
    expect(occ[0].lineIndex).toBe(2);
  });
});

describe("独自用語候補の抽出", () => {
  const deliverables: CoverageBalanceDeliverable[] = [
    {
      name: "テスト計画書",
      content: [
        "# 用語集",
        "",
        "| 用語 | 定義 |",
        "| --- | --- |",
        "| ゲートウェイ制御 | 改札機の開閉を制御する仕組み |",
        "| 幽霊用語 | どこにも使われない用語 |",
        "",
        "# 本文",
        "",
        "ゲートウェイ制御は改札機で使う。ゲートウェイ制御の異常時は境界値分析で確認する。",
        "また「未定義語」を扱う。「未定義語」は本文にのみ現れる。",
        "「単発語」は1回しか現れない。",
      ].join("\n"),
    },
  ];

  it("既知カタログ用語を候補から除外する", () => {
    const known = collectKnownTerms();
    const candidates = extractCustomTermCandidates(deliverables, known, { minOccurrences: 1 });
    const terms = candidates.map((c) => c.term);
    expect(terms).not.toContain("境界値分析");
    expect(terms).toContain("未定義語");
  });

  it("minOccurrences 未満の候補を除外する", () => {
    const known = collectKnownTerms();
    const once = extractCustomTermCandidates(deliverables, known, { minOccurrences: 1 });
    const twice = extractCustomTermCandidates(deliverables, known, { minOccurrences: 2 });
    expect(once.length).toBeGreaterThan(twice.length);
    expect(twice.every((c) => c.occurrences >= 2)).toBe(true);
  });

  it("additionalKnownTerms 相当の語を除外できる", () => {
    const known = collectKnownTerms(["未定義語"]);
    const candidates = extractCustomTermCandidates(deliverables, known, { minOccurrences: 1 });
    expect(candidates.map((c) => c.term)).not.toContain("未定義語");
  });

  it("extractTermDefinitions が用語集の表行から定義を拾う", () => {
    const defs = extractTermDefinitions(deliverables, coverageBalanceCriteria);
    expect(defs.map((d) => d.term)).toEqual(["ゲートウェイ制御", "幽霊用語"]);
    expect(defs[0].definition).toContain("改札機");
  });
});

describe("CBC-09 .. CBC-13", () => {
  const withGlossary: CoverageBalanceDeliverable[] = [
    {
      name: "テスト計画書",
      content: [
        "# 用語集",
        "",
        "| 用語 | 定義 |",
        "| --- | --- |",
        "| ゲートウェイ制御 | 改札機の開閉を制御する仕組み |",
        "| 幽霊用語 | どこにも使われない用語 |",
        "",
        "# 本文",
        "",
        "ゲートウェイ制御は改札機で使う。ゲートウェイ制御の異常を確認する。",
        "「未定義語」を扱う。「未定義語」は定義されていない。",
      ].join("\n"),
    },
  ];

  function run(deliverables: CoverageBalanceDeliverable[]) {
    const known = collectKnownTerms();
    const candidates = extractCustomTermCandidates(deliverables, known, { minOccurrences: 2 });
    const defs = extractTermDefinitions(deliverables, coverageBalanceCriteria);
    const variants = findKnownTermVariants(deliverables, collectKnownTermSurfaces(), {
      minOccurrences: 2,
    });
    return checkTermDefinitions(candidates, defs, deliverables, coverageBalanceCriteria, variants);
  }

  it("定義済み用語では CBC-10 が出ず、未定義用語では出る", () => {
    const findings = run(withGlossary);
    const cbc10 = findings.filter((f) => f.checkId === "CBC-10").map((f) => f.subject);
    expect(cbc10).toContain("未定義語");
    expect(cbc10).not.toContain("ゲートウェイ制御");
  });

  it("定義のみで本文未使用の用語に CBC-11 が出る", () => {
    const findings = run(withGlossary);
    const cbc11 = findings.filter((f) => f.checkId === "CBC-11").map((f) => f.subject);
    expect(cbc11).toContain("幽霊用語");
    expect(cbc11).not.toContain("ゲートウェイ制御");
  });

  it("用語集セクションが無く独自用語がある場合に CBC-09 が出る", () => {
    const noGlossary: CoverageBalanceDeliverable[] = [
      {
        name: "テスト設計書",
        content: ["# 本文", "", "「未定義語」を扱う。「未定義語」は定義されていない。"].join("\n"),
      },
    ];
    const findings = run(noGlossary);
    expect(findings.filter((f) => f.checkId === "CBC-09")).toHaveLength(1);
  });

  it("用語集がある場合は CBC-09 を出さない", () => {
    expect(run(withGlossary).filter((f) => f.checkId === "CBC-09")).toHaveLength(0);
  });

  it("定義文が一致しない重複定義に CBC-12 が出る", () => {
    const dup: CoverageBalanceDeliverable[] = [
      {
        name: "計画書",
        content: ["# 用語", "", "- ゲート制御: 改札の開閉を制御する"].join("\n"),
      },
      {
        name: "設計書",
        content: ["# 用語定義", "", "- ゲート制御: 出場ゲートの施錠を制御する"].join("\n"),
      },
    ];
    const findings = run(dup);
    expect(findings.filter((f) => f.checkId === "CBC-12").map((f) => f.subject)).toEqual([
      "ゲート制御",
    ]);
  });

  it("既知用語の表記ゆれに CBC-13 が出る", () => {
    // 「ゲート・制御」は既知用語「ゲート制御」と正規化キーが一致するが表記が異なる
    const variantDoc: CoverageBalanceDeliverable[] = [
      {
        name: "設計書",
        content: ["# 本文", "", "「ゲート・制御」を行う。", "「ゲート・制御」を再度行う。"].join("\n"),
      },
    ];
    const variants = findKnownTermVariants(variantDoc, collectKnownTermSurfaces(["ゲート制御"]), {
      minOccurrences: 2,
    });
    expect(variants[0]?.knownTerm).toBe("ゲート制御");
    expect(variants.length).toBeGreaterThan(0);
    const findings = checkTermDefinitions([], [], variantDoc, coverageBalanceCriteria, variants);
    expect(findings.filter((f) => f.checkId === "CBC-13").length).toBeGreaterThan(0);
  });
});

describe("analyzeCoverageBalance", () => {
  const input = {
    testCases: cases,
    deliverables: [
      {
        name: "テスト設計書",
        content: [
          "# 用語集",
          "",
          "- ゲート制御: 改札の開閉を制御する",
          "",
          "# テストケース",
          "",
          "- TCS-001 / TCS-002 / TCS-003 ゲート制御の確認",
          "- TCS-004 ゲート制御の異常時",
        ].join("\n"),
      },
    ],
    declaredDistributions: [
      { axis: "perspective" as const, label: "TPC-01", declaredCount: 2 },
    ],
  };

  it("同一入力を2回渡すと出力が完全に一致する（決定性）", () => {
    const a = analyzeCoverageBalance(input);
    const b = analyzeCoverageBalance(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("入力を破壊しない", () => {
    const snapshot = JSON.stringify(input);
    analyzeCoverageBalance(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("指摘番号が CB-001 から連番で採番される", () => {
    const result = analyzeCoverageBalance(input);
    expect(result.findings.map((f) => f.no)).toEqual(
      result.findings.map((_, i) => `CB-${String(i + 1).padStart(3, "0")}`)
    );
  });

  it("deliverables 未指定なら用語系の結果は空になる", () => {
    const result = analyzeCoverageBalance({ testCases: cases });
    expect(result.termCandidates).toHaveLength(0);
    expect(result.termDefinitions).toHaveLength(0);
    expect(
      result.findings.filter((f) => ["CBC-05", "CBC-06", "CBC-09", "CBC-10"].includes(f.checkId))
    ).toHaveLength(0);
  });

  it("分布への合否指摘（high/medium）を出さない", () => {
    const result = analyzeCoverageBalance(input);
    for (const f of result.findings.filter((x) => x.checkId === "CBC-07" || x.checkId === "CBC-08")) {
      expect(f.severity).toBe("info");
    }
  });

  it("サマリがケース数・成果物数・指摘数を反映する", () => {
    const result = analyzeCoverageBalance(input);
    expect(result.summary.caseCount).toBe(cases.length);
    expect(result.summary.deliverableCount).toBe(1);
    expect(result.summary.totalFindings).toBe(result.findings.length);
  });
});
