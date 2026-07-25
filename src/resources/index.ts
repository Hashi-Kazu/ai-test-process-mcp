import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testPlanTemplate } from "./testPlanTemplate.js";
import { jstqbGlossary } from "./jstqbGlossary.js";
import { testPlanReviewChecklist } from "./testPlanReviewChecklist.js";
import { testBasisReviewChecklist } from "./testBasisReviewChecklist.js";
import { qualityCharacteristicModel } from "./qualityCharacteristics.js";
import { requirementIdPatternCatalog } from "./requirementIdPatterns.js";
import { testPerspectiveCatalog } from "./testPerspectiveCatalog.js";
import { guidewordDictionary } from "./guidewordDictionary.js";
import { riskAnalysisFrame } from "./riskAnalysisFrame.js";

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
}
