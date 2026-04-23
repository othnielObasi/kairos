# Kairos

Kairos is an Arc-native agentic payments runtime built for high-frequency, usage-based USDC settlement. It is designed for the "Agentic Economy on Arc" hackathon and demonstrates that an autonomous system can pay for governance, paid data, compute, and micro-commerce actions one step at a time without gas overhead destroying the economics.

Kairos is not presented as a generic trading bot. The market loop is the workload that produces repeated, economically meaningful actions. The product being demonstrated is the payment and proof runtime around that workload.

## Live Surfaces

| Surface | URL | Purpose |
| --- | --- | --- |
| Dashboard | `https://kairos.nov-tia.com` | Judge-facing proof surface for the four hackathon tracks |
| Transaction History | `https://kairos.nov-tia.com/transactions` | Consolidated payment and settlement ledger |
| Document Vault | `https://kairos.nov-tia.com/documents` | Direct access to Kairos-generated invoices, receipts, and proof files across tracks |
| Execution History | `https://kairos.nov-tia.com/execution` | Underlying execution and position audit log |
| Gemini Commerce Studio | `https://kairos.nov-tia.com/commerce` | Gemini function calling, multimodal receipt analysis, native commerce documents, and proof-settlement controls |
| MCP endpoint | `https://kairos.nov-tia.com/mcp` | JSON-RPC tools, resources, and prompts for external agents |
| Agent card | `https://kairos.nov-tia.com/.well-known/agent-card.json` | Public metadata for agent discovery |
| Arc explorer | `https://testnet.arcscan.app` | External verifier for confirmed Arc transaction hashes |

## What Kairos Proves

Kairos is built to prove an economic model, not only to render a UI:

- Per-action pricing at or below one cent.
- 50+ real Arc transaction receipts during the live demo loop.
- USDC-denominated settlement across governance, APIs, compute, and approved actions.
- x402-backed paid API consumption through AIsa and Circle infrastructure.
- Gemini 3 Flash runtime reasoning, Gemini 3 Pro SAGE reflection, and resilient failover when providers fail.
- Gemini function calling for live wallet, proof, and Track 4 inspection plus multimodal receipt or invoice analysis.
- Native Kairos invoice, receipt, and delivery-proof bundle generation for first-party Track 4 events.
- Cross-track invoice, receipt, and proof generation so Tracks 1 to 3 are inspectable without reading raw ledger rows.
- A transparent margin story: this type of high-frequency agent activity works on Arc, but breaks on high-fee payment rails.

Important: `Runtime cycles` on the dashboard are decision-loop counts. They are not the same thing as verified Arc transactions. Use `Real Arc txns`, the History page, and Arcscan links for on-chain proof.

## What Kairos Actually Is

Kairos has five layers working together:

1. Data plane: paid market, sentiment, and PRISM-style context fetched through AIsa and x402.
2. Governance plane: mandate, oracle, supervisory, simulator, risk-router, LLM, and SAGE stages that bill the runtime per action.
3. Compute plane: runtime reasoning and reflective learning billed like metered infrastructure.
4. Execution plane: approved actions can be settled on Arc, routed to Kraken, or recorded locally depending on readiness.
5. Proof plane: dashboard, History, MCP, and Arcscan links expose what happened in a judge-friendly way.

At runtime, one long-running Node.js process owns the agent loop, dashboard API, and MCP interface:

```text
Paid APIs and market inputs
        |
        v
AIsa x402 / live feeds / sentiment / PRISM
        |
        v
Kairos runtime loop
        |
        +--> mandate checks
        +--> oracle integrity
        +--> supervisory governance
        +--> risk router and simulation
        +--> Gemini/OpenAI/Claude reasoning
        +--> SAGE reflection
        |
        v
Arc USDC settlement and proof
        |
        +--> dashboard
        +--> transaction history
        +--> trade history
        +--> MCP tools/resources/prompts
```

## How To Read The Dashboard

The dashboard is intentionally compact. These are the terms that matter:

| Term | Meaning |
| --- | --- |
| `Real Arc txns` | Verified Arc receipts counted as live proof |
| `Pending hash` | A receipt exists but the final Arc hash has not yet been hydrated |
| `Fallback` | The runtime recorded the event without a verifiable on-chain receipt |
| `Runtime cycles` | Decision loops completed by the agent, not on-chain transactions |
| `Track status` | Current proof state for that track, such as `LIVE x402`, `COMPUTE BILLED`, or `ARC SETTLED` |
| `Recent Nanopayments` | Most recent receipts that support the live proof story |

