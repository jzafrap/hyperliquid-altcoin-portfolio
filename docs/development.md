# Development

Set up locally, run the checks, and follow the contribution workflow.

## Scripts

| Command | Does |
|---------|------|
| `npm run dev` | Start the Vite dev server. |
| `npm run build` | Type-check (`tsc -b`) then production build. |
| `npm run typecheck` | Type-check only. |
| `npm test` | Run the test suite once (Vitest). |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run preview` | Preview the production build. |

## Project layout

```
src/
  config/      env.ts — single network switch
  lib/         pure logic + IO (orders, sell, execute, lots, pnl, agent, markets, …)
  hooks/       React Query + reactive state
  components/  UI
  app/         providers (Wagmi + Query)
  test/        setup.ts (installs an in-memory localStorage for tests)
docs/          this documentation
instructions.md  original spec + committed decisions
```

See [Architecture](./architecture.md) for the module map.

## Environment

```bash
cp .env.example .env
# VITE_HL_NETWORK=testnet   # default; "mainnet" only after testnet validation
```

## Testing

- **Pure logic** in `lib/` is unit-tested directly (sizing, pricing, P&L, lot
  updates, fill parsing, tokenset/lot persistence).
- **Orchestration** (`executeBuy` / `executeSell`) is tested with a mocked exchange
  client for happy path, no-fill (throws), partial fill, and persist-failure.
- The test setup installs an in-memory `localStorage` because jsdom's is a
  non-functional stub in this runtime. See [Hyperliquid Reference → Gotchas](./hyperliquid-reference.md#environment--tooling-gotchas).

Run before every commit:

```bash
npm run typecheck && npm test && npm run build
```

## Contribution workflow

This repo was built with a **slice-per-PR** workflow:

1. Branch from `main` (e.g. `feat/<slice>`).
2. Implement one coherent slice; keep the money-path pure logic tested.
3. For any change that moves funds (buy/sell/agent), run an adversarial review
   **before** opening the PR and fix findings first.
4. Verify: `tsc -b` clean, tests green, `vite build` OK (and a dev-server smoke).
5. Open a PR to `main` with a clear "what / verification" description; merge when
   green.

Commits use **conventional commit** messages, no AI attribution.

> Stacked-PR caution: don't delete a base branch while a PR still targets it —
> GitHub closes the dependent PR. Merge bottom-up, or retarget first.

## Conventions

- TypeScript strict; no `any` in money logic.
- Keep pure logic free of React/network so it stays unit-testable.
- On-wire numbers are plain decimal strings (never `String(number)` for prices/sizes).
- Never persist or log the agent private key.

## Next step

[Architecture](./architecture.md) to navigate the code, or
[Hyperliquid Reference](./hyperliquid-reference.md) for the API facts.
