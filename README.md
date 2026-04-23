# Kairos

Kairos is an Arc-native agentic payments runtime for high-frequency, usage-based USDC settlement. It demonstrates how agents, APIs, compute providers, and micro-commerce actions can be priced per action at sub-cent levels without gas overhead destroying the margin.

The project is built for the Agentic Economy on Arc hackathon and runs as a production-style Node.js service with a live dashboard, transaction history, MCP interface, Circle Wallets integration, x402 data payments, Gemini-first reasoning, and Arc-verifiable USDC receipts.

## Live Surfaces

| Surface | URL | Purpose |
| --- | --- | --- |
| Dashboard | `https://kairos.nov-tia.com` | Judge-facing proof surface for the four hackathon tracks |
| Transaction history | `https://kairos.nov-tia.com/transactions` | Consolidated audit trail for billing, x402, compute, and settlement receipts |
| MCP endpoint | `https://kairos.nov-tia.com/mcp` | JSON-RPC tool/resource/prompt surface for agents and operators |
| Agent card | `https://kairos.nov-tia.com/.well-known/agent-card.json` | Public discovery metadata for the Kairos agent |
| Arc explorer | `https://testnet.arcscan.app` | External verification for confirmed Arc transaction hashes |

## What Kairos Proves

Kairos is designed to show economic proof, not only a UI demo:

- Per-action pricing at or below one cent.
- 50+ real Arc transaction receipts during the demo loop.
- USDC-denominated settlement and billing across multiple autonomous surfaces.
- x402-backed paid API consumption through AIsa and Circle Gateway.
- Gemini 3 Flash runtime reasoning with Gemini 3 Pro SAGE reflection and OpenAI failover.
- Circle Wallets or Arc signer based settlement for nanopayments and micro-commerce receipts.
- A clear margin story: sub-cent agent activity is viable on Arc, but not on gas-heavy or fixed-fee payment rails.

Important: dashboard "Runtime cycles" are decision-loop counts. They are not the same as verified Arc transactions. Use "Real Arc txns" and the History page for on-chain proof.

## Hackathon Track Mapping

| Track | Kairos implementation | Proof surface |
| --- | --- | --- |
| Track 1: Agent-to-Agent Payment Loop | Governance stages bill the agent in real time as sub-cent USDC receipts. | Dashboard Track 1, `/api/billing`, History |
| Track 2: Per-API Monetization Engine | AIsa price, social, news, and PRISM calls are paid per request with x402. | Dashboard Track 2, `/api/status`, `/api/billing`, History |
| Track 3: Usage-Based Compute Billing | LLM inference and SAGE reflection are billed per use. | Dashboard Track 3, `/api/status`, `/api/sage/status`, History |
| Track 4: Real-Time Micro-Commerce Flow | Approved actions settle as Arc USDC micro-commerce receipts. | Dashboard Track 4, `/api/checkpoints`, History |

## System Overview

At runtime, Kairos starts one process that owns the agent loop, dashboard API, and MCP interface:

```text
External data and paid APIs
        |
        v
AIsa x402 / live feeds / sentiment / PRISM
        |
        v
Kairos governed runtime loop
        |
        +--> mandate checks
        +--> oracle integrity
        +--> symbolic and regime governance
        +--> supervisory meta-agent
        +--> risk router and simulation
        +--> Gemini/OpenAI reasoning
        +--> SAGE reflection
        |
        v
Circle Nanopayments and Arc USDC settlement
        |
        +--> billing store
        +--> checkpoints and artifacts
        +--> dashboard and History
        +--> MCP resources, tools, and prompts
```

More detailed documentation:

- [Architecture](docs/ARCHITECTURE.md)
- [System Flows](docs/SYSTEM_FLOWS.md)
- [Repository Structure](docs/REPO_STRUCTURE.md)

## Core Technology Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Settlement | Arc Testnet | EVM-compatible L1 settlement layer |
| Unit of account | USDC | Native billing and settlement currency |
| Wallet infrastructure | Circle Developer-Controlled Wallets | Primary programmable wallet path |
| Micropayments | Circle Nanopayments | Sub-cent governance, compute, and settlement receipts |
| Paid data | x402 + AIsa + Circle Gateway | Per-request API monetization and data access |
| AI reasoning | Gemini 3 Flash, Gemini 3 Pro, OpenAI fallback | Runtime explanations and adaptive SAGE reflection |
| Runtime | Node.js, TypeScript, Express, PM2 | Long-running agent, dashboard, and API server |
| Agent interface | MCP over HTTP/JSON-RPC | Tools, resources, and prompts for external agents |

## Quick Start

Install dependencies:

```bash
npm install
```

Create local environment:

```bash
cp .env.example .env
```

