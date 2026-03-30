---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `handrailsai run`

One-command bootstrap and start:

```sh
pnpm handrailsai run
```

Does:

1. Auto-onboards if config is missing
2. Runs `handrailsai doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm handrailsai run --instance dev
```

## `handrailsai onboard`

Interactive first-time setup:

```sh
pnpm handrailsai onboard
```

If Handrails is already configured, rerunning `onboard` keeps the existing config in place. Use `handrailsai configure` to change settings on an existing install.

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm handrailsai onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm handrailsai onboard --yes
```

On an existing install, `--yes` now preserves the current config and just starts Handrails with that setup.

## `handrailsai doctor`

Health checks with optional auto-repair:

```sh
pnpm handrailsai doctor
pnpm handrailsai doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `handrailsai configure`

Update configuration sections:

```sh
pnpm handrailsai configure --section server
pnpm handrailsai configure --section secrets
pnpm handrailsai configure --section storage
```

## `handrailsai env`

Show resolved environment configuration:

```sh
pnpm handrailsai env
```

## `handrailsai allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm handrailsai allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.handrails/instances/default/config.json` |
| Database | `~/.handrails/instances/default/db` |
| Logs | `~/.handrails/instances/default/logs` |
| Storage | `~/.handrails/instances/default/data/storage` |
| Secrets key | `~/.handrails/instances/default/secrets/master.key` |

Override with:

```sh
HANDRAILS_HOME=/custom/home HANDRAILS_INSTANCE_ID=dev pnpm handrailsai run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm handrailsai run --data-dir ./tmp/handrails-dev
pnpm handrailsai doctor --data-dir ./tmp/handrails-dev
```
