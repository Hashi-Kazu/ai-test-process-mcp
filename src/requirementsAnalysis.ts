import { parseHeadings, escapeRegExp } from "./tools/reviewTestPlan.js";
import {
  analyzePrefixes,
  extractIdOccurrences,
  extractQuantityExpressions,
  findAmbiguousTerms,
  findDuplicateIds,
  findUnresolvedReferences,
  type TestBasisAnalysisOptions,
} from "./testBasisAnalysis.js";
import type {
  BoundaryValueMode,
  BoundaryVariableSpec,
  RequirementsBoundaryCandidate,
  RequirementsFinding,
  RequirementsQuantityAggregate,
  RequirementsTermFinding,
  RequirementsTermStatus,
  TestBasisDocument,
  TestBasisQuantityExpression,
  TestBasisQuantityKind,
} from "./types.js";

// analyze_requirements 固有の決定的分析ロジック。
// 共有ユーティリティ（testBasisAnalysis.ts）を再利用し、そちらは変更しない。

function headingsPerLine(content: string): string[] {
  const lines = content.split("\n");
  const headings = parseHeadings(content);
  const result: string[] = new Array(lines.length);
  let current = "(見出しなし)";
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    while (idx < headings.length && headings[idx].lineIndex === i) {
      current = headings[idx].raw.trim() || "(見出しなし)";
      idx++;
    }
    result[i] = current;
  }
  return result;
}

const QUANTITY_PARSE_REGEX = /^(\d+(?:\.\d+)?)\s*([^\d\s]*?)\s*(以上|以下|未満|超|以内|まで)?$/;

export function parseQuantity(raw: string): {
  value: number | null;
  unit: string;
  boundaryWord?: string;
} {
  const m = QUANTITY_PARSE_REGEX.exec(raw.trim());
  if (!m) return { value: null, unit: "(単位なし)" };
  const value = Number(m[1]);
  const unit = m[2] && m[2].length > 0 ? m[2] : "(単位なし)";
  const boundaryWord = m[3];
  return boundaryWord ? { value, unit, boundaryWord } : { value, unit };
}

const AGGREGATE_TARGET_KINDS: TestBasisQuantityKind[] = [
  "comparison",
  "duration",
  "count",
  "digits",
  "quantity",
];

export function aggregateQuantitiesByUnit(
  documents: TestBasisDocument[]
): RequirementsQuantityAggregate[] {
  const occurrences = extractQuantityExpressions(documents).filter((o) =>
    AGGREGATE_TARGET_KINDS.includes(o.kind)
  );

  const order: string[] = [];
  const byUnit = new Map<string, TestBasisQuantityExpression[]>();
  for (const occ of occurrences) {
    const { unit } = parseQuantity(occ.raw);
    if (!byUnit.has(unit)) {
      order.push(unit);
      byUnit.set(unit, []);
    }
    byUnit.get(unit)!.push(occ);
  }

  const aggregates: RequirementsQuantityAggregate[] = order.map((unit) => {
    const occs = byUnit.get(unit)!;
    const numbersSet = new Set<number>();
    const documentsList: string[] = [];
    const boundaryWordsList: string[] = [];
    for (const occ of occs) {
      const parsed = parseQuantity(occ.raw);
      if (parsed.value !== null) numbersSet.add(parsed.value);
      if (!documentsList.includes(occ.document)) documentsList.push(occ.document);
      if (parsed.boundaryWord && !boundaryWordsList.includes(parsed.boundaryWord)) {
        boundaryWordsList.push(parsed.boundaryWord);
      }
    }
    const numbers = Array.from(numbersSet).sort((a, b) => a - b);
    return {
      unit,
      numbers,
      documents: documentsList,
      boundaryWords: boundaryWordsList,
      occurrences: occs,
      crossDocumentVariance: documentsList.length >= 2 && numbers.length >= 2,
    };
  });

  aggregates.sort((a, b) => {
    if (b.occurrences.length !== a.occurrences.length) {
      return b.occurrences.length - a.occurrences.length;
    }
    return a.unit.localeCompare(b.unit);
  });

  return aggregates;
}

