// 本文との照合（grounding）に使う文字列正規化の正本。
// 複数の分析エンジン（testCaseAnalysis / causeEffectAnalysis / crossMatrixAnalysis）が
// 同一の正規化規則で本文照合するため、規則をこのモジュールへ一本化している。
// 純関数のみ。乱数・現在時刻・環境依存の値は一切使わない。

const GROUNDING_SYMBOL_CHARS =
  "、。，．・:：;；!！?？…「」『』“”\"'（）()【】[]{}〈〉《》／/\\|＊*＋+,.-‐–—ー~〜→←↑↓";
const GROUNDING_SYMBOLS = new Set(Array.from(GROUNDING_SYMBOL_CHARS));

/** 表記差（全角半角・大文字小文字・空白・記号）を吸収した照合用文字列へ正規化する。 */
export function normalizeForGrounding(text: string): string {
  const base = text.normalize("NFKC").toLowerCase();
  let out = "";
  for (const ch of base) {
    if (ch === "　" || /\s/.test(ch)) continue;
    if (GROUNDING_SYMBOLS.has(ch)) continue;
    out += ch;
  }
  return out;
}
