<p align="center">
  <h1 align="center">Kairos</h1>
  <p align="center"><strong>The agent pays for its own governance.</strong></p>
  <p align="center">
    <a href="#the-economic-primitive">Primitive</a> &bull;
    <a href="#four-tracks--one-cycle">Tracks</a> &bull;
    <a href="#system-architecture">Architecture</a> &bull;
    <a href="#circle-platform-stack">Circle Stack</a> &bull;
    <a href="#quick-start">Quick Start</a> &bull;
    <a href="#api">API</a>
  </p>
  <p align="center">
    Built for the <strong>Agentic Economy on Arc</strong> hackathon · Circle + LabLab.ai · April 2026<br>
    <strong>Live:</strong> <a href="https://kairos.nov-tia.com">kairos.nov-tia.com</a>
  </p>
</p>

---

Before any Kairos action executes, it must pay for the oversight that permits it. Every governance stage evaluation, every data pull, every reasoning call is a real USDC transaction on Arc — paid by the agent, settled on-chain, verifiable before the action it governs.

This is not a billing feature. It is a new economic primitive: governance enforced through payment rather than policy. An agent that cannot afford its own oversight cannot act.

---

## Key Capabilities

| Capability | Description |
|---|---|
| **Payment-as-governance** | Every governance stage costs $0.001 USDC — the agent cannot act without paying for oversight |
| **All four hackathon tracks** | A single cycle fires 13 paid events across governance, data, compute, and settlement simultaneously |
| **On-chain audit trail** | Every paid action has a Circle product attribution and Arc transaction hash — no self-reporting |
| **x402 native data layer** | All five data sources paid per request via AIsa x402 through Circle Gateway on Arc |
| **Gemini-first reasoning** | Gemini 3 Flash for per-cycle inference · Gemini 3 Pro for SAGE adaptive reflection |
| **Full Circle stack** | Arc · USDC · Circle Nanopayments · Circle Wallets · Circle Gateway — all five products in one system |
| **Production runtime** | Node.js + TypeScript + PM2 on Vultr · KrakenFX CLI bridge · MCP interface · always-on |
| **Two-surface proof** | `/transactions` for payment proof · `/execution` for action log — clearly separated |
| **Gemini Commerce Studio** | Function Calling over live commerce tools · multimodal invoice analysis · Arc proof settlement |

---

## Live

| Surface | URL | Purpose |
|---|--- |---|
| Dashboard | `https://kairos.nov-tia.com` | Judge-facing proof surface — all four tracks live |
| Transaction audit trail | `https://kairos.nov-tia.com/transactions` | Every paid action, one audit trail — the judge proof surface |
| Execution History | `https://kairos.nov-tia.com/execution` | Governed action and outcome log — entry, exit, PnL, artifacts (`/trades` also works) |
| Document Vault | `https://kairos.nov-tia.com/documents` | Kairos-generated invoices, receipts, and proof files across all tracks |
| Gemini Commerce Studio | `https://kairos.nov-tia.com/commerce` | Gemini Function Calling + multimodal receipt analysis + Arc proof settlement |
| MCP interface | `https://kairos.nov-tia.com/mcp` | JSON-RPC tools, resources, and prompts for agents and operators |
| Agent card | `https://kairos.nov-tia.com/.well-known/agent-card.json` | Public agent discovery metadata |
| Arc block explorer | `https://testnet.arcscan.app` | Independent verification of every Arc transaction hash |

---

## The Economic Primitive

Most AI governance systems bill the operator — a monthly subscription, a platform fee, a per-seat charge. Kairos bills the agent.

Each cycle, the agent pays for:
- The data it consumed to make the decision
- Each governance stage that evaluated the decision
- The compute used to reason about the decision
- The settlement of the action the decision approved

The payment record is the audit trail. You cannot produce a Kairos transaction history that includes a governance stage without the corresponding Nanopayment appearing on Arc. The economic proof and the compliance proof are the same artifact.

