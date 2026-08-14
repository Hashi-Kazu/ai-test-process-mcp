import { headingsPerLine, normalizeTermKey } from "./requirementsAnalysis.js";
import { testLevelLabel } from "./testSizeAnalysis.js";
import { coverageBalanceCriteria } from "./resources/coverageBalanceCriteria.js";
import { testPerspectiveCatalog } from "./resources/testPerspectiveCatalog.js";
import { testTechniqueCatalog } from "./resources/testTechniqueCatalog.js";
import { jstqbGlossary } from "./resources/jstqbGlossary.js";
import { qualityCharacteristicModel } from "./resources/qualityCharacteristics.js";
import { testSizeClassificationCriteria } from "./resources/testSizeClassificationCriteria.js";
import type {
  AuditCoverageBalanceInput,
  CoverageBalanceAxis,
  CoverageBalanceCheckId,
  CoverageBalanceConcentration,
  CoverageBalanceCriteria,
  CoverageBalanceCrossTable,
  CoverageBalanceDeclaredDistribution,
  CoverageBalanceDeliverable,
  CoverageBalanceDistributionRow,
  CoverageBalanceFinding,
  CoverageBalancePlace,
  CoverageBalanceSeverity,
  CoverageBalanceSummary,
  CoverageBalanceTermCandidate,
  CoverageBalanceTermDefinition,
  CoverageBalanceTestCase,
  TestLevelId,
  TestPerspectiveCatalog,
  TestTechniqueCatalog,
} from "./types.js";

// audit_coverage_balance の決定的検査ロジック。
// すべて純関数。乱数・現在時刻・環境依存値を使わず、入力を破壊せず、出力順は決定的。
// 分布は観測値としてのみ提示し、分布そのものへの合否判定は行わない。

/** 軸の値が宣言されていないケースを集めるバケットID。 */
export const UNASSIGNED_BUCKET_ID = "未指定";
/** 軸の値が既知カタログで解決できないケースを集めるバケットID。 */
export const UNKNOWN_BUCKET_ID = "未知";

/** 代表ケースIDとして分布行に載せる最大件数。 */
export const SAMPLE_CASE_ID_LIMIT = 3;

/** 独自用語候補として採用する最小出現回数の既定値。 */
export const DEFAULT_MIN_TERM_OCCURRENCES = 2;

/** 本文中のケースIDを拾う既定パターン。 */
export const DEFAULT_CASE_ID_PATTERN = "\\b[A-Z][A-Z0-9]*-\\d{1,4}\\b";

export const TEST_LEVEL_IDS: readonly TestLevelId[] = [
  "component-testing",
  "integration-testing",
  "system-testing",
  "acceptance-testing",
];

const SNIPPET_LIMIT = 80;

function makeSnippet(raw: string): string {
  const t = raw.trim();
  return t.length <= SNIPPET_LIMIT ? t : `${t.slice(0, SNIPPET_LIMIT)}…`;
}

/** 小数第1位までの構成比(%)。整数演算で丸め、環境依存の差を作らない。 */
export function sharePercentOf(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count * 1000) / total) / 10;
}

function isValidTermSurface(term: string): boolean {
  const t = term.trim();
  if (t.length < 2 || t.length > 30) return false;
  if (/^\d+$/.test(t)) return false;
  if (/^[^\p{L}\p{N}]+$/u.test(t)) return false;
  return true;
}

// --- 分布集計 ---

interface Bucket {
  id: string;
  label: string;
}

function buildRows(
  buckets: Bucket[],
  testCases: CoverageBalanceTestCase[],
  bucketIdOf: (testCase: CoverageBalanceTestCase) => string
): CoverageBalanceDistributionRow[] {
  const counts = new Map<string, string[]>();
  for (const b of buckets) counts.set(b.id, []);
  let unknownUsed = false;
  for (const tc of testCases) {
    const id = bucketIdOf(tc);
    if (!counts.has(id)) {
      counts.set(id, []);
      if (id === UNKNOWN_BUCKET_ID) unknownUsed = true;
    }
    (counts.get(id) as string[]).push(tc.caseId);
  }
  const total = testCases.length;
  const ordered: Bucket[] = [...buckets];
  if (unknownUsed) ordered.push({ id: UNKNOWN_BUCKET_ID, label: "未知（カタログ外のID）" });
  return ordered.map((b) => {
    const ids = counts.get(b.id) ?? [];
    return {
      id: b.id,
      label: b.label,
      caseCount: ids.length,
      sharePercent: sharePercentOf(ids.length, total),
      sampleCaseIds: ids.slice(0, SAMPLE_CASE_ID_LIMIT),
    };
  });
}

/** 観点カテゴリID・観点IDの双方から所属カテゴリIDを引ける索引。 */
function perspectiveCategoryIndex(catalog: TestPerspectiveCatalog): Map<string, string> {
  const index = new Map<string, string>();
  for (const category of catalog.categories) {
    index.set(category.id, category.id);
    for (const p of category.perspectives) index.set(p.id, category.id);
  }
  return index;
}

export function resolvePerspectiveCategoryId(
  declared: string | undefined,
  catalog: TestPerspectiveCatalog = testPerspectiveCatalog
): string {
  if (declared === undefined || declared.trim() === "") return UNASSIGNED_BUCKET_ID;
  return perspectiveCategoryIndex(catalog).get(declared.trim()) ?? UNKNOWN_BUCKET_ID;
}

