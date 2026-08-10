#!/usr/bin/env node
// Word（.docx）テストベースをMarkdownテキストへ変換する参照実装CLI。
//
// 用途:
//   docs/ai/testbase-ingestion.md の規約（見出しの # 対応／目次の除去／変更履歴の反映／表のパイプ表化）
//   を満たす最小の一実装。MCPツールへ投入する自由テキストを作るための前処理。
//
// 使い方:
//   node scripts/extract-testbase-docx.mjs <input.docx> [--out <path>]
//
// --out 省略時は標準出力へ書く。指定時は親ディレクトリを作って書き出し、
// `extracted: <name> (<chars> chars)` を1行 stdout へ出す（scripts/extract-testbase-text.sh と同じ体裁）。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseWordDocument, readOoxmlEntries } from "./lib/ooxml.mjs";

function printUsageAndExit() {
  console.error(
    "usage: node scripts/extract-testbase-docx.mjs <input.docx> [--out <path>]\n" +
      "  例: node scripts/extract-testbase-docx.mjs sample/non_contest_testbase/foo.docx --out .work/ingestion/foo.txt",
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

async function main() {
  const { input, out } = parseArgs(process.argv.slice(2));
  if (!input || path.extname(input).toLowerCase() !== ".docx") {
    printUsageAndExit();
  }

  const buffer = await readFile(input);
  let entries;
  try {
    entries = readOoxmlEntries(buffer);
  } catch (err) {
    console.error(`error: ZIP（.docx）として読み出せません: ${err.message}`);
    process.exit(2);
  }

  const documentXml = entries.get("word/document.xml");
  if (documentXml === undefined) {
    console.error("error: word/document.xml が見つかりません（正しい .docx ではない可能性）");
    process.exit(2);
  }

  const stylesXml = entries.get("word/styles.xml");

  const baseName = path.basename(input, path.extname(input));
  const body = parseWordDocument(documentXml, stylesXml);
  const content = `# ${baseName}\n\n${body}\n`;

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