This inverts the incentive structure of AI governance. Governance is no longer a cost that operators can reduce by buying cheaper oversight — it is a direct economic constraint on the agent for every action it takes.

---

## What Kairos Actually Is

Kairos has five layers working together:

1. **Data plane** — paid market, sentiment, and PRISM-style context fetched through AIsa and x402
2. **Governance plane** — mandate, oracle, supervisory, simulator, risk-router, LLM, and SAGE stages that bill the runtime per action
3. **Compute plane** — runtime reasoning and reflective learning billed like metered infrastructure
4. **Execution plane** — approved actions settled on Arc, routed to Kraken, or recorded locally depending on readiness
5. **Proof plane** — dashboard, Transaction History, Document Vault, MCP, and Arc explorer expose what happened in a judge-verifiable way

---

## Four Tracks — One Cycle

Every Kairos cycle simultaneously touches all four hackathon tracks:

| Track | What fires | Circle product | Cost |
|---|--- |---|--- |
| Agent-to-Agent Loop | 7 governance stage evaluations | Circle Nanopayments | $0.001 each |
| Per-API Monetisation | 5 AIsa x402 data pulls | Circle Gateway + x402 | $0.001–$0.007 each |
| Usage-Based Compute | LLM inference + SAGE reflection | Circle Nanopayments | $0.001 each |
| Real-Time Micro-Commerce | Approved action settlement in USDC | Circle Wallets + Arc | $0.009 each |

13 payment events per cycle. All four tracks fire simultaneously. One cycle produces a complete, verifiable economic record of a governed agent action.

### Track 4 — Two Layers

Track 4 has two distinct layers that are easy to confuse:

**Layer 1 — The underlying action.** Kairos makes a governed execution decision (LONG/SHORT WETH/USDC). This appears in Execution History at `/execution` with entry price, PnL, close reason, and artifact link. It is the workload Kairos uses to generate economically meaningful agent actions.

**Layer 2 — The Arc micro-commerce receipt.** When an action is approved, `settleMicroCommerceEvent()` sends a real $0.009 USDC transfer on Arc to `MICRO_COMMERCE_SETTLEMENT_ADDRESS`. This is the actual Track 4 hackathon proof — a real on-chain micro-payment receipt, independently verifiable on `testnet.arcscan.app`.

The $0.009 on-chain transfer is the settlement proof. The underlying trade notional (e.g. $400 WETH/USDC) is the action value. Both are real. They are different numbers. Use `/transactions` and the Arc explorer for on-chain receipt verification — not the trade size shown in Execution History.

---

## How To Read The Dashboard

| Term | Meaning |
|---|---|
| `Real Arc txns` | Verified Arc receipts counted as live proof |
| `Pending hash` | A receipt exists but the final Arc hash has not yet been hydrated |
| `Fallback` | The runtime recorded the event without a verifiable on-chain receipt |
| `Runtime cycles` | Decision loops completed — not on-chain transactions |
| `Track status` | Current proof state — e.g. `LIVE x402`, `COMPUTE BILLED`, `ARC SETTLED` |
| `Recent Nanopayments` | Most recent receipts supporting the live proof story |

Track 4 state meanings:

| State | Meaning |
|---|---|
| `ARC SETTLED` | A confirmed Arc receipt exists for the Track 4 action |
| `VERIFYING` | Receipt submitted — final Arc hash still resolving |
| `KRAKEN LIVE` | Exchange execution happened, Arc settlement was not the proof path |
| `PAPER EXECUTION` | Kraken paper execution recorded, not on-chain settlement |
| `LOCAL ONLY` | Action recorded locally without external settlement proof |
| `IDLE` | No qualifying Track 4 action produced yet |

---

## What Kairos Proves

Economic proof, not a UI demo.

