import { escapeRegExp, parseHeadings } from "./tools/reviewTestPlan.js";
import { extractIdOccurrences, extractIdStringsFromText } from "./testBasisAnalysis.js";
import { deliverableConsistencyCriteria } from "./resources/deliverableConsistencyCriteria.js";
import type {
  AuditDeliverableConsistencyInput,
  ConsistencyDeliverable,
  ConsistencyDeliverableKind,
  CorrespondenceClaim,
  CountClaim,
  CrossRefIdEntry,
  CrossRefIdStatement,
  DeclaredReferencedDocumentSet,
  DeliverableConsistencyCheckId,
  DeliverableConsistencyCriteria,
  DeliverableConsistencyFinding,
  DeliverableConsistencyPlace,
  DeliverableConsistencySeverity,
  DeliverableConsistencySummary,
  DeliverableCountClaimSubject,
  DeliverableIdPrefixOwner,
  IdStatementDiffRow,
  ReferencedDocumentOccurrence,
  ReferencedDocumentRow,
  ReferencedDocumentState,
  SectionReference,
  SharedItemOccurrence,
  TestBasisIdOccurrence,
} from "./types.js";

// audit_deliverable_consistency 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順と明示したソートキーで決定的。
// 決定的層は候補列挙にとどめ、不整合の断定は意味的層に委ねる。

/** DCC-13 の 2-gram 包含率の下限。これ未満を記述乖離候補とする。 */
export const BIGRAM_CONTAINMENT_THRESHOLD = 0.8;
/** レンジ表記から展開するIDの上限件数。 */
export const ID_RANGE_EXPANSION_LIMIT = 200;

/** 成果物種別ごとの既定の呼称。他成果物からの参照解決に用いる。 */
export const DEFAULT_DELIVERABLE_ALIASES: Record<ConsistencyDeliverableKind, string[]> = {
  "test-plan": ["テスト計画書", "計画書", "本計画書"],
  "test-analysis": ["テスト分析書", "分析書", "テスト分析", "本分析書"],
  "test-design": ["テスト設計書", "設計書", "テスト設計", "本設計書"],
  "test-report": ["テスト報告書", "報告書", "本報告書"],
  other: [],
};

/** 自成果物を指す語。 */
export const SELF_REFERENCE_WORDS = ["本書", "本文書"];

const CORRESPONDENCE_WORD_REGEX = /対応する|に対応|と対応|整合する|一致する|準拠|に基づく/;
const UNKNOWN_DELIVERABLE_TOKEN_REGEX =
  /([^\s　、。・「」『』（）()|｜:：]{2,20}(?:仕様書|計画書|分析書|設計書|報告書|レポート))$/;
const UNIT_VALUE_REGEX =
  /(\d+(?:\.\d+)?)\s*(ミリ秒|秒|分|時間|人|枚|台|回|件|%|才|歳|ケース|条件)/g;
const REFERENCED_DOCUMENT_CONTEXT_REGEX = /号|文書|仕様書|依頼書|概要書/;
const LEADING_MARKER_REGEX = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.).]\s*)?/;

// --- 共通ヘルパ ---

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

