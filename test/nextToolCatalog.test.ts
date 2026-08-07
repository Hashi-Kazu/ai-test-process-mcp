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
    expect(actual.size).toBe(30);
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

  it("同一実行元内で toolName+when の組が一意である", () => {
    for (const [source, entries] of Object.entries(nextToolCatalog)) {
      const keys = entries.map((e) => `${e.toolName}::${e.when}`);
      expect(new Set(keys).size, source).toBe(keys.length);
    }
  });

  it("同一実行元・同一toolNameに always エントリは高々1件である", () => {
    for (const [source, entries] of Object.entries(nextToolCatalog)) {
      const alwaysCounts = new Map<string, number>();
      for (const entry of entries) {
        if (entry.when !== "always") continue;
        alwaysCounts.set(entry.toolName, (alwaysCounts.get(entry.toolName) ?? 0) + 1);
      }
      for (const [toolName, count] of alwaysCounts) {
        expect(count, `${source} -> ${toolName}`).toBe(1);
      }
    }
  });

  it("条件付きエントリのシグナルキーが src/tools/*.ts のソース中に実在する", () => {
    const toolsSource = readdirSync(toolsDir)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts")
      .map((f) => readFileSync(join(toolsDir, f), "utf8"))
      .join("\n");
    for (const [source, entries] of Object.entries(nextToolCatalog)) {
      for (const entry of entries) {
        if (entry.when === "always") continue;
        expect(toolsSource.includes(entry.when), `${source} -> ${entry.when}`).toBe(true);
      }
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
