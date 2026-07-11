import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";

const server = new McpServer({ name: "ai-test-process-mcp", version: "0.1.0" });

registerResources(server);
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
