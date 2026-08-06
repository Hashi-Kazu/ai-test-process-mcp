import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_CELL_COUNT,
  analyzeCrossMatrix,
  buildCrossMatrixPair,
  findAsymmetricLinks,
  findAxisPopulationShrinkage,
  findDeclaredCoverageMismatches,
  findDuplicateAxisIds,
  findDuplicateItemIds,
  findIsolatedItems,
  findLinkEvidenceIssues,
  findSelfAxisLinks,
  findUngroundedAxisItems,
  findUnknownLinkTargets,
  findUnmappedDefinedIds,
  linkTargetIds,
  normalizeAxisItemLinks,
  resolveAxisPairs,
} from "../src/crossMatrixAnalysis.js";
import type {
  AuditCrossMatrixInput,
  CrossMatrixAxisSpec,
  TestBasisDocument,
} from "../src/types.js";

// RISK(プロダクトリスク) × METHOD(テスト方法) × PERSONA(ペルソナ) の3軸を基本サンプルとする。
function baseAxes(): CrossMatrixAxisSpec[] {
  return [
    {
      axisId: "RISK",
      axisName: "プロダクトリスク",
      items: [
        { id: "R-01", label: "決済失敗", links: ["M-01", "P-01"] },
        { id: "R-02", label: "在庫不整合", links: ["M-02"] },
        { id: "R-03", label: "表示崩れ" },
      ],
    },
    {
      axisId: "METHOD",
      axisName: "テスト方法",
      items: [
        { id: "M-01", label: "自動E2E", links: ["R-01"] },
        { id: "M-02", label: "手動探索", links: ["R-02", "P-02"] },
      ],
    },
    {
      axisId: "PERSONA",
      axisName: "ペルソナ",
      items: [
        { id: "P-01", label: "一般利用者", links: ["R-01"] },
        { id: "P-02", label: "運用担当", links: ["M-02"] },
      ],
    },
  ];
}

function baseInput(): AuditCrossMatrixInput {
  return { axes: baseAxes() };
}

function cleanAxes(): CrossMatrixAxisSpec[] {
  return [
    {
      axisId: "RISK",
      axisName: "プロダクトリスク",
      items: [
        { id: "R-01", label: "決済失敗", links: ["M-01"] },
        { id: "R-02", label: "在庫不整合", links: ["M-02"] },
      ],
    },
    {
      axisId: "METHOD",
      axisName: "テスト方法",
      items: [
        { id: "M-01", label: "自動E2E", links: ["R-01"] },
        { id: "M-02", label: "手動探索", links: ["R-02"] },
      ],
    },
  ];
}

// 全4セルが双方向 links で埋まる 2軸 × 2要素。documents には各要素の id と label だけを含める。
const linkedDocuments: TestBasisDocument[] = [
  {
    name: "basis.md",
    content: [
      "# テストベース",
      "R-01 決済失敗",
      "R-02 在庫不整合",
      "M-01 自動E2E",
      "M-02 手動探索",
    ].join("\n"),
  },
];

/**
 * kind="missing": 半分のリンク宣言は evidence 未記入、残り半分は本文に存在しない引用文。
 * kind="grounded": 全リンク宣言に本文から切り出した引用文を与える。
 */
function fullyLinkedAxes(kind: "missing" | "grounded"): CrossMatrixAxisSpec[] {
  const quote = (id: string, label: string): string => `${id} ${label}`;
  const ev = (id: string, label: string): { evidence: string } =>
    kind === "grounded"
      ? { evidence: quote(id, label) }
      : { evidence: `本文に存在しない引用文 ${id}` };
  const bare = (targetId: string, id: string, label: string) =>
    kind === "grounded" ? { targetId, ...ev(id, label) } : { targetId };

  return [
    {
      axisId: "RISK",
      axisName: "プロダクトリスク",
      items: [
        {
          id: "R-01",
          label: "決済失敗",
          links: [bare("M-01", "M-01", "自動E2E"), { targetId: "M-02", ...ev("M-02", "手動探索") }],
        },
        {
          id: "R-02",
          label: "在庫不整合",
          links: [bare("M-01", "M-01", "自動E2E"), { targetId: "M-02", ...ev("M-02", "手動探索") }],
        },
      ],
    },
    {
      axisId: "METHOD",
      axisName: "テスト方法",
      items: [
        {
          id: "M-01",
          label: "自動E2E",
          links: [bare("R-01", "R-01", "決済失敗"), { targetId: "R-02", ...ev("R-02", "在庫不整合") }],
        },
        {
          id: "M-02",
          label: "手動探索",
          links: [bare("R-01", "R-01", "決済失敗"), { targetId: "R-02", ...ev("R-02", "在庫不整合") }],
        },
      ],
    },
  ];
}