export function buildPerspectiveDistribution(
  testCases: CoverageBalanceTestCase[],
  catalog: TestPerspectiveCatalog = testPerspectiveCatalog
): CoverageBalanceDistributionRow[] {
  const index = perspectiveCategoryIndex(catalog);
  const buckets: Bucket[] = catalog.categories.map((c) => ({ id: c.id, label: c.nameJa }));
  buckets.push({ id: UNASSIGNED_BUCKET_ID, label: "未指定（観点カテゴリ未宣言）" });
  return buildRows(buckets, testCases, (tc) => {
    const declared = tc.perspectiveCategoryId?.trim();
    if (declared === undefined || declared === "") return UNASSIGNED_BUCKET_ID;
    return index.get(declared) ?? UNKNOWN_BUCKET_ID;
  });
}

export function buildTechniqueDistribution(
  testCases: CoverageBalanceTestCase[],
  catalog: TestTechniqueCatalog = testTechniqueCatalog
): CoverageBalanceDistributionRow[] {
  const known = new Set<string>(catalog.entries.map((e) => e.techniqueId));
  const buckets: Bucket[] = catalog.entries.map((e) => ({ id: e.techniqueId, label: e.nameJa }));
  buckets.push({ id: UNASSIGNED_BUCKET_ID, label: "未指定（技法未宣言）" });
  return buildRows(buckets, testCases, (tc) => {
    const declared = tc.techniqueId?.trim();
    if (declared === undefined || declared === "") return UNASSIGNED_BUCKET_ID;
    return known.has(declared) ? declared : UNKNOWN_BUCKET_ID;
  });
}

export function buildTestLevelDistribution(
  testCases: CoverageBalanceTestCase[]
): CoverageBalanceDistributionRow[] {
  const buckets: Bucket[] = TEST_LEVEL_IDS.map((id) => ({ id, label: testLevelLabel(id) }));
  buckets.push({ id: UNASSIGNED_BUCKET_ID, label: "未指定（テストレベル未宣言）" });
  return buildRows(buckets, testCases, (tc) => {
    const declared = tc.testLevel;
    if (declared === undefined) return UNASSIGNED_BUCKET_ID;
    return TEST_LEVEL_IDS.includes(declared) ? declared : UNKNOWN_BUCKET_ID;
  });
}

export function buildPerspectiveLevelCrossTable(
  testCases: CoverageBalanceTestCase[],
  catalog: TestPerspectiveCatalog = testPerspectiveCatalog
): CoverageBalanceCrossTable {
  const index = perspectiveCategoryIndex(catalog);
  const levelIds: string[] = [...TEST_LEVEL_IDS, UNASSIGNED_BUCKET_ID];
  const levelLabels = levelIds.map((id) =>
    id === UNASSIGNED_BUCKET_ID ? UNASSIGNED_BUCKET_ID : testLevelLabel(id as TestLevelId)
  );

  const rowBuckets: Bucket[] = catalog.categories.map((c) => ({ id: c.id, label: c.nameJa }));
  rowBuckets.push({ id: UNASSIGNED_BUCKET_ID, label: UNASSIGNED_BUCKET_ID });
  const hasUnknownRow = testCases.some((tc) => {
    const declared = tc.perspectiveCategoryId?.trim();
    return declared !== undefined && declared !== "" && !index.has(declared);
  });
  if (hasUnknownRow) rowBuckets.push({ id: UNKNOWN_BUCKET_ID, label: UNKNOWN_BUCKET_ID });

  const rows = rowBuckets.map((b) => ({
    id: b.id,
    label: b.label,
    counts: levelIds.map(() => 0),
    total: 0,
  }));
  const rowByIdx = new Map(rows.map((r, i) => [r.id, i]));

  for (const tc of testCases) {
    const declared = tc.perspectiveCategoryId?.trim();
    const rowId =
      declared === undefined || declared === ""
        ? UNASSIGNED_BUCKET_ID
        : index.get(declared) ?? UNKNOWN_BUCKET_ID;
    const colId =
      tc.testLevel !== undefined && TEST_LEVEL_IDS.includes(tc.testLevel)
        ? (tc.testLevel as string)
        : UNASSIGNED_BUCKET_ID;
    const ri = rowByIdx.get(rowId);
    const ci = levelIds.indexOf(colId);
    if (ri === undefined || ci < 0) continue;
    rows[ri].counts[ci] += 1;
    rows[ri].total += 1;
  }

  return { levelIds, levelLabels, rows };
}

/** CBC-08 用の観測値。判定は行わない。 */
export function computeConcentrationMetrics(
  rows: CoverageBalanceDistributionRow[]
): CoverageBalanceConcentration {
  const assignedRows = rows.filter(
    (r) => r.id !== UNASSIGNED_BUCKET_ID && r.id !== UNKNOWN_BUCKET_ID
  );
  const assignedCaseCount = assignedRows.reduce((sum, r) => sum + r.caseCount, 0);
  const sortedCounts = assignedRows.map((r) => r.caseCount).sort((a, b) => b - a);
  const top = sortedCounts[0] ?? 0;
  const topTwo = top + (sortedCounts[1] ?? 0);
  return {
    topShare: sharePercentOf(top, assignedCaseCount),
    topTwoShare: sharePercentOf(topTwo, assignedCaseCount),
    zeroBucketCount: assignedRows.filter((r) => r.caseCount === 0).length,
    assignedCaseCount,
  };
}

