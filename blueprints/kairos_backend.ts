// ═══════════════════════════════════════════════════════════════════════════════
// KAIROS BACKEND — v2
// Three new files + edits to existing files
// All payments go through Circle platform: Nanopayments + x402 (Circle facilitator)
// ═══════════════════════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────────────────────
// FILE 1: src/services/nanopayments.ts  (NEW)
// ───────────────────────────────────────────────────────────────────────────────
// npm install @circle-fin/nanopayments

import { NanopaymentsClient } from '@circle-fin/nanopayments';

const nanoClient = new NanopaymentsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
});

export const NANO_AMOUNT = parseFloat(
  process.env.NANOPAYMENT_AMOUNT_USDC || '0.001'
);

export interface NanopaymentReceipt {
  eventName:   string;
  source?:     string;
  model?:      string;
  type?:       string;  // 'governance' | 'data' | 'inference' | 'reflection'
  mode?:       string;  // 'x402' | 'nanopayment' | 'fallback'
  txHash:      string;
  amount:      number;
  confirmedAt: number;
}

/**
 * Bill a governance or compute event via Circle Nanopayments.
 * NEVER throws — billing failure returns a pending receipt.
 * Governance logic is always unaffected by billing outcomes.
 */
export async function billEvent(
  eventName: string,
  meta: {
    source?: string;
    model?:  string;
    type?:   string;
    mode?:   string;
  } = {}
): Promise<NanopaymentReceipt> {
  try {
    const payment = await nanoClient.createPayment({
      from:     process.env.AGENT_WALLET_ADDRESS!,
      to:       process.env.GOVERNANCE_BILLING_ADDRESS!,
      amount:   NANO_AMOUNT.toString(),
      currency: 'USDC',
      metadata: {
        eventName,
        product:  'Kairos',
        agentId:  process.env.AGENT_ID || 'kairos-1',
        chain:    'Arc Testnet',
        ...meta,
      },
    });

    return {
      eventName,
      ...meta,
      txHash:      payment.txHash,
      amount:      NANO_AMOUNT,
      confirmedAt: Date.now(),
    };

  } catch (err) {
    // Log but never block — return pending receipt
    console.warn(`[Kairos] billEvent failed (${eventName}):`, err);
    return {
      eventName,
      ...meta,
      txHash:      'pending_' + Date.now(),
      amount:      NANO_AMOUNT,
      confirmedAt: Date.now(),
    };
  }
}


// ───────────────────────────────────────────────────────────────────────────────
// FILE 2: src/services/x402-client.ts  (NEW)
// ───────────────────────────────────────────────────────────────────────────────
// Wraps external API calls with x402 payment via Circle facilitator.
// If the provider does not return HTTP 402, falls back to standard API key.
// The billing event is recorded either way.
//
// npm install x402

import { wrapFetch } from 'x402/fetch';
import { circleX402Facilitator } from '@circle-fin/x402';
import { billEvent as _billEvent, NanopaymentReceipt } from './nanopayments';
import { billingStore } from './billing-store';

// Circle x402 facilitator — handles payment verification and Arc settlement
const facilitator = circleX402Facilitator({
  apiKey:          process.env.CIRCLE_API_KEY!,
  walletAddress:   process.env.AGENT_WALLET_ADDRESS!,
  chain:           'ARC-TESTNET',
});

// x402-wrapped fetch — automatically pays 402 responses via Circle facilitator
const x402Fetch = wrapFetch(fetch, facilitator);

export type ApiSourceKey =
  | 'coingecko'
  | 'kraken'
  | 'feargreed'
  | 'alphavantage'
  | 'prism';

/**
 * Make a paid API request.
 * - Attempts x402 via Circle facilitator first
 * - Falls back to standard fetch with API key if provider is not 402-enabled
 * - Records a billing event (Nanopayment on Arc) either way
 */
