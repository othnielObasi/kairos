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

