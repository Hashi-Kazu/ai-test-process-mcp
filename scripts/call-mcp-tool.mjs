#!/usr/bin/env node
// dist/server.js を stdio で起動して tools/call を1回実行し、返却テキストをファイルへ書き出す小さなクライアント。
//
// テストベース全文（数十万文字）を payload JSON に埋め込まずに投入するため、
// --documents-dir で指定したディレクトリの *.txt をファイル名昇順で読み、
// {name, content} 配列として payload の --documents-key へ注入する。
//
// 使い方:
//   node scripts/call-mcp-tool.mjs \
//     --tool audit_id_population \
//     --payload sample/2025/payloads/audit-id-population.json \
//     --documents-dir .work/testbase/2025 \
//     --documents-key documents \
//     --out sample/2025/01_ID母集団監査_2025テストベース.md
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const USAGE = `usage: node scripts/call-mcp-tool.mjs --tool <name> --payload <json> --out <path>
                                     [--documents-dir <dir>] [--documents-key <documents|testBasisDocuments>]
                                     [--server <path to dist/server.js>]`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}\n${USAGE}`);
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${key}\n${USAGE}`);
    args[key] = value;
    i += 1;
  }
  return args;
}

async function loadDocuments(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile() && e.name.endsWith(".txt"))
    .map((e) => e.name)
    // ファイル名昇順（ロケール非依存のコードポイント順）で決定的にする
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (names.length === 0) throw new Error(`no *.txt found in ${dir}`);
  const documents = [];
  for (const name of names) {
    const content = await readFile(path.join(dir, name), "utf8");
    documents.push({ name: name.replace(/\.txt$/, ""), content });
  }
  return documents;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ["tool", "payload", "out"]) {
    if (!args[required]) throw new Error(`--${required} is required\n${USAGE}`);
  }

  const payload = JSON.parse(await readFile(args.payload, "utf8"));

  if (args["documents-dir"]) {
    const key = args["documents-key"] ?? "documents";
    if (payload[key] !== undefined) {
      throw new Error(`payload already has "${key}"; remove it or omit --documents-dir`);
    }
    payload[key] = await loadDocuments(args["documents-dir"]);
  }

  const serverPath = args.server ?? "dist/server.js";
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "inherit",
  });
  const client = new Client({ name: "call-mcp-tool", version: "1.0.0" });
  await client.connect(transport);

  let result;
  try {
    result = await client.callTool({ name: args.tool, arguments: payload }, undefined, {
      // 全文投入は入力が大きいのでレンダリング完了まで十分に待つ
      timeout: 600000,
    });
  } finally {
    await client.close();
  }

  if (result.isError) {
    const detail = (result.content ?? []).map((c) => c.text ?? "").join("\n");
    throw new Error(`tool ${args.tool} returned an error:\n${detail}`);
  }

  const text = (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  if (text.trim() === "") throw new Error(`tool ${args.tool} returned no text content`);

  await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  await writeFile(args.out, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  process.stderr.write(`wrote ${args.out} (${text.length} chars)\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
