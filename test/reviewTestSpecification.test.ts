import { describe, expect, it } from "vitest";
import { renderTestSpecificationReview } from "../src/tools/reviewTestSpecification.js";
import { testSpecificationReviewChecklist } from "../src/resources/testSpecificationReviewChecklist.js";
import type {
  ReviewTestSpecificationInput,
  TestBasisDocument,
  TestCaseSpec,
} from "../src/types.js";

const basisDocuments: TestBasisDocument[] = [
  {
    name: "要求仕様書",
    content: [
      "# 機能要求",
      "EH-100 チケットを購入できる",
      "EH-101 チケットをキャンセルできる",
      "EH-102 購入履歴を参照できる",
    ].join("\n"),
  },
];

const specText = ["# テスト仕様書", "## 対象", "園内チケットシステムの購入機能"].join("\n");

function makeCase(overrides: Partial<TestCaseSpec> & { caseId: string }): TestCaseSpec {
  return {
    title: `ケース ${overrides.caseId}`,
    testConditionId: "TC-001",
    derivedFrom: ["EH-100"],
    techniqueId: "boundary-value-analysis",
    coverageTargets: ["BV:枚数:0"],
    priority: "高",
    preconditions: [{ name: "ログイン状態", value: "ログイン済み" }],
    steps: [{ no: 1, action: "購入ボタンを押す", expected: "完了画面が表示される" }],
    ...overrides,
  } as TestCaseSpec;
}

function baseInput(overrides: Partial<ReviewTestSpecificationInput> = {}): ReviewTestSpecificationInput {
  return {
    testBasisDocuments: basisDocuments,
    testSpecificationText: specText,
    ...overrides,
  };
}

describe("renderTestSpecificationReview - 全体構造", () => {
  const markdown = renderTestSpecificationReview(
    baseInput({ testCases: [makeCase({ caseId: "TCS-001" })] })
  );

  it("renders the three top-level chapters", () => {
    expect(markdown).toContain("# テスト仕様書レビュー結果");
    expect(markdown).toContain("## 1. 決定的検査(自動)");
    expect(markdown).toContain("## 2. 意味的レビュー用チェックリスト(呼び出し側 LLM が適用)");
    expect(markdown).toContain("## 3. 改善提案");
  });

  it("lists the target documents", () => {
    expect(markdown).toContain("- テストベース: 要求仕様書(行数: 4)");
    expect(markdown).toContain("- テスト仕様書(行数: 3)");
  });

  it("ends with a single trailing newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("is deterministic for the same input", () => {
    const again = renderTestSpecificationReview(
      baseInput({ testCases: [makeCase({ caseId: "TCS-001" })] })
    );
    expect(again).toBe(markdown);
  });
});

describe("renderTestSpecificationReview - チェックリスト", () => {
  const markdown = renderTestSpecificationReview(baseInput());

  it("renders all 14 checklist items in section 2", () => {
    for (const item of testSpecificationReviewChecklist.items) {
      expect(markdown).toContain(`### ${item.id} [${item.severity}] ${item.title}`);
      expect(markdown).toContain(item.check);
    }
    expect(testSpecificationReviewChecklist.items.length).toBe(14);
  });

  it("renders improvement actions for each item in section 3", () => {
    for (const item of testSpecificationReviewChecklist.items) {
      expect(markdown).toContain(`### ${item.id} ${item.title}`);
      for (const action of item.improvementActions) {
        expect(markdown).toContain(`- ${action}`);
      }
    }
  });

  it("renders glossary references", () => {
    expect(markdown).toContain("根拠: 用語 test-condition");
    expect(markdown).toContain("根拠: 用語 -");
  });
});