function fullyLinkedInput(kind: "missing" | "grounded"): AuditCrossMatrixInput {
  return {
    axes: fullyLinkedAxes(kind),
    documents: linkedDocuments,
    declaredCoverage: [{ axisA: "RISK", axisB: "METHOD", claimedFillRatePercent: 100 }],
  };
}

describe("resolveAxisPairs", () => {
  it("returns all i<j combinations in declaration order for three and four axes", () => {
    expect(resolveAxisPairs(baseAxes())).toEqual([
      { axisA: "RISK", axisB: "METHOD" },
      { axisA: "RISK", axisB: "PERSONA" },
      { axisA: "METHOD", axisB: "PERSONA" },
    ]);

    const fourAxes = [
      ...baseAxes(),
      { axisId: "TYPE", axisName: "テストタイプ", items: [{ id: "T-01" }] },
    ];
    expect(resolveAxisPairs(fourAxes)).toHaveLength(6);
  });

  it("keeps the declared order when axisPairs is given", () => {
    expect(
      resolveAxisPairs(baseAxes(), [
        { axisA: "METHOD", axisB: "PERSONA" },
        { axisA: "RISK", axisB: "METHOD" },
      ])
    ).toEqual([
      { axisA: "METHOD", axisB: "PERSONA" },
      { axisA: "RISK", axisB: "METHOD" },
    ]);
  });

  it("folds a reversed duplicate pair into the first occurrence and drops same-axis / unknown axis pairs", () => {
    expect(
      resolveAxisPairs(baseAxes(), [
        { axisA: "RISK", axisB: "METHOD" },
        { axisA: "METHOD", axisB: "RISK" },
        { axisA: "RISK", axisB: "RISK" },
        { axisA: "RISK", axisB: "UNKNOWN" },
      ])
    ).toEqual([{ axisA: "RISK", axisB: "METHOD" }]);
  });
});

