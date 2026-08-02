import { headingsPerLine, parseQuantity } from "./requirementsAnalysis.js";
import { extractQuantityExpressions } from "./testBasisAnalysis.js";
import { diffThresholdParameters } from "./thresholdChangeAnalysis.js";
import type {
  TestBasisDocument,
  TestCaseParameter,
  ThresholdApprovedExtraction,
  ThresholdCandidateDiffRow,
  ThresholdExtractionFinding,
  ThresholdExtractionSummary,
  ThresholdParameterCandidate,
} from "./types.js";

// reexpand_threshold_changes の「仕様書テキストからの閾値自前抽出」ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順（または明示したソートキー）で決定的。
// 抽出結果は再展開へ自動反映されない。承認された候補のみが実効パラメータ表へ追記される。

const VALUE_CELL_REGEX = /^([0-9][0-9,]*(?:\.[0-9]+)?)\s*([^\s0-9]*)$/;
const LABELED_LINE_REGEX =
  /^[-*+\s　]*(.+?)\s*[:：=]\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([^\s0-9]*)\s*$/;
const SEPARATOR_CELL_REGEX = /^:?-{3,}:?$/;

const CHANGED_KINDS = new Set(["value-changed", "unit-changed", "value-unit-changed"]);

// --- 1. ラベル正規化 ---