describe("renderTestSpecificationReview - testCases 未指定の簡易モード", () => {
  const markdown = renderTestSpecificationReview(baseInput());

  it("notes that only simple checks were performed", () => {
    expect(markdown).toContain("testCases が未指定のため、ID抽出ベースの簡易チェックのみを実施した");
  });

  it("still reports the automatically extracted requirement ids", () => {
    expect(markdown).toContain("- 抽出した要件ID数: 3(テストベースの定義行から自動抽出)");
    expect(markdown).toContain("| EH-100 | - | 0 |");
  });

  it("marks bidirectional judgements as not determinable", () => {
    expect(markdown).toContain("#### 1.2.1 未カバー要件候補(forward)");
    expect(markdown).toContain("- testCases 未指定のため判定不可");
  });

  it("does not render the condition or risk axes", () => {
    expect(markdown).not.toContain("テスト条件IDカバレッジ");
    expect(markdown).not.toContain("リスクIDカバレッジ");
  });
});

describe("renderTestSpecificationReview - 要件IDカバレッジ(双方向)", () => {
  const markdown = renderTestSpecificationReview(
    baseInput({
      testCases: [
        makeCase({ caseId: "TCS-001", derivedFrom: ["EH-100"] }),
        makeCase({ caseId: "TCS-002", derivedFrom: ["ZZ-900"] }),
      ],
    })
  );

  it("renders the forward coverage table", () => {
    expect(markdown).toContain("| 要件ID | 紐づくケースID | 件数 |");
    expect(markdown).toContain("| EH-100 | TCS-001 | 1 |");
  });

  it("lists uncovered requirement ids", () => {
    expect(markdown).toContain(
      "- [high] EH-101: どのケースの由来にも現れない。テストケースを追加するか対象外の理由を明記すること。"
    );
    expect(markdown).toContain("- [high] EH-102:");
  });

  it("lists unfounded cases in reverse coverage", () => {
    expect(markdown).toContain("#### 1.2.2 根拠不明テスト・過剰テスト候補(reverse)");
    expect(markdown).toContain(
      "- [high] TCS-002: 由来「ZZ-900」が requirementIds[] のいずれにも一致しない。"
    );
  });

  it("uses explicitly supplied requirementIds when given", () => {
    const md = renderTestSpecificationReview(
      baseInput({ requirementIds: ["REQ-1"], testCases: [makeCase({ caseId: "TCS-001" })] })
    );
    expect(md).toContain("- 抽出した要件ID数: 1(入力指定)");
    expect(md).toContain("| REQ-1 | - | 0 |");
  });

  it("guides the caller when no requirement id could be extracted", () => {
    const md = renderTestSpecificationReview({
      testBasisDocuments: [{ name: "memo", content: "IDのない自由記述" }],
      testSpecificationText: specText,
    });
    expect(md).toContain("- 要件IDを抽出できなかった。idPatterns で抽出パターンを指定するか");
  });
});

describe("renderTestSpecificationReview - テスト条件IDカバレッジ(双方向)", () => {
  const markdown = renderTestSpecificationReview(
    baseInput({
      testConditions: [
        { id: "TC-001", target: "購入", statement: "購入できる", derivedFrom: ["EH-100"] },
        { id: "TC-002", target: "取消", statement: "取消できる", derivedFrom: ["EH-101"] },
      ],
      testCases: [
        makeCase({ caseId: "TCS-001", testConditionId: "TC-001" }),
        makeCase({ caseId: "TCS-002", testConditionId: "TC-099" }),
      ],
    })
  );

  it("renders the condition axis as section 1.3", () => {
    expect(markdown).toContain("### 1.3 テスト条件IDカバレッジ(双方向)");
    expect(markdown).toContain("| テスト条件ID | 紐づくケースID | 件数 |");
    expect(markdown).toContain("| TC-001 | TCS-001 | 1 |");
  });

  it("lists uncovered conditions (forward)", () => {
    expect(markdown).toContain("#### 1.3.1 未カバーテスト条件(forward)");
    expect(markdown).toContain("- [high] TC-002: 紐づくテストケースが0件。テストケースを追加すること。");
  });

  it("lists cases referencing unknown conditions (reverse)", () => {
    expect(markdown).toContain("#### 1.3.2 根拠不明テスト候補(reverse)");
    expect(markdown).toContain(
      "- [high] TCS-002: 由来条件「TC-099」が testConditions[].id に存在しない。"
    );
  });
});

