# Handrails

**Run AI agent companies with shared knowledge.**

Handrails combines multi-agent orchestration, a vector-backed knowledge layer, and a shared memory MCP server into one self-hosted platform. Developers connect via Claude Code. Operators run it from a dashboard. Agents handle the rest.

## Core Principles

- **Local-first** — runs on your machine, data never leaves, fully offline without an account
- **Cloud-connected (optional)** — manage from anywhere via handrails.dev, no firewall changes
- **Business as code** — your running business is a git repo, portable with `git clone && handrails up`

## The Two-Repo Model

| Repo | Purpose |
|------|---------|
| `handrails-ai` (this repo) | The engine. Cloned once, updated from the project. |
| `your-company` | A git repo representing your business. Agents, goals, knowledge, email routing — all version controlled. |

## Quickstart

```bash
# Install
npx handrailsai onboard

# Create a business
handrails init my-company
cd my-company

# Configure
cp .env.example .env
# Edit .env with your API keys

# Run
handrails up
```

## What's Included

- **pgvector Knowledge Layer** — company docs chunked, embedded, and searchable via hybrid retrieval (vector + keyword + RRF)
- **Email Boundary** — SMTP/IMAP for external communications; managed (Resend) or manual mode
- **MCP Server** — connect Claude Code directly to Handrails for knowledge search, task management, and shared memory (SSE transport, port 3200)
- **Multi-Agent Orchestration** — heartbeat scheduling, ticket-based task system, org charts, budgets, governance
- **Business Portability** — `handrails export` / `handrails restore` for runtime state; embeddings regenerate from source docs
- **Adapter System** — Claude Code, Codex, Cursor, Gemini, OpenCode, Pi, OpenClaw, and more

## Claude Code MCP Connection

```json
{
  "mcpServers": {
    "handrails": {
      "url": "http://localhost:3200/sse",
      "headers": {
        "Authorization": "Bearer ${HANDRAILS_MCP_TOKEN}"
      }
    }
  }
}
```

**MCP Tools:** `knowledge_search`, `knowledge_add`, `task_create`, `task_list`, `task_get`, `agent_list`, `memory_get`, `memory_set`, `company_list`, `company_context`

## Business Repo Structure

```
my-company/
├── handrails.yml          # manifest
├── agents/
│   └── ceo.yml
├── goals/
│   └── mission.md
├── skills/
├── knowledge/
│   ├── sops/
│   └── docs/
├── email/
│   ├── config.yml
│   └── routes.yml
├── projects/
└── .env.example
```

## CLI

```bash
handrails init <name>       # scaffold a new business repo
handrails up                # start engine, sync business repo
handrails validate          # validate config without starting
handrails knowledge index   # re-embed knowledge docs
handrails status            # agents, costs, pending tasks
handrails export            # export runtime state
handrails restore <file>    # restore on new machine
```

## Moving to a New Machine

```bash
git clone https://github.com/you/my-company
cd my-company
cp .env.example .env        # add your secrets
handrails up                # re-embeds knowledge, resumes agents
```

## Tech Stack

- Node.js + TypeScript monorepo (pnpm)
- Express 5 API server
- React + Vite dashboard
- PostgreSQL + pgvector (embedded or external)
- Drizzle ORM
- SSE-based MCP server

## Based on Paperclip

Handrails is built on [Paperclip](https://github.com/paperclipai/paperclip) (MIT). We keep full parity with the Paperclip core while adding the knowledge layer, two-repo architecture, email boundary, and MCP server.

## License

MIT. Based on Paperclip (MIT © 2025 Paperclip AI). Handrails additions MIT © 2026 Valid Dot Care, Inc.
