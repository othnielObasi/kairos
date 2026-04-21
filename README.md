## Kairos

Kairos is an Arc-native agentic payments runtime built for the Agentic Economy on Arc hackathon. It demonstrates how an application or agent can charge, pay, and settle value per action with USDC on Arc using Circle infrastructure.

The repository no longer carries the previous sandbox identity. Kairos is the active product here. The current runtime still uses a market-execution reference flow to exercise high-frequency governed decisions, but that reference workload is now framed in service of the Arc + Circle economic proof, not as the product identity.

## Hackathon Alignment

Kairos is designed around the hackathon brief:

- Real per-action pricing at sub-cent levels with Circle Nanopayments
- High-frequency onchain activity on Arc with USDC settlement
- Clear economic proof for why the model fails under traditional gas costs
- Multiple monetization surfaces inside one governed runtime

The implementation maps to the event tracks like this:

| Track | Kairos behavior |
|---|---|
| Per-API Monetization Engine | Paid x402 and API-backed data access |
| Agent-to-Agent Payment Loop | Governance and runtime stages bill the agent in real time |
| Usage-Based Compute Billing | LLM reasoning and adaptive reflection are billed per use |
| Real-Time Micro-Commerce Flow | Approved actions settle value and produce auditable receipts |

## What The Runtime Does

Kairos runs a governed execution loop:

1. Pull paid inputs and market or context data
2. Run policy, oracle, supervisory, and routing checks
3. Bill governance and compute events in USDC
4. Execute approved actions through the Arc-connected flow
5. Persist artifacts, billing data, and integration state for review

This gives the project a concrete, high-frequency workload that can demonstrate 50+ onchain transactions, usage-based billing, and settlement visibility.

## Circle And Arc Stack

Kairos is wired around the required and recommended hackathon technologies:

| Product | Role |
|---|---|
| Arc | Settlement layer for all onchain activity |
| USDC | Native unit of account for billing and settlement |
| Circle Nanopayments | Sub-cent governance and compute billing |
| Circle Wallets | Primary programmable wallet infrastructure |
| Circle Gateway / x402 | Paid API and data access flows |

## Required Environment

Copy `.env.example` to `.env` and fill the Circle wallet values first:

```bash
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_SET_ID=
CIRCLE_WALLET_ID=
AGENT_WALLET_ADDRESS=
```

Common Arc and runtime values:

```bash
PRIVATE_KEY=
RPC_URL=https://rpc.testnet.arc.network
CHAIN_ID=5042002
PINATA_JWT=
```

## Commands

```bash
npm install
npm run build
npm test
npm run start:arc
npm run dashboard
npm run mcp
```

## Important Paths

| Path | Purpose |
|---|---|
| `src/agent` | Runtime loop, config, scheduling, state |
| `src/chain` | Arc-connected execution, routing, wallet interactions |
| `src/services` | Billing, nanopayments, settlement helpers |
| `src/dashboard` | Economic proof and runtime dashboards |
| `src/mcp` | MCP tools, prompts, and resources |
| `src/trust` | Artifacts, scorecards, checkpoints, audit data |

## Runtime Surfaces

| Route or resource | Purpose |
|---|---|
| `/health` | Runtime health |
| `/api/state` | Full runtime snapshot |
| `/api/feeds/status` | Feed and integration health |
| `/api/billing` | Economic proof and payment aggregates |
| `/api/trades` | Recent approved execution records from the reference workflow |
| `/kairos` | Economic proof dashboard |
| `kairos://state/runtime` | MCP runtime resource |
| `kairos://state/integration` | MCP integration resource |
| `kairos://state/billing` | MCP billing resource |

## Notes

- Legacy planning and tuning markdown has been removed.
- The current code still contains market and execution modules because they are the live reference workload used to produce the payment proof.
- If you want the next pass to remove or rename those underlying market-execution modules too, that is a deeper runtime refactor rather than a documentation cleanup.
