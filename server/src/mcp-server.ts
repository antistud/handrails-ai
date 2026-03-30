/**
 * Handrails MCP Server
 *
 * Server-Sent Events (SSE) transport on port 3200 (configurable).
 * Exposes Handrails tools for Claude Code integration:
 *
 * - knowledge_search: Semantic + keyword hybrid search over company knowledge
 * - knowledge_add: Add a document to the knowledge base
 * - task_create: Create a new task/issue
 * - task_list: List tasks with filters
 * - task_get: Get task details
 * - agent_list: List agents in a company
 * - memory_get: Get agent memory/state
 * - memory_set: Set agent memory/state
 * - company_list: List companies
 * - company_context: Get company context (mission, goals, org chart)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { logger } from "./middleware/logger.js";
import type { Db } from "@handrailsai/db";
import { agents, companies, issues } from "@handrailsai/db";
import { eq, and, desc } from "drizzle-orm";
import type { KnowledgeService } from "./services/knowledge.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// ─── SSE Transport ───────────────────────────────────────────────────────────

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function sendSseEvent(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "knowledge_search",
    description:
      "Search the company knowledge base using semantic + keyword hybrid search. Returns relevant document chunks ranked by relevance.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "Company ID" },
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 10)" },
        scopes: {
          type: "array",
          items: { type: "string" },
          description: "Filter by source path prefix (e.g. 'sops/', 'docs/')",
        },
      },
      required: ["company_id", "query"],
    },
  },
  {
    name: "knowledge_add",
    description: "Add a document to the company knowledge base. It will be chunked and embedded automatically.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "Company ID" },
        title: { type: "string", description: "Document title" },
        content: { type: "string", description: "Document content (markdown)" },
        source_type: { type: "string", enum: ["manual", "upload", "url"], description: "Source type" },
      },
      required: ["company_id", "title", "content"],
    },
  },
  {
    name: "task_create",
    description: "Create a new task (issue) in a company project.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "Company ID" },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        project_id: { type: "string", description: "Project ID" },
        assignee_agent_id: { type: "string", description: "Agent ID to assign to" },
        priority: { type: "string", enum: ["urgent", "high", "medium", "low", "none"] },
      },
      required: ["company_id", "title"],
    },
  },
  {
    name: "task_list",
    description: "List tasks/issues in a company with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "Company ID" },
        status: { type: "string", description: "Filter by status (todo, in_progress, done, blocked)" },
        assignee_agent_id: { type: "string", description: "Filter by assignee agent ID" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["company_id"],
    },
  },
  {
    name: "task_get",
    description: "Get detailed information about a specific task/issue.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "Company ID" },
        issue_id: { type: "string", description: "Issue/task ID" },
      },
      required: ["company_id", "issue_id"],
    },
  },
  {
    name: "agent_list",
    description: "List all agents in a company with their status, role, and budget info.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "Company ID" },
      },
      required: ["company_id"],
    },
  },
  {
    name: "memory_get",
    description: "Get agent runtime state / memory.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent ID" },
        key: { type: "string", description: "Memory key to retrieve (omit for all)" },
      },
      required: ["agent_id"],
    },
  },
  {
    name: "memory_set",
    description: "Set agent runtime state / memory.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent ID" },
        key: { type: "string", description: "Memory key" },
        value: { type: "string", description: "Memory value" },
      },
      required: ["agent_id", "key", "value"],
    },
  },
  {
    name: "company_list",
    description: "List all companies in this Handrails instance.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "company_context",
    description: "Get company context: name, mission, goals, org chart summary, and recent activity.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "Company ID" },
      },
      required: ["company_id"],
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────────────────────

function createToolHandlers(db: Db, knowledgeService: KnowledgeService) {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<McpToolResult>> = {
    async knowledge_search(args) {
      const results = await knowledgeService.search({
        companyId: args.company_id as string,
        query: args.query as string,
        limit: (args.limit as number) ?? 10,
        scopes: args.scopes as string[] | undefined,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              results.map((r) => ({
                title: r.documentTitle,
                source: r.sourcePath,
                content: r.content,
                score: r.score,
                matchType: r.matchType,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },

    async knowledge_add(args) {
      const result = await knowledgeService.ingestDocument({
        companyId: args.company_id as string,
        title: args.title as string,
        content: args.content as string,
        sourceType: (args.source_type as "manual" | "upload" | "url") ?? "manual",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },

    async task_create(args) {
      const [issue] = await db
        .insert(issues)
        .values({
          companyId: args.company_id as string,
          title: args.title as string,
          description: (args.description as string) ?? null,
          projectId: (args.project_id as string) ?? null,
          assigneeAgentId: (args.assignee_agent_id as string) ?? null,
          priority: (args.priority as string) ?? "medium",
        })
        .returning({ id: issues.id, identifier: issues.identifier });
      return {
        content: [{ type: "text", text: JSON.stringify(issue) }],
      };
    },

    async task_list(args) {
      const conditions = [eq(issues.companyId, args.company_id as string)];
      if (args.status) {
        conditions.push(eq(issues.status, args.status as string));
      }
      if (args.assignee_agent_id) {
        conditions.push(eq(issues.assigneeAgentId, args.assignee_agent_id as string));
      }
      const result = await db
        .select({
          id: issues.id,
          identifier: issues.identifier,
          title: issues.title,
          status: issues.status,
          priority: issues.priority,
          assigneeAgentId: issues.assigneeAgentId,
        })
        .from(issues)
        .where(and(...conditions))
        .orderBy(desc(issues.updatedAt))
        .limit((args.limit as number) ?? 20);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },

    async task_get(args) {
      const [issue] = await db
        .select()
        .from(issues)
        .where(
          and(
            eq(issues.companyId, args.company_id as string),
            eq(issues.id, args.issue_id as string),
          ),
        );
      if (!issue) {
        return { content: [{ type: "text", text: "Issue not found" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
      };
    },

    async agent_list(args) {
      const result = await db
        .select({
          id: agents.id,
          name: agents.name,
          role: agents.role,
          title: agents.title,
          status: agents.status,
          adapterType: agents.adapterType,
          budgetMonthlyCents: agents.budgetMonthlyCents,
          spentMonthlyCents: agents.spentMonthlyCents,
          lastHeartbeatAt: agents.lastHeartbeatAt,
        })
        .from(agents)
        .where(eq(agents.companyId, args.company_id as string));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },

    async memory_get(args) {
      const { agentRuntimeState } = await import("@handrailsai/db");
      const result = await db
        .select()
        .from(agentRuntimeState)
        .where(eq(agentRuntimeState.agentId, args.agent_id as string));
      const state = result[0];
      if (!state) {
        return { content: [{ type: "text", text: "{}" }] };
      }
      if (args.key) {
        const data = (state.stateJson ?? {}) as Record<string, unknown>;
        return {
          content: [{ type: "text", text: JSON.stringify(data[args.key as string] ?? null) }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(state.stateJson, null, 2) }],
      };
    },

    async memory_set(args) {
      const { agentRuntimeState } = await import("@handrailsai/db");
      const agentId = args.agent_id as string;
      const key = args.key as string;
      const value = args.value as string;

      const existing = await db
        .select()
        .from(agentRuntimeState)
        .where(eq(agentRuntimeState.agentId, agentId));

      if (existing.length > 0) {
        const currentState = (existing[0]!.stateJson ?? {}) as Record<string, unknown>;
        currentState[key] = value;
        await db
          .update(agentRuntimeState)
          .set({ stateJson: currentState, updatedAt: new Date() })
          .where(eq(agentRuntimeState.agentId, agentId));
      } else {
        // memory_set requires an existing agent runtime state row;
        // it's created when the agent first runs. Return a helpful error.
        return {
          content: [{ type: "text", text: `No runtime state found for agent ${agentId}. The agent must run at least once first.` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Set ${key} for agent ${agentId}` }],
      };
    },

    async company_list() {
      const result = await db
        .select({
          id: companies.id,
          name: companies.name,
          description: companies.description,
          status: companies.status,
        })
        .from(companies);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },

    async company_context(args) {
      const companyId = args.company_id as string;
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId));
      if (!company) {
        return { content: [{ type: "text", text: "Company not found" }], isError: true };
      }

      const agentList = await db
        .select({ id: agents.id, name: agents.name, role: agents.role, status: agents.status })
        .from(agents)
        .where(eq(agents.companyId, companyId));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                company: {
                  name: company.name,
                  description: company.description,
                  status: company.status,
                },
                agents: agentList,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  };

  return handlers;
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

export function startMcpServer(deps: {
  db: Db;
  knowledgeService: KnowledgeService;
  port?: number;
  mcpToken?: string;
}) {
  const { db, knowledgeService } = deps;
  const port = deps.port ?? Number(process.env.HANDRAILS_MCP_PORT) ?? 3200;
  const mcpToken = deps.mcpToken ?? process.env.HANDRAILS_MCP_TOKEN;
  const handlers = createToolHandlers(db, knowledgeService);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, sseHeaders());
      res.end();
      return;
    }

    // Auth check
    if (mcpToken) {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${mcpToken}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // SSE endpoint for MCP connection
    if (url.pathname === "/sse" && req.method === "GET") {
      res.writeHead(200, sseHeaders());

      // Send initial tools list
      sendSseEvent(res, "tools", {
        tools: TOOL_DEFINITIONS,
      });

      // Keep connection alive with periodic heartbeat
      const heartbeat = setInterval(() => {
        sendSseEvent(res, "heartbeat", { timestamp: Date.now() });
      }, 30000);

      req.on("close", () => {
        clearInterval(heartbeat);
      });

      return;
    }

    // Tool invocation endpoint
    if (url.pathname === "/tools/call" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }

      try {
        const toolCall = JSON.parse(body) as McpToolCall;
        const handler = handlers[toolCall.name];

        if (!handler) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }));
          return;
        }

        const result = await handler(toolCall.arguments);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err }, "MCP tool call error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            content: [{ type: "text", text: `Error: ${msg}` }],
            isError: true,
          }),
        );
      }

      return;
    }

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tools: TOOL_DEFINITIONS.length }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, () => {
    logger.info({ port }, "Handrails MCP server started (SSE transport)");
  });

  return server;
}
