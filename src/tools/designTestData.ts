import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import { renderInspectabilitySection } from "../inspectabilityAnalysis.js";
import {
  renderTestBasisGroundingLines,
  sanitizeTestBasisDocuments,
  testBasisDocumentsInputShape,
  testBasisGroundingSignal,
  testBasisGroundingSummaryLine,
} from "../testBasisGrounding.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testDataDesignCriteria } from "../resources/testDataDesignCriteria.js";
import type {
  DataClassSpec,
  DataLifecycleTransitionSpec,
  DataItemSpec,
  RequiredDataSpec,
  TestBasisGroundingSubject,
  TestCaseCoverageTarget,
  TestDataCaseSpec,
  TestDataCoverageBucket,
  TestDataExclusiveGroup,
  TestDataFinding,
  TestDataMatrixCell,
  TestDataResult,
  TestDataSpec,
  TestDataSupplyRow,
  TestDataSupplyStatus,
  TestDataSubstantiation,
  TestDataTransitionUsage,
  TestDataUnidentifiableRequest,
} from "../types.js";

// design_test_data 固有の決定的エンジン。
// 純関数群で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。

export const DEFAULT_MAX_DATA_CLASSES = 100;
export const DEFAULT_MAX_STATES_PER_CLASS = 50;

/** 決定的検査の Markdown 出力で、同一区分の指摘を丸める件数。findings 配列自体は全件保持する。 */
const FINDING_RENDER_LIMIT = 50;
/** 表・網羅対象一覧の表示上限。結果配列自体は全件保持する。 */
const ROW_RENDER_LIMIT = 200;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function round1(value: number): number {
  return Math.round(value * 1000) / 10;
}

/** 網羅対象ID・description の中で使うため export する（呼び出し側での文字列連結の再実装を防ぐ）。 */
export function dataStateTargetId(dataClassId: string, stateId: string): string {
  return `DL:S:${dataClassId}:${stateId}`;
}

/** 網羅対象ID・description の中で使うため export する（呼び出し側での文字列連結の再実装を防ぐ）。 */
export function dataTransitionTargetId(dataClassId: string, transitionId: string): string {
  return `DL:T:${dataClassId}:${transitionId}`;
}

function stateNameOf(c: DataClassSpec, stateId: string): string {
  return c.states.find((s) => s.id === stateId)?.nameJa ?? stateId;
}

/** DL:S: の本文裏付け規則。状態そのものが本文に現れることを必須にする。
 *  データ区分名・実体ラベル・属性値は補助証跡であり、単独では成立させない。
 *  (制約: 同名状態を持つ区分が複数ある場合の取り違えまでは判別しない) */
export function isDataStateSubstantiated(bodyText: string, c: DataClassSpec, stateId: string): boolean {
  const name = stateNameOf(c, stateId); // 見つからなければ stateId が返る
  return (name.length > 0 && bodyText.includes(name)) || bodyText.includes(stateId);
}

/** DL:T: の本文裏付け規則。遷移を一意に特定できる組合せ
 *  「遷移元状態 かつ (イベント または 遷移先状態)」を必須にする。
 *  (testCaseAnalysis.ts の ST: 判定の fromHit && toHit に揃えた強度) */
export function isDataTransitionSubstantiated(
  bodyText: string, c: DataClassSpec, t: DataLifecycleTransitionSpec
): boolean {
  if (bodyText.includes(t.id)) return true;   // 遷移IDの直接記載は許容（ST: の origin 記載許容に揃える）
  const fromHit = isDataStateSubstantiated(bodyText, c, t.from);
  const toHit = isDataStateSubstantiated(bodyText, c, t.to);
  const eventHit = t.event.trim().length > 0 && bodyText.includes(t.event);
  return fromHit && (eventHit || toHit);
}

function transitionLabel(t: DataLifecycleTransitionSpec, c: DataClassSpec): string {
  return `${stateNameOf(c, t.from)} --${t.event}${t.guard ? `[${t.guard}]` : ""}--> ${stateNameOf(c, t.to)}`;
}

function hasCaseBody(tc: TestDataCaseSpec): boolean {
  return tc.preconditionText !== undefined || tc.stepsText !== undefined;
}

function caseBodyText(tc: TestDataCaseSpec): string {
  return [tc.preconditionText ?? "", ...(tc.stepsText ?? [])].join("\n");
}

/** 同一ケース内の同一要求(dataClassId, stateId, dataItemId, access)を1件へ重複排除する。 */
function dedupeRequiredData(tc: TestDataCaseSpec): TestDataCaseSpec {
  const seen = new Set<string>();
  const requiredData: RequiredDataSpec[] = [];
  for (const rd of tc.requiredData) {
    const key = `${rd.dataClassId} ${rd.stateId} ${rd.dataItemId ?? ""} ${rd.access}`;
    if (seen.has(key)) continue;
    seen.add(key);
    requiredData.push(rd);
  }
  return { ...tc, requiredData };
}

// --- メインエンジン ---

