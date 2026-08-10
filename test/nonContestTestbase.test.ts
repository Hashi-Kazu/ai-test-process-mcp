import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { parseDrawingTexts, readOoxmlEntries } from "../scripts/lib/ooxml.mjs";
import { extractIdOccurrences } from "../src/testBasisAnalysis.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sampleDir = path.join(repoRoot, "sample", "non_contest_testbase");
const FUBAN_BASENAME = "2026-08_digital-agency_atenabango-fuban-api_spec";
const ITEM_BASENAME = "2026-08_digital-agency_atenabango-kanri_item-definition";

// 00_成果物生成手順.md に記録した idPatterns 2本（正本は
// sample/non_contest_testbase/payloads/audit-id-population.json）。
const ID_PATTERN_SPLIT_CELL = "(?<![0-9A-Za-z])(\\d{3})\\s*\\|\\s*(\\d{1,3})(?![0-9A-Za-z])";
const ID_PATTERN_CODE_TABLE = "(?<=^\\|\\s{0,3})\\d{1,3}\\s*\\|(?:\\s*\\|)*\\s*(E\\d{4})(?![0-9A-Za-z])";

const workDirs: string[] = [];

afterAll(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
});

function extractToTemp(basename: string): string {
  const outDir = mkdtempSync(path.join(tmpdir(), "atenabango-"));
  workDirs.push(outDir);
  const outPath = path.join(outDir, `${basename}.txt`);
  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "extract-testbase-xlsx.mjs"),
      path.join(sampleDir, `${basename}.xlsx`),
      "--out",
      outPath,
    ],
    { cwd: repoRoot, stdio: "pipe" }
  );
  return readFileSync(outPath, "utf8");
}

describe("non_contest_testbase (住登外者宛名番号 Excel テストベース)", () => {
  it("preserves every <a:t> in the sequence-diagram drawing as a 図形内テキスト section", () => {
    const buffer = readFileSync(path.join(sampleDir, `${FUBAN_BASENAME}.xlsx`));
    const entries = readOoxmlEntries(buffer);
    const drawingName = [...entries.keys()].find((name) => name === "xl/drawings/drawing1.xml");
    expect(drawingName).toBeDefined();
    const xml = entries.get(drawingName!)!.toString("utf8");

    const allTexts = [...xml.matchAll(/<(?:[\w.]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?t>/g)].map((m) => m[1]);
    expect(allTexts).toHaveLength(53);

    const shapeTexts = parseDrawingTexts(xml);
    expect(shapeTexts).toHaveLength(12);

    const normalize = (value: string): string => value.replace(/\s+/g, "");
    const allJoined = normalize(allTexts.join(""));
    const shapeJoined = normalize(shapeTexts.join(""));
    expect(allJoined).toHaveLength(454);
    expect(shapeJoined).toBe(allJoined);
  });

  it("detects 33 defined ids from the Excel testbase with the documented idPatterns", () => {
    const documents = [
      { name: FUBAN_BASENAME, content: extractToTemp(FUBAN_BASENAME) },
      { name: ITEM_BASENAME, content: extractToTemp(ITEM_BASENAME) },
    ];

    const occurrences = extractIdOccurrences(documents, {
      idPatterns: [ID_PATTERN_SPLIT_CELL, ID_PATTERN_CODE_TABLE],
    });
    const definedIds = [...new Set(occurrences.filter((o) => o.role === "definition").map((o) => o.id))];

    expect(definedIds).toHaveLength(33);
    for (let i = 1; i <= 29; i += 1) {
      expect(definedIds).toContain(`031-${i}`);
    }
    for (const code of ["E0001", "E0002", "E0003", "E0004"]) {
      expect(definedIds).toContain(code);
    }
  });

  it("the committed 01_ deliverable reports a computed population coverage rate", () => {
    const markdown = readFileSync(
      path.join(sampleDir, "01_ID母集団監査_住登外者宛名番号テストベース.md"),
      "utf8"
    );
    expect(markdown).toContain("定義ID総数: 33");
    expect(markdown).toMatch(/母集団反映率: \d+(?:\.\d+)?%/);
    expect(markdown).toContain("未宣言: 0");
  });

  it("the 17_/18_ deliverables cite the 図形内テキスト section as evidence", () => {
    for (const name of ["17_実行順序分析結果.md", "18_データフロー・タイミング分析結果.md"]) {
      const markdown = readFileSync(path.join(sampleDir, name), "utf8");
      expect(markdown).toContain("図形内テキスト（APIシーケンス）");
      expect(markdown).toContain(FUBAN_BASENAME);
    }
  });
});
