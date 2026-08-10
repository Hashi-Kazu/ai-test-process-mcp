import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registeredToolNames } from "../../src/resources/nextToolCatalog.js";
import { toolOutputSignatures } from "../../src/resources/toolOutputSignatures.js";
import { createMcpTestClient, type McpTestClient } from "./mcpTestClient.js";

let testClient: McpTestClient;
let runtimeToolNames: string[];

beforeAll(async () => {
  testClient = await createMcpTestClient();
  const { tools } = await testClient.client.listTools();
  runtimeToolNames = tools.map((t) => t.name).sort();
});

afterAll(async () => {
  await testClient.close();
});

describe("declared vs. runtime tool registration (3-way match)", () => {
  it("tools/list matches registeredToolNames", () => {
    expect(runtimeToolNames).toEqual([...registeredToolNames].sort());
  });

  it("tools/list matches toolOutputSignatures keys", () => {
    expect(runtimeToolNames).toEqual(Object.keys(toolOutputSignatures).sort());
  });

  it("all three sources agree on the count (31)", () => {
    expect(runtimeToolNames.length).toBe(31);
    expect(registeredToolNames.length).toBe(31);
    expect(Object.keys(toolOutputSignatures).length).toBe(31);
  });
});