describe("buildCrossMatrixPair", () => {
  it("generates rowCount * columnCount cells in row-major order", () => {
    const pair = buildCrossMatrixPair(baseAxes(), "RISK", "METHOD");
    expect(pair.totalCellCount).toBe(6);
    expect(pair.cells).toHaveLength(6);
    expect(pair.cells.map((c) => `${c.rowItemId}/${c.columnItemId}`)).toEqual([
      "R-01/M-01",
      "R-01/M-02",
      "R-02/M-01",
      "R-02/M-02",
      "R-03/M-01",
      "R-03/M-02",
    ]);
  });

  it("resolves state and direction for a-only, b-only, both and neither links", () => {
    const axes: CrossMatrixAxisSpec[] = [
      {
        axisId: "A",
        axisName: "軸A",
        items: [
          { id: "A-1", links: ["B-1", "B-2"] },
          { id: "A-2" },
        ],
      },
      {
        axisId: "B",
        axisName: "軸B",
        items: [
          { id: "B-1", links: ["A-1"] },
          { id: "B-2" },
          { id: "B-3", links: ["A-2"] },
        ],
      },
    ];
    const pair = buildCrossMatrixPair(axes, "A", "B");
    const at = (row: string, col: string) =>
      pair.cells.find((c) => c.rowItemId === row && c.columnItemId === col);

    expect(at("A-1", "B-1")).toMatchObject({ state: "filled", direction: "both" });
    expect(at("A-1", "B-2")).toMatchObject({ state: "filled", direction: "a-to-b" });
    expect(at("A-2", "B-3")).toMatchObject({ state: "filled", direction: "b-to-a" });
    expect(at("A-1", "B-3")).toMatchObject({ state: "empty", direction: "none" });
  });

  it("lists row items that link to nothing on the paired axis as empty rows", () => {
    const pair = buildCrossMatrixPair(baseAxes(), "RISK", "METHOD");
    expect(pair.emptyRows.map((r) => r.itemId)).toEqual(["R-03"]);
    expect(pair.emptyRows[0]).toMatchObject({
      axisId: "RISK",
      label: "表示崩れ",
      pairedAxisId: "METHOD",
      excluded: false,
    });
  });

  it("lists column items that link to nothing on the paired axis as empty columns", () => {
    const pair = buildCrossMatrixPair(baseAxes(), "RISK", "PERSONA");
    expect(pair.emptyColumns.map((c) => c.itemId)).toEqual(["P-02"]);
    expect(pair.emptyColumns[0]).toMatchObject({ axisId: "PERSONA", pairedAxisId: "RISK" });
  });

  it("marks excluded lines, drops them from the coverage denominator and raises the row coverage rate", () => {
    const plain = buildCrossMatrixPair(baseAxes(), "RISK", "METHOD");
    expect(plain.targetRowCount).toBe(3);
    expect(plain.rowCoverageRatePercent).toBe(66.7);

    const excluded = buildCrossMatrixPair(baseAxes(), "RISK", "METHOD", [
      { axisId: "RISK", itemId: "R-03", reason: "UI崩れは目視確認で扱う" },
    ]);
    expect(excluded.emptyRows[0]).toMatchObject({
      excluded: true,
      exclusionReason: "UI崩れは目視確認で扱う",
    });
    expect(excluded.targetRowCount).toBe(2);
    expect(excluded.rowCoverageRatePercent).toBe(100);
  });

  it("applies pairedAxisId scoped exclusions only to that pair", () => {
    const exclusions = [
      { axisId: "RISK", itemId: "R-03", pairedAxisId: "METHOD", reason: "対象外" },
    ];
    const scoped = buildCrossMatrixPair(baseAxes(), "RISK", "METHOD", exclusions);
    const other = buildCrossMatrixPair(baseAxes(), "RISK", "PERSONA", exclusions);
    expect(scoped.emptyRows.find((r) => r.itemId === "R-03")?.excluded).toBe(true);
    expect(other.emptyRows.find((r) => r.itemId === "R-03")?.excluded).toBe(false);
    expect(other.targetRowCount).toBe(3);
  });

  it("computes fill / row coverage / column coverage rates to one decimal place, and 0 for a zero denominator", () => {
    const pair = buildCrossMatrixPair(baseAxes(), "RISK", "PERSONA");
    expect(pair.filledCellCount).toBe(1);
    expect(pair.cellFillRatePercent).toBe(16.7);
    expect(pair.rowCoverageRatePercent).toBe(33.3);
    expect(pair.columnCoverageRatePercent).toBe(50);

    const emptyAxes: CrossMatrixAxisSpec[] = [
      { axisId: "A", axisName: "軸A", items: [] },
      { axisId: "B", axisName: "軸B", items: [{ id: "B-1" }] },
    ];
    const degenerate = buildCrossMatrixPair(emptyAxes, "A", "B");
    expect(degenerate.totalCellCount).toBe(0);
    expect(degenerate.cellFillRatePercent).toBe(0);
    expect(degenerate.rowCoverageRatePercent).toBe(0);
    expect(degenerate.columnCoverageRatePercent).toBe(0);
  });

  it("skips generation and records skipReason when the cell count exceeds maxCellCount", () => {
    const pair = buildCrossMatrixPair(baseAxes(), "RISK", "METHOD", undefined, 5);
    expect(pair.generated).toBe(false);
    expect(pair.skipReason).toContain("上限 5");
    expect(pair.cells).toEqual([]);
    expect(pair.emptyRows).toEqual([]);
    expect(pair.cellFillRatePercent).toBe(0);
  });
});

