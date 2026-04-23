# Kairos System Flows

This document explains the end-to-end runtime flows that power the dashboard, billing proof, MCP interface, and four hackathon tracks.

## Flow 1: Startup And Service Boot

```text
PM2 starts kairos-agent
        |
        v
src/agent/index.ts loads environment
        |
        v
startDashboard(3000) and startMcpServer(3001)
        |
        v
validate config and load persisted state
        |
        v
load market history and SAGE state
        |
        v
Scheduler starts the runtime cycle
```

Key files:

- `ecosystem.config.cjs`
- `src/env/load.ts`
- `src/agent/index.ts`
- `src/dashboard/server.ts`
- `src/mcp/server.ts`
- `src/agent/scheduler.ts`
- `src/agent/state.ts`

## Flow 2: One Runtime Decision Cycle

```text
Cycle begins
        |
        v
Check operator control and feed freshness
        |
        v
Fetch live price, sentiment, and PRISM data
        |
        v
Run strategy signal
        |
        v
Oracle integrity check
        |
        v
Neuro-symbolic and regime governance adjustments
        |
        v
Supervisory meta-agent and mandate enforcement
        |
        v
Risk engine evaluation
        |
        v
DEX routing and execution simulation
        |
        v
On-chain risk policy check when configured
        |
        v
Build artifact and generate AI reasoning
        |
        v
Save checkpoint
        |
        v
Execute approved action or record rejection
        |
        v
Update positions, stops, outcomes, SAGE, and persisted state
```

The cycle is intentionally layered. No later component should bypass earlier governance decisions.

## Flow 3: Track 1 Agent-to-Agent Payment Loop

```text
Governance stage runs
        |
        v
billEvent("governance-*")
        |
        v
nanopayments.ts creates Arc USDC receipt
        |
        v
billingStore.addGovernanceEvent()
        |
        v
/api/billing exposes stage count, spend, and receipt state
        |
        v
Dashboard Track 1 and History show proof
```

Tracked stages:

1. Mandate
2. Oracle
3. Simulator
4. Supervisory
5. Risk Router
6. LLM Reasoning
7. SAGE

Track 1 proves that an autonomous agent can pay per governance or agent-stage action instead of relying on monthly subscriptions or coarse-grained batching.

## Flow 4: Track 2 Per-API Monetization With x402

```text
Runtime requests paid data
        |
        v
normalisation.ts creates x402 paying fetch
        |
        v
AIsa endpoint is called
        |
        v
Response is normalized for downstream strategy/oracle code
        |
        v
billEvent("data-*") records proof receipt
        |
        v
billingStore.addApiEvent()
        |
        v
/api/status and /api/billing expose Track 2 state
        |
        v
Dashboard Track 2 and History show source-level spend
```

Primary paid data surfaces:

- Spot price snapshots.
- Twitter/social sentiment.
- Financial news.
- PRISM reasoning and risk signals.
- Perplexity-backed spot price fallback for crypto assets.

Readiness rules:

- If `AISA_BASE_URL` and a signer are configured, Track 2 runs in `x402` mode.
- If AIsa is configured but no signer exists, Track 2 reports fallback mode.
- If AIsa is not configured, Track 2 reports disabled mode.

Signer sources:

- Circle Wallets signer through `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_ID`, and `AGENT_WALLET_ADDRESS`.
- Mnemonic signer through `OWS_MNEMONIC` or `X402_MNEMONIC`.

## Flow 5: Track 3 Usage-Based Compute Billing

```text
Risk decision needs reasoning
        |
        v
ai-reasoning.ts builds shared reasoning prompt
        |
        v
Gemini runtime model attempts response
        |
        v
Secondary Gemini key/model attempts response if needed
        |
        v
OpenAI and Claude are failovers when configured
        |
        v
billEvent("compute-llm") records compute receipt
        |
        v
billingStore.addComputeEvent()
        |
        v
Dashboard Track 3 and History show billed inference
```

Runtime model defaults:

- `GEMINI_RUNTIME_MODELS=gemini-3-flash-preview`
- `GEMINI_REFLECTION_MODELS=gemini-3-pro-preview,gemini-3-flash-preview`
- `OPENAI_API_KEY` is used after Gemini failover.

SAGE reflection flow:

```text
Closed trade outcomes accumulate
        |
        v
SAGE reflection cooldown and outcome threshold pass
        |
        v
Gemini reflection model summarizes outcomes and proposes bounded rules
        |
        v
SAGE weights/playbook update within configured cages
        |
        v
Reflection is billed and visible in Track 3
```

