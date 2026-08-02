import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testPlanTemplate } from "./testPlanTemplate.js";
import { jstqbGlossary } from "./jstqbGlossary.js";
import { testPlanReviewChecklist } from "./testPlanReviewChecklist.js";
import { testPlanAmbiguityLexicon } from "./ambiguityLexicon.js";
import { testBasisReviewChecklist } from "./testBasisReviewChecklist.js";
import { testSpecificationReviewChecklist } from "./testSpecificationReviewChecklist.js";
import { qualityCharacteristicModel } from "./qualityCharacteristics.js";
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
import { causeEffectAnalysisCriteria } from "./causeEffectCriteria.js";
import { decisionTableAnalysisCriteria } from "./decisionTableCriteria.js";
import { pairwiseAnalysisCriteria } from "./pairwiseCriteria.js";
import { scenarioFlowAnalysisCriteria } from "./scenarioFlowCriteria.js";
import { factorRalphFrame } from "./factorRalphFrame.js";
import { testArchitectureDesignPrinciples } from "./testArchitectureDesignPrinciples.js";
import { testDataDesignCriteria } from "./testDataDesignCriteria.js";
import { configMatrixAnalysisCriteria } from "./configMatrixCriteria.js";
import { crossMatrixAuditCriteria } from "./crossMatrixAuditCriteria.js";

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
        "Impact / likelihood / change-difference axes, stakeholder impact questions, the risk score formula, and the score-to-priority mapping used to prioritize test conditions.",
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
        "derivation columns with the handover convention to extract_test_conditions.",
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
        "Judgment category catalog for design_config_matrix (CMC-01..CMC-10): unknown factor/level references, " +
        "duplicate factor ids or levels, factors that do not contribute to combinations, insufficient factor count, " +
        "missing exclusion reasons, combinations made unreachable by excluded combinations, redundant/unreachable " +
        "excluded combinations, combination count cap overflow, and untested levels remaining after generation, " +
        "with severity and recommended actions.",
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
}