The main dashboard is optimized for judges. It should answer:

- Is Kairos live?
- Are the four tracks represented?
- Is USDC actually being spent or settled?
- Is there real Arc proof behind the claims?

Long explanations belong in this README, `Transaction History`, or the docs under [`docs/`](docs).

## Detailed Track Mapping

Each hackathon track maps to a concrete runtime path in Kairos. The sections below explain exactly what triggers each track, what gets billed or settled, what appears on the dashboard, and what appears in History.

### Track 1: Agent-to-Agent Payment Loop

Track 1 is the governance billing loop. Every time Kairos runs a meaningful governance stage, it can bill that stage as a sub-cent USDC action.

What triggers Track 1:

- Mandate checks
- Oracle integrity checks
- Simulator or scenario checks
- Supervisory meta-agent decisions
- Risk router review
- LLM reasoning
- SAGE reflection

What gets billed:

- `governance-mandate`
- `governance-oracle`
- `governance-simulator`
- `governance-supervisory`
- `governance-risk-router`
- LLM and SAGE-linked governance receipts where applicable

How the flow works:

1. A governance stage runs during the decision cycle.
2. `billEvent("governance-*")` creates a nanopayment receipt.
3. The receipt is stored in the billing store as a Track 1 event.
4. The dashboard stage counters and Track 1 card update.
5. `Transaction History` receives the corresponding payment row.

What settles:

- A small Arc USDC receipt for the governance action when the signer and settlement path are ready.
- If the signer is unavailable, Kairos records a fallback receipt instead of bypassing safety.

What the dashboard proves:

- Which governance stages are active.
- How often they have been billed.
- Track 1 spend and receipt status.

What `Transaction History` shows:

- Payment rows labeled for the governance stage that produced them.
- Receipt amount, status, reference, and Arc verifier when confirmed.

Why this matters:

Track 1 proves that an autonomous runtime can meter and pay for its own internal agent stages instead of hiding all governance inside one opaque monthly cost.

### Track 2: Per-API Monetization Engine

Track 2 is Kairos's paid data plane. It pays for external information per request using AIsa over x402 and turns those paid responses into normalized inputs for the rest of the runtime.

What Track 2 currently buys:

- Spot price data
- Social sentiment data
- Financial news
- PRISM-style reasoning and market context
- Crypto spot fallback through AIsa Perplexity Sonar when needed

What the flow does:

1. The runtime needs fresh price, sentiment, or PRISM context.
2. `normalisation.ts` verifies that x402 is ready.
3. Kairos calls the AIsa endpoint.
4. The response is normalized into the shapes the strategy, oracle, and market-state logic expect.
5. `billEvent("data-*")` creates the paid receipt.
6. The receipt is added to Track 2 billing totals and source-level breakdowns.
7. The dashboard Track 2 card and `Transaction History` update.

What settles:

- A sub-cent or low-cent Arc USDC receipt per paid API request when the x402 signer is active.

Track 2 source mapping in the current runtime:

| Internal billing key | Current upstream source in production | Purpose |
| --- | --- | --- |
| `coingecko` | AIsa financial prices or AIsa Perplexity spot-price path | Primary price slot in legacy downstream shape |
| `kraken` | AIsa financial prices or AIsa Perplexity spot-price path | Secondary price slot in legacy downstream shape |
| `feargreed` | AIsa Twitter advanced search | Sentiment proxy |
| `alphavantage` | AIsa financial news | News sentiment proxy |
| `prism` | AIsa Perplexity Sonar | PRISM-style reasoning and directional context |

Important note:

The `coingecko`, `kraken`, `feargreed`, and `alphavantage` labels still exist as internal compatibility keys because older downstream code expects those categories. In production Track 2, those labels do not necessarily mean Kairos is calling those vendors directly. The paid upstream request is the AIsa or x402-backed source listed above.

What the dashboard proves:

- Source-level call counts.
- Spend by source.
- Whether the data plane is running in `x402`, `fallback`, or `disabled` mode.

What `Transaction History` shows:

- One ledger row per paid data receipt.
- The event name, source, amount, receipt state, and verifier.

What fallback means for Track 2:

- If AIsa is configured but the signer is missing, Track 2 reports fallback mode.
- If an AIsa endpoint fails, Kairos only uses safe fallbacks where the strategy can still operate responsibly.
- Fallback receipts do not count as verified x402 proof.

