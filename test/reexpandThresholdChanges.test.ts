import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { expectInspectabilitySection, expectExecuted, expectUninspectable, parseInspectabilityRows } from "./inspectabilitySectionHelper.js";
import { renderThresholdChangeReexpansion } from "../src/tools/reexpandThresholdChanges.js";
import type { ReexpandThresholdChangesInput } from "../src/types.js";

describe("renderThresholdChangeReexpansion", () => {
  it("1. lists a changed parameter with its change kind in the diff table", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("| MAX_TICKETS | value-changed | 10 | 20 | 枚→枚 | - |");
  });

  it("2. re-expands a boundary variable bound to parameter names and marks the changed coverage target id", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "10" },
      ],
      parametersAfter: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "20" },
      ],
      boundaryBindings: [
        { name: "枚数", minParameterName: "MIN_TICKETS", maxParameterName: "MAX_TICKETS" },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 3.1")[1].split("### 3.2")[0];
    expect(section).toContain("BV:枚数:10");
    expect(section).toContain("BV:枚数:20");
    expect(section).toContain("changed");
  });

  it("3. reports a case referencing a stale coverage target id as TCI-02 with high severity and a replacement suggestion", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "10" },
      ],
      parametersAfter: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "20" },
      ],
      boundaryBindings: [
        { name: "枚数", minParameterName: "MIN_TICKETS", maxParameterName: "MAX_TICKETS" },
      ],
      testCases: [
        {
          caseId: "TCS-001",
          title: "上限枚数のテスト",
          coverageTargets: ["BV:枚数:10"],
        },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("TCI-02");
    expect(md).toContain("[high] TCI-02 TCS-001");
    expect(md).toContain("BV:枚数:10 → BV:枚数:20");
  });

  it("4. flags a case that still contains the stale literal value as TCI-01", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
      testCases: [
        {
          caseId: "TCS-001",
          title: "枚数上限のテスト",
          steps: [{ no: 1, action: "10枚を入力する", expected: "エラーが表示される" }],
        },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("[high] TCI-01 TCS-001");
  });

  it("5. classifies a name-referencing case as TCI-03 recheck-required and does not raise TCI-01 for it", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
      testCases: [
        {
          caseId: "TCS-001",
          title: "MAX_TICKETS を超えるテスト",
          steps: [{ no: 1, action: "MAX_TICKETS 枚を入力する", expected: "エラーが表示される" }],
        },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    const findingsSection = md.split("### 4.1")[1].split("### 4.2")[0];
    expect(findingsSection).toContain("TCI-03");
    expect(findingsSection).not.toContain("TCI-01");
  });

  it("6. reports an artifact referencing a removed parameter as TCI-05", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "OLD_LIMIT", value: "5", unit: "件" }],
      parametersAfter: [],
      testConditions: [{ id: "TC-001", statement: "OLD_LIMIT を超えないことを確認する" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("[high] TCI-05 TC-001");
  });

  it("7. lists a changed parameter with no references in section 2.2 as TCI-06", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "UNTRACKED", value: "5" }],
      parametersAfter: [{ name: "UNTRACKED", value: "15" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 2.2")[1].split("## 3.")[0];
    expect(section).toContain("UNTRACKED");
    expect(section).toContain("見つからない");
  });

  it("8. flags a unit-only change as TCI-04", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MIN_AGE", value: "18", unit: "歳" }],
      parametersAfter: [{ name: "MIN_AGE", value: "18", unit: "才" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("TCI-04");
  });

  it("9. reports a non-numeric binding as TCI-08 in section 3.3 and omits its reexpansion row", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [
        { name: "MIN_TICKETS", value: "abc" },
        { name: "MAX_TICKETS", value: "10" },
      ],
      parametersAfter: [
        { name: "MIN_TICKETS", value: "abc" },
        { name: "MAX_TICKETS", value: "20" },
      ],
      boundaryBindings: [
        { name: "枚数", minParameterName: "MIN_TICKETS", maxParameterName: "MAX_TICKETS" },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section33 = md.split("### 3.3")[1].split("## 4.")[0];
    expect(section33).toContain("non-numeric-parameter");
    const section31 = md.split("### 3.1")[1].split("### 3.2")[0];
    expect(section31).toContain("- 対象なし");
  });

  it("10. emits the no-further-action message in section 6 when there are no findings", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "A", value: "1" }],
      parametersAfter: [{ name: "A", value: "1" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section6 = md.split("## 6.")[1];
    expect(section6).toContain("追加の対応指示なし");
  });

  it("11. lists a changed equivalence class representative in section 3.2", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "ADULT_AGE", value: "20" }],
      parametersAfter: [{ name: "ADULT_AGE", value: "18" }],
      equivalenceBindings: [
        {
          name: "年齢",
          classes: [
            { label: "成人", kind: "valid", representativeParameterName: "ADULT_AGE" },
          ],
        },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 3.2")[1].split("### 3.3")[0];
    expect(section).toContain("EP:年齢:成人");
    expect(section).toContain("changed");
  });

  it("12. marks an unaffected artifact as 影響なし in section 4.2", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20" }],
      testConditions: [{ id: "TC-999", statement: "無関係な条件" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 4.2")[1].split("### 4.3")[0];
    expect(section).toContain("TC-999");
    expect(section).toMatch(/TC-999[^\n]*影響なし/);
  });

  it("13. outputs a summary line with the aggregate counts", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toMatch(/変更パラメータ数: \d+ \/ 追加: \d+ \/ 削除: \d+/);
  });

  it("14. produces stable output for the same input", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "10" },
        { name: "OLD_LIMIT", value: "5" },
      ],
      parametersAfter: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "20" },
        { name: "NEW_LIMIT", value: "8" },
      ],
      testConditions: [{ id: "TC-001", statement: "OLD_LIMIT を超えないことを確認する" }],
      testCases: [
        {
          caseId: "TCS-001",
          title: "上限枚数のテスト",
          coverageTargets: ["BV:枚数:10"],
          steps: [{ no: 1, action: "10枚を入力する", expected: "エラーが表示される" }],
        },
      ],
      boundaryBindings: [
        { name: "枚数", minParameterName: "MIN_TICKETS", maxParameterName: "MAX_TICKETS" },
      ],
    };
    const first = renderThresholdChangeReexpansion(input);
    const second = renderThresholdChangeReexpansion(input);
    expect(first).toBe(second);
  });

  it("20. omits section 0 entirely when no documents or approvals are given", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).not.toContain("## 0.");
    // TCE-xx は「検査実行状況」節では検査不能として列挙されるが、0章（自前抽出）の本文には現れない。
    const beforeInspectability = md.split("## 検査実行状況")[0];
    expect(beforeInspectability).not.toContain("TCE-");
  });

  it("21. keeps the existing output shape unchanged when documents are omitted", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md.split("\n")[0]).toBe("# 閾値変更の影響再展開結果");
    expect(md.split("\n")[4]).toBe("## 1. パラメータ差分");
    expect(md).toContain("| MAX_TICKETS | value-changed | 10 | 20 | 枚→枚 | - |");
    expect(md.match(/^## \d\./gm)).toEqual([
      "## 1.",
      "## 2.",
      "## 3.",
      "## 4.",
      "## 5.",
      "## 6.",
    ]);
  });

  it("22. renders the extracted candidate table in section 0.2 when documentsAfter is given", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [],
      parametersAfter: [{ name: "上限枚数", value: "20", unit: "枚" }],
      documentsAfter: [{ name: "spec.md", content: "| 上限枚数 | 20枚 |" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 0.2")[1].split("### 0.3")[0];
    expect(section).toContain("| 候補名 | 値 | 単位 | 出典 | 章節 | 抽出形式 |");
    expect(section).toContain("| 上限枚数 | 20 | 枚 | spec.md:1 |");
  });

  it("23. renders the proposed before/after table in section 0.3 as value-changed and unapproved", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [],
      parametersAfter: [],
      documentsBefore: [{ name: "spec.md", content: "| 上限枚数 | 10枚 |" }],
      documentsAfter: [{ name: "spec.md", content: "| 上限枚数 | 20枚 |" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 0.3")[1].split("### 0.4")[0];
    expect(section).toContain("value-changed");
    expect(section).toContain("未承認");
  });

  it("24. merges an approved undeclared candidate into the effective diff table with an extraction source", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [],
      parametersAfter: [],
      documentsBefore: [{ name: "spec.md", content: "| 上限枚数 | 10枚 |" }],
      documentsAfter: [{ name: "spec.md", content: "| 上限枚数 | 20枚 |" }],
      approvedExtractions: [{ name: "上限枚数", beforeValue: "10", afterValue: "20" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md.split("### 0.3")[1].split("### 0.4")[0]).toContain("承認済み");
    const diffSection = md.split("### 1.1")[1].split("### 1.2")[0];
    expect(diffSection).toContain("| 上限枚数 | value-changed | 10 | 20 | 枚→枚 | 抽出:spec.md:1 |");
  });

  it("25. reports a declared value that contradicts the document as TCE-02 in section 0.4", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [],
      parametersAfter: [{ name: "大人料金", value: "600", unit: "円" }],
      documentsAfter: [{ name: "spec.md", content: "| 大人料金 | 400円 |" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 0.4")[1].split("### 0.5")[0];
    expect(section).toContain("[high] TCE-02 大人料金");
  });

  it("26. reports summary counts in 0.6 that match the rows actually rendered in 0.2 and 0.4", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "上限枚数", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "上限枚数", value: "10", unit: "枚" }],
      documentsBefore: [{ name: "spec.md", content: "| 上限枚数 | 10枚 |" }],
      documentsAfter: [
        { name: "spec.md", content: ["| 上限枚数 | 20枚 |", "- 大人料金: 400円"].join("\n") },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);

    const section02 = md.split("### 0.2")[1].split("### 0.3")[0];
    const candidateRows = section02
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.startsWith("| ---") && !l.startsWith("| 候補名"));
    const section04 = md.split("### 0.4")[1].split("### 0.5")[0];
    const findingRows = section04.split("\n").filter((l) => l.startsWith("- ["));

    const summaryLine = md.split("### 0.6")[1].split("\n").find((l) => l.startsWith("- 抽出候補数"));
    expect(summaryLine).toBeDefined();
    const numbers = (summaryLine as string).match(/\d+/g)?.map(Number) as number[];
    // 抽出候補数(前) / (後) / 未宣言 / 値不一致 / 裏付け無し宣言 / 差分不整合 / 値衝突 / 承認不一致 / 未承認 / 反映数
    expect(numbers).toHaveLength(10);
    expect(numbers[0] + numbers[1]).toBe(candidateRows.length);
    expect(numbers.slice(2, 9).reduce((a, b) => a + b, 0)).toBe(findingRows.length);
  });

  it("27. emits the undeclared-threshold instruction block in section 6 when TCE-01 exists", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [],
      parametersAfter: [],
      documentsAfter: [{ name: "spec.md", content: "| 大人料金 | 400円 |" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section6 = md.split("## 6.")[1];
    expect(section6).toContain("宣言漏れか対象外かを判断");
    expect(section6).toContain("大人料金");
  });
});

