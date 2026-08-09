import { parseHeadings } from "./tools/reviewTestPlan.js";
import { DEFAULT_ID_PATTERN_SOURCE, extractQuantityExpressions } from "./testBasisAnalysis.js";
import {
  ENTITY_NAME_LEADING_REJECT_CHARS,
  ENTITY_NAME_MIN_LENGTH,
  ENTITY_NAME_SYMBOL_ONLY_PATTERN,
  ENTITY_NAME_TRAILING_REJECT_CHARS,
} from "./resources/basisContradictionCriteria.js";
import type {
  BasisContradictionCandidate,
  BasisContradictionOptions,
  BasisContradictionSummary,
  BasisDeclarationReconciliationRow,
  BasisDeclaredEntity,
  BasisEntityOccurrence,
  BasisExcludedEntityName,
  BasisLine,
  BasisParameterValue,
  BasisRevisionClaim,
  BasisRevisionReconciliationRow,
  BasisTransition,
  BasisUiElement,
  ContradictionCheckId,
  ContradictionConfidence,
  ContradictionPlace,
  EntityNameFragmentRuleId,
  TestBasisDocument,
} from "./types.js";

// audit_basis_contradictions 固有の決定的検査ロジック。
// すべて純関数で、入力順を保った決定的な出力を返す。

// --- 正規化 ---

const UI_KIND_WORDS = [
  "ラジオボタン",
  "チェックボックス",
  "ドロップダウンリスト",
  "入力テキストフィールド",
  "テキストフィールド",
  "日付入力フォーム",
  "日付指定フォーム",
  "テキストリンク",
  "ハンバーガーメニュー",
  "ページネーション",
  "テーブル",
  "ボタン",
  "リンク",
  "エリア",
];
const UI_KIND_ALT = UI_KIND_WORDS.join("|");
const OPERATION_KIND_WORDS = ["ボタン", "リンク", "テキストリンク", "ラジオボタン", "チェックボックス"];

const DEFAULT_RELATIVE_TARGET_TERMS = [
  "前画面",
  "初期画面",
  "遷移前の画面",
  "その次の画面",
  "以下の画面",
  "下記記載の特定画面",
  "該当の",
];

function normalizeText(s: string): string {
  return s.normalize("NFKC").replace(/[\s　]+/g, "");
}

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

function buildIdRegexes(idPatterns: string[]): RegExp[] {
  return idPatterns.map((source) => new RegExp(source, "gi"));
}

function findIdAtStart(normalized: string, idRegexes: RegExp[]): string | null {
  for (const re of idRegexes) {
    re.lastIndex = 0;
    const m = re.exec(normalized);
    if (m && m.index === 0) return `${m[1]}-${m[2]}`;
  }
  const numMatch = /^\d+\./.exec(normalized);
  if (numMatch) {
    const rest = normalized.slice(numMatch[0].length);
    for (const re of idRegexes) {
      re.lastIndex = 0;
      const m = re.exec(rest);
      if (m && m.index === 0) return `${m[1]}-${m[2]}`;
    }
  }
  return null;
}

function findIdMatchAt0(normalized: string, idRegexes: RegExp[]): { id: string; length: number } | null {
  for (const re of idRegexes) {
    re.lastIndex = 0;
    const m = re.exec(normalized);
    if (m && m.index === 0) return { id: `${m[1]}-${m[2]}`, length: m[0].length };
  }
  return null;
}

export function buildBasisLines(
  documents: TestBasisDocument[],
  options: BasisContradictionOptions = {}
): BasisLine[] {
  const idPatterns = [DEFAULT_ID_PATTERN_SOURCE, ...(options.idPatterns ?? [])];
  const idRegexes = buildIdRegexes(idPatterns);
  const uiStartRegex = new RegExp(`^(?:${UI_KIND_ALT})`);

  const result: BasisLine[] = [];
  for (const doc of documents) {
    const rawLines = doc.content.split("\n");
    const headings = headingsPerLine(doc.content);
    const entries = rawLines.map((raw, lineIndex) => ({
      lineIndex,
      raw,
      normalized: normalizeText(raw),
      heading: headings[lineIndex] ?? "(見出しなし)",
    }));

    let i = 0;
    let currentId: string | null = null;
    while (i < entries.length) {
      let raw = entries[i].raw;
      let normalized = entries[i].normalized;
      const lineIndex = entries[i].lineIndex;
      const heading = entries[i].heading;
      let j = i + 1;
      while (j < entries.length && uiStartRegex.test(entries[j].normalized)) {
        raw = `${raw} ${entries[j].raw}`;
        normalized = `${normalized}${entries[j].normalized}`;
        j++;
      }
      const foundId = findIdAtStart(normalized, idRegexes);
      if (foundId) currentId = foundId;
      result.push({
        document: doc.name,
        lineIndex,
        heading,
        raw,
        normalized,
        currentId,
      });
      i = j;
    }
  }
  return result;
}