describe("cross matrix findings helpers", () => {
  it("findUnknownLinkTargets returns only undeclared ids in first-appearance order", () => {
    const axes = baseAxes();
    axes[0].items[2].links = ["X-99", "M-01", "X-99", "Y-01"];
    expect(findUnknownLinkTargets(axes)).toEqual([
      { axisId: "RISK", itemId: "R-03", unknownIds: ["X-99", "Y-01"] },
    ]);
  });

  it("findDuplicateAxisIds and findDuplicateItemIds detect duplicates", () => {
    const axes = baseAxes();
    axes.push({ axisId: "RISK", axisName: "重複軸", items: [{ id: "M-01" }] });
    expect(findDuplicateAxisIds(axes)).toEqual(["RISK"]);
    expect(findDuplicateItemIds(axes)).toEqual([{ itemId: "M-01", axisIds: ["METHOD", "RISK"] }]);
  });

  it("findAsymmetricLinks reports one-directional links only", () => {
    const axes = baseAxes();
    axes[1].items[0].links = []; // M-01 -> R-01 の逆方向宣言を落とす
    expect(findAsymmetricLinks(axes)).toEqual([
      { fromAxisId: "RISK", fromItemId: "R-01", toAxisId: "METHOD", toItemId: "M-01" },
    ]);
    expect(findAsymmetricLinks(baseAxes())).toEqual([]);
  });

  it("findSelfAxisLinks detects links pointing at items on the same axis", () => {
    const axes = baseAxes();
    axes[0].items[1].links = ["M-02", "R-01"];
    expect(findSelfAxisLinks(axes)).toEqual([
      { axisId: "RISK", itemId: "R-02", linkedIds: ["R-01"] },
    ]);
  });

  it("findIsolatedItems returns only items that are an empty row and an empty column in every pair", () => {
    expect(findIsolatedItems(baseAxes())).toEqual([
      { axisId: "RISK", itemId: "R-03", label: "表示崩れ" },
    ]);
    expect(findIsolatedItems(cleanAxes())).toEqual([]);
  });

  it("findAxisPopulationShrinkage reports expected ids missing from the axis items", () => {
    const result = findAxisPopulationShrinkage(baseAxes(), [
      { axisId: "RISK", ids: ["R-01", "R-02", "R-03", "R-04"] },
      { axisId: "METHOD", ids: ["M-01", "M-02"] },
    ]);
    expect(result).toEqual([{ axisId: "RISK", missingIds: ["R-04"], extraIds: [] }]);
    expect(findAxisPopulationShrinkage(baseAxes())).toEqual([]);
  });

  it("findUngroundedAxisItems and findUnmappedDefinedIds cross-check the test basis text in both directions", () => {
    const documents = [
      {
        name: "risk-list.md",
        content: ["# リスク一覧", "R-01 決済失敗", "R-02 在庫不整合", "R-09 未マップリスク"].join("\n"),
      },
    ];
    const ungrounded = findUngroundedAxisItems(baseAxes(), documents);
    expect(ungrounded.map((i) => i.itemId)).toContain("R-03");
    expect(ungrounded.map((i) => i.itemId)).not.toContain("R-01");

    const unmapped = findUnmappedDefinedIds(baseAxes(), documents);
    expect(unmapped.map((u) => u.id)).toEqual(["R-09"]);
    expect(unmapped[0].document).toBe("risk-list.md");

    expect(findUngroundedAxisItems(baseAxes())).toEqual([]);
    expect(findUnmappedDefinedIds(baseAxes())).toEqual([]);
  });

  it("findDeclaredCoverageMismatches detects wrong figures and a false claimedNoEmptyCells", () => {
    const pairs = [buildCrossMatrixPair(baseAxes(), "RISK", "METHOD")];
    const mismatches = findDeclaredCoverageMismatches(pairs, [
      {
        axisA: "RISK",
        axisB: "METHOD",
        claimedFillRatePercent: 100,
        claimedRowCoveragePercent: 66.7,
        claimedNoEmptyCells: true,
      },
    ]);
    expect(mismatches).toEqual([
      {
        axisA: "RISK",
        axisB: "METHOD",
        field: "claimedFillRatePercent",
        claimed: 100,
        actual: 33.3,
      },
      { axisA: "RISK", axisB: "METHOD", field: "claimedNoEmptyCells", claimed: true, actual: false },
    ]);
    expect(findDeclaredCoverageMismatches(pairs)).toEqual([]);
  });
});

