// FILE 3: src/services/billing-store.ts  (NEW)
// ───────────────────────────────────────────────────────────────────────────────

import { NanopaymentReceipt } from './nanopayments.js';

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