// --- 指摘の生成 ---

interface FindingDraft {
  checkId: CoverageBalanceCheckId;
  severity: CoverageBalanceSeverity;
  subject: string;
  summary: string;
  places?: CoverageBalancePlace[];
  question: string;
  assumption: string;
}

function makeFinding(draft: FindingDraft): CoverageBalanceFinding {
  return { no: "", places: [], ...draft };
}

export function assignFindingNumbers(
  findings: CoverageBalanceFinding[]
): CoverageBalanceFinding[] {
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
  return sorted.map((f, i) => ({ ...f, no: `CB-${String(i + 1).padStart(3, "0")}` }));
}

// --- 宣言と実体の照合（分布軸） ---

/** CBC-01 / CBC-02 / CBC-03 */
export function findUnknownAxisDeclarations(
  testCases: CoverageBalanceTestCase[],
  perspectiveCatalog: TestPerspectiveCatalog = testPerspectiveCatalog,
  techniqueCatalog: TestTechniqueCatalog = testTechniqueCatalog
): CoverageBalanceFinding[] {
  const index = perspectiveCategoryIndex(perspectiveCatalog);
  const knownTechniques = new Set<string>(techniqueCatalog.entries.map((e) => e.techniqueId));
  const out: CoverageBalanceFinding[] = [];

  const unknownPerspectives = new Map<string, string[]>();
  const unknownTechniques = new Map<string, string[]>();
  const missing: Record<string, string[]> = {
    観点カテゴリID: [],
    技法ID: [],
    テストレベル: [],
  };

  for (const tc of testCases) {
    const p = tc.perspectiveCategoryId?.trim();
    if (p === undefined || p === "") missing["観点カテゴリID"].push(tc.caseId);
    else if (!index.has(p)) {
      if (!unknownPerspectives.has(p)) unknownPerspectives.set(p, []);
      (unknownPerspectives.get(p) as string[]).push(tc.caseId);
    }

    const t = tc.techniqueId?.trim();
    if (t === undefined || t === "") missing["技法ID"].push(tc.caseId);
    else if (!knownTechniques.has(t)) {
      if (!unknownTechniques.has(t)) unknownTechniques.set(t, []);
      (unknownTechniques.get(t) as string[]).push(tc.caseId);
    }

    if (tc.testLevel === undefined) missing["テストレベル"].push(tc.caseId);
  }

  for (const [id, caseIds] of unknownPerspectives) {
    out.push(
      makeFinding({
        checkId: "CBC-01",
        severity: "high",
        subject: id,
        summary: `観点カテゴリID「${id}」がテスト観点カタログのカテゴリIDにも観点IDにも存在しない（該当ケース: ${caseIds.join(", ")}）。`,
        question:
          "当該IDはカタログのどの観点に対応するか。カタログ外の独自観点であれば、その定義はどの成果物に記載されているか。",
        assumption: "未知の区分として扱い、観点カテゴリ別分布では「未知」に計上している。",
      })
    );
  }
  for (const [id, caseIds] of unknownTechniques) {
    out.push(
      makeFinding({
        checkId: "CBC-02",
        severity: "high",
        subject: id,
        summary: `技法ID「${id}」がテスト技法カタログの techniqueId に存在しない（該当ケース: ${caseIds.join(", ")}）。`,
        question:
          "当該IDはカタログのどの技法に対応するか。カタログ外の技法であれば、その適用手順はどこに定義されているか。",
        assumption: "未知の区分として扱い、技法別分布では「未知」に計上している。",
      })
    );
  }
  for (const axisName of Object.keys(missing)) {
    const caseIds = missing[axisName];
    if (caseIds.length === 0) continue;
    out.push(
      makeFinding({
        checkId: "CBC-03",
        severity: "medium",
        subject: axisName,
        summary: `${axisName}を宣言していないケースが ${caseIds.length} 件ある（例: ${caseIds
          .slice(0, 5)
          .join(", ")}）。当該軸の分布は母集団全体を代表しない。`,
        question: `未宣言のケースに${axisName}を付与できるか。付与できない理由は何か。`,
        assumption: "分布表に「未指定」行を設けて計上している。",
      })
    );
  }
  return out;
}

export type CoverageBalanceRowsByAxis = Record<
  CoverageBalanceAxis,
  CoverageBalanceDistributionRow[]
>;

const AXIS_LABEL: Record<CoverageBalanceAxis, string> = {
  perspective: "観点カテゴリ",
  technique: "技法",
  "test-level": "テストレベル",
};

/** 軸の生の宣言値（カタログ照合前）。CBC-14 判定に使う。 */
function rawAxisValueOf(
  axis: CoverageBalanceAxis,
  tc: CoverageBalanceTestCase
): string | undefined {
  switch (axis) {
    case "perspective":
      return tc.perspectiveCategoryId?.trim();
    case "technique":
      return tc.techniqueId?.trim();
    case "test-level":
      return tc.testLevel;
  }
}

function findRawAxisCaseIds(
  axis: CoverageBalanceAxis,
  label: string,
  testCases: CoverageBalanceTestCase[]
): string[] {
  return testCases.filter((tc) => rawAxisValueOf(axis, tc) === label).map((tc) => tc.caseId);
}

