import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerResources } from "../../src/resources/index.js";
import { registerTools } from "../../src/tools/index.js";
import { registerPrompts } from "../../src/prompts/index.js";

export interface McpTestClient {
  client: Client;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
}

export async function createMcpTestClient(): Promise<McpTestClient> {
  const server = new McpServer({ name: "ai-test-process-mcp", version: "test" });
  registerResources(server);
  registerTools(server);
  registerPrompts(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const callTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const result = (await client.callTool({ name, arguments: args }, undefined, {
      timeout: 120000,
    })) as { isError?: boolean; content?: { type: string; text?: string }[] };
    const text = (result.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    if (result.isError) throw new Error(`tool ${name} returned an error:\n${text}`);
    if (text.trim() === "") throw new Error(`tool ${name} returned no text content`);
    return text;
  };

  return { client, callTool, close: () => client.close() };
}
