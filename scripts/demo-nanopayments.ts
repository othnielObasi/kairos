#!/usr/bin/env tsx
/**
 * Kairos — Nanopayments Demo (50+ On-Chain Transactions on Arc)
 *
 * Simulates N agent cycles, each producing real USDC micro-transfers on
 * Arc testnet for every governance stage and compute event.
 *
 * Per cycle the agent executes:
 *   Track 1 — Governance stages (5 nanopayments):
 *     0. Mandate check               $0.001
 *     1. Oracle integrity             $0.001
 *     2. Execution simulator          $0.001
 *     3. Supervisory meta-agent       $0.001
 *     4. Risk router / on-chain       $0.001
 *
 *   Track 3 — Compute billing (1–3 nanopayments):
 *     5. LLM reasoning inference      $0.001
 *     6. SAGE reflection (periodic)   $0.001
 *
 *   Track 2 — x402 data APIs (2–4 payments):
 *     Handled by normalisation layer via AIsa endpoints
 *
 * At ~8 nanopayments per cycle, 7 cycles clears the 50-txn threshold.
 *
 * Usage:
 *   npx tsx scripts/demo-nanopayments.ts              # 10 cycles (default)
 *   npx tsx scripts/demo-nanopayments.ts --cycles 15  # custom cycle count
 *   npx tsx scripts/demo-nanopayments.ts --fast       # skip delays
 *
 * Required env:
 *   OWS_MNEMONIC or PRIVATE_KEY   — signer for Arc transactions
 *   GOVERNANCE_BILLING_ADDRESS    — recipient (can be same wallet for demo)
 *
 * Optional env:
 *   CIRCLE_API_KEY + CIRCLE_WALLET_ID + CIRCLE_ENTITY_SECRET
 *     → uses Circle Wallets instead of EOA
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { billEvent, NANO_AMOUNT } from '../src/services/nanopayments.js';
import type { NanopaymentReceipt } from '../src/services/nanopayments.js';

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const cycleCount = parseInt(args.find((_, i, a) => a[i - 1] === '--cycles') || '10');
const fast = args.includes('--fast');

// ── Event definitions ────────────────────────────────────────────────────────

interface DemoEvent {
  name: string;
  track: 1 | 2 | 3;
  type: 'governance' | 'data' | 'inference' | 'reflection';
  stage?: number;         // governance stage index 0–4
  model?: string;         // for compute events
  probability?: number;   // probability of firing (1.0 = always)
}

const CYCLE_EVENTS: DemoEvent[] = [
  // Track 1 — Governance nanopayments (always fire)
  { name: 'governance-mandate',      track: 1, type: 'governance', stage: 0 },
  { name: 'governance-oracle',       track: 1, type: 'governance', stage: 1 },
  { name: 'governance-simulation',   track: 1, type: 'governance', stage: 2 },
  { name: 'governance-supervisory',  track: 1, type: 'governance', stage: 3 },
  { name: 'governance-risk-router',  track: 1, type: 'governance', stage: 4 },

  // Track 3 — Compute billing (LLM always, SAGE periodic)
  { name: 'compute-llm',            track: 3, type: 'inference', model: 'claude-sonnet-4' },
  { name: 'compute-sage-reflection', track: 3, type: 'reflection', model: 'gemini-2.5-pro', probability: 0.3 },

  // Track 2 — data billing (simulated — real x402 requires AISA_BASE_URL)
  { name: 'data-coingecko',         track: 2, type: 'data' },
  { name: 'data-kraken',            track: 2, type: 'data' },
  { name: 'data-feargreed',         track: 2, type: 'data', probability: 0.8 },
  { name: 'data-alphavantage',      track: 2, type: 'data', probability: 0.8 },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Kairos — Nanopayments Demo on Arc Testnet                  ║');
  console.log('║  Real USDC micro-transfers · $0.001 per event               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Cycles:        ${cycleCount}`);
  console.log(`  Amount/event:  $${NANO_AMOUNT} USDC`);
  console.log(`  Chain:         Arc Testnet (5042002)`);
  console.log(`  RPC:           ${process.env.OWS_RPC_URL || 'https://rpc.testnet.arc.network'}`);
  console.log(`  Signer:        ${process.env.CIRCLE_API_KEY ? 'Circle Wallets' : process.env.OWS_MNEMONIC ? 'Mnemonic (EOA)' : process.env.PRIVATE_KEY ? 'Private Key (EOA)' : 'NONE — will fail'}`);
  console.log(`  Billing addr:  ${process.env.GOVERNANCE_BILLING_ADDRESS || process.env.AGENT_WALLET_ADDRESS || '(not set)'}`);
  console.log();

  const allReceipts: NanopaymentReceipt[] = [];
  const trackTotals = { 1: 0, 2: 0, 3: 0 };
  let realTxCount = 0;
  let pendingCount = 0;
  let totalSpend = 0;

  for (let cycle = 1; cycle <= cycleCount; cycle++) {
    const cycleStart = Date.now();
    const cycleReceipts: NanopaymentReceipt[] = [];
    console.log(`\n── Cycle ${cycle}/${cycleCount} ──────────────────────────────────`);

    for (const event of CYCLE_EVENTS) {
      // Probabilistic events (SAGE reflection, some data feeds)
      if (event.probability && Math.random() > event.probability) continue;

      const receipt = await billEvent(event.name, {
        type:   event.type,
        model:  event.model,
        source: event.name,
      });

      cycleReceipts.push(receipt);
      allReceipts.push(receipt);
      trackTotals[event.track]++;
      totalSpend += receipt.amount;

      const isReal = !receipt.txHash.startsWith('pending_');
      if (isReal) realTxCount++;
      else pendingCount++;

      const shortHash = isReal
        ? receipt.txHash.slice(0, 10) + '…' + receipt.txHash.slice(-6)
        : receipt.txHash;
      const trackLabel = `T${event.track}`;
      const costStr = `$${receipt.amount.toFixed(4)}`;
      console.log(`  ${trackLabel} ${isReal ? '✓' : '✗'} ${event.name.padEnd(28)} ${costStr}  ${shortHash}`);

      // Small delay between transactions to avoid nonce collisions
      if (!fast) await delay(800);
    }

    const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
    console.log(`  → ${cycleReceipts.length} events · ${elapsed}s · running total: ${realTxCount} real / ${pendingCount} pending`);

    // Inter-cycle delay
    if (!fast && cycle < cycleCount) await delay(1500);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Demo Complete — Summary                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Total events:     ${allReceipts.length}`);
  console.log(`  Real on-chain:    ${realTxCount}  ${realTxCount >= 50 ? '✓ (≥50 requirement met)' : '✗ (below 50 threshold)'}`);
  console.log(`  Pending/failed:   ${pendingCount}`);
  console.log(`  Total spend:      $${totalSpend.toFixed(4)} USDC`);
  console.log();
  console.log(`  Track 1 (governance):  ${trackTotals[1]} events`);
  console.log(`  Track 2 (data API):    ${trackTotals[2]} events`);
  console.log(`  Track 3 (compute):     ${trackTotals[3]} events`);
  console.log();

  // Output all real transaction hashes for block explorer verification
  const realTxHashes = allReceipts
    .filter(r => !r.txHash.startsWith('pending_'))
    .map(r => r.txHash);

  if (realTxHashes.length > 0) {
    console.log('  Arc Block Explorer links:');
    const unique = [...new Set(realTxHashes)];
    for (const hash of unique.slice(0, 10)) {
      console.log(`    https://testnet.arcscan.io/tx/${hash}`);
    }
    if (unique.length > 10) {
      console.log(`    ... and ${unique.length - 10} more`);
    }
    console.log();

    // Write transaction log for submission proof
    const logPath = '.kairos/demo-tx-log.json';
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync('.kairos', { recursive: true });
    writeFileSync(logPath, JSON.stringify({
      timestamp:    new Date().toISOString(),
      chain:        'Arc Testnet (5042002)',
      rpc:          process.env.OWS_RPC_URL || 'https://rpc.testnet.arc.network',
      cycles:       cycleCount,
      totalEvents:  allReceipts.length,
      realTxCount,
      pendingCount,
      totalSpendUSDC: totalSpend,
      amountPerEvent: NANO_AMOUNT,
      trackBreakdown: trackTotals,
      transactions: allReceipts.map(r => ({
        event:  r.eventName,
        type:   r.type,
        mode:   r.mode,
        txHash: r.txHash,
        amount: r.amount,
        time:   r.confirmedAt,
      })),
    }, null, 2));
    console.log(`  Transaction log saved: ${logPath}`);
  }

  // Margin explanation
  console.log();
  console.log('  ── Margin Explanation ─────────────────────────────────────');
  console.log('  On Ethereum mainnet:');
  console.log(`    Gas per ERC-20 transfer:  ~65,000 gas`);
  console.log(`    At 30 gwei + $2,500 ETH:  ~$4.88 per transfer`);
  console.log(`    ${realTxCount} transfers would cost:  ~$${(realTxCount * 4.88).toFixed(2)}`);
  console.log('  On Arc Testnet:');
  console.log(`    Cost per nanopayment:     $${NANO_AMOUNT} USDC (gas-free via Circle)`);
  console.log(`    ${realTxCount} transfers cost:        $${totalSpend.toFixed(4)} USDC`);
  console.log(`    Savings:                  ${((realTxCount * 4.88) / Math.max(totalSpend, 0.001) * 100).toFixed(0)}% reduction`);
  console.log('  Conclusion: This per-action billing model is structurally');
  console.log('  impossible on traditional gas chains where fees exceed the');
  console.log('  payment amount by 4,880×.');
  console.log();

  process.exit(realTxCount >= 50 ? 0 : 1);
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