// --- 抽出 ---

/**
 * 名称候補が表セル連結由来の断片かどうかを判定する(NF-01→NF-02→NF-03→NF-04の固定順)。
 * 最初に一致したルールIDを返し、どれにも当たらなければ null(=採用)を返す。
 */
export function classifyEntityNameFragment(name: string): EntityNameFragmentRuleId | null {
  if (name.length < ENTITY_NAME_MIN_LENGTH) return "NF-01";
  if (name.length > 0 && ENTITY_NAME_LEADING_REJECT_CHARS.has(name[0])) return "NF-02";
  if (name.length > 0 && ENTITY_NAME_TRAILING_REJECT_CHARS.has(name[name.length - 1])) return "NF-03";
  if (ENTITY_NAME_SYMBOL_ONLY_PATTERN.test(name)) return "NF-04";
  return null;
}

export function extractEntityOccurrencesWithQuality(
  lines: BasisLine[]
): { occurrences: BasisEntityOccurrence[]; excluded: BasisExcludedEntityName[] } {
  const occurrences: BasisEntityOccurrence[] = [];
  const excluded: BasisExcludedEntityName[] = [];
  for (const line of lines) {
    const idRegexes = buildIdRegexes([DEFAULT_ID_PATTERN_SOURCE]);
    for (const re of idRegexes) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line.normalized)) !== null) {
        const id = `${m[1]}-${m[2]}`;
        const afterStart = m.index + m[0].length;
        let after = line.normalized.slice(afterStart, afterStart + 40);
        after = after.replace(/^[|｜：:、,\-–—・.]+/, "");
        const nameMatch = /^[^|｜、。]{1,24}/.exec(after);
        const name = (nameMatch ? nameMatch[0] : "").trim();
        if (m[0].length === 0) re.lastIndex++;
        if (!name) continue;
        const ruleId = classifyEntityNameFragment(name);
        if (ruleId) {
          excluded.push({ id, document: line.document, lineIndex: line.lineIndex, name, ruleId });
          continue;
        }
        const source: BasisEntityOccurrence["source"] =
          m.index === 0 ? "section-heading" : line.raw.includes("|") ? "list-row" : "inline";
        occurrences.push({
          id,
          document: line.document,
          lineIndex: line.lineIndex,
          heading: line.heading,
          name,
          source,
        });
      }
    }
  }
  return { occurrences, excluded };
}

export function extractEntityOccurrences(lines: BasisLine[]): BasisEntityOccurrence[] {
  return extractEntityOccurrencesWithQuality(lines).occurrences;
}

export function extractUiElements(lines: BasisLine[]): BasisUiElement[] {
  const results: BasisUiElement[] = [];
  const quotedRe = new RegExp(`「([^」]{1,24})」(${UI_KIND_ALT})`, "g");
  const rowRe = new RegExp(`^(\\d{3})(.{1,24}?)(${UI_KIND_ALT})`);
  for (const line of lines) {
    quotedRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = quotedRe.exec(line.normalized)) !== null) {
      results.push({
        id: line.currentId,
        document: line.document,
        lineIndex: line.lineIndex,
        label: m[1],
        elementKind: m[2],
        source: "quoted",
      });
      if (m[0].length === 0) quotedRe.lastIndex++;
    }
    const rowM = rowRe.exec(line.normalized);
    if (rowM) {
      results.push({
        id: line.currentId,
        document: line.document,
        lineIndex: line.lineIndex,
        label: rowM[2],
        elementKind: rowM[3],
        source: "table-row",
      });
    }
  }
  return results;
}

const TARGET_TEXT_SOURCE = "([^、。「」]{0,26}?(?:画面|ダイアログ|モーダル|サイト|ページ))";

function buildTransitionPatterns(): RegExp[] {
  return [
    new RegExp(`「([^」]{1,20})」(?:テキストリンク|ラジオボタン|ボタン|リンク)?を押すと.{0,24}?${TARGET_TEXT_SOURCE}に遷移`, "g"),
    new RegExp(`([^、。：]{1,20})：${TARGET_TEXT_SOURCE}に遷移`, "g"),
    new RegExp(`([^、。]{1,20})を選択すると.{0,24}?${TARGET_TEXT_SOURCE}に遷移`, "g"),
  ];
}