const BOUNDARY_UNIT_ALLOWLIST = [
  "日",
  "時間",
  "分",
  "秒",
  "回",
  "件",
  "人",
  "枚",
  "桁",
  "%",
  "円",
  "個",
  "台",
  "文字",
  "ページ",
];

function decimalDigits(value: number): number {
  const s = value.toString();
  if (s.includes("e") || s.includes("E")) return 0;
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

export function buildBoundaryCandidates(
  aggregates: RequirementsQuantityAggregate[]
): RequirementsBoundaryCandidate[] {
  const results: RequirementsBoundaryCandidate[] = [];

  for (const agg of aggregates) {
    if (!BOUNDARY_UNIT_ALLOWLIST.includes(agg.unit)) continue;
    if (agg.numbers.length === 0) continue;

    const basis = agg.occurrences
      .slice(0, 5)
      .map((o) => `${o.document}:${o.lineIndex + 1} 「${o.raw}」`);

    let min: number;
    let max: number;
    let incomplete = false;
    let note: string | undefined;

    if (agg.numbers.length >= 2) {
      min = agg.numbers[0];
      max = agg.numbers[agg.numbers.length - 1];
    } else {
      const n = agg.numbers[0];
      const hasAnyWord = (words: string[]) => agg.boundaryWords.some((w) => words.includes(w));
      if (hasAnyWord(["以下", "以内", "まで", "未満"])) {
        min = 0;
        max = n;
        note = "下限が明示されていないため 0 と仮置きした";
      } else if (hasAnyWord(["以上", "超"])) {
        min = n;
        max = n;
        incomplete = true;
        note = "上限が文書に記載されていない。上限を確認して max を上書きしてから design_boundary_values を呼ぶこと";
      } else {
        min = n;
        max = n;
        incomplete = true;
        note = "境界語が無く範囲が不明";
      }
    }

    let valueType: "int" | "decimal" | undefined;
    let step: number | undefined;
    if (decimalDigits(min) > 0 || decimalDigits(max) > 0) {
      const d = Math.max(decimalDigits(min), decimalDigits(max));
      valueType = "decimal";
      step = Number(Math.pow(10, -d).toFixed(d));
    }

    const variable: BoundaryVariableSpec = {
      name: agg.unit,
      min,
      max,
      ...(valueType ? { valueType } : {}),
      ...(step !== undefined ? { step } : {}),
    };

    results.push({ unit: agg.unit, variable, incomplete, note, basis });
  }

  return results;
}

export function toBoundaryValuesToolInput(
  candidates: RequirementsBoundaryCandidate[]
): { variables: BoundaryVariableSpec[]; mode: BoundaryValueMode } {
  const variables = candidates.filter((c) => !c.incomplete).map((c) => c.variable);
  return { variables, mode: "three" };
}

export function normalizeTermKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/ー/g, "")
    .replace(/・/g, "");
}