export async function paidFetch(
  url:       string,
  options:   RequestInit = {},
  sourceKey: ApiSourceKey
): Promise<Response> {

  let mode: 'x402' | 'fallback' = 'x402';
  let response: Response;

  try {
    // Attempt x402 payment via Circle facilitator
    response = await x402Fetch(url, options);
    mode = 'x402';
  } catch (x402Err) {
    // Provider not 402-enabled — fall back to standard fetch
    console.info(`[Kairos] x402 not supported by ${sourceKey} — falling back`);
    response = await fetch(url, options);
    mode = 'fallback';
  }

  // Bill the data pull regardless of x402 or fallback
  // This records the economic event on Arc even if the provider isn't x402-ready
  try {
    const receipt = await _billEvent(`data-${sourceKey}`, {
      source: sourceKey,
      type:   'data',
      mode,
    });
    billingStore.addApiEvent(receipt, sourceKey, mode);
  } catch (billingErr) {
    console.warn(`[Kairos] billing skip for ${sourceKey}:`, billingErr);
  }

  return response;
}


// ───────────────────────────────────────────────────────────────────────────────
// FILE 3: src/services/billing-store.ts  (NEW)
// ───────────────────────────────────────────────────────────────────────────────

import { NanopaymentReceipt } from './nanopayments';

const STAGE_NAMES = [
  'Mandate', 'Oracle', 'Simulator',
  'Supervisory', 'Risk Router', 'LLM Reasoning', 'SAGE',
];

export interface ApiBreakdown {
  [key: string]: {
    calls: number;
    spend: number;
    mode:  'x402' | 'fallback';  // last known mode for this source
  };
}

class BillingStore {
  // Track 1 — Circle Nanopayments: governance stages
  t1Events:    NanopaymentReceipt[] = [];
  stageCounts: number[] = new Array(7).fill(0);
  stageSpend:  number[] = new Array(7).fill(0);
  t1Spend = 0;

  // Track 2 — x402 via Circle facilitator: data API calls
  t2Events:    NanopaymentReceipt[] = [];
  apiBreakdown: ApiBreakdown = {};
  t2Spend = 0;

  // Track 3 — Circle Nanopayments: LLM + SAGE compute
  t3Events:    NanopaymentReceipt[] = [];
  t3Spend = 0;

  // Totals
  totalTxns  = 0;
  totalSpend = 0;

  // ── Track 1: governance Nanopayment ──────────────────────────────────────
  addGovernanceEvent(r: NanopaymentReceipt, stageIndex: number) {
    r.source = STAGE_NAMES[stageIndex];
    r.mode   = 'nanopayment';
    this.t1Events.unshift(r);
    if (this.t1Events.length > 100) this.t1Events.pop();
    if (stageIndex >= 0 && stageIndex < 7) {
      this.stageCounts[stageIndex]++;
      this.stageSpend[stageIndex] += r.amount;
    }
    this.t1Spend    += r.amount;
    this.totalSpend += r.amount;
    this.totalTxns++;
  }

  // ── Track 2: x402 data payment ────────────────────────────────────────────
  addApiEvent(
    r:         NanopaymentReceipt,
    sourceKey: string,
    mode:      'x402' | 'fallback' = 'fallback'
  ) {
    r.source = sourceKey;
    r.mode   = mode;
    this.t2Events.unshift(r);
    if (this.t2Events.length > 100) this.t2Events.pop();
    if (!this.apiBreakdown[sourceKey]) {
      this.apiBreakdown[sourceKey] = { calls: 0, spend: 0, mode };
    }
    this.apiBreakdown[sourceKey].calls++;
    this.apiBreakdown[sourceKey].spend += r.amount;
    this.apiBreakdown[sourceKey].mode   = mode;
    this.t2Spend    += r.amount;
    this.totalSpend += r.amount;
    this.totalTxns++;
  }

  // ── Track 3: compute Nanopayment ──────────────────────────────────────────
  addComputeEvent(r: NanopaymentReceipt) {
    r.mode = 'nanopayment';
    this.t3Events.unshift(r);
    if (this.t3Events.length > 100) this.t3Events.pop();
    this.t3Spend    += r.amount;
    this.totalSpend += r.amount;
    this.totalTxns++;
  }