Why this matters:

Track 2 proves that data providers can charge per request and still be economically viable when the consumer is an agent making many tiny calls.

### Track 3: Usage-Based Compute Billing

Track 3 is Kairos's metered compute layer. It bills both real-time reasoning and reflective learning as separate compute actions.

Track 3 has two subflows:

- Runtime reasoning: the explanation layer for each decision.
- SAGE reflection: the learning layer that reviews accumulated outcomes and proposes bounded improvements.

#### Runtime reasoning flow

What it does:

- Builds a structured prompt from price, risk, sentiment, position, and SAGE context.
- Produces a human-readable explanation of why the action was approved or rejected.
- Bills that explanation as metered compute.

Current runtime failover order in the code:

1. Gemini runtime models using the primary Gemini key
2. Gemini runtime models using the secondary Gemini key
3. OpenAI `gpt-4o-mini`
4. Claude `claude-sonnet-4-20250514`
5. Deterministic no-API fallback

Recommended production configuration:

```bash
GEMINI_RUNTIME_MODELS=gemini-3-flash-preview
GEMINI_REFLECTION_MODELS=gemini-3-pro-preview,gemini-3-flash-preview
```

What gets billed:

- `compute-llm`

What the dashboard proves:

- That Kairos is charging per inference.
- Which model family is active or available.
- Whether compute billing is live or in fallback mode.

#### SAGE reflection flow

What it does:

- Watches closed trade outcomes and contextual features.
- Waits for enough outcomes and cooldown cycles.
- Asks a Gemini reflection model to propose insights, playbook rules, and bounded weight changes.
- Applies only safe, caged changes.
- Bills that reflection as a separate compute event.

Current SAGE model order:

1. Gemini 3 Pro reflection model
2. Gemini 3 Flash reflection fallback

What gets billed:

- `compute-sage`

What `Transaction History` shows for Track 3:

- Separate receipt rows for inference and reflection.
- Model labels where available.
- Arc verification when the compute receipt is confirmed on-chain.

Important distinction:

Track 3 is not "the model made the trade." The risk engine still decides. The model explains the decision and SAGE learns within strict bounds. That distinction is part of the safety story.

Why this matters:

Track 3 proves that agents can pay for compute in the same metered way they pay for APIs or settlement. It turns reasoning itself into a billable economic action.

### Track 4: Real-Time Micro-Commerce Flow

Track 4 is Kairos's micro-commerce settlement layer. This is the track most likely to be misunderstood, so the important distinction is stated plainly:

Track 4 does not mean "every underlying trade notional settles on Arc."

In the current implementation, Track 4 proves that an approved Kairos action can produce a real Arc USDC micro-commerce receipt. The receipt is the on-chain settlement proof for the action or checkout event.

There are two related things inside Track 4:

- The underlying approved action or execution decision
- The small Arc USDC receipt that settles or proves that action

Those are related, but they are not the same value.

What Track 4 currently settles:

- A small Arc USDC payment, by default `0.009 USDC`, to `MICRO_COMMERCE_SETTLEMENT_ADDRESS`
- The payment represents an approved action or a proof-commerce checkout event

What Track 4 now generates automatically for Kairos-native flows:

- A Kairos invoice page with the reference merchant, amount, and action context
- A Kairos receipt page with the bounded Arc proof settlement
- A Kairos delivery-proof page with the reviewed or fulfilled commerce context

Manual upload is still supported for third-party receipts or invoices that originate outside Kairos. Native first-party Track 4 flows no longer depend on the user supplying those documents.

Current Track 4 event types:

| Event | What it means |
| --- | --- |
| `track4-approved-action` | A risk-approved non-neutral action created a micro-commerce settlement receipt |
| `track4-proof-capsule` | A periodic proof-commerce checkout emitted a live Arc receipt even when the market loop stayed neutral |

How the flow works:

1. Kairos reaches a risk-approved action, or a proof-commerce interval is reached.
2. The runtime attempts Arc settlement through the Track 4 micro-commerce path.
3. `settleMicroCommerceEvent()` creates the receipt.
4. The checkpoint or micro-commerce store records the event.
5. Kairos generates a native invoice, receipt, and delivery-proof bundle for the event.
6. The dashboard Track 4 card updates.
7. `Transaction History` receives the payment row and document links.
8. If applicable, `Execution History` also receives the execution context for the underlying action and its commerce-document links.

