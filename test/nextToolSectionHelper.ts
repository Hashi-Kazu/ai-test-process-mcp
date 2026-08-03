import { expect } from "vitest";

/**
 * レンダリング結果の末尾に「次に実行すべきツール」節が1回だけ現れ、
 * それが出力中で最後の `## ` 見出しであることを検証する。
 */
export function expectNextToolsSection(markdown: string): void {
  const heading = "## 次に実行すべきツール";
  const headings = markdown.split("\n").filter((l) => l.startsWith("## "));
  expect(headings.filter((l) => l === heading)).toHaveLength(1);
  expect(headings.at(-1)).toBe(heading);
}
