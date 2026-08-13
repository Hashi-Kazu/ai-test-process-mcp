import { describe, expect, it } from "vitest";
import {
  MIN_TESTBASIS_GROUNDING_LENGTH,
  buildTestBasisCorpus,
  expandGroundingSubjects,
  findUngroundedSubjects,
  renderTestBasisGroundingLines,
  testBasisGroundingCriteria,
} from "../src/testBasisGrounding.js";
import { renderScenarioFlows } from "../src/tools/designScenarioFlows.js";
import { renderTestData } from "../src/tools/designTestData.js";
import { renderConfigMatrix } from "../src/tools/designConfigMatrix.js";
import { renderDecisionTable } from "../src/tools/designDecisionTable.js";
import { renderPairwise } from "../src/tools/designPairwise.js";
import { renderTestArchitecture } from "../src/tools/designTestArchitecture.js";
import { renderDataFlowTiming } from "../src/tools/analyzeDataFlowTiming.js";
import { renderRegressionSuite } from "../src/tools/selectRegressionSuite.js";
import { expectInspectabilitySection } from "./inspectabilitySectionHelper.js";
import type {
  ConfigMatrixSpec,
  DataFlowTimingSpec,
  DecisionTableSpec,
  PairwiseSpec,
  RegressionSelectionSpec,
  ScenarioFlowSpec,
  TestArchitectureSpec,
  TestBasisDocument,
  TestBasisGroundingSubject,
  TestDataSpec,
} from "../src/types.js";

// 8ツール共通のテストベース原文。各ツールの spec は「この本文に実在する語」と
// 「捏造した語」を混ぜて宣言し、捏造側だけが指摘されることを確認する。
const BASIS: TestBasisDocument[] = [
  {
    name: "11_園内チケットシステム要求仕様書",
    content: [
      "# 園内チケットシステム要求仕様書",
      "F-PURCHASE 入場券購入: 来園者は券売機で入場券を購入できる。",
      "F-ENTRY 入場: 入場ゲートに入場券をかざすと入場を許可する。",
      "対応OSは Windows 11 とする。ブラウザは Chrome を対象とする。",
      "券種は 大人券 と 小人券 の2種類とする。",
      "入場券の状態は 未使用 と 使用済 の2つを持ち、入場時に 使用済 へ遷移する。",
      "同一の入場券で2回目の入場を試みた場合はエラーとする。",
      "決済連携サービスとの通信は 入場実績確定時 に行う。",
      "発券システムは 入場ゲート へ入場可否を返す。",
      "入場者数カウンタは日次で締める。",
    ].join("\n"),
  },
];

const BASIS_NAME = BASIS[0].name;

