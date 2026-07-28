import { extractIdOccurrences } from "./testBasisAnalysis.js";
import type { TestBasisAnalysisOptions } from "./testBasisAnalysis.js";
import type {
  DeclaredIdPopulation,
  DefinedIdEntry,
  DocumentPopulationStat,
  IdPopulationExclusion,
  IdPopulationRow,
  IdPopulationSummary,
  PopulationDiffRow,
  TestBasisDocument,
  UndefinedPopulationId,
} from "./types.js";

// audit_id_population 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順（または明示したソートキー）で決定的。

export function buildDefinedIdIndex(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): DefinedIdEntry[] {
  const occurrences = extractIdOccurrences(documents, options);
  const seen = new Set<string>();
  const result: DefinedIdEntry[] = [];
  for (const occ of occurrences) {
    if (occ.role !== "definition") continue;
    if (seen.has(occ.id)) continue;
    seen.add(occ.id);
    result.push({
      id: occ.id,
      document: occ.document,
      lineIndex: occ.lineIndex,
      heading: occ.heading,
    });
  }
  return result;
}

export function populationLabel(p: DeclaredIdPopulation): string {
  return p.label ? `${p.toolName}(${p.label})` : p.toolName;
}

export function buildIdPopulationMatrix(
  defined: DefinedIdEntry[],
  populations: DeclaredIdPopulation[],
  exclusions?: IdPopulationExclusion[]
): IdPopulationRow[] {
  const exclusionByI = new Map<string, string>();
  for (const e of exclusions ?? []) {
    if (!exclusionByI.has(e.id)) exclusionByI.set(e.id, e.reason);
  }

  return defined.map((entry) => {
    const declaredIn: string[] = [];
    for (const p of populations) {
      if (p.ids.includes(entry.id)) declaredIn.push(populationLabel(p));
    }
    const exclusionReason = exclusionByI.get(entry.id);
    let status: IdPopulationRow["status"];
    if (declaredIn.length > 0) {
      status = "declared";
    } else if (exclusionReason !== undefined) {
      status = "excluded";
    } else {
      status = "never-declared";
    }
    return {
      id: entry.id,
      document: entry.document,
      lineIndex: entry.lineIndex,
      heading: entry.heading,
      declaredIn,
      status,
      ...(status === "excluded" ? { exclusionReason } : {}),
    };
  });
}

export function findNeverDeclaredIds(rows: IdPopulationRow[]): IdPopulationRow[] {
  return rows.filter((r) => r.status === "never-declared");
}

export function findExcludedIds(rows: IdPopulationRow[]): IdPopulationRow[] {
  return rows.filter((r) => r.status === "excluded");
}

export function findUndefinedPopulationIds(
  defined: DefinedIdEntry[],
  populations: DeclaredIdPopulation[]
): UndefinedPopulationId[] {
  const definedIds = new Set(defined.map((d) => d.id));
  const order: string[] = [];
  const byId = new Map<string, string[]>();
  for (const p of populations) {
    const label = populationLabel(p);
    for (const id of p.ids) {
      if (definedIds.has(id)) continue;
      if (!byId.has(id)) {
        order.push(id);
        byId.set(id, []);
      }
      const list = byId.get(id) as string[];
      if (!list.includes(label)) list.push(label);
    }
  }
  return order.map((id) => ({ id, populations: byId.get(id) as string[] }));
}

export function buildDocumentPopulationStats(
  rows: IdPopulationRow[],
  documents: TestBasisDocument[]
): DocumentPopulationStat[] {
  return documents.map((doc) => {
    const docRows = rows.filter((r) => r.document === doc.name);
    const definedCount = docRows.length;
    const declaredCount = docRows.filter((r) => r.status === "declared").length;
    const declarationRate =
      definedCount === 0 ? 0 : Math.round((declaredCount / definedCount) * 1000) / 10;
    const neverDeclaredIds = docRows.filter((r) => r.status === "never-declared").map((r) => r.id);
    return {
      document: doc.name,
      definedCount,
      declaredCount,
      declarationRate,
      neverDeclaredIds,
    };
  });
}

export function findMissingDocuments(
  documents: TestBasisDocument[],
  expectedDocumentNames?: string[]
): string[] {
  if (!expectedDocumentNames || expectedDocumentNames.length === 0) return [];
  const present = new Set(documents.map((d) => d.name));
  return expectedDocumentNames.filter((name) => !present.has(name));
}

export function buildPopulationDiff(populations: DeclaredIdPopulation[]): PopulationDiffRow[] {
  if (populations.length === 0) return [];
  let baseIndex = 0;
  for (let i = 1; i < populations.length; i++) {
    if (populations[i].ids.length > populations[baseIndex].ids.length) {
      baseIndex = i;
    }
  }
  const baseIds = populations[baseIndex].ids;
  return populations.map((p, i) => {
    const label = populationLabel(p);
    if (i === baseIndex) {
      return { population: label, idCount: p.ids.length, missingIds: [] };
    }
    const idSet = new Set(p.ids);
    const missingIds = baseIds.filter((id) => !idSet.has(id));
    return { population: label, idCount: p.ids.length, missingIds };
  });
}

export function summarizeIdPopulation(
  rows: IdPopulationRow[],
  undefinedIds: UndefinedPopulationId[],
  missingDocuments: string[]
): IdPopulationSummary {
  const definedTotal = rows.length;
  const declaredTotal = rows.filter((r) => r.status === "declared").length;
  const excludedTotal = rows.filter((r) => r.status === "excluded").length;
  const neverDeclaredTotal = rows.filter((r) => r.status === "never-declared").length;
  const declarationRate =
    definedTotal === 0 ? 0 : Math.round((declaredTotal / definedTotal) * 1000) / 10;
  return {
    definedTotal,
    declaredTotal,
    excludedTotal,
    neverDeclaredTotal,
    declarationRate,
    undefinedPopulationIdTotal: undefinedIds.length,
    missingDocumentTotal: missingDocuments.length,
  };
}