function makeSnippet(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 80)}…`;
}

function normalizeText(s: string): string {
  return s.normalize("NFKC").replace(/[\s　]+/g, "");
}

function splitSentences(line: string): string[] {
  return line.split(/(?<=。)/).filter((s) => s.trim().length > 0);
}

function maskParenContent(text: string): string {
  let depth = 0;
  let out = "";
  for (const ch of text) {
    if (ch === "（" || ch === "(") {
      depth++;
      out += ch;
      continue;
    }
    if (ch === "）" || ch === ")") {
      if (depth > 0) depth--;
      out += ch;
      continue;
    }
    out += depth > 0 ? " " : ch;
  }
  return out;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function isTableRow(line: string): boolean {
  return (line.match(/\|/g) ?? []).length >= 2;
}

function tableCells(line: string): string[] {
  return line
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !/^-{2,}$/.test(c));
}

/** 件数宣言・ID列挙・共通項目の判定単位。表行はセル、散文は文単位。 */
function segmentsOf(line: string): string[] {
  if (isTableRow(line)) return tableCells(line);
  return splitSentences(line);
}

function makePlace(
  deliverable: string,
  lineIndex: number,
  heading: string,
  raw: string
): DeliverableConsistencyPlace {
  return { deliverable, lineIndex, heading, snippet: makeSnippet(raw) };
}

interface FindingDraft {
  checkId: DeliverableConsistencyCheckId;
  severity: DeliverableConsistencySeverity;
  subject: string;
  summary: string;
  places: DeliverableConsistencyPlace[];
  question: string;
  assumption: string;
}

function makeFinding(draft: FindingDraft): DeliverableConsistencyFinding {
  return { no: "", ...draft };
}

export function assignFindingNumbers(
  findings: DeliverableConsistencyFinding[]
): DeliverableConsistencyFinding[] {
  const sorted = [...findings].sort((a, b) => {
    if (a.checkId !== b.checkId) return a.checkId.localeCompare(b.checkId);
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    const docA = a.places[0]?.deliverable ?? "";
    const docB = b.places[0]?.deliverable ?? "";
    if (docA !== docB) return docA.localeCompare(docB);
    const lineA = a.places[0]?.lineIndex ?? 0;
    const lineB = b.places[0]?.lineIndex ?? 0;
    if (lineA !== lineB) return lineA - lineB;
    return a.summary.localeCompare(b.summary);
  });
  return sorted.map((f, i) => ({ ...f, no: `DC-${String(i + 1).padStart(3, "0")}` }));
}

// --- 成果物索引 ---

export interface DeliverableHeadingEntry {
  lineIndex: number;
  titleText: string;
  /** 同レベル以上の次見出し行（無ければ行数） */
  endLineIndex: number;
}

export interface DeliverableIndexEntry {
  name: string;
  kind: ConsistencyDeliverableKind;
  aliases: string[];
  headingNos: Set<string>;
  headingByNo: Map<string, DeliverableHeadingEntry>;
  order: number;
  lines: string[];
  headingPerLine: string[];
}

export function buildDeliverableIndex(
  deliverables: ConsistencyDeliverable[]
): DeliverableIndexEntry[] {
  return deliverables.map((d, order) => {
    const lines = d.content.split("\n");
    const headings = parseHeadings(d.content);
    const depthOf = (no: string | undefined): number => (no === undefined ? 1 : no.split(".").length);

    const headingNos = new Set<string>();
    const headingByNo = new Map<string, DeliverableHeadingEntry>();
    headings.forEach((h, i) => {
      if (h.no === undefined) return;
      if (headingByNo.has(h.no)) return; // 先勝ち
      const depth = depthOf(h.no);
      let endLineIndex = lines.length;
      for (let j = i + 1; j < headings.length; j++) {
        if (depthOf(headings[j].no) <= depth) {
          endLineIndex = headings[j].lineIndex;
          break;
        }
      }
      headingNos.add(h.no);
      headingByNo.set(h.no, { lineIndex: h.lineIndex, titleText: h.titleText, endLineIndex });
    });

    const aliases = uniqueStrings([
      ...(d.aliases ?? []),
      ...DEFAULT_DELIVERABLE_ALIASES[d.kind],
    ]);

    return {
      name: d.name,
      kind: d.kind,
      aliases,
      headingNos,
      headingByNo,
      order,
      lines,
      headingPerLine: headingsPerLine(d.content),
    };
  });
}

/** 呼称 → 成果物名（投入されていない呼称は null）。長い呼称を先に評価する。 */
interface AliasVocabularyEntry {
  alias: string;
  deliverable: string | null;
}

function buildAliasVocabulary(index: DeliverableIndexEntry[]): AliasVocabularyEntry[] {
  const map = new Map<string, string | null>();
  for (const entry of index) {
    for (const alias of entry.aliases) {
      if (!map.has(alias)) map.set(alias, entry.name);
    }
  }
  for (const kind of Object.keys(DEFAULT_DELIVERABLE_ALIASES) as ConsistencyDeliverableKind[]) {
    for (const alias of DEFAULT_DELIVERABLE_ALIASES[kind]) {
      if (!map.has(alias)) map.set(alias, null);
    }
  }
  for (const entry of index) {
    if (!map.has(entry.name)) map.set(entry.name, entry.name);
  }
  return Array.from(map.entries())
    .map(([alias, deliverable]) => ({ alias, deliverable }))
    .sort((a, b) => (b.alias.length !== a.alias.length ? b.alias.length - a.alias.length : a.alias.localeCompare(b.alias)));
}

// --- (a) 参照テストベース文書（DCC-01〜DCC-05） ---

export function extractReferencedDocuments(
  deliverables: ConsistencyDeliverable[],
  criteria: DeliverableConsistencyCriteria = deliverableConsistencyCriteria
): ReferencedDocumentOccurrence[] {
  const results: ReferencedDocumentOccurrence[] = [];
  for (const d of deliverables) {
    const lines = d.content.split("\n");
    const headingPerLine = headingsPerLine(d.content);
    lines.forEach((line, lineIndex) => {
      for (const sentence of splitSentences(line)) {
        const keys: { key: string; label: string }[] = [];

        // 1) 「13(発券機画面仕様書)」形式（括弧直前の番号）
        const parenRe = /(?<![0-9])(\d{2})[（(]([^）)]{1,30})[）)]/g;
        let m: RegExpExecArray | null;
        while ((m = parenRe.exec(sentence)) !== null) {
          keys.push({ key: m[1], label: m[2].trim() });
        }

        // 括弧内の理由句に含まれる番号を無効化してから残りを拾う
        const masked = maskParenContent(sentence);

        // 2) 「13_園内…」「13号文書」形式
        const keyedRe = /(?<![0-9])(\d{2})[_号]([^\s、。・)｜|:：]{0,30})/g;
        while ((m = keyedRe.exec(masked)) !== null) {
          keys.push({ key: m[1], label: m[2].trim() });
        }

        // 3) 「01・02・11・12・21・71号文書」形式の連番列挙
        if (REFERENCED_DOCUMENT_CONTEXT_REGEX.test(masked)) {
          const runRe = /\d{2}(?:[・、,]\d{2})+/g;
          while ((m = runRe.exec(masked)) !== null) {
            for (const num of m[0].split(/[・、,]/)) keys.push({ key: num, label: "" });
          }
        }

        if (keys.length === 0) continue;
        const state: "read" | "unread" = criteria.unreadStateWords.some((w) => sentence.includes(w))
          ? "unread"
          : "read";
        const heading = headingPerLine[lineIndex] ?? "(見出しなし)";
        for (const { key, label } of keys) {
          results.push({
            deliverable: d.name,
            documentKey: key,
            documentLabel: label,
            lineIndex,
            heading,
            state,
            snippet: makeSnippet(sentence),
          });
        }
      }
    });
  }
  return results;
}

export function buildReferencedDocumentMatrix(
  occurrences: ReferencedDocumentOccurrence[],
  deliverables: ConsistencyDeliverable[]
): ReferencedDocumentRow[] {
  const order: string[] = [];
  const byKey = new Map<string, ReferencedDocumentOccurrence[]>();
  for (const occ of occurrences) {
    if (!byKey.has(occ.documentKey)) {
      order.push(occ.documentKey);
      byKey.set(occ.documentKey, []);
    }
    (byKey.get(occ.documentKey) as ReferencedDocumentOccurrence[]).push(occ);
  }

  return order.map((documentKey) => {
    const occs = byKey.get(documentKey) as ReferencedDocumentOccurrence[];
    const label = occs.find((o) => o.documentLabel.length > 0)?.documentLabel ?? "";
    const states = deliverables.map((d) => {
      const mine = occs.filter((o) => o.deliverable === d.name);
      const hasRead = mine.some((o) => o.state === "read");
      const hasUnread = mine.some((o) => o.state === "unread");
      let state: ReferencedDocumentState = "absent";
      if (hasRead && hasUnread) state = "both";
      else if (hasRead) state = "read";
      else if (hasUnread) state = "unread";
      return { deliverable: d.name, state };
    });
    return { documentKey, documentLabel: label, states, occurrences: occs };
  });
}

function rowPlaces(
  row: ReferencedDocumentRow,
  filter: (occ: ReferencedDocumentOccurrence) => boolean
): DeliverableConsistencyPlace[] {
  return row.occurrences
    .filter(filter)
    .map((o) => makePlace(o.deliverable, o.lineIndex, o.heading, o.snippet));
}

function documentTitle(row: ReferencedDocumentRow): string {
  return row.documentLabel.length > 0 ? `${row.documentKey}(${row.documentLabel})` : row.documentKey;
}

export function checkReferencedDocumentConflicts(
  rows: ReferencedDocumentRow[]
): DeliverableConsistencyFinding[] {
  const findings: DeliverableConsistencyFinding[] = [];
  for (const row of rows) {
    const present = row.states.filter((s) => s.state !== "absent");
    const unreadSide = row.states.filter((s) => s.state === "unread" || s.state === "both");
    const readSide = row.states.filter((s) => s.state === "read" || s.state === "both");

    // DCC-01: 一方が未読、他方が読了
    const crossPair = unreadSide.some((u) => readSide.some((r) => r.deliverable !== u.deliverable));
    if (crossPair) {
      findings.push(
        makeFinding({
          checkId: "DCC-01",
          severity: "high",
          subject: documentTitle(row),
          summary: `テストベース文書 ${documentTitle(row)} は ${unreadSide
            .map((s) => s.deliverable)
            .join(" / ")} で未読・対象外として、${readSide
            .map((s) => s.deliverable)
            .join(" / ")} で読了・参照済みとして記述されている。`,
          places: rowPlaces(row, () => true),
          question: `${documentTitle(row)} を実際に読解したのはどの成果物か。未読側の記述が古いのか、読了側が孫引きなのかを確認してください。`,
          assumption: "暫定的に未読宣言側が実態を表すものとして扱い、読了側の記述は裏付け不明として残す。",
        })
      );
    }

    // DCC-02: 同一成果物内の自己矛盾
    for (const s of row.states) {
      if (s.state !== "both") continue;
      findings.push(
        makeFinding({
          checkId: "DCC-02",
          severity: "high",
          subject: `${s.deliverable} / ${documentTitle(row)}`,
          summary: `${s.deliverable} の中で ${documentTitle(row)} が読了（参考文献・テストベース列挙）と未読・対象外の両方で言及されている。`,
          places: rowPlaces(row, (o) => o.deliverable === s.deliverable),
          question: `${s.deliverable} における ${documentTitle(row)} の扱いは読了か未読か、部分読解であればどの範囲かを確認してください。`,
          assumption: "暫定的に未読側の記述を優先し、当該文書由来の記述は裏付け不明として扱う。",
        })
      );
    }

    // DCC-03: 片側の成果物にしか現れない
    if (row.states.length >= 2 && present.length === 1) {
      const only = present[0];
      findings.push(
        makeFinding({
          checkId: "DCC-03",
          severity: "medium",
          subject: documentTitle(row),
          summary: `テストベース文書 ${documentTitle(row)} は ${only.deliverable} にしか現れず、他の成果物では読了・未読のいずれとしても言及されていない。`,
          places: rowPlaces(row, () => true),
          question: `${documentTitle(row)} の扱いを後続成果物へ引き継がなかったのは意図的かを確認してください。`,
          assumption: "暫定的に工程間で参照範囲が引き継がれていない候補として扱う。",
        })
      );
    }
  }
  return findings;
}

function documentKeyOf(value: string): string | undefined {
  const m = /(\d{2})/.exec(value.trim());
  return m ? m[1] : undefined;
}

export function reconcileDeclaredReferencedDocuments(
  rows: ReferencedDocumentRow[],
  declared: DeclaredReferencedDocumentSet[] | undefined
): DeliverableConsistencyFinding[] {
  if (declared === undefined || declared.length === 0) return [];
  const findings: DeliverableConsistencyFinding[] = [];

  for (const entry of declared) {
    const declaredRead = new Set<string>();
    for (const v of entry.readDocuments) {
      const key = documentKeyOf(v);
      if (key !== undefined) declaredRead.add(key);
    }
    const declaredUnread = new Set<string>();
    for (const v of entry.unreadDocuments ?? []) {
      const key = documentKeyOf(v);
      if (key !== undefined) declaredUnread.add(key);
    }

    const actualByKey = new Map<string, ReferencedDocumentState>();
    for (const row of rows) {
      const state = row.states.find((s) => s.deliverable === entry.deliverable)?.state ?? "absent";
      actualByKey.set(row.documentKey, state);
    }

    const push = (
      key: string,
      status: string,
      row: ReferencedDocumentRow | undefined,
      detail: string
    ): void => {
      findings.push(
        makeFinding({
          checkId: "DCC-04",
          severity: "high",
          subject: `${entry.deliverable} / ${key}`,
          summary: `${entry.deliverable} の参照テストベース文書宣言と本文実体が一致しない（${status}）。${detail}`,
          places:
            row === undefined
              ? []
              : rowPlaces(row, (o) => o.deliverable === entry.deliverable),
          question: `文書 ${key} について、宣言リストと本文のどちらが実態かを確認してください。`,
          assumption: "暫定的に本文実体を優先し、宣言リストを未更新として扱う。",
        })
      );
    };

    for (const key of Array.from(declaredRead).sort()) {
      const state = actualByKey.get(key) ?? "absent";
      const row = rows.find((r) => r.documentKey === key);
      if (state === "absent") {
        push(key, "宣言のみ", row, "読了として宣言されているが本文に出現しない。");
      } else if (state === "unread") {
        push(key, "読了状態相違", row, "読了として宣言されているが本文では未読・対象外として扱われている。");
      } else if (state === "both") {
        push(key, "読了状態相違", row, "読了として宣言されているが本文に未読・対象外の記述も存在する。");
      }
    }
    for (const key of Array.from(declaredUnread).sort()) {
      const state = actualByKey.get(key) ?? "absent";
      const row = rows.find((r) => r.documentKey === key);
      if (state === "absent") {
        push(key, "宣言のみ", row, "未読として宣言されているが本文に出現しない。");
      } else if (state === "read") {
        push(key, "読了状態相違", row, "未読として宣言されているが本文では読了・参照済みとして扱われている。");
      } else if (state === "both") {
        push(key, "読了状態相違", row, "未読として宣言されているが本文に読了・参照済みの記述も存在する。");
      }
    }
    for (const row of rows) {
      const state = row.states.find((s) => s.deliverable === entry.deliverable)?.state ?? "absent";
      if (state === "absent") continue;
      if (declaredRead.has(row.documentKey) || declaredUnread.has(row.documentKey)) continue;
      push(
        row.documentKey,
        "本文のみ",
        row,
        `本文では ${state} として言及されているが、宣言リストに含まれていない。`
      );
    }
  }
  return findings;
}

export function checkUnreadDocumentIdUsage(
  rows: ReferencedDocumentRow[],
  idOccurrences: TestBasisIdOccurrence[],
  idPrefixOwners: DeliverableIdPrefixOwner[] | undefined
): DeliverableConsistencyFinding[] {
  if (idPrefixOwners === undefined || idPrefixOwners.length === 0) return [];
  const findings: DeliverableConsistencyFinding[] = [];

  for (const owner of idPrefixOwners) {
    const row = rows.find((r) => r.documentKey === owner.documentKey);
    if (row === undefined) continue;
    const unreadSides = row.states.filter((s) => s.state === "unread" || s.state === "both");
    if (unreadSides.length === 0) continue;

    for (const prefix of owner.prefixes) {
      const used = idOccurrences.filter((o) => o.id.toUpperCase().startsWith(prefix.toUpperCase()));
      if (used.length === 0) continue;
      const usedIds = uniqueStrings(used.map((o) => o.id));
      const usedDeliverables = uniqueStrings(used.map((o) => o.document));
      findings.push(
        makeFinding({
          checkId: "DCC-05",
          severity: "high",
          subject: `${documentTitle(row)} / ${prefix}`,
          summary: `文書 ${documentTitle(row)} は ${unreadSides
            .map((s) => s.deliverable)
            .join(" / ")} で未読・対象外と宣言されているが、当該文書が所有するプレフィックス「${prefix}」のIDが ${usedDeliverables.join(
            " / "
          )} で ${usedIds.length} 件実際に参照されている（例: ${usedIds.slice(0, 5).join(", ")}）。`,
          places: [
            ...rowPlaces(row, (o) => o.state === "unread"),
            ...used
              .slice(0, 5)
              .map((o) => makePlace(o.document, o.lineIndex, o.heading, o.lineText)),
          ],
          question: `未読宣言のまま「${prefix}」のIDを参照できた根拠（孫引き・他文書からの推測など）を確認してください。`,
          assumption: "暫定的に当該IDの記述は裏付け不明として扱い、未読宣言との矛盾候補として残す。",
        })
      );
    }
  }
  return findings;
}

// --- (b) IDの成果物間相互参照（DCC-06〜DCC-08） ---

const RANGE_REGEX =
  /([A-Z][A-Za-z0-9]{0,5})-(\d{1,4})[\s　]{0,2}[〜～~][\s　]{0,2}(?:([A-Z][A-Za-z0-9]{0,5})-)?(\d{1,4})/g;

export function expandIdRanges(text: string): string[] {
  const out: string[] = [];
  RANGE_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RANGE_REGEX.exec(text)) !== null) {
    const prefix = m[1];
    const startRaw = m[2];
    const endPrefix = m[3];
    const endRaw = m[4];
    if (endPrefix !== undefined && endPrefix !== prefix) continue;
    const start = Number(startRaw);
    const end = Number(endRaw);
    if (!(end > start)) continue;
    if (end - start + 1 > ID_RANGE_EXPANSION_LIMIT) continue;
    const width = startRaw.length;
    for (let n = start; n <= end; n++) out.push(`${prefix}-${String(n).padStart(width, "0")}`);
  }
  return uniqueStrings(out);
}

export function statementOf(lineText: string, id: string): string {
  if (isTableRow(lineText)) {
    const cells = tableCells(lineText);
    let best = "";
    for (const cell of cells) {
      if (cell.toUpperCase().includes(id.toUpperCase())) continue;
      if (cell.length > best.length) best = cell;
    }
    return best;
  }
  const stripped = lineText.replace(LEADING_MARKER_REGEX, "");
  return stripped
    .replace(new RegExp(escapeRegExp(id), "i"), "")
    .replace(/^[\s:：\-–—、。]+/, "")
    .trim();
}

export function buildCrossRefIdIndex(
  deliverables: ConsistencyDeliverable[],
  options: { idPatterns?: string[]; includeCoverageTargetIds?: boolean } = {}
): CrossRefIdEntry[] {
  const documents = deliverables.map((d) => ({ name: d.name, content: d.content }));
  const occurrences = extractIdOccurrences(documents, {
    idPatterns: options.idPatterns,
    includeCoverageTargetIds: options.includeCoverageTargetIds,
  });

  // レンジ表記（R-01〜R-04 等）の中間IDを参照として補完する
  const rangeOccurrences: TestBasisIdOccurrence[] = [];
  for (const d of deliverables) {
    const lines = d.content.split("\n");
    const headingPerLine = headingsPerLine(d.content);
    const headingLineIndexSet = new Set(parseHeadings(d.content).map((h) => h.lineIndex));
    lines.forEach((line, lineIndex) => {
      const expanded = expandIdRanges(line);
      if (expanded.length === 0) return;
      for (const id of expanded) {
        const already = occurrences.some(
          (o) => o.document === d.name && o.lineIndex === lineIndex && o.id === id
        );
        if (already) continue;
        const dash = id.lastIndexOf("-");
        rangeOccurrences.push({
          id,
          prefix: id.slice(0, dash),
          numberPart: id.slice(dash + 1),
          document: d.name,
          lineIndex,
          heading: headingPerLine[lineIndex] ?? "(見出しなし)",
          lineText: line.trim(),
          role: "reference",
          kind: "requirement",
          isHeadingLine: headingLineIndexSet.has(lineIndex),
        });
      }
    });
  }

  const all = [...occurrences, ...rangeOccurrences];

  const order: string[] = [];
  const byId = new Map<string, TestBasisIdOccurrence[]>();
  for (const occ of all) {
    if (!byId.has(occ.id)) {
      order.push(occ.id);
      byId.set(occ.id, []);
    }
    (byId.get(occ.id) as TestBasisIdOccurrence[]).push(occ);
  }

  return order.map((id) => {
    const occs = byId.get(id) as TestBasisIdOccurrence[];
    const deliverableOrder = uniqueStrings(
      deliverables.map((d) => d.name).filter((name) => occs.some((o) => o.document === name))
    );
    const ownerName = deliverables
      .map((d) => d.name)
      .find((name) => occs.some((o) => o.document === name && o.role === "definition"));

    const statements: CrossRefIdStatement[] = [];
    for (const name of deliverableOrder) {
      const first =
        occs.find((o) => o.document === name && o.role === "definition") ??
        occs.find((o) => o.document === name);
      if (first === undefined) continue;
      const statement = statementOf(first.lineText, id);
      if (statement.length === 0) continue;
      statements.push({
        deliverable: name,
        lineIndex: first.lineIndex,
        heading: first.heading,
        statement,
      });
    }

    return {
      id,
      prefix: occs[0].prefix,
      ...(ownerName === undefined ? {} : { owner: ownerName }),
      deliverables: deliverableOrder,
      references: occs.map((o) => ({
        deliverable: o.document,
        lineIndex: o.lineIndex,
        heading: o.heading,
        lineText: o.lineText,
        role: o.role,
      })),
      statements,
    };
  });
}

/** 検査対象プレフィックス。未指定時は「定義を1件以上持つプレフィックス」。 */
export function resolveCrossRefPrefixes(
  index: CrossRefIdEntry[],
  crossRefIdPrefixes?: string[]
): string[] {
  if (crossRefIdPrefixes !== undefined && crossRefIdPrefixes.length > 0) {
    return uniqueStrings(crossRefIdPrefixes.map((p) => p.replace(/-$/, "")));
  }
  // prefix === "" は接頭辞ベースのID体系ではないため、既定の検査対象プレフィックスから除外する。
  return uniqueStrings(
    index.filter((e) => e.owner !== undefined && e.prefix !== "").map((e) => e.prefix)
  );
}

function inPrefixes(entryOrId: string, prefixes: string[]): boolean {
  const upper = entryOrId.toUpperCase();
  return prefixes.some((p) => {
    const upperPrefix = p.toUpperCase();
    if (upperPrefix.endsWith(":")) return upper.startsWith(upperPrefix);
    return upper.startsWith(`${upperPrefix}-`) || upper === upperPrefix;
  });
}

export function checkUnresolvedCrossRefIds(
  index: CrossRefIdEntry[],
  crossRefIdPrefixes?: string[]
): DeliverableConsistencyFinding[] {
  const prefixes = resolveCrossRefPrefixes(index, crossRefIdPrefixes);
  const findings: DeliverableConsistencyFinding[] = [];
  for (const entry of index) {
    if (entry.owner !== undefined) continue;
    if (!inPrefixes(entry.id, prefixes)) continue;
    findings.push(
      makeFinding({
        checkId: "DCC-06",
        severity: "high",
        subject: entry.id,
        summary: `${entry.id} は ${entry.deliverables.join(" / ")} で参照されているが、投入されたどの成果物にも定義行が存在しない。`,
        places: entry.references.map((r) =>
          makePlace(r.deliverable, r.lineIndex, r.heading, r.lineText)
        ),
        question: `${entry.id} の定義はどの成果物にあるか、または綴り誤りかを確認してください。`,
        assumption: "暫定的に未解決の成果物間参照として扱う。",
      })
    );
  }
  return findings;
}

export function extractCorrespondenceClaims(
  deliverables: ConsistencyDeliverable[],
  index: CrossRefIdEntry[],
  deliverableIndex: DeliverableIndexEntry[],
  crossRefIdPrefixes?: string[],
  options: { includeCoverageTargetIds?: boolean } = {}
): CorrespondenceClaim[] {
  const prefixes = resolveCrossRefPrefixes(index, crossRefIdPrefixes);
  const vocabulary = buildAliasVocabulary(deliverableIndex);
  const claims: CorrespondenceClaim[] = [];

  for (const d of deliverables) {
    const lines = d.content.split("\n");
    const headingPerLine = headingsPerLine(d.content);
    lines.forEach((line, lineIndex) => {
      for (const sentence of splitSentences(line)) {
        if (!CORRESPONDENCE_WORD_REGEX.test(sentence)) continue;
        const target = vocabulary.find(
          (v) => v.deliverable !== null && v.deliverable !== d.name && sentence.includes(v.alias)
        );
        if (target === undefined || target.deliverable === null) continue;

        const ids: string[] = extractIdStringsFromText(sentence, {
          includeCoverageTargetIds: options.includeCoverageTargetIds,
        });
        ids.push(...expandIdRanges(sentence));
        const targetIds = uniqueStrings(ids).filter((id) => inPrefixes(id, prefixes));
        if (targetIds.length === 0) continue;

        claims.push({
          deliverable: d.name,
          lineIndex,
          heading: headingPerLine[lineIndex] ?? "(見出しなし)",
          sentence: makeSnippet(sentence),
          targetDeliverable: target.deliverable,
          ids: targetIds,
        });
      }
    });
  }
  return claims;
}

export function checkCorrespondenceClaims(
  claims: CorrespondenceClaim[],
  index: CrossRefIdEntry[]
): DeliverableConsistencyFinding[] {
  const findings: DeliverableConsistencyFinding[] = [];
  for (const claim of claims) {
    const missing = claim.ids.filter((id) => {
      const entry = index.find((e) => e.id === id);
      if (entry === undefined) return true;
      return !entry.deliverables.includes(claim.targetDeliverable);
    });
    if (missing.length === 0) continue;
    findings.push(
      makeFinding({
        checkId: "DCC-07",
        severity: "high",
        subject: `${claim.deliverable} → ${claim.targetDeliverable}`,
        summary: `${claim.deliverable} が ${claim.targetDeliverable} との対応を主張しているが、主張中のID ${missing.join(
          ", "
        )}（${missing.length}件）は ${claim.targetDeliverable} に1件も出現しない。`,
        places: [makePlace(claim.deliverable, claim.lineIndex, claim.heading, claim.sentence)],
        question: `${claim.targetDeliverable} のどの記述が ${missing.join(", ")} に対応するのかを確認し、参照先へID列を明記してください。`,
        assumption: "暫定的に対応主張の裏付けが欠落しているものとして扱う。",
      })
    );
  }
  return findings;
}

export function checkNeverReferencedIds(
  index: CrossRefIdEntry[],
  deliverableIndex: DeliverableIndexEntry[]
): DeliverableConsistencyFinding[] {
  if (deliverableIndex.length < 2) return [];
  const lastName = deliverableIndex[deliverableIndex.length - 1].name;
  const findings: DeliverableConsistencyFinding[] = [];
  for (const entry of index) {
    if (entry.owner === undefined) continue;
    if (entry.owner === lastName) continue;
    if (entry.deliverables.some((name) => name !== entry.owner)) continue;
    const first = entry.references[0];
    findings.push(
      makeFinding({
        checkId: "DCC-08",
        severity: "medium",
        subject: entry.id,
        summary: `${entry.id} は ${entry.owner} で定義されているが、後続のどの成果物にも1回も現れない。工程間で母集団が縮退している可能性がある。`,
        places: [makePlace(first.deliverable, first.lineIndex, first.heading, first.lineText)],
        question: `${entry.id} を後続成果物で扱わなかったのは意図的かを確認してください。`,
        assumption: "暫定的に後続工程での取りこぼし候補として扱う。",
      })
    );
  }
  return findings;
}

// --- (c) 章節参照（DCC-09〜DCC-11） ---

interface RefSpan {
  start: number;
  end: number;
}

function overlapsSpan(spans: RefSpan[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && s.start < end);
}

function resolveAliasBefore(
  lookback: string,
  vocabulary: AliasVocabularyEntry[],
  selfName: string
): { aliasRaw?: string; target?: string; unresolved: boolean } {
  const trimmed = lookback.replace(/[\s　]{0,2}$/, "");
  for (const word of SELF_REFERENCE_WORDS) {
    if (trimmed.endsWith(word)) return { aliasRaw: word, target: selfName, unresolved: false };
  }
  for (const entry of vocabulary) {
    if (!trimmed.endsWith(entry.alias)) continue;
    if (entry.deliverable === null) return { aliasRaw: entry.alias, unresolved: true };
    return { aliasRaw: entry.alias, target: entry.deliverable, unresolved: false };
  }
  const generic = UNKNOWN_DELIVERABLE_TOKEN_REGEX.exec(trimmed);
  if (generic) return { aliasRaw: generic[1], unresolved: true };
  return { target: selfName, unresolved: false };
}

export function extractSectionReferences(
  deliverables: ConsistencyDeliverable[],
  deliverableIndex: DeliverableIndexEntry[]
): SectionReference[] {
  const vocabulary = buildAliasVocabulary(deliverableIndex);
  const knownAliases = new Set(
    vocabulary.filter((v) => v.deliverable !== null).map((v) => v.alias)
  );
  const results: SectionReference[] = [];
  const seen = new Set<string>();

  for (const d of deliverables) {
    const lines = d.content.split("\n");
    const headingPerLine = headingsPerLine(d.content);
    lines.forEach((line, lineIndex) => {
      const spans: RefSpan[] = [];
      const pending: { start: number; end: number; sectionNo: string }[] = [];

      // レンジ表記（1.1〜1.4 節）は両端のみを参照として登録する
      const rangeRe = /(\d+(?:\.\d+)*)[\s　]{0,2}[〜～~-][\s　]{0,2}(\d+(?:\.\d+)*)[\s　]{0,2}(?:節|章|項)/g;
      let m: RegExpExecArray | null;
      while ((m = rangeRe.exec(line)) !== null) {
        spans.push({ start: m.index, end: m.index + m[0].length });
        pending.push({ start: m.index, end: m.index + m[0].length, sectionNo: m[1] });
        pending.push({ start: m.index, end: m.index + m[0].length, sectionNo: m[2] });
      }

      // 単独の「N.M節」「N章」「N項」
      const singleRe = /(\d+(?:\.\d+){0,3})[\s　]{0,2}(?:節|章|項)/g;
      while ((m = singleRe.exec(line)) !== null) {
        if (overlapsSpan(spans, m.index, m.index + m[0].length)) continue;
        spans.push({ start: m.index, end: m.index + m[0].length });
        pending.push({ start: m.index, end: m.index + m[0].length, sectionNo: m[1] });
      }

      // 呼称直後の「N.M」（節・章・項の語を伴わない形）
      const dottedRe = /(\d+(?:\.\d+)+)/g;
      while ((m = dottedRe.exec(line)) !== null) {
        if (overlapsSpan(spans, m.index, m.index + m[0].length)) continue;
        const lookback = line.slice(Math.max(0, m.index - 24), m.index).replace(/[\s　]{0,2}$/, "");
        const hasKnownAlias =
          SELF_REFERENCE_WORDS.some((w) => lookback.endsWith(w)) ||
          Array.from(knownAliases).some((alias) => lookback.endsWith(alias));
        if (!hasKnownAlias) continue;
        spans.push({ start: m.index, end: m.index + m[0].length });
        pending.push({ start: m.index, end: m.index + m[0].length, sectionNo: m[1] });
      }

      pending.sort((a, b) => (a.start !== b.start ? a.start - b.start : a.sectionNo.localeCompare(b.sectionNo)));
      for (const p of pending) {
        const lookback = line.slice(Math.max(0, p.start - 24), p.start);
        const resolved = resolveAliasBefore(lookback, vocabulary, d.name);
        const after = line.slice(p.end, p.end + 24);
        const labelMatch = /^.{0,2}?[「『]([^」』]{1,20})[」』]/.exec(after);
        const key = `${d.name}::${lineIndex}::${resolved.target ?? resolved.aliasRaw ?? ""}::${p.sectionNo}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          deliverable: d.name,
          lineIndex,
          heading: headingPerLine[lineIndex] ?? "(見出しなし)",
          snippet: makeSnippet(line),
          ...(resolved.aliasRaw === undefined ? {} : { aliasRaw: resolved.aliasRaw }),
          ...(resolved.target === undefined ? {} : { targetDeliverable: resolved.target }),
          sectionNo: p.sectionNo,
          ...(labelMatch === null ? {} : { label: labelMatch[1] }),
        });
      }
    });
  }
  return results;
}

