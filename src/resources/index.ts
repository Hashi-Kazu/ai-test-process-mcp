import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { iso29119TestPlanStructure } from "./iso29119.js";
import { testPlanTemplate } from "./testPlanTemplate.js";

export function registerResources(server: McpServer): void {
  server.registerResource(
    "iso29119-test-plan-structure",
    "iso29119://test-plan/structure",
    {
      title: "ISO 29119 Test Plan Structure",
      description:
        "Structural reference for ISO/IEC/IEEE 29119-3 conformant test plans: section list, standard references, and required fields per section.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(iso29119TestPlanStructure, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "quintee-test-plan-template",
    "testplan://template/quintee",
    {
      title: "QUINTEE Test Plan Template",
      description:
        "Structural reference for the QUINTEE test plan template: 17 chapters with sub-sections, required flags, ISO 29119 cross-references, and input field mappings.",
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
}
