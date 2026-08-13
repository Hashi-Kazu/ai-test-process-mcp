import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTestPlanInterviewPrompt } from "./testPlanInterview.js";
import { registerRequirementsAnalysisInterviewPrompt } from "./requirementsAnalysisInterview.js";
import { registerTestDesignInterviewPrompt } from "./testDesignInterview.js";
import { registerExploratoryCharterInterviewPrompt } from "./exploratoryCharterInterview.js";
import { registerPersonaJourneyInterviewPrompt } from "./personaJourneyInterview.js";
import { registerTestConditionInterviewPrompt } from "./testConditionInterview.js";
import { registerTestArchitectureInterviewPrompt } from "./testArchitectureInterview.js";
import { registerScenarioFlowInterviewPrompt } from "./scenarioFlowInterview.js";
import { registerTestSpecificationReviewInterviewPrompt } from "./testSpecificationReviewInterview.js";
import { registerIdPopulationAuditInterviewPrompt } from "./idPopulationAuditInterview.js";
import { registerThresholdChangeInterviewPrompt } from "./thresholdChangeInterview.js";
import { registerDataFlowTimingInterviewPrompt } from "./dataFlowTimingInterview.js";

export function registerPrompts(server: McpServer): void {
  registerTestPlanInterviewPrompt(server);
  registerRequirementsAnalysisInterviewPrompt(server);
  registerTestDesignInterviewPrompt(server);
  registerExploratoryCharterInterviewPrompt(server);
  registerPersonaJourneyInterviewPrompt(server);
  registerTestConditionInterviewPrompt(server);
  registerTestArchitectureInterviewPrompt(server);
  registerScenarioFlowInterviewPrompt(server);
  registerTestSpecificationReviewInterviewPrompt(server);
  registerIdPopulationAuditInterviewPrompt(server);
  registerThresholdChangeInterviewPrompt(server);
  registerDataFlowTimingInterviewPrompt(server);
}
