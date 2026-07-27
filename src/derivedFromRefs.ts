import { z } from "zod";
import type { DerivedFromEntry, DerivedFromKind } from "./types.js";

export const derivedFromKinds: DerivedFromKind[] = ["requirement", "risk", "stakeholder", "guideword"];

export const derivedFromKindLabels: Record<DerivedFromKind, string> = {
  requirement: "要件",
  risk: "リスク",
  stakeholder: "ステークホルダー",
  guideword: "ガイドワード",
};

/** 文字列表記も含めて { id, kind? } へ正規化する。kind 未定義＝種別未指定。 */
export function toDerivedFromRef(entry: DerivedFromEntry): { id: string; kind?: DerivedFromKind } {
  if (typeof entry === "string") {
    return { id: entry };
  }
  return { id: entry.id, kind: entry.kind };
}

/** 入力順を保った id 配列（重複排除しない）。 */
export function derivedFromIds(entries: DerivedFromEntry[]): string[] {
  return entries.map((entry) => toDerivedFromRef(entry).id);
}

/**
 * id 一致判定。kind を渡した場合:
 *  - 種別未指定エントリ（文字列）は id 一致のみで真
 *  - 種別明示エントリは kind も一致した場合のみ真
 * kind を省略した場合は id 一致のみで判定する。
 */
export function hasDerivedFromRef(entries: DerivedFromEntry[], id: string, kind?: DerivedFromKind): boolean {
  return entries.some((entry) => {
    const ref = toDerivedFromRef(entry);
    if (ref.id !== id) return false;
    if (kind === undefined) return true;
    if (ref.kind === undefined) return true;
    return ref.kind === kind;
  });
}

/** 表示整形。種別未指定は "R-001"、種別明示は "リスク:RK-001"。 */
export function formatDerivedFromEntry(entry: DerivedFromEntry): string {
  const ref = toDerivedFromRef(entry);
  if (ref.kind === undefined) return ref.id;
  return `${derivedFromKindLabels[ref.kind]}:${ref.id}`;
}

export function formatDerivedFromList(entries: DerivedFromEntry[]): string {
  return entries.map(formatDerivedFromEntry).join(", ");
}

// 4ツール共通の入力スキーマ（zod v4）
export const derivedFromEntrySchema = z.union([
  z.string(),
  z.object({
    kind: z.enum(["requirement", "risk", "stakeholder", "guideword"]),
    id: z.string().min(1),
  }),
]);
export const derivedFromSchema = z.array(derivedFromEntrySchema).min(1);
