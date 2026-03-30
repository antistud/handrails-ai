# CLI Reference

Handrails CLI now supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm handrailsai --help
```

First-time local bootstrap + run:

```sh
pnpm handrailsai run
```

Choose local instance:

```sh
pnpm handrailsai run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `handrailsai onboard` and `handrailsai configure --section server` set deployment mode in config
- runtime can override mode with `HANDRAILS_DEPLOYMENT_MODE`
- `handrailsai run` and `handrailsai doctor` do not yet expose a direct `--mode` flag

Target behavior (planned) is documented in `doc/DEPLOYMENT-MODES.md` section 5.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm handrailsai allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.handrails`:

```sh
pnpm handrailsai run --data-dir ./tmp/handrails-dev
pnpm handrailsai issue list --data-dir ./tmp/handrails-dev
```

## Context Profiles

Store local defaults in `~/.handrails/context.json`:

```sh
pnpm handrailsai context set --api-base http://localhost:3100 --company-id <company-id>
pnpm handrailsai context show
pnpm handrailsai context list
pnpm handrailsai context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm handrailsai context set --api-key-env-var-name HANDRAILS_API_KEY
export HANDRAILS_API_KEY=...
```

## Company Commands

```sh
pnpm handrailsai company list
pnpm handrailsai company get <company-id>
pnpm handrailsai company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm handrailsai company delete PAP --yes --confirm PAP
pnpm handrailsai company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `HANDRAILS_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `HANDRAILS_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm handrailsai issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm handrailsai issue get <issue-id-or-identifier>
pnpm handrailsai issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm handrailsai issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm handrailsai issue comment <issue-id> --body "..." [--reopen]
pnpm handrailsai issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm handrailsai issue release <issue-id>
```

## Agent Commands

```sh
pnpm handrailsai agent list --company-id <company-id>
pnpm handrailsai agent get <agent-id>
pnpm handrailsai agent local-cli <agent-id-or-shortname> --company-id <company-id>
```

`agent local-cli` is the quickest way to run local Claude/Codex manually as a Handrails agent:

- creates a new long-lived agent API key
- installs missing Handrails skills into `~/.codex/skills` and `~/.claude/skills`
- prints `export ...` lines for `HANDRAILS_API_URL`, `HANDRAILS_COMPANY_ID`, `HANDRAILS_AGENT_ID`, and `HANDRAILS_API_KEY`

Example for shortname-based local setup:

```sh
pnpm handrailsai agent local-cli codexcoder --company-id <company-id>
pnpm handrailsai agent local-cli claudecoder --company-id <company-id>
```

## Approval Commands

```sh
pnpm handrailsai approval list --company-id <company-id> [--status pending]
pnpm handrailsai approval get <approval-id>
pnpm handrailsai approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm handrailsai approval approve <approval-id> [--decision-note "..."]
pnpm handrailsai approval reject <approval-id> [--decision-note "..."]
pnpm handrailsai approval request-revision <approval-id> [--decision-note "..."]
pnpm handrailsai approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm handrailsai approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm handrailsai activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm handrailsai dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm handrailsai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.handrails/instances/default`:

- config: `~/.handrails/instances/default/config.json`
- embedded db: `~/.handrails/instances/default/db`
- logs: `~/.handrails/instances/default/logs`
- storage: `~/.handrails/instances/default/data/storage`
- secrets key: `~/.handrails/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
HANDRAILS_HOME=/custom/home HANDRAILS_INSTANCE_ID=dev pnpm handrailsai run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm handrailsai configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