export function computeTestDataDesign(spec: TestDataSpec): TestDataResult {
  const dataClasses = spec.dataClasses;
  const dataItems = spec.dataItems ?? [];
  const testCases = (spec.testCases ?? []).map(dedupeRequiredData);
  const maxDataClasses = spec.maxDataClasses ?? DEFAULT_MAX_DATA_CLASSES;
  const maxStatesPerClass = spec.maxStatesPerClass ?? DEFAULT_MAX_STATES_PER_CLASS;

  const findings: TestDataFinding[] = [];

  const emptyCoverage = (reason: string): TestDataCoverageBucket => ({
    basis: "unavailable",
    total: 0,
    covered: 0,
    uncoveredIds: [],
    reason,
  });

  const skipResult = (skipReason: string): TestDataResult => ({
    generated: false,
    skipReason,
    findings,
    matrix: [],
    transitionUsages: [],
    matrixEvaluated: false,
    supplyRows: [],
    exclusiveGroups: [],
    unidentifiableRequests: [],
    stateCoverage: emptyCoverage(skipReason),
    transitionCoverage: emptyCoverage(skipReason),
  });

  // --- TDC-01: ID重複 ---
  const classIdSeen = new Set<string>();
  for (const c of dataClasses) {
    if (classIdSeen.has(c.id)) {
      findings.push({
        categoryId: "TDC-01",
        severity: "high",
        target: c.id,
        detail: `データ区分ID「${c.id}」が重複して宣言されている。`,
      });
    } else {
      classIdSeen.add(c.id);
    }
  }
  for (const c of dataClasses) {
    const stateSeen = new Set<string>();
    for (const s of c.states) {
      if (stateSeen.has(s.id)) {
        findings.push({
          categoryId: "TDC-01",
          severity: "high",
          target: `${c.id}:${s.id}`,
          detail: `データ区分「${c.id}」内で状態ID「${s.id}」が重複して宣言されている。`,
        });
      } else {
        stateSeen.add(s.id);
      }
    }
    const transSeen = new Set<string>();
    for (const t of c.transitions) {
      if (transSeen.has(t.id)) {
        findings.push({
          categoryId: "TDC-01",
          severity: "high",
          target: `${c.id}:${t.id}`,
          detail: `データ区分「${c.id}」内で遷移ID「${t.id}」が重複して宣言されている。`,
        });
      } else {
        transSeen.add(t.id);
      }
    }
  }
  const itemIdSeen = new Set<string>();
  for (const it of dataItems) {
    if (itemIdSeen.has(it.id)) {
      findings.push({
        categoryId: "TDC-01",
        severity: "high",
        target: it.id,
        detail: `データ実体ID「${it.id}」が重複して宣言されている。`,
      });
    } else {
      itemIdSeen.add(it.id);
    }
  }
  const caseIdSeen = new Set<string>();
  for (const tc of testCases) {
    if (caseIdSeen.has(tc.caseId)) {
      findings.push({
        categoryId: "TDC-01",
        severity: "high",
        target: tc.caseId,
        detail: `テストケースID「${tc.caseId}」が重複して宣言されている。`,
      });
    } else {
      caseIdSeen.add(tc.caseId);
    }
  }

  // --- 索引の構築（重複時は最初の宣言を採用） ---
  const classById = new Map<string, DataClassSpec>();
  for (const c of dataClasses) if (!classById.has(c.id)) classById.set(c.id, c);

  const statesByClass = new Map<string, Set<string>>();
  const transitionsByClass = new Map<string, Map<string, DataLifecycleTransitionSpec>>();
  for (const c of dataClasses) {
    if (statesByClass.has(c.id)) continue; // 重複区分IDは TDC-01 側で対応済み
    statesByClass.set(c.id, new Set(c.states.map((s) => s.id)));
    const tMap = new Map<string, DataLifecycleTransitionSpec>();
    for (const t of c.transitions) if (!tMap.has(t.id)) tMap.set(t.id, t);
    transitionsByClass.set(c.id, tMap);
  }

  // --- TDC-02: 未宣言ID参照 ---
  for (const c of dataClasses) {
    const stateIds = statesByClass.get(c.id) ?? new Set<string>();
    for (const t of c.transitions) {
      if (!stateIds.has(t.from)) {
        findings.push({
          categoryId: "TDC-02",
          severity: "high",
          target: `${c.id}:${t.id}`,
          detail: `遷移「${t.id}」の遷移元「${t.from}」が区分「${c.id}」に宣言されていない。`,
        });
      }
      if (!stateIds.has(t.to)) {
        findings.push({
          categoryId: "TDC-02",
          severity: "high",
          target: `${c.id}:${t.id}`,
          detail: `遷移「${t.id}」の遷移先「${t.to}」が区分「${c.id}」に宣言されていない。`,
        });
      }
    }
  }
  for (const it of dataItems) {
    if (!classById.has(it.dataClassId)) {
      findings.push({
        categoryId: "TDC-02",
        severity: "high",
        target: it.id,
        detail: `データ実体「${it.id}」が未宣言のデータ区分ID「${it.dataClassId}」を参照している。`,
      });
      continue;
    }
    const stateIds = statesByClass.get(it.dataClassId) ?? new Set<string>();
    if (!stateIds.has(it.initialStateId)) {
      findings.push({
        categoryId: "TDC-02",
        severity: "high",
        target: it.id,
        detail: `データ実体「${it.id}」の初期状態「${it.initialStateId}」が区分「${it.dataClassId}」に宣言されていない。`,
      });
    }
  }
  for (const tc of testCases) {
    for (const rd of tc.requiredData) {
      if (!classById.has(rd.dataClassId)) {
        findings.push({
          categoryId: "TDC-02",
          severity: "high",
          target: tc.caseId,
          detail: `ケース「${tc.caseId}」の要求が未宣言のデータ区分ID「${rd.dataClassId}」を参照している。`,
        });
        continue;
      }
      const stateIds = statesByClass.get(rd.dataClassId) ?? new Set<string>();
      if (!stateIds.has(rd.stateId)) {
        findings.push({
          categoryId: "TDC-02",
          severity: "high",
          target: tc.caseId,
          detail: `ケース「${tc.caseId}」の要求が区分「${rd.dataClassId}」に宣言されていない状態「${rd.stateId}」を参照している。`,
        });
      }
      if (rd.dataItemId !== undefined && !itemIdSeen.has(rd.dataItemId)) {
        findings.push({
          categoryId: "TDC-02",
          severity: "high",
          target: tc.caseId,
          detail: `ケース「${tc.caseId}」の要求が未宣言のデータ実体ID「${rd.dataItemId}」を参照している。`,
        });
      }
      if (rd.resultStateId !== undefined && !stateIds.has(rd.resultStateId)) {
        findings.push({
          categoryId: "TDC-02",
          severity: "high",
          target: tc.caseId,
          detail: `ケース「${tc.caseId}」の要求が区分「${rd.dataClassId}」に宣言されていない結果状態「${rd.resultStateId}」を参照している。`,
        });
      }
      if (
        rd.transitionId !== undefined &&
        !(transitionsByClass.get(rd.dataClassId) ?? new Map()).has(rd.transitionId)
      ) {
        findings.push({
          categoryId: "TDC-02",
          severity: "high",
          target: tc.caseId,
          detail: `ケース「${tc.caseId}」の要求が区分「${rd.dataClassId}」に宣言されていない遷移ID「${rd.transitionId}」を参照している。`,
        });
      }
    }
  }

  // --- TDC-03: 初期状態の宣言不正 ---
  for (const c of dataClasses) {
    const initials = c.states.filter((s) => s.isInitial === true);
    if (initials.length !== 1) {
      findings.push({
        categoryId: "TDC-03",
        severity: "high",
        target: c.id,
        detail: `データ区分「${c.id}」の初期状態(isInitial)の宣言が${initials.length}件であり、1件である必要がある。`,
      });
    }
  }

  // --- TDC-04: 遷移イベントの未記入 ---
  for (const c of dataClasses) {
    for (const t of c.transitions) {
      if (t.event.trim().length === 0) {
        findings.push({
          categoryId: "TDC-04",
          severity: "high",
          target: `${c.id}:${t.id}`,
          detail: `遷移「${t.id}」にイベント名が記入されていない。`,
        });
      }
    }
  }

  // --- 致命的な指摘があれば構造を算出しない ---
  const blocking = findings.filter((f) => f.severity === "high");
  if (blocking.length > 0) {
    const categories = [...new Set(blocking.map((f) => f.categoryId))].sort().join(", ");
    return skipResult(
      `入力の構造に致命的な指摘(${categories})があるためマトリクス・被覆の算出を行わなかった`
    );
  }

  // --- TDC-17: 上限超過 ---
  if (dataClasses.length > maxDataClasses) {
    findings.push({
      categoryId: "TDC-17",
      severity: "info",
      target: "dataClasses",
      detail: `データ区分数 ${dataClasses.length} 件が上限 ${maxDataClasses} 件を超えるため算出を行わなかった。`,
    });
    return skipResult(
      `データ区分数 ${dataClasses.length} 件が上限 ${maxDataClasses} 件を超えるため算出を行わなかった`
    );
  }
  for (const c of dataClasses) {
    if (c.states.length > maxStatesPerClass) {
      findings.push({
        categoryId: "TDC-17",
        severity: "info",
        target: c.id,
        detail: `データ区分「${c.id}」の状態数 ${c.states.length} 件が上限 ${maxStatesPerClass} 件を超えるため算出を行わなかった。`,
      });
      return skipResult(
        `データ区分「${c.id}」の状態数 ${c.states.length} 件が上限 ${maxStatesPerClass} 件を超えるため算出を行わなかった`
      );
    }
  }

  // --- 遷移グラフ・初期状態からの到達可能性(BFS、循環に耐える) ---
  const initialStateOf = new Map<string, string>();
  const outgoingByClass = new Map<string, Map<string, DataLifecycleTransitionSpec[]>>();
  for (const c of dataClasses) {
    const initial = c.states.find((s) => s.isInitial === true);
    initialStateOf.set(c.id, (initial as { id: string }).id);
    const map = new Map<string, DataLifecycleTransitionSpec[]>();
    for (const t of c.transitions) {
      const list = map.get(t.from) ?? [];
      list.push(t);
      map.set(t.from, list);
    }
    outgoingByClass.set(c.id, map);
  }

  function reachableStates(classId: string, fromStateId: string): Set<string> {
    const visited = new Set<string>([fromStateId]);
    const queue: string[] = [fromStateId];
    const outgoing = outgoingByClass.get(classId) ?? new Map<string, DataLifecycleTransitionSpec[]>();
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const t of outgoing.get(cur) ?? []) {
        if (visited.has(t.to)) continue;
        visited.add(t.to);
        queue.push(t.to);
      }
    }
    return visited;
  }

  // --- TDC-05: 到達不能な状態 ---
  for (const c of dataClasses) {
    const reachable = reachableStates(c.id, initialStateOf.get(c.id) as string);
    for (const s of c.states) {
      if (reachable.has(s.id)) continue;
      findings.push({
        categoryId: "TDC-05",
        severity: "medium",
        target: `${c.id}:${s.id}`,
        detail: `状態「${s.nameJa}」は初期状態から到達できない。`,
      });
    }
  }

  // --- TDC-06: デッドエンド状態 ---
  for (const c of dataClasses) {
    const outgoing = outgoingByClass.get(c.id) ?? new Map<string, DataLifecycleTransitionSpec[]>();
    for (const s of c.states) {
      if (s.isTerminal === true) continue;
      if ((outgoing.get(s.id) ?? []).length > 0) continue;
      findings.push({
        categoryId: "TDC-06",
        severity: "medium",
        target: `${c.id}:${s.id}`,
        detail: `状態「${s.nameJa}」に出て行く遷移が無く、終端(isTerminal)としても宣言されていない。`,
      });
    }
  }

  // --- データ区分×ライフサイクル状態マトリクス ---
  const matrixEvaluated = testCases.length > 0;
  const matrix: TestDataMatrixCell[] = [];
  for (const c of dataClasses) {
    for (const s of c.states) {
      const requestingCaseIds: string[] = [];
      for (const tc of testCases) {
        if (tc.requiredData.some((rd) => rd.dataClassId === c.id && rd.stateId === s.id)) {
          requestingCaseIds.push(tc.caseId);
        }
      }
      matrix.push({ dataClassId: c.id, stateId: s.id, requestingCaseIds, unused: requestingCaseIds.length === 0 });
    }
  }
  if (matrixEvaluated) {
    for (const cell of matrix) {
      if (!cell.unused) continue;
      const c = classById.get(cell.dataClassId) as DataClassSpec;
      findings.push({
        categoryId: "TDC-07",
        severity: "medium",
        target: `${cell.dataClassId}:${cell.stateId}`,
        detail: `状態「${c.nameJa} / ${stateNameOf(c, cell.stateId)}」を要求するテストケースが1件も無い。`,
      });
    }
  }

  // --- データ実体・供給トレーサビリティ・被覆判定に使う識別子の照合 ---
  const itemById = new Map(dataItems.map((it) => [it.id, it] as const));
  const itemsByClass = new Map<string, DataItemSpec[]>();
  for (const it of dataItems) {
    const list = itemsByClass.get(it.dataClassId) ?? [];
    list.push(it);
    itemsByClass.set(it.dataClassId, list);
  }

  interface IdentityEntry {
    caseId: string;
    dataClassId: string;
    stateId: string;
    dataItemId?: string;
    access: RequiredDataSpec["access"];
    key?: string;
    unidentifiable: boolean;
  }

  function identityKeyFor(
    rd: RequiredDataSpec,
    c: DataClassSpec,
    supplyingItemIds: string[]
  ): { key?: string; unidentifiable: boolean } {
    if (rd.dataItemId !== undefined) {
      return { key: `item:${rd.dataItemId}`, unidentifiable: false };
    }
    const keyAttrs = c.keyAttributes;
    if (!keyAttrs || keyAttrs.length === 0) {
      return { key: `class:${c.id}`, unidentifiable: false };
    }
    const candidates = supplyingItemIds
      .map((id) => itemById.get(id))
      .filter((it): it is DataItemSpec => it !== undefined && keyAttrs.every((k) => (it.attributes ?? {})[k] !== undefined));
    if (candidates.length === 0) return { unidentifiable: true };
    const signature = (it: DataItemSpec) => keyAttrs.map((k) => (it.attributes ?? {})[k] ?? "").join(" ");
    const signatures = new Set(candidates.map(signature));
    if (signatures.size !== 1) return { unidentifiable: true };
    return { key: `class:${c.id}:${signature(candidates[0])}`, unidentifiable: false };
  }

  const supplyRows: TestDataSupplyRow[] = [];
  const matchedTransitionIds: (string | undefined)[] = [];
  const identityEntries: IdentityEntry[] = [];

  const bodyTextByCase = new Map<string, string>();

  for (const tc of testCases) {
    const bodyAvailable = hasCaseBody(tc);
    const bodyText = caseBodyText(tc);
    if (bodyAvailable) bodyTextByCase.set(tc.caseId, bodyText);
    for (const rd of tc.requiredData) {
      const c = classById.get(rd.dataClassId) as DataClassSpec;

      // --- 供給元判定(TDC-10) ---
      let supplyStatus: TestDataSupplyStatus;
      let supplyingItemIds: string[] = [];
      if (dataItems.length === 0) {
        supplyStatus = "unchecked";
      } else if (rd.dataItemId !== undefined) {
        const item = itemById.get(rd.dataItemId) as DataItemSpec;
        const reachable = reachableStates(item.dataClassId, item.initialStateId);
        supplyStatus = reachable.has(rd.stateId) ? "ok" : "no-supplier";
        if (supplyStatus === "ok") supplyingItemIds = [item.id];
      } else {
        const candidates = (itemsByClass.get(rd.dataClassId) ?? []).filter((it) =>
          reachableStates(it.dataClassId, it.initialStateId).has(rd.stateId)
        );
        supplyingItemIds = candidates.map((it) => it.id);
        supplyStatus = candidates.length > 0 ? "ok" : "no-supplier";
      }

      // --- 本文裏付け判定(TDC-11) ---
      let substantiation: TestDataSubstantiation;
      if (!bodyAvailable) {
        substantiation = "unchecked";
      } else {
        substantiation = isDataStateSubstantiated(bodyText, c, rd.stateId) ? "yes" : "no";
      }

      // --- update要求の遷移一意判定(TDC-16 / 遷移通過 / 遷移被覆) ---
      let matchedTransitionId: string | undefined;
      if (rd.access === "update") {
        if (rd.transitionId !== undefined) {
          const t = (transitionsByClass.get(rd.dataClassId) ?? new Map()).get(rd.transitionId);
          if (t && t.from === rd.stateId) matchedTransitionId = t.id;
        } else if (rd.resultStateId !== undefined) {
          const candidates = c.transitions.filter((t) => t.from === rd.stateId && t.to === rd.resultStateId);
          if (candidates.length === 1) matchedTransitionId = candidates[0].id;
        }
      }

      supplyRows.push({
        caseId: tc.caseId,
        dataClassId: rd.dataClassId,
        stateId: rd.stateId,
        dataItemId: rd.dataItemId,
        access: rd.access,
        resultStateId: rd.resultStateId,
        transitionId: rd.transitionId,
        supplyingItemIds,
        supplyStatus,
        substantiation,
      });
      matchedTransitionIds.push(matchedTransitionId);

      const identity = identityKeyFor(rd, c, supplyingItemIds);
      identityEntries.push({
        caseId: tc.caseId,
        dataClassId: rd.dataClassId,
        stateId: rd.stateId,
        dataItemId: rd.dataItemId,
        access: rd.access,
        key: identity.key,
        unidentifiable: identity.unidentifiable,
      });
    }
  }

  // --- TDC-10 / TDC-11 ---
  for (const row of supplyRows) {
    if (row.supplyStatus === "no-supplier") {
      findings.push({
        categoryId: "TDC-10",
        severity: "high",
        target: row.caseId,
        detail: `ケース「${row.caseId}」が要求する (${row.dataClassId}, ${row.stateId}) へ初期状態から到達可能な実体が無い。`,
      });
    }
  }
  for (const row of supplyRows) {
    if (row.substantiation === "no") {
      findings.push({
        categoryId: "TDC-11",
        severity: "medium",
        target: row.caseId,
        detail: `ケース「${row.caseId}」の要求 (${row.dataClassId}, ${row.stateId}) の状態名がケース本文（前提条件・手順）に現れない。区分名・実体ラベル・属性値だけでは裏付けとして成立しない。`,
      });
    }
  }

  // --- TDC-12: 供給過剰 ---
  if (dataItems.length > 0) {
    const usedItemIds = new Set<string>();
    for (const row of supplyRows) {
      for (const id of row.supplyingItemIds) usedItemIds.add(id);
      if (row.dataItemId !== undefined) usedItemIds.add(row.dataItemId);
    }
    for (const it of dataItems) {
      if (usedItemIds.has(it.id)) continue;
      findings.push({
        categoryId: "TDC-12",
        severity: "medium",
        target: it.id,
        detail: `データ実体「${it.id}」を使用するテストケースが1件も無い。`,
      });
    }
  }

  // --- TDC-09: どのケースからも要求されないデータ区分 ---
  if (matrixEvaluated) {
    for (const c of dataClasses) {
      const used = testCases.some((tc) => tc.requiredData.some((rd) => rd.dataClassId === c.id));
      if (used) continue;
      findings.push({
        categoryId: "TDC-09",
        severity: "medium",
        target: c.id,
        detail: `データ区分「${c.nameJa}」を要求するテストケースが1件も無い。`,
      });
    }
  }

  // --- 遷移通過状況(TDC-08) ---
  const transitionUsages: TestDataTransitionUsage[] = [];
  for (const c of dataClasses) {
    for (const t of c.transitions) {
      const passingCaseIds: string[] = [];
      const seenCase = new Set<string>();
      for (let i = 0; i < supplyRows.length; i++) {
        const row = supplyRows[i];
        if (matchedTransitionIds[i] !== t.id) continue;
        if (row.dataClassId !== c.id) continue;
        if (seenCase.has(row.caseId)) continue;
        seenCase.add(row.caseId);
        passingCaseIds.push(row.caseId);
      }
      transitionUsages.push({ dataClassId: c.id, transitionId: t.id, passingCaseIds, unused: passingCaseIds.length === 0 });
    }
  }
  if (matrixEvaluated) {
    for (const usage of transitionUsages) {
      if (!usage.unused) continue;
      const c = classById.get(usage.dataClassId) as DataClassSpec;
      const t = (transitionsByClass.get(usage.dataClassId) as Map<string, DataLifecycleTransitionSpec>).get(
        usage.transitionId
      ) as DataLifecycleTransitionSpec;
      findings.push({
        categoryId: "TDC-08",
        severity: "medium",
        target: `${usage.dataClassId}:${usage.transitionId}`,
        detail: `遷移「${transitionLabel(t, c)}」を通過する update 要求が無い。`,
      });
    }
  }

  // --- TDC-16: 不正遷移の要求 ---
  for (let i = 0; i < supplyRows.length; i++) {
    const row = supplyRows[i];
    if (row.access !== "update") continue;
    if (row.resultStateId === undefined && row.transitionId === undefined) continue;
    if (matchedTransitionIds[i] !== undefined) continue;
    findings.push({
      categoryId: "TDC-16",
      severity: "high",
      target: row.caseId,
      detail: `ケース「${row.caseId}」の update 要求が、状態「${row.stateId}」から成立する遷移(resultStateId/transitionId)を指定していない。`,
    });
  }

  // --- 排他グループ(TDC-13 / TDC-15) ---
  const groupsByKey = new Map<
    string,
    { dataClassId: string; dataItemId?: string; updatingCaseIds: Set<string>; sharedCaseIds: Set<string> }
  >();
  const unidentifiableRequests: TestDataUnidentifiableRequest[] = [];
  for (const entry of identityEntries) {
    if (entry.unidentifiable || entry.key === undefined) {
      unidentifiableRequests.push({
        caseId: entry.caseId,
        dataClassId: entry.dataClassId,
        stateId: entry.stateId,
        access: entry.access,
      });
      continue;
    }
    let g = groupsByKey.get(entry.key);
    if (!g) {
      g = { dataClassId: entry.dataClassId, dataItemId: entry.dataItemId, updatingCaseIds: new Set(), sharedCaseIds: new Set() };
      groupsByKey.set(entry.key, g);
    }
    g.sharedCaseIds.add(entry.caseId);
    if (entry.access === "update") g.updatingCaseIds.add(entry.caseId);
  }
  const exclusiveGroups: TestDataExclusiveGroup[] = [...groupsByKey.entries()].map(([key, g]) => ({
    identityKey: key,
    dataClassId: g.dataClassId,
    dataItemId: g.dataItemId,
    updatingCaseIds: [...g.updatingCaseIds],
    sharedCaseIds: [...g.sharedCaseIds],
  }));

  for (const g of exclusiveGroups) {
    if (g.updatingCaseIds.length < 2) continue;
    findings.push({
      categoryId: "TDC-13",
      severity: "medium",
      target: g.identityKey,
      detail: `同一データ（${g.identityKey}）を update するテストケースが${g.updatingCaseIds.length}件ある(${g.updatingCaseIds.join(
        ", "
      )})。実行順序または排他制御を明示すること。`,
    });
  }

  // --- TDC-14: 共有方針(shared)と update要求の不一致 ---
  for (const c of dataClasses) {
    if (c.sharingPolicy !== "shared") continue;
    const hasUpdate = supplyRows.some((r) => r.dataClassId === c.id && r.access === "update");
    if (!hasUpdate) continue;
    findings.push({
      categoryId: "TDC-14",
      severity: "high",
      target: c.id,
      detail: `共有方針(shared)を宣言したデータ区分「${c.nameJa}」に update 要求が存在する。`,
    });
  }

  // --- TDC-15: 共有方針(exclusive)と共有実体の不一致 ---
  for (const g of exclusiveGroups) {
    const c = classById.get(g.dataClassId) as DataClassSpec;
    if (c.sharingPolicy !== "exclusive") continue;
    if (g.sharedCaseIds.length < 2) continue;
    findings.push({
      categoryId: "TDC-15",
      severity: "medium",
      target: g.identityKey,
      detail: `排他方針(exclusive)を宣言したデータ区分「${c.nameJa}」の同一データ（${g.identityKey}）を${g.sharedCaseIds.length}件のケース(${g.sharedCaseIds.join(
        ", "
      )})が共有している。`,
    });
  }

  // --- TDC-18: 状態変化前提の区分に update 要求が無い ---
  const STATE_CHANGING_KINDS = new Set(["counter", "transaction", "external-settlement"]);
  for (const c of dataClasses) {
    if (!c.kind || !STATE_CHANGING_KINDS.has(c.kind)) continue;
    const hasUpdate = supplyRows.some((r) => r.dataClassId === c.id && r.access === "update");
    if (hasUpdate) continue;
    findings.push({
      categoryId: "TDC-18",
      severity: "medium",
      target: c.id,
      detail: `データ区分「${c.nameJa}」(${c.kind})に update 要求が1件も無い。状態が変わる前提の区分なのに読み取りしか設計されていない。`,
    });
  }

  // --- 状態被覆・遷移被覆 ---
  const substantiationBasis: "case-body" | "unavailable" =
    testCases.length > 0 && testCases.some(hasCaseBody) ? "case-body" : "unavailable";
  const unavailableReason =
    testCases.length === 0 ? "テストケースが未指定である" : "ケース本文(前提条件・手順)が1件も指定されていない";

  const totalStates = dataClasses.reduce((n, c) => n + c.states.length, 0);
  let stateCoverage: TestDataCoverageBucket;
  if (substantiationBasis === "unavailable") {
    stateCoverage = { basis: "unavailable", total: totalStates, covered: 0, uncoveredIds: [], reason: unavailableReason };
  } else {
    const coveredKeys = new Set<string>();
    for (const row of supplyRows) {
      if (row.substantiation !== "yes") continue;
      coveredKeys.add(dataStateTargetId(row.dataClassId, row.stateId));
    }
    const allIds: string[] = [];
    for (const c of dataClasses) for (const s of c.states) allIds.push(dataStateTargetId(c.id, s.id));
    const covered = allIds.filter((id) => coveredKeys.has(id)).length;
    stateCoverage = {
      basis: "case-body",
      total: totalStates,
      covered,
      ratioPercent: totalStates === 0 ? 0 : round1(covered / totalStates),
      uncoveredIds: allIds.filter((id) => !coveredKeys.has(id)),
    };
  }

  const totalTransitions = dataClasses.reduce((n, c) => n + c.transitions.length, 0);
  let transitionCoverage: TestDataCoverageBucket;
  if (totalTransitions === 0) {
    transitionCoverage = {
      basis: "unavailable",
      total: 0,
      covered: 0,
      uncoveredIds: [],
      reason: "遷移が1件も宣言されていない",
    };
  } else if (substantiationBasis === "unavailable") {
    transitionCoverage = {
      basis: "unavailable",
      total: totalTransitions,
      covered: 0,
      uncoveredIds: [],
      reason: unavailableReason,
    };
  } else {
    const coveredKeys = new Set<string>();
    for (let i = 0; i < supplyRows.length; i++) {
      const transitionId = matchedTransitionIds[i];
      if (transitionId === undefined) continue;
      const row = supplyRows[i];
      if (row.substantiation !== "yes") continue;
      const bodyText = bodyTextByCase.get(row.caseId);
      if (bodyText === undefined) continue;
      const c = classById.get(row.dataClassId);
      const t = c ? transitionsByClass.get(row.dataClassId)?.get(transitionId) : undefined;
      if (!c || !t || !isDataTransitionSubstantiated(bodyText, c, t)) continue;
      coveredKeys.add(dataTransitionTargetId(row.dataClassId, transitionId));
    }
    const allIds: string[] = [];
    for (const c of dataClasses) for (const t of c.transitions) allIds.push(dataTransitionTargetId(c.id, t.id));
    const covered = allIds.filter((id) => coveredKeys.has(id)).length;
    transitionCoverage = {
      basis: "case-body",
      total: totalTransitions,
      covered,
      ratioPercent: round1(covered / totalTransitions),
      uncoveredIds: allIds.filter((id) => !coveredKeys.has(id)),
    };
  }

  return {
    generated: true,
    findings,
    matrix,
    transitionUsages,
    matrixEvaluated,
    supplyRows,
    exclusiveGroups,
    unidentifiableRequests,
    stateCoverage,
    transitionCoverage,
  };
}