/** CBC-04 / CBC-14 */
export function checkDeclaredDistributions(
  declaredDistributions: CoverageBalanceDeclaredDistribution[] | undefined,
  rows: CoverageBalanceRowsByAxis,
  testCases: CoverageBalanceTestCase[] = []
): CoverageBalanceFinding[] {
  if (declaredDistributions === undefined || declaredDistributions.length === 0) return [];
  const out: CoverageBalanceFinding[] = [];
  for (const declared of declaredDistributions) {
    const axisRows = rows[declared.axis] ?? [];
    const row = axisRows.find((r) => r.id === declared.label);

    if (row === undefined) {
      const rawCaseIds = findRawAxisCaseIds(declared.axis, declared.label, testCases);
      if (rawCaseIds.length > 0) {
        const subject = `${AXIS_LABEL[declared.axis]}:${declared.label}`;
        out.push(
          makeFinding({
            checkId: "CBC-14",
            severity: "high",
            subject,
            summary: `区分「${declared.label}」は${AXIS_LABEL[declared.axis]}カタログに未登録のため集計軸として解決できないが、当該IDを宣言したケースが ${rawCaseIds.length} 件存在する（宣言件数 ${declared.declaredCount} 件、該当ケース: ${rawCaseIds.join(", ")}）。実データは「未知」区分に計上されている。`,
            question: "当該IDをカタログへ追加するか、宣言側の区分ラベルを既存カタログIDへ修正できるか。",
            assumption: "カタログ未登録のため CBC-04 の件数照合は実施していない（要確認）。",
          })
        );
        continue;
      }
    }

    const actual = row?.caseCount ?? 0;
    if (actual === declared.declaredCount) continue;
    const subject = `${AXIS_LABEL[declared.axis]}:${declared.label}`;
    const detail =
      row === undefined
        ? `区分「${declared.label}」は集計軸の区分として存在せず、実集計は0件である`
        : `実集計は ${actual} 件である`;
    out.push(
      makeFinding({
        checkId: "CBC-04",
        severity: "high",
        subject,
        summary: `宣言件数 ${declared.declaredCount} 件に対し、${detail}。`,
        question: "宣言件数と実集計のどちらが正か。集計から除外したケースがあるならどれか。",
        assumption: "実集計値を分布表に採用している。",
      })
    );
  }
  return out;
}

// --- 本文中のケースIDとの照合 ---

export interface BodyCaseIdOccurrence {
  caseId: string;
  deliverable: string;
  lineIndex: number;
  heading: string;
  snippet: string;
}

export interface CaseIdGroundingOptions {
  caseIdPatterns?: string[];
}

export function extractBodyCaseIds(
  deliverables: CoverageBalanceDeliverable[],
  options: CaseIdGroundingOptions = {}
): BodyCaseIdOccurrence[] {
  const patterns = [DEFAULT_CASE_ID_PATTERN, ...(options.caseIdPatterns ?? [])];
  const out: BodyCaseIdOccurrence[] = [];
  for (const d of deliverables) {
    const lines = d.content.split("\n");
    const headings = headingsPerLine(d.content);
    lines.forEach((line, lineIndex) => {
      const seen = new Set<string>();
      for (const pattern of patterns) {
        let re: RegExp;
        try {
          re = new RegExp(pattern, "g");
        } catch {
          continue;
        }
        for (const m of line.matchAll(re)) {
          const caseId = m[0];
          if (seen.has(caseId)) continue;
          seen.add(caseId);
          out.push({
            caseId,
            deliverable: d.name,
            lineIndex,
            heading: headings[lineIndex] ?? "(見出しなし)",
            snippet: makeSnippet(line),
          });
        }
      }
    });
  }
  return out;
}

function caseIdPrefixOf(caseId: string): string | null {
  const m = /^([A-Za-z][A-Za-z0-9]*)-\d{1,4}$/.exec(caseId.trim());
  return m ? m[1].toUpperCase() : null;
}

/** CBC-05 / CBC-06 */
export function checkCaseIdGrounding(
  testCases: CoverageBalanceTestCase[],
  deliverables: CoverageBalanceDeliverable[] | undefined,
  options: CaseIdGroundingOptions = {}
): CoverageBalanceFinding[] {
  if (deliverables === undefined || deliverables.length === 0) return [];
  const occurrences = extractBodyCaseIds(deliverables, options);
  const bodyIds = new Set(occurrences.map((o) => o.caseId));
  const declaredIds = new Set(testCases.map((tc) => tc.caseId));
  const out: CoverageBalanceFinding[] = [];

  const seenMissing = new Set<string>();
  for (const tc of testCases) {
    if (bodyIds.has(tc.caseId) || seenMissing.has(tc.caseId)) continue;
    seenMissing.add(tc.caseId);
    out.push(
      makeFinding({
        checkId: "CBC-05",
        severity: "high",
        subject: tc.caseId,
        summary: `分布に計上したケースID「${tc.caseId}」が、投入されたどの成果物本文にも出現しない。`,
        question: "当該ケースはどの成果物に記載されているか。未記載であればなぜ分布に計上したか。",
        assumption: "本文の裏付けが無い計上として扱い、分布の件数根拠には使えないものとみなす。",
      })
    );
  }

  const prefixes = new Set<string>();
  for (const tc of testCases) {
    const p = caseIdPrefixOf(tc.caseId);
    if (p !== null) prefixes.add(p);
  }
  const seenExtra = new Set<string>();
  for (const o of occurrences) {
    if (declaredIds.has(o.caseId) || seenExtra.has(o.caseId)) continue;
    const p = caseIdPrefixOf(o.caseId);
    if (p === null || !prefixes.has(p)) continue;
    seenExtra.add(o.caseId);
    out.push(
      makeFinding({
        checkId: "CBC-06",
        severity: "high",
        subject: o.caseId,
        summary: `成果物本文に出現するケースID「${o.caseId}」が testCases に投入されていない。分布の母集団が本文より小さい。`,
        places: [
          {
            deliverable: o.deliverable,
            lineIndex: o.lineIndex,
            heading: o.heading,
            snippet: o.snippet,
          },
        ],
        question: "当該ケースを集計対象から外した理由は何か。意図的な除外であればどこに明記されているか。",
        assumption: "母集団から漏れたものとして扱い、分布は本文の全ケースを代表しないものとみなす。",
      })
    );
  }
  return out;
}