**Per-action pricing at sub-cent scale works.** Every billable event costs $0.001–$0.009 USDC. The governance overhead per decision is $0.001. This model is structurally impossible on gas chains — each event would cost $2–20 in ETH gas. Arc makes it viable.

| Rail | Cost per governance event | Viable for $0.001 actions? |
|---|--- |---|
| Ethereum mainnet | $2–20 | No — gas exceeds action value by 2000× |
| Base / Optimism | $0.01–$0.10 | No — still exceeds action value |
| Fixed-fee (Stripe) | Monthly subscription | No — no per-action pricing |
| Arc | $0 gas · USDC native | Yes |

**The audit trail is on-chain, not self-reported.** The `/transactions` page consolidates every governance receipt, x402 payment, compute billing event, and settlement confirmation. Every row carries a timestamp, a Circle product attribution, and an Arc transaction hash. Visit `https://testnet.arcscan.app` and verify any hash independently — no trust required.

**50+ Arc transactions are not a demo number.** The system generates 13 billable events per cycle and runs continuously. Transaction counts update in real time on the dashboard and are independently verifiable on Arc.

- Native Kairos invoice, receipt, and delivery-proof bundle generation for every Track 4 event — no manual upload required.
- Cross-track document generation so Tracks 1–3 are inspectable without reading raw ledger rows.

> **Important:** Dashboard "Runtime cycles" are decision-loop counts — not Arc transactions. Use "Real Arc txns" and the `/transactions` page for verified on-chain proof.

### Two Surfaces — Different Purposes

| Surface | URL | Answers |
|---|--- |---|
| Transaction History | `/transactions` | What did Kairos pay for or settle? — governance receipts, x402 payments, compute billing, Arc settlement receipts |
| Execution History | `/execution` | What execution decisions did Kairos make? — entry, exit, PnL, close reason, IPFS artifact |

**Transaction History is the judge proof surface.** Every row is a billable event with a Circle product attribution and an Arc transaction hash. This is the on-chain record.

**Execution History is the workload log.** It shows what actions the governed runtime chose to take. It is supporting context — not itself a hackathon track. An approved execution produces both an Execution History entry and a Track 4 Arc settlement receipt in Transaction History.

`/trades` still works as a backward-compatible alias for `/execution`.

---

## Circle Platform Stack

| Product | Role in Kairos |
|---|--- |
| Arc | All settlement — every Nanopayment batch and x402 data payment settles on Arc L1 |
| USDC | Unit of account — all billing, data payments, compute, and settlement in USDC |
| Circle Nanopayments | Governance + compute billing — instant EIP-3009 confirmation, Arc batch settlement |
| Circle Wallets | Agent identity — MPC-based programmatic signing, developer-controlled wallet infrastructure |
| Circle Gateway | x402 data payment batching — AIsa API calls settle on Arc via Gateway |

---

## AI Reasoning Stack

| Role | Model | Purpose |
|---|---|---|
| Primary runtime | Gemini 3 Flash | Low-latency inference per governance cycle (`src/strategy/ai-reasoning.ts`) |
| SAGE reflection | Gemini 3 Pro | Deep reasoning for adaptive weight optimisation (`src/strategy/sage-engine.ts`) |
| Commerce Function Calling | Gemini 3 Flash | Live tool-use over Circle Wallets balance, Arc receipt status, Track 4 settlement |
| Multimodal analysis | Gemini 3 Pro | Invoice/receipt image extraction → structured fields → Arc settlement gate |
| Failover | OpenAI GPT-4o-mini | Tertiary fallback across all Gemini surfaces if quota exceeded |

Gemini 3 Flash handles high-frequency per-cycle reasoning and Function Calling in the Commerce Studio. Gemini 3 Pro runs SAGE reflection and multimodal invoice analysis. Every inference and reflection call is billed as a Circle Nanopayment. All Gemini surfaces fall back to OpenAI GPT-4o-mini automatically if quota is exceeded — the runtime remains live.

---

