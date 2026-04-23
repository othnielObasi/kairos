import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NanopaymentReceipt, hasVerifiedTxHash } from './nanopayments.js';
import {
  buildReceiptDocumentEventId,
  ensureReceiptDocumentBundle,
  listAllCommerceDocumentBundles,
  type CommerceDocumentBundle,
} from './commerce-documents.js';

const STATE_DIR = join(process.cwd(), '.kairos');
const SNAPSHOT_FILE = join(STATE_DIR, 'billing-store.json');
const MAX_EVENTS_PER_TRACK = 100;

const STAGE_NAMES = [
  'Mandate',
  'Oracle',
  'Simulator',
  'Supervisory',
  'Risk Router',
  'LLM Reasoning',
  'SAGE',
];

type ReceiptStatus = 'confirmed' | 'pending' | 'fallback';

interface BillingSnapshot {
  version: 1;
  t1Events: NanopaymentReceipt[];
  stageCounts: number[];
  stageRealCounts: number[];
  stagePendingCounts: number[];
  stageSpend: number[];
  t1Spend: number;
  t1RealTxns: number;
  t1PendingTxns: number;
  t2Events: NanopaymentReceipt[];
  apiBreakdown: ApiBreakdown;
  t2Spend: number;
  t2RealTxns: number;
  t2PendingTxns: number;
  t3Events: NanopaymentReceipt[];
  t3Spend: number;
  t3RealTxns: number;
  t3PendingTxns: number;
  totalTxns: number;
  totalEvents: number;
  pendingTxns: number;
  totalSpend: number;
  recentReceiptStates: Record<string, ReceiptStatus>;
}

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

function receiptStatus(receipt: NanopaymentReceipt): ReceiptStatus {
  if (isRealReceipt(receipt)) return 'confirmed';
  if (receipt.verificationState === 'fallback' || receipt.mode === 'fallback') return 'fallback';
  return 'pending';
}

function normalizeArray(values: number[] | undefined, length: number): number[] {
  const normalized = new Array(length).fill(0);
  for (let index = 0; index < length; index += 1) {
    const value = values?.[index];
    normalized[index] = Number.isFinite(value) ? Number(value) : 0;
  }
  return normalized;
}

function normalizeNumber(value: unknown): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function cloneReceipt(receipt: NanopaymentReceipt): NanopaymentReceipt {
  return {
    eventName: receipt.eventName,
    source: receipt.source,
    model: receipt.model,
    type: receipt.type,
    mode: receipt.mode,
    txHash: receipt.txHash,
    referenceId: receipt.referenceId,
    verificationState: receipt.verificationState,
    amount: receipt.amount,
    confirmedAt: receipt.confirmedAt,
  };
}

function normalizeApiBreakdown(breakdown: ApiBreakdown | undefined): ApiBreakdown {
  const snapshot: ApiBreakdown = {};

  for (const [sourceKey, info] of Object.entries(breakdown || {})) {
    snapshot[sourceKey] = {
      calls: normalizeNumber(info.calls),
      spend: normalizeNumber(info.spend),
      mode: info.mode === 'x402' ? 'x402' : 'fallback',
      realTxns: normalizeNumber(info.realTxns),
      pendingTxns: normalizeNumber(info.pendingTxns),
    };
  }

  return snapshot;
}

function eventNameFromBundle(bundle: CommerceDocumentBundle): string {
  if (bundle.trigger.startsWith('governance-')) return bundle.trigger.slice('governance-'.length);
  if (bundle.trigger.startsWith('api-')) return bundle.trigger.slice('api-'.length);
  if (bundle.trigger === 'sage-reflection') return 'compute-sage';
  if (bundle.trigger === 'runtime-inference') return 'compute-llm';
  return bundle.item || bundle.category || 'kairos-event';
}

