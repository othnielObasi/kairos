# Kairos Architecture

This document describes the production architecture of Kairos: the long-running agent runtime, settlement and billing layers, dashboard APIs, MCP surface, and persistence boundaries.

## Design Goals

Kairos is built around five production goals:

- Prove sub-cent per-action economics with USDC on Arc.
- Keep autonomous decisions governed by deterministic safety gates.
- Produce verifiable receipts for billing, compute, data access, and settlement.
- Expose a clear judge/operator audit surface.
- Continue operating safely when optional providers fail.

## High-Level Components

```text
                 Public HTTPS domain
                         |
                         v
                Nginx / reverse proxy
                         |
                         v
                 Express dashboard API
                         |
        +----------------+----------------+
        |                                 |
        v                                 v
Static dashboard and History          MCP HTTP bridge
        |                                 |
        v                                 v
Billing, checkpoint, status APIs      MCP tools/resources/prompts
        |
        +--> Gemini commerce assistant and multimodal proof APIs
        |
        v
Kairos agent runtime loop
        |
        +--> data and x402 normalisation
        +--> strategy and governance gates
        +--> risk and execution simulation
        +--> AI reasoning and SAGE reflection
        +--> Circle/Arc nanopayment settlement
        +--> checkpoint and state persistence
```

## Runtime Process

The production process is started by `ecosystem.config.cjs`:

```text
PM2 app: kairos-agent
Command: npx tsx src/agent/index.ts
Working directory: /opt/kairos
Dashboard port: 3000
MCP port: 3001
```

The entrypoint is `src/agent/index.ts`. When run directly, it starts:

- The dashboard server from `src/dashboard/server.ts`.
- The MCP server from `src/mcp/server.ts`.
- The scheduled agent loop through `src/agent/scheduler.ts`.

## Agent Runtime Layers

| Layer | Primary files | Responsibility |
| --- | --- | --- |
| Configuration | `src/env/load.ts`, `src/agent/config.ts`, `.env.example` | Load environment values and default Arc/Circle/runtime settings |
| Scheduling | `src/agent/scheduler.ts` | Run the cycle loop, recover from errors, handle graceful shutdown |
| Runtime state | `src/agent/state.ts`, `.kairos/` | Persist capital, open positions, cycle count, and price history |
| Strategy | `src/strategy/*` | Compute signals, regimes, learned context, and SAGE adjustments |
| Risk | `src/risk/*`, `src/chain/risk-policy-client.ts` | Apply circuit breakers, sizing, on-chain policy checks, and volatility limits |
| Governance | `src/chain/agent-mandate.ts`, `src/security/oracle-integrity.ts`, `src/agent/supervisory-meta-agent.ts` | Enforce mandate, oracle, supervisory, and operator controls |
| Execution | `src/chain/executor.ts`, `src/chain/dex-router.ts`, `src/data/kraken-bridge.ts` | Route approved actions to Arc risk router, micro-commerce settlement, or Kraken/paper fallback |
| Proof | `src/trust/*`, `src/services/billing-store.ts` | Persist checkpoints, artifacts, scorecards, receipts, and billing totals |

## Payment And Settlement Architecture

Kairos uses two related payment paths.

### Circle Nanopayments

Files:

- `src/services/nanopayments.ts`
- `src/services/billing-store.ts`

Purpose:

- Bill governance stages.
- Bill LLM inference and SAGE reflection.
- Settle Track 4 micro-commerce receipts.
- Track confirmed, pending, and fallback receipts.

Signer preference:

1. Circle Developer-Controlled Wallets when Circle credentials are configured.
2. `OWS_MNEMONIC` / `X402_MNEMONIC` signer for Arc.
3. `NANOPAYMENT_PRIVATE_KEY` / `PRIVATE_KEY` fallback.
4. Fallback receipt if no signer can produce a verified transaction.

### x402 Data Payments

Files:

- `src/services/normalisation.ts`
- `src/services/x402-client.mjs`
- `src/data/live-price-feed.ts`
- `src/data/sentiment-feed.ts`
- `src/data/prism-feed.ts`

Purpose:

- Pay AIsa endpoints per request.
- Normalize paid responses into the shapes existing strategy/oracle code expects.
- Record Track 2 billing events in `billingStore`.