## Hackathon Track Mapping

| Track | Kairos implementation | On-chain proof |
|---|--- |---|
| Agent-to-Agent Payment Loop | Governance stages bill the agent as sub-cent USDC Nanopayments in real time | Dashboard Track 1 · `/api/billing` · History · Arc explorer |
| Per-API Monetisation Engine | All five data sources paid per request via x402 through Circle Gateway on Arc | Dashboard Track 2 · `/api/billing` · History · Arc explorer |
| Usage-Based Compute Billing | Every LLM inference and SAGE reflection billed per use via Nanopayments | Dashboard Track 3 · `/api/sage/status` · History · Arc explorer |
| Real-Time Micro-Commerce Flow | Each approved action triggers a $0.009 USDC Arc micro-commerce receipt via `settleMicroCommerceEvent()` · settlement is separate from trade notional | Dashboard Track 4 · `/transactions` · Arc explorer · `/api/checkpoints` |

---

## System Architecture

```
External data and paid APIs
        |
        v
AIsa x402 — price · social · news · PRISM
(paid per request via Circle Gateway on Arc)
        |
        v
Kairos governed runtime
        |
        +-- mandate enforcement       → Nanopayment  ($0.001)
        +-- oracle integrity          → Nanopayment  ($0.001)
        +-- symbolic regime check     → (internal)
        +-- supervisory meta-agent    → Nanopayment  ($0.001)
        +-- risk router + simulation  → Nanopayment  ($0.001)
        +-- Gemini 3 Flash reasoning  → Nanopayment  ($0.001)
        +-- SAGE reflection           → Nanopayment  ($0.001)
        |
        v
Circle Wallets + Arc settlement
        |
        +-- billing store + receipts
        +-- transaction audit trail   (/transactions)
        +-- checkpoints + artifacts
        +-- dashboard + History
        +-- MCP tools, resources, prompts
```

Full documentation: [Architecture](docs/ARCHITECTURE.md) · [System Flows](docs/SYSTEM_FLOWS.md) · [Repository Structure](docs/REPO_STRUCTURE.md)

---

## Core Technology Stack

| Layer | Technology | Role |
|---|--- |---|
| Settlement | Arc Testnet | EVM-compatible L1 settlement layer |
| Unit of account | USDC | Native billing and settlement currency |
| Wallet infrastructure | Circle Developer-Controlled Wallets | Primary programmable wallet path |
| Micropayments | Circle Nanopayments | Sub-cent governance, compute, and settlement receipts |
| Paid data | x402 + AIsa + Circle Gateway | Per-request API monetisation and data access |
| AI reasoning | Gemini 3 Flash · Gemini 3 Pro · OpenAI fallback | Runtime reasoning and adaptive SAGE reflection |
| Runtime | Node.js · TypeScript · Express · PM2 | Long-running agent, dashboard, and API server |
| Infrastructure | Vultr VPS | Production deployment — always-on Arc-connected runtime |
| Execution bridge | KrakenFX CLI v0.3.2 | Paper and live order execution for the governed action workload |
| Agent interface | MCP over HTTP/JSON-RPC | Tools, resources, and prompts for external agents |

---

## Gemini Commerce Studio

`/commerce` is the Google technology partner proof surface — a live page demonstrating Gemini Function Calling and multimodal commerce over real Arc settlement.

### What it demonstrates

**Gemini Function Calling** — a commerce assistant backed by proper `functionDeclarations` over live Kairos tools:
- Check Circle Wallet balance in real time
- Verify Arc receipt status by tx hash
- Trigger a Track 4 micro-commerce settlement step

**Multimodal receipt analysis** — upload an invoice or receipt image:
- Gemini extracts structured fields (amount, vendor, date, line items)
- Kairos reviews the extraction and gates settlement
- Approved analysis triggers a bounded Arc proof receipt below $0.01 USDC

