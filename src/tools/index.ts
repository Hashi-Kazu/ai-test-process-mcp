import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGenerateTestPlanTool } from "./generateTestPlan.js";
import { registerReviewTestPlanTool } from "./reviewTestPlan.js";
import { registerReviseTestPlanTool } from "./reviseTestPlan.js";
import { registerDesignBoundaryValuesTool } from "./designBoundaryValues.js";
import { registerDesignEquivalencePartitioningTool } from "./designEquivalencePartitioning.js";
import { registerReviewTestBasisTool } from "./reviewTestBasis.js";
import { registerAnalyzeRequirementsTool } from "./analyzeRequirements.js";
import { registerExtractTestConditionsTool } from "./extractTestConditions.js";
import { registerGenerateTestCasesTool } from "./generateTestCases.js";
import { registerReviewTestSpecificationTool } from "./reviewTestSpecification.js";
import { registerGenerateExploratoryChartersTool } from "./generateExploratoryCharters.js";
import { registerAuditIdPopulationTool } from "./auditIdPopulation.js";
import { registerGenerateUserStoryMapTool } from "./generateUserStoryMap.js";
import { registerReexpandThresholdChangesTool } from "./reexpandThresholdChanges.js";
import { registerAnalyzeCauseEffectTool } from "./analyzeCauseEffect.js";

export function registerTools(server: McpServer): void {
  registerGenerateTestPlanTool(server);
  registerReviewTestPlanTool(server);
  registerReviseTestPlanTool(server);
  registerDesignBoundaryValuesTool(server);
  registerDesignEquivalencePartitioningTool(server);
  registerReviewTestBasisTool(server);
  registerAnalyzeRequirementsTool(server);
  registerExtractTestConditionsTool(server);
  registerGenerateTestCasesTool(server);
  registerReviewTestSpecificationTool(server);
  registerGenerateExploratoryChartersTool(server);
  registerAuditIdPopulationTool(server);
  registerGenerateUserStoryMapTool(server);
  registerReexpandThresholdChangesTool(server);
  registerAnalyzeCauseEffectTool(server);
}
