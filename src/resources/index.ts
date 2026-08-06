import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testPlanTemplate } from "./testPlanTemplate.js";
import { jstqbGlossary } from "./jstqbGlossary.js";
import { testPlanReviewChecklist } from "./testPlanReviewChecklist.js";
import { testPlanAmbiguityLexicon } from "./ambiguityLexicon.js";
import { testBasisReviewChecklist } from "./testBasisReviewChecklist.js";
import { testSpecificationReviewChecklist } from "./testSpecificationReviewChecklist.js";
import { qualityCharacteristicModel } from "./qualityCharacteristics.js";
import { qualityInUseCharacteristicModel } from "./qualityInUseCharacteristics.js";
import { requirementIdPatternCatalog } from "./requirementIdPatterns.js";
import { testPerspectiveCatalog } from "./testPerspectiveCatalog.js";
import { guidewordDictionary } from "./guidewordDictionary.js";
import { riskAnalysisFrame } from "./riskAnalysisFrame.js";
import { testTechniqueCatalog } from "./testTechniqueCatalog.js";
import { testSizeClassificationCriteria } from "./testSizeClassificationCriteria.js";
import { exploratoryCharterCatalog } from "./exploratoryCharterCatalog.js";
import { idPopulationAuditCriteria } from "./idPopulationAuditCriteria.js";
import { personaJourneyFrame } from "./personaJourneyFrame.js";
import { thresholdChangeImpactCriteria } from "./thresholdChangeImpactCriteria.js";
import { thresholdExtractionCriteria } from "./thresholdExtractionCriteria.js";
import { causeEffectAnalysisCriteria } from "./causeEffectCriteria.js";
import { decisionTableAnalysisCriteria } from "./decisionTableCriteria.js";
import { pairwiseAnalysisCriteria } from "./pairwiseCriteria.js";
import { scenarioFlowAnalysisCriteria } from "./scenarioFlowCriteria.js";
import { factorRalphFrame } from "./factorRalphFrame.js";
import { testArchitectureDesignPrinciples } from "./testArchitectureDesignPrinciples.js";
import { testDataDesignCriteria } from "./testDataDesignCriteria.js";
import { configMatrixAnalysisCriteria } from "./configMatrixCriteria.js";
import { regressionSelectionAnalysisCriteria } from "./regressionSelectionCriteria.js";
import { executionOrderAnalysisCriteria } from "./executionOrderCriteria.js";
import { dataFlowTimingAnalysisCriteria } from "./dataFlowTimingCriteria.js";
import { crossMatrixAuditCriteria } from "./crossMatrixAuditCriteria.js";
import { basisContradictionCriteria } from "./basisContradictionCriteria.js";
import { businessRequirementFrame } from "./businessRequirementFrame.js";
import { deliverableConsistencyCriteria } from "./deliverableConsistencyCriteria.js";
import { testPurposeDerivationFrame } from "./testPurposeDerivationFrame.js";
import { nextToolCatalog, registeredToolNames } from "./nextToolCatalog.js";
import { toolOutputSignatures } from "./toolOutputSignatures.js";

