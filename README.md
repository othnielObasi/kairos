# KAIROS

**The governed moment every trade earns its execution.**

Kairos is a production-grade autonomous trading agent that pays for its own governance. Every decision — every data pull, every governance stage evaluation, every reasoning call — is a real USDC transaction on Arc, paid by the agent, verified on-chain, before any trade executes.

Built for the **Agentic Economy on Arc** hackathon · Circle + LabLab.ai · April 20–26 2026

---

## What Makes Kairos Different

Most agents demo payments. Kairos uses payment as the governance mechanism.

Before any trade executes, Kairos must pass five governed stages — mandate enforcement, oracle integrity, execution simulation, supervisory decision, and risk routing. Each stage fires a **Circle Nanopayment** ($0.001 USDC). The agent cannot proceed without paying. The cost of governance is the proof of governance.

This is not a prototype. Kairos is a production-grade governed trading agent with 890+ executed cycles, Elite trust tier, and rank 4/48 on the ERC-8004 reputation registry. The governance system is battle-tested — the Arc migration adds the Circle payment layer on top.

---

## Four Tracks — One Cycle

Every trading cycle simultaneously touches all four hackathon tracks:

| Track | What fires | Circle product | Per-call cost |
|---|---|---|---|
| **01 Agent-to-Agent Loop** | 5 governance stage evaluations | Circle Nanopayments | $0.001 each |
| **02 Per-API Monetisation** | 5 AIsa x402 data pulls | Circle Gateway + x402 | $0.002–$0.048 each |
| **03 Usage-Based Compute** | LLM reasoning + SAGE reflection | Circle Nanopayments | $0.001 each |
| **04 Real-Time Micro-Commerce** | Trade settlement in USDC | Circle Wallets + Arc | Variable |

**13 payment events per cycle · 130+ Arc transactions per 10 cycles · 50+ requirement cleared in under 4 cycles**

---

## Circle Platform Stack

| Product | Role in Kairos |
|---|---|
| **Arc** | All settlement — every Nanopayment batch, x402 data payment, and trade settles on Arc L1 |
| **USDC** | Unit of account — all governance billing, data payments, compute billing, and trade settlement |
| **Circle Nanopayments** | Governance + compute billing — $0.001 per stage, instant EIP-3009 confirmation, Arc batch settlement |
| **Circle Wallets** | Agent identity (Wallet A) — MPC-based programmatic signing, replaces raw EOA |
| **Circle Gateway** | x402 data payments (Wallet B) — batches AIsa API calls, settles on Arc |

---

## Arc Testnet Values

| Item | Value |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| USDC Token | `0x3600000000000000000000000000000000000000` |
| Gateway Contract | `0x0077777d7eba4688bdef3e311b846f25870a19b9` |
| USDC Decimals | 6 (ERC-20) · 18 (native gas) — never mix |
| Faucet | `https://faucet.circle.com` — select Arc Testnet |

---

## Data Sources — AIsa x402 Endpoints

All five data feeds replaced with AIsa's native x402 API catalog (`https://api.aisa.one/apis/v2/`). Real x402 payments, real Arc settlement, real tx hashes — no fallback.

| Original source (replaced) | AIsa endpoint | Price |
|---|---|---|
| CoinGecko price feed | `/financial/prices/snapshot` | $0.024 |
| Kraken market data | `/financial/prices/snapshot` | $0.024 |
| Fear & Greed Index | `/twitter/tweet/advanced_search` | $0.0022 |
| Alpha Vantage news | `/financial/news` | $0.048 |
| PRISM signals | `/perplexity/sonar` | $0.012 |

---

## Project Structure

```
kairos/
├── src/
│   ├── agent/
│   │   ├── index.ts                    # Main agent loop (unchanged)
│   │   └── supervisory-meta-agent.ts   # + Nanopayment hook (stage 3)
│   ├── chain/
│   │   ├── sdk.ts                      # Circle Wallets signer (replaces EOA)
│   │   ├── agent-mandate.ts            # + Nanopayment hook (stage 0)
│   │   ├── execution-simulator.ts      # + Nanopayment hook (stage 2)
│   │   ├── executor.ts                 # Trade settlement via Circle Wallets
│   │   └── risk-router.ts              # + Nanopayment hook (stage 4)
│   ├── data/
│   │   ├── live-price-feed.ts          # → AIsa /financial/prices/snapshot
│   │   ├── kraken-feed.ts              # → AIsa /financial/prices/snapshot
│   │   ├── sentiment-feed.ts           # → AIsa /twitter + /financial/news
│   │   └── prism-feed.ts              # → AIsa /perplexity/sonar
│   ├── security/
│   │   └── oracle-integrity.ts         # + Nanopayment hook (stage 1)
│   ├── services/
│   │   ├── circle-wallet.ts            # NEW — Circle Wallets (Wallet A)
│   │   ├── nanopayments.ts             # NEW — billEvent() service
│   │   ├── billing-store.ts            # NEW — 3-bucket session store
│   │   ├── x402-client.mjs             # NEW — AIsa x402 payment client
│   │   └── setup-gateway.mjs           # NEW — one-time Gateway deposit
│   ├── strategy/
│   │   ├── ai-reasoning.ts             # + Nanopayment per LLM call
│   │   └── sage-engine.ts              # + Nanopayment per SAGE reflection
│   ├── trust/
│   │   └── artifact-emitter.ts         # + kairosArcBilling field in IPFS artifacts
│   └── dashboard/
│       ├── server.ts                   # + /api/billing + /api/gateway-balance + /kairos
│       └── public/
│           ├── index.html              # Existing dashboard (unchanged)
│           └── kairos.html             # NEW — Arc hackathon judge view
├── contracts/
│   └── KairosRiskPolicy.sol            # Deployed on Arc testnet
├── .env.arc                            # Arc + Circle platform config
└── README.md
```

---

## Quick Start

### Prerequisites

```bash
node >= 18
npm >= 9
Circle Developer Account — developer.circle.com
```

### 1. Clone and install

```bash
git clone https://github.com/othnielObasi/kairos.git
cd kairos
npm install
npm install @circle-fin/developer-controlled-wallets @x402/fetch @x402/evm viem
```

### 2. Configure environment

Copy `.env` to `.env.arc` and update:

```bash
# Identity
AGENT_NAME=Kairos
AGENT_ID=kairos-1

# Arc (confirmed testnet values)
CHAIN_ID=5042002
RPC_URL=https://rpc.testnet.arc.network
ARC_EXPLORER=https://testnet.arcscan.app
ARC_USDC_TOKEN=0x3600000000000000000000000000000000000000
CIRCLE_GATEWAY=0x0077777d7eba4688bdef3e311b846f25870a19b9

# Circle Wallets — Wallet A (governance + trade settlement)
CIRCLE_API_KEY=<from Circle Developer Console>
CIRCLE_ENTITY_SECRET=<from Circle Developer Console>
CIRCLE_WALLET_SET_ID=<created in Console>
AGENT_WALLET_ADDRESS=<from step 4>
AGENT_WALLET_ID=<from step 4>
GOVERNANCE_BILLING_ADDRESS=<NOVTIA billing wallet on Arc>
NANOPAYMENT_AMOUNT_USDC=0.001

# x402 Wallet — Wallet B (data API payments via Circle Gateway)
OWS_MNEMONIC=<fresh 12-word BIP-39 mnemonic>
OWS_RPC_URL=https://rpc.testnet.arc.network
OWS_CHAIN_ID=5042002
OWS_WALLET_ADDRESS=<derived from OWS_MNEMONIC>

# AIsa API (x402-paid — no API key needed)
AISA_BASE_URL=https://api.aisa.one/apis/v2

# Contract
RISK_ROUTER_ADDRESS=<deploy KairosRiskPolicy.sol on Arc>
```

### 3. Deploy KairosRiskPolicy.sol on Arc

```bash
# Add Arc to hardhat.config.ts
arc_testnet: {
  url:     'https://rpc.testnet.arc.network',
  chainId: 5042002,
  accounts: [process.env.PRIVATE_KEY],
}

npx hardhat run scripts/deploy-risk-policy.ts --network arc_testnet
# → Add output address to .env.arc as RISK_ROUTER_ADDRESS
```

### 4. Create Kairos agent wallet (Wallet A — Circle Wallets)

```bash
npx tsx -e "
  import { createAgentWallet } from './src/services/circle-wallet';
  createAgentWallet().then(w => {
    console.log('AGENT_WALLET_ADDRESS=' + w.address);
    console.log('AGENT_WALLET_ID='      + w.id);
  });
"
# → Add both values to .env.arc
# → Fund from https://faucet.circle.com (select Arc Testnet)
```

### 5. Fund x402 wallet and deposit into Circle Gateway (Wallet B)

```bash
# Generate a fresh mnemonic
node --input-type=module -e "
  import { generateMnemonic, english, mnemonicToAccount } from 'viem/accounts';
  const m = generateMnemonic(english);
  const a = mnemonicToAccount(m);
  console.log('OWS_MNEMONIC=' + m);
  console.log('OWS_WALLET_ADDRESS=' + a.address);
"
# → Add both values to .env.arc
# → Fund from https://faucet.circle.com (select Arc Testnet, 20 USDC)

# Approve + deposit into Circle Gateway (run ONCE)
node src/services/setup-gateway.mjs
```

### 6. Run Kairos

```bash
npm run start:arc
# or
NODE_ENV=arc npx tsx src/agent/index.ts
```

### 7. Open the judge dashboard

```
http://localhost:3000/kairos
```

---

## Why This Model Requires Arc

On Ethereum mainnet, each $0.001 governance payment costs $2–20 in ETH gas. The entire economic model is structurally impossible on gas chains. Arc's USDC-native settlement with deterministic sub-second finality is the prerequisite — not an optimisation.

| Chain | Gas per governance event | Model viable? |
|---|---|---|
| Ethereum mainnet | $2–20 | No — gas exceeds action value by 2000× |
| Base / Optimism | $0.01–0.10 | Marginal — still exceeds $0.001 action value |
| Arc | $0 | Yes — USDC native, gas-free sub-cent payments |

---

## Architecture

```
                        KAIROS TRADING CYCLE
                        ─────────────────────

  ┌─ DATA (Track 02) ──────────────────────────────────┐
  │  AIsa /financial/prices/snapshot  ($0.024 · x402)  │
  │  AIsa /financial/prices/snapshot  ($0.024 · x402)  │
  │  AIsa /twitter/advanced_search    ($0.002 · x402)  │
  │  AIsa /financial/news             ($0.048 · x402)  │
  │  AIsa /perplexity/sonar           ($0.012 · x402)  │
  │               ↓ Circle Gateway (Arc settlement)    │
  └────────────────────────────────────────────────────┘
                         ↓
  ┌─ GOVERNANCE (Track 01) ────────────────────────────┐
  │  Mandate enforcement    ($0.001 · Nanopayments)    │
  │  Oracle integrity       ($0.001 · Nanopayments)    │
  │  Execution simulation   ($0.001 · Nanopayments)    │
  │  Supervisory decision   ($0.001 · Nanopayments)    │
  │  Risk Router            ($0.001 · Nanopayments)    │
  │               ↓ ALLOW / BLOCK                      │
  └────────────────────────────────────────────────────┘
                         ↓ if ALLOW
  ┌─ REASONING (Track 03) ─────────────────────────────┐
  │  LLM inference          ($0.001 · Nanopayments)    │
  │  SAGE reflection        ($0.001 · Nanopayments)    │
  └────────────────────────────────────────────────────┘
                         ↓
  ┌─ SETTLEMENT (Track 04) ────────────────────────────┐
  │  Trade settlement in USDC on Arc                   │
  │  Circle Wallets signing · sub-second finality      │
  └────────────────────────────────────────────────────┘
```

---

## Demo

Live judge dashboard: `http://kairos.nov-tia.com:3000/kairos`

The dashboard shows all four tracks firing in real time — governance stage payments, AIsa data pull payments, LLM compute payments, and trade settlements — with clickable Arc block explorer links on every transaction hash.

**Demo video:** [Circle Developer Console transaction + Arc block explorer verification + /kairos live dashboard]

---

## Unchanged from the Base Codebase

The following governance and trading logic is carried forward unchanged:

- All 24 test suites
- Full governance pipeline logic
- SAGE / ACE adaptive learning
- 3-tier LLM failover (Claude → Gemini → OpenAI)
- Kraken CLI bridge (trade execution)
- MCP server (12 tools, 8 resources, 4 prompts)
- Trust scorecard and capital ladder
- IPFS artifact emitter with TEE attestation
- SURGE v2 cryptographic receipt chain
- Circuit breaker and operator controls
- EU AI Act / NIST / ISO 42001 compliance mapping

---

*Kairos · Agentic Economy on Arc · 2026*