export function checkSectionReferences(
  refs: SectionReference[],
  deliverableIndex: DeliverableIndexEntry[]
): DeliverableConsistencyFinding[] {
  const findings: DeliverableConsistencyFinding[] = [];
  for (const ref of refs) {
    if (ref.targetDeliverable === undefined) {
      findings.push(
        makeFinding({
          checkId: "DCC-11",
          severity: "medium",
          subject: `${ref.aliasRaw ?? "(不明な成果物)"}${ref.sectionNo}`,
          summary: `${ref.deliverable} が「${ref.aliasRaw ?? "(不明な成果物)"}${ref.sectionNo}」を参照しているが、当該成果物が投入されていないため参照を解決できない。`,
          places: [makePlace(ref.deliverable, ref.lineIndex, ref.heading, ref.snippet)],
          question: `参照先「${ref.aliasRaw ?? "(不明な成果物)"}」を投入して再監査するか、呼称を実在する成果物へ揃えてください。`,
          assumption: "暫定的に検査不能な参照として扱い、実在性は未確認のまま残す。",
        })
      );
      continue;
    }

    const target = deliverableIndex.find((e) => e.name === ref.targetDeliverable);
    if (target === undefined || target.headingNos.size === 0) continue;

    if (!target.headingNos.has(ref.sectionNo)) {
      findings.push(
        makeFinding({
          checkId: "DCC-09",
          severity: "high",
          subject: `${ref.targetDeliverable} ${ref.sectionNo}`,
          summary: `${ref.deliverable} が参照している ${ref.targetDeliverable} の ${ref.sectionNo} 節は、参照先の見出し番号に存在しない。`,
          places: [makePlace(ref.deliverable, ref.lineIndex, ref.heading, ref.snippet)],
          question: `${ref.sectionNo} が指していた内容は現在どの節にあるかを確認し、参照番号を修正してください。`,
          assumption: "暫定的に参照先の改番に追随できていない参照として扱う。",
        })
      );
      continue;
    }

    if (ref.label === undefined) continue;
    const heading = target.headingByNo.get(ref.sectionNo) as DeliverableHeadingEntry;
    const bodyText = target.lines.slice(heading.lineIndex, heading.endLineIndex).join("");
    const normalizedLabel = normalizeText(ref.label);
    if (normalizedLabel.length === 0) continue;
    const found =
      normalizeText(heading.titleText).includes(normalizedLabel) ||
      normalizeText(bodyText).includes(normalizedLabel);
    if (found) continue;
    findings.push(
      makeFinding({
        checkId: "DCC-10",
        severity: "medium",
        subject: `${ref.targetDeliverable} ${ref.sectionNo}`,
        summary: `${ref.deliverable} が ${ref.targetDeliverable} ${ref.sectionNo} 節を「${ref.label}」として参照しているが、当該節の見出し（${heading.titleText}）にも本文にもそのラベルが現れない。`,
        places: [makePlace(ref.deliverable, ref.lineIndex, ref.heading, ref.snippet)],
        question: `「${ref.label}」が実際にどの節にあるかを確認し、番号かラベルのどちらかを修正してください。`,
        assumption: "暫定的に番号とラベルのどちらかが古いものとして扱う。",
      })
    );
  }
  return findings;
}

