import { describe, expect, it } from "vitest";
import { renderNextToolsSection, resolveNextTools } from "../src/nextToolAnalysis.js";

function rowFor(md: string, toolName: string): string | undefined {
  return md.split("\n").find((l) => l.startsWith("| ") && l.includes(`| ${toolName} |`));
}

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

  it("証跡付きの実施済み申告は当該行を実施済みにする", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", [], [
      { toolName: "generate_test_cases", evidence: "sample/2026/test-cases.md" },
    ]);
    const row = rows.find((r) => r.toolName === "generate_test_cases");
    expect(row?.status).toBe("実施済み");
    expect(row?.reason).toBe("実施済み申告（証跡: sample/2026/test-cases.md）");
    expect(warnings).toEqual([]);
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

  it("実在しないツール名の申告は警告になる", () => {
    const { rows, warnings } = resolveNextTools("design_boundary_values", [], [
      { toolName: "generate_test_case", evidence: "どこか" },
    ]);
    expect(rows.every((r) => r.status === "未実施")).toBe(true);
    expect(warnings).toEqual([
      "[high] 実施済み申告のツール名が本MCPに存在しない: generate_test_case",
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

  it("行順は未実施(カタログ順) → 実施済み(カタログ順) になる", () => {
    const { rows } = resolveNextTools("review_test_specification", ["has-spec-findings"], [
      { toolName: "generate_test_cases", evidence: "E1" },
      { toolName: "audit_cross_matrix", evidence: "E2" },
    ]);
    expect(rows.map((r) => `${r.status}:${r.toolName}`)).toEqual([
      "未実施:audit_id_population",
      "実施済み:generate_test_cases",
      "実施済み:audit_cross_matrix",
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

  it("件数行が実際の行数と一致する", () => {
    const md = renderNextToolsSection("review_test_specification", ["has-spec-findings"], [
      { toolName: "audit_cross_matrix", evidence: "E2" },
    ]);
    const tableRows = md
      .split("\n")
      .filter((l) => l.startsWith("| 未実施 |") || l.startsWith("| 実施済み |"));
    const pending = tableRows.filter((l) => l.startsWith("| 未実施 |")).length;
    const done = tableRows.filter((l) => l.startsWith("| 実施済み |")).length;
    expect(pending).toBe(2);
    expect(done).toBe(1);
    expect(md).toContain(`- 未実施: ${pending}件 / 実施済み: ${done}件`);
  });

  it("理由文の | は \\| へエスケープされる", () => {
    const md = renderNextToolsSection("design_boundary_values", [], undefined, [
      { toolName: "generate_test_cases", when: "always", reason: "A|B の分岐" },
    ]);
    expect(md).toContain("設計結果のテストケース化が未実施である（A\\|B の分岐）");
    expect(rowFor(md, "generate_test_cases")).toBeDefined();
  });

  it("固定の見出しと締めの注意書きを出力する", () => {
    const md = renderNextToolsSection("design_boundary_values", []);
    expect(md.split("\n")[0]).toBe("## 次に実行すべきツール");
    expect(md.split("\n").at(-1)).toBe(
      "- 未実施の後続ツールが残ったまま成果物を確定しないこと。この節は本ツールが静的に保持する後続表と生成物の内容から機械的に生成している。"
    );
    expect(md.endsWith("\n")).toBe(false);
  });
});
