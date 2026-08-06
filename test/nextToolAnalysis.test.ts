import { describe, expect, it } from "vitest";
import { renderNextToolsSection, resolveNextTools } from "../src/nextToolAnalysis.js";

function rowFor(md: string, toolName: string): string | undefined {
  return md.split("\n").find((l) => l.startsWith("| ") && l.includes(`| ${toolName} |`));
}

const GTC_EXCERPT = "# テストケース生成結果\n\n## 1. 見出し\n\n本文";
const REVIEW_SPEC_EXCERPT = "# テスト仕様書レビュー結果\n\n本文";

describe("resolveNextTools", () => {
  it("always エントリのみのツールはシグナル無しでも全行が未実施で出る", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", []);
    expect(rows.map((r) => r.toolName)).toEqual(["generate_test_cases", "review_test_specification"]);
    expect(rows.every((r) => r.status === "未実施")).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("条件付きエントリはシグナル該当時のみ行として現れる", () => {
    const without = resolveNextTools("extract_test_conditions", ["has-conditions"]);
    expect(without.rows.map((r) => r.toolName)).not.toContain("generate_exploratory_charters");

    const withSignal = resolveNextTools("extract_test_conditions", [
      "has-conditions",
      "has-high-priority-conditions",
    ]);
    expect(withSignal.rows.map((r) => r.toolName)).toContain("generate_exploratory_charters");
  });

  it("証跡が参照形式でない申告は未実施のまま残り専用警告が出る", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", [], [
      { toolName: "generate_test_cases", evidence: "済" },
    ]);
    const row = rows.find((r) => r.toolName === "generate_test_cases");
    expect(row?.status).toBe("未実施");
    expect(warnings).toEqual([
      "[high] 実施済み申告の証跡がファイルパスまたは見出しの形式でないため未実施として扱う: generate_test_cases（証跡: 済）",
    ]);
  });

  it("参照形式の証跡でも outputExcerpt が無ければ証跡未照合として未実施件数に含まれる", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", [], [
      { toolName: "generate_test_cases", evidence: "sample/2026/test-cases.md" },
    ]);
    const row = rows.find((r) => r.toolName === "generate_test_cases");
    expect(row?.status).toBe("実施済み(証跡未照合)");
    expect(row?.reason).toBe(
      "実施済み申告（証跡: sample/2026/test-cases.md）だが成果物本文と照合できないため未実施として扱う"
    );
    expect(warnings).toEqual([
      "[medium] 実施済み申告の証跡を成果物本文と照合できないため未実施として扱う: generate_test_cases" +
        "（outputExcerpt に見出し行「# テストケース生成結果」が必要）",
    ]);
  });

  it("正しい outputExcerpt が有れば実施済みになり警告は出ない", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", [], [
      {
        toolName: "generate_test_cases",
        evidence: "sample/2026/test-cases.md",
        outputExcerpt: GTC_EXCERPT,
      },
    ]);
    const row = rows.find((r) => r.toolName === "generate_test_cases");
    expect(row?.status).toBe("実施済み");
    expect(row?.reason).toBe("実施済み申告（証跡: sample/2026/test-cases.md）");
    expect(warnings).toEqual([]);
  });

  it("別ツールの見出しを outputExcerpt に渡しても証跡未照合のままになる", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", [], [
      {
        toolName: "generate_test_cases",
        evidence: "sample/2026/test-cases.md",
        outputExcerpt: REVIEW_SPEC_EXCERPT,
      },
    ]);
    const row = rows.find((r) => r.toolName === "generate_test_cases");
    expect(row?.status).toBe("実施済み(証跡未照合)");
    expect(warnings).toHaveLength(1);
  });

  it("create_test_plan は見出しの前方一致(コロン付き動的末尾)で照合される", () => {
    const matched = resolveNextTools("derive_test_purposes", ["has-purposes"], [
      {
        toolName: "create_test_plan",
        evidence: "docs/test-plan.md",
        outputExcerpt: "# テスト計画書: サンプルPJ\n\n## 1. 見出し",
      },
    ]);
    expect(matched.rows.find((r) => r.toolName === "create_test_plan")?.status).toBe("実施済み");

    const unmatched = resolveNextTools("derive_test_purposes", ["has-purposes"], [
      {
        toolName: "create_test_plan",
        evidence: "docs/test-plan.md",
        outputExcerpt: "# テスト計画書修正結果",
      },
    ]);
    expect(unmatched.rows.find((r) => r.toolName === "create_test_plan")?.status).toBe(
      "実施済み(証跡未照合)"
    );
  });

  it("実在しないツール名の申告は警告になる", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", [], [
      { toolName: "generate_test_case", evidence: "どこか" },
    ]);
    expect(rows.every((r) => r.status === "未実施")).toBe(true);
    expect(warnings).toEqual([
      "[high] 実施済み申告のツール名が本MCPに存在しない: generate_test_case",
    ]);
  });

  it("証跡なしの申告は未実施のまま残り警告が出る", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", [], [
      { toolName: "generate_test_cases" },
      { toolName: "review_test_specification", evidence: "   " },
    ]);
    expect(rows.every((r) => r.status === "未実施")).toBe(true);
    expect(warnings).toEqual([
      "[high] 実施済み申告に証跡(evidence)がないため未実施として扱う: generate_test_cases",
      "[high] 実施済み申告に証跡(evidence)がないため未実施として扱う: review_test_specification",
    ]);
  });

  it("後続候補外の実在ツール名の申告は info 警告になり行は増えない", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", [], [
      { toolName: "audit_id_population", evidence: "sample/2026/id-population.md" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.toolName)).not.toContain("audit_id_population");
    expect(warnings).toEqual([
      "[info] 実施済み申告のツールは本ツールの後続候補ではない: audit_id_population",
    ]);
  });

  it("extraEntries が既存行と同じツール名なら行は増えず理由が丸括弧で統合される", () => {
    const { rows } = resolveNextTools("design_boundary_values", [], undefined, [
      { toolName: "generate_test_cases", when: "always", reason: "技法由来の理由" },
    ]);
    expect(rows).toHaveLength(2);
    const row = rows.find((r) => r.toolName === "generate_test_cases");
    expect(row?.reason).toBe("設計結果のテストケース化が未実施である（技法由来の理由）");
  });

  it("行順は未実施(カタログ順) → 実施済み(証跡未照合)(カタログ順) → 実施済み(カタログ順) になる", () => {
    const { rows } = resolveNextTools("review_test_specification", ["has-spec-findings"], [
      { toolName: "generate_test_cases", evidence: "E1.md", outputExcerpt: GTC_EXCERPT },
      { toolName: "audit_cross_matrix", evidence: "E2.md" },
    ]);
    expect(rows.map((r) => `${r.status}:${r.toolName}`)).toEqual([
      "未実施:audit_id_population",
      "実施済み(証跡未照合):audit_cross_matrix",
      "実施済み:generate_test_cases",
    ]);
  });
});