function bundleReceipt(bundle: CommerceDocumentBundle): NanopaymentReceipt {
  const eventName = eventNameFromBundle(bundle);
  const txHash = bundle.settlement.txHash || `pending_${bundle.settlement.referenceId || bundle.eventId}`;
  const verificationState: ReceiptStatus = bundle.settlement.status === 'confirmed'
    ? 'confirmed'
    : bundle.settlement.status === 'fallback'
      ? 'fallback'
      : 'pending';

  return {
    eventName,
    source: bundle.seller || undefined,
    model: bundle.trackKey === 't3' ? bundle.seller || undefined : undefined,
    type: bundle.trackKey === 't1'
      ? 'governance'
      : bundle.trackKey === 't2'
        ? 'data'
        : bundle.trigger === 'sage-reflection'
          ? 'reflection'
          : 'inference',
    mode: bundle.settlement.mode || 'nanopayment',
    txHash,
    referenceId: bundle.settlement.referenceId || undefined,
    verificationState,
    amount: normalizeNumber(bundle.settlement.amountUsdc) || normalizeNumber(bundle.referenceNotionalUsd),
    confirmedAt: Date.parse(bundle.createdAt) || Date.now(),
  };
}

function governanceStageIndexFromBundle(bundle: CommerceDocumentBundle): number {
  const direct = STAGE_NAMES.indexOf(bundle.seller || '');
  if (direct >= 0) return direct;
  const itemMatch = STAGE_NAMES.findIndex((name) => (bundle.item || '').includes(name));
  return itemMatch;
}