describe("renderThresholdChangeReexpansion 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderThresholdChangeReexpansion({
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
    }));
  });
});

describe("renderThresholdChangeReexpansion 検査実行状況節", () => {
  const withDocuments: ReexpandThresholdChangesInput = {
    parametersBefore: [{ name: "上限枚数", value: "10", unit: "枚" }],
    parametersAfter: [{ name: "上限枚数", value: "20", unit: "枚" }],
    documentsBefore: [{ name: "spec-before.md", content: "| 上限枚数 | 10枚 |" }],
    documentsAfter: [{ name: "spec-after.md", content: "| 上限枚数 | 20枚 |" }],
  };

  it("対照表が出て、実行された検査の節ラベルが同一出力の見出しに現れる", () => {
    expectInspectabilitySection(
      renderThresholdChangeReexpansion(withDocuments),
      "reexpand_threshold_changes"
    );
  });

  it("documents 未投入なら TCE-01〜TCE-07 がすべて検査不能になる", () => {
    const md = renderThresholdChangeReexpansion({
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
    });
    for (const id of ["TCE-01", "TCE-02", "TCE-03", "TCE-04", "TCE-05", "TCE-06", "TCE-07"]) {
      expectUninspectable(md, id);
    }
    const row = parseInspectabilityRows(md).find((r) => r.catalogId === "TCE-01")!;
    expect(row.measured).toBe("変更前文書0件 / 変更後文書0件");
  });

  it("原文と宣言パラメータがあれば TCE-01〜TCE-05 が実行になり、承認未宣言の TCE-06 / TCE-07 は検査不能になる", () => {
    const md = renderThresholdChangeReexpansion(withDocuments);
    for (const id of ["TCE-01", "TCE-02", "TCE-03", "TCE-04", "TCE-05"]) {
      expectExecuted(md, id);
    }
    expectUninspectable(md, "TCE-06");
    expectUninspectable(md, "TCE-07");
  });

  it("承認を宣言すると TCE-06 / TCE-07 が実行になる", () => {
    const md = renderThresholdChangeReexpansion({
      ...withDocuments,
      approvedExtractions: [{ name: "上限枚数" }],
    });
    expectExecuted(md, "TCE-06");
    expectExecuted(md, "TCE-07");
  });
});