Readiness is exposed through `/api/status` and `/api/feeds/status`.

## Track Architecture

| Track | Runtime source | Billing source | Dashboard source |
| --- | --- | --- | --- |
| Track 1: Agent-to-Agent Payment Loop | Governance stages inside `runCycle()` | `billingStore.addGovernanceEvent()` | `/api/billing` |
| Track 2: Per-API Monetization | `normalisation.ts`, sentiment, PRISM, price feeds | `billingStore.addApiEvent()` | `/api/status`, `/api/billing` |
| Track 3: Usage-Based Compute | `ai-reasoning.ts`, `sage-engine.ts` | `billingStore.addComputeEvent()` | `/api/status`, `/api/sage/status`, `/api/billing` |
| Track 4: Real-Time Micro-Commerce | Approved checkpoint execution | `settleMicroCommerceEvent()` and checkpoint execution state | `/api/checkpoints`, `/api/transactions` |
| Gemini commerce surface | `gemini-commerce.ts`, `gateway-balance.ts` | `billEvent("compute-function-call")`, `billEvent("compute-multimodal")`, `settleCommerceProofReceipt()` | `/commerce`, `/api/commerce/status`, `/api/gemini/commerce-assistant`, `/api/commerce/analyze` |

## Dashboard And API Architecture

The dashboard server in `src/dashboard/server.ts` serves static pages and JSON APIs.

Main static pages:

- `/` and `/kairos`: live proof dashboard.
- `/commerce`: Gemini function calling and multimodal commerce proof studio.
- `/transactions` and `/history`: transaction history and audit ledger.
- `/trades`: execution-oriented trade view.
- `/judge`: redirects to `/kairos`.

Core APIs:

- `/api/status`
- `/api/billing`
- `/api/transactions`
- `/api/checkpoints`
- `/api/health`
- `/api/feeds/status`
- `/api/sage/status`
- `/api/operator/state`
- `/api/gateway-balance`
- `/api/commerce/status`
- `/api/gemini/commerce-assistant`
- `/api/commerce/analyze`
- `/api/commerce/settle`

The dashboard is intentionally concise. Detailed receipt and transaction explanations belong on the History page and API responses.

## MCP Architecture

Files:

- `src/mcp/server.ts`
- `src/mcp/tools.ts`
- `src/mcp/resources.ts`
- `src/mcp/prompts.ts`

The MCP surface exposes:

- Public tools for market, trust, mandate, positions, performance, trade explanation, DEX routing, and feed status.
- Restricted tools for proposals, execution intents, and account-level exchange data.
- Operator tools for pause, resume, emergency stop, and cancellation flows.
- Public resources for trust state, market state, mandate state, open positions, performance, integration state, artifacts, trade history, and feeds.
- Prompts for current trade explanation, risk summaries, incident reports, and trust evolution summaries.

The public dashboard proxies `/mcp` to the internal MCP runtime while preserving role headers where supplied.

## Persistence Boundaries

| Location | Contents | Git status |
| --- | --- | --- |
| `.kairos/` | Runtime state, price history, local operational persistence | Ignored |
| `.circle-recovery-file/` | Circle wallet bootstrap/recovery materials | Ignored |
| `artifacts/` | Generated artifacts and local proof files | Ignored |
| `data/` | Seed data and non-secret project data | Tracked when safe |
| `dist/` | TypeScript build output | Ignored |
| `node_modules/` | Dependencies | Ignored |

## Failure Model

Kairos is designed to degrade safely:

- Feed failures can skip trading while still checking critical stop conditions.
- Billing failures never bypass governance; they produce pending/fallback receipts.
- LLM failures fall through the configured provider chain and then deterministic reasoning.
- Scheduler errors are counted and cooldown-paused after repeated failures.
- State is persisted on shutdown and after important position changes.

## Security Model

Secrets are loaded from `.env.arc` or `.env`, never from committed source. The following must remain out of Git:

- Circle API keys and entity secrets.
- Circle wallet recovery files.
- Gemini, OpenAI, Anthropic, Kraken, Alpha Vantage, and PRISM keys.
- Arc private keys and BIP-39 mnemonics.
- Runtime state under `.kairos/`.

The public surfaces expose proof, status, and metadata. They must not expose private keys, mnemonics, raw exchange secrets, or Circle entity secrets.
