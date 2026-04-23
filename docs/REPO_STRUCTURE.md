# Repository Structure

This document maps the Kairos repository so contributors, judges, and operators can quickly locate the runtime, dashboard, settlement, MCP, and proof components.

## Top-Level Layout

```text
kairos/
|-- README.md
|-- package.json
|-- package-lock.json
|-- tsconfig.json
|-- ecosystem.config.cjs
|-- .env.example
|-- .env.hackathon.example
|-- .gitignore
|-- contracts/
|-- data/
|-- deploy/
|-- docs/
|-- scripts/
|-- src/
|-- test/
|-- .kairos/                  # ignored runtime state
|-- .circle-recovery-file/    # ignored Circle recovery/bootstrap files
|-- artifacts/                # ignored generated artifacts
|-- dist/                     # ignored build output
`-- node_modules/             # ignored dependencies
```

## Top-Level Files

| Path | Purpose |
| --- | --- |
| `README.md` | Primary product, setup, and operations overview |
| `package.json` | Scripts, dependencies, and project metadata |
| `package-lock.json` | Locked dependency graph |
| `tsconfig.json` | TypeScript compiler configuration |
| `ecosystem.config.cjs` | PM2 production process definition |
| `.env.example` | Full environment variable template |
| `.env.hackathon.example` | Hackathon-focused environment template |
| `.gitignore` | Excludes secrets, runtime state, build output, dependencies, and generated artifacts |

## `src/` Layout

```text
src/
|-- agent/
|-- analytics/
|-- chain/
|-- dashboard/
|-- data/
|-- env/
|-- mcp/
|-- risk/
|-- security/
|-- services/
|-- social/
|-- strategy/
`-- trust/
```

### `src/agent/`

The long-running runtime and operational control layer.

| File | Purpose |
| --- | --- |
| `index.ts` | Main entrypoint, runtime cycle, dashboard/MCP startup, graceful shutdown |
| `config.ts` | Arc, identity, mandate, runtime, and strategy configuration |
| `scheduler.ts` | Interval scheduler, error recovery, daily reset, shutdown hooks |
| `state.ts` | Persistence for capital, positions, price history, and cycle count |
| `logger.ts` | Structured logging helpers |
| `validator.ts` | Startup configuration validation |
| `retry.ts` | Retry helper for external calls |
| `operator-control.ts` | Pause, resume, emergency stop, and operator action receipts |
| `supervisory-meta-agent.ts` | Trust-aware supervisory decision layer |
| `trade-log.ts` | Closed trade persistence and trade statistics |

### `src/services/`

Payment, billing, wallet, and data normalisation services.

| File | Purpose |
| --- | --- |
| `nanopayments.ts` | Arc USDC micro-transfer and receipt creation |
| `billing-store.ts` | In-memory billing ledger for tracks, spend, and real transaction counts |
| `normalisation.ts` | AIsa x402 response normalisation for price, sentiment, news, and PRISM |
| `x402-client.mjs` | x402 paying fetch client |
| `x402-client.d.mts` | Type declarations for the x402 client |
| `circle-wallet.ts` | Circle wallet helper utilities |
| `api-billing.ts` | API billing helpers |
| `setup-gateway.mjs` | Circle Gateway setup helper |

### `src/dashboard/`

Dashboard server and public UI.

```text
src/dashboard/
|-- server.ts
|-- UI_VERSIONS.md
|-- public/
|   |-- kairos.html
|   |-- transactions.html
|   |-- trades.html
|   |-- judge.html
|   |-- index.html
|   |-- index.v2.html
|   `-- dashboard-app.jsx
`-- versions/
    `-- KairosDashboard.v2.jsx