Track 4 state meanings:

| State | Meaning |
| --- | --- |
| `ARC SETTLED` | A confirmed Arc receipt exists for the Track 4 action |
| `VERIFYING` | The receipt was submitted but the final Arc hash is still being resolved |
| `KRAKEN LIVE` | Exchange execution happened, but Arc settlement was not the proof path |
| `PAPER EXECUTION` | Kraken paper execution was recorded, not on-chain settlement |
| `LOCAL ONLY` | The action was recorded locally without external settlement proof |
| `IDLE` | No qualifying Track 4 action has been produced yet |

What the Track 4 metrics mean:

- `actions recorded`: how many Track 4-eligible action events were observed
- `settled volume`: the sum of Track 4 settlement proof represented by the runtime
- `recent events`: the most recent Arc micro-commerce receipts or execution proof rows

Important distinction on value:

The underlying action may involve a much larger economic notional than the Track 4 receipt amount. The receipt amount is the micro-commerce settlement proof. The action notional is the size of the governed action behind that proof.

What the dashboard proves:

- Whether Track 4 is actually settling on Arc
- Whether it is falling back to Kraken live, Kraken paper, or local-only execution
- Recent proof links for the latest settled micro-commerce events

What `Transaction History` shows:

- The Track 4 payment or settlement receipt itself
- Receipt amount, mode, status, reference, and Arc verifier
- Document links when Kairos generated a native invoice, receipt, and delivery-proof bundle for that event

What `Execution History` shows:

- The underlying governed action or execution lifecycle
- Entry, exit, PnL, close reason, artifact, and related tx link if present
- Commerce-document links when the execution produced a first-party Track 4 bundle

Why Track 4 has both `Transaction History` and `Execution History`:

One approved Kairos action can generate two different records:

- A trade or execution record showing what Kairos decided to do
- A payment or settlement record showing how that action was economically settled or proven

That is why `Execution History` relates to Track 4 without being the same thing as the Track 4 proof ledger.

Why this matters:

Track 4 proves the most visible part of the hackathon thesis: a user or agent interaction can trigger immediate USDC settlement per interaction instead of relying on subscriptions or batched invoices.

## Gemini Commerce Studio

The Google partner requirements are surfaced in production at `https://kairos.nov-tia.com/commerce`.

This page has two live workflows:

### 1. Gemini function-calling assistant

What it does:

- Uses Gemini 3 Flash function calling against live Kairos backend tools
- Explains current gateway balance, Arc proof counts, and Track 4 settlement state
- Can preview a proof settlement without sending a transaction
- Can optionally mint a proof receipt only when the operator explicitly enables settlement actions
- Falls back to OpenAI operator summarization if Gemini quota or availability fails, while keeping settlement actions opt-in
- Shows the latest Kairos-native invoice, receipt, and delivery-proof bundles generated by Track 4 events

What tools Gemini can call:

- `get_gateway_balance`
- `get_arc_receipt_summary`
- `get_track4_micro_commerce_status`
- `preview_commerce_proof_settlement`
- `settle_commerce_proof_receipt` when settlement actions are enabled

Why this matters:

This closes the gap between "Gemini is configured in the backend" and "Gemini is visibly driving agent commerce logic in the shipped product."

### 2. Gemini multimodal commerce proof

What it does:

- Accepts a receipt, invoice, or delivery-proof image
- Uses Gemini multimodal analysis to extract merchant, invoice number, date, totals, and issues
- Produces a settlement recommendation of `approve`, `review`, or `reject`
- Prepares a bounded Arc proof receipt preview capped at `<= 0.01 USDC`
- Falls back to OpenAI vision analysis if Gemini multimodal calls are unavailable at runtime

What Kairos now creates itself:

- Native Track 4 commerce events create their own invoice, receipt, and delivery-proof pages automatically.
- External commerce events can still be uploaded for Gemini review before any proof receipt is minted.

Important distinction:

The multimodal flow does not settle the full invoice amount on Arc. It creates a tiny proof receipt for the reviewed commerce event. The invoice total remains the reference notional, while the proof receipt is the judge-facing settlement evidence.

Native commerce document routes:

