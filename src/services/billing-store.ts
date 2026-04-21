import { NanopaymentReceipt } from './nanopayments.js';

const STAGE_NAMES = [
  'Mandate',
  'Oracle',
  'Simulator',
  'Supervisory',
  'Risk Router',
  'LLM Reasoning',
  'SAGE',
];

export interface ApiBreakdown {
  [key: string]: {
    calls: number;
    spend: number;
    mode: 'x402' | 'fallback';
    realTxns: number;
    pendingTxns: number;
  };
}

function isRealReceipt(receipt: NanopaymentReceipt): boolean {
  return typeof receipt.txHash === 'string' && !receipt.txHash.startsWith('pending_');
}

class BillingStore {
  // Track 1 - governance nanopayments
  t1Events: NanopaymentReceipt[] = [];
  stageCounts: number[] = new Array(7).fill(0);
  stageRealCounts: number[] = new Array(7).fill(0);
  stagePendingCounts: number[] = new Array(7).fill(0);
  stageSpend: number[] = new Array(7).fill(0);
  t1Spend = 0;
  t1RealTxns = 0;
  t1PendingTxns = 0;

  // Track 2 - paid API access
  t2Events: NanopaymentReceipt[] = [];
  apiBreakdown: ApiBreakdown = {};
  t2Spend = 0;
  t2RealTxns = 0;
  t2PendingTxns = 0;

  // Track 3 - compute billing
  t3Events: NanopaymentReceipt[] = [];
  t3Spend = 0;
  t3RealTxns = 0;
  t3PendingTxns = 0;

  // Totals
  totalTxns = 0; // real on-chain receipts only
  totalEvents = 0;
  pendingTxns = 0;
  totalSpend = 0;

  private recordReceipt(track: 1 | 2 | 3, receipt: NanopaymentReceipt, stageIndex?: number) {
    this.totalEvents++;
    const real = isRealReceipt(receipt);

    if (real) {
      this.totalTxns++;
      if (track === 1) this.t1RealTxns++;
      if (track === 2) this.t2RealTxns++;
      if (track === 3) this.t3RealTxns++;
      if (track === 1 && typeof stageIndex === 'number' && stageIndex >= 0 && stageIndex < this.stageRealCounts.length) {
        this.stageRealCounts[stageIndex]++;
      }
      return;
    }

    this.pendingTxns++;
    if (track === 1) this.t1PendingTxns++;
    if (track === 2) this.t2PendingTxns++;
    if (track === 3) this.t3PendingTxns++;
    if (track === 1 && typeof stageIndex === 'number' && stageIndex >= 0 && stageIndex < this.stagePendingCounts.length) {
      this.stagePendingCounts[stageIndex]++;
    }
  }

  addGovernanceEvent(receipt: NanopaymentReceipt, stageIndex: number) {
    receipt.source = STAGE_NAMES[stageIndex];
    receipt.mode = 'nanopayment';
    this.t1Events.unshift(receipt);
    if (this.t1Events.length > 100) this.t1Events.pop();

    if (stageIndex >= 0 && stageIndex < 7) {
      this.stageCounts[stageIndex]++;
      this.stageSpend[stageIndex] += receipt.amount;
    }

    this.t1Spend += receipt.amount;
    this.totalSpend += receipt.amount;
    this.recordReceipt(1, receipt, stageIndex);
  }

  addApiEvent(receipt: NanopaymentReceipt, sourceKey: string, mode: 'x402' | 'fallback' = 'fallback') {
    receipt.source = sourceKey;
    receipt.mode = mode;
    this.t2Events.unshift(receipt);
    if (this.t2Events.length > 100) this.t2Events.pop();

    if (!this.apiBreakdown[sourceKey]) {
      this.apiBreakdown[sourceKey] = {
        calls: 0,
        spend: 0,
        mode,
        realTxns: 0,
        pendingTxns: 0,
      };
    }

    this.apiBreakdown[sourceKey].calls++;
    this.apiBreakdown[sourceKey].spend += receipt.amount;
    this.apiBreakdown[sourceKey].mode = mode;
    if (isRealReceipt(receipt)) this.apiBreakdown[sourceKey].realTxns++;
    else this.apiBreakdown[sourceKey].pendingTxns++;

    this.t2Spend += receipt.amount;
    this.totalSpend += receipt.amount;
    this.recordReceipt(2, receipt);
  }

  addComputeEvent(receipt: NanopaymentReceipt) {
    receipt.mode = 'nanopayment';
    this.t3Events.unshift(receipt);
    if (this.t3Events.length > 100) this.t3Events.pop();

    this.t3Spend += receipt.amount;
    this.totalSpend += receipt.amount;
    this.recordReceipt(3, receipt);
  }

  resetCycleStages() {
    this.stageCounts = new Array(7).fill(0);
    this.stageRealCounts = new Array(7).fill(0);
    this.stagePendingCounts = new Array(7).fill(0);
    this.stageSpend = new Array(7).fill(0);
  }

  toJSON() {
    return {
      t1Events: this.t1Events.slice(0, 20),
      stageCounts: this.stageCounts,
      stageRealCounts: this.stageRealCounts,
      stagePendingCounts: this.stagePendingCounts,
      stageSpend: this.stageSpend,
      t1Spend: this.t1Spend,
      t1RealTxns: this.t1RealTxns,
      t1PendingTxns: this.t1PendingTxns,

      t2Events: this.t2Events.slice(0, 20),
      apiBreakdown: this.apiBreakdown,
      t2Spend: this.t2Spend,
      t2RealTxns: this.t2RealTxns,
      t2PendingTxns: this.t2PendingTxns,

      t3Events: this.t3Events.slice(0, 20),
      t3Spend: this.t3Spend,
      t3RealTxns: this.t3RealTxns,
      t3PendingTxns: this.t3PendingTxns,

      totalTxns: this.totalTxns,
      realTxns: this.totalTxns,
      totalEvents: this.totalEvents,
      pendingTxns: this.pendingTxns,
      totalSpend: this.totalSpend,
      txnRequirementTarget: 50,
      meetsTxnRequirement: this.totalTxns >= 50,

      chain: 'Arc Testnet',
      product: 'Kairos',
      circleProducts: ['Arc', 'USDC', 'Nanopayments', 'CircleWallets', 'x402'],
    };
  }
}

export const billingStore = new BillingStore();
