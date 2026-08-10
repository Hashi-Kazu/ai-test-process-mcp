import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseWordDocument, readOoxmlEntries } from "../scripts/lib/ooxml.mjs";

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

      expect(chars).toBe(33871);
      expect(lineCount).toBe(1251);
      expect(headingLines).toBe(49);
      expect(pipeLines).toBe(92);
      expect(tocLikeLines).toBe(48);

      const readme = readReadme();
      expect(readme).toContain("文字数: 33,871字");
      expect(readme).toContain("行数: 1,251行");
      expect(readme).toContain("`#`始まり行数: 49");
      expect(readme).toContain("パイプ表行数: 92");
      expect(readme).toContain("目次由来行数（`^\\d+(\\.\\d+)*\\..+\\d+$`）: 48");
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