describe("analyzeCrossMatrix", () => {
  it("exposes the default cell cap", () => {
    expect(DEFAULT_MAX_CELL_COUNT).toBe(20000);
  });

  it("skips only the pairs over the cell cap and keeps generating the rest", () => {
    const result = analyzeCrossMatrix({ ...baseInput(), maxCellCount: 5 });
    const generated = result.pairs.filter((p) => p.generated);
    expect(generated.map((p) => `${p.axisA}x${p.axisB}`)).toEqual(["METHODxPERSONA"]);
    expect(result.findings.filter((f) => f.categoryId === "CMX-13")).toHaveLength(2);
    expect(result.summary.generatedPairCount).toBe(1);
  });

  it("is deterministic and does not mutate the input", () => {
    const input = baseInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    const first = analyzeCrossMatrix(input);
    const second = analyzeCrossMatrix(input);
    expect(first).toEqual(second);
    expect(input).toEqual(snapshot);
  });

  it("emits the expected finding categories and no high findings for a clean input", () => {
    const result = analyzeCrossMatrix({
      axes: baseAxes(),
      exclusions: [{ axisId: "RISK", itemId: "R-03" }],
      declaredCoverage: [{ axisA: "RISK", axisB: "METHOD", claimedFillRatePercent: 90 }],
      expectedAxisPopulations: [{ axisId: "RISK", ids: ["R-01", "R-02", "R-03", "R-04"] }],
    });
    const ids = new Set(result.findings.map((f) => f.categoryId));
    expect(ids.has("CMX-04")).toBe(true);
    expect(ids.has("CMX-07")).toBe(true);
    expect(ids.has("CMX-08")).toBe(true);
    expect(ids.has("CMX-09")).toBe(true);
    expect(ids.has("CMX-15")).toBe(true);

    const clean = analyzeCrossMatrix({ axes: cleanAxes() });
    expect(clean.findings.filter((f) => f.severity === "high")).toEqual([]);
    expect(clean.summary).toMatchObject({
      axisCount: 2,
      pairCount: 1,
      generatedPairCount: 1,
      totalItemCount: 4,
      isolatedItemCount: 0,
      emptyRowTotal: 0,
      emptyColumnTotal: 0,
      overallCellFillRatePercent: 50,
      highFindingTotal: 0,
    });
  });

  it("does not mutate the input and stays deterministic with object-form links and documents", () => {
    const input = fullyLinkedInput("missing");
    const snapshot = JSON.parse(JSON.stringify(input));
    const first = analyzeCrossMatrix(input);
    const second = analyzeCrossMatrix(input);
    expect(first).toEqual(second);
    expect(input).toEqual(snapshot);
  });

  it("reports CMX-03 for every empty row across all three axis pairs", () => {
    const result = analyzeCrossMatrix(baseInput());
    const emptyRowTargets = result.findings
      .filter((f) => f.categoryId === "CMX-03")
      .map((f) => f.target);
    expect(emptyRowTargets).toEqual([
      "RISK / R-03 × METHOD",
      "RISK / R-02 × PERSONA",
      "RISK / R-03 × PERSONA",
      "METHOD / M-01 × PERSONA",
    ]);
  });
});

