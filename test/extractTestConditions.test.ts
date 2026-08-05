import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderTestConditions } from "../src/tools/extractTestConditions.js";
import { guidewordDictionary } from "../src/resources/guidewordDictionary.js";
import { riskAnalysisFrame } from "../src/resources/riskAnalysisFrame.js";
import type { ExtractTestConditionsInput } from "../src/types.js";

const input: ExtractTestConditionsInput = {
  requirementIds: ["R-001", "R-002", "R-003"],
  personas: [
    { id: "P-001", role: "来園者", concerns: "並ばずに入場したい" },
    { id: "P-002", role: "運用担当" },
  ],
  risks: [{ id: "RK-001", description: "入場時に二重課金が起きる", impact: 5, likelihood: 2 }],
  testConditions: [
    {
      id: "TC-001",
      target: "F-001",
      perspectiveCategoryId: "TPC-01",
      statement: "チケット購入が完了する",
      source: "testbase",
      derivedFrom: ["R-001"],
      priority: "高",
      impact: 5,
      likelihood: 5,
      changeCategory: "new",
      recommendedTechniques: ["equivalence-partitioning", "not-a-technique"] as never,
    },
    {
      id: "TC-002",
      target: "F-002",
      perspectiveCategoryId: "TPC-03",
      statement: "購入枚数が上限|下限で切り替わる",
      source: "risk",
      derivedFrom: ["RK-001"],
      impact: 1,
      likelihood: 1,
      changeCategory: "existing-unaffected",
      priority: "高",
    },
    {
      id: "TC-004",
      target: "F-003",
      perspectiveCategoryId: "TPC-15",
      statement: "他人のチケットを参照できない",
      source: "stakeholder",
      derivedFrom: ["P-999"],
      priority: "中",
    },
    {
      id: "TC-005",
      target: "F-004",
      perspectiveCategoryId: "TPC-07",
      statement: "同時購入で在庫が破綻しない",
      source: "guideword",
      derivedFrom: ["R-001"],
    },
  ],
};

const markdown = renderTestConditions(input);