export function buildTestDataCoverageTargets(spec: TestDataSpec): TestCaseCoverageTarget[] {
  const result = computeTestDataDesign(spec);
  if (!result.generated) return [];

  const targets: TestCaseCoverageTarget[] = [];
  for (const c of spec.dataClasses) {
    for (const s of c.states) {
      targets.push({
        id: dataStateTargetId(c.id, s.id),
        techniqueId: "data-lifecycle-test",
        description: `${c.nameJa} / ${s.nameJa}`,
        origin: c.id,
      });
    }
    for (const t of c.transitions) {
      targets.push({
        id: dataTransitionTargetId(c.id, t.id),
        techniqueId: "data-lifecycle-test",
        description: `${c.nameJa}: ${transitionLabel(t, c)}`,
        origin: c.id,
      });
    }
  }
  return targets;
}

// --- Markdown レンダリング ---

function kindLabel(kind: string | undefined): string {
  if (!kind) return "-";
  const found = testDataDesignCriteria.dataKinds.find((k) => k.kind === kind);
  return found ? found.nameJa : kind;
}

function sharingPolicyLabel(policy: string | undefined): string {
  if (policy === "shared") return "共有(shared)";
  if (policy === "exclusive") return "排他(exclusive)";
  if (policy === "per-case") return "ケース専用(per-case)";
  return "-";
}

