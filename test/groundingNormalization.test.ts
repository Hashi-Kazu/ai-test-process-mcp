import { describe, expect, it } from "vitest";
import {
  BIDI_CONTROL_PATTERN,
  countBidiControls,
  normalizeForGrounding,
  stripBidiControls,
} from "../src/groundingNormalization.js";

const ALL_BIDI_CONTROLS =
  "‪‫‬‭‮⁦⁧⁨⁩‎‏";

describe("stripBidiControls", () => {
  it("removes LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI and LRM/RLM", () => {
    expect(stripBidiControls(ALL_BIDI_CONTROLS)).toBe("");
  });

  it("does not change kanji, kana, symbols or newlines", () => {
    const content = "第1章\n読み取ったQRコード情報、以上とする。\n漢字とｶﾀｶﾅ";
    expect(stripBidiControls(content)).toBe(content);
  });

  it("removes only the bidi control chars embedded in otherwise ordinary text", () => {
    const content = "読み取った‪QR‬コード情報";
    expect(stripBidiControls(content)).toBe("読み取ったQRコード情報");
  });
});

describe("countBidiControls", () => {
  it("returns the total and a per-codepoint breakdown sorted ascending by codepoint", () => {
    const content = "‭‭a‬b‎c";
    const result = countBidiControls(content);
    expect(result.total).toBe(4);
    expect(result.byCodePoint).toEqual([
      { codePoint: "U+200E", count: 1 },
      { codePoint: "U+202C", count: 1 },
      { codePoint: "U+202D", count: 2 },
    ]);
  });

  it("returns total 0 and an empty breakdown when there are no bidi control chars", () => {
    const result = countBidiControls("普通の本文である。");
    expect(result.total).toBe(0);
    expect(result.byCodePoint).toEqual([]);
  });

  it("formats codePoint as 4-digit zero-padded uppercase U+XXXX", () => {
    const result = countBidiControls("‎");
    expect(result.byCodePoint).toEqual([{ codePoint: "U+200E", count: 1 }]);
  });
});

describe("normalizeForGrounding with bidi control chars", () => {
  it("makes text with embedded bidi controls match the same text without them", () => {
    const withControls = normalizeForGrounding("‭読み取ったQR‬コード情報");
    const withoutControls = normalizeForGrounding("読み取ったQRコード情報");
    expect(withControls).toBe(withoutControls);
  });

  it("keeps existing behavior unchanged for input without bidi control chars", () => {
    expect(normalizeForGrounding("読み取ったQRコード情報")).toBe("読み取ったqrコド情報");
    expect(normalizeForGrounding("１２３　あいう")).toBe("123あいう");
    expect(normalizeForGrounding("EH-100「発券機」起動")).toBe("eh100発券機起動");
  });
});

describe("BIDI_CONTROL_PATTERN", () => {
  it("matches all documented bidi control code points", () => {
    const matches = ALL_BIDI_CONTROLS.match(BIDI_CONTROL_PATTERN);
    expect(matches?.length).toBe(ALL_BIDI_CONTROLS.length);
  });
});
