---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm handrailsai issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm handrailsai issue get <issue-id-or-identifier>

# Create issue
pnpm handrailsai issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm handrailsai issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm handrailsai issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm handrailsai issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm handrailsai issue release <issue-id>
```

## Company Commands

```sh
pnpm handrailsai company list
pnpm handrailsai company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm handrailsai company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm handrailsai company import \
  <owner>/<repo>/<path> \
  --target existing \
  --company-id <company-id> \
  --ref main \
  --collision rename \
  --dry-run

# Apply import
pnpm handrailsai company import \
  ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm handrailsai agent list
pnpm handrailsai agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm handrailsai approval list [--status pending]

# Get approval
pnpm handrailsai approval get <approval-id>

# Create approval
pnpm handrailsai approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm handrailsai approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm handrailsai approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm handrailsai approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm handrailsai approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm handrailsai approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm handrailsai activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm handrailsai dashboard get
```

## Heartbeat

```sh
pnpm handrailsai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
