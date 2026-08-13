import { z } from "zod";
import { sanitizeTestBasisDocuments } from "./documentDigest.js";
import { normalizeForGrounding } from "./groundingNormalization.js";
import type {
  TestBasisDocument,
  TestBasisGroundingCriterion,
  TestBasisGroundingKind,
  TestBasisGroundingSubject,
  UngroundedTestBasisSubject,
} from "./types.js";

// design_* 系ツールが共有する「宣言した文言・IDがテストベース本文に実在するか」の照合エンジン。
// すべて純関数で、例外を投げず、乱数・現在時刻を使わず、入力を破壊せず、
// 出力順は入力順で決定的に定まる。
//
// 設計方針:
//  - 正規化規則は src/groundingNormalization.ts、入力サニタイズは src/documentDigest.ts が正本であり、
//    ここでは一切再実装しない。括弧引用の抽出（extractQuotedStrings）は従来 testCaseAnalysis.ts にあったが、
//    design_* 系ツールとの循環 import を避けるため実装を本モジュール（葉）へ移し、
//    testCaseAnalysis.ts は本モジュールからの re-export で従来の公開名を維持している（実装は1つだけ）。
//  - 判定区分IDは 8 個のツール別 resource カタログへ分散させず、
//    src/handoverPayload.ts の HPO-xx と同じ方式で本モジュールの定数として共有系列を持つ。
//  - 自由記述文そのものは逐語照合せず、鍵括弧で囲んだ引用文言だけを照合する。

export { sanitizeTestBasisDocuments };

const QUOTE_PATTERN_SOURCES = [
  "「([^」]{1,200})」",
  "『([^』]{1,200})』",
  "“([^”]{1,200})”",
  '"([^"]{1,200})"',
];

/** 括弧（「」『』“”""）で囲まれた引用文言を出現順に抽出する（入れ子は扱わない）。 */
export function extractQuotedStrings(text: string): string[] {
  const hits: { index: number; value: string }[] = [];
  for (const source of QUOTE_PATTERN_SOURCES) {
    const regex = new RegExp(source, "g");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      hits.push({ index: m.index, value: m[1] });
      if (m[0].length === 0) regex.lastIndex++;
    }
  }
  return hits.sort((a, b) => a.index - b.index).map((h) => h.value);
}

/**
 * 照合対象とする最小長（正規化後の文字数）。
 * crossMatrixAnalysis.ts の MIN_LINK_EVIDENCE_LENGTH と同値。1文字の語は
 * 正規化後コーパスへほぼ確実に含まれてしまい、照合が意味を持たないため同じ下限を使う。
 */
export const MIN_TESTBASIS_GROUNDING_LENGTH = 2;

export const testBasisDocumentsInputShape = {
  testBasisDocuments: z
    .array(
      z.object({
        name: z.string().describe("Document name or file name of the test basis document"),
        content: z
          .string()
          .describe("Full text of the document (any format; caller converts binaries to text)"),
      })
    )
    .optional()
    .describe(
      "Test basis documents used to verify that declared labels (factor names, level values, state names, etc.), " +
        "quoted wordings and referenced ids really exist in the test basis. " +
        "Pass the full text: passing only excerpts makes existing wordings be reported as ungrounded. " +
        "When omitted, the grounding check is reported as not inspectable instead of passing silently."
    ),
} as const;

const NORMALIZATION_NOTE =
  "照合は表記差(全角半角・大文字小文字・空白・記号)を吸収した正規化後の包含判定で行う。";

/**
 * テストベース実在照合の判定区分カタログ。
 * MCP resource としては公開せず、本モジュールの定数として保持する
 * （同一の検査に対してツールごとに別IDを作らないため）。
 */
export const testBasisGroundingCriteria: readonly TestBasisGroundingCriterion[] = [
  {
    id: "TBG-01",
    nameJa: "テストベース本文に実在しないラベル",
    severity: "high",
    definition:
      "宣言した短い名詞句（因子名・水準値・状態名・アクター名・コンテナ名等）が、投入されたテストベース本文に見つからない。" +
      NORMALIZATION_NOTE,
    recommendedAction:
      "テストベース本文の実文言へ書き換えるか、テストベース側に定義が無いことを確認して当該ラベルを削除する。捏造したラベルのまま下流へ渡してはならない。",
  },
  {
    id: "TBG-02",
    nameJa: "テストベース本文に実在しない引用文言",
    severity: "high",
    definition:
      "自由記述フィールド中の鍵括弧(「」『』“”\"\")で囲んだ引用文言が、投入されたテストベース本文に見つからない。" +
      NORMALIZATION_NOTE,
    recommendedAction:
      "引用箇所をテストベース本文の実文言へ修正する。要約・言い換えを引用として書いてはならない。",
  },
  {
    id: "TBG-03",
    nameJa: "テストベース本文に実在しないID",
    severity: "high",
    definition:
      "明示的に参照した外部ID（機能ID・要件ID等）が、投入されたテストベース本文に見つからない。" +
      "入力内部で採番されるID（ケースID・コンテナID・因子ID・内部カタログID等）は対象外。" +
      NORMALIZATION_NOTE,
    recommendedAction:
      "テストベース本文で定義されている実IDへ修正する。母集団宣言そのものが誤っている場合は宣言を正す。",
  },
  {
    id: "TBG-04",
    nameJa: "投入文書に存在しない出典文書名",
    severity: "medium",
    definition:
      "根拠位置として宣言した出典文書名が、投入された testBasisDocuments[].name のいずれとも一致しない。" +
      NORMALIZATION_NOTE,
    recommendedAction:
      "当該文書を testBasisDocuments へ投入するか、出典文書名を投入した文書名と一致させる。",
  },
] as const;