function apiSourceKeyFromBundle(bundle: CommerceDocumentBundle): string {
  const eventName = eventNameFromBundle(bundle);
  if (eventName.startsWith('data-')) return eventName.slice('data-'.length);

  return (bundle.seller || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
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
  totalTxns = 0;
  totalEvents = 0;
  pendingTxns = 0;
  totalSpend = 0;

  private recentReceiptStates: Record<string, ReceiptStatus> = {};

  constructor() {
    this.hydrate();
  }

  private ensureStateDir() {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  }

  private computeStageIndex(receipt: NanopaymentReceipt): number {
    return receipt.type === 'reflection' || receipt.eventName.toLowerCase().includes('sage')
      ? 6
      : 5;
  }

  private eventKey(trackKey: 't1' | 't2' | 't3', receipt: NanopaymentReceipt): string {
    return buildReceiptDocumentEventId(trackKey, receipt);
  }

  private ensureApiBreakdownEntry(sourceKey: string, mode: 'x402' | 'fallback') {
    if (!this.apiBreakdown[sourceKey]) {
      this.apiBreakdown[sourceKey] = {
        calls: 0,
        spend: 0,
        mode,
        realTxns: 0,
        pendingTxns: 0,
      };
    }
  }

  private applyReceiptStatusDelta(
    track: 1 | 2 | 3,
    status: ReceiptStatus,
    delta: number,
    stageIndex?: number,
    sourceKey?: string,
  ) {
    if (status === 'confirmed') {
      this.totalTxns += delta;
      if (track === 1) this.t1RealTxns += delta;
      if (track === 2) this.t2RealTxns += delta;
      if (track === 3) this.t3RealTxns += delta;
      if (typeof stageIndex === 'number' && stageIndex >= 0 && stageIndex < this.stageRealCounts.length) {
        this.stageRealCounts[stageIndex] += delta;
      }
      if (track === 2 && sourceKey) {
        this.ensureApiBreakdownEntry(sourceKey, 'fallback');
        this.apiBreakdown[sourceKey].realTxns += delta;
      }
      return;
    }

    this.pendingTxns += delta;
    if (track === 1) this.t1PendingTxns += delta;
    if (track === 2) this.t2PendingTxns += delta;
    if (track === 3) this.t3PendingTxns += delta;
    if (typeof stageIndex === 'number' && stageIndex >= 0 && stageIndex < this.stagePendingCounts.length) {
      this.stagePendingCounts[stageIndex] += delta;
    }
    if (track === 2 && sourceKey) {
      this.ensureApiBreakdownEntry(sourceKey, 'fallback');
      this.apiBreakdown[sourceKey].pendingTxns += delta;
    }
  }

  private pushRecentEvent(trackKey: 't1' | 't2' | 't3', receipt: NanopaymentReceipt) {
    const target = trackKey === 't1'
      ? this.t1Events
      : trackKey === 't2'
        ? this.t2Events
        : this.t3Events;

    target.unshift(receipt);
    if (target.length > MAX_EVENTS_PER_TRACK) target.pop();
  }

  private snapshot(): BillingSnapshot {
    return {
      version: 1,
      t1Events: this.t1Events.map(cloneReceipt),
      stageCounts: [...this.stageCounts],
      stageRealCounts: [...this.stageRealCounts],
      stagePendingCounts: [...this.stagePendingCounts],
      stageSpend: [...this.stageSpend],
      t1Spend: this.t1Spend,
      t1RealTxns: this.t1RealTxns,
      t1PendingTxns: this.t1PendingTxns,
      t2Events: this.t2Events.map(cloneReceipt),
      apiBreakdown: normalizeApiBreakdown(this.apiBreakdown),
      t2Spend: this.t2Spend,
      t2RealTxns: this.t2RealTxns,
      t2PendingTxns: this.t2PendingTxns,
      t3Events: this.t3Events.map(cloneReceipt),
      t3Spend: this.t3Spend,
      t3RealTxns: this.t3RealTxns,
      t3PendingTxns: this.t3PendingTxns,
      totalTxns: this.totalTxns,
      totalEvents: this.totalEvents,
      pendingTxns: this.pendingTxns,
      totalSpend: this.totalSpend,
      recentReceiptStates: { ...this.recentReceiptStates },
    };
  }

  private persist() {
    try {
      this.ensureStateDir();
      writeFileSync(SNAPSHOT_FILE, JSON.stringify(this.snapshot(), null, 2), 'utf-8');
    } catch (error) {
      console.warn('[BILLING] Failed to persist billing snapshot:', (error as Error).message || error);
    }
  }

  private readSnapshot(): BillingSnapshot | null {
    if (!existsSync(SNAPSHOT_FILE)) return null;

    try {
      const parsed = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf-8')) as BillingSnapshot;
      if (parsed?.version !== 1) return null;
      return parsed;
    } catch (error) {
      console.warn('[BILLING] Failed to load billing snapshot:', (error as Error).message || error);
      return null;
    }
  }

  private applySnapshot(snapshot: BillingSnapshot) {
    this.t1Events = (snapshot.t1Events || []).map(cloneReceipt).slice(0, MAX_EVENTS_PER_TRACK);
    this.stageCounts = normalizeArray(snapshot.stageCounts, 7);
    this.stageRealCounts = normalizeArray(snapshot.stageRealCounts, 7);
    this.stagePendingCounts = normalizeArray(snapshot.stagePendingCounts, 7);
    this.stageSpend = normalizeArray(snapshot.stageSpend, 7);
    this.t1Spend = normalizeNumber(snapshot.t1Spend);
    this.t1RealTxns = normalizeNumber(snapshot.t1RealTxns);
    this.t1PendingTxns = normalizeNumber(snapshot.t1PendingTxns);

    this.t2Events = (snapshot.t2Events || []).map(cloneReceipt).slice(0, MAX_EVENTS_PER_TRACK);
    this.apiBreakdown = normalizeApiBreakdown(snapshot.apiBreakdown);
    this.t2Spend = normalizeNumber(snapshot.t2Spend);
    this.t2RealTxns = normalizeNumber(snapshot.t2RealTxns);
    this.t2PendingTxns = normalizeNumber(snapshot.t2PendingTxns);

    this.t3Events = (snapshot.t3Events || []).map(cloneReceipt).slice(0, MAX_EVENTS_PER_TRACK);
    this.t3Spend = normalizeNumber(snapshot.t3Spend);
    this.t3RealTxns = normalizeNumber(snapshot.t3RealTxns);
    this.t3PendingTxns = normalizeNumber(snapshot.t3PendingTxns);

    this.totalTxns = normalizeNumber(snapshot.totalTxns);
    this.totalEvents = normalizeNumber(snapshot.totalEvents);
    this.pendingTxns = normalizeNumber(snapshot.pendingTxns);
    this.totalSpend = normalizeNumber(snapshot.totalSpend);
    this.recentReceiptStates = { ...(snapshot.recentReceiptStates || this.buildRecentReceiptStates()) };
  }

  private backfillFromBundles() {
    const bundles = listAllCommerceDocumentBundles()
      .filter((bundle) => bundle.trackKey === 't1' || bundle.trackKey === 't2' || bundle.trackKey === 't3')
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    if (!bundles.length) return;

    for (const bundle of bundles) {
      const receipt = bundleReceipt(bundle);
      if (bundle.trackKey === 't1') {
        this.storeGovernanceEvent(receipt, governanceStageIndexFromBundle(bundle), false);
        continue;
      }
      if (bundle.trackKey === 't2') {
        this.storeApiEvent(receipt, apiSourceKeyFromBundle(bundle), bundle.settlement.mode === 'x402' ? 'x402' : 'fallback', false);
        continue;
      }
      this.storeComputeEvent(receipt, false);
    }

    this.persist();
  }

  private hydrate() {
    const snapshot = this.readSnapshot();
    if (snapshot) {
      this.applySnapshot(snapshot);
      return;
    }

    this.backfillFromBundles();
  }

  private buildRecentReceiptStates(): Record<string, ReceiptStatus> {
    const states: Record<string, ReceiptStatus> = {};

    for (const receipt of this.t1Events) states[this.eventKey('t1', receipt)] = receiptStatus(receipt);
    for (const receipt of this.t2Events) states[this.eventKey('t2', receipt)] = receiptStatus(receipt);
    for (const receipt of this.t3Events) states[this.eventKey('t3', receipt)] = receiptStatus(receipt);

    return states;
  }

  private reconcileRecentReceiptTransitions() {
    let dirty = false;
    const nextStates: Record<string, ReceiptStatus> = {};
    const scan = (trackKey: 't1' | 't2' | 't3', receipts: NanopaymentReceipt[]) => {
      for (const receipt of receipts) {
        const key = this.eventKey(trackKey, receipt);
        const current = receiptStatus(receipt);
        const previous = this.recentReceiptStates[key];
        nextStates[key] = current;

        if (!previous || previous === current) continue;

        if (trackKey === 't1') {
          const stageIndex = STAGE_NAMES.indexOf(receipt.source || '');
          this.applyReceiptStatusDelta(1, previous, -1, stageIndex);
          this.applyReceiptStatusDelta(1, current, 1, stageIndex);
          ensureReceiptDocumentBundle('t1', receipt);
        } else if (trackKey === 't2') {
          const sourceKey = receipt.source || 'unknown';
          this.ensureApiBreakdownEntry(sourceKey, receipt.mode === 'x402' ? 'x402' : 'fallback');
          this.applyReceiptStatusDelta(2, previous, -1, undefined, sourceKey);
          this.applyReceiptStatusDelta(2, current, 1, undefined, sourceKey);
          ensureReceiptDocumentBundle('t2', receipt);
        } else {
          const stageIndex = this.computeStageIndex(receipt);
          this.applyReceiptStatusDelta(3, previous, -1, stageIndex);
          this.applyReceiptStatusDelta(3, current, 1, stageIndex);
          ensureReceiptDocumentBundle('t3', receipt);
        }

        dirty = true;
      }
    };

    scan('t1', this.t1Events);
    scan('t2', this.t2Events);
    scan('t3', this.t3Events);

    const keysChanged = Object.keys(nextStates).length !== Object.keys(this.recentReceiptStates).length
      || Object.entries(nextStates).some(([key, value]) => this.recentReceiptStates[key] !== value);

    this.recentReceiptStates = nextStates;
    if (dirty || keysChanged) this.persist();
  }

  private storeGovernanceEvent(receipt: NanopaymentReceipt, stageIndex: number, persistState: boolean) {
    receipt.source = STAGE_NAMES[stageIndex] || receipt.source || 'Kairos';
    receipt.mode = receipt.mode || 'nanopayment';
    this.pushRecentEvent('t1', receipt);
    ensureReceiptDocumentBundle('t1', receipt);

    if (stageIndex >= 0 && stageIndex < this.stageCounts.length) {
      this.stageCounts[stageIndex] += 1;
      this.stageSpend[stageIndex] += receipt.amount;
    }

    this.t1Spend += receipt.amount;
    this.totalSpend += receipt.amount;
    this.totalEvents += 1;
    this.applyReceiptStatusDelta(1, receiptStatus(receipt), 1, stageIndex);
    this.recentReceiptStates[this.eventKey('t1', receipt)] = receiptStatus(receipt);

    if (persistState) this.persist();
  }

  private storeApiEvent(
    receipt: NanopaymentReceipt,
    sourceKey: string,
    mode: 'x402' | 'fallback',
    persistState: boolean,
  ) {
    receipt.source = sourceKey;
    receipt.mode = mode;
    this.pushRecentEvent('t2', receipt);
    ensureReceiptDocumentBundle('t2', receipt);

    this.ensureApiBreakdownEntry(sourceKey, mode);
    this.apiBreakdown[sourceKey].calls += 1;
    this.apiBreakdown[sourceKey].spend += receipt.amount;
    this.apiBreakdown[sourceKey].mode = mode;

    this.t2Spend += receipt.amount;
    this.totalSpend += receipt.amount;
    this.totalEvents += 1;
    this.applyReceiptStatusDelta(2, receiptStatus(receipt), 1, undefined, sourceKey);
    this.recentReceiptStates[this.eventKey('t2', receipt)] = receiptStatus(receipt);

    if (persistState) this.persist();
  }

  private storeComputeEvent(receipt: NanopaymentReceipt, persistState: boolean) {
    receipt.mode = receipt.mode || 'nanopayment';
    this.pushRecentEvent('t3', receipt);
    ensureReceiptDocumentBundle('t3', receipt);

    const stageIndex = this.computeStageIndex(receipt);
    this.stageCounts[stageIndex] += 1;
    this.stageSpend[stageIndex] += receipt.amount;

    this.t3Spend += receipt.amount;
    this.totalSpend += receipt.amount;
    this.totalEvents += 1;
    this.applyReceiptStatusDelta(3, receiptStatus(receipt), 1, stageIndex);
    this.recentReceiptStates[this.eventKey('t3', receipt)] = receiptStatus(receipt);

    if (persistState) this.persist();
  }

  addGovernanceEvent(receipt: NanopaymentReceipt, stageIndex: number) {
    this.storeGovernanceEvent(receipt, stageIndex, true);
  }

  addApiEvent(receipt: NanopaymentReceipt, sourceKey: string, mode: 'x402' | 'fallback' = 'fallback') {
    this.storeApiEvent(receipt, sourceKey, mode, true);
  }

  addComputeEvent(receipt: NanopaymentReceipt) {
    this.storeComputeEvent(receipt, true);
  }

  resetCycleStages() {
    this.stageCounts = new Array(7).fill(0);
    this.stageRealCounts = new Array(7).fill(0);
    this.stagePendingCounts = new Array(7).fill(0);
    this.stageSpend = new Array(7).fill(0);
    this.persist();
  }

  toJSON() {
    this.reconcileRecentReceiptTransitions();

    return {
      t1Events: this.t1Events.slice(0, 20),
      stageCounts: [...this.stageCounts],
      stageRealCounts: [...this.stageRealCounts],
      stagePendingCounts: [...this.stagePendingCounts],
      stageSpend: [...this.stageSpend],
      t1Spend: this.t1Spend,
      t1RealTxns: this.t1RealTxns,
      t1PendingTxns: this.t1PendingTxns,

      t2Events: this.t2Events.slice(0, 20),
      apiBreakdown: normalizeApiBreakdown(this.apiBreakdown),
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