export function extractTransitions(
  lines: BasisLine[],
  options: BasisContradictionOptions = {}
): BasisTransition[] {
  const idPatterns = [DEFAULT_ID_PATTERN_SOURCE, ...(options.idPatterns ?? [])];
  const relativeTerms = [...DEFAULT_RELATIVE_TARGET_TERMS, ...(options.relativeTargetTerms ?? [])];
  const patterns = buildTransitionPatterns();
  const results: BasisTransition[] = [];

  for (const line of lines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(line.normalized)) !== null) {
        const trigger = m[1];
        const targetRaw = m[2];
        if (m[0].length === 0) {
          pattern.lastIndex++;
          continue;
        }
        const idRegexes = buildIdRegexes(idPatterns);
        const idAt0 = findIdMatchAt0(targetRaw, idRegexes);
        let targetId: string | null = null;
        let targetName: string;
        let targetKind: BasisTransition["targetKind"];
        if (idAt0) {
          targetId = idAt0.id;
          targetName = targetRaw.slice(idAt0.length).trim();
          targetKind = "id";
        } else if (relativeTerms.some((term) => targetRaw.startsWith(term))) {
          targetKind = "relative";
          targetName = targetRaw;
        } else {
          targetKind = "name";
          targetName = targetRaw;
        }
        results.push({
          sourceId: line.currentId,
          document: line.document,
          lineIndex: line.lineIndex,
          trigger,
          targetId,
          targetName,
          targetKind,
        });
      }
    }
  }
  return results;
}

const PARAMETER_NAME_REGEX = /([^、。：「」●○■]{2,16})(?:は|が|：|の上限|まで)$/;
const QUOTED_LABEL_REGEX = /「([^」]{1,24})」/g;

function parseQuantityValue(raw: string): { value: number | null; unit: string } {
  const m = /^(\d+(?:\.\d+)?)(.*)$/.exec(raw);
  if (!m) return { value: null, unit: raw };
  return { value: Number(m[1]), unit: m[2].trim() };
}

export function extractParameterValues(
  documents: TestBasisDocument[],
  lines: BasisLine[]
): BasisParameterValue[] {
  const expressions = extractQuantityExpressions(documents);
  const results: BasisParameterValue[] = [];

  const docRawLines = new Map<string, string[]>();
  for (const doc of documents) docRawLines.set(doc.name, doc.content.split("\n"));

  for (const expr of expressions) {
    const rawLines = docRawLines.get(expr.document) ?? [];
    const rawLine = rawLines[expr.lineIndex] ?? "";
    const idx = rawLine.indexOf(expr.raw);
    const preceding = idx >= 0 ? rawLine.slice(Math.max(0, idx - 40), idx) : "";
    const paramMatch = PARAMETER_NAME_REGEX.exec(preceding);
    let parameter: string | undefined = paramMatch ? paramMatch[1] : undefined;
    if (!parameter) {
      QUOTED_LABEL_REGEX.lastIndex = 0;
      let lastQuoted: string | undefined;
      let qm: RegExpExecArray | null;
      while ((qm = QUOTED_LABEL_REGEX.exec(preceding)) !== null) {
        lastQuoted = qm[1];
      }
      parameter = lastQuoted;
    }
    if (!parameter) parameter = expr.heading;

    const { value, unit } = parseQuantityValue(expr.raw);
    results.push({
      document: expr.document,
      lineIndex: expr.lineIndex,
      heading: expr.heading,
      parameter,
      unit,
      raw: expr.raw,
      value,
    });
  }
  return results;
}

const REVISION_HEADER_REGEX = /(\d{4}\/\d{1,2}\/\d{1,2})(V?\d+\.\d+\.\d+)(.*)/;
const REVISION_CHANGE_REGEX = /([^、。]{1,20}?)(?:→|->|⇒)([^、。]{1,20})/;

export function extractRevisionClaims(lines: BasisLine[]): BasisRevisionClaim[] {
  const results: BasisRevisionClaim[] = [];
  for (const line of lines) {
    const m = REVISION_HEADER_REGEX.exec(line.normalized);
    if (!m) continue;
    const text = m[3];
    const cm = REVISION_CHANGE_REGEX.exec(text);
    results.push({
      document: line.document,
      lineIndex: line.lineIndex,
      version: m[2],
      date: m[1],
      text,
      ...(cm ? { beforeValue: cm[1], afterValue: cm[2] } : {}),
    });
  }
  return results;
}

// --- 宣言と実体の照合 ---

function stripTrailingLabel(name: string): string {
  return name.replace(/(画面|機能)$/g, "");
}

export function buildDeclarationReconciliation(
  declaredEntities: BasisDeclaredEntity[] | undefined,
  occurrences: BasisEntityOccurrence[]
): BasisDeclarationReconciliationRow[] {
  const actualByIdOrder: string[] = [];
  const actualById = new Map<string, BasisEntityOccurrence>();
  for (const occ of occurrences) {
    if (!actualById.has(occ.id)) {
      actualByIdOrder.push(occ.id);
      actualById.set(occ.id, occ);
    }
  }

  const declared = declaredEntities ?? [];
  const declaredIds = new Set(declared.map((d) => d.id));
  const rows: BasisDeclarationReconciliationRow[] = [];

  for (const d of declared) {
    const actual = actualById.get(d.id);
    if (!actual) {
      rows.push({ id: d.id, declaredName: d.name, status: "declared-only", confidence: "high" });
      continue;
    }
    const declaredNorm = stripTrailingLabel(d.name);
    const actualNorm = stripTrailingLabel(actual.name);
    if (declaredNorm === actualNorm) {
      rows.push({
        id: d.id,
        declaredName: d.name,
        actualName: actual.name,
        status: "matched",
        confidence: "low",
        document: actual.document,
        lineIndex: actual.lineIndex,
      });
    } else {
      rows.push({
        id: d.id,
        declaredName: d.name,
        actualName: actual.name,
        status: "name-mismatch",
        confidence: "high",
        document: actual.document,
        lineIndex: actual.lineIndex,
      });
    }
  }

  for (const id of actualByIdOrder) {
    if (declaredIds.has(id)) continue;
    const actual = actualById.get(id)!;
    rows.push({
      id,
      actualName: actual.name,
      status: "actual-only",
      confidence: "medium",
      document: actual.document,
      lineIndex: actual.lineIndex,
    });
  }

  return rows;
}

