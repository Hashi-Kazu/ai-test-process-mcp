import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nextToolCatalog, registeredToolNames } from "../src/resources/nextToolCatalog.js";
import { testTechniqueToolMapping } from "../src/resources/testPerspectiveCatalog.js";

const toolsDir = fileURLToPath(new URL("../src/tools", import.meta.url));

function actualToolNames(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(toolsDir)) {
    if (!file.endsWith(".ts") || file === "index.ts") continue;
    const source = readFileSync(join(toolsDir, file), "utf8");
    for (const m of source.matchAll(/registerTool\(\s*\n\s*"([a-z0-9_]+)"/g)) {
      names.add(m[1]);
    }
  }
  return names;
}

describe("nextToolCatalog", () => {
  const actual = actualToolNames();

  it("registeredToolNames が src/tools/*.ts の実ツール名と完全一致する", () => {
    expect(actual.size).toBe(26);
    expect([...registeredToolNames].sort()).toEqual([...actual].sort());
  });

  it("全登録ツールに後続エントリが存在し、後続ツール名がすべて実在する", () => {
    expect(Object.keys(nextToolCatalog).sort()).toEqual([...actual].sort());
    for (const [source, entries] of Object.entries(nextToolCatalog)) {
      expect(entries.length, source).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(actual.has(entry.toolName), `${source} -> ${entry.toolName}`).toBe(true);
      }
    }
  });

  it("自分自身を後続に持つエントリが無い", () => {
    for (const [source, entries] of Object.entries(nextToolCatalog)) {
      for (const entry of entries) {
        expect(entry.toolName, source).not.toBe(source);
      }
    }
  });

  it("同一実行元内で後続ツール名の重複が無い", () => {
    for (const [source, entries] of Object.entries(nextToolCatalog)) {
      const names = entries.map((e) => e.toolName);
      expect(new Set(names).size, source).toBe(names.length);
    }
  });

  it("すべてのエントリの reason と when が非空である", () => {
    for (const [source, entries] of Object.entries(nextToolCatalog)) {
      for (const entry of entries) {
        expect(entry.reason.trim().length, `${source} -> ${entry.toolName}`).toBeGreaterThan(0);
        expect(entry.when.trim().length, `${source} -> ${entry.toolName}`).toBeGreaterThan(0);
      }
    }
  });

  it("testTechniqueToolMapping の全 toolName が実ツール名に含まれる", () => {
    for (const mapping of testTechniqueToolMapping) {
      expect(actual.has(mapping.toolName), mapping.techniqueId).toBe(true);
    }
  });
});