describe("renderTestSpecificationReview - リスクIDカバレッジ(双方向)", () => {
  const withConditions = renderTestSpecificationReview(
    baseInput({
      testConditions: [
        { id: "TC-001", target: "購入", statement: "購入できる", derivedFrom: ["EH-100"] },
      ],
      risks: [
        { id: "R-001", description: "決済失敗" },
        { id: "R-002", description: "二重購入" },
      ],
      testCases: [
        makeCase({ caseId: "TCS-001", derivedFrom: ["EH-100", "R-001"] }),
        makeCase({ caseId: "TCS-002", derivedFrom: ["EH-100", "R-009"] }),
      ],
    })
  );

  it("renders the risk axis after the condition axis as section 1.4", () => {
    expect(withConditions).toContain("### 1.4 リスクIDカバレッジ(双方向)");
    expect(withConditions).toContain("| リスクID | 紐づくケースID | 件数 |");
    expect(withConditions).toContain("| R-001 | TCS-001 | 1 |");
  });

  it("lists uncovered risks (forward)", () => {
    expect(withConditions).toContain("#### 1.4.1 未カバーリスク(forward)");
    expect(withConditions).toContain("- [high] R-002: どのケースの由来にも現れない。");
  });

  it("lists unknown risk refs (reverse)", () => {
    expect(withConditions).toContain("#### 1.4.2 未知のリスクID参照(reverse)");
    expect(withConditions).toContain("- [medium] TCS-002: 由来「R-009」が risks[].id に存在しない。");
  });

  it("counts a risk as covered when only linked transitively via a test condition", () => {
    const md = renderTestSpecificationReview(
      baseInput({
        testConditions: [
          { id: "TC-001", target: "決済", statement: "決済できる", derivedFrom: ["EH-100", "R-001"] },
        ],
        risks: [{ id: "R-001", description: "決済失敗" }],
        testCases: [
          // derivedFrom は要件IDのみで、リスクは testConditionId 経由の間接カバレッジ
          makeCase({ caseId: "TCS-001", testConditionId: "TC-001", derivedFrom: ["EH-100"] }),
        ],
      })
    );
    expect(md).toContain("| R-001 | TCS-001 | 1 |");
    expect(md).toContain("#### 1.4.1 未カバーリスク(forward)");
    expect(md).toContain("- 未カバーなし");
  });

  it("becomes section 1.3 when testConditions is omitted", () => {
    const md = renderTestSpecificationReview(
      baseInput({
        risks: [{ id: "R-001", description: "決済失敗" }],
        testCases: [makeCase({ caseId: "TCS-001" })],
      })
    );
    expect(md).toContain("### 1.3 リスクIDカバレッジ(双方向)");
    expect(md).not.toContain("テスト条件IDカバレッジ");
  });
});