SAGE does not directly bypass risk controls. It contributes learned context and bounded adjustments.

## Flow 6: Track 4 Real-Time Micro-Commerce Settlement

```text
Risk-approved action is ready to execute
        |
        v
Arc risk router path attempts settlement if configured
        |
        v
If no router settlement exists, settleMicroCommerceEvent() runs
        |
        v
Track 4 USDC micro-commerce receipt is created on Arc
        |
        v
Checkpoint execution state is updated
        |
        v
Dashboard Track 4 and History show action, settlement mode, and proof link
```

Settlement state can be:

- `arc_settled`: verified Arc transaction hash exists.
- `kraken_live`: exchange execution was confirmed.
- `kraken_paper`: paper trading execution was recorded.
- `local_only`: action was recorded locally without external settlement.

For the hackathon proof story, `arc_settled` receipts are the highest-value Track 4 evidence.

## Flow 7: Transaction History And Proof Ledger

```text
Billing receipts + checkpoint executions
        |
        v
server.ts builds consolidated transaction rows
        |
        v
/api/transactions?limit=500
        |
        v
transactions.html renders searchable audit ledger
```

History is the detailed audit surface. It is designed to carry information that would make the dashboard too text-heavy:

- Track labels.
- Receipt amount.
- Settlement mode.
- Status.
- Timestamp.
- Arcscan links for confirmed transaction hashes.
- Pending/fallback state for unresolved receipts.

## Flow 8: Dashboard Proof Surface

```text
kairos.html polls:
        |
        +--> /api/billing
        +--> /api/status
        +--> /api/checkpoints
        +--> /api/gateway-balance
        |
        v
Compact proof cards update every 2 seconds
```

Dashboard design rules:

- Keep copy short.
- Show only judge-facing proof on the main page.
- Push detailed receipts to History.
- Explain runtime cycles with tooltips.
- Keep track cards consistent: purpose, status, three metrics, latest proof.

## Flow 9: MCP Agent Interface

```text
External MCP client
        |
        v
https://kairos.nov-tia.com/mcp
        |
        v
Dashboard server proxies to MCP runtime on port 3001
        |
        v
MCP server serves tools, resources, prompts, and JSON-RPC responses
```

MCP exposes:

- Market and trust state.
- Mandate and capital rights.
- Positions and performance.
- Trade explanation and history.
- DEX routing.
- Kraken/feed status.
- Operator controls.
- Prompt templates for risk, incidents, trade explanation, and trust summaries.

The MCP surface makes Kairos usable by other agents, not only human dashboard viewers.

## Flow 10: Persistence And Restart Recovery

```text
Runtime opens/closes positions or reaches persistence interval
        |
        v
state.ts writes .kairos/state.json and .kairos/price-history.json
        |
        v
Process restarts
        |
        v
initAgent() restores state and price history
        |
        v
Reconciliation checks stale stops and resets daily breaker state
```

Important operational note:

The billing counters in `billingStore` are in-memory proof counters for the current runtime session. A PM2 restart resets the live dashboard count, and the loop rebuilds the 50+ transaction proof as new receipts are produced.

## Flow 11: Failure And Fallback Handling

| Failure | Runtime behavior |
| --- | --- |
| AIsa signer missing | Track 2 falls back and reports signer missing |
| AIsa endpoint fails | Strategy continues with available fallback data where safe |
| Circle tx hash not immediately available | Receipt is marked pending and hydrated later when possible |
| Nanopayment signer missing | Fallback receipt is recorded; governance does not bypass safety |
| Gemini fails | Secondary Gemini key/model is attempted, then OpenAI/Claude if configured |
| No LLM keys exist | Deterministic reasoning fallback is used |
| Feed is stale | Trading is skipped, but critical stop checks still run |
| Repeated cycle errors | Scheduler pauses and resumes after cooldown |
| Shutdown signal arrives | State is persisted and dashboard/MCP servers are stopped |

## Flow 12: Verification Checklist

Use this checklist before demos:

1. `npm run build` passes.
2. `npm run test:mcp` passes.
3. `https://kairos.nov-tia.com` returns `200`.
4. `/transactions`, `/mcp`, and `/.well-known/agent-card.json` return `200`.
5. `/api/billing` shows `realTxns >= 50`.
6. `/api/billing` shows `meetsTxnRequirement: true`.
7. Dashboard Track 2 reports x402 mode or clearly explains fallback.
8. Dashboard Track 3 shows Gemini runtime/readiness or clear failover state.
9. History contains Arcscan-verifiable receipts where `txHash` is confirmed.
10. PM2 shows `kairos-agent` online.