const REEXPAND_HEADINGS = [
  "## 0. 投入文書と閾値の自前抽出",
  "### 0.1 投入文書ダイジェスト",
  "### 0.2 抽出した閾値パラメータ候補",
  "### 0.3 自前抽出による新旧対照表(提案・未反映)",
  "### 0.4 宣言パラメータ表との突合結果",
  "### 0.5 判定区分と対処指針(自前抽出)",
  "### 0.6 抽出サマリ",
  "## 1. パラメータ差分",
  "### 1.1 差分表",
  "### 1.2 変更区分の内訳",
  "## 2. 参照インデックス(決定的層)",
  "### 2.1 パラメータ × 参照箇所",
  "### 2.2 参照が見つからない変更パラメータ",
  "## 3. 再展開結果(決定的層)",
  "### 3.1 境界値の再展開差分",
  "### 3.2 同値クラス代表値の再展開差分",
  "### 3.3 解決できなかった束縛",
  "## 4. 影響と要対応(決定的層)",
  "### 4.1 指摘一覧",
  "### 4.2 成果物別の影響判定",
  "### 4.3 サマリ",
  "## 5. 判定区分と対処指針(カタログ)",
  "## 6. 再生成指示(意味的層)",
];

function buildLargeReexpandInput(): ReexpandThresholdChangesInput {
  const PARAM_COUNT = 12;
  const CASE_COUNT = 22;
  const DOC_CANDIDATE_COUNT = 32;

  const parametersBefore: ReexpandThresholdChangesInput["parametersBefore"] = [];
  const parametersAfter: ReexpandThresholdChangesInput["parametersAfter"] = [];
  for (let i = 1; i <= PARAM_COUNT; i++) {
    parametersBefore.push({ name: `PARAM${i}`, value: String(i * 10), unit: "枚" });
    parametersAfter.push({ name: `PARAM${i}`, value: String(i * 10 + 1), unit: "枚" });
  }

  const testConditions: NonNullable<ReexpandThresholdChangesInput["testConditions"]> = [];
  const testCases: NonNullable<ReexpandThresholdChangesInput["testCases"]> = [];
  for (let i = 1; i <= CASE_COUNT; i++) {
    const paramName = `PARAM${(i % PARAM_COUNT) + 1}`;
    testConditions.push({
      id: `TCOND-${String(i).padStart(3, "0")}`,
      statement: `${paramName} の上限付近の値を確認する`,
      target: `対象${i}`,
    });
    testCases.push({
      caseId: `TCS-${String(i).padStart(3, "0")}`,
      title: `${paramName} 境界のテスト${i}`,
      coverageTargets: [],
      steps: [{ no: 1, action: `${paramName} 枚を入力する`, expected: "エラーが表示される" }],
    });
  }

  const beforeLines: string[] = [];
  const afterLines: string[] = [];
  for (let i = 1; i <= DOC_CANDIDATE_COUNT; i++) {
    beforeLines.push(`| DOCVAL${i} | ${i * 10}枚 |`);
    afterLines.push(`| DOCVAL${i} | ${i * 10 + 5}枚 |`);
  }

  return {
    parametersBefore,
    parametersAfter,
    testConditions,
    testCases,
    documentsBefore: [{ name: "spec-before.md", content: beforeLines.join("\n") }],
    documentsAfter: [{ name: "spec-after.md", content: afterLines.join("\n") }],
  };
}