/** 実在照合節（見出し以降・次の `## ` 見出しまで）を切り出す。 */
function groundingSection(markdown: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^## \d+\. テストベースとの実在照合$/.test(l));
  expect(start).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

const UNINSPECTABLE_FRAGMENTS = [
  "testBasisDocuments が未指定のため",
  "実施していない(要確認)",
  "指摘0件は合格を意味しない",
];

// --- 共有モジュール単体 ---

describe("testBasisGrounding - 共有モジュール", () => {
  it("判定区分は TBG-01..TBG-04 の4件で、全項目が記入済み", () => {
    expect(testBasisGroundingCriteria.map((c) => c.id)).toEqual([
      "TBG-01",
      "TBG-02",
      "TBG-03",
      "TBG-04",
    ]);
    for (const c of testBasisGroundingCriteria) {
      expect(c.nameJa.length).toBeGreaterThan(0);
      expect(c.definition).toContain("正規化後の包含判定");
      expect(c.recommendedAction.length).toBeGreaterThan(0);
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
    expect(testBasisGroundingCriteria.filter((c) => c.severity === "high").map((c) => c.id)).toEqual([
      "TBG-01",
      "TBG-02",
      "TBG-03",
    ]);
    expect(testBasisGroundingCriterionSeverity("TBG-04")).toBe("medium");
  });

  function testBasisGroundingCriterionSeverity(id: string): string {
    return testBasisGroundingCriteria.find((c) => c.id === id)!.severity;
  }

  it("表記差(全角半角・大文字小文字・空白・記号)を吸収して照合する", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc", content: "対応OSは Windows 11 とする。" },
    ];
    const subjects: TestBasisGroundingSubject[] = [
      { kind: "label", place: "p1", target: "T1", fieldLabel: "水準値", text: "ｗｉｎｄｏｗｓ－１１" },
      { kind: "label", place: "p2", target: "T1", fieldLabel: "水準値", text: "windows11" },
    ];
    expect(findUngroundedSubjects(subjects, documents)).toEqual([]);
  });

  it("正規化後2文字未満は照合対象外として件数へ出す", () => {
    expect(MIN_TESTBASIS_GROUNDING_LENGTH).toBe(2);
    const subjects: TestBasisGroundingSubject[] = [
      { kind: "label", place: "p1", target: "T1", fieldLabel: "水準値", text: "A" },
      { kind: "label", place: "p2", target: "T1", fieldLabel: "水準値", text: "・" },
      { kind: "label", place: "p3", target: "T1", fieldLabel: "水準値", text: "大人券" },
    ];
    const expansion = expandGroundingSubjects(subjects);
    expect(expansion.subjects.map((s) => s.text)).toEqual(["大人券"]);
    expect(expansion.skipped.map((s) => s.text)).toEqual(["A", "・"]);
    // 対象外は未照合として報告しない
    expect(findUngroundedSubjects(subjects, BASIS)).toEqual([]);
    const lines = renderTestBasisGroundingLines("## 9. テストベースとの実在照合", subjects, BASIS);
    expect(lines.join("\n")).toContain("正規化後2文字未満で対象外 2件");
  });

  it("quotation は鍵括弧で囲んだ引用のみを対象にし、自由記述文そのものは逐語照合しない", () => {
    const subjects: TestBasisGroundingSubject[] = [
      {
        kind: "quotation",
        place: "p1",
        target: "T1",
        fieldLabel: "条件文",
        // 文そのものは本文に無いが、括弧引用は本文に実在する
        text: "仕様書に「入場を許可する」と書かれているため許可する",
      },
      {
        kind: "quotation",
        place: "p2",
        target: "T1",
        fieldLabel: "条件文",
        text: "仕様書に「入場を全面禁止する」と書かれている",
      },
    ];
    const expansion = expandGroundingSubjects(subjects);
    expect(expansion.subjects.map((s) => s.text)).toEqual(["入場を許可する", "入場を全面禁止する"]);
    const ungrounded = findUngroundedSubjects(subjects, BASIS);
    expect(ungrounded.map((u) => u.text)).toEqual(["入場を全面禁止する"]);
    expect(ungrounded[0].categoryId).toBe("TBG-02");
  });

  it("同一 kind ＋同一正規化文字列は重複除去し、初出の place を残す", () => {
    const subjects: TestBasisGroundingSubject[] = [
      { kind: "label", place: "first", target: "T1", fieldLabel: "水準値", text: "大人券" },
      { kind: "label", place: "second", target: "T2", fieldLabel: "水準値", text: "大 人 券" },
      { kind: "id", place: "third", target: "T3", fieldLabel: "機能ID", text: "大人券" },
    ];
    const expansion = expandGroundingSubjects(subjects);
    expect(expansion.subjects.map((s) => s.place)).toEqual(["first", "third"]);
  });

  it("documents 未指定・0件なら未照合0件を返す（無言合格にしない）", () => {
    const subjects: TestBasisGroundingSubject[] = [
      { kind: "label", place: "p1", target: "T1", fieldLabel: "水準値", text: "捏造した水準" },
    ];
    expect(findUngroundedSubjects(subjects, undefined)).toEqual([]);
    expect(findUngroundedSubjects(subjects, [])).toEqual([]);
    for (const documents of [undefined, [] as TestBasisDocument[]]) {
      const text = renderTestBasisGroundingLines("## 9. X", subjects, documents).join("\n");
      for (const fragment of UNINSPECTABLE_FRAGMENTS) expect(text).toContain(fragment);
      expect(text).not.toContain("- なし");
    }
  });

  it("documentName は本文ではなく文書名集合と照合する", () => {
    const documents: TestBasisDocument[] = [{ name: "要求仕様書", content: "別紙一覧を参照する。" }];
    const corpus = buildTestBasisCorpus(documents);
    expect(corpus.documentNames.has("要求仕様書")).toBe(true);
    const subjects: TestBasisGroundingSubject[] = [
      { kind: "documentName", place: "p1", target: "CM-01", fieldLabel: "出典文書名", text: "要求仕様書" },
      // 本文には出現するが文書名ではない → 未照合
      { kind: "documentName", place: "p2", target: "CM-02", fieldLabel: "出典文書名", text: "別紙一覧" },
    ];
    const ungrounded = findUngroundedSubjects(subjects, documents);
    expect(ungrounded.map((u) => u.text)).toEqual(["別紙一覧"]);
    expect(ungrounded[0].categoryId).toBe("TBG-04");
    expect(ungrounded[0].severity).toBe("medium");
  });

  it("セル値・引用文中の | をエスケープする", () => {
    const subjects: TestBasisGroundingSubject[] = [
      { kind: "label", place: "p1", target: "T|1", fieldLabel: "水準値", text: "A|B" },
    ];
    const text = renderTestBasisGroundingLines("## 9. X", subjects, BASIS).join("\n");
    expect(text).toContain("A\\|B");
    expect(text).toContain("T\\|1");
  });

  it("同一入力に対して同一出力を返す（決定的）", () => {
    const subjects: TestBasisGroundingSubject[] = [
      { kind: "label", place: "p1", target: "T1", fieldLabel: "水準値", text: "捏造水準" },
      { kind: "id", place: "p2", target: "T2", fieldLabel: "機能ID", text: "F-NOPE" },
    ];
    const a = renderTestBasisGroundingLines("## 9. X", subjects, BASIS);
    const b = renderTestBasisGroundingLines("## 9. X", subjects, BASIS);
    expect(a).toEqual(b);
  });
});

