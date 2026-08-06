import { COVERAGE_TARGET_ID_PATTERN_SOURCE, DEFAULT_ID_PATTERN_SOURCE } from "../testBasisAnalysis.js";
import type { RequirementIdPatternCatalog } from "../types.js";

// 要件ID・機能IDの表記ゆれに対応するための正規表現パターン集。
// `source` は analyze_requirements / review_test_basis の idPatterns 引数に
// そのままコピーして渡せる（既定パターンに追加される）。
export const requirementIdPatternCatalog: RequirementIdPatternCatalog = {
  name: "要件ID抽出パターン集",
  defaultPatternId: "IDP-01",
  patterns: [
    {
      id: "IDP-01",
      name: "既定パターン（プレフィックス-連番、多階層可）",
      source: DEFAULT_ID_PATTERN_SOURCE,
      examples: ["EH-100", "S-001-01", "W-008-04", "W-Mail-011-01", "E-016"],
      nonExamples: ["2026-04-26"],
      note: "analyze_requirements / review_test_basis の既定パターンとして常に有効。",
    },
    {
      id: "IDP-02",
      name: "角括弧付き REQ 形式",
      source: "【(REQ-\\d{1,5})】",
      examples: ["【REQ-001】", "【REQ-12345】"],
      nonExamples: ["REQ-001", "[REQ-001]"],
      note: "idPatterns にこの source をそのまま追加すると検出できる。",
    },
    {
      id: "IDP-03",
      name: "アンダースコア区切り形式",
      source: "\\b([A-Z]{1,6}_\\d{1,5})\\b",
      examples: ["REQ_001", "FR_12345"],
      nonExamples: ["REQ-001", "REQ001"],
      note: "idPatterns にこの source をそのまま追加すると検出できる。",
    },
    {
      id: "IDP-04",
      name: "ドット階層形式",
      source: "\\b([A-Z]{1,6}\\d(?:\\.\\d{1,3}){1,3})\\b",
      examples: ["FR1.2.3", "NFR2.1"],
      nonExamples: ["FR1", "1.2.3"],
      note: "idPatterns にこの source をそのまま追加すると検出できる。",
    },
    {
      id: "IDP-05",
      name: "網羅対象ID（コロン区切り、design_* 系エンジン発行）",
      source: COVERAGE_TARGET_ID_PATTERN_SOURCE,
      examples: ["CFG:MAIN:R12", "PW:MAIN:P3", "DL:S:ORDER:PAID", "UC:UC-01:F1", "ST:T1"],
      nonExamples: ["REQ-001", "2026-04-26", "https://example.com"],
      note: "audit_deliverable_consistency / audit_id_population / audit_cross_matrix では includeCoverageTargetIds（既定true）で自動的に有効。要件ID中心のツールで使う場合は idPatterns ではなくこの区分を意識して扱う。",
    },
  ],
};