/** CBC-07 */
export function findZeroCountBuckets(
  axis: CoverageBalanceAxis,
  rows: CoverageBalanceDistributionRow[]
): CoverageBalanceFinding[] {
  const zero = rows.filter(
    (r) => r.caseCount === 0 && r.id !== UNASSIGNED_BUCKET_ID && r.id !== UNKNOWN_BUCKET_ID
  );
  if (zero.length === 0) return [];
  return [
    makeFinding({
      checkId: "CBC-07",
      severity: "info",
      subject: AXIS_LABEL[axis],
      summary: `${AXIS_LABEL[axis]}のうち ${zero.length} 区分に1件も割り当てが無い（${zero
        .slice(0, 8)
        .map((r) => `${r.id}(${r.label})`)
        .join(", ")}${zero.length > 8 ? " ほか" : ""}）。`,
      question: "0件の区分は対象外か、それとも設計漏れか。対象外であればその理由はどこに明記されているか。",
      assumption: "気づきの提示にとどめ、不合格とはしない。",
    }),
  ];
}

/** CBC-08 */
export function describeConcentration(
  axis: CoverageBalanceAxis,
  concentration: CoverageBalanceConcentration
): CoverageBalanceFinding[] {
  if (concentration.assignedCaseCount === 0) return [];
  return [
    makeFinding({
      checkId: "CBC-08",
      severity: "info",
      subject: AXIS_LABEL[axis],
      summary: `割り当て済み ${concentration.assignedCaseCount} 件のうち、最大区分が ${concentration.topShare}%、上位2区分の合計が ${concentration.topTwoShare}% を占める（観測値。望ましい分布の基準は持たない）。`,
      question: "この偏りは対象システムのリスク構造・テストベースの記述量から説明できるか。",
      assumption: "観測値の提示にとどめ、偏りの是非は判定しない。",
    }),
  ];
}

// --- 用語 ---

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function headingIsGlossary(heading: string, criteria: CoverageBalanceCriteria): boolean {
  const lower = heading.toLowerCase();
  return criteria.glossaryHeadingKeywords.some((k) => lower.includes(k.toLowerCase()));
}

/** 用語集セクション（見出しが用語集キーワードを含む区間）が1つでもあるか。 */
export function hasGlossarySection(
  deliverables: CoverageBalanceDeliverable[],
  criteria: CoverageBalanceCriteria = coverageBalanceCriteria
): boolean {
  return deliverables.some((d) =>
    headingsPerLine(d.content).some((h) => headingIsGlossary(h, criteria))
  );
}

