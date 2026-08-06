import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { registeredToolNames } from "../src/resources/nextToolCatalog.js";
import { toolOutputSignatures } from "../src/resources/toolOutputSignatures.js";

const toolsDir = fileURLToPath(new URL("../src/tools", import.meta.url));

function toolsSourceByFile(): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of readdirSync(toolsDir)) {
    if (!file.endsWith(".ts") || file === "index.ts") continue;
    map.set(file, readFileSync(join(toolsDir, file), "utf8"));
  }
  return map;
}

describe("toolOutputSignatures", () => {
  const sources = toolsSourceByFile();
  const allSource = [...sources.values()].join("\n");

  it("registeredToolNames と1対1で一致する", () => {
    expect(Object.keys(toolOutputSignatures).sort()).toEqual([...registeredToolNames].sort());
  });

  it("各 heading が src/tools/*.ts のいずれかのソース中に文字列リテラルとして実在する", () => {
    for (const [toolName, sig] of Object.entries(toolOutputSignatures)) {
      const literalForms = [`"${sig.heading}"`, `\`${sig.heading}`];
      const found = literalForms.some((lit) => allSource.includes(lit));
      expect(found, `${toolName}: ${sig.heading}`).toBe(true);
    }
  });

  it("heading は重複しない(prefix対象を除く完全一致同士で衝突しない)", () => {
    const exactHeadings = Object.values(toolOutputSignatures)
      .filter((s) => !s.prefix)
      .map((s) => s.heading);
    expect(new Set(exactHeadings).size).toBe(exactHeadings.length);
  });

  it("prefix 指定の見出しは他ツールの完全一致見出しと前方一致衝突しない", () => {
    const prefixEntries = Object.entries(toolOutputSignatures).filter(([, s]) => s.prefix);
    for (const [toolName, sig] of prefixEntries) {
      for (const [otherName, other] of Object.entries(toolOutputSignatures)) {
        if (otherName === toolName) continue;
        expect(
          other.heading.startsWith(sig.heading),
          `${toolName} の prefix「${sig.heading}」が ${otherName} の見出し「${other.heading}」と衝突する`
        ).toBe(false);
      }
    }
  });

  it("create_test_plan は prefix 指定であり、コロン付きの前方一致になる", () => {
    expect(toolOutputSignatures.create_test_plan).toEqual({
      heading: "# テスト計画書:",
      prefix: true,
    });
  });
});