  // ── Reset per-cycle stage state ───────────────────────────────────────────
  resetCycleStages() {
    this.stageCounts = new Array(7).fill(0);
    this.stageSpend  = new Array(7).fill(0);
  }

  // ── Serialise for /api/billing ────────────────────────────────────────────
  toJSON() {
    return {
      // Track 1 — Circle Nanopayments
      t1Events:    this.t1Events.slice(0, 20),
      stageCounts: this.stageCounts,
      stageSpend:  this.stageSpend,
      t1Spend:     this.t1Spend,

      // Track 2 — x402 via Circle facilitator
      t2Events:    this.t2Events.slice(0, 20),
      apiBreakdown: this.apiBreakdown,
      t2Spend:     this.t2Spend,

      // Track 3 — Circle Nanopayments (compute)
      t3Events:    this.t3Events.slice(0, 20),
      t3Spend:     this.t3Spend,

      // Totals
      totalTxns:   this.totalTxns,
      totalSpend:  this.totalSpend,

      // Meta
      chain:           'Arc Testnet',
      product:         'Kairos',
      circleProducts:  ['Arc','USDC','Nanopayments','CircleWallets','x402'],
    };
  }
}

export const billingStore = new BillingStore();


// ───────────────────────────────────────────────────────────────────────────────
// FILE 4: src/dashboard/server.ts  (EDIT — add these lines)
// ───────────────────────────────────────────────────────────────────────────────

/*
// Add to imports at top of server.ts:
import { billingStore } from '../services/billing-store';
import path from 'path';

// Add these two routes alongside existing /api/* routes:

// NEW — Kairos billing data (feeds the /kairos dashboard)
app.get('/api/billing', (req, res) => {
  res.json(billingStore.toJSON());
});

// NEW — Kairos judge view
app.get('/kairos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kairos.html'));
});
*/


// ───────────────────────────────────────────────────────────────────────────────
// HOOK LOCATIONS — add to existing files
// ───────────────────────────────────────────────────────────────────────────────
//
// Pattern for DATA feeds (Track 2) — replace bare fetch with paidFetch:
//
//   BEFORE:  const data = await fetch(COINGECKO_URL).then(r => r.json());
//   AFTER:   const data = await paidFetch(COINGECKO_URL, {}, 'coingecko').then(r => r.json());
//
// That's the entire change for data feeds. paidFetch handles x402 attempt,
// Circle facilitator payment, fallback, and billing event in one call.
//
// ────────────────────────────────────────────────────────────────────────────


// ── src/data/live-price-feed.ts ──────────────────────────────────────────────
// Add import:
//   import { paidFetch } from '../services/x402-client';
//
// Replace CoinGecko fetch:
//   const res = await paidFetch(COINGECKO_URL, {}, 'coingecko');
//   const data = await res.json();


// ── src/data/kraken-feed.ts ───────────────────────────────────────────────────
// Add import:
//   import { paidFetch } from '../services/x402-client';
//
// Replace Kraken ticker fetch:
//   const res = await paidFetch(KRAKEN_URL, {}, 'kraken');
//   const data = await res.json();


// ── src/data/sentiment-feed.ts ────────────────────────────────────────────────
// Add import:
//   import { paidFetch } from '../services/x402-client';
//
// Replace Fear & Greed fetch:
//   const fgRes = await paidFetch(FEAR_GREED_URL, {}, 'feargreed');
//
// Replace Alpha Vantage fetch:
//   const avRes = await paidFetch(ALPHA_VANTAGE_URL, {}, 'alphavantage');


// ── src/data/prism-feed.ts ────────────────────────────────────────────────────
// Add import:
//   import { paidFetch } from '../services/x402-client';
//
// Replace PRISM fetch:
//   const prismRes = await paidFetch(PRISM_URL, { headers: { 'X-API-Key': process.env.PRISM_API_KEY } }, 'prism');