/** 判定区分ID → 判定区分定義。 */
export const testBasisGroundingCriterionById: Record<string, TestBasisGroundingCriterion> =
  Object.fromEntries(testBasisGroundingCriteria.map((c) => [c.id, c]));

/** 照合種別 → 判定区分ID。 */
export const TESTBASIS_GROUNDING_CATEGORY_BY_KIND: Record<TestBasisGroundingKind, string> = {
  label: "TBG-01",
  quotation: "TBG-02",
  id: "TBG-03",
  documentName: "TBG-04",
};

const KIND_LABEL: Record<TestBasisGroundingKind, string> = {
  label: "ラベル",
  quotation: "引用",
  id: "ID",
  documentName: "文書名",
};

export interface ExpandedTestBasisGroundingSubject extends TestBasisGroundingSubject {
  /** normalizeForGrounding() を適用した照合キー */
  normalized: string;
}

export interface TestBasisGroundingExpansion {
  /** 照合対象（重複除去済み・入力順） */
  subjects: ExpandedTestBasisGroundingSubject[];
  /** 正規化後 MIN_TESTBASIS_GROUNDING_LENGTH 未満で照合対象外になったもの */
  skipped: ExpandedTestBasisGroundingSubject[];
}

export interface TestBasisCorpus {
  /** 全文書の content を連結して正規化した本文コーパス */
  corpus: string;
  /** 文書名を正規化した集合 */
  documentNames: Set<string>;
  /** 投入文書件数 */
  documentCount: number;
  /** 投入文書の合計文字数（サニタイズ後の content） */
  charTotal: number;
}

/** 投入文書から照合用コーパス（本文・文書名集合）を組み立てる。 */
export function buildTestBasisCorpus(documents?: readonly TestBasisDocument[]): TestBasisCorpus {
  const docs = documents ?? [];
  return {
    corpus: normalizeForGrounding(docs.map((d) => d.content).join("\n")),
    documentNames: new Set(
      docs.map((d) => normalizeForGrounding(d.name)).filter((n) => n.length > 0)
    ),
    documentCount: docs.length,
    charTotal: docs.reduce((sum, d) => sum + d.content.length, 0),
  };
}

/**
 * 照合対象の生の申告を、照合キー付きの subject 列へ展開する。
 * `quotation` は鍵括弧で囲まれた引用ごとに分解し、それ以外の kind はそのまま1件として扱う。
 * (kind, 正規化後テキスト) で重複除去し、初出の place / target / fieldLabel を残す。
 */