// --- (d) 記述差分（DCC-12・DCC-13） ---

function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + 1 < text.length; i++) set.add(text.slice(i, i + 2));
  return set;
}

function normalizeForBigram(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[、。・（）()「」『』【】：:；;,.\-–—…/|*_"'!?！？+=]/g, "");
}

export function bigramContainmentRatio(a: string, b: string): number {
  const na = normalizeForBigram(a);
  const nb = normalizeForBigram(b);
  const setA = bigrams(na);
  const setB = bigrams(nb);
  if (setA.size === 0 || setB.size === 0) return na === nb ? 1 : 0;
  let shared = 0;
  for (const g of setA) if (setB.has(g)) shared++;
  return shared / Math.min(setA.size, setB.size);
}

function unitValues(text: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  UNIT_VALUE_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = UNIT_VALUE_REGEX.exec(text)) !== null) {
    const unit = m[2];
    if (!map.has(unit)) map.set(unit, []);
    const list = map.get(unit) as string[];
    if (!list.includes(m[1])) list.push(m[1]);
  }
  return map;
}

export function buildIdStatementDiffs(index: CrossRefIdEntry[]): IdStatementDiffRow[] {
  const rows: IdStatementDiffRow[] = [];
  for (const entry of index) {
    if (entry.statements.length < 2) continue;
    const base = entry.statements[0];
    for (let i = 1; i < entry.statements.length; i++) {
      const other = entry.statements[i];
      if (other.deliverable === base.deliverable) continue;
      const unitsA = unitValues(base.statement);
      const unitsB = unitValues(other.statement);
      const unitConflicts: IdStatementDiffRow["unitConflicts"] = [];
      for (const [unit, valuesA] of unitsA) {
        const valuesB = unitsB.get(unit);
        if (valuesB === undefined) continue;
        const sortedA = [...valuesA].sort();
        const sortedB = [...valuesB].sort();
        if (sortedA.join(",") === sortedB.join(",")) continue;
        unitConflicts.push({ unit, valuesA: sortedA, valuesB: sortedB });
      }
      rows.push({
        id: entry.id,
        a: base,
        b: other,
        unitConflicts,
        bigramRatio: bigramContainmentRatio(base.statement, other.statement),
      });
    }
  }
  return rows;
}