// --- 8ツールの spec ---

function scenarioSpec(): ScenarioFlowSpec {
  return {
    actors: [{ id: "A-USER", nameJa: "来園者", kind: "human" }],
    // F-ENTRY は本文に実在、F-GHOST は捏造
    featureIds: ["F-ENTRY", "F-GHOST"],
    useCases: [
      {
        id: "UC-01",
        nameJa: "入場券購入",
        primaryActor: "A-USER",
        preconditions: ["仕様書に「券売機で入場券を購入できる」とある"],
        mainFlow: [{ no: 1, actor: "A-USER", action: "入場ゲートに入場券をかざす", featureIds: ["F-ENTRY"] }],
      },
    ],
  };
}

function testDataSpec(): TestDataSpec {
  return {
    dataClasses: [
      {
        id: "DC-TICKET",
        nameJa: "入場券",
        states: [
          { id: "S1", nameJa: "未使用", isInitial: true },
          { id: "S2", nameJa: "使用済" },
          // 捏造した状態名
          { id: "S3", nameJa: "半券回収済" },
        ],
        transitions: [{ id: "T1", from: "S1", to: "S2", event: "入場" }],
      },
    ],
  };
}

function configMatrixSpec(): ConfigMatrixSpec {
  return {
    factors: [
      // Chrome は本文に実在、架空ブラウザ は捏造
      { id: "F1", name: "ブラウザ", levels: ["Chrome", "架空ブラウザ"] },
    ],
  };
}

function decisionTableSpec(): DecisionTableSpec {
  return {
    conditions: [
      {
        id: "C1",
        // 括弧引用のうち後者は捏造
        statement: "券種が「大人券」または「架空の年間パスポート」である",
        levels: ["Y", "N"],
      },
    ],
    actions: [{ id: "A1", statement: "仕様書どおり「入場を許可する」" }],
  };
}

function pairwiseSpec(): PairwiseSpec {
  return {
    factors: [
      { id: "F1", name: "券種", levels: ["大人券", "捏造した特別券"] },
      { id: "F2", name: "ブラウザ", levels: ["Chrome", "Windows 11"] },
    ],
  };
}

function testArchitectureSpec(): TestArchitectureSpec {
  return {
    containers: [
      {
        id: "TCN-01",
        nameJa: "入場ゲート",
        responsibility: "仕様書の「入場を許可する」を検証する",
        testLevel: "system-testing",
        testTypes: ["機能テスト"],
        priorityClass: "must",
        targets: ["入場ゲート", "捏造サブシステム"],
      },
    ],
    testConditions: [{ id: "TC-01", target: "入場ゲート", containerIds: ["TCN-01"] }],
  };
}