describe("normalizeAxisItemLinks / linkTargetIds", () => {
  it("accepts strings and objects, drops blank targetIds and keeps the first declaration per targetId", () => {
    const item = {
      id: "R-01",
      links: [
        "M-01",
        { targetId: "M-02", evidence: "最初の宣言", evidenceSource: "basis.md" },
        { targetId: "M-02", evidence: "2件目は採用しない" },
        "M-01",
        "   ",
        { targetId: "" },
        "M-03",
      ],
    };
    expect(normalizeAxisItemLinks(item)).toEqual([
      { targetId: "M-01" },
      { targetId: "M-02", evidence: "最初の宣言", evidenceSource: "basis.md" },
      { targetId: "M-03" },
    ]);
    expect(linkTargetIds(item)).toEqual(["M-01", "M-02", "M-03"]);
    expect(normalizeAxisItemLinks({ id: "X" })).toEqual([]);
  });

  it("does not mutate the item or its links", () => {
    const item = { id: "R-01", links: [{ targetId: "M-01", evidence: "根拠" }, "M-02"] };
    const snapshot = JSON.parse(JSON.stringify(item));
    normalizeAxisItemLinks(item);
    linkTargetIds(item);
    expect(item).toEqual(snapshot);
  });

  it("reports blank targetIds as CMX-01 and keeps them out of the cross product", () => {
    const axes = baseAxes();
    axes[0].items[2].links = ["", "  ", "M-01"];
    const result = analyzeCrossMatrix({ axes });
    const blank = result.findings.filter(
      (f) => f.categoryId === "CMX-01" && f.target === "RISK / R-03"
    );
    expect(blank).toHaveLength(1);
    expect(blank[0].detail).toBe(
      "links に targetId が空のリンク宣言が 2 件ある。当該リンクは直積表に反映していない。"
    );
    expect(linkTargetIds(axes[0].items[2])).toEqual(["M-01"]);
  });
});

describe("link declaration form backward compatibility", () => {
  function objectFormAxes(): CrossMatrixAxisSpec[] {
    const axes = baseAxes();
    for (const axis of axes) {
      for (const item of axis.items) {
        if (item.links === undefined) continue;
        item.links = item.links.map((link) => ({ targetId: link as string }));
      }
    }
    return axes;
  }

  it("produces identical results for string links and equivalent object links", () => {
    const stringForm = baseAxes();
    const objectForm = objectFormAxes();

    expect(buildCrossMatrixPair(objectForm, "RISK", "METHOD")).toEqual(
      buildCrossMatrixPair(stringForm, "RISK", "METHOD")
    );
    expect(findUnknownLinkTargets(objectForm)).toEqual(findUnknownLinkTargets(stringForm));
    expect(findSelfAxisLinks(objectForm)).toEqual(findSelfAxisLinks(stringForm));
    expect(findAsymmetricLinks(objectForm)).toEqual(findAsymmetricLinks(stringForm));
    expect(findIsolatedItems(objectForm)).toEqual(findIsolatedItems(stringForm));
  });

  it("keeps the established string-link results unchanged", () => {
    const pair = buildCrossMatrixPair(baseAxes(), "RISK", "METHOD");
    expect(pair.filledCellCount).toBe(2);
    expect(pair.cellFillRatePercent).toBe(33.3);
    expect(pair.emptyRows.map((r) => r.itemId)).toEqual(["R-03"]);
    expect(pair.evidenceEvaluated).toBe(false);
    expect(pair.groundedFilledCellCount).toBe(0);
    expect(pair.groundedCellFillRatePercent).toBe(0);
    expect(pair.cells.every((c) => c.grounded === false)).toBe(true);
  });
});

