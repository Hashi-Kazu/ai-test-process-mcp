import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMcpTestClient, type McpTestClient } from "./mcpTestClient.js";

let testClient: McpTestClient;

beforeAll(async () => {
  testClient = await createMcpTestClient();
});

afterAll(async () => {
  await testClient.close();
});

describe("MCP protocol: startup", () => {
  it("creates a linked in-memory client/server pair (initialize succeeds)", () => {
    expect(testClient.client).toBeDefined();
  });
});

describe("MCP protocol: tools/list", () => {
  it("returns 31 tools, each with non-empty name/description/inputSchema", async () => {
    const { tools } = await testClient.client.listTools();
    expect(tools.length).toBe(31);
    for (const tool of tools) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect((tool.description ?? "").length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.name).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe("MCP protocol: tools/call", () => {
  it("create_test_plan succeeds and returns the expected heading", async () => {
    const text = await testClient.callTool("create_test_plan", {
      projectName: "P",
      scope: "S",
    });
    expect(text.split("\n")[0]).toBe("# テスト計画書: P");
  });

  it("design_boundary_values succeeds and returns the expected heading", async () => {
    const text = await testClient.callTool("design_boundary_values", {
      variables: [{ name: "桁", min: 1, max: 6 }],
      mode: "three",
    });
    expect(text.split("\n")[0]).toBe("# 境界値分析結果");
  });

  it("review_test_plan succeeds and returns the expected heading", async () => {
    const planMarkdown = await testClient.callTool("create_test_plan", {
      projectName: "P",
      scope: "S",
    });
    const text = await testClient.callTool("review_test_plan", { planMarkdown });
    expect(text.split("\n")[0]).toBe("# テスト計画書レビュー結果");
  });

  it("rejects invalid input at the protocol boundary via zod validation", async () => {
    const result = (await testClient.client.callTool({
      name: "create_test_plan",
      arguments: {},
    })) as { isError?: boolean; content?: { type: string; text?: string }[] };
    expect(result.isError).toBe(true);
    const text = (result.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    expect(text).toContain("Input validation error");
    expect(text).toContain("projectName");
  });
});

describe("MCP protocol: resources", () => {
  it("resources/list returns 40 resources, all readable", async () => {
    const { resources } = await testClient.client.listResources();
    expect(resources.length).toBe(40);
    for (const resource of resources) {
      const result = await testClient.client.readResource({ uri: resource.uri });
      expect(result.contents.length).toBeGreaterThan(0);
    }
  });
});

describe("MCP protocol: prompts", () => {
  it("prompts/list returns 5 prompts, all resolvable via getPrompt", async () => {
    const { prompts } = await testClient.client.listPrompts();
    expect(prompts.length).toBe(5);
    for (const prompt of prompts) {
      const result = await testClient.client.getPrompt({ name: prompt.name, arguments: {} });
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
    }
  });
});