**Arc proof settlement** — every Commerce Studio action that clears the review gate produces a real on-chain USDC receipt, verifiable at `testnet.arcscan.app`.

### Model routing

| Surface | Model | Fallback |
|---|---|---|
| Function Calling assistant | Gemini 3 Flash | OpenAI GPT-4o-mini |
| Multimodal analysis | Gemini 3 Pro | OpenAI GPT-4o-mini |

Fallback activates automatically if Gemini quota is exceeded — the surface stays live and functional.

### API

| Route | Purpose |
|---|---|
| `/api/commerce/status` | Commerce Studio health and model readiness |
| `/api/gemini/commerce-assistant` | Function Calling endpoint — natural language over commerce tools |
| `/api/commerce/analyze` | Multimodal analysis — image upload → structured extraction → settlement gate |

---

## Quick Start

Install dependencies:

```bash
npm install
cp .env.example .env
```

<details>
<summary>Environment variables — click to expand</summary>

Fill Circle and Arc values first:

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

x402 paid data:

```bash
OWS_MNEMONIC=
X402_MNEMONIC=
AISA_BASE_URL=https://api.aisa.one/apis/v2
GATEWAY_CONTRACT=0x0077777d7eba4688bdef3e311b846f25870a19b9
```

Gemini-first reasoning with OpenAI fallback:

```bash
GEMINI_API_KEY_PRIMARY=
GEMINI_API_KEY_SECONDARY=
GEMINI_RUNTIME_MODELS=gemini-3-flash-preview
GEMINI_REFLECTION_MODELS=gemini-3-pro-preview,gemini-3-flash-preview
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

Kraken bridge:

```bash
KRAKEN_API_KEY=
KRAKEN_API_SECRET=
KRAKEN_PAPER_TRADING=true
KRAKEN_CLI_PATH=kraken
KRAKEN_CLI_TIMEOUT_MS=30000
```

Track 4 proof settlement — emits Arc-settled micro-commerce receipts on a fixed interval even when the market loop is neutral:

```bash
TRACK4_SETTLEMENT_AMOUNT_USDC=0.009
TRACK4_PROOF_COMMERCE_ENABLED=true
TRACK4_PROOF_COMMERCE_INTERVAL_CYCLES=5
```

Bootstrap Circle Wallet:

```bash
npm run circle:bootstrap
```

</details>

Build, test, and run:

```bash
npm run build
npm test
npm run test:mcp
npm run start:arc
```

Dashboard: `http://localhost:3000` · MCP: `http://localhost:3001/mcp`

---

## Production

Managed by PM2 via `ecosystem.config.cjs`:

```bash
npm run pm2:start    # start
npm run pm2:logs     # tail logs
npm run pm2:stop     # stop
```

| Setting | Value |
|---|--- |
| PM2 app name | `kairos-agent` |
| Entrypoint | `npx tsx src/agent/index.ts` |
| VPS path | `/opt/kairos` |
| Dashboard port | `3000` |
| MCP port | `3001` |
| Domain | `https://kairos.nov-tia.com` |
| Host | Vultr VPS |
| Execution bridge | KrakenFX CLI v0.3.2 · installed at `/usr/local/bin/kraken` · validated via `/api/kraken/preflight` |

> Runtime state persists in `.kairos/`. Do not delete or overwrite this directory during deploys unless intentionally resetting demo state.

---

## Commands

| Command | Purpose |
|---|--- |
| `npm run build` | Type-check and compile the TypeScript project |
| `npm test` | Run the full test suite |
| `npm run test:mcp` | Validate the MCP surface |
| `npm run start:arc` | Start the full agent + dashboard + MCP runtime |
| `npm run dashboard` | Start only the dashboard server |
| `npm run mcp` | Start only the MCP server |
| `npm run circle:bootstrap` | Generate and register Circle wallet configuration |
| `npm run demo:nanopayments` | Exercise Nanopayment behaviour |
| `npm run demo:onchain` | Exercise the on-chain demo path |
| `npm run generate:registration` | Generate agent registration metadata |

