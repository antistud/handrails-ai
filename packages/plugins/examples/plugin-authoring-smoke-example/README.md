# Plugin Authoring Smoke Example

A Handrails plugin

## Development

```bash
pnpm install
pnpm dev            # watch builds
pnpm dev:ui         # local dev server with hot-reload events
pnpm test
```

## Install Into Handrails

```bash
pnpm handrailsai plugin install ./
```

## Build Options

- `pnpm build` uses esbuild presets from `@handrailsai/plugin-sdk/bundlers`.
- `pnpm build:rollup` uses rollup presets from the same SDK.