```

| File | Purpose |
| --- | --- |
| `server.ts` | Express static server, JSON APIs, MCP proxy, CORS/rate limits |
| `public/kairos.html` | Primary live proof dashboard |
| `public/transactions.html` | Consolidated transaction history and audit ledger |
| `public/trades.html` | Execution/trade-oriented view |
| `public/judge.html` | Judge route surface |
| `public/dashboard-app.jsx` | Legacy/component dashboard app asset |
| `versions/` | Archived dashboard iterations |

### `src/mcp/`

Model Context Protocol surface.

| File | Purpose |
| --- | --- |
| `server.ts` | MCP HTTP/JSON-RPC runtime |
| `tools.ts` | Public, restricted, and operator tools |
| `resources.ts` | Runtime resources such as trust, market, mandate, billing, and integration state |
| `prompts.ts` | Prompt templates for explanation, risk summaries, incidents, and trust evolution |

### `src/data/`

Market, paid data, and exchange feed adapters.

| File | Purpose |
| --- | --- |
| `live-price-feed.ts` | Live price and OHLC retrieval with fallback state |
| `price-feed.ts` | Simulated/seed price data helpers |
| `market-state.ts` | Market state computation from candles |
| `sentiment-feed.ts` | Sentiment aggregation and AIsa/x402 integration path |
| `prism-feed.ts` | PRISM signal, risk, and resolve data |
| `kraken-feed.ts` | Kraken public/private feed helpers |
| `kraken-bridge.ts` | Kraken execution bridge and account snapshot |
| `kraken-cli.ts` | Kraken CLI integration and health checks |

### `src/strategy/`

Signal generation, reasoning, and adaptive learning.

| File | Purpose |
| --- | --- |
| `momentum.ts` | Core strategy signal generation |
| `indicators.ts` | Technical indicators |
| `signals.ts` | Signal utilities |
| `structure-regime.ts` | Market structure regime classification |
| `regime-governance.ts` | Deterministic regime profile selection |
| `edge-filter.ts` | Edge quality filters |
| `neuro-symbolic.ts` | Symbolic reasoning rules |
| `adaptive-learning.ts` | Adaptive parameter updates from outcomes |
| `sage-engine.ts` | SAGE reflection, learned rules, and weight management |
| `ai-reasoning.ts` | Gemini/OpenAI/Claude reasoning and compute billing |

### `src/risk/`

Risk controls.

| File | Purpose |
| --- | --- |
| `engine.ts` | Position sizing, circuit breaker, open/close position management |
| `circuit-breaker.ts` | Circuit breaker primitives |
| `volatility.ts` | Volatility utilities |

### `src/chain/`

Arc, wallet, identity, mandate, routing, and execution logic.

| File | Purpose |
| --- | --- |
| `sdk.ts` | Wallet and chain SDK helpers |
| `executor.ts` | On-chain execution path |
| `risk-router.ts` | Risk router helpers |
| `risk-policy-client.ts` | KairosRiskPolicy contract client |
| `identity.ts` | Agent registration and agent-card metadata |
| `agent-mandate.ts` | Mandate policy and permission checks |
| `dex-router.ts` | DEX routing and quote selection |
| `execution-simulator.ts` | Pre-trade execution simulation |
| `intent.ts` | Trade intent representation |
| `eip1271.ts` | EIP-1271 signature support |
| `feedback-auth.ts` | Feedback authorization helpers |

### `src/trust/`

Proof, artifacts, trust, and checkpointing.

| File | Purpose |
| --- | --- |
| `checkpoint.ts` | Checkpoint creation, retrieval, execution state, and flushing |
| `artifact-emitter.ts` | Trade proof artifact construction and enrichment |
| `trust-policy-scorecard.ts` | Trust score and scorecard logic |
| `reputation-evolution.ts` | Reputation tier evolution |
| `ipfs.ts` | IPFS/Pinata artifact upload |

### `src/security/`

Integrity and attestation helpers.

| File | Purpose |
| --- | --- |
| `oracle-integrity.ts` | Market/oracle integrity checks |
| `tee-attestation.ts` | TEE attestation summary generation |

### `src/analytics/`

| File | Purpose |
| --- | --- |
| `performance-metrics.ts` | Risk-adjusted performance and equity metrics |

### `src/social/`

| File | Purpose |
| --- | --- |
| `share.ts` | Social/share copy generation for trades and daily summaries |

### `src/env/`

| File | Purpose |
| --- | --- |
| `load.ts` | Loads `.env.arc` and `.env` without overriding already-set variables |

## `scripts/`

| File | Purpose |
| --- | --- |
| `bootstrap-circle-wallet.ts` | Create/register Circle wallet configuration and update `.env` |
| `demo-nanopayments.ts` | Exercise nanopayment billing |
| `demo-onchain-path.ts` | Exercise on-chain path |
| `deploy-risk-policy.ts` | Deploy risk policy contract |
| `generate-registration.ts` | Build registration metadata |
| `register-agent.ts` | Register the agent |
| `x402-client-cli.mjs` | x402 client utility |
| `kraken-cli-wrapper.py` | Kraken CLI helper wrapper |
| `repin-mock-artifacts.mjs` | Artifact repin helper |
| `rebuild-apr10-artifacts.mjs` | Historical artifact rebuild utility |
| `fix-apr10-trades.mjs` | Historical trade repair utility |

## `contracts/`

| File | Purpose |
| --- | --- |
| `KairosRiskPolicy.sol` | On-chain risk policy contract used by the Arc risk path |

## `deploy/`

| File | Purpose |
| --- | --- |
| `deploy.sh` | Deployment helper |
| `setup-vultr.sh` | VPS setup helper |
| `setup-tunnel.sh` | Tunnel setup helper |

## `test/`

The test folder contains targeted TypeScript tests for the runtime, MCP, chain, risk, strategy, artifacts, oracle integrity, operator controls, performance metrics, and integration paths. Some generated JavaScript and declaration files are present alongside TypeScript sources.

Primary scripts:

- `test/run-tests.ts`
- `test/test-mcp-surface.ts`
- `test/test-risk.ts`
- `test/test-strategy.ts`
- `test/test-artifacts.ts`
- `test/test-mandate-engine.ts`
- `test/test-execution-simulator.ts`
- `test/test-oracle-integrity.ts`
- `test/test-operator-control.ts`
- `test/test-performance-metrics.ts`
- `test/test-pipeline-integration.ts`

## Ignored Runtime Directories

| Path | Why ignored |
| --- | --- |
| `.env`, `.env.arc` | Secrets and local deployment config |
| `.kairos/` | Runtime state that must not be overwritten by Git |
| `.circle-recovery-file/` | Circle wallet recovery/bootstrap data |
| `artifacts/` | Generated proof artifacts |
| `dist/` | Build output |
| `node_modules/` | Installed dependencies |
| `*.log`, `*.swp` | Local editor and runtime files |