export function normalizeCandidateLabel(raw: string): string {
  let s = raw.replace(/^[-*+\s　]+/, "");
  s = s.replace(/[*_`#]/g, "");
  s = s.trim();
  s = s.replace(/[\s　]+/g, " ");
  return s;
}

function place(candidate: { document: string; lineIndex: number }): string {
  return `${candidate.document}:${candidate.lineIndex + 1}`;
}

// --- 2. 候補抽出 ---

function buildCandidateFromValueCell(
  cell: string
): { value: string; rawValue: string; unit?: string } | undefined {
  const m = VALUE_CELL_REGEX.exec(cell);
  if (!m) return undefined;
  const unit = m[2] && m[2].length > 0 ? m[2] : undefined;
  return { value: m[1].replace(/,/g, ""), rawValue: cell, unit };
}

export function extractThresholdParameterCandidates(
  documents: TestBasisDocument[]
): ThresholdParameterCandidate[] {
  const candidates: ThresholdParameterCandidate[] = [];

  for (const doc of documents) {
    const lines = doc.content.split("\n");
    const headingPerLine = headingsPerLine(doc.content);

    lines.forEach((rawLine, lineIndex) => {
      const line = rawLine.trim();
      if (line.length === 0) return;
      const heading = headingPerLine[lineIndex] ?? "(見出しなし)";

      // (a) table-row
      if (line.startsWith("|") && (line.match(/\|/g) ?? []).length >= 2) {
        const parts = line.split("|");
        if (parts.length > 0 && parts[0].trim() === "") parts.shift();
        if (parts.length > 0 && parts[parts.length - 1].trim() === "") parts.pop();
        const cells = parts.map((c) => c.trim());
        if (cells.length < 2) return;
        if (cells.every((c) => SEPARATOR_CELL_REGEX.test(c))) return;

        const name = normalizeCandidateLabel(cells[0]);
        if (name.length === 0) return;

        for (let i = 1; i < cells.length; i++) {
          const parsed = buildCandidateFromValueCell(cells[i]);
          if (!parsed) continue;
          candidates.push({
            name,
            value: parsed.value,
            rawValue: parsed.rawValue,
            unit: parsed.unit,
            document: doc.name,
            lineIndex,
            heading,
            form: "table-row",
          });
          return;
        }
        return;
      }

      // (b) labeled-line
      const m = LABELED_LINE_REGEX.exec(line);
      if (!m) return;
      const name = normalizeCandidateLabel(m[1]);
      if (name.length === 0) return;
      const unit = m[3] && m[3].length > 0 ? m[3] : undefined;
      candidates.push({
        name,
        value: m[2].replace(/,/g, ""),
        rawValue: `${m[2]}${unit ?? ""}`,
        unit,
        document: doc.name,
        lineIndex,
        heading,
        form: "labeled-line",
      });
    });
  }

  return candidates;
}

// --- 3. 数値証拠（TCE-03 の裏付け判定にのみ使う） ---

export function collectQuantityEvidence(
  documents: TestBasisDocument[]
): { value: string; unit?: string; document: string; lineIndex: number }[] {
  const evidence: { value: string; unit?: string; document: string; lineIndex: number }[] = [];
  for (const occ of extractQuantityExpressions(documents)) {
    const parsed = parseQuantity(occ.raw);
    if (parsed.value === null) continue;
    evidence.push({
      value: String(parsed.value),
      unit: parsed.unit === "(単位なし)" ? undefined : parsed.unit,
      document: occ.document,
      lineIndex: occ.lineIndex,
    });
  }
  return evidence;
}

// --- 4. 宣言パラメータと候補の対応づけ ---

function findMatch<T extends { name: string }>(
  declared: { name: string; source?: string },
  items: T[]
): T | undefined {
  const normalized = normalizeCandidateLabel(declared.name);
  const exact = items.find((item) => item.name === normalized);
  if (exact) return exact;

  const source = declared.source ?? "";
  if (source.length > 0) {
    const bySource = items.find((item) => item.name.length > 0 && source.includes(item.name));
    if (bySource) return bySource;
  }

  return items.find((item) => {
    if (item.name.length < 2 || declared.name.length < 2) return false;
    return item.name.includes(declared.name) || declared.name.includes(item.name);
  });
}

export function matchDeclaredToCandidates(
  declared: TestCaseParameter[],
  candidates: ThresholdParameterCandidate[]
): Map<string, ThresholdParameterCandidate> {
  const map = new Map<string, ThresholdParameterCandidate>();
  for (const param of declared) {
    if (map.has(param.name)) continue;
    const found = findMatch(param, candidates);
    if (found) map.set(param.name, found);
  }
  return map;
}

// --- 5. 文書内での値の衝突（TCE-05） ---

function findCandidateConflicts(
  candidates: ThresholdParameterCandidate[],
  snapshot: "before" | "after"
): ThresholdExtractionFinding[] {
  const order: string[] = [];
  const byName = new Map<string, ThresholdParameterCandidate[]>();
  for (const candidate of candidates) {
    const list = byName.get(candidate.name);
    if (list) list.push(candidate);
    else {
      byName.set(candidate.name, [candidate]);
      order.push(candidate.name);
    }
  }

  const findings: ThresholdExtractionFinding[] = [];
  for (const name of order) {
    const list = byName.get(name) as ThresholdParameterCandidate[];
    if (list.length < 2) continue;
    const first = list[0];
    const conflicting = list.some(
      (c) => c.value !== first.value || (c.unit ?? "") !== (first.unit ?? "")
    );
    if (!conflicting) continue;
    findings.push({
      categoryId: "TCE-05",
      severity: "medium",
      snapshot,
      name,
      detail: `同一スナップショット内で「${name}」に異なる値が記載されている（${list
        .map((c) => `${c.value}${c.unit ?? ""}`)
        .join(" / ")}）。`,
      places: list.map(place),
    });
  }
  return findings;
}

// --- 6. 候補差分（新旧対照表・提案） ---

function approvalFor(
  approvals: ThresholdApprovedExtraction[],
  name: string
): ThresholdApprovedExtraction | undefined {
  return approvals.find((a) => a.name === name);
}

function firstByName(
  candidates: ThresholdParameterCandidate[],
  name: string
): ThresholdParameterCandidate | undefined {
  return candidates.find((c) => c.name === name);
}

export function diffExtractedCandidates(
  beforeCandidates: ThresholdParameterCandidate[],
  afterCandidates: ThresholdParameterCandidate[],
  approvals: ThresholdApprovedExtraction[] = []
): ThresholdCandidateDiffRow[] {
  const beforeNames: string[] = [];
  for (const c of beforeCandidates) if (!beforeNames.includes(c.name)) beforeNames.push(c.name);
  const afterNames: string[] = [];
  for (const c of afterCandidates) if (!afterNames.includes(c.name)) afterNames.push(c.name);

  const nameOrder = [...afterNames, ...beforeNames.filter((n) => !afterNames.includes(n))];

  const rows: ThresholdCandidateDiffRow[] = [];
  for (const name of nameOrder) {
    const before = firstByName(beforeCandidates, name);
    const after = firstByName(afterCandidates, name);

    let kind: ThresholdCandidateDiffRow["kind"];
    if (before && after) {
      const valueChanged = before.value.trim() !== after.value.trim();
      const unitChanged = (before.unit ?? "") !== (after.unit ?? "");
      kind = valueChanged && unitChanged
        ? "value-unit-changed"
        : valueChanged
          ? "value-changed"
          : unitChanged
            ? "unit-changed"
            : "unchanged";
    } else if (after) {
      kind = "added";
    } else {
      kind = "removed";
    }

    const approval = approvalFor(approvals, name);
    let approvalStatus: ThresholdCandidateDiffRow["approval"];
    if (!approval) {
      approvalStatus = "unapproved";
    } else {
      const beforeOk =
        approval.beforeValue === undefined || (before !== undefined && before.value === approval.beforeValue);
      const afterOk =
        approval.afterValue === undefined || (after !== undefined && after.value === approval.afterValue);
      approvalStatus = beforeOk && afterOk ? "approved" : "approval-mismatch";
    }

    rows.push({
      name,
      kind,
      beforeValue: before?.value,
      afterValue: after?.value,
      beforeUnit: before?.unit,
      afterUnit: after?.unit,
      beforeSource: before ? place(before) : undefined,
      afterSource: after ? place(after) : undefined,
      approval: approvalStatus,
    });
  }

  return rows;
}

// --- 7. 承認済み候補のマージ（追記のみ・上書きしない） ---

export function mergeApprovedExtractions(
  declared: TestCaseParameter[],
  candidates: ThresholdParameterCandidate[],
  approvals: ThresholdApprovedExtraction[] | undefined,
  snapshot: "before" | "after"
): { parameters: TestCaseParameter[]; mergedCount: number } {
  const parameters = [...declared];
  if (!approvals || approvals.length === 0) return { parameters, mergedCount: 0 };

  const matched = matchDeclaredToCandidates(declared, candidates);
  const matchedCandidateNames = new Set([...matched.values()].map((c) => c.name));
  const addedNames = new Set<string>();
  let mergedCount = 0;

  for (const approval of approvals) {
    const value = snapshot === "before" ? approval.beforeValue : approval.afterValue;
    if (value === undefined) continue;
    const candidate = firstByName(candidates, approval.name);
    if (!candidate) continue;
    if (candidate.value !== value) continue;
    if (matchedCandidateNames.has(candidate.name)) continue;
    if (addedNames.has(candidate.name)) continue;
    addedNames.add(candidate.name);
    parameters.push({
      name: candidate.name,
      value: candidate.value,
      unit: candidate.unit,
      source: `抽出:${candidate.document}:${candidate.lineIndex + 1}`,
    });
    mergedCount++;
  }

  return { parameters, mergedCount };
}

// --- 8. 宣言表との突合（TCE-01..TCE-07） ---

export interface ThresholdExtractionParams {
  parametersBefore: TestCaseParameter[];
  parametersAfter: TestCaseParameter[];
  documentsBefore?: TestBasisDocument[];
  documentsAfter?: TestBasisDocument[];
  approvedExtractions?: ThresholdApprovedExtraction[];
}

export function buildExtractionFindings(
  params: ThresholdExtractionParams,
  beforeCandidates: ThresholdParameterCandidate[],
  afterCandidates: ThresholdParameterCandidate[],
  candidateDiffRows: ThresholdCandidateDiffRow[]
): ThresholdExtractionFinding[] {
  const approvals = params.approvedExtractions ?? [];
  const snapshots: {
    key: "before" | "after";
    label: string;
    declared: TestCaseParameter[];
    documents: TestBasisDocument[] | undefined;
    candidates: ThresholdParameterCandidate[];
  }[] = [
    {
      key: "before",
      label: "変更前",
      declared: params.parametersBefore,
      documents: params.documentsBefore,
      candidates: beforeCandidates,
    },
    {
      key: "after",
      label: "変更後",
      declared: params.parametersAfter,
      documents: params.documentsAfter,
      candidates: afterCandidates,
    },
  ];

  const tce01: ThresholdExtractionFinding[] = [];
  const tce02: ThresholdExtractionFinding[] = [];
  const tce03: ThresholdExtractionFinding[] = [];
  const tce04: ThresholdExtractionFinding[] = [];
  const tce05: ThresholdExtractionFinding[] = [];
  const tce06: ThresholdExtractionFinding[] = [];
  const tce07: ThresholdExtractionFinding[] = [];

  for (const snap of snapshots) {
    if (!snap.documents) continue;

    const matched = matchDeclaredToCandidates(snap.declared, snap.candidates);
    const matchedCandidates = new Set([...matched.values()]);

    // TCE-01: 未宣言の閾値候補
    const reported01 = new Set<string>();
    for (const candidate of snap.candidates) {
      if (matchedCandidates.has(candidate)) continue;
      if ([...matchedCandidates].some((c) => c.name === candidate.name)) continue;
      if (reported01.has(candidate.name)) continue;
      reported01.add(candidate.name);
      tce01.push({
        categoryId: "TCE-01",
        severity: "medium",
        snapshot: snap.key,
        name: candidate.name,
        detail: `${snap.label}の文書から抽出した閾値「${candidate.name}」（値 ${candidate.value}${
          candidate.unit ?? ""
        } / 出典 ${place(candidate)}）に対応する宣言パラメータが無い。`,
        places: [place(candidate)],
      });
    }

    // TCE-02: 宣言値と文書値の不一致（候補の出現順）
    for (const candidate of snap.candidates) {
      for (const param of snap.declared) {
        if (matched.get(param.name) !== candidate) continue;
        const declaredValue = param.value.replace(/,/g, "").trim();
        const valueMismatch = declaredValue !== candidate.value;
        const unitMismatch = (param.unit ?? "") !== (candidate.unit ?? "");
        if (!valueMismatch && !unitMismatch) continue;
        const detailParts: string[] = [];
        if (valueMismatch) {
          detailParts.push(`値が不一致（宣言 ${param.value} / 文書 ${candidate.rawValue}）`);
        }
        if (unitMismatch) {
          detailParts.push(`単位が不一致（宣言 ${param.unit ?? "-"} / 文書 ${candidate.unit ?? "-"}）`);
        }
        tce02.push({
          categoryId: "TCE-02",
          severity: "high",
          snapshot: snap.key,
          name: param.name,
          detail: `${snap.label}の宣言パラメータ「${param.name}」と文書の記載が食い違っている: ${detailParts.join(
            " / "
          )}。`,
          places: [place(candidate)],
        });
      }
    }

    // TCE-03: 文書に裏付けの無い宣言パラメータ
    const evidence = collectQuantityEvidence(snap.documents);
    for (const param of snap.declared) {
      if (matched.has(param.name)) continue;
      const declaredValue = param.value.replace(/,/g, "").trim();
      const declaredUnit = param.unit ?? "";
      const grounded = evidence.some((e) => {
        if (e.value !== declaredValue) return false;
        if (declaredUnit.length === 0) return true;
        return (e.unit ?? "") === declaredUnit;
      });
      if (grounded) continue;
      tce03.push({
        categoryId: "TCE-03",
        severity: "medium",
        snapshot: snap.key,
        name: param.name,
        detail: `${snap.label}の宣言パラメータ「${param.name}」（値 ${param.value}${
          param.unit ?? ""
        }）に対応する閾値候補も同値の数値表現も投入文書中に見つからない。`,
        places: [],
      });
    }

    // TCE-05: 文書内での値の衝突
    for (const f of findCandidateConflicts(snap.candidates, snap.key)) tce05.push(f);

    // TCE-06: 抽出候補に存在しない承認
    for (const approval of approvals) {
      const approvedValue = snap.key === "before" ? approval.beforeValue : approval.afterValue;
      if (approvedValue === undefined) continue;
      const candidate = firstByName(snap.candidates, approval.name);
      if (candidate && candidate.value === approvedValue) continue;
      tce06.push({
        categoryId: "TCE-06",
        severity: "high",
        snapshot: snap.key,
        name: approval.name,
        detail: candidate
          ? `${snap.label}の承認値「${approvedValue}」が抽出候補「${approval.name}」の値「${candidate.value}」と一致しない。この承認は再展開へ反映しない。`
          : `${snap.label}の文書に承認された名前「${approval.name}」の抽出候補が存在しない。この承認は再展開へ反映しない。`,
        places: candidate ? [place(candidate)] : [],
      });
    }
  }

  // TCE-04: 文書差分と宣言差分の不整合（変更前後の文書が揃っている場合のみ）
  if (params.documentsBefore && params.documentsAfter) {
    const declaredDiffRows = diffThresholdParameters(params.parametersBefore, params.parametersAfter);

    for (const candidateRow of candidateDiffRows) {
      if (!CHANGED_KINDS.has(candidateRow.kind)) continue;
      const declaredRow = declaredDiffRows.find(
        (d) => findMatch({ name: d.name, source: d.source }, [candidateRow]) !== undefined
      );
      if (declaredRow && declaredRow.kind !== "unchanged") continue;
      tce04.push({
        categoryId: "TCE-04",
        severity: "high",
        snapshot: "both",
        name: candidateRow.name,
        detail: `文書では「${candidateRow.name}」が変更されている（${candidateRow.beforeValue ?? "-"} → ${
          candidateRow.afterValue ?? "-"
        } / ${candidateRow.kind}）が、宣言パラメータ表へ未反映である。`,
        places: [candidateRow.beforeSource, candidateRow.afterSource].filter(
          (p): p is string => p !== undefined
        ),
      });
    }

    for (const declaredRow of declaredDiffRows) {
      if (!CHANGED_KINDS.has(declaredRow.kind)) continue;
      const candidateRow = findMatch({ name: declaredRow.name, source: declaredRow.source }, candidateDiffRows);
      if (candidateRow && candidateRow.kind !== "unchanged") continue;
      tce04.push({
        categoryId: "TCE-04",
        severity: "high",
        snapshot: "both",
        name: declaredRow.name,
        detail: `宣言パラメータ表では「${declaredRow.name}」が変更されている（${
          declaredRow.beforeValue ?? "-"
        } → ${declaredRow.afterValue ?? "-"} / ${declaredRow.kind}）が、文書側に変更の裏付けが無い。`,
        places: candidateRow
          ? [candidateRow.beforeSource, candidateRow.afterSource].filter((p): p is string => p !== undefined)
          : [],
      });
    }
  }

  // TCE-07: 未承認の抽出候補
  for (const row of candidateDiffRows) {
    if (row.approval !== "unapproved") continue;
    tce07.push({
      categoryId: "TCE-07",
      severity: "info",
      snapshot: "both",
      name: row.name,
      detail: `抽出候補「${row.name}」（${row.beforeValue ?? "-"} → ${row.afterValue ?? "-"} / ${
        row.kind
      }）は提案のみで、承認されていないため再展開へは反映していない。`,
      places: [row.beforeSource, row.afterSource].filter((p): p is string => p !== undefined),
    });
  }

  return [...tce01, ...tce02, ...tce03, ...tce04, ...tce05, ...tce06, ...tce07];
}

// --- 9. サマリ ---

function countCategory(findings: ThresholdExtractionFinding[], categoryId: string): number {
  return findings.filter((f) => f.categoryId === categoryId).length;
}

export function summarizeThresholdExtraction(
  beforeCandidates: ThresholdParameterCandidate[],
  afterCandidates: ThresholdParameterCandidate[],
  findings: ThresholdExtractionFinding[],
  mergedParameterCount: number
): ThresholdExtractionSummary {
  return {
    beforeCandidateCount: beforeCandidates.length,
    afterCandidateCount: afterCandidates.length,
    undeclaredCount: countCategory(findings, "TCE-01"),
    valueMismatchCount: countCategory(findings, "TCE-02"),
    ungroundedDeclaredCount: countCategory(findings, "TCE-03"),
    diffInconsistencyCount: countCategory(findings, "TCE-04"),
    conflictCount: countCategory(findings, "TCE-05"),
    approvalMismatchCount: countCategory(findings, "TCE-06"),
    unapprovedCount: countCategory(findings, "TCE-07"),
    mergedParameterCount,
  };
}

// --- 10. 分析エントリポイント ---

export interface ThresholdExtractionAnalysis {
  enabled: boolean;
  beforeCandidates: ThresholdParameterCandidate[];
  afterCandidates: ThresholdParameterCandidate[];
  candidateDiffRows: ThresholdCandidateDiffRow[];
  hasBothDocuments: boolean;
  findings: ThresholdExtractionFinding[];
  effectiveBefore: TestCaseParameter[];
  effectiveAfter: TestCaseParameter[];
  summary: ThresholdExtractionSummary;
}

export function analyzeThresholdExtraction(
  params: ThresholdExtractionParams
): ThresholdExtractionAnalysis {
  const enabled = params.documentsBefore !== undefined || params.documentsAfter !== undefined;
  const approvals = params.approvedExtractions ?? [];
  const beforeCandidates = params.documentsBefore
    ? extractThresholdParameterCandidates(params.documentsBefore)
    : [];
  const afterCandidates = params.documentsAfter
    ? extractThresholdParameterCandidates(params.documentsAfter)
    : [];
  const hasBothDocuments = params.documentsBefore !== undefined && params.documentsAfter !== undefined;
  const candidateDiffRows = hasBothDocuments
    ? diffExtractedCandidates(beforeCandidates, afterCandidates, approvals)
    : [];

  const findings = enabled
    ? buildExtractionFindings(params, beforeCandidates, afterCandidates, candidateDiffRows)
    : [];

  const mergedBefore = mergeApprovedExtractions(
    params.parametersBefore,
    beforeCandidates,
    params.approvedExtractions,
    "before"
  );
  const mergedAfter = mergeApprovedExtractions(
    params.parametersAfter,
    afterCandidates,
    params.approvedExtractions,
    "after"
  );

  return {
    enabled,
    beforeCandidates,
    afterCandidates,
    candidateDiffRows,
    hasBothDocuments,
    findings,
    effectiveBefore: mergedBefore.parameters,
    effectiveAfter: mergedAfter.parameters,
    summary: summarizeThresholdExtraction(
      beforeCandidates,
      afterCandidates,
      findings,
      mergedBefore.mergedCount + mergedAfter.mergedCount
    ),
  };
}

// --- 11. レンダリング ---

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

const APPROVAL_LABEL: Record<ThresholdCandidateDiffRow["approval"], string> = {
  approved: "承認済み",
  unapproved: "未承認",
  "approval-mismatch": "承認不一致",
};

function renderCandidateTable(candidates: ThresholdParameterCandidate[]): string[] {
  const lines: string[] = [];
  if (candidates.length === 0) {
    lines.push("- 対象なし");
    return lines;
  }
  lines.push("| 候補名 | 値 | 単位 | 出典 | 章節 | 抽出形式 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const c of candidates) {
    lines.push(
      `| ${escapeCell(c.name)} | ${escapeCell(c.value)} | ${escapeCell(c.unit ?? "-")} | ${escapeCell(
        place(c)
      )} | ${escapeCell(c.heading)} | ${c.form} |`
    );
  }
  return lines;
}

export function renderThresholdExtractionLines(
  analysis: ThresholdExtractionAnalysis,
  criteria: { categories: { id: string; nameJa: string; severity: string; description: string; action: string }[]; notes: string[] },
  digestLines: { before: string[]; after: string[] }
): string[] {
  const lines: string[] = [];
  lines.push("## 0. 投入文書と閾値の自前抽出");
  lines.push("");

  lines.push("### 0.1 投入文書ダイジェスト");
  lines.push("");
  lines.push("変更前:");
  lines.push("");
  if (digestLines.before.length === 0) lines.push("- documentsBefore が未指定");
  else for (const l of digestLines.before) lines.push(l);
  lines.push("");
  lines.push("変更後:");
  lines.push("");
  if (digestLines.after.length === 0) lines.push("- documentsAfter が未指定");
  else for (const l of digestLines.after) lines.push(l);
  lines.push("");

  lines.push("### 0.2 抽出した閾値パラメータ候補");
  lines.push("");
  lines.push("変更前:");
  lines.push("");
  for (const l of renderCandidateTable(analysis.beforeCandidates)) lines.push(l);
  lines.push("");
  lines.push("変更後:");
  lines.push("");
  for (const l of renderCandidateTable(analysis.afterCandidates)) lines.push(l);
  lines.push("");

  lines.push("### 0.3 自前抽出による新旧対照表(提案・未反映)");
  lines.push("");
  if (!analysis.hasBothDocuments) {
    lines.push("- 変更前後いずれかの文書が未指定のため対照表を生成できない");
  } else if (analysis.candidateDiffRows.length === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push("| 候補名 | 変更前 | 変更後 | 変更区分 | 出典(前) | 出典(後) | 承認状態 |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of analysis.candidateDiffRows) {
      lines.push(
        `| ${escapeCell(row.name)} | ${escapeCell(row.beforeValue ?? "-")}${escapeCell(
          row.beforeUnit ?? ""
        )} | ${escapeCell(row.afterValue ?? "-")}${escapeCell(row.afterUnit ?? "")} | ${row.kind} | ${escapeCell(
          row.beforeSource ?? "-"
        )} | ${escapeCell(row.afterSource ?? "-")} | ${APPROVAL_LABEL[row.approval]} |`
      );
    }
  }
  lines.push("");

  lines.push("### 0.4 宣言パラメータ表との突合結果");
  lines.push("");
  if (analysis.findings.length === 0) {
    lines.push("- 指摘なし");
  } else {
    for (const f of analysis.findings) {
      lines.push(
        `- [${f.severity}] ${f.categoryId} ${escapeCell(f.name)}: ${escapeCell(f.detail)}（${
          f.places.join(", ") || "-"
        }）`
      );
    }
  }
  lines.push("");

  lines.push("### 0.5 判定区分と対処指針(自前抽出)");
  lines.push("");
  lines.push("| 区分ID | 区分 | 重大度 | 説明 | 対処 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of criteria.categories) {
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${c.severity} | ${escapeCell(
        c.description
      )} | ${escapeCell(c.action)} |`
    );
  }
  lines.push("");
  for (const note of criteria.notes) {
    lines.push(`- ${escapeCell(note)}`);
  }
  lines.push("");

  lines.push("### 0.6 抽出サマリ");
  lines.push("");
  const s = analysis.summary;
  lines.push(
    `- 抽出候補数(前/後): ${s.beforeCandidateCount} / ${s.afterCandidateCount} / 未宣言: ${s.undeclaredCount} / 値不一致: ${s.valueMismatchCount} / 裏付け無し宣言: ${s.ungroundedDeclaredCount} / 文書差分と宣言差分の不整合: ${s.diffInconsistencyCount} / 文書内値衝突: ${s.conflictCount} / 承認不一致: ${s.approvalMismatchCount} / 未承認候補: ${s.unapprovedCount} / 承認により反映したパラメータ数: ${s.mergedParameterCount}`
  );
  if (analysis.effectiveAfter.length === 0) {
    lines.push(
      "- [high] 実効的な変更後パラメータ表が空。parametersAfter を渡すか、抽出候補を承認すること。"
    );
  }
  lines.push("");

  return lines;
}