describe("renderThresholdChangeReexpansion 件数上限つき既定出力(verbose)", () => {
  const largeInput = buildLargeReexpandInput();
  const defaultMarkdown = renderThresholdChangeReexpansion(largeInput);
  const verboseMarkdown = renderThresholdChangeReexpansion({ ...largeInput, verbose: true });

  it("既定出力が全ての見出しを保持したまま40,000字未満になる", () => {
    expect(defaultMarkdown.length).toBeLessThan(40000);
    for (const heading of REEXPAND_HEADINGS) {
      expect(defaultMarkdown).toContain(heading);
    }
  });

  it("打ち切り注記が既定出力に出る", () => {
    const truncationLine = /全\d+件中 \d+件を表示（\d+件を省略）。全件は verbose: true で取得できる。/;
    expect(defaultMarkdown).toMatch(truncationLine);
  });

  it("verbose: true では打ち切り注記が出ず全件になる", () => {
    const truncationLine = /全\d+件中 \d+件を表示（\d+件を省略）。全件は verbose: true で取得できる。/;
    expect(verboseMarkdown).not.toMatch(truncationLine);

    const section02Before = verboseMarkdown
      .split("### 0.2 抽出した閾値パラメータ候補")[1]
      .split("### 0.3")[0]
      .split("変更前:")[1]
      .split("変更後:")[0];
    expect((section02Before.match(/^\| DOCVAL/gm) ?? []).length).toBe(32);
  });

  it("verbose有無でサマリ・集計値が一致する", () => {
    const defaultSummary = defaultMarkdown.split("### 4.3 サマリ")[1].split("## 5.")[0];
    const verboseSummary = verboseMarkdown.split("### 4.3 サマリ")[1].split("## 5.")[0];
    expect(defaultSummary).toBe(verboseSummary);
  });

  it("is deterministic across repeated calls", () => {
    const first = renderThresholdChangeReexpansion(largeInput);
    const second = renderThresholdChangeReexpansion(largeInput);
    expect(first).toBe(second);
  });

  it("verbose未指定時のみ冒頭の要約表示に関する1行が出る", () => {
    expect(defaultMarkdown).toContain("既定(verbose未指定/false)は要約表示。");
    expect(verboseMarkdown).not.toContain("既定(verbose未指定/false)は要約表示。");
  });
});

