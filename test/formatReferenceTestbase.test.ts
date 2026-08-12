import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseWordDocument, readOoxmlEntries } from "../scripts/lib/ooxml.mjs";
import { buildDocumentDigests, findDocumentDigestFindings } from "../src/documentDigest.js";
import { findAmbiguousTerms } from "../src/testBasisAnalysis.js";
import { renderTestBasisReview } from "../src/tools/reviewTestBasis.js";
import { renderRequirementsAnalysis } from "../src/tools/analyzeRequirements.js";
import { renderIdPopulationAudit } from "../src/tools/auditIdPopulation.js";
import { renderBasisContradictionAudit } from "../src/tools/auditBasisContradictions.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const formatRefDir = path.join(repoRoot, "sample", "non_contest_testbase", "format_reference");
const readmePath = path.join(formatRefDir, "README.md");

function readReadme(): string {
  return readFileSync(readmePath, "utf8");
}

function walkFiles(dir: string): string[] {
  let files: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      files = files.concat(walkFiles(p));
    } else {
      files.push(p);
    }
  }
  return files;
}

describe("format_reference (Word/Markdown/JSON リファレンス原本と README実測値の照合)", () => {
  describe("Word", () => {
    const wordDir = path.join(formatRefDir, "word");
    const MAIN = "2026-08_digital-agency_common-feature-spec_v2.1.docx";
    const SHINKYU = "2026-08_digital-agency_common-feature-spec_v2.1_shinkyu-taishohyo.docx";

    it("main spec docx: heading pStyle usage, w:tbl count, w:ins/w:del count match README", () => {
      const buffer = readFileSync(path.join(wordDir, MAIN));
      const entries = readOoxmlEntries(buffer);
      const documentXml = entries.get("word/document.xml")!;
      expect(documentXml).toBeDefined();

      const headingStyleUsage: Record<string, number> = { "1": 0, "21": 0, "31": 0 };
      for (const id of Object.keys(headingStyleUsage)) {
        const re = new RegExp(`<w:pStyle\\b[^>]*w:val="${id}"`, "g");
        headingStyleUsage[id] = (documentXml.match(re) ?? []).length;
      }
      const totalHeadingParagraphs =
        headingStyleUsage["1"] + headingStyleUsage["21"] + headingStyleUsage["31"];

      const tblCount = (documentXml.match(/<w:tbl\b/g) ?? []).length;
      const insCount = (documentXml.match(/<w:ins\b/g) ?? []).length;
      const delCount = (documentXml.match(/<w:del\b/g) ?? []).length;

      expect(totalHeadingParagraphs).toBe(49);
      expect(tblCount).toBe(6);
      expect(insCount).toBe(0);
      expect(delCount).toBe(0);

      const readme = readReadme();
      expect(readme).toContain("3+14+32=49件");
      expect(readme).toContain("`w:tbl` は6件あり");
      expect(readme).toContain("`w:ins`/`w:del` は1件も無い（実測: いずれも0件）");
    });

    it("main spec docx: parseWordDocument() output metrics (chars/lines/#/pipe/TOC-like) match README", () => {
      const buffer = readFileSync(path.join(wordDir, MAIN));
      const entries = readOoxmlEntries(buffer);
      const documentXml = entries.get("word/document.xml")!;
      const stylesXml = entries.get("word/styles.xml")!;
      const body = parseWordDocument(documentXml, stylesXml);
      const lines = body.split("\n");

      const chars = body.length;
      const lineCount = lines.length;
      const headingLines = lines.filter((l: string) => l.startsWith("#")).length;
      const pipeLines = lines.filter((l: string) => l.startsWith("| ")).length;
      const tocLikeLines = lines.filter((l: string) => /^\d+(\.\d+)*\..+\d+$/.test(l)).length;

      expect(chars).toBe(32676);
      expect(lineCount).toBe(1155);
      expect(headingLines).toBe(49);
      expect(pipeLines).toBe(92);
      expect(tocLikeLines).toBe(0);

      const readme = readReadme();
      expect(readme).toContain("文字数: 32,676字");
      expect(readme).toContain("行数: 1,155行");
      expect(readme).toContain("`#`始まり行数: 49");
      expect(readme).toContain("パイプ表行数: 92");
      expect(readme).toContain("目次由来行数（`^\\d+(\\.\\d+)*\\..+\\d+$`）: 0");
    });

    it("shinkyu-taishohyo docx: no heading styles, 1 w:tbl, no w:ins/w:del, matches README", () => {
      const buffer = readFileSync(path.join(wordDir, SHINKYU));
      const entries = readOoxmlEntries(buffer);
      const documentXml = entries.get("word/document.xml")!;
      const stylesXml = entries.get("word/styles.xml")!;
      const body = parseWordDocument(documentXml, stylesXml);
      const lines = body.split("\n");

      const tblCount = (documentXml.match(/<w:tbl\b/g) ?? []).length;
      const insCount = (documentXml.match(/<w:ins\b/g) ?? []).length;
      const delCount = (documentXml.match(/<w:del\b/g) ?? []).length;
      const pipeLines = lines.filter((l: string) => l.startsWith("| ")).length;

      expect(tblCount).toBe(1);
      expect(insCount).toBe(0);
      expect(delCount).toBe(0);
      expect(pipeLines).toBe(2);
      expect(body.length).toBe(5797);
      expect(lines.length).toBe(4);

      const readme = readReadme();
      expect(readme).toContain("文字数 5,797字、行数4行、`#`始まり行数0、パイプ表行数2");
    });

    // 代替アンカー（見出しが退化した実務Wordに対するパイプ表の行/列アンカー）の受け入れ本体。
    // 期待値は docs/ai/regression-baseline.md 19.7 の実測値と対応する。
    // Issue #209（HSKZ-213）の除外規則（AMBX-01/AMBX-02、ambiguityExclusionRules）適用後の値
    // （旧: 169/146/23）。等94件・必要な10件（本編）、等8件（新旧対照表）が除外された。
    it("resolves 95%+ of ambiguous-term findings to a section anchor across both docx (57 findings total after AMBX-01/AMBX-02 exclusions)", () => {
      const documents = [MAIN, SHINKYU].map((name) => {
        const entries = readOoxmlEntries(readFileSync(path.join(wordDir, name)));
        const documentXml = entries.get("word/document.xml")!;
        const stylesXml = entries.get("word/styles.xml")!;
        return { name, content: parseWordDocument(documentXml, stylesXml) as string };
      });

      const findings = findAmbiguousTerms(documents);
      let total = 0;
      let resolved = 0;
      const perDoc = new Map<string, { total: number; resolved: number; alternative: number }>();
      for (const name of [MAIN, SHINKYU]) {
        perDoc.set(name, { total: 0, resolved: 0, alternative: 0 });
      }
      for (const finding of findings) {
        for (const group of finding.byHeading) {
          const entry = perDoc.get(group.document)!;
          total += group.count;
          entry.total += group.count;
          if (group.heading !== "(見出しなし)") {
            resolved += group.count;
            entry.resolved += group.count;
          }
          if (group.heading.startsWith("[代替アンカー")) {
            entry.alternative += group.count;
          }
        }
      }

      expect(total).toBe(57);
      // 解決率95%以上（実測: 57/57 = 100%）
      expect(resolved * 100).toBeGreaterThanOrEqual(total * 95);

      // 本編（見出し49件）は従来どおり見出しラベルで解決し、代替アンカーを一切使わない。
      expect(perDoc.get(MAIN)).toEqual({ total: 42, resolved: 42, alternative: 0 });
      // 新旧対照表（見出し0件・5,797字が1セル）は全件が代替アンカーで解決される。
      expect(perDoc.get(SHINKYU)).toEqual({ total: 15, resolved: 15, alternative: 15 });

      const shinkyuHeadings = findings
        .flatMap((f) => f.byHeading)
        .filter((g) => g.document === SHINKYU)
        .map((g) => g.heading);
      expect(new Set(shinkyuHeadings)).toEqual(
        new Set([
          "[代替アンカー:表行] 表「改定後 / 現行」第1行 第1列「改定後」(行4)",
          "[代替アンカー:表行] 表「改定後 / 現行」第1行 第2列「現行」(行4)",
        ])
      );

      // ダイジェスト側は代替アンカーを使った文書だけを info で明示する。
      const rows = buildDocumentDigests(documents);
      expect(rows.find((r) => r.document === MAIN)!.sectionAnchor.mode).toBe("heading");
      expect(rows.find((r) => r.document === SHINKYU)!.sectionAnchor).toEqual({
        mode: "alternative",
        distinctHeadingAnchors: 1,
        alternativeAnchorLineCount: 2,
        alternativeTableCount: 1,
      });
      const digestFindings = findDocumentDigestFindings(rows);
      const alt = digestFindings.filter((f) => f.kind === "alternative-section-anchor");
      expect(alt).toHaveLength(1);
      expect(alt[0].document).toBe(SHINKYU);
      expect(alt[0].detail).toContain("5,797字");
      expect(alt[0].detail).toContain("対象行2行・表1件");
    });

    // 「検査実行状況」対照表の受け入れ本体（実務Word2件を原文投入口を持つ4ツールへ投入した実測）。
    // 期待値は docs/ai/regression-baseline.md 19.8 の実測値と対応する。
    it("counts 10+ distinct uninspectable checks across 4 tools for the two practical docx", () => {
      const documents = [MAIN, SHINKYU].map((name) => {
        const entries = readOoxmlEntries(readFileSync(path.join(wordDir, name)));
        const documentXml = entries.get("word/document.xml")!;
        const stylesXml = entries.get("word/styles.xml")!;
        return { name, content: parseWordDocument(documentXml, stylesXml) as string };
      });

      const outputs: Record<string, string> = {
        review_test_basis: renderTestBasisReview(documents),
        analyze_requirements: renderRequirementsAnalysis({ documents }),
        audit_id_population: renderIdPopulationAudit({ documents, declaredPopulations: [] }),
        audit_basis_contradictions: renderBasisContradictionAudit({ documents }),
      };

      // 「ツール名 + 検査」の組の異なり件数。区分IDを持たない検査は節ラベルでキーを作る。
      const distinct = new Set<string>();
      const perTool = new Map<string, number>();
      for (const [toolName, markdown] of Object.entries(outputs)) {
        const section = markdown.split("## 検査実行状況")[1];
        expect(section, toolName).toBeDefined();
        const rows = section.split("\n").filter((l) => l.startsWith("| 検査不能 |"));
        perTool.set(toolName, rows.length);
        for (const row of rows) {
          const cells = row.split("|").map((c) => c.trim());
          const checkKey = cells[3] === "-" ? cells[2] : cells[3];
          distinct.add(`${toolName}::${checkKey}`);
        }
      }

      // 実測: 2 + 2 + 6 + 7 = 17 区分（異なり）。閾値は10区分以上。
      expect(distinct.size).toBe(17);
      expect(distinct.size).toBeGreaterThanOrEqual(10);
      expect(Object.fromEntries(perTool)).toEqual({
        review_test_basis: 2,
        analyze_requirements: 2,
        audit_id_population: 6,
        audit_basis_contradictions: 7,
      });

      // 定義IDが両文書0件であることが検査不能の主因である（実測の裏付け）。
      const digestRows = buildDocumentDigests(documents);
      expect(digestRows.map((r) => r.definedIdCount)).toEqual([0, 0]);

      // audit_basis_contradictions は既存サマリ行が列挙する6区分と一致する
      // （BC-08 は数量パラメータが実在するため実行、BC-09 は改訂宣言0件で対照表のみに現れる）。
      const bcSection = outputs.audit_basis_contradictions.split("## 検査実行状況")[1];
      const bcUninspectable = bcSection
        .split("\n")
        .filter((l) => l.startsWith("| 検査不能 |"))
        .map((l) => l.split("|")[3].trim())
        .filter((id) => id !== "BC-08" && id !== "BC-09");
      expect(bcUninspectable).toEqual(["BC-02", "BC-03", "BC-04", "BC-05", "BC-06", "BC-10"]);
      expect(outputs.audit_basis_contradictions).toContain(
        "- 検査不能(要確認)の区分: BC-02, BC-03, BC-04, BC-05, BC-06, BC-10（UI要素・遷移が0件のため。未指摘は合格を意味しない）"
      );
    });
  });

  describe("Markdown", () => {
    const markdownRoot = path.join(formatRefDir, "markdown", "2026-08_digital-agency_gif-2.3");

    it("aggregated md metrics (file count / chars / #-lines / pipe-lines / classDiagram files) match README", () => {
      const mdFiles = walkFiles(markdownRoot).filter((f) => f.endsWith(".md"));

      let totalChars = 0;
      let totalHeadingLines = 0;
      let totalPipeLines = 0;
      let classDiagramFiles = 0;
      let numberedPrefixFiles = 0;
      let otherFiles = 0;

      for (const f of mdFiles) {
        const content = readFileSync(f, "utf8");
        totalChars += content.length;
        const lines = content.split("\n");
        totalHeadingLines += lines.filter((l) => l.startsWith("#")).length;
        totalPipeLines += lines.filter((l) => l.trim().startsWith("|")).length;
        if (content.includes("classDiagram")) classDiagramFiles += 1;
        if (/^\d{2}[^\d]/.test(path.basename(f))) {
          numberedPrefixFiles += 1;
        } else {
          otherFiles += 1;
        }
      }
      const patternTypeCount = (numberedPrefixFiles > 0 ? 1 : 0) + (otherFiles > 0 ? 1 : 0);

      expect(mdFiles).toHaveLength(26);
      expect(totalChars).toBe(41373);
      expect(totalHeadingLines).toBe(0);
      expect(totalPipeLines).toBe(0);
      expect(classDiagramFiles).toBe(25);
      expect(patternTypeCount).toBe(2);

      const readme = readReadme();
      expect(readme).toContain("総ファイル数: 26");
      expect(readme).toContain("総文字数（UTF-8デコード後の文字列長の合計）: 41,373字");
      expect(readme).toContain("`#`始まり行数（全ファイル合計）: 0");
      expect(readme).toContain("パイプ（`|`）始まり行数（全ファイル合計）: 0");
      expect(readme).toContain("mermaid `classDiagram` を含むファイル数: 25");
      expect(readme).toContain("章節ID相当のファイル名パターン種別数: 2種類");
    });

    it("license file is CC0 1.0 and is committed as-is", () => {
      const licenseText = readFileSync(path.join(markdownRoot, "license"), "utf8");
      expect(licenseText).toContain("CC0 1.0 Universal");

      const readme = readReadme();
      expect(readme).toContain("CC0 1.0 Universal");
    });
  });

  describe("JSON", () => {
    const jsonPath = path.join(formatRefDir, "json", "2026-08_jma_bosai-area.json");

    it("top-level key element counts, \"id\" occurrence count, and pretty-print size match README", () => {
      const raw = readFileSync(jsonPath, "utf8");
      const data = JSON.parse(raw) as Record<string, Record<string, unknown>>;

      const topLevelCounts: Record<string, number> = {};
      for (const key of Object.keys(data)) {
        topLevelCounts[key] = Object.keys(data[key]).length;
      }
      const idOccurrences = (raw.match(/"id"\s*:/g) ?? []).length;
      const lineCount = raw.split("\n").length;
      const pretty = JSON.stringify(data, null, 2);

      expect(topLevelCounts).toEqual({
        centers: 11,
        offices: 58,
        class10s: 142,
        class15s: 375,
        class20s: 1805,
      });
      expect(idOccurrences).toBe(0);
      expect(lineCount).toBe(1);
      expect(pretty.length).toBe(352587);
      expect(pretty.split("\n").length).toBe(17382);

      const readme = readReadme();
      expect(readme).toContain(
        "`centers`=11、`offices`=58、`class10s`=142、`class15s`=375、`class20s`=1805"
      );
      expect(readme).toContain('`"id"` フィールド出現数: 0');
      expect(readme).toContain("行数（原本のまま）: 1行（**minify済み**");
      expect(readme).toContain("pretty-print（`JSON.stringify(data, null, 2)`）後の行数: 17,382行、文字数: 352,587字");
    });
  });
});