describe("findLinkEvidenceIssues", () => {
  it("reports nothing when documents is missing or empty", () => {
    expect(findLinkEvidenceIssues(fullyLinkedAxes("missing"))).toEqual({
      missing: [],
      ungrounded: [],
    });
    expect(findLinkEvidenceIssues(fullyLinkedAxes("missing"), [])).toEqual({
      missing: [],
      ungrounded: [],
    });
  });

  it("splits declarations into missing evidence and evidence absent from the documents", () => {
    const { missing, ungrounded } = findLinkEvidenceIssues(
      fullyLinkedAxes("missing"),
      linkedDocuments
    );
    expect(missing).toHaveLength(4);
    expect(missing[0]).toEqual({
      axisId: "RISK",
      itemId: "R-01",
      targetAxisId: "METHOD",
      targetId: "M-01",
    });
    expect(ungrounded).toHaveLength(4);
    expect(ungrounded[0]).toEqual({
      axisId: "RISK",
      itemId: "R-01",
      targetAxisId: "METHOD",
      targetId: "M-02",
      evidence: "本文に存在しない引用文 M-02",
    });
  });

  it("reports nothing when every evidence is quoted from the documents", () => {
    expect(findLinkEvidenceIssues(fullyLinkedAxes("grounded"), linkedDocuments)).toEqual({
      missing: [],
      ungrounded: [],
    });
  });

  it("absorbs full-width / half-width and punctuation differences in the evidence", () => {
    const axes: CrossMatrixAxisSpec[] = [
      {
        axisId: "A",
        axisName: "軸A",
        items: [{ id: "A-1", links: [{ targetId: "B-1", evidence: "API呼び出しの失敗" }] }],
      },
      {
        axisId: "B",
        axisName: "軸B",
        items: [{ id: "B-1", links: [{ targetId: "A-1", evidence: "ＡＰＩ 呼び出し・の失敗" }] }],
      },
    ];
    const documents: TestBasisDocument[] = [
      { name: "d.md", content: "A-1 B-1 ＡＰＩ呼び出しの失敗を検知する" },
    ];
    expect(findLinkEvidenceIssues(axes, documents)).toEqual({ missing: [], ungrounded: [] });
  });

  it("ignores links to undeclared ids and to items on the same axis", () => {
    const axes: CrossMatrixAxisSpec[] = [
      {
        axisId: "A",
        axisName: "軸A",
        items: [
          { id: "A-1", links: ["X-99", "A-2"] },
          { id: "A-2" },
        ],
      },
      { axisId: "B", axisName: "軸B", items: [{ id: "B-1" }] },
    ];
    expect(findLinkEvidenceIssues(axes, linkedDocuments)).toEqual({ missing: [], ungrounded: [] });
  });
});

