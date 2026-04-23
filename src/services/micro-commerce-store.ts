import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { hasVerifiedTxHash, type NanopaymentReceipt } from './nanopayments.js';
import { ensureCommerceDocumentBundle } from './commerce-documents.js';

const STATE_DIR = join(process.cwd(), '.kairos');
const LOG_FILE = join(STATE_DIR, 'micro-commerce.jsonl');
const MAX_EVENTS = 200;

export type MicroCommerceStatus = 'confirmed' | 'pending' | 'fallback';

export interface MicroCommerceEvent {
  id: string;
  timestamp: string;
  item: string;
  buyer: string;
  seller: string;
  trigger: string;
  description: string;
  checkpointId: number | null;
  amountUsdc: number;
  settlementMode: string;
  status: MicroCommerceStatus;
  txHash: string | null;
  referenceId: string | null;
  explorerUrl: string | null;
}

const events: MicroCommerceEvent[] = [];
let counter = 0;
let loaded = false;

function statusForReceipt(receipt: NanopaymentReceipt): MicroCommerceStatus {
  if (hasVerifiedTxHash(receipt)) return 'confirmed';
  if (receipt.verificationState === 'fallback' || receipt.mode === 'fallback') return 'fallback';
  return 'pending';
}

function explorerUrl(txHash: string | null): string | null {
  return txHash ? `https://testnet.arcscan.app/tx/${txHash}` : null;
}

function loadEvents(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(LOG_FILE)) return;

  try {
    const rows = readFileSync(LOG_FILE, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as MicroCommerceEvent);

    events.unshift(...rows.slice(-MAX_EVENTS).reverse());
    counter = rows.length;
  } catch (error) {
    console.warn('[MICRO-COMMERCE] Failed to load persisted events:', (error as Error).message || error);
  }
}

function persistEvent(event: MicroCommerceEvent): void {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify(event) + '\n', 'utf-8');
  } catch (error) {
    console.warn('[MICRO-COMMERCE] Failed to persist event:', (error as Error).message || error);
  }
}

export function recordMicroCommerceEvent(
  receipt: NanopaymentReceipt,
  meta: {
    item: string;
    buyer?: string;
    seller?: string;
    trigger: string;
    description: string;
    checkpointId?: number | null;
    referenceNotionalUsd?: number | null;
    referenceCurrency?: string | null;
    deliverySummary?: string | null;
  },
): MicroCommerceEvent {
  loadEvents();
  counter += 1;

  const txHash = hasVerifiedTxHash(receipt) ? receipt.txHash : null;
  const event: MicroCommerceEvent = {
    id: `mc-${Date.now()}-${counter}`,
    timestamp: new Date(receipt.confirmedAt || Date.now()).toISOString(),
    item: meta.item,
    buyer: meta.buyer || 'Kairos agent',
    seller: meta.seller || 'Kairos proof marketplace',
    trigger: meta.trigger,
    description: meta.description,
    checkpointId: meta.checkpointId ?? null,
    amountUsdc: receipt.amount || 0,
    settlementMode: receipt.mode || 'nanopayment',
    status: statusForReceipt(receipt),
    txHash,
    referenceId: receipt.referenceId || null,
    explorerUrl: explorerUrl(txHash),
  };

  events.unshift(event);
  if (events.length > MAX_EVENTS) events.pop();
  persistEvent(event);

  try {
    ensureCommerceDocumentBundle({
      eventId: event.id,
      checkpointId: event.checkpointId,
      createdAt: event.timestamp,
      buyer: event.buyer,
      seller: event.seller,
      item: event.item,
      trigger: event.trigger,
      description: event.description,
      referenceNotionalUsd: meta.referenceNotionalUsd ?? null,
      referenceCurrency: meta.referenceCurrency || 'USDC',
      deliverySummary: meta.deliverySummary || event.description,
      settlement: {
        amountUsdc: event.amountUsdc,
        status: event.status,
        mode: event.settlementMode,
        txHash: event.txHash,
        referenceId: event.referenceId,
        explorerUrl: event.explorerUrl,
      },
    });
  } catch (error) {
    console.warn('[MICRO-COMMERCE] Failed to create commerce documents:', (error as Error).message || error);
  }

  return event;
}

export function getMicroCommerceEvents(limit = 20): MicroCommerceEvent[] {
  loadEvents();
  for (const event of events) {
    try {
      ensureCommerceDocumentBundle({
        eventId: event.id,
        checkpointId: event.checkpointId,
        createdAt: event.timestamp,
        buyer: event.buyer,
        seller: event.seller,
        item: event.item,
        trigger: event.trigger,
        description: event.description,
        settlement: {
          amountUsdc: event.amountUsdc,
          status: event.status,
          mode: event.settlementMode,
          txHash: event.txHash,
          referenceId: event.referenceId,
          explorerUrl: event.explorerUrl,
        },
      });
    } catch (_) {}
  }
  return events.slice(0, Math.max(0, Math.min(limit, MAX_EVENTS)));
}

export function getMicroCommerceStats() {
  loadEvents();
  const confirmed = events.filter((event) => event.status === 'confirmed');
  const pending = events.filter((event) => event.status === 'pending');
  const fallback = events.filter((event) => event.status === 'fallback');
  const totalVolumeUsdc = events.reduce((sum, event) => sum + event.amountUsdc, 0);
  const confirmedVolumeUsdc = confirmed.reduce((sum, event) => sum + event.amountUsdc, 0);

  return {
    total: events.length,
    confirmed: confirmed.length,
    pending: pending.length,
    fallback: fallback.length,
    totalVolumeUsdc,
    confirmedVolumeUsdc,
    latest: events[0] ?? null,
  };
}