export function registerResources(server: McpServer): void {
  server.registerResource(
    "test-plan-template",
    "testplan://template/standard",
    {
      title: "Test Plan Template",
      description:
        "Structural reference for the test plan template: 15-chapter test plan structure with sub-sections, required flags, and input field mappings, plus fixed reference tables.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testPlanTemplate, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "jstqb-glossary-core",
    "jstqb://glossary/core",
    {
      title: "JSTQB Glossary (Core)",
      description:
        "Paraphrased JSTQB (ISTQB-based) glossary terms relevant to test planning, analysis, and review: test levels, test types, entry/exit criteria, test conditions, test perspectives, and review types.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(jstqbGlossary, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-plan-review-checklist",
    "testplan://review/checklist",
    {
      title: "Test Plan Review Checklist",
      description:
        "Semantic review checklist (JSTQB perspective) for test plan reviews, cross-referenced to glossary terms.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testPlanReviewChecklist, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-plan-ambiguity-lexicon",
    "testplan://review/ambiguity-lexicon",
    {
      title: "Test Plan Ambiguity Lexicon",
      description:
        "Lexicon of ambiguous / non-measurable / weak-requirement Japanese expressions, plus the chapters where objectivity matters most, used by review_test_plan to detect ambiguous wording deterministically.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testPlanAmbiguityLexicon, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-basis-review-checklist",
    "testbasis://review/checklist",
    {
      title: "Test Basis Review Checklist",
      description:
        "Semantic review checklist for test basis (requirements/specifications) reviews, with typical improvement actions and glossary cross-references.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testBasisReviewChecklist, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-specification-review-checklist",
    "testspec://review/checklist",
    {
      title: "Test Specification Review Checklist",
      description:
        "Semantic review checklist for test specification / test case specification reviews against the test basis, with typical improvement actions and glossary cross-references.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testSpecificationReviewChecklist, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "quality-characteristics-product",
    "quality://characteristics/product",
    {
      title: "Product Quality Characteristics",
      description:
        "Paraphrased product quality characteristic model (functional suitability, performance efficiency, compatibility, usability, reliability, security, maintainability, portability) for mapping requirements to quality aspects.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(qualityCharacteristicModel, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "quality-characteristics-in-use",
    "quality://characteristics/in-use",
    {
      title: "Quality-in-Use Characteristics",
      description:
        "Paraphrased quality-in-use characteristic model (effectiveness, efficiency, satisfaction, freedom from risk, context coverage) for connecting stakeholder-/persona-derived test requirements to quality-in-use aspects, complementing quality://characteristics/product.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(qualityInUseCharacteristicModel, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "requirement-id-patterns",
    "testbasis://id-patterns",
    {
      title: "Requirement ID Patterns",
      description:
        "Catalog of regular expression patterns for requirement/feature ID formats, copyable into the idPatterns argument of analyze_requirements / review_test_basis.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(requirementIdPatternCatalog, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-perspective-catalog",
    "testcondition://perspectives/catalog",
    {
      title: "Test Perspective Catalog",
      description:
        "Paraphrased catalog of 18 test perspective categories with focus examples, related quality characteristics, and recommended techniques, used to detect missing test conditions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testPerspectiveCatalog, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "guideword-dictionary",
    "testcondition://guidewords/dictionary",
    {
      title: "Guideword Dictionary",
      description:
        "Vocabulary of focus points and guidewords with question templates, plus the operating procedure for combining them to surface test conditions that the test basis does not state.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(guidewordDictionary, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "risk-analysis-frame",
    "testcondition://risk/frame",
    {
      title: "Risk Analysis Frame",
      description:
        "Impact / likelihood / change-difference axes, stakeholder impact questions, the risk score formula, and the score-to-priority mapping used to prioritize test conditions. " +
        "Also includes optional axes for finer-grained risk analysis: 4 severity sub-axes (direct / ripple / short-term financial / long-term financial impact, RA-SEV-01..04) " +
        "aggregated into S/A/B severity grades, 2 likelihood sub-axes (usage frequency and a defect-proneness factor with 5 supporting factors, RA-USAGE / RA-PRONENESS / RA-PF-xx) " +
        "whose geometric mean derives the likelihood, and a risk x stakeholder impact matrix built on the same stakeholder frame columns. " +
        "All optional axes fall back to the existing impact/likelihood/change-diff score when left unfilled.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(riskAnalysisFrame, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-technique-catalog",
    "testdesign://techniques/catalog",
    {
      title: "Test Technique Catalog",
      description:
        "Paraphrased catalog of test techniques with coverage criteria, required inputs, and a basis-characteristic-to-technique selection table, used by generate_test_cases to recommend techniques deterministically.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testTechniqueCatalog, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-size-classification-criteria",
    "testdesign://testsize/classification-criteria",
    {
      title: "Test Size Classification Criteria",
      description:
        "Self-authored test size classification criteria (small / medium / large) based on objective axes: presence of external dependencies " +
        "(network, database, file system, separate processes, concurrency, real hardware, UI, real-time waits) and per-case execution time limits, " +
        "with the acceptable test levels and recommended share range for each size, used by generate_test_cases to check test level allocation.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testSizeClassificationCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "exploratory-charter-catalog",
    "testdesign://exploratory/charters",
    {
      title: "Exploratory Charter Catalog",
      description:
        "Paraphrased catalog of exploratory-testing charter areas with check/operation focus examples, recommended timeboxes, " +
        "stop heuristics, and a fixed charter table column layout, used by generate_exploratory_charters.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(exploratoryCharterCatalog, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "id-population-audit-criteria",
    "testbasis://population/audit-criteria",
    {
      title: "ID Population Audit Criteria",
      description:
        "Judgment category catalog for audit_id_population: never-declared IDs, excluded IDs, test-basis-undefined population IDs, missing documents, cross-process population shrinkage, and per-document declaration rate drops, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(idPopulationAuditCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "persona-journey-frame",
    "testcondition://persona/journey-frame",
    {
      title: "Persona / User Story Map Frame",
      description:
        "Paraphrased upstream usage-modeling frame: domain analysis aspects, the four persona quadrants " +
        "(demographics / says&thinks / goals / pain points), the five user story map levels " +
        "(persona / product goal / activity / task / user story), and the before/after/test-requirement " +
        "derivation columns with the handover convention to extract_test_conditions, plus a stakeholder " +
        "weighting frame that scores influence (SW-INFLUENCE) x interest (SW-INTEREST) on 4-level scales, " +
        "a 4-step analysis flow (SWS-01..SWS-04), three handling classes (SWC-01..SWC-03 = focus / standard " +
        "/ reference), an explicit 4x4 (16-combination) matrix mapping influence/interest pairs to those " +
        "classes, and its own handover convention to extract_test_conditions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(personaJourneyFrame, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "threshold-change-impact-criteria",
    "testdesign://threshold/change-impact-criteria",
    {
      title: "Threshold Change Impact Criteria",
      description:
        "Judgment category catalog for reexpand_threshold_changes: stale literal values, dangling coverage target ids, " +
        "name-reference-only impact, unit changes, removed-parameter references, unreferenced changed/added parameters, " +
        "and unresolvable boundary/equivalence bindings, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(thresholdChangeImpactCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "threshold-extraction-criteria",
    "testdesign://threshold/extraction-criteria",
    {
      title: "Threshold Extraction Criteria",
      description:
        "Judgment category catalog for the specification-text threshold extraction of reexpand_threshold_changes (TCE-01..TCE-07): " +
        "undeclared extracted thresholds, declared-vs-document value or unit mismatches, declared parameters with no grounding in the documents, " +
        "document diffs that disagree with the declared parameter diff, conflicting values inside one snapshot, approvals that match no candidate, " +
        "and unapproved candidates that are proposed but not merged, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(thresholdExtractionCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "cause-effect-analysis-criteria",
    "testbasis://cause-effect/analysis-criteria",
    {
      title: "Cause-Effect Graph Analysis Criteria",
      description:
        "Judgment category catalog for analyze_cause_effect (CEG-01..CEG-20): unknown node references, duplicate ids, " +
        "isolated causes that reach no effect, unreachable effects derived from no cause, dangling intermediate nodes, graph cycles, " +
        "malformed and contradictory constraints, constraint-fixed cause values, redundant constraints, always-false and " +
        "cause-independent effects, combination and decision table rule counts, quotation grounding against the spec text, " +
        "unmodeled spec sentences and unmodeled logical connectives, and design_decision_table handover reconciliation, " +
        "with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(causeEffectAnalysisCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "decision-table-analysis-criteria",
    "testdesign://decision-table/analysis-criteria",
    {
      title: "Decision Table Analysis Criteria",
      description:
        "Judgment category catalog for design_decision_table (DTC-01..DTC-10): unknown condition/level/action references, " +
        "duplicate condition/action ids or levels, conditions that do not contribute to the combination count, " +
        "undefined-behavior valid combinations, conflicting rule matches, redundant/unreachable rules, zero valid combinations, " +
        "and enumeration cap overflow, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(decisionTableAnalysisCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "pairwise-analysis-criteria",
    "testdesign://pairwise/analysis-criteria",
    {
      title: "Pairwise Analysis Criteria",
      description:
        "Judgment category catalog for design_pairwise (PWC-01..PWC-12): unknown factor/level references, " +
        "duplicate factor ids or levels, factors that do not contribute to pair generation, insufficient factor count, " +
        "pairs made unreachable by forbidden combinations, zero reachable pairs, redundant/unreachable forbidden combinations, " +
        "malformed seed rows, pair count cap overflow, undetermined reachability under the search budget, " +
        "and pair coverage below 100 percent, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(pairwiseAnalysisCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "config-matrix-analysis-criteria",
    "testdesign://config-matrix/analysis-criteria",
    {
      title: "Config Matrix Analysis Criteria",
      description:
        "Judgment category catalog for design_config_matrix (CMC-01..CMC-13): unknown factor/level references, " +
        "duplicate factor ids or levels, factors that do not contribute to combinations, insufficient factor count, " +
        "missing exclusion reasons, combinations made unreachable by excluded combinations, redundant/unreachable " +
        "excluded combinations, combination count cap overflow, levels/pairs not exercised by the user-supplied " +
        "actual rows, and inconsistencies in those rows, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(configMatrixAnalysisCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "regression-selection-analysis-criteria",
    "testdesign://regression-selection/analysis-criteria",
    {
      title: "Regression Selection Analysis Criteria",
      description:
        "Judgment category catalog for select_regression_suite (RSC-01..RSC-25): out-of-population selection " +
        "references, duplicate/conflicting decisions, missing reasons, high-risk items excluded from the suite, " +
        "undecided population items, undeclared change-diff category, selected existing-unaffected items, " +
        "non-selected or undecided impact-scope conditions, missing removal reasons for items actually dropped " +
        "from the previous suite, removal reasons declared for items not actually dropped, previous-suite " +
        "references outside the population, oversized large-test share, execution-time budget overrun, " +
        "selected cases with no size classification input, impact-scope coverage claim mismatches, unknown " +
        "selection criterion references, selected conditions with no backing test case, missing selection " +
        "criteria declarations, previous-suite diff not computed, population size cap overflow, conditions " +
        "computed as impacted by reexpand_threshold_changes but declared existing-unaffected, cases computed " +
        "as impacted but not selected, conditions computed as unaffected but declared modified/existing-impacted, " +
        "out-of-population or duplicated impact-verdict inputs, and impact-verdict input not supplied (coverage " +
        "computed on a declared-only basis), with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(regressionSelectionAnalysisCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "execution-order-analysis-criteria",
    "testdesign://execution-order/analysis-criteria",
    {
      title: "Execution Order Analysis Criteria",
      description:
        "Judgment category catalog for analyze_execution_order (EOC-01..EOC-27): duplicate node ids, " +
        "out-of-population and self-referencing dependency edges, unresolved graph cycles, undeclared or " +
        "unreasoned dependencies, dependency basis references not backed by the producing node's declared " +
        "artifacts / resources / data items, duplicate edges, undeclared duration and required-resource " +
        "declarations, out-of-population resource references, earliest-start resource conflicts, max-parallelism " +
        "overruns, unused declared resources, isolated nodes, critical-path and total-duration claim mismatches, " +
        "unplanned-container gaps and out-of-population nodes against a declared architecture container " +
        "population, unmeasurable or unlinked exit criteria and SLOs, missing or out-of-range or unconnected " +
        "monitoring checkpoints, planned-container coverage claim mismatches, node count cap overflow, and " +
        "unavailable scheduling due to no declared durations, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(executionOrderAnalysisCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "data-flow-timing-analysis-criteria",
    "testdesign://data-flow-timing/analysis-criteria",
    {
      title: "Data Flow Timing Analysis Criteria",
      description:
        "Judgment category catalog for analyze_data_flow_timing (DFT-01..DFT-20): duplicate component / data item / " +
        "communication ids, out-of-population and self-referencing communications, undefined send timing " +
        "(undefined kind, periodic without interval, event without trigger), undeclared ack and missing timeout " +
        "declarations, propagation delay that cannot be computed because a path contains an undefined-timing edge, " +
        "claimed maximum latency and claimed maximum skew that disagree with the computed values, declared terminals " +
        "unreachable in the data item subgraph, delay and skew windows no test condition covers (and test conditions " +
        "referencing windows that do not exist), test conditions expecting immediate reflection against a non-zero " +
        "delay window, data items carried by no communication, communications carrying no data item, isolated " +
        "components, communications with no test basis source reference, mismatched periodic intervals across paths " +
        "for the same data item, population and path enumeration cap overflow, and delay window coverage claim " +
        "mismatches, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(dataFlowTimingAnalysisCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "cross-matrix-audit-criteria",
    "testdesign://cross-matrix/audit-criteria",
    {
      title: "Cross Matrix Audit Criteria",
      description:
        "Judgment category catalog for audit_cross_matrix (CMX-01..CMX-15): links to undeclared item ids, " +
        "duplicate axis / item ids, empty rows and empty columns that are linked to nothing on the paired axis, " +
        "links pointing at items on the same axis, one-directional links, missing exclusion reasons, " +
        "declared-versus-computed fill rate mismatches, axis population shrinkage that inflates fill rates, " +
        "axis items not substantiated by the test basis text, ids defined in the test basis but present on no axis, " +
        "axes that do not contribute to the cross product, cell count cap overflow, undeclared axis references and " +
        "same-axis pair specifications, and fully isolated items, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(crossMatrixAuditCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "deliverable-consistency-criteria",
    "testdesign://deliverable/consistency-criteria",
    {
      title: "Deliverable Consistency Audit Criteria",
      description:
        "Judgment category catalog for audit_deliverable_consistency (DCC-01..DCC-15): read/unread state " +
        "conflicts of referenced test basis documents across deliverables and inside one deliverable, " +
        "documents appearing on only one side, declared-versus-body referenced document list mismatches, " +
        "ids sourced from documents declared unread, unresolved cross-deliverable id references, " +
        "correspondence claims not substantiated by ids in the referenced deliverable, defined ids never " +
        "referenced downstream, non-existent section references, section label mismatches, unresolvable " +
        "references to deliverables not supplied, same-unit value conflicts and wording divergence for the " +
        "same id, one-sided shared item enumerations (scope / out-of-scope / preconditions / constraints / " +
        "test levels / test types), and count or coverage-rate claims that disagree with the enumeration in " +
        "the body, plus the shared item kind catalog (DSI-01..DSI-06) and the read / unread state vocabulary. " +
        "The deterministic layer only enumerates candidates; final judgment is left to the semantic layer.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(deliverableConsistencyCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "scenario-flow-analysis-criteria",
    "testdesign://scenario-flow/analysis-criteria",
    {
      title: "Scenario Flow Analysis Criteria",
      description:
        "Judgment category catalog for design_scenario_flows (SFC-01..SFC-14): unknown actor references, " +
        "duplicate use case / branch ids, non-sequential step numbering, malformed branch and rejoin positions, " +
        "missing branch triggers, feature ids outside the declared population, use cases without an exception flow, " +
        "skewed scenario classification, declared feature ids no scenario passes through, flows with no feature ids at all, " +
        "test-condition feature ids not reached by any scenario, passed feature ids no test condition references, " +
        "duplicate scenarios, and scenario count cap overflow, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(scenarioFlowAnalysisCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "factor-ralph-frame",
    "testcondition://factor/ralph-frame",
    {
      title: "Factor Decomposition Frame",
      description:
        "Paraphrased factor decomposition frame: the four factor categories (signal / noise / state / control) with probe questions and level-assignment guidance, level heuristics, the factor/level id convention, and the handover conventions to design_boundary_values, design_equivalence_partitioning, design_decision_table and the planned design_pairwise.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(factorRalphFrame, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-architecture-design-principles",
    "testarch://container/design-principles",
    {
      title: "Test Architecture Container Design Principles",
      description:
        "Self-authored test container design principles and judgment category catalog for design_test_architecture: " +
        "eight container decomposition axes (TAX-01..TAX-08) with the question they answer, when they suit, and what they hide; " +
        "nine responsibility declaration fields (RFD-01..RFD-09) with required flags; three execution-necessity priority classes " +
        "(TPR-01..TPR-03) with the test condition priorities each class allows; three test scope declaration items (TSC-01..TSC-03); " +
        "and 17 judgment categories (TAC-01..TAC-17) covering unassigned test conditions, unknown container references, duplicate container ids, " +
        "malformed parent-child relations, missing responsibility and objective, multi-assigned conditions, empty leaf containers, " +
        "missing test types, priority class mismatches, perspective category declaration-versus-actual mismatches, unknown perspective ids, " +
        "declared-versus-actual test level mismatches, scope declaration gaps, conditions that never reach a test case, " +
        "container count / depth cap overflow, and decomposition axis declaration-versus-actual mismatches, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testArchitectureDesignPrinciples, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-data-design-criteria",
    "testdesign://test-data/analysis-criteria",
    {
      title: "Test Data Design Criteria",
      description:
        "Self-authored data class kind catalog (TDK-01..06: master / transaction / counter / credential / " +
        "external-settlement / time-dependent) and judgment category catalog for design_test_data (TDC-01..18): " +
        "id duplicates, unknown id references, malformed initial-state declarations, missing transition events, " +
        "unreachable and dead-end states, unused states/transitions/data classes, missing suppliers reachable from " +
        "the declared initial state, case-body substantiation gaps, unused data items, multiple cases updating the " +
        "same data, sharing-policy versus actual-access mismatches, illegal transition requests, upper-bound " +
        "overflow, and state-changing data classes with no update requests, with severity and recommended actions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testDataDesignCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "basis-contradiction-criteria",
    "testbasis://contradiction/audit-criteria",
    {
      title: "Basis Contradiction Audit Criteria",
      description:
        "Judgment category catalog for audit_basis_contradictions (BC-01..BC-10): same-id name inconsistencies, " +
        "cross-document UI element label mismatches and one-sided elements, same-trigger transition target " +
        "inconsistencies, unresolved transition targets, operation elements with no described behavior, " +
        "declared-list-versus-body subject mismatches, same-parameter value inconsistencies, revision-declared " +
        "old values still present in the body, and minority transition targets, with severity and recommended " +
        "actions. The deterministic layer only enumerates candidates; final contradiction judgment is left to the " +
        "semantic layer.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(basisContradictionCriteria, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "business-requirement-frame",
    "testcondition://business/requirement-frame",
    {
      title: "Business Use Case / Requirement Model Frame",
      description:
        "Paraphrased frame for reconstructing test requirements from the business side, independent of the " +
        "feature id chapter structure: systemization purpose layers (business goal / systemization purpose / " +
        "achievement metric), business use case aspects (BUC-01..06), business flow aspects (BFL-01..05), " +
        "driving data aspects (BDA-01..05), the role separation from testcondition://persona/journey-frame, " +
        "and the handover conventions to design_scenario_flows / design_test_data / audit_cross_matrix. " +
        "Used by generate_business_requirement_model.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(businessRequirementFrame, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "test-purpose-derivation-frame",
    "testplan://purpose/derivation-frame",
    {
      title: "Test Purpose Derivation Frame",
      description:
        "Paraphrased derivation frame for test purposes: requester expectations -> test requirements " +
        "(management / engineering lines) -> test strategy -> test purposes -> prioritization, with " +
        "question examples, bad examples, purpose quality rules, prioritization axes, and the judgment " +
        "category catalog (PDC-01..PDC-17) used by derive_test_purposes.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(testPurposeDerivationFrame, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "next-tool-catalog",
    "toolchain://next-tools/catalog",
    {
      title: "Next Tool Catalog",
      description:
        "Static follow-up tool table used by every tool to render the '次に実行すべきツール' section: " +
        "per-source-tool follow-up entries with the signal key that makes each entry applicable and the " +
        "Japanese reason shown to the caller, plus the list of all tool names registered by this MCP server " +
        "used to reject completedTools declarations naming tools that do not exist. Also includes the output " +
        "heading signature table (toolOutputSignatures) used to verify that a completedTools declaration's " +
        "outputExcerpt actually contains that tool's own output heading.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ registeredToolNames, nextToolCatalog, toolOutputSignatures }, null, 2),
        },
      ],
    })
  );
}
