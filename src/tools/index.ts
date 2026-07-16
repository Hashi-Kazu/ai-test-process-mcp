import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGenerateTestPlanTool } from "./generateTestPlan.js";
import { registerReviewTestPlanTool } from "./reviewTestPlan.js";
import { registerReviseTestPlanTool } from "./reviseTestPlan.js";

export function registerTools(server: McpServer): void {
  registerGenerateTestPlanTool(server);
  registerReviewTestPlanTool(server);
  registerReviseTestPlanTool(server);
}
