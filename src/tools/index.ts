import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGenerateTestPlanTool } from "./generateTestPlan.js";

export function registerTools(server: McpServer): void {
  registerGenerateTestPlanTool(server);
}