// ── GOVERNANCE HOOKS (Track 1) — same pattern as before ──────────────────────
// Add to top of each governance file:
//   import { billEvent } from '../services/nanopayments';
//   import { billingStore } from '../services/billing-store';
//
// src/chain/agent-mandate.ts — at END of checkMandate(), before return:
/*
try {
  billingStore.addGovernanceEvent(
    await billEvent('governance-mandate', { type:'governance', mode:'nanopayment' }), 0
  );
} catch(e) { logger.warn('[Kairos]', e); }
return result;
*/

// src/security/oracle-integrity.ts — at END of checkOracleIntegrity(), before return:
/*
try {
  billingStore.addGovernanceEvent(
    await billEvent('governance-oracle', { type:'governance', mode:'nanopayment' }), 1
  );
} catch(e) { logger.warn('[Kairos]', e); }
return result;
*/

// src/chain/execution-simulator.ts — at END of simulate(), before return:
/*
try {
  billingStore.addGovernanceEvent(
    await billEvent('governance-simulation', { type:'governance', mode:'nanopayment' }), 2
  );
} catch(e) { logger.warn('[Kairos]', e); }
return result;
*/

// src/agent/supervisory-meta-agent.ts — at END of evaluate(), before return:
/*
try {
  billingStore.addGovernanceEvent(
    await billEvent('governance-supervisory', { type:'governance', mode:'nanopayment' }), 3
  );
} catch(e) { logger.warn('[Kairos]', e); }
return decision;
*/

// src/chain/risk-router.ts — after submitTradeIntent() confirms:
/*
try {
  billingStore.addGovernanceEvent(
    await billEvent('governance-risk-router', { type:'governance', mode:'nanopayment' }), 4
  );
} catch(e) { logger.warn('[Kairos]', e); }
return result;
*/

// ── COMPUTE HOOKS (Track 3) ───────────────────────────────────────────────────

// src/strategy/ai-reasoning.ts — after each LLM call:
/*
// After Claude call:
try { billingStore.addComputeEvent(await billEvent('compute-llm', { model:'Claude (Primary)', type:'inference', mode:'nanopayment' })); } catch(e) {}

// After Gemini fallback:
try { billingStore.addComputeEvent(await billEvent('compute-llm', { model:'Gemini 2.5 Pro', type:'inference', mode:'nanopayment' })); } catch(e) {}

// After OpenAI fallback:
try { billingStore.addComputeEvent(await billEvent('compute-llm', { model:'OpenAI (Fallback)', type:'inference', mode:'nanopayment' })); } catch(e) {}
*/

// src/strategy/ace-engine.ts — at END of reflect():
/*
try { billingStore.addComputeEvent(await billEvent('compute-sage', { model:'SAGE (Gemini 2.5 Pro)', type:'reflection', mode:'nanopayment' })); } catch(e) {}
*/

// ── ARTIFACT HOOK ─────────────────────────────────────────────────────────────

// src/trust/artifact-emitter.ts — add to artifact payload before IPFS upload:
/*
import { billingStore } from '../services/billing-store';

// Inside buildArtifact(), add this field:
kairosArcBilling: {
  totalUsdc:       billingStore.totalSpend,
  totalEvents:     billingStore.totalTxns,
  t1Spend:         billingStore.t1Spend,   // governance
  t2Spend:         billingStore.t2Spend,   // data APIs
  t3Spend:         billingStore.t3Spend,   // compute
  arcTxHashes:     [
    ...billingStore.t1Events,
    ...billingStore.t2Events,
    ...billingStore.t3Events,
  ].map(e => e.txHash).filter(h => !h.startsWith('pending_')),
  circleProducts:  ['Arc','USDC','Nanopayments','CircleWallets','x402'],
  x402Mode:        'Circle facilitator — buyer side',
  chain:           'Arc Testnet',
},
*/

