import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTestPlanInterviewPrompt } from "./testPlanInterview.js";
import { registerRequirementsAnalysisInterviewPrompt } from "./requirementsAnalysisInterview.js";
import { registerTestDesignInterviewPrompt } from "./testDesignInterview.js";
import { registerExploratoryCharterInterviewPrompt } from "./exploratoryCharterInterview.js";

export function registerPrompts(server: McpServer): void {
  registerTestPlanInterviewPrompt(server);
  registerRequirementsAnalysisInterviewPrompt(server);
  registerTestDesignInterviewPrompt(server);
  registerExploratoryCharterInterviewPrompt(server);
}
