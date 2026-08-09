// 本文との照合（grounding）に使う文字列正規化の正本。
// 複数の分析エンジン（testCaseAnalysis / causeEffectAnalysis / crossMatrixAnalysis）が
// 同一の正規化規則で本文照合するため、規則をこのモジュールへ一本化している。
// 純関数のみ。乱数・現在時刻・環境依存の値は一切使わない。

const GROUNDING_SYMBOL_CHARS =
  "、。，．・:：;；!！?？…「」『』“”\"'（）()【】[]{}〈〉《》／/\\|＊*＋+,.-‐–—ー~〜→←↑↓";
const GROUNDING_SYMBOLS = new Set(Array.from(GROUNDING_SYMBOL_CHARS));

// 双方向制御文字（LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI, LRM/RLM）。
// バイナリ→テキスト変換で本文へ混入し、可視文字を持たないため照合・行頭判定を狂わせる。
export const BIDI_CONTROL_PATTERN = /[‪-‮⁦-⁩‎‏]/gu;

/** 双方向制御文字を除去した文字列を返す（他の文字は一切変えない）。 */
export function stripBidiControls(text: string): string {
  return text.replace(BIDI_CONTROL_PATTERN, "");
}

/** 双方向制御文字の出現数を符号位置別に数える。符号位置の昇順で返す（決定的）。 */
export function countBidiControls(text: string): {
  total: number;
  byCodePoint: { codePoint: string; count: number }[];
} {
  const counts = new Map<string, number>();
  const matches = text.match(BIDI_CONTROL_PATTERN);
  let total = 0;
  if (matches) {
    for (const ch of matches) {
      total++;
      const codePoint = "U+" + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
      counts.set(codePoint, (counts.get(codePoint) ?? 0) + 1);
    }
  }
  const byCodePoint = Array.from(counts.entries())
    .map(([codePoint, count]) => ({ codePoint, count }))
    .sort((a, b) => (a.codePoint < b.codePoint ? -1 : a.codePoint > b.codePoint ? 1 : 0));
  return { total, byCodePoint };
}

/** 表記差（全角半角・大文字小文字・空白・記号）を吸収した照合用文字列へ正規化する。 */
export function normalizeForGrounding(text: string): string {
  const base = stripBidiControls(text).normalize("NFKC").toLowerCase();
  let out = "";
  for (const ch of base) {
    if (ch === "　" || /\s/.test(ch)) continue;
    if (GROUNDING_SYMBOLS.has(ch)) continue;
    out += ch;
  }
  return out;
}