- `/api/commerce/documents`
- `/api/commerce/documents/:eventId`
- `/api/documents`
- `/api/documents/:eventId`
- `/documents`
- `/commerce/docs/:eventId/invoice`
- `/commerce/docs/:eventId/receipt`
- `/commerce/docs/:eventId/delivery-proof`
- `/documents/:eventId/invoice`
- `/documents/:eventId/receipt`
- `/documents/:eventId/delivery-proof`

Recommended configuration:

```bash
GEMINI_FUNCTION_MODELS=gemini-3-flash-preview
GEMINI_MULTIMODAL_MODELS=gemini-3-pro-preview,gemini-3-flash-preview
COMMERCE_PROOF_SETTLEMENT_AMOUNT_USDC=0.009
COMMERCE_PROOF_SETTLEMENT_MAX_USDC=0.01
```

## Transaction History vs Execution History

These two surfaces answer different questions.

### Transaction History

Use `https://kairos.nov-tia.com/transactions` when the question is:

- What got paid?
- What got settled?
- Is there a real Arc receipt for it?
- Which invoice, receipt, or delivery-proof bundle belongs to that commerce event?
- Which hackathon track does this support?

`Transaction History` is the consolidated proof ledger across:

- Track 1 governance receipts
- Track 2 paid API receipts
- Track 3 compute receipts
- Track 4 micro-commerce receipts
- operator or audit receipts where applicable

### Document Vault

Use `https://kairos.nov-tia.com/documents` when the question is:

- Where is the invoice for this billed event?
- Where is the receipt for this billed event?
- What proof file explains the governance, API, compute, or commerce action?

`Document Vault` is the direct artifact surface. It complements:

- `Transaction History` for the payment ledger
- `Execution History` for the governed action log

### Execution History

Use `https://kairos.nov-tia.com/execution` when the question is:

- What action did Kairos take?
- When was a position opened or closed?
- What was the PnL?
- What artifact explains the action?
- Which native commerce documents were generated from that action?

`Execution History` is the execution log. It is related most closely to Track 4, but it is not itself the Track 4 proof ledger.

## MCP Surface

Kairos is not only a dashboard. It also exposes an MCP interface over HTTP JSON-RPC so other agents and operator tools can inspect and use it programmatically.

What the MCP surface exposes:

- Market and trust state
- Mandate and capital rights
- Positions and performance
- Trade explanation and history
- DEX routing context
- Kraken and feed status
- Operator controls
- Prompts for incidents, trade explanations, and trust summaries

Why it matters:

The MCP endpoint turns Kairos into a composable agent service rather than a static demo page.

## Production Deployment

Kairos is deployed as a long-running PM2-managed Node.js service on a VPS behind Nginx.

Current production shape:

| Component | Value |
| --- | --- |
| PM2 app name | `kairos-agent` |
| Working directory | `/opt/kairos` |
| Process entrypoint | `npx tsx src/agent/index.ts` |
| Dashboard port | `3000` |
| MCP runtime port | `3001` |
| Public domain | `https://kairos.nov-tia.com` |
| Persistent runtime directory | `.kairos/` |

Operational notes:

- `.kairos/` stores runtime state, price history, SAGE state, and micro-commerce records.
- Restarting PM2 does not delete `.kairos/`, but it does reset the in-memory billing counters for the live session.
- The loop then rebuilds fresh proof over time as new receipts are emitted.

### Kraken CLI status

The Kraken execution bridge is now installed and validated on the production server.

Current validation surfaces:

- `/api/kraken/cli`
- `/api/kraken/snapshot`
- `/api/kraken/preflight`

What that means:

- The `kraken` binary is installed in a system path visible to the runtime.
- Kairos can health-check the CLI directly.
- Paper mode can be initialized and used by the runtime.
- API key presence is being detected by the production process.

Important limit:

Kraken readiness improves Track 4 and execution-side validation, but the highest-value hackathon proof for Kairos remains Arc-settled USDC receipts, not paper fills.

## Environment Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

### Required Arc and Circle values

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

### Required x402 and paid-data signer values

Use Circle Wallets or a mnemonic signer:

```bash
OWS_MNEMONIC=
X402_MNEMONIC=
AISA_BASE_URL=https://api.aisa.one/apis/v2
GATEWAY_CONTRACT=0x0077777d7eba4688bdef3e311b846f25870a19b9
```

### Track 3 AI configuration