export function checkIdStatementDiffs(rows: IdStatementDiffRow[]): DeliverableConsistencyFinding[] {
  const findings: DeliverableConsistencyFinding[] = [];
  for (const row of rows) {
    const places = [
      makePlace(row.a.deliverable, row.a.lineIndex, row.a.heading, row.a.statement),
      makePlace(row.b.deliverable, row.b.lineIndex, row.b.heading, row.b.statement),
    ];
    for (const conflict of row.unitConflicts) {
      findings.push(
        makeFinding({
          checkId: "DCC-12",
          severity: "high",
          subject: `${row.id} / ${conflict.unit}`,
          summary: `${row.id} の記述で単位「${conflict.unit}」の値が成果物間で異なる（${row.a.deliverable}: ${conflict.valuesA.join(
            " / "
          )} vs ${row.b.deliverable}: ${conflict.valuesB.join(" / ")}）。`,
          places,
          question: `${row.id} の「${conflict.unit}」の正しい値をテストベースで確認し、誤っている側を修正してください。`,
          assumption: `暫定的に先に出現した ${row.a.deliverable} の値を正として扱う。`,
        })
      );
    }
    if (row.bigramRatio < BIGRAM_CONTAINMENT_THRESHOLD) {
      findings.push(
        makeFinding({
          checkId: "DCC-13",
          severity: "medium",
          subject: row.id,
          summary: `${row.id} の記述文言が成果物間で乖離している（2-gram 包含率 ${row.bigramRatio.toFixed(
            2
          )} < ${BIGRAM_CONTAINMENT_THRESHOLD}）。`,
          places,
          question: `${row.id} が両成果物で同じ対象を指しているかを確認してください。別対象であればIDを分けてください。`,
          assumption: "暫定的に同一対象への言及とみなし、記述の統一が必要な候補として扱う。",
        })
      );
    }
  }
  return findings;
}