function isValidTerm(term: string): boolean {
  const t = term.trim();
  if (t.length < 2 || t.length > 30) return false;
  if (/^\d+$/.test(t)) return false;
  if (/^[^\p{L}\p{N}]+$/u.test(t)) return false;
  return true;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

interface TermDefEntry {
  term: string;
  document: string;
  lineIndex: number;
  heading: string;
  definition: string;
}

function extractTermDefinitions(documents: TestBasisDocument[]): TermDefEntry[] {
  const defs: TermDefEntry[] = [];

  for (const doc of documents) {
    const lines = doc.content.split("\n");
    const headings = headingsPerLine(doc.content);
    let inTable = false;
    let tableRowIndex = 0;

    lines.forEach((line, lineIndex) => {
      const heading = headings[lineIndex] ?? "(見出しなし)";
      const headingAllowsTermSection = /用語|略語|定義/.test(heading);
      const trimmed = line.trim();

      // rule 1: Markdown表の行（見出しに 用語/略語/定義 を含む区間のみ）
      if (/^\|.*\|$/.test(trimmed)) {
        if (!inTable) {
          inTable = true;
          tableRowIndex = 0;
        } else {
          tableRowIndex++;
        }
        if (headingAllowsTermSection) {
          const cells = trimmed
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim());
          if (tableRowIndex > 0 && cells.length >= 2 && !isSeparatorRow(cells)) {
            const term = cells[0];
            const definition = cells[1];
            if (isValidTerm(term)) {
              defs.push({ term, document: doc.name, lineIndex, heading, definition });
            }
          }
        }
        return;
      }
      inTable = false;
      tableRowIndex = 0;

      // rule 2: 「X」とは / Xとは、 / Xとは：
      const bracketed = /「([^」]{2,30})」とは/.exec(line);
      const plainComma = /([^\s、。「」]{2,30})とは、(.*)$/.exec(line);
      const plainColon = /([^\s、。「」]{2,30})とは：(.*)$/.exec(line);
      let ruleMatch: { term: string; definition: string } | null = null;
      if (bracketed) {
        ruleMatch = {
          term: bracketed[1],
          definition: line.slice(bracketed.index + bracketed[0].length).trim(),
        };
      } else if (plainComma) {
        ruleMatch = { term: plainComma[1], definition: plainComma[2].trim() };
      } else if (plainColon) {
        ruleMatch = { term: plainColon[1], definition: plainColon[2].trim() };
      }
      if (ruleMatch && isValidTerm(ruleMatch.term)) {
        defs.push({
          term: ruleMatch.term,
          document: doc.name,
          lineIndex,
          heading,
          definition: ruleMatch.definition,
        });
      }

      // rule 3: 見出しに 用語/略語/定義 を含む区間の "- X: 説明" / "- X：説明"
      if (headingAllowsTermSection) {
        const listMatch = /^-\s*([^\s:：]{2,30})[:：]\s*(.*)$/.exec(trimmed);
        if (listMatch && isValidTerm(listMatch[1])) {
          defs.push({
            term: listMatch[1],
            document: doc.name,
            lineIndex,
            heading,
            definition: listMatch[2].trim(),
          });
        }
      }
    });
  }

  return defs;
}