Fill the Circle and Arc values first:

```bash
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_SET_ID=
CIRCLE_WALLET_ID=
AGENT_WALLET_ADDRESS=
GOVERNANCE_BILLING_ADDRESS=
MICRO_COMMERCE_SETTLEMENT_ADDRESS=
RPC_URL=https://rpc.testnet.arc.network
CHAIN_ID=5042002
```

For x402 paid data, configure either Circle Wallets or a mnemonic signer:

```bash
OWS_MNEMONIC=
X402_MNEMONIC=
AISA_BASE_URL=https://api.aisa.one/apis/v2
GATEWAY_CONTRACT=0x0077777d7eba4688bdef3e311b846f25870a19b9
```

For Track 3, configure Gemini-first reasoning and OpenAI fallback:

```bash
GEMINI_API_KEY_PRIMARY=
GEMINI_API_KEY_SECONDARY=
GEMINI_RUNTIME_MODELS=gemini-3-flash-preview
GEMINI_REFLECTION_MODELS=gemini-3-pro-preview,gemini-3-flash-preview
OPENAI_API_KEY=
```

Bootstrap Circle Wallet values when needed:

```bash
npm run circle:bootstrap
```

Build and test:

```bash
npm run build
npm test
npm run test:mcp
```

Run the full runtime locally:

```bash
npm run start:arc
```

The local dashboard defaults to `http://localhost:3000`, and the MCP server defaults to `http://localhost:3001/mcp`.

## Production Operation

The deployed process is managed by PM2 through `ecosystem.config.cjs`.

```bash
npm run pm2:start
npm run pm2:logs
npm run pm2:stop
```

Production defaults:

- PM2 app name: `kairos-agent`
- Process entrypoint: `npx tsx src/agent/index.ts`
- Working directory on the VPS: `/opt/kairos`
- Dashboard port: `3000`
- MCP runtime port: `3001`
- Public domain: `https://kairos.nov-tia.com`

The runtime persists operational state in `.kairos/`. Do not delete or overwrite that directory during deploys unless intentionally resetting the demo state.

## Main Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Type-check and compile the TypeScript project |
| `npm test` | Run the project test suite |
| `npm run test:mcp` | Validate the MCP surface |
| `npm run start:arc` | Start the full agent/dashboard/MCP runtime |
| `npm run dashboard` | Start only the dashboard server |
| `npm run mcp` | Start only the MCP server |
| `npm run circle:bootstrap` | Generate/register Circle wallet configuration |
| `npm run demo:nanopayments` | Exercise nanopayment behavior |
| `npm run demo:onchain` | Exercise the on-chain demo path |
| `npm run generate:registration` | Generate agent registration metadata |

## Runtime API Highlights

| Route | Purpose |
| --- | --- |
| `/api/status` | Runtime status, track state, MCP summary, provider readiness |
| `/api/billing` | Billing totals, real Arc transaction count, track spend, receipt summaries |
| `/api/transactions` | Consolidated transaction ledger for the History page |
| `/api/checkpoints` | Governance checkpoints and execution outcomes |
| `/api/health` | Health summary for monitoring |
| `/api/feeds/status` | Data feed and x402 integration status |
| `/api/sage/status` | SAGE reflection state |
| `/api/operator/state` | Operator controls and pause/emergency state |
| `/api/gateway-balance` | Circle Gateway/x402 wallet balance status |

See [System Flows](docs/SYSTEM_FLOWS.md) for how these endpoints map to the runtime loop.

## Security And Secrets

- Never commit `.env`, `.env.arc`, `.kairos/`, `.circle-recovery-file/`, `artifacts/`, or private keys.
- Circle API keys, entity secrets, wallet recovery files, OpenAI keys, Gemini keys, Kraken keys, and mnemonics must stay outside Git.
- The dashboard intentionally exposes only proof summaries and public metadata.
- Operator actions are modeled as restricted/operator MCP tools and HTTP control endpoints.
- Billing failures do not block governance decisions; they produce pending or fallback receipts so the runtime remains safe.

## Documentation Index

| Document | What it covers |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Components, boundaries, trust model, data ownership, deployment shape |
| [System Flows](docs/SYSTEM_FLOWS.md) | End-to-end decision loop, billing, x402, compute, micro-commerce, MCP, dashboard flows |
| [Repository Structure](docs/REPO_STRUCTURE.md) | Full project layout and responsibility of each directory/file group |

## Project Positioning

Kairos is not presented as a generic trading bot. The trading loop is the workload used to generate repeatable, high-frequency, economically meaningful agent actions. The product being demonstrated is the payment and governance runtime: an accountable agent that can consume paid services, pay for compute, settle approved actions, and expose a verifiable audit surface in real time.