/**
 * テストベース実在照合の対象を組み立てる。
 * 区分ID・状態ID・遷移ID・ケースIDのような入力内部で採番される値、
 * および volume / owner / preparation（実装都合の記述）は対象にしない。
 */
export function collectTestDataGroundingSubjects(spec: TestDataSpec): TestBasisGroundingSubject[] {
  const subjects: TestBasisGroundingSubject[] = [];
  spec.dataClasses.forEach((c, i) => {
    subjects.push({
      kind: "label",
      place: `dataClasses[${i}].nameJa`,
      target: c.id,
      fieldLabel: "データ区分名",
      text: c.nameJa,
    });
    if (c.description !== undefined) {
      subjects.push({
        kind: "quotation",
        place: `dataClasses[${i}].description`,
        target: c.id,
        fieldLabel: "データ区分の説明",
        text: c.description,
      });
    }
    (c.keyAttributes ?? []).forEach((attr, j) => {
      subjects.push({
        kind: "label",
        place: `dataClasses[${i}].keyAttributes[${j}]`,
        target: c.id,
        fieldLabel: "鍵属性名",
        text: attr,
      });
    });
    (c.states ?? []).forEach((st, j) => {
      subjects.push({
        kind: "label",
        place: `dataClasses[${i}].states[${j}].nameJa`,
        target: `${c.id}/${st.id}`,
        fieldLabel: "状態名",
        text: st.nameJa,
      });
      if (st.definition !== undefined) {
        subjects.push({
          kind: "quotation",
          place: `dataClasses[${i}].states[${j}].definition`,
          target: `${c.id}/${st.id}`,
          fieldLabel: "状態定義",
          text: st.definition,
        });
      }
    });
    (c.transitions ?? []).forEach((tr, j) => {
      subjects.push({
        kind: "label",
        place: `dataClasses[${i}].transitions[${j}].event`,
        target: `${c.id}/${tr.id}`,
        fieldLabel: "遷移イベント名",
        text: tr.event,
      });
      if (tr.guard !== undefined) {
        subjects.push({
          kind: "quotation",
          place: `dataClasses[${i}].transitions[${j}].guard`,
          target: `${c.id}/${tr.id}`,
          fieldLabel: "ガード条件",
          text: tr.guard,
        });
      }
    });
  });
  (spec.dataItems ?? []).forEach((item, i) => {
    subjects.push({
      kind: "label",
      place: `dataItems[${i}].label`,
      target: item.id,
      fieldLabel: "データ実体ラベル",
      text: item.label,
    });
  });
  (spec.testCases ?? []).forEach((tc, i) => {
    if (tc.preconditionText !== undefined) {
      subjects.push({
        kind: "quotation",
        place: `testCases[${i}].preconditionText`,
        target: tc.caseId,
        fieldLabel: "ケース前提",
        text: tc.preconditionText,
      });
    }
    (tc.stepsText ?? []).forEach((text, j) => {
      subjects.push({
        kind: "quotation",
        place: `testCases[${i}].stepsText[${j}]`,
        target: tc.caseId,
        fieldLabel: "ケース手順",
        text,
      });
    });
  });
  return subjects;
}