describe("link evidence grounded fill rate", () => {
  it("reports CMX-16 and CMX-17 as high when every cell is linked but no link evidence is grounded", () => {
    const result = analyzeCrossMatrix(fullyLinkedInput("missing"));
    const pair = result.pairs[0];

    // 宣言ベースでは満充填のまま
    expect(pair.cellFillRatePercent).toBe(100);
    expect(pair.filledCellCount).toBe(4);
    expect(pair.emptyRows).toEqual([]);
    expect(pair.emptyColumns).toEqual([]);

    // 根拠裏付け後は 0
    expect(pair.evidenceEvaluated).toBe(true);
    expect(pair.groundedFilledCellCount).toBe(0);
    expect(pair.groundedCellFillRatePercent).toBe(0);

    const cmx16 = result.findings.filter((f) => f.categoryId === "CMX-16");
    const cmx17 = result.findings.filter((f) => f.categoryId === "CMX-17");
    expect(cmx16.length).toBeGreaterThan(0);
    expect(cmx16.every((f) => f.severity === "high")).toBe(true);
    expect(cmx17.length).toBeGreaterThan(0);
    expect(cmx17.every((f) => f.severity === "high")).toBe(true);

    const cmx08 = result.findings.filter(
      (f) =>
        f.categoryId === "CMX-08" &&
        f.severity === "high" &&
        f.target.includes("claimedFillRatePercentGrounded")
    );
    expect(cmx08).toHaveLength(1);

    expect(result.summary.highFindingTotal).toBeGreaterThan(0);
    expect(result.summary.linksWithoutEvidenceTotal).toBeGreaterThan(0);
    expect(result.summary.ungroundedLinkTotal).toBeGreaterThan(0);
    expect(result.summary.overallGroundedCellFillRatePercent).toBe(0);
    expect(result.summary.linkDeclarationTotal).toBe(8);
    expect(result.summary.evidenceEvaluatedPairCount).toBe(1);

    // 根拠を本文に実在する引用へ差し替えると指摘が消え、根拠裏付け充填率が 100 になる
    const grounded = analyzeCrossMatrix(fullyLinkedInput("grounded"));
    expect(grounded.findings.filter((f) => f.categoryId === "CMX-16")).toEqual([]);
    expect(grounded.findings.filter((f) => f.categoryId === "CMX-17")).toEqual([]);
    expect(grounded.pairs[0].groundedCellFillRatePercent).toBe(100);
    expect(grounded.pairs[0].groundedFilledCellCount).toBe(4);
    expect(grounded.summary.overallGroundedCellFillRatePercent).toBe(100);
    expect(
      grounded.findings.filter((f) => f.categoryId === "CMX-08")
    ).toEqual([]);
  });

  it("marks each cell grounded only when the direction that filled it carries grounded evidence", () => {
    const axes: CrossMatrixAxisSpec[] = [
      {
        axisId: "A",
        axisName: "軸A",
        items: [
          { id: "A-1", links: [{ targetId: "B-1", evidence: "A-1 と B-1 は関係する" }] },
          { id: "A-2", links: [{ targetId: "B-1" }] },
        ],
      },
      {
        axisId: "B",
        axisName: "軸B",
        items: [{ id: "B-1", links: ["A-1", "A-2"] }],
      },
    ];
    const documents: TestBasisDocument[] = [
      { name: "d.md", content: "A-1 と B-1 は関係する\nA-2 も存在する\nB-1 も存在する" },
    ];
    const pair = buildCrossMatrixPair(axes, "A", "B", undefined, DEFAULT_MAX_CELL_COUNT, documents);
    expect(pair.filledCellCount).toBe(2);
    expect(pair.groundedFilledCellCount).toBe(1);
    expect(pair.groundedCellFillRatePercent).toBe(50);
    expect(pair.cells.find((c) => c.rowItemId === "A-1")?.grounded).toBe(true);
    expect(pair.cells.find((c) => c.rowItemId === "A-2")?.grounded).toBe(false);
  });

  it("keeps evidence fields zeroed when the pair is skipped for exceeding maxCellCount", () => {
    const pair = buildCrossMatrixPair(
      fullyLinkedAxes("grounded"),
      "RISK",
      "METHOD",
      undefined,
      1,
      linkedDocuments
    );
    expect(pair.generated).toBe(false);
    expect(pair.evidenceEvaluated).toBe(false);
    expect(pair.groundedFilledCellCount).toBe(0);
    expect(pair.groundedCellFillRatePercent).toBe(0);
  });

  it("findDeclaredCoverageMismatches does not double-report when the declared fill rate is already wrong", () => {
    const pairs = [
      buildCrossMatrixPair(
        fullyLinkedAxes("missing"),
        "RISK",
        "METHOD",
        undefined,
        DEFAULT_MAX_CELL_COUNT,
        linkedDocuments
      ),
    ];
    expect(
      findDeclaredCoverageMismatches(pairs, [
        { axisA: "RISK", axisB: "METHOD", claimedFillRatePercent: 100 },
      ])
    ).toEqual([
      {
        axisA: "RISK",
        axisB: "METHOD",
        field: "claimedFillRatePercentGrounded",
        claimed: 100,
        actual: 0,
      },
    ]);

    // 従来の不一致があるときは claimedFillRatePercent のみを報告する
    expect(
      findDeclaredCoverageMismatches(pairs, [
        { axisA: "RISK", axisB: "METHOD", claimedFillRatePercent: 80 },
      ])
    ).toEqual([
      {
        axisA: "RISK",
        axisB: "METHOD",
        field: "claimedFillRatePercent",
        claimed: 80,
        actual: 100,
      },
    ]);
  });

  it("emits no CMX-16 / CMX-17 when documents is not given", () => {
    const result = analyzeCrossMatrix({ axes: fullyLinkedAxes("missing") });
    expect(result.findings.filter((f) => f.categoryId === "CMX-16")).toEqual([]);
    expect(result.findings.filter((f) => f.categoryId === "CMX-17")).toEqual([]);
    expect(result.summary.evidenceEvaluatedPairCount).toBe(0);
    expect(result.summary.overallGroundedCellFillRatePercent).toBe(0);
  });
});