describe("renderTestConditions", () => {
  it("renders the top-level heading exactly once", () => {
    expect(markdown).toContain("# テスト条件抽出結果");
    expect(markdown.split("\n").filter((l) => l === "# テスト条件抽出結果")).toHaveLength(1);
  });

  it("renders all sections from 1 to 9", () => {
    for (const heading of [
      "## 1. 前提と宣言",
      "## 2. テスト条件表",
      "## 3. 決定的検査(自動)",
      "## 4. 採用した優先度基準",
      "## 5. 推奨技法 → Phase 3 連携",
      "## 6. 観点カタログによる追加観点の洗い出し指示(意味的層)",
      "## 7. ガイドワード法による未記載リスクの洗い出し指示(意味的層)",
      "## 8. リスク分析フレームの適用指示(意味的層)",
      "## 9. ステークホルダー／ペルソナ視点の洗い出し指示(意味的層)",
    ]) {
      expect(markdown).toContain(heading);
    }
  });

  it("renders the 9-column test condition table header", () => {
    expect(markdown).toContain(
      "| 条件ID | 対象 | 観点カテゴリ | 条件文 | 優先度 | リスクレベル | 導出根拠 | 推奨技法 | 根拠位置 |"
    );
  });

  it("lists uncovered requirement ids under section 3.2", () => {
    const section = markdown.split("### 3.2 未カバー要件ID一覧")[1].split("### 3.3")[0];
    expect(section).toContain("R-002");
    expect(section).toContain("R-003");
    expect(section).not.toContain("R-001");
  });

  it("always notes that section 3.2 coverage is limited to the declared population, even with uncovered ids", () => {
    const section = markdown.split("### 3.2 未カバー要件ID一覧")[1].split("### 3.3")[0];
    expect(section).toContain("audit_id_population で検証すること");
  });

  it("lists unused perspective categories under section 3.3", () => {
    const section = markdown.split("### 3.3 観点カテゴリの被覆状況")[1].split("### 3.4")[0];
    expect(section).toContain("未使用の観点カテゴリ(抜け漏れ候補):");
    expect(section).toContain("[medium] TPC-02");
    expect(section).not.toContain("[medium] TPC-01 ");
  });

  it("reports id gaps under section 3.4", () => {
    const section = markdown.split("### 3.4 条件IDの重複・欠番")[1].split("### 3.5")[0];
    expect(section).toContain("- 欠番: TC-003");
  });

  it("lists conditions without priority under section 3.5", () => {
    const section = markdown.split("### 3.5 優先度未設定のテスト条件")[1].split("### 3.6")[0];
    expect(section).toContain("TC-005");
    expect(section).not.toContain("TC-001");
  });

  it("lists unresolved derivedFrom references under section 3.7", () => {
    const section = markdown.split("### 3.7 derivedFrom の未解決参照")[1].split("### 3.8")[0];
    expect(section).toContain("P-999");
    expect(section).toContain("personas[].id");
  });

  it("lists unknown technique ids under section 3.8", () => {
    const section = markdown.split("### 3.8 未知の推奨技法ID")[1].split("### 3.9")[0];
    expect(section).toContain("not-a-technique");
  });

  it("emits '逸脱理由: 未記入(要記入)' when a deviating condition has no reason", () => {
    expect(markdown).toContain("逸脱理由: 未記入(要記入)");
  });

  it("includes every guideword procedure step", () => {
    for (const step of guidewordDictionary.procedure) {
      expect(markdown).toContain(step);
    }
  });

  it("maps equivalence-partitioning to design_equivalence_partitioning in section 5", () => {
    const section = markdown.split("## 5. 推奨技法 → Phase 3 連携")[1].split("## 6.")[0];
    expect(section).toContain("equivalence-partitioning");
    expect(section).toContain("design_equivalence_partitioning");
    expect(section).toContain("この一覧を generate_test_cases への入力として引き継ぐこと。");
  });

  it("escapes pipe characters inside cells", () => {
    expect(markdown).toContain("購入枚数が上限\\|下限で切り替わる");
  });

  it("renders the risk score formula and the band mapping", () => {
    expect(markdown).toContain("### 4.1 リスクレベル算出式");
    expect(markdown).toContain("### 4.2 リスクスコア → 優先度の写像");
    expect(markdown).toContain("| リスクレベル | スコア範囲 | 優先度 | 指針 |");
    expect(markdown).toContain("changeCategory が未指定の場合、changeWeight は既定値 2 として計算する。");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(input);
    expect(renderTestConditions(input)).toBe(markdown);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("renders section 3.9, 3.10, 3.11 and 3.12 exactly once each", () => {
    expect(markdown.split("\n").filter((l) => l === "### 3.9 リスク区分の被覆状況")).toHaveLength(1);
    expect(
      markdown.split("\n").filter((l) => l === "### 3.10 根拠位置が未特定のテスト条件")
    ).toHaveLength(1);
    expect(
      markdown.split("\n").filter((l) => l === "### 3.11 ペルソナ4象限の記入状況")
    ).toHaveLength(1);
    expect(markdown.split("\n").filter((l) => l === "### 3.12 サマリ")).toHaveLength(1);
  });

  it("marks source location as 未特定 and skips detection when requirementSources is not provided", () => {
    const section = markdown.split("### 3.10 根拠位置が未特定のテスト条件")[1].split("### 3.11")[0];
    expect(section).toContain("- なし");

    const conditionRow = markdown
      .split("\n")
      .find((l) => l.startsWith("| TC-001 |"));
    expect(conditionRow).toContain("未特定");
  });
});

describe("renderTestConditions with requirementSources", () => {
  const inputWithSources: ExtractTestConditionsInput = {
    requirementIds: ["EH-100"],
    testConditions: [
      {
        id: "TC-001",
        target: "F-001",
        perspectiveCategoryId: "TPC-01",
        statement: "発券機が起動する",
        source: "testbase",
        derivedFrom: ["EH-100"],
        priority: "高",
      },
    ],
    requirementSources: [
      {
        requirementId: "EH-100",
        document: "spec.md",
        startLine: 652,
        endLine: 677,
        label: "EH-100 発券機起動",
      },
    ],
  };
  const markdownWithSources = renderTestConditions(inputWithSources);

  it("shows the resolved source citation in the condition table", () => {
    const conditionRow = markdownWithSources
      .split("\n")
      .find((l) => l.startsWith("| TC-001 |"));
    expect(conditionRow).toContain("(EH-100 発券機起動, line 652-677)");
  });

  it("does not flag TC-001 as missing a source ref when requirementSources resolves it", () => {
    const section = markdownWithSources
      .split("### 3.10 根拠位置が未特定のテスト条件")[1]
      .split("### 3.11")[0];
    expect(section).toContain("- なし");
  });

  it("also notes the population-limited caveat under section 3.2 when there are no uncovered ids", () => {
    const section = markdownWithSources.split("### 3.2 未カバー要件ID一覧")[1].split("### 3.3")[0];
    expect(section).toContain("- 未カバーなし");
    expect(section).toContain("audit_id_population で検証すること");
  });
});

describe("renderTestConditions with riskCategoryId", () => {
  const input2: ExtractTestConditionsInput = {
    requirementIds: ["R-001"],
    risks: [
      { id: "RK-001", description: "既知区分のリスク", impact: 5, likelihood: 2, riskCategoryId: "RC-04" },
      { id: "RK-002", description: "未知区分のリスク", riskCategoryId: "RC-99" },
    ],
    testConditions: [
      {
        id: "TC-001",
        target: "F-001",
        perspectiveCategoryId: "TPC-01",
        statement: "条件文",
        source: "testbase",
        derivedFrom: ["R-001"],
        priority: "高",
        riskCategoryId: "RC-99",
      },
    ],
  };
  const markdown2 = renderTestConditions(input2);

  it("renders all risk categories with 0-count categories flagged as [medium]", () => {
    const section = markdown2.split("### 3.9 リスク区分の被覆状況")[1].split("### 3.10")[0];
    for (const rc of riskAnalysisFrame.riskCategories) {
      expect(section).toContain(rc.id);
    }
    const unusedIds = riskAnalysisFrame.riskCategories
      .filter((rc) => rc.id !== "RC-04")
      .map((rc) => rc.id);
    for (const id of unusedIds) {
      expect(section).toContain(`[medium] ${id}`);
    }
  });

  it("flags the unknown risk category id", () => {
    expect(markdown2).toContain("「RC-99」はリスク分析フレームに存在しないリスク区分IDである。");
  });

  it("includes the unused/unknown risk category counters in the 3.12 summary", () => {
    const summaryLine = markdown2
      .split("\n")
      .find((l) => l.startsWith("- 対象要件ID数:"));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain("未使用リスク区分数:");
    expect(summaryLine).toContain("未知リスク区分ID数:");
  });

  it("renders all risk categories and control flaw patterns in section 8", () => {
    const section = markdown2.split("## 8. リスク分析フレームの適用指示(意味的層)")[1].split("## 9.")[0];
    for (const rc of riskAnalysisFrame.riskCategories) {
      expect(section).toContain(rc.id);
      expect(section).toContain(rc.nameJa);
    }
    for (const p of riskAnalysisFrame.controlFlawFrame.patterns) {
      expect(section).toContain(p.id);
      expect(section).toContain(p.nameJa);
      for (const q of p.probeQuestions) {
        expect(section).toContain(q);
      }
    }
  });

  it("renders the 6-column risk list table header with a category column", () => {
    expect(markdown2).toContain("| リスクID | 内容 | 区分 | 影響度 | 発生可能性 | 変更区分 |");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(input2);
    expect(renderTestConditions(input2)).toBe(markdown2);
    expect(JSON.stringify(input2)).toBe(snapshot);
  });
});

describe("renderTestConditions with persona quadrants", () => {
  const inputPersona: ExtractTestConditionsInput = {
    requirementIds: ["R-001"],
    personas: [
      {
        id: "P-001",
        role: "来園者",
        name: "田中",
        demographics: ["30代", "会社員", "スマートフォン利用"],
        saysAndThinks: ["並ぶ時間がもったいない"],
        goals: ["入場までの待ち時間を短くしたい"],
        painPoints: ["当日券の列が長い"],
      },
      { id: "P-002", role: "運用担当", concerns: "発券機の障害対応|手順が煩雑" },
      { id: "P-003", role: "経理担当" },
    ],
    testConditions: [
      {
        id: "TC-001",
        target: "F-001",
        perspectiveCategoryId: "TPC-01",
        statement: "条件文",
        source: "stakeholder",
        derivedFrom: ["P-001"],
        priority: "高",
      },
    ],
  };
  const markdownPersona = renderTestConditions(inputPersona);

  it("renders the 8-column persona table header with the four quadrants", () => {
    expect(markdownPersona).toContain(
      "| ペルソナID | 役割 | 氏名 | 属性 | 発言・思考 | 目標 | 不満点 | 導出済み条件ID |"
    );
  });

  it("joins quadrant arrays with '; ' and shows derived condition ids", () => {
    const row = markdownPersona.split("\n").find((l) => l.startsWith("| P-001 |"));
    expect(row).toContain("30代; 会社員; スマートフォン利用");
    expect(row).toContain("並ぶ時間がもったいない");
    expect(row).toContain("入場までの待ち時間を短くしたい");
    expect(row).toContain("当日券の列が長い");
    expect(row).toContain("TC-001");
  });

  it("falls back to the legacy concerns field for the pain point column", () => {
    const row = markdownPersona.split("\n").find((l) => l.startsWith("| P-002 |"));
    expect(row).toContain("発券機の障害対応\\|手順が煩雑");
    expect(row).toContain("未記入(要確認)");
  });

  it("lists missing quadrants per persona under section 3.11", () => {
    const section = markdownPersona
      .split("### 3.11 ペルソナ4象限の記入状況")[1]
      .split("### 3.12")[0];
    expect(section).not.toContain("P-001");
    expect(section).toContain("[medium] P-002: 未記入の象限 属性, 発言・思考, 目標。");
    expect(section).toContain("[medium] P-003: 未記入の象限 属性, 発言・思考, 目標, 不満点。");
    expect(section).toContain("persona_journey_interview");
  });

  it("includes the incomplete-quadrant counter in the 3.12 summary", () => {
    const summaryLine = markdownPersona.split("\n").find((l) => l.startsWith("- 対象要件ID数:"));
    expect(summaryLine).toContain("4象限未記入ペルソナ件数: 2");
  });

  it("instructs to raise persona resolution in section 9", () => {
    const section = markdownPersona.split("## 9. ステークホルダー／ペルソナ視点の洗い出し指示(意味的層)")[1];
    expect(section).toContain(
      "4象限（属性・発言・思考・目標・不満点）が未記入のペルソナは、persona_journey_interview で解像度を上げてから条件を導出すること。"
    );
  });

  it("recommends linking source=stakeholder conditions to quality-in-use characteristic ids under section 9", () => {
    const section = markdown.split("## 9. ステークホルダー／ペルソナ視点の洗い出し指示(意味的層)")[1];
    expect(section).toContain("quality://characteristics/in-use");
  });

  it("renders without throwing for legacy minimal persona input and reports no personas when omitted", () => {
    const minimal: ExtractTestConditionsInput = {
      requirementIds: ["R-001"],
      testConditions: [
        {
          id: "TC-001",
          target: "F-001",
          perspectiveCategoryId: "TPC-01",
          statement: "条件文",
          source: "testbase",
          derivedFrom: ["R-001"],
          priority: "高",
        },
      ],
    };
    const md = renderTestConditions(minimal);
    const section = md.split("### 3.11 ペルソナ4象限の記入状況")[1].split("### 3.12")[0];
    expect(section).toContain("- ペルソナの指定なし");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(inputPersona);
    expect(renderTestConditions(inputPersona)).toBe(markdownPersona);
    expect(JSON.stringify(inputPersona)).toBe(snapshot);
  });
});

describe("renderTestConditions with explicit-kind derivedFrom entries", () => {
  const input3: ExtractTestConditionsInput = {
    requirementIds: ["R-001"],
    risks: [{ id: "RK-001", description: "入場時に二重課金が起きる" }],
    personas: [{ id: "P-001", role: "来園者" }],
    testConditions: [
      {
        id: "TC-001",
        target: "F-001",
        perspectiveCategoryId: "TPC-01",
        statement: "多系統から導出された条件",
        source: "risk",
        derivedFrom: [
          { kind: "risk", id: "RK-001" },
          { kind: "requirement", id: "R-001" },
        ],
        priority: "高",
      },
      {
        id: "TC-002",
        target: "F-002",
        perspectiveCategoryId: "TPC-02",
        statement: "存在しないリスクIDを種別明示で参照",
        source: "risk",
        derivedFrom: [{ kind: "risk", id: "RK-999" }],
        priority: "中",
      },
    ],
  };
  const markdown3 = renderTestConditions(input3);

  it("renders the explicit-kind reference with a 'リスク:' label in the derivation cell", () => {
    const row = markdown3.split("\n").find((l) => l.startsWith("| TC-001 |"));
    expect(row).toContain("リスク:RK-001");
  });

  it("does not report the requirement-kind entry as an unresolved reference (main objective)", () => {
    const section = markdown3.split("### 3.7 derivedFrom の未解決参照")[1].split("### 3.8")[0];
    expect(section).not.toContain("R-001");
  });

  it("shows the kind-labeled reference for a genuinely unresolved explicit-kind entry", () => {
    const section = markdown3.split("### 3.7 derivedFrom の未解決参照")[1].split("### 3.8")[0];
    expect(section).toContain("リスク:RK-999");
    expect(section).toContain("risks[].id");
  });
});

describe("renderTestConditions 4.5 optional axis breakdown (no optional axes declared)", () => {
  it("states that only the existing 3-axis score was used and prints no achievement ratio", () => {
    const section = markdown.split("### 4.5 任意軸の内訳と宣言・実体の照合")[1].split("## 5.")[0];
    expect(section).toContain("任意軸の記入がないため、既存3軸のスコアのみで評価している。");
    expect(section).not.toMatch(/率/);
  });

  it("does not change the existing 4.1..4.4 heading text", () => {
    for (const heading of [
      "### 4.1 リスクレベル算出式",
      "### 4.2 リスクスコア → 優先度の写像",
      "### 4.3 宣言された優先度基準",
      "### 4.4 優先度の導出結果と逸脱",
    ]) {
      expect(markdown).toContain(heading);
    }
  });
});

describe("renderTestConditions with optional severity/likelihoodDetail axes", () => {
  const inputOptional: ExtractTestConditionsInput = {
    requirementIds: ["R-001"],
    risks: [
      {
        id: "RK-001",
        description: "重篤度Sで導出優先度が低くなるリスク",
        impact: 1,
        likelihood: 1,
        changeCategory: "existing-unaffected",
        severity: { direct: 5 },
        stakeholderImpacts: [
          { stakeholderFrameId: "RSF-01", level: 3 },
          { stakeholderFrameId: "RSF-99", level: 2 },
          { stakeholderLabel: "外部委託先", level: 4 },
        ],
      },
    ],
    testConditions: [
      {
        id: "TC-001",
        target: "F-001",
        perspectiveCategoryId: "TPC-01",
        statement: "重篤度と発生頻度サブ軸を使う条件",
        source: "testbase",
        derivedFrom: ["R-001"],
        priority: "高",
        impact: 2,
        likelihood: 1,
        severity: { direct: 5 },
        likelihoodDetail: { usageFrequency: 3, defectProneness: 5 },
      },
    ],
  };
  const markdownOptional = renderTestConditions(inputOptional);

  it("renders the 4.5 breakdown table with the declared sub-axis values and derived severity/grade", () => {
    const section = markdownOptional.split("### 4.5 任意軸の内訳と宣言・実体の照合")[1].split("## 5.")[0];
    expect(section).toContain(
      "| 条件ID | 直接影響 | 波及影響 | 短期金銭 | 長期金銭 | 重篤度 | 重篤度区分 | 影響度出所 | 利用頻度 | 発生しやすさ | 発生可能性出所 |"
    );
    expect(section).toContain("| TC-001 | 5 | - | - | - | 5 | S | declared | 3 | 5 | declared |");
  });

  it("flags impactSeverityConflict, likelihoodDetailConflict, and missingPronenessRationale for TC-001", () => {
    const section = markdownOptional.split("### 4.5 任意軸の内訳と宣言・実体の照合")[1].split("## 5.")[0];
    expect(section).toContain("[high] TC-001: 宣言した影響度と重篤度サブ軸の最大値が一致しない(impactSeverityConflict)。");
    expect(section).toContain(
      "[high] TC-001: 宣言した発生可能性と利用頻度×発生しやすさ係数からの導出値が一致しない(likelihoodDetailConflict)。"
    );
    expect(section).toContain("[medium] TC-001: 発生しやすさ係数が標準(3)から逸脱しているが");
  });

  it("renders section 8.1 severity/frequency breakdown and 8.2 the risk x stakeholder impact matrix", () => {
    const section = markdownOptional
      .split("## 8. リスク分析フレームの適用指示(意味的層)")[1]
      .split("## 9.")[0];
    expect(section).toContain("### 8.1 リスクの重篤度・発生頻度内訳");
    expect(section).toContain("| RK-001 | 5 | - | - | - | 5 | S | - | - |");
    expect(section).toContain("### 8.2 リスク×ステークホルダ影響行列");
    expect(section).toContain("外部委託先");
  });

  it("keeps the existing 6-column risk table header unchanged", () => {
    expect(markdownOptional).toContain("| リスクID | 内容 | 区分 | 影響度 | 発生可能性 | 変更区分 |");
  });

  it("flags an unknown RSF-xx reference and the exceeded-impact warning under section 8.3", () => {
    const section = markdownOptional
      .split("## 8. リスク分析フレームの適用指示(意味的層)")[1]
      .split("## 9.")[0];
    expect(section).toContain("「RSF-99」はリスク分析フレームに存在しないステークホルダ枠IDである。");
    expect(section).toContain("ステークホルダ影響の最大値(4)が実効影響度(1)を超えている。影響度の見直しを検討すること。");
  });

  it("flags the severity escalation warning for TC-001 under section 4.5 (severity S, derived priority low)", () => {
    const section = markdownOptional.split("### 4.5 任意軸の内訳と宣言・実体の照合")[1].split("## 5.")[0];
    expect(section).toContain(
      "[high] TC-001: 重篤度区分がS(最重篤)であるにもかかわらず、導出優先度が低となっている。優先度を見直すこと。"
    );
  });

  it("lists RK-001 as a risk without a declared basis under section 8.3", () => {
    const section = markdownOptional
      .split("## 8. リスク分析フレームの適用指示(意味的層)")[1]
      .split("## 9.")[0];
    expect(section).toContain("RK-001: sourceRefs / targetIds のいずれも未記入で根拠が示されていない。");
  });

  it("renders section 8.4 with '-' for the missing source refs / target ids", () => {
    const section = markdownOptional
      .split("## 8. リスク分析フレームの適用指示(意味的層)")[1]
      .split("## 9.")[0];
    expect(section).toContain("### 8.4 リスクの根拠位置・対象ID");
    expect(section).toContain("| RK-001 | - | - |");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(inputOptional);
    expect(renderTestConditions(inputOptional)).toBe(markdownOptional);
    expect(JSON.stringify(inputOptional)).toBe(snapshot);
  });
});

describe("renderTestConditions 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderTestConditions(input));
  });
});