export function renderTestData(spec: TestDataSpec): string {
  const basisDocuments =
    spec.testBasisDocuments === undefined
      ? undefined
      : sanitizeTestBasisDocuments(spec.testBasisDocuments);
  const groundingSubjects = collectTestDataGroundingSubjects(spec);
  const result = computeTestDataDesign(spec);
  const dataClasses = spec.dataClasses;
  const dataItems = spec.dataItems ?? [];
  const testCases = spec.testCases ?? [];
  const classById = new Map(dataClasses.map((c) => [c.id, c] as const));

  const lines: string[] = [];
  lines.push("# テストデータ設計結果");
  lines.push("");
  if (spec.title) {
    lines.push(`- 対象: ${spec.title}`);
    lines.push("");
  }

  const skipLine = (): void => {
    lines.push(`- 未算出(理由: ${escapeCell(result.skipReason ?? "")})`);
    lines.push("");
  };

  // --- 1. データ区分一覧 ---
  lines.push("## 1. データ区分一覧");
  lines.push("");
  lines.push("| 区分ID | 名称 | 種別 | 準備担当 | 調達方法 | 共有方針 | 状態数 | 遷移数 | 実体数 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of dataClasses) {
    const itemCount = dataItems.filter((it) => it.dataClassId === c.id).length;
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${escapeCell(kindLabel(c.kind))} | ${escapeCell(
        c.owner ?? "-"
      )} | ${escapeCell(c.preparation ?? "-")} | ${escapeCell(sharingPolicyLabel(c.sharingPolicy))} | ${
        c.states.length
      } | ${c.transitions.length} | ${itemCount} |`
    );
  }
  lines.push("");

  // --- 2. データ区分×ライフサイクル状態マトリクス ---
  lines.push("## 2. データ区分×ライフサイクル状態マトリクス");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push("| 区分:状態 | 名称 | 要求ケース数 | 要求ケースID | 未使用 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const cell of result.matrix.slice(0, ROW_RENDER_LIMIT)) {
      const c = classById.get(cell.dataClassId) as DataClassSpec;
      const unusedMark = result.matrixEvaluated && cell.unused ? "未使用" : "-";
      lines.push(
        `| ${escapeCell(`${cell.dataClassId}:${cell.stateId}`)} | ${escapeCell(
          `${c.nameJa} / ${stateNameOf(c, cell.stateId)}`
        )} | ${cell.requestingCaseIds.length} | ${escapeCell(
          cell.requestingCaseIds.length === 0 ? "-" : cell.requestingCaseIds.join(", ")
        )} | ${unusedMark} |`
      );
    }
    lines.push("");
    if (result.matrix.length > ROW_RENDER_LIMIT) {
      lines.push(`- 他 ${result.matrix.length - ROW_RENDER_LIMIT} 件（表示を ${ROW_RENDER_LIMIT} 件に丸めた）`);
      lines.push("");
    }
    if (!result.matrixEvaluated) {
      lines.push("- テストケース未指定のため未使用判定を行わなかった。");
      lines.push("");
    }
  }

  // --- 3. 状態遷移一覧と通過ケース ---
  lines.push("## 3. 状態遷移一覧と通過ケース");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push("| 区分:遷移 | 内容 | 通過ケース数 | 通過ケースID | 未使用 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const usage of result.transitionUsages.slice(0, ROW_RENDER_LIMIT)) {
      const c = classById.get(usage.dataClassId) as DataClassSpec;
      const t = c.transitions.find((tt) => tt.id === usage.transitionId) as DataLifecycleTransitionSpec;
      const unusedMark = result.matrixEvaluated && usage.unused ? "未使用" : "-";
      lines.push(
        `| ${escapeCell(`${usage.dataClassId}:${usage.transitionId}`)} | ${escapeCell(
          `${c.nameJa}: ${transitionLabel(t, c)}`
        )} | ${usage.passingCaseIds.length} | ${escapeCell(
          usage.passingCaseIds.length === 0 ? "-" : usage.passingCaseIds.join(", ")
        )} | ${unusedMark} |`
      );
    }
    lines.push("");
    if (result.transitionUsages.length > ROW_RENDER_LIMIT) {
      lines.push(
        `- 他 ${result.transitionUsages.length - ROW_RENDER_LIMIT} 件（表示を ${ROW_RENDER_LIMIT} 件に丸めた）`
      );
      lines.push("");
    }
    if (!result.matrixEvaluated) {
      lines.push("- テストケース未指定のため未使用判定を行わなかった。");
      lines.push("");
    }
  }

  // --- 4. データ実体（管理表）一覧 ---
  lines.push("## 4. データ実体（管理表）一覧");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else if (dataItems.length === 0) {
    lines.push("- 宣言なし");
    lines.push("");
  } else {
    lines.push("| 実体ID | 区分 | ラベル | 初期状態 | 到達可能状態 | 使用ケース |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const it of dataItems.slice(0, ROW_RENDER_LIMIT)) {
      const c = classById.get(it.dataClassId);
      const reachableIds = c
        ? [...reachableStatesForRender(spec, it.dataClassId, it.initialStateId)]
        : [];
      const reachableLabel = c
        ? reachableIds.map((id) => stateNameOf(c, id)).join(", ")
        : "-";
      const usedCaseIds = [
        ...new Set(
          result.supplyRows
            .filter((r) => r.dataItemId === it.id || r.supplyingItemIds.includes(it.id))
            .map((r) => r.caseId)
        ),
      ];
      lines.push(
        `| ${escapeCell(it.id)} | ${escapeCell(it.dataClassId)} | ${escapeCell(it.label)} | ${escapeCell(
          c ? stateNameOf(c, it.initialStateId) : it.initialStateId
        )} | ${escapeCell(reachableLabel)} | ${escapeCell(usedCaseIds.length === 0 ? "なし" : usedCaseIds.join(", "))} |`
      );
    }
    lines.push("");
    if (dataItems.length > ROW_RENDER_LIMIT) {
      lines.push(`- 他 ${dataItems.length - ROW_RENDER_LIMIT} 件（表示を ${ROW_RENDER_LIMIT} 件に丸めた）`);
      lines.push("");
    }
  }

  // --- 5. データ×テストケース供給トレーサビリティ ---
  lines.push("## 5. データ×テストケース供給トレーサビリティ");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else if (testCases.length === 0) {
    lines.push("- 宣言なし（テストケース未指定）");
    lines.push("");
  } else {
    lines.push("| ケースID | 要求データ | アクセス | 供給元実体 | 裏付け |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of result.supplyRows.slice(0, ROW_RENDER_LIMIT)) {
      const supplyLabel =
        row.supplyStatus === "unchecked"
          ? "未宣言"
          : row.supplyStatus === "no-supplier"
            ? "供給元不在"
            : row.supplyingItemIds.join(", ");
      const substantiationLabel =
        row.substantiation === "unchecked" ? "未照合" : row.substantiation === "yes" ? "あり" : "なし";
      lines.push(
        `| ${escapeCell(row.caseId)} | ${escapeCell(`${row.dataClassId}:${row.stateId}`)} | ${row.access} | ${escapeCell(
          supplyLabel
        )} | ${substantiationLabel} |`
      );
    }
    lines.push("");
    if (result.supplyRows.length > ROW_RENDER_LIMIT) {
      lines.push(`- 他 ${result.supplyRows.length - ROW_RENDER_LIMIT} 件（表示を ${ROW_RENDER_LIMIT} 件に丸めた）`);
      lines.push("");
    }
  }

  // --- 6. 排他・実行順序が必要な組合せ ---
  lines.push("## 6. 排他・実行順序が必要な組合せ");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const exclusivePairs = result.exclusiveGroups.filter((g) => g.updatingCaseIds.length >= 2);
    if (exclusivePairs.length === 0) {
      lines.push("- 該当なし");
      lines.push("");
    } else {
      lines.push("| データ同定キー | データ区分 | 該当ケースID | 推奨対応 |");
      lines.push("| --- | --- | --- | --- |");
      for (const g of exclusivePairs.slice(0, ROW_RENDER_LIMIT)) {
        lines.push(
          `| ${escapeCell(g.identityKey)} | ${escapeCell(g.dataClassId)} | ${escapeCell(
            g.updatingCaseIds.join(", ")
          )} | 実行順序を明示するか排他制御を行う、または専用データへ分離する |`
        );
      }
      lines.push("");
    }
    if (result.unidentifiableRequests.length > 0) {
      lines.push(
        `- 同定不能(${result.unidentifiableRequests.length}件、keyAttributes の値が実体間で揃わないため同一データとして識別できなかった要求): ${result.unidentifiableRequests
          .map((u) => `${u.caseId}(${u.dataClassId})`)
          .join(", ")}`
      );
      lines.push("");
    }
    lines.push(
      "- 実行順序そのもの（トポロジカルソート・クリティカルパス・要員/リソースの集計）は本ツールの対象外であり、将来の analyze_execution_order へ引き渡す入力として、上記の同一データ更新の組合せを宣言するに留める。"
    );
    lines.push("");
  }

  // --- 7. 決定的検査 ---
  lines.push("## 7. 決定的検査");
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("- 指摘なし");
    lines.push("");
  } else {
    const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, info: 2 };
    const sorted = result.findings
      .map((f, i) => ({ f, i }))
      .sort((a, b) => {
        const s = SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity];
        if (s !== 0) return s;
        const c = a.f.categoryId.localeCompare(b.f.categoryId);
        if (c !== 0) return c;
        return a.i - b.i;
      })
      .map((e) => e.f);
    for (const f of sorted.slice(0, FINDING_RENDER_LIMIT)) {
      lines.push(`- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`);
    }
    if (sorted.length > FINDING_RENDER_LIMIT) {
      lines.push(`- 他 ${sorted.length - FINDING_RENDER_LIMIT} 件（表示を ${FINDING_RENDER_LIMIT} 件に丸めた）`);
    }
    lines.push("");
  }

  // --- 8. 網羅対象一覧 ---
  lines.push("## 8. 網羅対象一覧(generate_test_cases 引き渡し)");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const targets = buildTestDataCoverageTargets(spec);
    const stateTargets = targets.filter((t) => t.id.startsWith("DL:S:"));
    const transitionTargets = targets.filter((t) => t.id.startsWith("DL:T:"));

    lines.push("### 8.1 状態(DL:S:)");
    lines.push("");
    lines.push("| 網羅対象ID | 内容 |");
    lines.push("| --- | --- |");
    for (const t of stateTargets.slice(0, ROW_RENDER_LIMIT)) {
      lines.push(`| ${escapeCell(t.id)} | ${escapeCell(t.description)} |`);
    }
    lines.push("");
    if (stateTargets.length > ROW_RENDER_LIMIT) {
      lines.push(`- 他 ${stateTargets.length - ROW_RENDER_LIMIT} 件`);
      lines.push("");
    }

    lines.push("### 8.2 遷移(DL:T:)");
    lines.push("");
    lines.push("| 網羅対象ID | 内容 |");
    lines.push("| --- | --- |");
    for (const t of transitionTargets.slice(0, ROW_RENDER_LIMIT)) {
      lines.push(`| ${escapeCell(t.id)} | ${escapeCell(t.description)} |`);
    }
    lines.push("");
    if (transitionTargets.length > ROW_RENDER_LIMIT) {
      lines.push(`- 他 ${transitionTargets.length - ROW_RENDER_LIMIT} 件`);
      lines.push("");
    }
    lines.push(
      `- 表は表示上の抜粋であり、generate_test_cases の testData へ渡した場合は ${targets.length} 件全てが universe の対象になる。`
    );
    lines.push("");
  }

  // --- 9. サマリ ---
  lines.push("## 9. サマリ");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const stateText =
      result.stateCoverage.basis === "case-body"
        ? `状態被覆率: ${(result.stateCoverage.ratioPercent as number).toFixed(1)}%（分母: 宣言状態 ${
            result.stateCoverage.total
          } 件、分子: 状態名が本文に現れた要求が指す状態 ${result.stateCoverage.covered} 件、未被覆: ${
            result.stateCoverage.uncoveredIds.length === 0 ? "なし" : result.stateCoverage.uncoveredIds.join(", ")
          }）`
        : `状態被覆率: 未算出(理由: ${result.stateCoverage.reason ?? ""})`;
    const transitionText =
      result.transitionCoverage.basis === "case-body"
        ? `遷移被覆率: ${(result.transitionCoverage.ratioPercent as number).toFixed(1)}%（分母: 宣言遷移 ${
            result.transitionCoverage.total
          } 件、分子: 遷移元状態＋（イベントまたは遷移先状態）が本文に現れた update 要求が一意に通過した遷移 ${
            result.transitionCoverage.covered
          } 件、未被覆: ${
            result.transitionCoverage.uncoveredIds.length === 0
              ? "なし"
              : result.transitionCoverage.uncoveredIds.join(", ")
          }）`
        : `遷移被覆率: 未算出(理由: ${result.transitionCoverage.reason ?? ""})`;
    lines.push(`- ${stateText}`);
    lines.push(`- ${transitionText}`);
    lines.push(`- 指摘: ${result.findings.length} 件`);
    lines.push(
      "- 実行順序・依存関係・クリティカルパスの決定は本ツールの対象外である。判定区分・データ区分種別の定義は `testdesign://test-data/analysis-criteria` を参照すること。"
    );
  }

  lines.push(testBasisGroundingSummaryLine(groundingSubjects, basisDocuments));
  lines.push("");

  lines.push(
    ...renderTestBasisGroundingLines(
      "## 10. テストベースとの実在照合",
      groundingSubjects,
      basisDocuments
    )
  );

  lines.push(
    ...renderInspectabilitySection("design_test_data", [
      testBasisGroundingSignal(basisDocuments),
    ]).split("\n")
  );
  lines.push("");

  const testDataSignals: string[] = [];
  if (result.findings.some((f) => f.severity === "high")) {
    testDataSignals.push("has-high-findings");
  }
  if (result.stateCoverage.basis !== "case-body" || result.transitionCoverage.basis !== "case-body") {
    testDataSignals.push("has-unmeasured-coverage");
  }
  if (result.stateCoverage.uncoveredIds.length > 0 || result.transitionCoverage.uncoveredIds.length > 0) {
    testDataSignals.push("has-uncovered-states");
  }
  lines.push(
    ...renderNextToolsSection(
      "design_test_data",
      testDataSignals,
      spec.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

/** データ実体一覧(4節)表示専用の到達可能状態集合。computeTestDataDesign 側の private 関数を再実装しないよう、簡易 BFS をここに1つだけ持つ。 */
function reachableStatesForRender(spec: TestDataSpec, dataClassId: string, fromStateId: string): Set<string> {
  const c = spec.dataClasses.find((cls) => cls.id === dataClassId);
  const visited = new Set<string>([fromStateId]);
  if (!c) return visited;
  const outgoing = new Map<string, string[]>();
  for (const t of c.transitions) {
    const list = outgoing.get(t.from) ?? [];
    list.push(t.to);
    outgoing.set(t.from, list);
  }
  const queue: string[] = [fromStateId];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const to of outgoing.get(cur) ?? []) {
      if (visited.has(to)) continue;
      visited.add(to);
      queue.push(to);
    }
  }
  return visited;
}