export function buildRevisionReconciliation(
  claims: BasisRevisionClaim[],
  lines: BasisLine[]
): BasisRevisionReconciliationRow[] {
  const revisionLineKeys = new Set(lines.filter((l) => REVISION_HEADER_REGEX.test(l.normalized)).map((l) => `${l.document}::${l.lineIndex}`));
  const rows: BasisRevisionReconciliationRow[] = [];
  for (const claim of claims) {
    if (!claim.beforeValue || !claim.afterValue) continue;
    const residual = lines.some(
      (l) => !revisionLineKeys.has(`${l.document}::${l.lineIndex}`) && l.normalized.includes(claim.beforeValue as string)
    );
    rows.push({
      document: claim.document,
      lineIndex: claim.lineIndex,
      version: claim.version,
      date: claim.date,
      beforeValue: claim.beforeValue,
      afterValue: claim.afterValue,
      status: residual ? "residual" : "resolved",
    });
  }
  return rows;
}

// --- 検査(決定的層。候補列挙のみ。矛盾の断定は行わない) ---

function makeSnippet(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 80)}…`;
}

function place(line: BasisLine): ContradictionPlace {
  return { document: line.document, lineIndex: line.lineIndex, heading: line.heading, snippet: makeSnippet(line.raw) };
}

function placeFromParts(document: string, lineIndex: number, heading: string, raw: string): ContradictionPlace {
  return { document, lineIndex, heading, snippet: makeSnippet(raw) };
}

function isPrefixRelated(a: string, b: string): boolean {
  return a !== b && (a.startsWith(b) || b.startsWith(a));
}

export function checkNameInconsistency(
  occurrences: BasisEntityOccurrence[],
  lines: BasisLine[]
): BasisContradictionCandidate[] {
  const order: string[] = [];
  const byId = new Map<string, BasisEntityOccurrence[]>();
  for (const occ of occurrences) {
    if (!byId.has(occ.id)) {
      order.push(occ.id);
      byId.set(occ.id, []);
    }
    byId.get(occ.id)!.push(occ);
  }

  const candidates: BasisContradictionCandidate[] = [];
  for (const id of order) {
    const occs = byId.get(id)!;
    const distinctNames = Array.from(new Set(occs.map((o) => stripTrailingLabel(o.name))));
    if (distinctNames.length < 2) continue;
    const sortedByLength = [...distinctNames].sort((a, b) => b.length - a.length);
    const allPrefixRelated = sortedByLength.every(
      (name, i) => i === 0 || sortedByLength.slice(0, i).some((longer) => isPrefixRelated(name, longer))
    );
    const confidence: ContradictionConfidence = allPrefixRelated ? "medium" : "high";
    const relevant = occs.filter((o, i) => occs.findIndex((x) => stripTrailingLabel(x.name) === stripTrailingLabel(o.name)) === i);
    candidates.push(
      makeCandidate({
        checkId: "BC-01",
        confidence,
        subject: id,
        summary: `${id} の名称として「${distinctNames.join("」「")}」が複数箇所で異なって記載されている可能性がある。`,
        differingValues: distinctNames,
        places: relevant.map((o) => placeFromParts(o.document, o.lineIndex, o.heading, `${id} ${o.name}`)),
        question: `${id} の正式名称はどちらか。表記のどちらかが誤りか、意図的な別名か確認してください。`,
        assumption: `暫定的に最初に出現した名称「${occs[0].name}」を正式名称として扱う。`,
      })
    );
  }
  return candidates;
}

export function checkUiLabelMismatch(uiElements: BasisUiElement[]): BasisContradictionCandidate[] {
  const idOrder: string[] = [];
  const byId = new Map<string, BasisUiElement[]>();
  for (const el of uiElements) {
    if (!el.id) continue;
    if (!byId.has(el.id)) {
      idOrder.push(el.id);
      byId.set(el.id, []);
    }
    byId.get(el.id)!.push(el);
  }

  const candidates: BasisContradictionCandidate[] = [];
  for (const id of idOrder) {
    const elements = byId.get(id)!;
    const docOrder: string[] = [];
    const byDoc = new Map<string, BasisUiElement[]>();
    for (const el of elements) {
      if (!byDoc.has(el.document)) {
        docOrder.push(el.document);
        byDoc.set(el.document, []);
      }
      byDoc.get(el.document)!.push(el);
    }
    if (docOrder.length < 2) continue;

    const seenPairs = new Set<string>();
    for (let a = 0; a < docOrder.length; a++) {
      for (let b = a + 1; b < docOrder.length; b++) {
        const docA = docOrder[a];
        const docB = docOrder[b];
        const elsA = byDoc.get(docA)!;
        const elsB = byDoc.get(docB)!;
        for (const elA of elsA) {
          if (elsB.some((elB) => elB.label === elA.label)) continue; // 両方に存在するラベルは対象外
          const match = elsB.find((elB) => isPrefixRelated(elA.label, elB.label));
          if (!match) continue;
          const key = [docA, elA.label, docB, match.label].sort().join("::");
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          candidates.push(
            makeCandidate({
              checkId: "BC-02",
              confidence: "high",
              subject: id,
              summary: `${id} の構成要素ラベルが文書間で異なる表記になっている（「${elA.label}」/「${match.label}」）。`,
              differingValues: [elA.label, match.label],
              places: [placeFromParts(elA.document, elA.lineIndex, "", elA.label), placeFromParts(match.document, match.lineIndex, "", match.label)],
              question: `「${elA.label}」と「${match.label}」は同一の構成要素か、表記ゆれか確認してください。`,
              assumption: "暫定的に文字数が長い方のラベルを正表記として扱う。",
            })
          );
        }
      }
    }
  }
  return candidates;
}

export function checkUiLabelOneSided(uiElements: BasisUiElement[]): BasisContradictionCandidate[] {
  const mismatchPairs = new Set<string>();
  for (const c of checkUiLabelMismatch(uiElements)) {
    for (const v of c.differingValues) mismatchPairs.add(`${c.subject}::${v}`);
  }

  const idOrder: string[] = [];
  const byId = new Map<string, BasisUiElement[]>();
  for (const el of uiElements) {
    if (!el.id) continue;
    if (!byId.has(el.id)) {
      idOrder.push(el.id);
      byId.set(el.id, []);
    }
    byId.get(el.id)!.push(el);
  }

  const candidates: BasisContradictionCandidate[] = [];
  for (const id of idOrder) {
    const elements = byId.get(id)!;
    const docOrder: string[] = [];
    const byDoc = new Map<string, BasisUiElement[]>();
    for (const el of elements) {
      if (!byDoc.has(el.document)) {
        docOrder.push(el.document);
        byDoc.set(el.document, []);
      }
      byDoc.get(el.document)!.push(el);
    }
    if (docOrder.length < 2) continue;

    const allLabelsByDoc = new Map<string, Set<string>>();
    for (const d of docOrder) allLabelsByDoc.set(d, new Set(byDoc.get(d)!.map((e) => e.label)));

    for (const d of docOrder) {
      for (const el of byDoc.get(d)!) {
        if (!OPERATION_KIND_WORDS.includes(el.elementKind)) continue;
        if (mismatchPairs.has(`${id}::${el.label}`)) continue;
        const existsElsewhere = docOrder.some((other) => other !== d && allLabelsByDoc.get(other)!.has(el.label));
        if (existsElsewhere) continue;
        candidates.push(
          makeCandidate({
            checkId: "BC-03",
            confidence: "medium",
            subject: id,
            summary: `${id} の構成要素「${el.label}」(${el.elementKind}) が ${d} にしか存在しない。`,
            differingValues: [el.label],
            places: [placeFromParts(el.document, el.lineIndex, "", el.label)],
            question: `「${el.label}」は他文書でも同じ画面に存在するはずか、この文書だけの構成か確認してください。`,
            assumption: "暫定的にこの文書だけに存在する構成要素として扱う。",
          })
        );
      }
    }
  }
  return candidates;
}

function targetLabel(t: BasisTransition): string {
  if (t.targetKind === "id") return `${t.targetId ?? ""}${t.targetName}`;
  return t.targetName;
}

export function checkTransitionInconsistency(transitions: BasisTransition[]): BasisContradictionCandidate[] {
  const order: string[] = [];
  const byKey = new Map<string, BasisTransition[]>();
  for (const t of transitions) {
    const key = `${t.sourceId ?? "(不明)"}::${t.trigger}`;
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, []);
    }
    byKey.get(key)!.push(t);
  }

  const candidates: BasisContradictionCandidate[] = [];
  for (const key of order) {
    const list = byKey.get(key)!;
    const distinctTargets = Array.from(new Set(list.map((t) => targetLabel(t))));
    if (distinctTargets.length < 2) continue;
    const [sourceId, trigger] = [list[0].sourceId ?? "(不明)", list[0].trigger];
    candidates.push(
      makeCandidate({
        checkId: "BC-04",
        confidence: "high",
        subject: trigger,
        summary: `トリガー「${trigger}」(起点:${sourceId}) の遷移先が「${distinctTargets.join("」「")}」で複数箇所間で異なる。`,
        differingValues: distinctTargets,
        places: list.map((t) => placeFromParts(t.document, t.lineIndex, "", `${trigger}→${targetLabel(t)}`)),
        question: `「${trigger}」を押した際の正しい遷移先はどれか確認してください。`,
        assumption: `暫定的に最初に出現した遷移先「${distinctTargets[0]}」を正として扱う。`,
      })
    );
  }
  return candidates;
}

export function checkUnresolvedTransitionTarget(
  transitions: BasisTransition[],
  occurrences: BasisEntityOccurrence[],
  declaredEntities: BasisDeclaredEntity[] | undefined
): BasisContradictionCandidate[] {
  const knownNames = new Set<string>();
  for (const occ of occurrences) knownNames.add(stripTrailingLabel(occ.name));
  for (const d of declaredEntities ?? []) knownNames.add(stripTrailingLabel(d.name));

  const candidates: BasisContradictionCandidate[] = [];
  for (const t of transitions) {
    if (t.targetKind !== "name") continue;
    const name = stripTrailingLabel(t.targetName);
    if (!name) continue;
    const found = Array.from(knownNames).some((k) => k.length > 0 && (k.includes(name) || name.includes(k)));
    if (found) continue;
    candidates.push(
      makeCandidate({
        checkId: "BC-05",
        confidence: "medium",
        subject: t.targetName,
        summary: `遷移先「${t.targetName}」がID併記されておらず、宣言・実体いずれの名称カタログにも一致しない。`,
        differingValues: [t.targetName],
        places: [placeFromParts(t.document, t.lineIndex, "", `${t.trigger}→${t.targetName}`)],
        question: `「${t.targetName}」はどのIDの画面/ダイアログを指すか確認してください。`,
        assumption: "暫定的に未特定の遷移先として扱う。",
      })
    );
  }
  return candidates;
}

const BEHAVIOR_PHRASE_REGEX = /を押すと|を押下|を選択すると|を選ぶと|：.{0,20}?に遷移|を表示する/;

export function checkUndescribedOperationElements(
  uiElements: BasisUiElement[],
  lines: BasisLine[]
): BasisContradictionCandidate[] {
  const tableRowLineKeys = new Set(
    uiElements.filter((e) => e.source === "table-row").map((e) => `${e.document}::${e.lineIndex}`)
  );
  const behaviorText = lines
    .filter((l) => !tableRowLineKeys.has(`${l.document}::${l.lineIndex}`))
    .map((l) => l.normalized)
    .join("\n");

  const seen = new Set<string>();
  const candidates: BasisContradictionCandidate[] = [];
  for (const el of uiElements) {
    if (!OPERATION_KIND_WORDS.includes(el.elementKind)) continue;
    const key = `${el.id ?? ""}::${el.label}`;
    if (seen.has(key)) continue;
    const escaped = el.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hasBehavior = new RegExp(`${escaped}[^\n]{0,10}(?:${BEHAVIOR_PHRASE_REGEX.source})|(?:${BEHAVIOR_PHRASE_REGEX.source})[^\n]{0,10}${escaped}`).test(
      behaviorText
    );
    if (hasBehavior) continue;
    seen.add(key);
    candidates.push(
      makeCandidate({
        checkId: "BC-06",
        confidence: "medium",
        subject: el.label,
        summary: `操作要素「${el.label}」(${el.elementKind}) が構成として宣言されているが、振る舞い文が本文中に見つからない。`,
        differingValues: [el.label],
        places: [placeFromParts(el.document, el.lineIndex, "", el.label)],
        question: `「${el.label}」を操作した際の挙動が別文書に記載されていないか確認してください。`,
        assumption: "暫定的に振る舞い未記述として扱う。",
      })
    );
  }
  return candidates;
}

const SUBJECT_PATTERNS = [
  /■?([^、。■]{2,30}?)のお知らせ/g,
  /([^、。]{2,20}?)が完了(?:いたしました|しました)/g,
  /([^、。]{2,20}?)を受け付け/g,
];

function extractSubjectTerms(text: string): string[] {
  const result: string[] = [];
  for (const pattern of SUBJECT_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      result.push(m[1]);
      if (m[0].length === 0) pattern.lastIndex++;
    }
  }
  return result;
}

function mainTokens(name: string): string[] {
  const cleaned = name.replace(/[「」()（）・、。]/g, "");
  return cleaned.length >= 2 ? [cleaned] : [];
}

export function checkDeclaredVsBodySubjectMismatch(
  occurrences: BasisEntityOccurrence[],
  lines: BasisLine[]
): BasisContradictionCandidate[] {
  const order: string[] = [];
  const declaredNameById = new Map<string, string>();
  for (const occ of occurrences) {
    if (!declaredNameById.has(occ.id)) {
      order.push(occ.id);
      declaredNameById.set(occ.id, occ.name);
    }
  }

  const candidates: BasisContradictionCandidate[] = [];
  for (const line of lines) {
    if (!line.currentId) continue;
    const subjects = extractSubjectTerms(line.normalized);
    if (subjects.length === 0) continue;
    const declaredName = declaredNameById.get(line.currentId);
    if (!declaredName) continue;
    const declaredTokens = mainTokens(stripTrailingLabel(declaredName));
    if (declaredTokens.length === 0) continue;

    // 条件A: 宣言名の主要トークンがどの主題語にも含まれない
    const conditionA = !subjects.some((subj) => declaredTokens.some((tok) => subj.includes(tok)));
    if (!conditionA) continue;

    // 条件B: 主題語のいずれかが「別のID」の宣言名の主要トークンを含む
    // 条件Bを外すと、単に未知語な主題（他IDとは無関係な新規の名詞）まで候補化してしまい、
    // 2026年版で誤検出が発生することが実データ検証で判明したため、両条件を必須とする。
    let matchedOtherId: string | undefined;
    let matchedOtherName: string | undefined;
    for (const otherId of order) {
      if (otherId === line.currentId) continue;
      const otherName = declaredNameById.get(otherId)!;
      const otherTokens = mainTokens(stripTrailingLabel(otherName));
      if (otherTokens.length === 0) continue;
      if (subjects.some((subj) => otherTokens.some((tok) => subj.includes(tok)))) {
        matchedOtherId = otherId;
        matchedOtherName = otherName;
        break;
      }
    }
    if (!matchedOtherId) continue;

    candidates.push(
      makeCandidate({
        checkId: "BC-07",
        confidence: "high",
        subject: line.currentId,
        summary: `${line.currentId}(宣言名: ${declaredName}) の本文の主題が「${subjects.join("/")}」であり、別ID ${matchedOtherId}(${matchedOtherName}) の宣言名と一致する。`,
        differingValues: [declaredName, matchedOtherName ?? ""],
        places: [place(line)],
        question: `${line.currentId} の本文は本当に ${line.currentId}(${declaredName}) の説明か、それとも ${matchedOtherId} の説明の誤配置か確認してください。`,
        assumption: `暫定的に一覧宣言(${declaredName})が正しい対象を表すとして扱う。`,
      })
    );
  }
  return candidates;
}

export function checkParameterValueInconsistency(parameters: BasisParameterValue[]): BasisContradictionCandidate[] {
  const order: string[] = [];
  const byKey = new Map<string, BasisParameterValue[]>();
  for (const p of parameters) {
    if (p.value === null) continue;
    const key = `${p.parameter}::${p.unit}`;
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, []);
    }
    byKey.get(key)!.push(p);
  }

  const candidates: BasisContradictionCandidate[] = [];
  for (const key of order) {
    const list = byKey.get(key)!;
    const distinctValues = Array.from(new Set(list.map((p) => p.value)));
    if (distinctValues.length < 2) continue;
    const distinctDocs = new Set(list.map((p) => p.document));
    const confidence: ContradictionConfidence = distinctDocs.size >= 2 ? "medium" : "low";
    const [parameter, unit] = key.split("::");
    candidates.push(
      makeCandidate({
        checkId: "BC-08",
        confidence,
        subject: parameter,
        summary: `パラメータ「${parameter}」(単位:${unit || "-"}) の値が「${distinctValues.join("」「")}」で複数箇所間で異なる。`,
        differingValues: distinctValues.map((v) => String(v)),
        places: list.map((p) => placeFromParts(p.document, p.lineIndex, p.heading, p.raw)),
        question: `「${parameter}」の正しい値はどれか確認してください。`,
        assumption: `暫定的に最初に出現した値「${list[0].raw}」を正として扱う。`,
      })
    );
  }
  return candidates;
}

export function checkRevisionResidual(rows: BasisRevisionReconciliationRow[]): BasisContradictionCandidate[] {
  const candidates: BasisContradictionCandidate[] = [];
  for (const row of rows) {
    if (row.status !== "residual") continue;
    candidates.push(
      makeCandidate({
        checkId: "BC-09",
        confidence: "high",
        subject: `${row.beforeValue}→${row.afterValue}`,
        summary: `改訂宣言(${row.date} ${row.version})で「${row.beforeValue}」から「${row.afterValue}」への変更が宣言されているが、旧値「${row.beforeValue}」が本文に残存している。`,
        differingValues: [row.beforeValue, row.afterValue],
        places: [placeFromParts(row.document, row.lineIndex, "", `${row.beforeValue}→${row.afterValue}`)],
        question: `旧値「${row.beforeValue}」が残っている箇所は改訂反映漏れか、別対象への言及か確認してください。`,
        assumption: "暫定的に改訂反映漏れとして扱う。",
      })
    );
  }
  return candidates;
}

export function checkMinorityTransitionTarget(transitions: BasisTransition[]): BasisContradictionCandidate[] {
  const order: string[] = [];
  const byTrigger = new Map<string, BasisTransition[]>();
  for (const t of transitions) {
    if (!byTrigger.has(t.trigger)) {
      order.push(t.trigger);
      byTrigger.set(t.trigger, []);
    }
    byTrigger.get(t.trigger)!.push(t);
  }

  const candidates: BasisContradictionCandidate[] = [];
  for (const trigger of order) {
    const list = byTrigger.get(trigger)!;
    const total = list.length;
    if (total < 3) continue;
    const countByTarget = new Map<string, BasisTransition[]>();
    for (const t of list) {
      const label = targetLabel(t);
      if (!countByTarget.has(label)) countByTarget.set(label, []);
      countByTarget.get(label)!.push(t);
    }
    if (countByTarget.size < 2) continue;
    for (const [label, occs] of countByTarget) {
      const ratio = occs.length / total;
      if (ratio >= 0.2) continue;
      candidates.push(
        makeCandidate({
          checkId: "BC-10",
          confidence: "low",
          subject: trigger,
          summary: `トリガー「${trigger}」の遷移先のうち「${label}」は${occs.length}/${total}件と少数派である。`,
          differingValues: [label],
          places: occs.map((t) => placeFromParts(t.document, t.lineIndex, "", `${trigger}→${label}`)),
          question: `「${trigger}」から「${label}」への遷移は他と異なる正当な分岐か、誤記かを確認してください。`,
          assumption: "暫定的に不揃いの可能性提示にとどめ、矛盾とは断定しない。",
        })
      );
    }
  }
  return candidates;
}

interface CandidateDraft {
  checkId: ContradictionCheckId;
  confidence: ContradictionConfidence;
  subject: string;
  summary: string;
  differingValues: string[];
  places: ContradictionPlace[];
  question: string;
  assumption: string;
}

function makeCandidate(draft: CandidateDraft): BasisContradictionCandidate {
  return { no: "", ...draft };
}

function assignCandidateNumbers(candidates: BasisContradictionCandidate[]): BasisContradictionCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.checkId !== b.checkId) return a.checkId.localeCompare(b.checkId);
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    const docA = a.places[0]?.document ?? "";
    const docB = b.places[0]?.document ?? "";
    if (docA !== docB) return docA.localeCompare(docB);
    const lineA = a.places[0]?.lineIndex ?? 0;
    const lineB = b.places[0]?.lineIndex ?? 0;
    return lineA - lineB;
  });
  return sorted.map((c, i) => ({ ...c, no: `BC-${String(i + 1).padStart(3, "0")}` }));
}

export function buildContradictionCandidates(
  documents: TestBasisDocument[],
  options: BasisContradictionOptions & { declaredEntities?: BasisDeclaredEntity[] } = {}
): BasisContradictionCandidate[] {
  const lines = buildBasisLines(documents, options);
  const occurrences = extractEntityOccurrences(lines);
  const uiElements = extractUiElements(lines);
  const transitions = extractTransitions(lines, options);
  const parameters = extractParameterValues(documents, lines);
  const revisionClaims = extractRevisionClaims(lines);
  const revisionRows = buildRevisionReconciliation(revisionClaims, lines);

  const all: BasisContradictionCandidate[] = [
    ...checkNameInconsistency(occurrences, lines),
    ...checkUiLabelMismatch(uiElements),
    ...checkUiLabelOneSided(uiElements),
    ...checkTransitionInconsistency(transitions),
    ...checkUnresolvedTransitionTarget(transitions, occurrences, options.declaredEntities),
    ...checkUndescribedOperationElements(uiElements, lines),
    ...checkDeclaredVsBodySubjectMismatch(occurrences, lines),
    ...checkParameterValueInconsistency(parameters),
    ...checkRevisionResidual(revisionRows),
    ...checkMinorityTransitionTarget(transitions),
  ];

  return assignCandidateNumbers(all);
}

export function summarizeContradictions(candidates: BasisContradictionCandidate[]): BasisContradictionSummary {
  const byCheckId: Record<string, number> = {};
  const byConfidence: Record<string, number> = {};
  const documents = new Set<string>();
  for (const c of candidates) {
    byCheckId[c.checkId] = (byCheckId[c.checkId] ?? 0) + 1;
    byConfidence[c.confidence] = (byConfidence[c.confidence] ?? 0) + 1;
    for (const p of c.places) documents.add(p.document);
  }
  return {
    byCheckId,
    byConfidence,
    documentCount: documents.size,
    totalCandidates: candidates.length,
  };
}

export {
  DEFAULT_RELATIVE_TARGET_TERMS,
  OPERATION_KIND_WORDS,
  UI_KIND_WORDS,
};