describe("renderTestConditions 次に実行すべきツール節の内容", () => {
  function conditionsInput(
    conditions: ExtractTestConditionsInput["testConditions"]
  ): ExtractTestConditionsInput {
    return { requirementIds: ["R-001"], testConditions: conditions };
  }

  function nextToolsSection(md: string): string {
    return md.split("## 次に実行すべきツール")[1];
  }

  it("優先度「高」の条件があると generate_exploratory_charters 行が出る", () => {
    const md = renderTestConditions(
      conditionsInput([
        {
          id: "TC-001",
          target: "F-001",
          perspectiveCategoryId: "TPC-01",
          statement: "購入が完了する",
          source: "testbase",
          derivedFrom: ["R-001"],
          priority: "高",
        },
      ])
    );
    expect(nextToolsSection(md)).toContain("| 未実施 | generate_exploratory_charters |");
  });

  it("優先度が全て「中」なら generate_exploratory_charters 行は出ない", () => {
    const md = renderTestConditions(
      conditionsInput([
        {
          id: "TC-001",
          target: "F-001",
          perspectiveCategoryId: "TPC-01",
          statement: "購入が完了する",
          source: "testbase",
          derivedFrom: ["R-001"],
          priority: "中",
        },
      ])
    );
    expect(nextToolsSection(md)).not.toContain("| 未実施 | generate_exploratory_charters |");
  });

  it("recommendedTechniques: decision-table で design_decision_table 行が技法由来理由付きで出る", () => {
    const md = renderTestConditions(
      conditionsInput([
        {
          id: "TC-001",
          target: "F-001",
          perspectiveCategoryId: "TPC-01",
          statement: "購入が完了する",
          source: "testbase",
          derivedFrom: ["R-001"],
          priority: "中",
          recommendedTechniques: ["decision-table"],
        },
      ])
    );
    expect(nextToolsSection(md)).toContain(
      "| 未実施 | design_decision_table | 推奨技法 decision-table が条件 TC-001 に指定されている |"
    );
  });
});