describe("renderNextToolsSection", () => {
  it("採用0件のときは表を出さず1行のみ出力する", () => {
    const md = renderNextToolsSection("no_such_tool", []);
    expect(md).toBe("## 次に実行すべきツール\n\n- 提示対象の後続ツールはない。");
  });

  it("採用0件でも警告があれば警告行を出力する", () => {
    const md = renderNextToolsSection("no_such_tool", [], [{ toolName: "generate_test_cases" }]);
    expect(md).toContain("- 提示対象の後続ツールはない。");
    expect(md).toContain(
      "- [high] 実施済み申告に証跡(evidence)がないため未実施として扱う: generate_test_cases"
    );
    expect(md).not.toContain("| 実行状態 |");
  });

  it("件数行が実際の行数と一致し、証跡未照合は未実施件数に含まれる", () => {
    const md = renderNextToolsSection("review_test_specification", [], [
      { toolName: "audit_cross_matrix", evidence: "E2.md" },
    ]);
    const tableRows = md
      .split("\n")
      .filter(
        (l) => l.startsWith("| 未実施 |") || l.startsWith("| 実施済み(証跡未照合) |") || l.startsWith("| 実施済み |")
      );
    const pending = tableRows.filter((l) => l.startsWith("| 未実施 |")).length;
    const unverified = tableRows.filter((l) => l.startsWith("| 実施済み(証跡未照合) |")).length;
    const done = tableRows.filter((l) => l.startsWith("| 実施済み |")).length;
    expect(pending).toBe(1);
    expect(unverified).toBe(1);
    expect(done).toBe(0);
    expect(md).toContain(
      `- 未実施: ${pending + unverified}件（うち実施済み申告だが証跡未照合: ${unverified}件） / 実施済み: ${done}件`
    );
  });

  it("理由文の | は \\| へエスケープされる", () => {
    const md = renderNextToolsSection("design_boundary_values", [], undefined, [
      { toolName: "generate_test_cases", when: "always", reason: "A|B の分岐" },
    ]);
    expect(md).toContain("設計結果のテストケース化が未実施である（A\\|B の分岐）");
    expect(rowFor(md, "generate_test_cases")).toBeDefined();
  });

  it("signals が空のときは生成物に依存しない旨の締めの注意書きになる", () => {
    const md = renderNextToolsSection("design_boundary_values", []);
    expect(md.split("\n")[0]).toBe("## 次に実行すべきツール");
    expect(md.split("\n").at(-1)).toBe(
      "- 未実施の後続ツールが残ったまま成果物を確定しないこと。この節は本ツールが静的に保持する後続表のみから生成しており、生成物の内容に依存する後続提示はない。"
    );
    expect(md.endsWith("\n")).toBe(false);
  });

  it("signals があるときはシグナル名を含む締めの注意書きになる", () => {
    const md = renderNextToolsSection("design_boundary_values", ["has-invalid-variables"]);
    expect(md.split("\n").at(-1)).toBe(
      "- 未実施の後続ツールが残ったまま成果物を確定しないこと。この節は本ツールが静的に保持する後続表と、生成物から機械的に導いたシグナル（has-invalid-variables）から生成している。"
    );
  });
});
