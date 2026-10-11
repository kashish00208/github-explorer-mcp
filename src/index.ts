import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  analyze_repository,
  detectTechStack,
  explain_file,
  get_repositroy_map,
  search_code,
} from "./tools.js";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";


export const server = new McpServer({
  name: "Github-Explorer",
  version: "1.0.0",
});


async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await fn();
    const structuredContent =
      typeof result === "object" && result !== null && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : { value: result };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : "Tool execution failed",
        },
      ],
      isError: true,
    };
  }
}

const repoInput = z.object({ repo_url: z.string().min(1) });

server.registerTool(
  "analyze_repository",
  {
    title: "analyze_repository",
    description: "Analyze the top-level structure of a GitHub repository.",
    inputSchema: repoInput,
  },
  ({ repo_url }) => run(() => analyze_repository(repo_url)),
);

server.registerTool(
  "get_repository_map",
  {
    title: "get_repository_map",
    description: "Fetch the file tree for a GitHub repository.",
    inputSchema: repoInput,
  },
  ({ repo_url }) => run(() => get_repositroy_map(repo_url)),
);

server.registerTool(
  "detect_tech_stack",
  {
    title: "detect_tech_stack",
    description: "Detect likely technologies used by a repository from its file tree.",
    inputSchema: repoInput,
  },
  ({ repo_url }) => run(() => detectTechStack(repo_url)),
);

server.registerTool(
  "explain_file",
  {
    title: "explain_file",
    description: "Summarize the contents of a file from a GitHub repository.",
    inputSchema: z.object({
      repo_url: z.string().min(1),
      file_path: z.string().min(1),
    }),
  },
  ({ repo_url, file_path }) => run(() => explain_file(repo_url, file_path)),
);

server.registerTool(
  "search_code",
  {
    title: "search_code",
    description: "Search for code inside a GitHub repository.",
    inputSchema: z.object({
      repo_url: z.string().min(1),
      query: z.string().min(1),
      per_page: z.number().int().positive().max(100).optional(),
    }),
  },
  ({ repo_url, query, per_page }) =>
    run(() => search_code({ repoUrl: repo_url, query, perPage: per_page })),
);


async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Github MCP Server running on stdio");
}

main().catch((error)=>{
  console.error("Fatal error in main(): ",error);
  process.exit();
})