```bash
GEMINI_API_KEY_PRIMARY=
GEMINI_API_KEY_SECONDARY=
GEMINI_RUNTIME_MODELS=gemini-3-flash-preview
GEMINI_REFLECTION_MODELS=gemini-3-pro-preview,gemini-3-flash-preview
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

### Track 4 proof-commerce configuration

```bash
TRACK4_SETTLEMENT_AMOUNT_USDC=0.009
TRACK4_PROOF_COMMERCE_ENABLED=true
TRACK4_PROOF_COMMERCE_INTERVAL_CYCLES=5
```

### Kraken bridge configuration

```bash
KRAKEN_API_KEY=
KRAKEN_API_SECRET=
KRAKEN_PAPER_TRADING=true
KRAKEN_CLI_PATH=kraken
KRAKEN_CLI_TIMEOUT_MS=30000
```

## Local Development

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

Local defaults:

- Dashboard: `http://localhost:3000`
- MCP runtime: `http://localhost:3001/mcp`

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run build` | Type-check and compile the project |
| `npm test` | Run the test suite |
| `npm run test:mcp` | Validate the MCP surface |
| `npm run start:arc` | Start the full agent, dashboard, and MCP runtime |
| `npm run dashboard` | Start only the dashboard server |
| `npm run mcp` | Start only the MCP server |
| `npm run circle:bootstrap` | Generate or register Circle wallet configuration |
| `npm run demo:nanopayments` | Exercise nanopayment behavior |
| `npm run demo:onchain` | Exercise the on-chain demo path |

## Runtime API Highlights

| Route | Purpose |
| --- | --- |
| `/api/status` | Runtime status, track state, MCP summary, provider readiness |
| `/api/billing` | Billing totals, Arc transaction count, spend, and receipt summaries |
| `/api/transactions` | Consolidated proof ledger used by `Transaction History` |
| `/api/checkpoints` | Governance checkpoints and execution outcomes |
| `/api/health` | Health summary for monitoring |
| `/api/feeds/status` | Data-feed and x402 readiness |
| `/api/sage/status` | SAGE learning and reflection state |
| `/api/operator/state` | Operator controls and pause state |
| `/api/gateway-balance` | Circle Gateway or x402 wallet balance |
| `/api/kraken/cli` | Kraken CLI installation and health |
| `/api/kraken/snapshot` | Kraken balance, open orders, trades, ticker, and CLI status |
| `/api/kraken/preflight` | Execution readiness check for the Kraken bridge |

## Security And Secrets

- Never commit `.env`, `.env.arc`, `.kairos/`, `.circle-recovery-file/`, or private keys.
- Circle API keys, entity secrets, wallet recovery files, Gemini keys, OpenAI keys, Anthropic keys, Kraken keys, Alpha Vantage keys, and mnemonics must stay outside Git.
- The dashboard intentionally exposes only proof summaries and public metadata.
- Billing failures do not bypass governance. Kairos records pending or fallback receipts instead of silently pretending settlement happened.

## Verification Checklist

Use this checklist before demos or production reviews:

1. `npm run build` passes.
2. `npm test` passes.
3. `npm run test:mcp` passes.
4. `https://kairos.nov-tia.com` returns `200`.
5. `/transactions`, `/execution`, `/mcp`, and `/.well-known/agent-card.json` return `200`.
6. `/api/billing` shows `realTxns >= 50` when the demo proof target is being exercised.
7. Track 2 reports `x402` mode or explains fallback clearly.
8. Track 3 shows Gemini readiness or clear provider failover state.
9. Track 4 shows `ARC SETTLED` when live micro-commerce receipts are landing on Arc.
10. `Transaction History` contains Arcscan-verifiable hashes for confirmed receipts.
11. `/api/kraken/cli` and `/api/kraken/preflight` report healthy when Kraken execution is part of the demo story.
12. PM2 shows `kairos-agent` online.

## Documentation Index

The README is the product and operator overview. The deeper technical documents live here:

| Document | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Components, trust boundaries, deployment shape, and ownership |
| [System Flows](docs/SYSTEM_FLOWS.md) | End-to-end runtime flows for billing, settlement, MCP, and recovery |
| [Repository Structure](docs/REPO_STRUCTURE.md) | Directory-by-directory and module-by-module repo layout |

## Project Positioning

Kairos is best understood as a programmable economic operating layer for an autonomous runtime:

- It pays for data like an API consumer.
- It pays for compute like metered infrastructure.
- It pays for governance like an accountable agent.
- It settles approved actions like a micro-commerce system.
- It exposes all of that through a live proof surface that a judge, operator, or other agent can verify.

That is the core claim of the project.