// --- (d) 件数・網羅率の宣言と実体（DCC-15〜DCC-17） ---

interface ResolvedCountClaimSubject {
  keyword: string;
  prefixCandidates: string[];
  source: "input" | "default";
}

function longestKeyword<T extends { keyword: string }>(items: T[]): T {
  return items.reduce((a, b) => (b.keyword.length > a.keyword.length ? b : a));
}

/**
 * 網羅率宣言（ratio / bare-percent）の主語を解決する。
 * 表行では列挙値のセルと主語ラベルのセルが分かれるため、キーワード一致は
 * セル単位ではなく行全体（line）と見出し（heading）に対して行う。
 */
function resolveCountClaimSubject(
  line: string,
  heading: string,
  countClaimSubjects: DeliverableCountClaimSubject[] | undefined,
  criteria: DeliverableConsistencyCriteria
): ResolvedCountClaimSubject | undefined {
  const inputSubjects = countClaimSubjects ?? [];

  const stage1 = inputSubjects.filter((s) => line.includes(s.keyword));
  if (stage1.length > 0) {
    const picked = longestKeyword(stage1);
    return {
      keyword: picked.keyword,
      prefixCandidates: [picked.idPrefix.replace(/-$/, "")],
      source: "input",
    };
  }
  const stage2 = inputSubjects.filter((s) => heading.includes(s.keyword));
  if (stage2.length > 0) {
    const picked = longestKeyword(stage2);
    return {
      keyword: picked.keyword,
      prefixCandidates: [picked.idPrefix.replace(/-$/, "")],
      source: "input",
    };
  }

  const defaults = criteria.countClaimSubjectDefaults;
  const stage3 = defaults.filter((s) => line.includes(s.keyword));
  if (stage3.length > 0) {
    const picked = longestKeyword(stage3);
    return { keyword: picked.keyword, prefixCandidates: picked.idPrefixCandidates, source: "default" };
  }
  const stage4 = defaults.filter((s) => heading.includes(s.keyword));
  if (stage4.length > 0) {
    const picked = longestKeyword(stage4);
    return { keyword: picked.keyword, prefixCandidates: picked.idPrefixCandidates, source: "default" };
  }

  return undefined;
}

export function extractCountClaims(
  deliverables: ConsistencyDeliverable[],
  options: {
    idPatterns?: string[];
    countClaimSubjects?: DeliverableCountClaimSubject[];
    criteria?: DeliverableConsistencyCriteria;
    includeCoverageTargetIds?: boolean;
  } = {}
): CountClaim[] {
  const criteria = options.criteria ?? deliverableConsistencyCriteria;
  const claims: CountClaim[] = [];

  for (const d of deliverables) {
    const lines = d.content.split("\n");
    const headingPerLine = headingsPerLine(d.content);
    lines.forEach((line, lineIndex) => {
      const heading = headingPerLine[lineIndex] ?? "(見出しなし)";
      for (const segment of segmentsOf(line)) {
        const countMatches = Array.from(segment.matchAll(/(\d+)\s*件/g));

        // (i) 件数宣言と同一セル内のID列挙
        if (countMatches.length === 1) {
          const ids: string[] = extractIdStringsFromText(segment, {
            idPatterns: options.idPatterns,
            includeCoverageTargetIds: options.includeCoverageTargetIds,
          });
          ids.push(...expandIdRanges(segment));
          const uniqueIds = uniqueStrings(ids);
          if (uniqueIds.length > 0) {
            claims.push({
              kind: "id-enumeration",
              deliverable: d.name,
              lineIndex,
              heading,
              snippet: makeSnippet(segment),
              declaredCount: Number(countMatches[0][1]),
              ids: uniqueIds,
            });
          }
        }

        // (ii) 網羅率宣言（分子/分母と併記された率）
        const ratioMatches = Array.from(segment.matchAll(/(\d+)\s*\/\s*(\d+)/g));
        const percentMatches = Array.from(segment.matchAll(/(\d+(?:\.\d+)?)\s*%/g));
        if (ratioMatches.length === 1 && percentMatches.length === 1) {
          const resolved = resolveCountClaimSubject(line, heading, options.countClaimSubjects, criteria);
          claims.push({
            kind: "ratio",
            deliverable: d.name,
            lineIndex,
            heading,
            snippet: makeSnippet(segment),
            numerator: Number(ratioMatches[0][1]),
            denominator: Number(ratioMatches[0][2]),
            percent: Number(percentMatches[0][1]),
            ...(resolved !== undefined
              ? {
                  subjectKeyword: resolved.keyword,
                  subjectPrefixCandidates: resolved.prefixCandidates,
                  subjectSource: resolved.source,
                }
              : {}),
          });
        }

        // (iii) 指定キーワードごとの件数宣言
        for (const subject of options.countClaimSubjects ?? []) {
          if (!segment.includes(subject.keyword)) continue;
          if (countMatches.length !== 1) continue;
          claims.push({
            kind: "subject",
            deliverable: d.name,
            lineIndex,
            heading,
            snippet: makeSnippet(segment),
            declaredCount: Number(countMatches[0][1]),
            keyword: subject.keyword,
          });
        }

        // (iv) 分子分母を伴わない達成度%の主張
        if (
          percentMatches.length >= 1 &&
          ratioMatches.length === 0 &&
          !/\d+\s*件中\s*\d+\s*件/.test(segment) &&
          !/\d+\s*分の\s*\d+/.test(segment)
        ) {
          const achievementMatches = criteria.achievementRatioKeywords.filter(
            (k) => line.includes(k) || heading.includes(k)
          );
          const excluded = criteria.achievementRatioExclusionWords.some((w) => segment.includes(w));
          if (achievementMatches.length > 0 && !excluded) {
            const achievementKeyword = achievementMatches.reduce((a, b) =>
              b.length > a.length ? b : a
            );
            const resolved = resolveCountClaimSubject(line, heading, options.countClaimSubjects, criteria);
            claims.push({
              kind: "bare-percent",
              deliverable: d.name,
              lineIndex,
              heading,
              snippet: makeSnippet(segment),
              percent: Number(percentMatches[0][1]),
              achievementKeyword,
              ...(resolved !== undefined
                ? {
                    subjectKeyword: resolved.keyword,
                    subjectPrefixCandidates: resolved.prefixCandidates,
                    subjectSource: resolved.source,
                  }
                : {}),
            });
          }
        }
      }
    });
  }
  return claims;
}