// --- MCP 登録 ---

const dataStateShape = z.object({
  id: z.string(),
  nameJa: z.string(),
  definition: z.string().optional(),
  isInitial: z.boolean().optional(),
  isTerminal: z.boolean().optional(),
});

const dataTransitionShape = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  event: z.string(),
  guard: z.string().optional(),
  mutating: z.boolean().optional().describe("Whether this transition changes the data (default true)"),
});

export const dataClassShape = z.object({
  id: z.string().describe("Data class id, unique across the input"),
  nameJa: z.string(),
  kind: z
    .enum(["master", "transaction", "counter", "credential", "external-settlement", "time-dependent"])
    .optional(),
  description: z.string().optional(),
  owner: z.string().optional().describe("Preparation owner"),
  preparation: z.string().optional().describe("How the data is procured"),
  sharingPolicy: z.enum(["shared", "exclusive", "per-case"]).optional(),
  keyAttributes: z.array(z.string()).optional().describe("Attribute keys used to identify the same data item"),
  volume: z.string().optional(),
  states: z.array(dataStateShape).min(1),
  transitions: z.array(dataTransitionShape).optional().default([]),
});

const dataItemShape = z.object({
  id: z.string(),
  dataClassId: z.string(),
  label: z.string(),
  initialStateId: z.string(),
  attributes: z.record(z.string(), z.string()).optional(),
  note: z.string().optional(),
});