function countExactUsage(term: string, text: string): number {
  const pattern = new RegExp(`(?<![ー・])${escapeRegExp(term)}(?![ー・])`, "g");
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function countNormalizedUsage(term: string, text: string): number {
  const normTerm = normalizeTermKey(term);
  if (!normTerm) return 0;
  const normText = normalizeTermKey(text);
  let count = 0;
  let idx = 0;
  for (;;) {
    const found = normText.indexOf(normTerm, idx);
    if (found === -1) break;
    count++;
    idx = found + normTerm.length;
  }
  return count;
}

export function analyzeTermUsage(documents: TestBasisDocument[]): RequirementsTermFinding[] {
  const defs = extractTermDefinitions(documents);

  const order: string[] = [];
  const byTerm = new Map<string, TermDefEntry[]>();
  for (const d of defs) {
    if (!byTerm.has(d.term)) {
      order.push(d.term);
      byTerm.set(d.term, []);
    }
    byTerm.get(d.term)!.push(d);
  }

  const results: RequirementsTermFinding[] = [];

  for (const term of order) {
    const termDefs = byTerm.get(term)!;
    const ownDefLineKeys = new Set(termDefs.map((d) => `${d.document}:${d.lineIndex}`));

    let exactUsageCount = 0;
    let normalizedUsageCount = 0;
    const usageDocuments: string[] = [];

    for (const doc of documents) {
      const lines = doc.content.split("\n");
      let docHasUsage = false;
      lines.forEach((line, lineIndex) => {
        const key = `${doc.name}:${lineIndex}`;
        if (ownDefLineKeys.has(key)) return;
        const e = countExactUsage(term, line);
        const n = countNormalizedUsage(term, line);
        exactUsageCount += e;
        normalizedUsageCount += n;
        if (n > 0) docHasUsage = true;
      });
      if (docHasUsage) usageDocuments.push(doc.name);
    }

    let status: RequirementsTermStatus;
    if (termDefs.length >= 2) {
      status = "duplicate-definition";
    } else if (normalizedUsageCount === 0) {
      status = "unused";
    } else if (normalizedUsageCount > exactUsageCount) {
      status = "variant-suspected";
    } else {
      status = "ok";
    }

    results.push({
      term,
      definitions: termDefs.map((d) => ({
        document: d.document,
        lineIndex: d.lineIndex,
        heading: d.heading,
        definition: d.definition,
      })),
      exactUsageCount,
      normalizedUsageCount,
      usageDocuments,
      status,
    });
  }

  return results;
}

function truncateSnippet(text: string): string {
  const t = text.trim();
  if (t.length <= 80) return t;
  return `${t.slice(0, 80)}…`;
}

export function buildDeterministicFindings(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): RequirementsFinding[] {
  const occurrences = extractIdOccurrences(documents, options);
  const duplicates = findDuplicateIds(occurrences);
  const unresolved = findUnresolvedReferences(occurrences);
  const { stats, issues } = analyzePrefixes(occurrences);
  const aggregates = aggregateQuantitiesByUnit(documents);
  const termFindings = analyzeTermUsage(documents);
  const ambiguousTerms = findAmbiguousTerms(documents, options);
  const quantities = extractQuantityExpressions(documents);
  const noBoundary = quantities.filter((q) => !q.hasBoundaryWord);

  const findings: RequirementsFinding[] = [];
  let no = 1;
  const nextId = () => `F-${String(no++).padStart(2, "0")}`;

  // 1. ID重複
  for (const dup of duplicates) {
    const first = dup.places[0];
    findings.push({
      id: nextId(),
      kind: "ID重複",
      severity: "high",
      place: `${first.document}:${first.lineIndex + 1} ${first.heading}`,
      snippet: truncateSnippet(first.lineText),
      problem: `${dup.id} が ${dup.count} 箇所で定義されている。`,
      question: `${dup.id} が複数箇所で定義されている。どちらが正か、採番の是正方針を確認したい`,
      assumption: "先に定義されたIDを正とみなす",
    });
  }

  // 2. 未解決参照
  for (const ref of unresolved) {
    findings.push({
      id: nextId(),
      kind: "未解決参照",
      severity: "high",
      place: `${ref.document}:${ref.lineIndex + 1} ${ref.heading}`,
      snippet: truncateSnippet(ref.lineText),
      problem: `参照されている ${ref.id} の定義が見つからない。`,
      question: `参照されている ${ref.id} の定義が見つからない。定義文書の提供または参照の訂正を依頼したい`,
      assumption: "参照は誤記とみなし、該当箇所を無視する",
    });
  }

  // 3. 数量表現の文書間矛盾
  for (const agg of aggregates) {
    if (!agg.crossDocumentVariance) continue;
    const first = agg.occurrences[0];
    findings.push({
      id: nextId(),
      kind: "矛盾",
      severity: "high",
      place: `${first.document}:${first.lineIndex + 1} ${first.heading}`,
      snippet: truncateSnippet(agg.occurrences.map((o) => o.raw).join(" / ")),
      problem: `単位「${agg.unit}」について ${agg.documents.join("、")} にまたがり異なる値（${agg.numbers.join(
        ", "
      )}）が検出された。`,
      question: `単位「${agg.unit}」の値が文書間で異なる（${agg.numbers.join(", ")}）。正しい値を確認したい`,
      assumption: "より新しい・より詳細な文書側の値を正とみなす",
    });
  }

  // 4. 用語の重複定義・表記揺れ・未使用
  for (const t of termFindings) {
    if (t.status !== "duplicate-definition") continue;
    const first = t.definitions[0];
    findings.push({
      id: nextId(),
      kind: "矛盾",
      severity: "medium",
      place: `${first.document}:${first.lineIndex + 1} ${first.heading}`,
      snippet: truncateSnippet(`${t.term}: ${first.definition}`),
      problem: `用語「${t.term}」が複数箇所で定義されている。`,
      question: `用語「${t.term}」の定義が複数存在する。どちらが正式な定義か確認したい`,
      assumption: "最初に定義された内容を正とみなす",
    });
  }
  for (const t of termFindings) {
    if (t.status !== "variant-suspected") continue;
    const first = t.definitions[0];
    findings.push({
      id: nextId(),
      kind: "表記揺れ",
      severity: "medium",
      place: `${first.document}:${first.lineIndex + 1} ${first.heading}`,
      snippet: truncateSnippet(`${t.term}: ${first.definition}`),
      problem: `用語「${t.term}」の定義はあるが、本文では表記ゆれと思われる形で使用されている。`,
      question: `本文中の類似表記は「${t.term}」と同一の用語か確認したい`,
      assumption: "同一の用語として扱う",
    });
  }
  for (const t of termFindings) {
    if (t.status !== "unused") continue;
    const first = t.definitions[0];
    findings.push({
      id: nextId(),
      kind: "欠落",
      severity: "low",
      place: `${first.document}:${first.lineIndex + 1} ${first.heading}`,
      snippet: truncateSnippet(`${t.term}: ${first.definition}`),
      problem: `用語「${t.term}」が定義されているが本文で使用されていない。`,
      question: `用語「${t.term}」は本文中で使用されているか確認したい`,
      assumption: "定義のみで実質不要な用語とみなす",
    });
  }

  // 5. 未完成の注記
  for (const f of ambiguousTerms) {
    if (f.category !== "incomplete-note") continue;
    for (const h of f.byHeading) {
      findings.push({
        id: nextId(),
        kind: "欠落",
        severity: "medium",
        place: `${h.document} / ${h.heading}`,
        snippet: truncateSnippet(`「${f.term}」`),
        problem: `「${f.term}」という未完成の注記がある（${h.count}件）。`,
        question: `「${f.term}」の箇所は今後補完される予定か、現時点の暫定内容を確認したい`,
        assumption: "現状の記載のみで確定とみなす",
      });
    }
  }

  // 6. 曖昧語・弱い語（出現数降順、上位10件）
  const ambiguousFlat: { term: string; document: string; heading: string; count: number }[] = [];
  for (const f of ambiguousTerms) {
    if (f.category !== "ambiguous" && f.category !== "weak-requirement") continue;
    for (const h of f.byHeading) {
      ambiguousFlat.push({ term: f.term, document: h.document, heading: h.heading, count: h.count });
    }
  }
  ambiguousFlat.sort((a, b) => b.count - a.count);
  for (const entry of ambiguousFlat.slice(0, 10)) {
    findings.push({
      id: nextId(),
      kind: "曖昧",
      severity: "medium",
      place: `${entry.document} / ${entry.heading}`,
      snippet: truncateSnippet(`「${entry.term}」`),
      problem: `「${entry.term}」の具体的な判定条件が本文から読み取れない。`,
      question: `「${entry.term}」の具体的な判定条件・数値を確認したい`,
      assumption: "文書中の一般的な用法どおりの意味とみなす",
    });
  }

  // 7. プレフィックス体系の逸脱
  for (const issue of issues) {
    const stat = stats.find((s) => s.prefix === issue.prefixes[0]);
    const docsText = stat && stat.documents.length > 0 ? stat.documents.join(", ") : issue.prefixes.join(", ");
    findings.push({
      id: nextId(),
      kind: "表記揺れ",
      severity: "medium",
      place: `${docsText} / (複数箇所)`,
      snippet: truncateSnippet(issue.detail),
      problem: issue.detail,
      question: `プレフィックス「${issue.prefixes.join(", ")}」について、ID付与規則の意図を確認したい`,
      assumption: "既存の付与規則を意図通りとみなし、指摘のみ記録する",
    });
  }

  // 8. 境界語なしの数量表現（上位10件）
  for (const q of noBoundary.slice(0, 10)) {
    findings.push({
      id: nextId(),
      kind: "曖昧",
      severity: "low",
      place: `${q.document}:${q.lineIndex + 1} ${q.heading}`,
      snippet: truncateSnippet(q.raw),
      problem: `「${q.raw}」に境界の扱い（以上/以下/未満/超）が明記されていない。`,
      question: `「${q.raw}」について、境界の扱い(以上/以下/未満/超)を確認したい`,
      assumption: "以上（境界を含む）として扱う",
    });
  }

  return findings;
}