export function checkCountClaims(
  claims: CountClaim[],
  index: CrossRefIdEntry[],
  countClaimSubjects: DeliverableCountClaimSubject[] | undefined,
  criteria: DeliverableConsistencyCriteria = deliverableConsistencyCriteria
): DeliverableConsistencyFinding[] {
  const findings: DeliverableConsistencyFinding[] = [];

  for (const claim of claims) {
    const place = makePlace(claim.deliverable, claim.lineIndex, claim.heading, claim.snippet);

    if (claim.kind === "id-enumeration") {
      const ids = claim.ids ?? [];
      const declared = claim.declaredCount ?? 0;
      if (ids.length === declared) continue;
      findings.push(
        makeFinding({
          checkId: "DCC-15",
          severity: "high",
          subject: `${claim.deliverable} ${claim.lineIndex + 1}行 件数宣言`,
          summary: `「${declared}件」と宣言されているが、同一箇所に列挙されているIDは ${ids.length} 件である（${ids.join(
            ", "
          )}）。`,
          places: [place],
          question: `宣言件数 ${declared} と列挙 ${ids.length} 件のどちらが実態かを確認し、不足しているIDを補うか宣言値を修正してください。`,
          assumption: "暫定的に列挙されたIDの実数を実体として扱う。",
        })
      );
      continue;
    }

    if (claim.kind === "ratio") {
      const numerator = claim.numerator ?? 0;
      const denominator = claim.denominator ?? 0;
      const percent = claim.percent ?? 0;
      if (denominator <= 0) continue;

      const expected = Math.round((numerator / denominator) * 1000) / 10;
      if (Math.abs(expected - percent) >= 0.05) {
        findings.push(
          makeFinding({
            checkId: "DCC-15",
            severity: "high",
            subject: `${claim.deliverable} ${claim.lineIndex + 1}行 網羅率宣言`,
            summary: `網羅率宣言 ${numerator}/${denominator} に併記された ${percent}% が、分子分母から算出した ${expected}% と一致しない。`,
            places: [place],
            question: `分子・分母・率のどれが誤っているかを確認してください。`,
            assumption: "暫定的に分子分母から算出した率を実体として扱う。",
          })
        );
      }

      if (numerator > denominator) {
        findings.push(
          makeFinding({
            checkId: "DCC-15",
            severity: "high",
            subject: `${claim.deliverable} ${claim.lineIndex + 1}行 網羅率宣言`,
            summary: `網羅率宣言 ${numerator}/${denominator} は分子が分母を超えており、率として成立しない。`,
            places: [place],
            question: `分子・分母のどちらが誤っているかを確認してください。`,
            assumption: "暫定的に分子が分母を超えている宣言を誤りとして扱う。",
          })
        );
      }

      const candidates = claim.subjectPrefixCandidates ?? [];
      if (candidates.length > 0) {
        const matchedCandidates = candidates.filter(
          (candidate) =>
            index.filter(
              (e) => e.owner !== undefined && e.prefix.toUpperCase() === candidate.toUpperCase()
            ).length > 0
        );
        if (matchedCandidates.length === 1) {
          const prefix = matchedCandidates[0];
          const actual = index.filter(
            (e) => e.owner !== undefined && e.prefix.toUpperCase() === prefix.toUpperCase()
          ).length;
          if (actual !== denominator) {
            findings.push(
              makeFinding({
                checkId: "DCC-16",
                severity: "high",
                subject: `${claim.deliverable} ${claim.lineIndex + 1}行 網羅率母集団`,
                summary: `網羅率宣言 ${numerator}/${denominator}（${percent}%）の分母 ${denominator} が、「${claim.subjectKeyword}」に対応するプレフィックス「${prefix}」で本文に定義されているIDの実数 ${actual} 件と一致しない。母集団の縮小による見かけの網羅率である可能性がある。`,
                places: [place],
                question: `分母 ${denominator} が母集団の全件かを確認してください。除外した対象があるなら除外IDと除外理由を明記し、無いなら分母を ${actual} として率を再計算してください。`,
                assumption: "暫定的に本文で定義されたIDの実数を母集団として扱う。",
              })
            );
          }
        }
      }

      continue;
    }

    if (claim.kind === "bare-percent") {
      const percent = claim.percent ?? 0;
      const suffix = claim.subjectKeyword !== undefined ? `（主語: ${claim.subjectKeyword}）` : "";
      findings.push(
        makeFinding({
          checkId: "DCC-17",
          severity: "medium",
          subject: `${claim.deliverable} ${claim.lineIndex + 1}行 達成度宣言`,
          summary: `「${claim.achievementKeyword}」として ${percent}% が示されているが、同一箇所に分子・分母（N/M）が併記されておらず、数値の根拠を検査できない。${suffix}`,
          places: [place],
          question: `${percent}% の分子と分母を明記してください。分母は本文で定義された母集団の実数と一致している必要があります。`,
          assumption: "暫定的に根拠未記載の達成度主張として扱い、達成度の裏付けが無いものとみなす。",
        })
      );
      continue;
    }

    // kind === "subject"
    const subject = (countClaimSubjects ?? []).find((s) => s.keyword === claim.keyword);
    if (subject === undefined) continue;
    const prefix = subject.idPrefix.replace(/-$/, "");
    const actualIds = index.filter(
      (e) => e.owner !== undefined && e.prefix.toUpperCase() === prefix.toUpperCase()
    );
    const declared = claim.declaredCount ?? 0;
    if (actualIds.length === declared) continue;
    findings.push(
      makeFinding({
        checkId: "DCC-15",
        severity: "high",
        subject: `${claim.keyword ?? ""} 件数宣言`,
        summary: `${claim.deliverable} が「${claim.keyword}」について ${declared}件と宣言しているが、プレフィックス「${prefix}」で定義されているIDは ${actualIds.length} 件である。`,
        places: [place],
        question: `「${claim.keyword}」の件数宣言と本文の定義実数のどちらが正しいかを確認してください。`,
        assumption: "暫定的に本文の定義実数を実体として扱う。",
      })
    );
  }

  // (iv) 同一キーワードについて成果物間で異なる件数宣言
  const subjectClaims = claims.filter((c) => c.kind === "subject");
  const keywordOrder = uniqueStrings(subjectClaims.map((c) => c.keyword ?? ""));
  for (const keyword of keywordOrder) {
    const list = subjectClaims.filter((c) => c.keyword === keyword);
    const distinctDeliverables = uniqueStrings(list.map((c) => c.deliverable));
    if (distinctDeliverables.length < 2) continue;
    const distinctCounts = uniqueStrings(list.map((c) => String(c.declaredCount ?? 0)));
    if (distinctCounts.length < 2) continue;
    findings.push(
      makeFinding({
        checkId: "DCC-15",
        severity: "high",
        subject: `${keyword} 成果物間件数宣言`,
        summary: `「${keyword}」の件数宣言が成果物間で異なる（${list
          .map((c) => `${c.deliverable}: ${c.declaredCount}件`)
          .join(" / ")}）。`,
        places: list.map((c) => makePlace(c.deliverable, c.lineIndex, c.heading, c.snippet)),
        question: `「${keyword}」の正しい件数を確認し、成果物間で揃えてください。`,
        assumption: "暫定的に最初に出現した宣言件数を正として扱う。",
      })
    );
  }

  return findings;
}

// --- (d) 共通項目（DCC-14） ---

function normalizeSharedItemKey(itemText: string): string {
  let text = itemText.normalize("NFKC");
  const colon = text.search(/[:：]/);
  if (colon > 0) text = text.slice(0, colon);
  text = text.replace(/[（(][^）)]*[）)]/g, "");
  text = text.replace(/\*\*/g, "").replace(/[「」『』]/g, "");
  text = text.replace(/(等|など)\s*$/, "");
  text = text.replace(/[\s　]+/g, "");
  return text.slice(0, 20);
}

function extractItemText(line: string): string | undefined {
  const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
  if (bullet) return bullet[1].trim();
  if (isTableRow(line)) {
    const cells = tableCells(line);
    if (cells.length === 0) return undefined;
    return cells[0];
  }
  return undefined;
}