const requiredDataShape = z.object({
  dataClassId: z.string(),
  stateId: z.string(),
  dataItemId: z.string().optional(),
  access: z.enum(["read", "update"]),
  resultStateId: z.string().optional(),
  transitionId: z.string().optional(),
});

export const testDataCaseShape = z.object({
  caseId: z.string(),
  title: z.string().optional(),
  preconditionText: z.string().optional(),
  stepsText: z.array(z.string()).optional(),
  requiredData: z.array(requiredDataShape),
});

export const designTestDataInputShape = {
  ...completedToolsInputShape,
  ...testBasisDocumentsInputShape,
  title: z.string().optional(),
  dataClasses: z.array(dataClassShape).min(1).describe("Data classes with their lifecycle states and transitions"),
  dataItems: z.array(dataItemShape).optional().describe("Data management table rows (concrete data item instances)"),
  testCases: z.array(testDataCaseShape).optional().describe("Test cases and the data they require"),
  maxDataClasses: z.number().int().positive().optional().describe("Data class count cap (default 100)"),
  maxStatesPerClass: z.number().int().positive().optional().describe("Per-class state count cap (default 50)"),
} as const;

const designTestDataInputSchema = z.object(designTestDataInputShape);
export type DesignTestDataInput = z.infer<typeof designTestDataInputSchema>;

export function registerDesignTestDataTool(server: McpServer): void {
  server.registerTool(
    "design_test_data",
    {
      title: "Design Test Data",
      description:
        "データ区分ごとのライフサイクル状態・遷移から、データ区分×状態マトリクス・状態遷移一覧・データ管理表・" +
        "データ×テストケースの供給トレーサビリティ・同一データを更新する複数ケースの排他検出・状態/遷移被覆を決定的に算出してMarkdownで返す。" +
        "各状態は DL:S:、各遷移は DL:T: プレフィックスの網羅対象IDとして generate_test_cases の testData へそのまま渡せる。" +
        "供給元の有無はIDの存在だけでなく初期状態からの到達可能性で判定し、被覆率はケース本文からの裏付けを通過した要求だけを分子に数える。" +
        "実行順序・依存関係・クリティカルパスの決定は対象外（将来の analyze_execution_order の担当領域）。",
      inputSchema: designTestDataInputShape,
    },
    async (input) => {
      const text = renderTestData(input as unknown as TestDataSpec);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