function buildSection6HeavyInput(): ReexpandThresholdChangesInput {
  const N = 60;
  const beforeLines: string[] = [];
  const afterLines: string[] = [];
  for (let i = 1; i <= N; i++) {
    beforeLines.push(`- LABEL${i}: ${i * 10}枚`);
    afterLines.push(`- LABEL${i}: ${i * 10 + 5}枚`);
  }
  return {
    parametersBefore: [],
    parametersAfter: [],
    documentsBefore: [{ name: "spec-before.md", content: beforeLines.join("\n") }],
    documentsAfter: [{ name: "spec-after.md", content: afterLines.join("\n") }],
  };
}

const TCE01_HEADING =
  "以下の文書中の閾値がパラメータ表に宣言されていない。宣言漏れか対象外かを判断し、対象なら parametersBefore/parametersAfter へ追加して再実行すること:";
const TCE04_HEADING = "以下は文書差分と宣言差分が一致していない。反映漏れか抽出の取りこぼしかを確認すること:";
const TCE07_HEADING =
  "以下の抽出候補は未承認のため再展開に反映していない。新旧対照表を確認し、承認するものを approvedExtractions へ渡して再実行すること:";

describe("renderThresholdChangeReexpansion Section 6 の件数上限つき既定出力(verbose)", () => {
  const heavyInput = buildSection6HeavyInput();
  const defaultMarkdown = renderThresholdChangeReexpansion(heavyInput);
  const verboseMarkdown = renderThresholdChangeReexpansion({ ...heavyInput, verbose: true });

  it("Section 6の各指示ブロックが全件数・省略件数を併記して打ち切られる", () => {
    const section6 = defaultMarkdown.split("## 6. 再生成指示(意味的層)")[1].split("## 検査実行状況")[0];
    const truncationLine = /全\d+件中 \d+件を表示（\d+件を省略）。全件は verbose: true で取得できる。/;
    expect(section6).toMatch(truncationLine);
    expect(section6).toContain("未宣言閾値の追加指示(TCE-01)");
    expect(section6).toContain("未承認抽出候補の承認指示(TCE-07)");

    const tce01Block = section6.split(TCE01_HEADING)[1].split(TCE04_HEADING)[0];
    const tce01Bullets = tce01Block.split("\n").filter((l) => l.startsWith("- LABEL"));
    expect(tce01Bullets.length).toBeLessThanOrEqual(10);
  });

  it("verbose: true ではSection 6も全件表示になる", () => {
    const section6 = verboseMarkdown.split("## 6. 再生成指示(意味的層)")[1].split("## 検査実行状況")[0];
    const truncationLine = /全\d+件中 \d+件を表示（\d+件を省略）。全件は verbose: true で取得できる。/;
    expect(section6).not.toMatch(truncationLine);

    const summaryLine = verboseMarkdown
      .split("### 0.6")[1]
      .split("\n")
      .find((l) => l.startsWith("- 抽出候補数")) as string;
    const undeclaredCount = Number(summaryLine.match(/未宣言: (\d+)/)?.[1]);
    expect(undeclaredCount).toBeGreaterThanOrEqual(50);

    const tce01Section = section6.split(TCE01_HEADING)[1].split(TCE04_HEADING)[0];
    const tce01Bullets = tce01Section.split("\n").filter((l) => l.startsWith("- LABEL"));
    expect(tce01Bullets.length).toBe(undeclaredCount);

    const tce07Section = section6.split(TCE07_HEADING)[1];
    const tce07Bullets = tce07Section.split("\n").filter((l) => l.startsWith("- LABEL"));
    const unapprovedCount = Number(summaryLine.match(/未承認候補: (\d+)/)?.[1]);
    expect(unapprovedCount).toBeGreaterThanOrEqual(50);
    expect(tce07Bullets.length).toBe(unapprovedCount);
  });

  it("Section 6の打ち切りはanyInstructionの判定・他セクションの集計に影響しない", () => {
    const defaultSummary = defaultMarkdown.split("### 4.3 サマリ")[1].split("## 5.")[0];
    const verboseSummary = verboseMarkdown.split("### 4.3 サマリ")[1].split("## 5.")[0];
    expect(defaultSummary).toBe(verboseSummary);

    const defaultExtractionSummary = defaultMarkdown.split("### 0.6")[1].split("## 1.")[0];
    const verboseExtractionSummary = verboseMarkdown.split("### 0.6")[1].split("## 1.")[0];
    expect(defaultExtractionSummary).toBe(verboseExtractionSummary);
  });

  it("既定出力全体が40,000字未満になる", () => {
    expect(defaultMarkdown.length).toBeLessThan(40000);
  });

  it("is deterministic across repeated calls", () => {
    const first = renderThresholdChangeReexpansion(heavyInput);
    const second = renderThresholdChangeReexpansion(heavyInput);
    expect(first).toBe(second);
  });
});