---

## API

| Route | Purpose |
|---|--- |
| `/api/status` | Runtime status, track state, MCP summary, provider readiness |
| `/api/billing` | Billing totals, real Arc txn count, track spend, receipt summaries |
| `/api/transactions` | Consolidated transaction ledger for the History page |
| `/api/checkpoints` | Governance checkpoints and execution outcomes |
| `/api/health` | Health summary for monitoring |
| `/api/feeds/status` | Data feed and x402 integration status |
| `/api/sage/status` | SAGE reflection state and weight history |
| `/api/operator/state` | Operator controls and pause/emergency state |
| `/api/gateway-balance` | Circle Gateway deposit balance |
| `/api/executions` | Execution history — governed actions, outcomes, PnL, artifact links |
| `/api/executions/stats` | Execution statistics — totals, best/worst outcome, closed count |
| `/api/kraken/cli` | Kraken CLI health — installed, healthy, ready status |
| `/api/kraken/snapshot` | Kraken balance, open orders, trades, ticker, and CLI status |
| `/api/kraken/preflight` | Kraken bridge preflight validation |
| `/api/commerce/status` | Gemini Commerce Studio health and model readiness |
| `/api/gemini/commerce-assistant` | Gemini Function Calling — natural language over live commerce tools |
| `/api/commerce/analyze` | Multimodal analysis — image → structured extraction → settlement gate |

See [System Flows](docs/SYSTEM_FLOWS.md) for how these endpoints map to the runtime loop.

---

## Security

- Never commit `.env`, `.env.arc`, `.kairos/`, `.circle-recovery-file/`, `artifacts/`, or private keys.
- Circle API keys, entity secrets, wallet recovery files, Gemini keys, OpenAI keys, Kraken keys, and mnemonics stay outside Git.
- The dashboard exposes only proof summaries and public metadata — no private keys, no internal agent state.
- Operator actions are modelled as restricted/operator MCP tools and HTTP control endpoints.
- Billing failures never block governance decisions. Failed payments produce pending receipts and the runtime continues safely.

---

## Verification Checklist

Use before demos or submission reviews:

1. `npm run build` passes
2. `npm test` passes
3. `npm run test:mcp` passes
4. `https://kairos.nov-tia.com` returns 200
5. `/transactions`, `/execution`, `/documents`, `/commerce`, `/mcp`, `/.well-known/agent-card.json` all return 200
6. `/api/billing` shows `realTxns >= 50`
7. Track 2 reports `x402` mode or explains fallback clearly
8. Track 3 shows Gemini readiness — model field shows `gemini-3-flash-preview` not OpenAI
9. Track 4 shows `ARC SETTLED`
10. Transaction History contains Arcscan-verifiable hashes for confirmed receipts
11. `/api/kraken/cli` and `/api/kraken/preflight` report healthy
12. PM2 shows `kairos-agent` online

---

## Documentation

| Document | What it covers |
|---|--- |
| [Architecture](docs/ARCHITECTURE.md) | Components, boundaries, trust model, data ownership, deployment shape |
| [System Flows](docs/SYSTEM_FLOWS.md) | End-to-end decision loop, billing, x402, compute, micro-commerce, MCP, and dashboard flows |
| [Repository Structure](docs/REPO_STRUCTURE.md) | Full project layout and responsibility of each directory and file group |

---

---

## Project Positioning

Kairos is best understood as a programmable economic operating layer for an autonomous runtime:

- It pays for data like an API consumer
- It pays for compute like metered infrastructure
- It pays for governance like an accountable agent
- It settles approved actions like a micro-commerce system
- It exposes all of that through a live proof surface that a judge, operator, or other agent can verify

That is the core claim.

---

<p align="center">
  <em>"The governed moment every trade earns its execution."</em>
</p>