function dataFlowSpec(): DataFlowTimingSpec {
  return {
    components: [
      { id: "CP-1", nameJa: "発券システム" },
      { id: "CP-2", nameJa: "決済連携サービス" },
    ],
    dataItems: [{ id: "DI-1", nameJa: "入場実績" }],
    communications: [
      {
        id: "CM-01",
        fromId: "CP-1",
        toId: "CP-2",
        dataItemIds: ["DI-1"],
        timing: { kind: "event", trigger: "仕様書の「入場実績確定時」に送信する" },
        requirementIds: ["F-ENTRY"],
        // 投入していない文書名 → TBG-04
        sourceRef: { document: "99_存在しない設計書" },
      },
    ],
  };
}

function regressionSpec(): RegressionSelectionSpec {
  return {
    testConditions: [
      { id: "TC-01", target: "入場ゲート", statement: "仕様書の「入場を許可する」を確認する" },
      { id: "TC-02", target: "捏造した精算機", statement: "仕様書の「捏造した精算処理」を確認する" },
    ],
  };
}

interface ToolCase {
  toolName: string;
  render: (withBasis: boolean) => string;
  /** 捏造した語 → 期待する判定区分ID */
  expected: { text: string; categoryId: string }[];
  /** 本文に実在するため指摘されてはならない語 */
  grounded: string[];
}

const TOOL_CASES: ToolCase[] = [
  {
    toolName: "design_scenario_flows",
    render: (withBasis) =>
      renderScenarioFlows(
        withBasis ? { ...scenarioSpec(), testBasisDocuments: BASIS } : scenarioSpec()
      ),
    expected: [{ text: "F-GHOST", categoryId: "TBG-03" }],
    grounded: ["F-ENTRY", "券売機で入場券を購入できる"],
  },
  {
    toolName: "design_test_data",
    render: (withBasis) =>
      renderTestData(withBasis ? { ...testDataSpec(), testBasisDocuments: BASIS } : testDataSpec()),
    expected: [{ text: "半券回収済", categoryId: "TBG-01" }],
    grounded: ["未使用", "使用済"],
  },
  {
    toolName: "design_config_matrix",
    render: (withBasis) =>
      renderConfigMatrix(
        withBasis ? { ...configMatrixSpec(), testBasisDocuments: BASIS } : configMatrixSpec()
      ),
    expected: [{ text: "架空ブラウザ", categoryId: "TBG-01" }],
    grounded: ["Chrome"],
  },
  {
    toolName: "design_decision_table",
    render: (withBasis) =>
      renderDecisionTable(
        withBasis ? { ...decisionTableSpec(), testBasisDocuments: BASIS } : decisionTableSpec()
      ),
    expected: [{ text: "架空の年間パスポート", categoryId: "TBG-02" }],
    grounded: ["入場を許可する"],
  },
  {
    toolName: "design_pairwise",
    render: (withBasis) =>
      renderPairwise(withBasis ? { ...pairwiseSpec(), testBasisDocuments: BASIS } : pairwiseSpec()),
    expected: [{ text: "捏造した特別券", categoryId: "TBG-01" }],
    grounded: ["大人券", "Windows 11"],
  },
  {
    toolName: "design_test_architecture",
    render: (withBasis) =>
      renderTestArchitecture(
        withBasis
          ? { ...testArchitectureSpec(), testBasisDocuments: BASIS }
          : testArchitectureSpec()
      ),
    expected: [{ text: "捏造サブシステム", categoryId: "TBG-01" }],
    grounded: ["入場ゲート"],
  },
  {
    toolName: "analyze_data_flow_timing",
    render: (withBasis) =>
      renderDataFlowTiming(
        withBasis ? { ...dataFlowSpec(), testBasisDocuments: BASIS } : dataFlowSpec()
      ),
    expected: [{ text: "99_存在しない設計書", categoryId: "TBG-04" }],
    grounded: ["発券システム", "入場実績確定時", "F-ENTRY"],
  },
  {
    toolName: "select_regression_suite",
    render: (withBasis) =>
      renderRegressionSuite(
        withBasis ? { ...regressionSpec(), testBasisDocuments: BASIS } : regressionSpec()
      ),
    expected: [
      { text: "捏造した精算機", categoryId: "TBG-01" },
      { text: "捏造した精算処理", categoryId: "TBG-02" },
    ],
    grounded: ["入場を許可する"],
  },
];

