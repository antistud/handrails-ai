---
title: Environment Variables
summary: Full environment variable reference
---

All environment variables that Handrails uses for server configuration.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `HOST` | `127.0.0.1` | Server host binding |
| `DATABASE_URL` | (embedded) | PostgreSQL connection string |
| `HANDRAILS_HOME` | `~/.handrails` | Base directory for all Handrails data |
| `HANDRAILS_INSTANCE_ID` | `default` | Instance identifier (for multiple local instances) |
| `HANDRAILS_DEPLOYMENT_MODE` | `local_trusted` | Runtime mode override |

## Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `HANDRAILS_SECRETS_MASTER_KEY` | (from file) | 32-byte encryption key (base64/hex/raw) |
| `HANDRAILS_SECRETS_MASTER_KEY_FILE` | `~/.handrails/.../secrets/master.key` | Path to key file |
| `HANDRAILS_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive env vars |

## Agent Runtime (Injected into agent processes)

These are set automatically by the server when invoking agents:

| Variable | Description |
|----------|-------------|
| `HANDRAILS_AGENT_ID` | Agent's unique ID |
| `HANDRAILS_COMPANY_ID` | Company ID |
| `HANDRAILS_API_URL` | Handrails API base URL |
| `HANDRAILS_API_KEY` | Short-lived JWT for API auth |
| `HANDRAILS_RUN_ID` | Current heartbeat run ID |
| `HANDRAILS_TASK_ID` | Issue that triggered this wake |
| `HANDRAILS_WAKE_REASON` | Wake trigger reason |
| `HANDRAILS_WAKE_COMMENT_ID` | Comment that triggered this wake |
| `HANDRAILS_APPROVAL_ID` | Resolved approval ID |
| `HANDRAILS_APPROVAL_STATUS` | Approval decision |
| `HANDRAILS_LINKED_ISSUE_IDS` | Comma-separated linked issue IDs |

## LLM Provider Keys (for adapters)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |
