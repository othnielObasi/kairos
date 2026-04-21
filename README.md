<p align="center">
  <h1 align="center">Kairos</h1>
  <p align="center"><strong>The governed moment every trade earns its execution.</strong></p>
  <p align="center">
    <a href="#overview">Overview</a> &bull;
    <a href="#architecture">Architecture</a> &bull;
    <a href="#features">Features</a> &bull;
    <a href="#circle-platform-integration">Circle Stack</a> &bull;
    <a href="#api-reference">API</a> &bull;
    <a href="#testing">Testing</a> &bull;
    <a href="#deployment">Deployment</a>
  </p>
  <p align="center">
    Built for the <strong>Agentic Economy on Arc</strong> hackathon · Circle + LabLab.ai · April 20–26, 2026
  </p>
</p>

---

## Overview

Kairos is a **production-grade autonomous trading agent that pays for its own governance**. Every decision — every data pull, every governance stage evaluation, every reasoning call — is a real USDC transaction on Arc, paid by the agent, verified on-chain, before any trade executes.

Most agents demo payments. Kairos uses payment as the governance mechanism.

Before any trade executes, Kairos must pass five governed stages — mandate enforcement, oracle integrity, execution simulation, supervisory decision, and risk routing. Each stage fires a **Circle Nanopayment** ($0.001 USDC). The agent cannot proceed without paying. The cost of governance is the proof of governance.

Kairos is built on top of a battle-tested governed trading agent with 890+ executed cycles and a mature governance stack. The Arc migration adds Circle payment rails without carrying forward the old external validation sandbox.

### Key Differentiators

| Capability | Description |
|---|---|
| **Payment-as-governance** | Every governance stage costs $0.001 USDC via Circle Nanopayments — the agent literally cannot trade without paying for oversight |
| **Four-track monetisation** | A single trading cycle fires 13+ paid events across governance, data, compute, and settlement — all on Arc |
| **Governance-first execution** | Every trade passes through mandate enforcement, oracle integrity checks, execution simulation, and supervisory approval before execution |
| **Neuro-symbolic safety layer** | Combines statistical signal generation with explicit symbolic controls (consecutive loss protection, drawdown recovery, volatility spike caution) |
| **Trust Policy Scorecard** | Four-dimensional trust scoring: Policy Compliance, Risk Discipline, Validation Completeness, Outcome Quality |
| **Capital Trust Ladder** | Dynamic capital allocation based on earned trust tier (probation → limited → standard → elevated → elite) |
| **On-chain risk enforcement** | Solidity smart contract (`KairosRiskPolicy.sol`) enforces risk limits trustlessly at the contract level |
| **EIP-1271 signature verification** | Smart-contract wallet signature support — every signed TradeIntent is verified via EIP-1271 before Risk Router submission |
| **TEE attestation** | Software-based Trusted Execution Environment attestation — every artifact includes a signed attestation binding agent identity to runtime environment |
| **Full audit trail** | Every decision produces an IPFS-pinned JSON artifact with AI reasoning, market snapshots, confidence intervals, governance evidence, billing receipts, and TEE attestation |
| **PRISM Intelligence** | Real-time technical signal integration — RSI, MACD, Bollinger Bands, directional bias. Confirmation-only confidence modifier (+0–15%) |
| **AI Reasoning (3-tier LLM)** | Every trade decision includes a natural-language AI explanation generated via Claude → Gemini → OpenAI failover chain |
| **SAGE — Self-Adapting Generative Engine** | LLM-powered self-improving layer: Gemini 2.5 Pro reflects on trade outcomes, auto-tunes 7 signal weights within CAGE bounds, builds conditional playbook rules |
| **x402 data monetisation** | All market data sourced via AIsa x402-paid API endpoints — real payments settled on Arc via Circle Gateway |
| **MCP protocol server** | Exposes 12 tools, 8 resources, and 4 prompts via the Model Context Protocol with visibility-tiered access control |

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

## Circle Platform Integration

| Product | Role in Kairos |
|---|---|
| **Arc** | All settlement — every Nanopayment batch, x402 data payment, and trade settles on Arc L1 |
| **USDC** | Unit of account — all governance billing, data payments, compute billing, and trade settlement |
| **Circle Nanopayments** | Governance + compute billing — $0.001 per stage, instant EIP-3009 confirmation, Arc batch settlement |
| **Circle Wallets** | Agent identity (Wallet A) — MPC-based programmatic signing, replaces raw EOA |
| **Circle Gateway** | x402 data payments (Wallet B) — batches AIsa API calls, settles on Arc |

### Why This Model Requires Arc

On Ethereum mainnet, each $0.001 governance payment costs $2–20 in ETH gas. The entire economic model is structurally impossible on gas chains. Arc's USDC-native settlement with deterministic sub-second finality is the prerequisite — not an optimisation.

| Chain | Gas per governance event | Model viable? |
|---|---|---|
| Ethereum mainnet | $2–20 | No — gas exceeds action value by 2000× |
| Base / Optimism | $0.01–$0.10 | Marginal — still exceeds $0.001 action value |
| Arc | $0 | Yes — USDC native, gas-free sub-cent payments |

### Arc Testnet Values

| Item | Value |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| USDC Token | `0x3600000000000000000000000000000000000000` |
| Gateway Contract | `0x0077777d7eba4688bdef3e311b846f25870a19b9` |
| USDC Decimals | 6 (ERC-20) · 18 (native gas) — never mix |
| Faucet | `https://faucet.circle.com` — select Arc Testnet |

### Data Sources — AIsa x402 Endpoints

All five data feeds use AIsa's native x402 API catalog (`https://api.aisa.one/apis/v2/`). Real x402 payments, real Arc settlement, real tx hashes.

| Original source (replaced) | AIsa endpoint | Price |
|---|---|---|
| CoinGecko price feed | `/financial/prices/snapshot` | $0.024 |
| Kraken market data | `/financial/prices/snapshot` | $0.024 |
| Fear & Greed Index | `/twitter/tweet/advanced_search` | $0.0022 |
| Alpha Vantage news | `/financial/news` | $0.048 |
| PRISM signals | `/perplexity/sonar` | $0.012 |

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

## Features

### 1. Governance-First Trading Runtime

Every trade must pass through a multi-stage validation pipeline before execution:

| Stage | Module | Purpose |
|---|---|---|
| Signal Generation | `strategy/momentum.ts` | SMA crossover with volatility-adjusted sizing |
| Symbolic Reasoning | `strategy/neuro-symbolic.ts` | Rule-based overrides (loss streaks, drawdown, balance) |
| Regime Governance | `strategy/regime-governance.ts` | Deterministic profile switching with Bayesian confidence bias |
| Mandate Enforcement | `chain/agent-mandate.ts` | Asset/protocol whitelisting, capital limits, human approval thresholds |
| Oracle Integrity | `security/oracle-integrity.ts` | Median deviation, stale feed, single-bar anomaly detection |
| Execution Simulation | `chain/execution-simulator.ts` | Slippage, gas, net edge, and worst-case analysis |
| Supervisory Approval | `agent/supervisory-meta-agent.ts` | Trust-aware capital allocation and position throttling |
| Risk Engine | `risk/engine.ts` | 6 risk checks: circuit breaker, signal quality, position size, exposure, volatility, conflict |

### 2. Adaptive Learning with Immutable Boundaries

The agent self-improves within an **immutable cage** — it can adjust parameters but cannot:
- Change its own boundaries
- Disable risk checks
- Expand parameter ranges beyond pre-set limits
- Override symbolic rules

Adjustable parameters (within cage):

| Parameter | Range | Default |
|---|---|---|
| Stop-loss ATR multiple | 1.0 – 2.5 | 1.5 |
| Base position size | 1% – 4% | 2% |
| Confidence threshold | 5% – 30% | 10% |

Every adaptation is recorded as an artifact with reasoning and before/after values.

### 3. SAGE — Self-Adapting Generative Engine

SAGE is an LLM-powered self-improving layer that sits above adaptive learning, using **Gemini 2.5 Pro** to reflect on trade outcomes and auto-tune the strategy.

**What SAGE produces:**
- **Weight optimization** — Auto-tunes 7 scorecard signal weights within immutable CAGE bounds (max 30% change per cycle)
- **Playbook rules** — Conditional filters (BLOCK / REDUCE / BOOST confidence) based on pattern analysis, with expiry after 30 trades
- **Context injection** — Accumulated trading wisdom prefixed to every AI reasoning prompt
- **Reflection artifacts** — Every reflection cycle is persisted as an auditable JSONL record

**Signal weights managed by SAGE:**

| Weight | Default | CAGE Range |
|---|---|---|
| trend | 0.60 | 0.0 – 2.0 |
| ret5 | 1.80 | 0.0 – 4.0 |
| ret20 | 1.10 | 0.0 – 3.0 |
| crossover | 0.15 | 0.0 – 0.5 |
| rsi | 0.60 | 0.0 – 2.0 |
| zscore | 0.50 | 0.0 – 2.0 |
| sentiment | 0.12 | 0.0 – 0.5 |

**Overfitting protections (3 layers):**
1. **Regime diversity** — Requires outcomes from 2+ market regimes before allowing weight changes
2. **Holdout validation** — 80/20 split; LLM only sees training set; changes rejected if they'd hurt holdout set
3. **Auto-revert** — If win rate drops >15pp post-reflection, weights revert to pre-reflection snapshot

### 4. Regime Governance

Deterministic volatility-regime profile switching with hysteresis:

| Profile | Stop-Loss ATR | Take-Profit ATR | Position Size | Confidence Threshold |
|---|---|---|---|---|
| LOW_VOL | 0.50 | 0.80 | 4.0% | 3% |
| NORMAL | 0.50 | 1.00 | 4.0% | 2% |
| HIGH_VOL | 0.60 | 1.20 | 3.0% | 3% |
| EXTREME_DEFENSIVE | 0.75 | 1.00 | 2.0% | 5% |

Key behaviors:
- **Hysteresis-based transitions** — separate enter/exit thresholds prevent oscillation
- **Defensive-only fast switching** — can always escalate to a more defensive profile, but must hold for `minHoldCycles` (12) before relaxing
- **Drawdown lock** — locks into `EXTREME_DEFENSIVE` when drawdown exceeds 6%
- Every profile switch emits an auditable `ProfileSwitchArtifact`

### 5. Trust Policy Scorecard

Every action is scored across four weighted dimensions:

| Dimension | Weight | Description |
|---|---|---|
| Policy Compliance | 30% | Were all governed checks passed? |
| Risk Discipline | 30% | Was the action appropriate for market and risk state? |
| Validation Completeness | 20% | Were reasoning traces, artifacts, and evidence present? |
| Outcome Quality | 20% | Did execution stay within acceptable quality bounds? |

### 6. Capital Trust Ladder

Trust score determines the agent's capital rights:

| Trust Tier | Score Range | Capital Multiplier | Capital Limit |
|---|---:|---:|---:|
| Probation | 0 – 71 | 0.40x | 3% |
| Limited | 72 – 81 | 0.70x | 6% |
| Standard | 82 – 89 | 0.90x | 8% |
| Elevated | 90 – 94 | 1.00x | 10% |
| Elite | 95+ | 1.00x | 12% |

When trust falls below a threshold, the agent enters **Trust Recovery Mode** with regime-aware streak requirements, graduated deduction, and regime-specific tier caps.

### 7. On-Chain Risk Enforcement

The `KairosRiskPolicy.sol` smart contract enforces risk limits trustlessly:

- Max position size (% of capital)
- Max total exposure
- Max open positions
- Daily loss circuit breaker
- Max drawdown circuit breaker
- Trade cooldown (anti-churn)
- Asset whitelisting

### 8. Circuit Breaker

Production-grade state machine: **ARMED → TRIPPED → COOLING → ARMED**

- Triggers on daily loss limit breach or max drawdown breach
- Configurable cooldown period before trading resumes
- Conditions must improve before re-arming
- Daily reset at midnight

### 9. Human Oversight Controls

| Action | Effect |
|---|---|
| **Pause Trading** | Temporarily halts all trade execution |
| **Resume Trading** | Re-enables trading after pause |
| **Emergency Stop** | Immediately halts all activity (requires manual restart) |

Each operator action creates an auditable receipt with timestamp, reason, actor, and resulting runtime mode.

---

## Project Structure

```
kairos/
├── src/
│   ├── agent/
│   │   ├── index.ts                    # Main agent loop
│   │   ├── config.ts                   # Configuration loader
│   │   ├── state.ts                    # Runtime state management
│   │   ├── operator-control.ts         # Human oversight controls
│   │   ├── trade-log.ts               # Trade history persistence
│   │   └── supervisory-meta-agent.ts   # + Nanopayment hook (stage 3)
│   ├── chain/
│   │   ├── sdk.ts                      # Circle Wallets signer (replaces EOA)
│   │   ├── agent-mandate.ts            # + Nanopayment hook (stage 0)
│   │   ├── execution-simulator.ts      # + Nanopayment hook (stage 2)
│   │   ├── executor.ts                 # Trade settlement via Circle Wallets
│   │   ├── identity.ts                # Agent identity management
│   │   ├── risk-policy-client.ts      # On-chain risk policy interface
│   │   └── risk-router.ts             # + Nanopayment hook (stage 4)
│   ├── data/
│   │   ├── live-price-feed.ts          # → AIsa /financial/prices/snapshot
│   │   ├── kraken-feed.ts             # → AIsa /financial/prices/snapshot
│   │   ├── sentiment-feed.ts          # → AIsa /twitter + /financial/news
│   │   └── prism-feed.ts             # → AIsa /perplexity/sonar
│   ├── risk/
│   │   ├── engine.ts                  # Risk engine (6 checks, trailing stops, ATR TP)
│   │   ├── circuit-breaker.ts         # State machine: ARMED → TRIPPED → COOLING
│   │   └── volatility.ts             # EWMA volatility with regime detection
│   ├── security/
│   │   ├── oracle-integrity.ts        # + Nanopayment hook (stage 1)
│   │   └── tee-attestation.ts        # Software-based TEE attestation
│   ├── services/
│   │   ├── circle-wallet.ts           # Circle Wallets (Wallet A — MPC signing)
│   │   ├── nanopayments.ts            # billEvent() service
│   │   ├── billing-store.ts           # 3-bucket session store (t1/t2/t3)
│   │   ├── normalisation.ts           # AIsa response normaliser + Track 2 billing
│   │   ├── x402-client.mjs            # AIsa x402 payment client
│   │   └── setup-gateway.mjs          # One-time Gateway approve + deposit
│   ├── strategy/
│   │   ├── ai-reasoning.ts            # + Nanopayment per LLM call
│   │   ├── sage-engine.ts             # + Nanopayment per SAGE reflection
│   │   ├── momentum.ts               # Core volatility-adjusted momentum strategy
│   │   ├── neuro-symbolic.ts          # Symbolic rule engine over signals
│   │   ├── regime-governance.ts       # Deterministic regime profile switching
│   │   ├── signals.ts                 # Signal generation & classification
│   │   ├── indicators.ts             # SMA, EMA, EWMA, RSI, ATR
│   │   └── adaptive-learning.ts      # Bounded self-improvement
│   ├── trust/
│   │   ├── artifact-emitter.ts        # + kairosArcBilling field in IPFS artifacts
│   │   ├── checkpoint.ts             # Strategy checkpoints & replay
│   │   ├── ipfs.ts                    # IPFS upload via Pinata + local backup
│   │   ├── reputation-evolution.ts   # Trust tier evolution
│   │   └── trust-policy-scorecard.ts # Four-dimensional trust scoring
│   ├── mcp/
│   │   ├── server.ts                  # MCP JSON-RPC server
│   │   ├── tools.ts                   # 12 MCP tools
│   │   ├── resources.ts              # 8 MCP resources
│   │   └── prompts.ts                # 4 MCP prompts
│   ├── analytics/                    # Performance metrics (Sharpe, Sortino, etc.)
│   └── dashboard/
│       ├── server.ts                  # + /api/billing + /api/gateway-balance + /kairos
│       └── public/
│           ├── index.html             # Operational dashboard
│           └── kairos.html            # Arc economic proof view
├── contracts/
│   └── KairosRiskPolicy.sol           # Deployed on Arc testnet
├── test/                              # Core test suite + optional integrations
└── README.md
```

---

## API Reference

### Dashboard REST API (port 3000)

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | GET | Agent overview (capital, market, risk state) |
| `/api/checkpoints` | GET | Recent decision checkpoints |
| `/api/artifact/latest` | GET | Full validation artifact JSON |
| `/api/artifacts` | GET | Browse all decision artifacts with IPFS CIDs |
| `/api/positions` | GET | Open positions |
| `/api/governance` | GET | Strategy & risk policy configuration |
| `/api/reputation/history` | GET | Trust score evolution timeline |
| `/api/health` | GET | Health check (200 = healthy, 503 = stopped) |
| `/api/logs` | GET | Recent structured logs |
| `/api/errors` | GET | Error logs |
| `/api/billing` | GET | Kairos billing summary (governance / data / compute) |
| `/api/gateway-balance` | GET | Circle Gateway balance on Arc |
| `/api/operator/state` | GET | Current operator control state |
| `/api/operator/actions` | GET | Operator action receipt history |
| `/api/operator/pause` | POST | Pause trading |
| `/api/operator/resume` | POST | Resume trading |
| `/api/operator/emergency-stop` | POST | Emergency stop |
| `/api/prism` | GET | PRISM signal & risk data |
| `/api/performance` | GET | Risk-adjusted metrics (Sharpe, Sortino, max drawdown, Calmar, profit factor) |
| `/api/sage/status` | GET | SAGE engine status: weights, CAGE bounds, reflections |
| `/api/sage/playbook` | GET | Active playbook rules and current weights |
| `/kairos` | GET | Hackathon judge dashboard |

### MCP Server (port 3001)

Exposes tools, resources, and prompts via the [Model Context Protocol](https://modelcontextprotocol.io) with **visibility-tiered access control**:

**Tools (Public):**

| Tool | Description |
|---|---|
| `get_market_state` | Current market and regime state from the runtime |
| `explain_trade` | Human-readable explanation of the most recent trade decision |
| `get_trust_state` | Trust score, history, and capital-rights state |
| `get_capital_rights` | Capital multiplier and tier based on current trust score |
| `get_performance_metrics` | Risk-adjusted metrics (Sharpe, Sortino, drawdown, Calmar, profit factor) |
| `get_validation_summary` | Recent checkpoint summaries with approval status |
| `get_adaptive_params` | Current adaptive learning parameters and context stats |

**Tools (Restricted):**

| Tool | Description |
|---|---|
| `propose_trade` | Generate a governed trade proposal |
| `execute_trade` | Execute a signed trade intent |

**Tools (Operator):**

| Tool | Description |
|---|---|
| `pause_agent` | Pause trading with reason and actor |
| `resume_agent` | Resume trading after pause |
| `emergency_stop` | Immediately halt all activity |

**Resources:**

| URI | Description |
|---|---|
| `kairos://state/trust` | Trust score, timeline, and capital-rights state |
| `kairos://state/market` | Live market indicators and pricing |
| `kairos://state/mandate` | Capital mandate, allowlists, and governance limits |
| `kairos://state/integration` | Routing, identity, and interface readiness |
| `kairos://state/risk` | Risk engine configuration and status |
| `kairos://state/operator` | Operator control state and action receipts |
| `kairos://state/performance` | Risk-adjusted performance metrics |
| `kairos://state/adaptive` | Adaptive learning parameters and context stats |

**Prompts:**

| Prompt | Visibility | Description |
|---|---|---|
| `explain_current_trade` | public | Human explanation of the latest trade decision |
| `summarize_risk_state` | public | Summary of risk, operator, and trust posture |
| `prepare_operator_incident_report` | operator | Incident report after pause or emergency stop |
| `audit_readiness_report` | operator | Audit readiness summary for compliance review |

---

## Quickstart

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
```

### 2. Configure environment

Copy `.env.example` to `.env.arc` and update. Kairos now auto-loads `.env.arc` first and falls back to `.env`:

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
GOVERNANCE_BILLING_ADDRESS=<billing wallet on Arc>
NANOPAYMENT_AMOUNT_USDC=0.001

# x402 Wallet — Wallet B (data API payments via Circle Gateway)
OWS_MNEMONIC=<fresh 12-word BIP-39 mnemonic>
OWS_RPC_URL=https://rpc.testnet.arc.network
OWS_CHAIN_ID=5042002
OWS_WALLET_ADDRESS=<derived from OWS_MNEMONIC>

# AIsa API (x402-paid — no API key needed)
AISA_BASE_URL=https://api.aisa.one/apis/v2

# Contract
RISK_POLICY_ADDRESS=<deploy KairosRiskPolicy.sol on Arc>
RISK_ROUTER_ADDRESS=<shared Arc risk router, if assigned>
```

### 3. Deploy KairosRiskPolicy.sol on Arc

```bash
npx hardhat run scripts/deploy-risk-policy.ts --network arc_testnet
# → Add output address to .env.arc as RISK_POLICY_ADDRESS
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

## Testing

```bash
# Run all tests
npm test

# Individual test suites
npm run test:strategy     # Strategy & indicators
npm run test:risk         # Risk engine & circuit breaker
npm run test:artifacts    # Validation artifact generation
npm run test:mandate      # Mandate enforcement engine
npm run test:simulation   # Execution simulator
npm run test:oracle       # Oracle integrity guard
npm run test:mcp          # MCP surface tests
```

Full test coverage includes:

| Suite | Covers |
|---|---|
| `test-strategy.ts` | SMA crossover, signal generation, volatility adjustment |
| `test-risk.ts` | Risk engine, circuit breaker, position management |
| `test-artifacts.ts` | Artifact builder, enrichment, governance evidence |
| `test-chain.ts` | Chain SDK, identity registration, intent signing |
| `test-mandate-engine.ts` | Asset/protocol whitelisting, capital limits |
| `test-execution-simulator.ts` | Slippage, gas, net edge calculations |
| `test-oracle-integrity.ts` | Median deviation, stale feeds, anomaly detection |
| `test-trust-scorecard.ts` | Four-dimensional trust scoring |
| `test-reputation-evolution.ts` | Trust tier transitions, capital ladder |
| `test-supervisory-meta-agent.ts` | Supervisory decisions, position throttling |
| `test-operator-control.ts` | Pause/resume/emergency stop receipts |
| `test-trust-recovery-mode.ts` | Recovery mode entry/exit, regime-aware streaks |
| `test-identity-registration.ts` | Identity registry integration |
| `test-regime-governance.ts` | Regime profile switching, hysteresis, drawdown lock |
| `test-performance-metrics.ts` | Sharpe, Sortino, max drawdown, Calmar, profit factor |
| `test-mcp-surface.ts` | MCP tools, resources, prompts validation |
| `test-pipeline-integration.ts` | End-to-end pipeline integration |

---

## Deployment

### Simulation Mode (Default)

```bash
npm run dev
```

Runs 50 trading cycles with synthetic Geometric Brownian Motion price data.

### Live Mode (Arc)

```bash
# 1. Configure .env.arc with Circle + Arc credentials (see Quickstart)
# 2. Start
npm run start:arc
```

### Production Deployment

```bash
# 1. Build
npm run build

# 2. Deploy
rsync -avz --exclude node_modules . root@<your-server>:/opt/kairos/

# 3. Install dependencies
ssh root@<your-server> 'cd /opt/kairos && npm ci --production'

# 4. Start with PM2
ssh root@<your-server> 'cd /opt/kairos && pm2 start ecosystem.config.cjs'

# 5. Verify
curl http://<your-server>:3000/api/health
```

The Express server serves both the REST API and frontend dashboard on port 3000. The MCP server runs on port 3001.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES2022), TypeScript 5.3+ |
| Execution | [tsx](https://github.com/privatenumber/tsx) for dev, `tsc` for production |
| Blockchain | [ethers.js](https://docs.ethers.org/v6/) v6, EIP-712 typed signing |
| Settlement | [Arc L1](https://arc.network) (Chain ID 5042002) — USDC-native |
| Smart Contract | Solidity ^0.8.20 |
| Payments | [Circle Nanopayments](https://developers.circle.com) · [Circle Wallets](https://developers.circle.com) · [Circle Gateway](https://developers.circle.com) |
| Data | [AIsa x402 API](https://api.aisa.one) — paid via x402 protocol |
| Dashboard | Express 4.x, vanilla HTML/JS |
| Process Management | [PM2](https://pm2.keymetrics.io) with ecosystem config |
| AI / LLMs | Claude (primary) → Gemini 2.5 Pro (fallback) → OpenAI (tertiary) |
| Artifact Storage | IPFS via [Pinata](https://pinata.cloud) |
| Scheduling | [node-cron](https://github.com/node-cron/node-cron) |

---

## Environment Variables

<details>
<summary>Full reference</summary>

| Variable | Description | Default |
|---|---|---|
| `PRIVATE_KEY` | Agent wallet private key (fallback if Circle Wallets unavailable) | — |
| `RPC_URL` | JSON-RPC endpoint | `https://rpc.testnet.arc.network` |
| `CHAIN_ID` | Chain ID | `5042002` |
| `CIRCLE_API_KEY` | Circle Developer Console API key | — |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret | — |
| `CIRCLE_WALLET_SET_ID` | Circle Wallet set ID | — |
| `AGENT_WALLET_ADDRESS` | Circle Wallet address (Wallet A) | — |
| `AGENT_WALLET_ID` | Circle Wallet ID (Wallet A) | — |
| `GOVERNANCE_BILLING_ADDRESS` | USDC billing destination | — |
| `NANOPAYMENT_AMOUNT_USDC` | Per-stage governance cost | `0.001` |
| `OWS_MNEMONIC` | BIP-39 mnemonic for x402 payments (Wallet B) | — |
| `OWS_WALLET_ADDRESS` | Derived address from mnemonic | — |
| `AISA_BASE_URL` | AIsa API base URL | `https://api.aisa.one/apis/v2` |
| `ARC_USDC_TOKEN` | USDC contract on Arc | `0x36000...` |
| `CIRCLE_GATEWAY` | Gateway contract on Arc | `0x00777...` |
| `PINATA_JWT` | Pinata API JWT for IPFS | — |
| `AGENT_NAME` | Agent display name | `Kairos` |
| `AGENT_ID` | Registered agent ID | — |
| `RISK_ROUTER_ADDRESS` | Shared Risk Router contract | — |
| `RISK_POLICY_ADDRESS` | KairosRiskPolicy contract | — |
| `TRADING_PAIR` | Trading pair | `WETH/USDC` |
| `MAX_POSITION_PCT` | Max position size (%) | `10` |
| `MAX_DAILY_LOSS_PCT` | Daily loss circuit breaker (%) | `2` |
| `MAX_DRAWDOWN_PCT` | Max drawdown circuit breaker (%) | `8` |
| `TRADING_INTERVAL_MS` | Cycle interval (ms) | `120000` |
| `MODE` | `simulation` or `live` | `simulation` |

</details>

---

## Track Record

| Metric | Value |
|---|---|
| Trading cycles executed | 890+ |
| Trust tier | Elite |
| Reputation rank | 4/48 |
| IPFS-pinned artifacts | 50+ |
| Validation / Reputation scores | 99/99 |
| Test suites | 20 core suites in default runner |

---

## Demo

**Judge dashboard:** `http://localhost:3000/kairos`

The dashboard shows all four tracks firing in real time — governance stage payments, AIsa data pull payments, LLM compute payments, and trade settlements — with clickable Arc block explorer links on every transaction hash.

---

## License

MIT

---

<p align="center">
  <em>"Not the smartest trader. The most accountable."</em>
</p>