describe.each(TOOL_CASES)("$toolName - テストベース実在照合", (toolCase) => {
  it("捏造した語を対応する TBG-0N で指摘し、実在する語は指摘しない", () => {
    const section = groundingSection(toolCase.render(true));
    for (const { text, categoryId } of toolCase.expected) {
      expect(section).toContain(categoryId);
      expect(section).toContain(text);
    }
    for (const text of toolCase.grounded) {
      expect(section).not.toContain(`「${text}」がテストベース`);
    }
    expect(section).toContain("照合対象:");
  });

  it("testBasisDocuments 未指定なら検査不能(要確認)として出す（無言合格にしない）", () => {
    const markdown = toolCase.render(false);
    const section = groundingSection(markdown);
    for (const fragment of UNINSPECTABLE_FRAGMENTS) expect(section).toContain(fragment);
    expect(section).not.toContain("- なし");
    expect(markdown).toContain("- テストベース実在照合: 未実施(testBasisDocuments 未指定のため検査不能(要確認))");
  });

  it("検査実行状況の対照表が整合し、投入有無で実行/検査不能が切り替わる", () => {
    const withBasis = toolCase.render(true);
    expectInspectabilitySection(withBasis, toolCase.toolName);
    expect(withBasis).toContain("| 実行 | テストベースとの実在照合 |");
    expect(withBasis).toContain("- 実行: 1区分 / 検査不能: 0区分");

    const withoutBasis = toolCase.render(false);
    expectInspectabilitySection(withoutBasis, toolCase.toolName);
    expect(withoutBasis).toContain("| 検査不能 | テストベースとの実在照合 |");
    expect(withoutBasis).toContain("- 実行: 0区分 / 検査不能: 1区分");
  });

  it("サマリへ実在照合の要約行を1行だけ追加する", () => {
    const markdown = toolCase.render(true);
    const summaryLines = markdown
      .split("\n")
      .filter((l) => l.startsWith("- テストベース実在照合: "));
    expect(summaryLines).toHaveLength(1);
    expect(summaryLines[0]).toMatch(/^- テストベース実在照合: 対象\d+件 \/ 未照合\d+件$/);
  });
});

// --- 非回帰 ---

/** 新節・対照表・サマリ追加行を取り除いた本体部分。 */
function bodyWithoutGroundingOutput(markdown: string): string {
  return markdown
    .split("\n")
    .filter((l) => !l.startsWith("- テストベース実在照合: "))
    .join("\n")
    .split(/\n## \d+\. テストベースとの実在照合\n/)[0];
}

describe("非回帰: testBasisDocuments を渡しても既存節の出力は変わらない", () => {
  it.each(TOOL_CASES)("$toolName", (toolCase) => {
    expect(bodyWithoutGroundingOutput(toolCase.render(true))).toBe(
      bodyWithoutGroundingOutput(toolCase.render(false))
    );
  });

  it("design_scenario_flows は testBasisDocuments を渡してもシナリオ生成を打ち切らない", () => {
    const withBasis = renderScenarioFlows({ ...scenarioSpec(), testBasisDocuments: BASIS });
    const withoutBasis = renderScenarioFlows(scenarioSpec());
    expect(withBasis).toContain("## 3. シナリオ一覧");
    expect(withBasis).not.toContain("- 未算出(理由:");
    expect(bodyWithoutGroundingOutput(withBasis)).toBe(bodyWithoutGroundingOutput(withoutBasis));
  });

  it("投入した文書名そのものは TBG-04 で指摘されない", () => {
    const spec = dataFlowSpec();
    spec.communications[0].sourceRef = { document: BASIS_NAME };
    const section = groundingSection(renderDataFlowTiming({ ...spec, testBasisDocuments: BASIS }));
    expect(section).not.toContain("TBG-04");
  });
});