describe("renderTestSpecificationReview - 構造検査", () => {
  const markdown = renderTestSpecificationReview(
    baseInput({
      testSpecificationText: [
        "# テスト仕様書",
        "## 網羅基準",
        "全要件に1件以上のケースを割り当てる",
        "## 優先度の基準",
        "影響度と発生確率で決める",
      ].join("\n"),
      testCases: [
        // 表記ゆれ + 優先度未設定 + プレースホルダー前提条件
        makeCase({
          caseId: "TCS-001",
          derivedFrom: ["EH100"],
          priority: undefined,
          preconditions: [{ name: "状態", value: "特になし" }],
        }),
        // 重複ID + 主観語 + 期待結果空欄
        makeCase({
          caseId: "TCS-002",
          steps: [
            { no: 1, action: "購入する", expected: "正しく登録される" },
            { no: 2, action: "確認する", expected: "   " },
          ],
        }),
        makeCase({ caseId: "TCS-002" }),
        // 検証点不足
        makeCase({
          caseId: "TCS-003",
          steps: Array.from({ length: 6 }, (_, i) => ({
            no: i + 1,
            action: `操作${i + 1}`,
            expected: "画面が表示される",
          })),
        }),
      ],
    })
  );

  it("reports id notation mismatches", () => {
    expect(markdown).toContain("ID表記の同期");
    expect(markdown).toContain(
      "- [medium] TCS-001 の derivedFrom「EH100」は、テストベース定義の「EH-100」と正規化後は一致する。表記を揃えること。"
    );
  });

  it("reports duplicate case ids and empty expected results", () => {
    expect(markdown).toContain("- [high] 重複ケースID: TCS-002(2件)");
    expect(markdown).toContain("- [high] TCS-002 手順2: 期待結果が空欄である。");
  });

  it("reports the priority distribution, unset cases and criteria declaration", () => {
    expect(markdown).toContain("| 優先度 | 件数 |");
    expect(markdown).toContain("| 高 | 3 |");
    expect(markdown).toContain("| 未設定 | 1 |");
    expect(markdown).toContain("- [medium] 優先度未設定ケース(1件): TCS-001");
    expect(markdown).toContain("- 優先度の判定基準の記述あり(1件)");
    expect(markdown).toContain("「優先度の基準」(testSpecificationText:4)");
  });

  it("reports placeholder-only preconditions", () => {
    expect(markdown).toContain("- [high] TCS-001(placeholder-only):");
  });

  it("reports insufficient verification points", () => {
    expect(markdown).toContain(
      "- [medium] TCS-003: 手順が6件あるのに対し期待結果のユニーク値が1件しかない。"
    );
  });

  it("reports subjective expected results", () => {
    expect(markdown).toContain("- [medium] TCS-002 手順1:");
    expect(markdown).toContain("主観語「正しく」");
  });

  it("reports the coverage criteria declaration as present", () => {
    expect(markdown).toContain("- 網羅基準の記述あり");
    expect(markdown).toContain("「網羅基準」(testSpecificationText:2)");
  });

  it("renders a summary line", () => {
    expect(markdown).toMatch(/### 1\.\d+ サマリ/);
    expect(markdown).toContain("優先度基準宣言: あり");
    expect(markdown).toContain("網羅基準宣言: あり");
  });
});

describe("renderTestSpecificationReview - 宣言なし・指摘なしの場合", () => {
  const markdown = renderTestSpecificationReview(
    baseInput({
      testCases: [makeCase({ caseId: "TCS-001" }), makeCase({ caseId: "TCS-002", derivedFrom: ["EH-101"] })],
      requirementIds: ["EH-100", "EH-101"],
    })
  );

  it("reports missing declarations as findings", () => {
    expect(markdown).toContain("- [medium] 網羅基準の記述が見つからない。テスト仕様書に明記すること。");
    expect(markdown).toContain(
      "- [medium] 優先度の判定基準の記述が見つからない。テスト仕様書に明記すること。"
    );
    expect(markdown).toContain("網羅基準宣言: なし");
  });

  it("reports clean results for each structural check", () => {
    expect(markdown).toContain("- 未カバーなし");
    expect(markdown).toContain("- 表記ゆれなし");
    expect(markdown).toContain("- 重複ケースID: なし");
    expect(markdown).toContain("- 期待結果の空欄: なし");
    expect(markdown).toContain("- 優先度未設定ケース: なし");
    expect(markdown).toContain("- 検証点不足なし");
  });

  it("escapes pipe characters in table cells", () => {
    const md = renderTestSpecificationReview(
      baseInput({ requirementIds: ["EH|100"], testCases: [makeCase({ caseId: "TCS-001" })] })
    );
    expect(md).toContain("| EH\\|100 | - | 0 |");
  });
});
