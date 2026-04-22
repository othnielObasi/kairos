import { NanopaymentReceipt, hasVerifiedTxHash } from './nanopayments.js';

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
  return hasVerifiedTxHash(receipt);
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
    receipt.mode = receipt.mode || 'nanopayment';
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
    receipt.mode = receipt.mode || 'nanopayment';
    this.t3Events.unshift(receipt);
    if (this.t3Events.length > 100) this.t3Events.pop();

    this.t3Spend += receipt.amount;
    this.totalSpend += receipt.amount;
    this.recordReceipt(3, receipt);
  }

  private countReceipts(receipts: NanopaymentReceipt[]) {
    const realTxns = receipts.filter(isRealReceipt).length;
    return {
      realTxns,
      pendingTxns: receipts.length - realTxns,
    };
  }

  private buildStageVerificationCounts() {
    const stageRealCounts = new Array(7).fill(0);
    const stagePendingCounts = new Array(7).fill(0);

    for (const receipt of this.t1Events) {
      const stageIndex = STAGE_NAMES.indexOf(receipt.source || '');
      if (stageIndex < 0) continue;
      if (isRealReceipt(receipt)) stageRealCounts[stageIndex]++;
      else stagePendingCounts[stageIndex]++;
    }

    return { stageRealCounts, stagePendingCounts };
  }

  private buildApiBreakdownSnapshot(): ApiBreakdown {
    const snapshot: ApiBreakdown = {};

    for (const [sourceKey, info] of Object.entries(this.apiBreakdown)) {
      snapshot[sourceKey] = {
        calls: info.calls,
        spend: info.spend,
        mode: info.mode,
        realTxns: 0,
        pendingTxns: 0,
      };
    }

    for (const receipt of this.t2Events) {
      const sourceKey = receipt.source || 'unknown';
      if (!snapshot[sourceKey]) {
        snapshot[sourceKey] = {
          calls: 0,
          spend: 0,
          mode: receipt.mode === 'x402' ? 'x402' : 'fallback',
          realTxns: 0,
          pendingTxns: 0,
        };
      }

      if (isRealReceipt(receipt)) snapshot[sourceKey].realTxns++;
      else snapshot[sourceKey].pendingTxns++;
    }

    return snapshot;
  }

  resetCycleStages() {
    this.stageCounts = new Array(7).fill(0);
    this.stageRealCounts = new Array(7).fill(0);
    this.stagePendingCounts = new Array(7).fill(0);
    this.stageSpend = new Array(7).fill(0);
  }

  toJSON() {
    const t1Counts = this.countReceipts(this.t1Events);
    const t2Counts = this.countReceipts(this.t2Events);
    const t3Counts = this.countReceipts(this.t3Events);
    const { stageRealCounts, stagePendingCounts } = this.buildStageVerificationCounts();
    const apiBreakdown = this.buildApiBreakdownSnapshot();
    const totalTxns = t1Counts.realTxns + t2Counts.realTxns + t3Counts.realTxns;
    const pendingTxns = t1Counts.pendingTxns + t2Counts.pendingTxns + t3Counts.pendingTxns;
    const totalEvents = this.t1Events.length + this.t2Events.length + this.t3Events.length;

    return {
      t1Events: this.t1Events.slice(0, 20),
      stageCounts: this.stageCounts,
      stageRealCounts,
      stagePendingCounts,
      stageSpend: this.stageSpend,
      t1Spend: this.t1Spend,
      t1RealTxns: t1Counts.realTxns,
      t1PendingTxns: t1Counts.pendingTxns,

      t2Events: this.t2Events.slice(0, 20),
      apiBreakdown,
      t2Spend: this.t2Spend,
      t2RealTxns: t2Counts.realTxns,
      t2PendingTxns: t2Counts.pendingTxns,

      t3Events: this.t3Events.slice(0, 20),
      t3Spend: this.t3Spend,
      t3RealTxns: t3Counts.realTxns,
      t3PendingTxns: t3Counts.pendingTxns,

      totalTxns,
      realTxns: totalTxns,
      totalEvents,
      pendingTxns,
      totalSpend: this.totalSpend,
      txnRequirementTarget: 50,
      meetsTxnRequirement: totalTxns >= 50,

      chain: 'Arc Testnet',
      product: 'Kairos',
      circleProducts: ['Arc', 'USDC', 'Nanopayments', 'CircleWallets', 'x402'],
    };
  }
}

export const billingStore = new BillingStore();
