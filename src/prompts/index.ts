import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTestPlanInterviewPrompt } from "./testPlanInterview.js";
import { registerRequirementsAnalysisInterviewPrompt } from "./requirementsAnalysisInterview.js";

export function registerPrompts(server: McpServer): void {
  registerTestPlanInterviewPrompt(server);
  registerRequirementsAnalysisInterviewPrompt(server);
}
