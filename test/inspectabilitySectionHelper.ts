import { expect } from "vitest";
import { inspectabilityChecksFor } from "../src/inspectabilityAnalysis.js";

const HEADING = "## 検査実行状況(実行された検査 / 検査不能な検査)";

export interface InspectabilityTableRow {
  status: string;
  checkLabel: string;
  catalogId: string;
  condition: string;
  measured: string;
}

/** 「検査実行状況」節の表行を構造化して返す。 */
export function parseInspectabilityRows(markdown: string): InspectabilityTableRow[] {
  const section = markdown.split(HEADING)[1] ?? "";
  return section
    .split("\n")
    .filter((l) => l.startsWith("| 実行 |") || l.startsWith("| 検査不能 |"))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim());
      return {
        status: cells[1],
        checkLabel: cells[2],
        catalogId: cells[3],
        condition: cells[4],
        measured: cells[5],
      };
    });
}

/**
 * 「検査実行状況」節が1回だけ存在し、`## 次に実行すべきツール` の直前にあり、
 * 「実行」行に対応する出力節ラベルが同一出力内の見出し行に部分文字列として現れることを検証する。
 */
export function expectInspectabilitySection(markdown: string, toolName: string): void {
  const headings = markdown.split("\n").filter((l) => l.startsWith("## "));
  expect(headings.filter((l) => l === HEADING)).toHaveLength(1);
  expect(headings[headings.indexOf(HEADING) + 1]).toBe("## 次に実行すべきツール");
  // 対照表には検査可能率などの百分率（数値＋%）を出さない
  const sectionBody = markdown.split(HEADING)[1].split("\n## ")[0];
  expect(sectionBody).not.toMatch(/\d\s*%/);

  const rows = parseInspectabilityRows(markdown);
  expect(rows.length).toBeGreaterThan(0);
  const executedCount = rows.filter((r) => r.status === "実行").length;
  const unavailableCount = rows.filter((r) => r.status === "検査不能").length;
  expect(markdown).toContain(`- 実行: ${executedCount}区分 / 検査不能: ${unavailableCount}区分`);
  // 検査不能行が実行行より先に並ぶ
  const statuses = rows.map((r) => r.status);
  if (executedCount > 0 && unavailableCount > 0) {
    expect(statuses.indexOf("実行")).toBeGreaterThan(statuses.lastIndexOf("検査不能"));
  }

  const checks = inspectabilityChecksFor(toolName);
  const allHeadingLines = markdown.split("\n").filter((l) => l.startsWith("#"));
  for (const row of rows) {
    if (row.status !== "実行") continue;
    const check =
      row.catalogId === "-"
        ? checks.find((c) => c.sectionLabel === row.checkLabel)
        : checks.find((c) => c.catalogId === row.catalogId);
    expect(check, `${toolName}: ${row.catalogId} ${row.checkLabel}`).toBeDefined();
    const sectionLabel = check!.sectionLabel;
    expect(
      allHeadingLines.some((h) => h.includes(sectionLabel)),
      `${toolName}: 実行された検査の節ラベル「${sectionLabel}」が出力の見出し行に現れない`
    ).toBe(true);
  }
}

/** 指定した区分ID（または検査名）が「検査不能」行として現れることを検証する。 */
export function expectUninspectable(markdown: string, catalogIdOrLabel: string): void {
  const rows = parseInspectabilityRows(markdown).filter((r) => r.status === "検査不能");
  expect(
    rows.some((r) => r.catalogId === catalogIdOrLabel || r.checkLabel === catalogIdOrLabel),
    `「${catalogIdOrLabel}」が検査不能行に現れない: ${JSON.stringify(rows)}`
  ).toBe(true);
}

/** 指定した区分ID（または検査名）が「実行」行として現れることを検証する。 */
export function expectExecuted(markdown: string, catalogIdOrLabel: string): void {
  const rows = parseInspectabilityRows(markdown).filter((r) => r.status === "実行");
  expect(
    rows.some((r) => r.catalogId === catalogIdOrLabel || r.checkLabel === catalogIdOrLabel),
    `「${catalogIdOrLabel}」が実行行に現れない: ${JSON.stringify(rows)}`
  ).toBe(true);
}