export function expandGroundingSubjects(
  subjects: readonly TestBasisGroundingSubject[]
): TestBasisGroundingExpansion {
  const accepted: ExpandedTestBasisGroundingSubject[] = [];
  const skipped: ExpandedTestBasisGroundingSubject[] = [];
  const seen = new Set<string>();

  const push = (subject: TestBasisGroundingSubject, text: string): void => {
    const normalized = normalizeForGrounding(text);
    const key = `${subject.kind}\t${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    const expanded: ExpandedTestBasisGroundingSubject = { ...subject, text, normalized };
    if (normalized.length < MIN_TESTBASIS_GROUNDING_LENGTH) skipped.push(expanded);
    else accepted.push(expanded);
  };

  for (const subject of subjects) {
    if (typeof subject.text !== "string") continue;
    if (subject.kind === "quotation") {
      // 自由記述文そのものは逐語照合しない。鍵括弧で囲んだ引用だけを対象にする。
      for (const quoted of extractQuotedStrings(subject.text)) push(subject, quoted);
      continue;
    }
    push(subject, subject.text);
  }

  return { subjects: accepted, skipped };
}

function detailFor(kind: TestBasisGroundingKind, text: string): string {
  switch (kind) {
    case "quotation":
      return `「${text}」がテストベース本文に見つからない。要約・言い換えではなくテストベースの実文言へ修正すること。`;
    case "id":
      return `「${text}」がテストベース本文に見つからない。テストベースの実IDへ修正すること。`;
    case "documentName":
      return `「${text}」が投入された testBasisDocuments[].name に存在しない。当該文書を投入するか文書名を一致させること。`;
    default:
      return `「${text}」がテストベース本文に見つからない。テストベースの実文言へ修正すること。`;
  }
}

/**
 * 投入されたテストベースに裏付けの無い subject を返す。
 * documents が未指定または0件なら、無言合格を避けるため何も報告しない（呼び出し側が「検査不能」として扱う）。
 */
export function findUngroundedSubjects(
  subjects: readonly TestBasisGroundingSubject[],
  documents?: readonly TestBasisDocument[]
): UngroundedTestBasisSubject[] {
  if (!documents || documents.length === 0) return [];
  const basis = buildTestBasisCorpus(documents);
  const { subjects: expanded } = expandGroundingSubjects(subjects);
  const result: UngroundedTestBasisSubject[] = [];
  for (const subject of expanded) {
    const grounded =
      subject.kind === "documentName"
        ? basis.documentNames.has(subject.normalized)
        : basis.corpus.includes(subject.normalized);
    if (grounded) continue;
    const criterion = testBasisGroundingCriterionById[
      TESTBASIS_GROUNDING_CATEGORY_BY_KIND[subject.kind]
    ];
    result.push({
      categoryId: criterion.id,
      severity: criterion.severity,
      kind: subject.kind,
      place: subject.place,
      target: subject.target,
      fieldLabel: subject.fieldLabel,
      text: subject.text,
      detail: detailFor(subject.kind, subject.text),
    });
  }
  return result;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

export const TESTBASIS_GROUNDING_UNINSPECTABLE_LINE =
  "- testBasisDocuments が未指定のため、宣言したラベル(因子名・水準値・状態名等)・引用文言・IDの実在照合は実施していない(要確認)。" +
  "指摘0件は合格を意味しない。実施するには testBasisDocuments へテストベース全文を渡すこと。";

const QUOTATION_SCOPE_LINE =
  "- 自由記述文は逐語照合せず、鍵括弧(「」『』“”\"\")で囲んだ引用文言のみを照合対象とする。" +
  "括弧引用が無い自由記述は照合対象0件であり、合格を意味しない。";

/**
 * 「テストベースとの実在照合」節を行群として返す（末尾に改行は含まない）。
 * heading には `## 9. テストベースとの実在照合` のような見出し行をそのまま渡す。
 */
export function renderTestBasisGroundingLines(
  heading: string,
  subjects: readonly TestBasisGroundingSubject[],
  documents?: readonly TestBasisDocument[]
): string[] {
  const lines: string[] = [];
  lines.push(heading);
  lines.push("");

  if (!documents || documents.length === 0) {
    lines.push(TESTBASIS_GROUNDING_UNINSPECTABLE_LINE);
    lines.push("");
    return lines;
  }

  const { subjects: expanded, skipped } = expandGroundingSubjects(subjects);
  const ungrounded = findUngroundedSubjects(subjects, documents);
  if (ungrounded.length === 0) {
    lines.push("- なし");
  } else {
    for (const u of ungrounded) {
      lines.push(
        `- [${u.severity}] ${u.categoryId} ${escapeCell(u.target)}(${escapeCell(
          u.fieldLabel
        )}): ${escapeCell(u.detail)} 該当箇所: ${escapeCell(u.place)}`
      );
    }
  }

  const countOf = (kind: TestBasisGroundingKind): number =>
    expanded.filter((s) => s.kind === kind).length;
  lines.push(
    `- 照合対象: ラベル ${countOf("label")}件 / 引用 ${countOf("quotation")}件 / ID ${countOf(
      "id"
    )}件 / 文書名 ${countOf("documentName")}件 / 未照合 ${ungrounded.length}件` +
      `（正規化後${MIN_TESTBASIS_GROUNDING_LENGTH}文字未満で対象外 ${skipped.length}件）`
  );
  lines.push(QUOTATION_SCOPE_LINE);
  lines.push("");
  return lines;
}

/** サマリ節へ1行追加するための実在照合の要約行（先頭の `- ` を含む）。 */
export function testBasisGroundingSummaryLine(
  subjects: readonly TestBasisGroundingSubject[],
  documents?: readonly TestBasisDocument[]
): string {
  if (!documents || documents.length === 0) {
    return "- テストベース実在照合: 未実施(testBasisDocuments 未指定のため検査不能(要確認))";
  }
  const { subjects: expanded } = expandGroundingSubjects(subjects);
  const ungrounded = findUngroundedSubjects(subjects, documents);
  return `- テストベース実在照合: 対象${expanded.length}件 / 未照合${ungrounded.length}件`;
}

/** 検査実行状況の `documents-supplied` シグナル値。 */
export function testBasisGroundingSignal(documents?: readonly TestBasisDocument[]): {
  id: string;
  satisfied: boolean;
  measured: string;
} {
  const basis = buildTestBasisCorpus(documents);
  return {
    id: "documents-supplied",
    satisfied: basis.documentCount >= 1,
    measured: `投入文書${basis.documentCount}件・${basis.charTotal}字`,
  };
}

/** 照合種別の日本語表記（出力の補助に使う）。 */
export function groundingKindLabel(kind: TestBasisGroundingKind): string {
  return KIND_LABEL[kind];
}