export function extractSharedItems(
  deliverables: ConsistencyDeliverable[],
  criteria: DeliverableConsistencyCriteria = deliverableConsistencyCriteria,
  sharedItemKindIds?: string[]
): SharedItemOccurrence[] {
  const kinds =
    sharedItemKindIds === undefined || sharedItemKindIds.length === 0
      ? criteria.sharedItemKinds
      : criteria.sharedItemKinds.filter((k) => sharedItemKindIds.includes(k.id));

  const results: SharedItemOccurrence[] = [];
  for (const d of deliverables) {
    const lines = d.content.split("\n");
    const headingPerLine = headingsPerLine(d.content);
    lines.forEach((line, lineIndex) => {
      const heading = headingPerLine[lineIndex] ?? "(見出しなし)";
      const itemText = extractItemText(line);
      if (itemText === undefined || itemText.length === 0) return;
      for (const kind of kinds) {
        const inHeading = kind.headingKeywords.some((k) => heading.includes(k));
        const inBody = kind.bodyKeywords.some((k) => line.includes(k));
        if (!inHeading && !inBody) continue;
        const normalizedKey = normalizeSharedItemKey(itemText);
        if (normalizedKey.length < 2) continue;
        results.push({
          kindId: kind.id,
          kindLabel: kind.label,
          deliverable: d.name,
          lineIndex,
          heading,
          itemText: makeSnippet(itemText),
          normalizedKey,
        });
      }
    });
  }
  return results;
}

export function checkSharedItemGaps(
  items: SharedItemOccurrence[],
  deliverables: ConsistencyDeliverable[]
): DeliverableConsistencyFinding[] {
  if (deliverables.length < 2) return [];
  const findings: DeliverableConsistencyFinding[] = [];
  const kindOrder = uniqueStrings(items.map((i) => i.kindId));

  for (const kindId of kindOrder) {
    const kindItems = items.filter((i) => i.kindId === kindId);
    const names = deliverables.map((d) => d.name).filter((name) => kindItems.some((i) => i.deliverable === name));
    if (names.length < 2) continue;

    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const itemsA = kindItems.filter((i) => i.deliverable === names[a]);
        const itemsB = kindItems.filter((i) => i.deliverable === names[b]);
        const missing = (
          from: SharedItemOccurrence[],
          to: SharedItemOccurrence[],
          fromName: string,
          toName: string
        ): void => {
          const seen = new Set<string>();
          for (const item of from) {
            if (seen.has(item.normalizedKey)) continue;
            seen.add(item.normalizedKey);
            const matched = to.some(
              (other) =>
                other.normalizedKey === item.normalizedKey ||
                other.normalizedKey.includes(item.normalizedKey) ||
                item.normalizedKey.includes(other.normalizedKey)
            );
            if (matched) continue;
            findings.push(
              makeFinding({
                checkId: "DCC-14",
                severity: "medium",
                subject: `${item.kindLabel} / ${item.normalizedKey}`,
                summary: `共通項目「${item.kindLabel}」の列挙のうち「${item.itemText}」は ${fromName} にしか現れず、${toName} には対応する項目が無い。`,
                places: [makePlace(item.deliverable, item.lineIndex, item.heading, item.itemText)],
                question: `「${item.itemText}」を ${toName} へ引き継がなかったのは意図的かを確認してください。`,
                assumption: "暫定的に工程間の引き継ぎ漏れ候補として扱う。",
              })
            );
          }
        };
        missing(itemsA, itemsB, names[a], names[b]);
        missing(itemsB, itemsA, names[b], names[a]);
      }
    }
  }
  return findings;
}

// --- 集約 ---

export interface DeliverableConsistencyAnalysis {
  deliverableIndex: DeliverableIndexEntry[];
  referencedOccurrences: ReferencedDocumentOccurrence[];
  referencedRows: ReferencedDocumentRow[];
  crossRefIndex: CrossRefIdEntry[];
  crossRefPrefixes: string[];
  correspondenceClaims: CorrespondenceClaim[];
  sectionReferences: SectionReference[];
  statementDiffs: IdStatementDiffRow[];
  countClaims: CountClaim[];
  sharedItems: SharedItemOccurrence[];
  findings: DeliverableConsistencyFinding[];
  summary: DeliverableConsistencySummary;
}

export function analyzeDeliverableConsistency(
  input: AuditDeliverableConsistencyInput,
  criteria: DeliverableConsistencyCriteria = deliverableConsistencyCriteria
): DeliverableConsistencyAnalysis {
  const deliverables = input.deliverables;
  const deliverableIndex = buildDeliverableIndex(deliverables);

  const referencedOccurrences = extractReferencedDocuments(deliverables, criteria);
  const referencedRows = buildReferencedDocumentMatrix(referencedOccurrences, deliverables);

  const idOccurrences = extractIdOccurrences(
    deliverables.map((d) => ({ name: d.name, content: d.content })),
    { idPatterns: input.idPatterns, includeCoverageTargetIds: input.includeCoverageTargetIds }
  );
  const crossRefIndex = buildCrossRefIdIndex(deliverables, {
    idPatterns: input.idPatterns,
    includeCoverageTargetIds: input.includeCoverageTargetIds,
  });
  const crossRefPrefixes = resolveCrossRefPrefixes(crossRefIndex, input.crossRefIdPrefixes);

  const correspondenceClaims = extractCorrespondenceClaims(
    deliverables,
    crossRefIndex,
    deliverableIndex,
    input.crossRefIdPrefixes,
    { includeCoverageTargetIds: input.includeCoverageTargetIds }
  );
  const sectionReferences = extractSectionReferences(deliverables, deliverableIndex);
  const statementDiffs = buildIdStatementDiffs(crossRefIndex);
  const countClaims = extractCountClaims(deliverables, {
    idPatterns: input.idPatterns,
    countClaimSubjects: input.countClaimSubjects,
    criteria,
    includeCoverageTargetIds: input.includeCoverageTargetIds,
  });
  const sharedItems = extractSharedItems(deliverables, criteria, input.sharedItemKindIds);

  const findings = assignFindingNumbers([
    ...checkReferencedDocumentConflicts(referencedRows),
    ...reconcileDeclaredReferencedDocuments(referencedRows, input.declaredReferencedDocuments),
    ...checkUnreadDocumentIdUsage(referencedRows, idOccurrences, input.idPrefixOwners),
    ...checkUnresolvedCrossRefIds(crossRefIndex, input.crossRefIdPrefixes),
    ...checkCorrespondenceClaims(correspondenceClaims, crossRefIndex),
    ...checkNeverReferencedIds(crossRefIndex, deliverableIndex),
    ...checkSectionReferences(sectionReferences, deliverableIndex),
    ...checkIdStatementDiffs(statementDiffs),
    ...checkCountClaims(countClaims, crossRefIndex, input.countClaimSubjects, criteria),
    ...checkSharedItemGaps(sharedItems, deliverables),
  ]);

  const summary = summarizeDeliverableConsistency(findings, {
    deliverableCount: deliverables.length,
    referencedDocumentCount: referencedRows.length,
    crossRefIdCount: crossRefIndex.length,
    sectionReferenceCount: sectionReferences.length,
  });

  return {
    deliverableIndex,
    referencedOccurrences,
    referencedRows,
    crossRefIndex,
    crossRefPrefixes,
    correspondenceClaims,
    sectionReferences,
    statementDiffs,
    countClaims,
    sharedItems,
    findings,
    summary,
  };
}

export function buildDeliverableConsistencyFindings(
  input: AuditDeliverableConsistencyInput,
  criteria: DeliverableConsistencyCriteria = deliverableConsistencyCriteria
): DeliverableConsistencyFinding[] {
  return analyzeDeliverableConsistency(input, criteria).findings;
}

export function summarizeDeliverableConsistency(
  findings: DeliverableConsistencyFinding[],
  counts: {
    deliverableCount: number;
    referencedDocumentCount: number;
    crossRefIdCount: number;
    sectionReferenceCount: number;
  }
): DeliverableConsistencySummary {
  const byCheckId: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const f of findings) {
    byCheckId[f.checkId] = (byCheckId[f.checkId] ?? 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  }
  return {
    deliverableCount: counts.deliverableCount,
    referencedDocumentCount: counts.referencedDocumentCount,
    crossRefIdCount: counts.crossRefIdCount,
    sectionReferenceCount: counts.sectionReferenceCount,
    byCheckId,
    bySeverity,
    totalFindings: findings.length,
    highFindings: findings.filter((f) => f.severity === "high").length,
  };
}
