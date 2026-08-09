#!/usr/bin/env node
// Excel（.xlsx）テストベースをMarkdownテキストへ変換する参照実装CLI。
//
// 用途:
//   docs/ai/testbase-ingestion.md の規約（共有文字列の解決／自己閉じセルの位置復元／
//   ふりがなの除去／図形内テキストの独立出力）を満たす最小の一実装。
//   MCPツール（review_test_specification 等）へ投入する自由テキストを作るための前処理。
//
// 使い方:
//   node scripts/extract-testbase-xlsx.mjs <input.xlsx> [--out <path>]
//
// --out 省略時は標準出力へ書く。指定時は親ディレクトリを作って書き出し、
// `extracted: <name> (<chars> chars)` を1行 stdout へ出す（scripts/extract-testbase-text.sh と同じ体裁）。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseDrawingTexts, parseSharedStrings, parseSheetRows, readOoxmlEntries } from "./lib/ooxml.mjs";

function printUsageAndExit() {
  console.error(
    "usage: node scripts/extract-testbase-xlsx.mjs <input.xlsx> [--out <path>]\n" +
      "  例: node scripts/extract-testbase-xlsx.mjs sample/non_contest_testbase/foo.xlsx --out .work/ingestion/foo.txt",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const positional = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      out = argv[i + 1];
      i++;
    } else {
      positional.push(arg);
    }
  }
  return { input: positional[0], out };
}

/** xl/workbook.xml と xl/_rels/workbook.xml.rels から、シート表示順のシート名→ファイル名対応を得る。 */
function resolveSheetOrder(entries) {
  const workbookXml = entries.get("xl/workbook.xml");
  const relsXml = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    throw new Error("xl/workbook.xml または xl/_rels/workbook.xml.rels が見つかりません（正しい .xlsx ではない可能性）");
  }

  const relIdToTarget = new Map();
  const relPattern = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
  let relMatch;
  while ((relMatch = relPattern.exec(relsXml)) !== null) {
    relIdToTarget.set(relMatch[1], relMatch[2]);
  }

  const sheets = [];
  const sheetPattern = /<sheet\b([^>]*)\/>/g;
  let sheetMatch;
  while ((sheetMatch = sheetPattern.exec(workbookXml)) !== null) {
    const attrs = sheetMatch[1];
    const nameMatch = /name="([^"]*)"/.exec(attrs);
    const ridMatch = /r:id="([^"]*)"/.exec(attrs);
    if (!nameMatch || !ridMatch) continue;
    const target = relIdToTarget.get(ridMatch[1]);
    if (!target) continue;
    const sheetFile = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    sheets.push({ name: nameMatch[1], sheetFile });
  }
  return sheets;
}

/** sheetN.xml のパスから対応する xl/worksheets/_rels/sheetN.xml.rels のパスを得る。 */
function relsPathForSheet(sheetFile) {
  const dir = path.posix.dirname(sheetFile);
  const base = path.posix.basename(sheetFile);
  return path.posix.join(dir, "_rels", `${base}.rels`);
}

/** シートのrelsから drawing リレーションのターゲット（xl/drawings/drawingN.xml 形式へ正規化）を得る。 */
function resolveDrawingPath(entries, sheetFile) {
  const relsXml = entries.get(relsPathForSheet(sheetFile));
  if (!relsXml) return null;
  const relPattern = /<Relationship\b[^>]*Type="[^"]*\/drawing"[^>]*Target="([^"]+)"[^>]*\/>/g;
  const match = relPattern.exec(relsXml);
  if (!match) return null;
  const target = match[1];
  if (target.startsWith("/")) return target.slice(1);
  // sheetFile は xl/worksheets/sheetN.xml。 Target は "../drawings/drawing1.xml" のような相対パス。
  const base = path.posix.dirname(sheetFile);
  return path.posix.normalize(path.posix.join(base, target));
}

function toPipeTable(rows) {
  const lines = [];
  let lastWasBlank = false;
  for (const row of rows) {
    if (row.length === 0) {
      if (!lastWasBlank) {
        lines.push("");
      }
      lastWasBlank = true;
      continue;
    }
    lastWasBlank = false;
    const escaped = row.map((cell) => cell.replace(/\|/g, "\\|"));
    lines.push(`| ${escaped.join(" | ")} |`);
  }
  // 先頭・末尾の空行を削る。
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

async function main() {
  const { input, out } = parseArgs(process.argv.slice(2));
  if (!input || path.extname(input).toLowerCase() !== ".xlsx") {
    printUsageAndExit();
  }

  const buffer = await readFile(input);
  let entries;
  try {
    entries = readOoxmlEntries(buffer);
  } catch (err) {
    console.error(`error: ZIP（.xlsx）として読み出せません: ${err.message}`);
    process.exit(2);
  }

  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml") ?? "");
  const sheets = resolveSheetOrder(entries);

  const baseName = path.basename(input, path.extname(input));
  const lines = [`# ${baseName}`];

  for (const sheet of sheets) {
    const sheetXml = entries.get(sheet.sheetFile);
    if (sheetXml === undefined) continue;
    const rows = parseSheetRows(sheetXml, sharedStrings);
    lines.push("", `## ${sheet.name}`, "", toPipeTable(rows));

    const drawingPath = resolveDrawingPath(entries, sheet.sheetFile);
    if (drawingPath) {
      const drawingXml = entries.get(drawingPath);
      if (drawingXml) {
        const shapeTexts = parseDrawingTexts(drawingXml);
        if (shapeTexts.length > 0) {
          lines.push("", `## 図形内テキスト（${sheet.name}）`, "");
          for (const text of shapeTexts) {
            lines.push(`- ${text}`);
          }
        }
      }
    }
  }

  const content = `${lines.join("\n")}\n`;

  if (out) {
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, content, "utf8");
    console.log(`extracted: ${path.basename(out)} (${content.length} chars)`);
  } else {
    process.stdout.write(content);
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