export function extractTermDefinitions(
  deliverables: CoverageBalanceDeliverable[],
  criteria: CoverageBalanceCriteria = coverageBalanceCriteria
): CoverageBalanceTermDefinition[] {
  const defs: CoverageBalanceTermDefinition[] = [];

  for (const d of deliverables) {
    const lines = d.content.split("\n");
    const headings = headingsPerLine(d.content);
    let inTable = false;
    let tableRowIndex = 0;

    lines.forEach((line, lineIndex) => {
      const heading = headings[lineIndex] ?? "(見出しなし)";
      const inGlossary = headingIsGlossary(heading, criteria);
      const trimmed = line.trim();

      // 規則1: 用語集見出し区間の Markdown 表行
      if (/^\|.*\|$/.test(trimmed)) {
        if (!inTable) {
          inTable = true;
          tableRowIndex = 0;
        } else {
          tableRowIndex++;
        }
        if (inGlossary) {
          const cells = trimmed
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim());
          if (tableRowIndex > 0 && cells.length >= 2 && !isSeparatorRow(cells)) {
            if (isValidTermSurface(cells[0])) {
              defs.push({
                term: cells[0],
                deliverable: d.name,
                lineIndex,
                heading,
                definition: cells[1],
              });
            }
          }
        }
        return;
      }
      inTable = false;
      tableRowIndex = 0;

      // 規則2: 「X」とは / Xとは、 / Xとは：
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
      if (ruleMatch && isValidTermSurface(ruleMatch.term)) {
        defs.push({
          term: ruleMatch.term,
          deliverable: d.name,
          lineIndex,
          heading,
          definition: ruleMatch.definition,
        });
      }

      // 規則3: 用語集見出し区間の "- X: 説明" / "- X：説明"
      if (inGlossary) {
        const listMatch = /^-\s*([^\s:：]{2,30})[:：]\s*(.*)$/.exec(trimmed);
        if (listMatch && isValidTermSurface(listMatch[1])) {
          defs.push({
            term: listMatch[1],
            deliverable: d.name,
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

/** 既知用語の正規化キー → 出現表記（最初に登録された表記を先頭に持つ）。 */
export function collectKnownTermSurfaces(
  extra: string[] = [],
  criteria: CoverageBalanceCriteria = coverageBalanceCriteria
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (surface: string | undefined): void => {
    if (surface === undefined) return;
    const trimmed = surface.trim();
    if (trimmed === "") return;
    const key = normalizeTermKey(trimmed);
    if (key === "") return;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key) as string[];
    if (!list.includes(trimmed)) list.push(trimmed);
  };

  for (const t of jstqbGlossary.terms) {
    add(t.nameJa);
    add(t.nameEn);
  }
  for (const c of testPerspectiveCatalog.categories) {
    add(c.nameJa);
    for (const p of c.perspectives) add(p.nameJa);
  }
  for (const e of testTechniqueCatalog.entries) {
    add(e.nameJa);
    add(e.techniqueId);
  }
  for (const qc of qualityCharacteristicModel.characteristics) {
    add(qc.nameJa);
    add(qc.nameEn);
    for (const sub of qc.subCharacteristics) {
      add(sub.nameJa);
      add(sub.nameEn);
    }
  }
  for (const dim of testSizeClassificationCriteria.dimensions) add(dim.nameJa);
  for (const size of testSizeClassificationCriteria.sizes) add(size.nameJa);
  for (const w of criteria.commonTermStopWords) add(w);
  for (const w of extra) add(w);

  return map;
}

/** 既知用語の正規化キー集合。 */
export function collectKnownTerms(
  extra: string[] = [],
  criteria: CoverageBalanceCriteria = coverageBalanceCriteria
): Set<string> {
  return new Set(collectKnownTermSurfaces(extra, criteria).keys());
}

export interface TermCandidateOptions {
  criteria?: CoverageBalanceCriteria;
  minOccurrences?: number;
}

interface RawTermHit {
  term: string;
  kindId: string;
  place: CoverageBalancePlace;
}

function collectRawTermHits(
  deliverables: CoverageBalanceDeliverable[],
  criteria: CoverageBalanceCriteria
): RawTermHit[] {
  const hits: RawTermHit[] = [];
  const rules: { kindId: string; re: RegExp; group: number }[] = [
    { kindId: criteria.termCandidateKinds[0]?.id ?? "CBT-01", re: /「([^」]{2,30})」/g, group: 1 },
    { kindId: criteria.termCandidateKinds[1]?.id ?? "CBT-02", re: /[ァ-ヶー]{3,30}/g, group: 0 },
    {
      kindId: criteria.termCandidateKinds[2]?.id ?? "CBT-03",
      re: /(?<![A-Za-z0-9])[A-Z][A-Z0-9]{1,15}(?![A-Za-z0-9])(?!-\d)/g,
      group: 0,
    },
    { kindId: criteria.termCandidateKinds[3]?.id ?? "CBT-04", re: /\*\*([^*]{2,30})\*\*/g, group: 1 },
  ];

  for (const d of deliverables) {
    const lines = d.content.split("\n");
    const headings = headingsPerLine(d.content);
    lines.forEach((line, lineIndex) => {
      const place: CoverageBalancePlace = {
        deliverable: d.name,
        lineIndex,
        heading: headings[lineIndex] ?? "(見出しなし)",
        snippet: makeSnippet(line),
      };
      for (const rule of rules) {
        for (const m of line.matchAll(new RegExp(rule.re.source, rule.re.flags))) {
          const term = (m[rule.group] ?? "").trim();
          if (!isValidTermSurface(term)) continue;
          hits.push({ term, kindId: rule.kindId, place });
        }
      }
    });
  }
  return hits;
}

export function extractCustomTermCandidates(
  deliverables: CoverageBalanceDeliverable[],
  knownTerms: Set<string>,
  options: TermCandidateOptions = {}
): CoverageBalanceTermCandidate[] {
  const criteria = options.criteria ?? coverageBalanceCriteria;
  const minOccurrences = options.minOccurrences ?? DEFAULT_MIN_TERM_OCCURRENCES;
  const hits = collectRawTermHits(deliverables, criteria);

  const order: string[] = [];
  const byKey = new Map<string, CoverageBalanceTermCandidate>();
  for (const hit of hits) {
    const key = normalizeTermKey(hit.term);
    if (key === "" || knownTerms.has(key)) continue;
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, { term: hit.term, kindId: hit.kindId, occurrences: 0, places: [] });
    }
    const entry = byKey.get(key) as CoverageBalanceTermCandidate;
    entry.occurrences += 1;
    if (entry.places.length < 4) entry.places.push(hit.place);
  }

  return order
    .map((k) => byKey.get(k) as CoverageBalanceTermCandidate)
    .filter((c) => c.occurrences >= minOccurrences);
}

export interface CoverageBalanceTermVariant {
  term: string;
  knownTerm: string;
  occurrences: number;
  places: CoverageBalancePlace[];
}

/** CBC-13 の材料。正規化キーは既知用語と一致するが表記が異なる語を集める。 */
export function findKnownTermVariants(
  deliverables: CoverageBalanceDeliverable[],
  knownSurfaces: Map<string, string[]>,
  options: TermCandidateOptions = {}
): CoverageBalanceTermVariant[] {
  const criteria = options.criteria ?? coverageBalanceCriteria;
  const minOccurrences = options.minOccurrences ?? DEFAULT_MIN_TERM_OCCURRENCES;
  const hits = collectRawTermHits(deliverables, criteria);

  const order: string[] = [];
  const byTerm = new Map<string, CoverageBalanceTermVariant>();
  for (const hit of hits) {
    const key = normalizeTermKey(hit.term);
    const surfaces = knownSurfaces.get(key);
    if (surfaces === undefined || surfaces.includes(hit.term)) continue;
    if (!byTerm.has(hit.term)) {
      order.push(hit.term);
      byTerm.set(hit.term, {
        term: hit.term,
        knownTerm: surfaces[0],
        occurrences: 0,
        places: [],
      });
    }
    const entry = byTerm.get(hit.term) as CoverageBalanceTermVariant;
    entry.occurrences += 1;
    if (entry.places.length < 4) entry.places.push(hit.place);
  }
  return order
    .map((t) => byTerm.get(t) as CoverageBalanceTermVariant)
    .filter((v) => v.occurrences >= minOccurrences);
}

function countNormalizedUsage(term: string, text: string): number {
  const normTerm = normalizeTermKey(term);
  if (normTerm === "") return 0;
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

/** CBC-09 / CBC-10 / CBC-11 / CBC-12 / CBC-13 */
export function checkTermDefinitions(
  candidates: CoverageBalanceTermCandidate[],
  definitions: CoverageBalanceTermDefinition[],
  deliverables: CoverageBalanceDeliverable[],
  criteria: CoverageBalanceCriteria = coverageBalanceCriteria,
  variants: CoverageBalanceTermVariant[] = []
): CoverageBalanceFinding[] {
  const out: CoverageBalanceFinding[] = [];
  const definedKeys = new Set(definitions.map((d) => normalizeTermKey(d.term)));

  // CBC-09
  if (candidates.length > 0 && !hasGlossarySection(deliverables, criteria)) {
    out.push(
      makeFinding({
        checkId: "CBC-09",
        severity: "high",
        subject: "用語集セクション",
        summary: `独自用語候補が ${candidates.length} 件あるが、投入されたどの成果物にも用語集セクション（見出しに ${criteria.glossaryHeadingKeywords.join(
          " / "
        )} を含む区間）が存在しない。`,
        places: candidates[0].places.slice(0, 1),
        question: "独自用語の定義はどこに置く方針か。用語集セクションを設けない理由は何か。",
        assumption: "用語定義が成果物内で解決できない状態として扱う。",
      })
    );
  }

  // CBC-10
  for (const c of candidates) {
    if (definedKeys.has(normalizeTermKey(c.term))) continue;
    out.push(
      makeFinding({
        checkId: "CBC-10",
        severity: "high",
        subject: c.term,
        summary: `独自用語候補「${c.term}」が本文で ${c.occurrences} 回使われているが、どの成果物にも定義が見つからない。`,
        places: c.places.slice(0, 4),
        question: "当該語は成果物内で定義が必要な独自用語か、それとも定義不要な一般語・固有名詞か。",
        assumption: "定義欠落の候補として扱う。抽出は機械的であり固有名詞・製品名も拾う。",
      })
    );
  }

  // CBC-11 / CBC-12
  const defOrder: string[] = [];
  const defsByKey = new Map<string, CoverageBalanceTermDefinition[]>();
  for (const d of definitions) {
    const key = normalizeTermKey(d.term);
    if (key === "") continue;
    if (!defsByKey.has(key)) {
      defOrder.push(key);
      defsByKey.set(key, []);
    }
    (defsByKey.get(key) as CoverageBalanceTermDefinition[]).push(d);
  }

  for (const key of defOrder) {
    const entries = defsByKey.get(key) as CoverageBalanceTermDefinition[];
    const term = entries[0].term;
    const defLineKeys = new Set(entries.map((e) => `${e.deliverable}:${e.lineIndex}`));

    let usage = 0;
    for (const d of deliverables) {
      const headings = headingsPerLine(d.content);
      d.content.split("\n").forEach((line, lineIndex) => {
        if (defLineKeys.has(`${d.name}:${lineIndex}`)) return;
        if (headingIsGlossary(headings[lineIndex] ?? "", criteria)) return;
        usage += countNormalizedUsage(term, line);
      });
    }
    if (usage === 0) {
      out.push(
        makeFinding({
          checkId: "CBC-11",
          severity: "medium",
          subject: term,
          summary: `用語「${term}」は定義されているが、用語集セクション外の本文で1回も使われていない。`,
          places: [
            {
              deliverable: entries[0].deliverable,
              lineIndex: entries[0].lineIndex,
              heading: entries[0].heading,
              snippet: makeSnippet(entries[0].definition),
            },
          ],
          question: "当該用語を本文で使わないのはなぜか。別表記で使っていないか。",
          assumption: "定義のみが残っている候補として扱う。",
        })
      );
    }

    if (entries.length >= 2) {
      const texts = entries.map((e) => e.definition.trim());
      const distinct = texts.filter((t, i) => texts.indexOf(t) === i);
      if (distinct.length >= 2) {
        out.push(
          makeFinding({
            checkId: "CBC-12",
            severity: "medium",
            subject: term,
            summary: `用語「${term}」が ${entries.length} 箇所で定義されており、定義文が一致しない。`,
            places: entries.slice(0, 4).map((e) => ({
              deliverable: e.deliverable,
              lineIndex: e.lineIndex,
              heading: e.heading,
              snippet: makeSnippet(e.definition),
            })),
            question: "どの定義が正か。文脈ごとに別の意味で使っているのであれば用語を分けられるか。",
            assumption: "重複定義として扱い、いずれの定義も確定とはみなさない。",
          })
        );
      }
    }
  }

  // CBC-13
  for (const v of variants) {
    out.push(
      makeFinding({
        checkId: "CBC-13",
        severity: "info",
        subject: v.term,
        summary: `「${v.term}」は既知用語「${v.knownTerm}」と正規化キーが一致するが表記が異なる（${v.occurrences} 回出現）。`,
        places: v.places.slice(0, 4),
        question: "既知用語と同じ概念か。同じであれば表記を統一できるか。",
        assumption: "表記ゆれ候補の提示にとどめる。",
      })
    );
  }

  return out;
}

// --- 集約 ---

export interface CoverageBalanceAnalysis {
  perspectiveRows: CoverageBalanceDistributionRow[];
  techniqueRows: CoverageBalanceDistributionRow[];
  levelRows: CoverageBalanceDistributionRow[];
  crossTable: CoverageBalanceCrossTable;
  concentration: CoverageBalanceConcentration;
  termCandidates: CoverageBalanceTermCandidate[];
  termDefinitions: CoverageBalanceTermDefinition[];
  termVariants: CoverageBalanceTermVariant[];
  findings: CoverageBalanceFinding[];
  summary: CoverageBalanceSummary;
}

export function summarizeCoverageBalance(
  input: AuditCoverageBalanceInput,
  termCandidates: CoverageBalanceTermCandidate[],
  termDefinitions: CoverageBalanceTermDefinition[],
  findings: CoverageBalanceFinding[]
): CoverageBalanceSummary {
  const byCheckId: Record<string, number> = {};
  for (const f of findings) byCheckId[f.checkId] = (byCheckId[f.checkId] ?? 0) + 1;
  return {
    caseCount: input.testCases.length,
    deliverableCount: input.deliverables?.length ?? 0,
    termCandidateCount: termCandidates.length,
    termDefinitionCount: termDefinitions.length,
    totalFindings: findings.length,
    highFindings: findings.filter((f) => f.severity === "high").length,
    byCheckId,
  };
}

export function analyzeCoverageBalance(
  input: AuditCoverageBalanceInput,
  criteria: CoverageBalanceCriteria = coverageBalanceCriteria
): CoverageBalanceAnalysis {
  const testCases = input.testCases;
  const deliverables = input.deliverables ?? [];

  const perspectiveRows = buildPerspectiveDistribution(testCases, testPerspectiveCatalog);
  const techniqueRows = buildTechniqueDistribution(testCases, testTechniqueCatalog);
  const levelRows = buildTestLevelDistribution(testCases);
  const crossTable = buildPerspectiveLevelCrossTable(testCases, testPerspectiveCatalog);
  const concentration = computeConcentrationMetrics(perspectiveRows);

  const knownSurfaces = collectKnownTermSurfaces(input.additionalKnownTerms ?? [], criteria);
  const knownTerms = new Set(knownSurfaces.keys());
  const termOptions: TermCandidateOptions = {
    criteria,
    minOccurrences: input.minTermOccurrences ?? DEFAULT_MIN_TERM_OCCURRENCES,
  };
  const termCandidates =
    deliverables.length === 0
      ? []
      : extractCustomTermCandidates(deliverables, knownTerms, termOptions);
  const termVariants =
    deliverables.length === 0 ? [] : findKnownTermVariants(deliverables, knownSurfaces, termOptions);
  const termDefinitions =
    deliverables.length === 0 ? [] : extractTermDefinitions(deliverables, criteria);

  const findings = assignFindingNumbers([
    ...findUnknownAxisDeclarations(testCases, testPerspectiveCatalog, testTechniqueCatalog),
    ...checkDeclaredDistributions(
      input.declaredDistributions,
      {
        perspective: perspectiveRows,
        technique: techniqueRows,
        "test-level": levelRows,
      },
      testCases
    ),
    ...checkCaseIdGrounding(testCases, input.deliverables, {
      caseIdPatterns: input.caseIdPatterns,
    }),
    ...findZeroCountBuckets("perspective", perspectiveRows),
    ...findZeroCountBuckets("technique", techniqueRows),
    ...findZeroCountBuckets("test-level", levelRows),
    ...describeConcentration("perspective", concentration),
    ...(deliverables.length === 0
      ? []
      : checkTermDefinitions(termCandidates, termDefinitions, deliverables, criteria, termVariants)),
  ]);

  return {
    perspectiveRows,
    techniqueRows,
    levelRows,
    crossTable,
    concentration,
    termCandidates,
    termDefinitions,
    termVariants,
    findings,
    summary: summarizeCoverageBalance(input, termCandidates, termDefinitions, findings),
  };
}
