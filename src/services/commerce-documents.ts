import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { hasVerifiedTxHash, type NanopaymentReceipt } from './nanopayments.js';

const STATE_DIR = join(process.cwd(), '.kairos');
const DOC_DIR = join(STATE_DIR, 'commerce-documents');
const MAX_BUNDLES = 500;

export type CommerceDocumentKind = 'invoice' | 'receipt' | 'delivery-proof';
export type DocumentTrackKey = 't1' | 't2' | 't3' | 't4';
export type DocumentBundleType = 'governance' | 'api-usage' | 'compute' | 'micro-commerce';

export interface CommerceDocumentLinks {
  invoiceUrl: string;
  receiptUrl: string;
  deliveryProofUrl: string;
}

export interface CommerceDocumentBundle {
  eventId: string;
  trackKey: DocumentTrackKey;
  trackLabel: string;
  category: string;
  bundleType: DocumentBundleType;
  checkpointId: number | null;
  createdAt: string;
  buyer: string;
  seller: string;
  item: string;
  trigger: string;
  description: string;
  referenceNotionalUsd: number | null;
  referenceCurrency: string | null;
  deliverySummary: string;
  settlement: {
    amountUsdc: number;
    status: string;
    mode: string;
    txHash: string | null;
    referenceId: string | null;
    explorerUrl: string | null;
  };
  documents: CommerceDocumentLinks;
}

export interface CommerceDocumentSeed {
  eventId: string;
  trackKey?: DocumentTrackKey | null;
  trackLabel?: string | null;
  category?: string | null;
  bundleType?: DocumentBundleType | null;
  checkpointId?: number | null;
  createdAt?: string | null;
  buyer?: string | null;
  seller?: string | null;
  item: string;
  trigger: string;
  description: string;
  referenceNotionalUsd?: number | null;
  referenceCurrency?: string | null;
  deliverySummary?: string | null;
  settlement: {
    amountUsdc?: number | null;
    status?: string | null;
    mode?: string | null;
    txHash?: string | null;
    referenceId?: string | null;
    explorerUrl?: string | null;
  };
}

export interface CommerceDocumentLookup {
  eventId?: string | null;
  checkpointId?: number | null;
  txHash?: string | null;
  referenceId?: string | null;
}

function ensureDocDir(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  if (!existsSync(DOC_DIR)) mkdirSync(DOC_DIR, { recursive: true });
}

function filePathForEvent(eventId: string): string {
  return join(DOC_DIR, `${eventId}.json`);
}

function buildDocumentLinks(eventId: string): CommerceDocumentLinks {
  const encoded = encodeURIComponent(eventId);
  return {
    invoiceUrl: `/documents/${encoded}/invoice`,
    receiptUrl: `/documents/${encoded}/receipt`,
    deliveryProofUrl: `/documents/${encoded}/delivery-proof`,
  };
}

function defaultTrackLabel(trackKey: DocumentTrackKey): string {
  if (trackKey === 't1') return 'Track 01';
  if (trackKey === 't2') return 'Track 02';
  if (trackKey === 't3') return 'Track 03';
  return 'Track 04';
}

function defaultBundleType(trackKey: DocumentTrackKey): DocumentBundleType {
  if (trackKey === 't1') return 'governance';
  if (trackKey === 't2') return 'api-usage';
  if (trackKey === 't3') return 'compute';
  return 'micro-commerce';
}

function defaultCategory(trackKey: DocumentTrackKey, bundleType: DocumentBundleType): string {
  if (bundleType === 'governance') return 'Governance nanopayment';
  if (bundleType === 'api-usage') return 'Paid API access';
  if (bundleType === 'compute') return 'Usage-based compute';
  return trackKey === 't4' ? 'Real-time micro-commerce' : 'Kairos document bundle';
}

function normalizeBundle(bundle: CommerceDocumentBundle): CommerceDocumentBundle {
  const trackKey = bundle.trackKey || 't4';
  const bundleType = bundle.bundleType || defaultBundleType(trackKey);
  return {
    ...bundle,
    trackKey,
    trackLabel: bundle.trackLabel || defaultTrackLabel(trackKey),
    category: bundle.category || defaultCategory(trackKey, bundleType),
    bundleType,
    checkpointId: bundle.checkpointId ?? null,
    createdAt: bundle.createdAt || new Date().toISOString(),
    buyer: bundle.buyer || 'Kairos agent',
    seller: bundle.seller || 'Kairos commerce rail',
    referenceNotionalUsd: Number.isFinite(bundle.referenceNotionalUsd) ? Number(bundle.referenceNotionalUsd) : null,
    referenceCurrency: bundle.referenceCurrency || 'USDC',
    deliverySummary: bundle.deliverySummary || bundle.description,
    settlement: {
      amountUsdc: Number.isFinite(bundle.settlement.amountUsdc) ? Number(bundle.settlement.amountUsdc) : 0,
      status: bundle.settlement.status || 'pending',
      mode: bundle.settlement.mode || 'nanopayment',
      txHash: bundle.settlement.txHash || null,
      referenceId: bundle.settlement.referenceId || null,
      explorerUrl: bundle.settlement.explorerUrl || null,
    },
    documents: buildDocumentLinks(bundle.eventId),
  };
}

function loadBundle(eventId: string): CommerceDocumentBundle | null {
  ensureDocDir();
  const filePath = filePathForEvent(eventId);
  if (!existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as CommerceDocumentBundle;
    return normalizeBundle(raw);
  } catch {
    return null;
  }
}

function writeBundle(bundle: CommerceDocumentBundle): CommerceDocumentBundle {
  ensureDocDir();
  const normalized = normalizeBundle(bundle);
  writeFileSync(filePathForEvent(normalized.eventId), JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

function mergeSeed(existing: CommerceDocumentBundle, seed: CommerceDocumentSeed): CommerceDocumentBundle {
  return normalizeBundle({
    ...existing,
    trackKey: seed.trackKey ?? existing.trackKey,
    trackLabel: seed.trackLabel || existing.trackLabel,
    category: seed.category || existing.category,
    bundleType: seed.bundleType || existing.bundleType,
    checkpointId: seed.checkpointId ?? existing.checkpointId,
    createdAt: seed.createdAt || existing.createdAt,
    buyer: seed.buyer || existing.buyer,
    seller: seed.seller || existing.seller,
    item: seed.item || existing.item,
    trigger: seed.trigger || existing.trigger,
    description: seed.description || existing.description,
    referenceNotionalUsd: Number.isFinite(seed.referenceNotionalUsd) ? Number(seed.referenceNotionalUsd) : existing.referenceNotionalUsd,
    referenceCurrency: seed.referenceCurrency || existing.referenceCurrency,
    deliverySummary: seed.deliverySummary || existing.deliverySummary,
    settlement: {
      amountUsdc: Number.isFinite(seed.settlement.amountUsdc) ? Number(seed.settlement.amountUsdc) : existing.settlement.amountUsdc,
      status: seed.settlement.status || existing.settlement.status,
      mode: seed.settlement.mode || existing.settlement.mode,
      txHash: seed.settlement.txHash || existing.settlement.txHash,
      referenceId: seed.settlement.referenceId || existing.settlement.referenceId,
      explorerUrl: seed.settlement.explorerUrl || existing.settlement.explorerUrl,
    },
  });
}

export function ensureCommerceDocumentBundle(seed: CommerceDocumentSeed): CommerceDocumentBundle {
  const existing = loadBundle(seed.eventId);
  if (existing) {
    const merged = mergeSeed(existing, seed);
    if (JSON.stringify(existing) === JSON.stringify(merged)) {
      return existing;
    }
    return writeBundle(merged);
  }

  return writeBundle({
    eventId: seed.eventId,
    trackKey: seed.trackKey || 't4',
    trackLabel: seed.trackLabel || defaultTrackLabel(seed.trackKey || 't4'),
    category: seed.category || defaultCategory(seed.trackKey || 't4', seed.bundleType || defaultBundleType(seed.trackKey || 't4')),
    bundleType: seed.bundleType || defaultBundleType(seed.trackKey || 't4'),
    checkpointId: seed.checkpointId ?? null,
    createdAt: seed.createdAt || new Date().toISOString(),
    buyer: seed.buyer || 'Kairos agent',
    seller: seed.seller || 'Kairos commerce rail',
    item: seed.item,
    trigger: seed.trigger,
    description: seed.description,
    referenceNotionalUsd: Number.isFinite(seed.referenceNotionalUsd) ? Number(seed.referenceNotionalUsd) : null,
    referenceCurrency: seed.referenceCurrency || 'USDC',
    deliverySummary: seed.deliverySummary || seed.description,
    settlement: {
      amountUsdc: Number.isFinite(seed.settlement.amountUsdc) ? Number(seed.settlement.amountUsdc) : 0,
      status: seed.settlement.status || 'pending',
      mode: seed.settlement.mode || 'nanopayment',
      txHash: seed.settlement.txHash || null,
      referenceId: seed.settlement.referenceId || null,
      explorerUrl: seed.settlement.explorerUrl || null,
    },
    documents: buildDocumentLinks(seed.eventId),
  });
}

export function getCommerceDocumentBundle(eventId: string): CommerceDocumentBundle | null {
  return loadBundle(eventId);
}

export function listCommerceDocumentBundles(limit = 20): CommerceDocumentBundle[] {
  ensureDocDir();
  const files = readdirSync(DOC_DIR)
    .filter((file) => file.endsWith('.json'))
    .slice(0, MAX_BUNDLES);

  return files
    .map((file) => loadBundle(file.replace(/\.json$/i, '')))
    .filter((bundle): bundle is CommerceDocumentBundle => Boolean(bundle))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(0, Math.min(limit, MAX_BUNDLES)));
}

export function findCommerceDocumentBundle(lookup: CommerceDocumentLookup): CommerceDocumentBundle | null {
  if (lookup.eventId) {
    const direct = loadBundle(lookup.eventId);
    if (direct) return direct;
  }

  const txHash = lookup.txHash?.toLowerCase() || null;
  const referenceId = lookup.referenceId || null;
  const checkpointId = typeof lookup.checkpointId === 'number' ? lookup.checkpointId : null;

  return listCommerceDocumentBundles(MAX_BUNDLES).find((bundle) => {
    if (checkpointId !== null && bundle.checkpointId === checkpointId) return true;
    if (referenceId && bundle.settlement.referenceId === referenceId) return true;
    if (txHash && (bundle.settlement.txHash || '').toLowerCase() === txHash) return true;
    return false;
  }) || null;
}

export function getCommerceDocumentLinks(lookup: CommerceDocumentLookup): CommerceDocumentLinks | null {
  const bundle = findCommerceDocumentBundle(lookup);
  return bundle?.documents || null;
}

function sanitizeEventIdSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96) || 'event';
}

function receiptSettlementStatus(receipt: NanopaymentReceipt): string {
  if (hasVerifiedTxHash(receipt)) return 'confirmed';
  if (receipt.verificationState === 'fallback' || receipt.mode === 'fallback') return 'fallback';
  if (receipt.referenceId) return 'pending';
  return 'pending';
}

function receiptExplorerUrl(receipt: NanopaymentReceipt): string | null {
  return hasVerifiedTxHash(receipt)
    ? `https://testnet.arcscan.app/tx/${receipt.txHash}`
    : null;
}

export function buildReceiptDocumentEventId(trackKey: Exclude<DocumentTrackKey, 't4'>, receipt: NanopaymentReceipt): string {
  const base = receipt.referenceId
    || (hasVerifiedTxHash(receipt) ? receipt.txHash : '')
    || `${receipt.confirmedAt}-${receipt.eventName}-${receipt.source || receipt.model || receipt.type || 'kairos'}`;
  return `${trackKey}-${sanitizeEventIdSegment(base)}`;
}

export function ensureReceiptDocumentBundle(
  trackKey: Exclude<DocumentTrackKey, 't4'>,
  receipt: NanopaymentReceipt,
): CommerceDocumentBundle {
  const source = receipt.source || receipt.model || receipt.type || 'Kairos';
  const eventName = receipt.eventName || 'Kairos event';
  const settlementStatus = receiptSettlementStatus(receipt);
  const mode = receipt.mode || 'nanopayment';
  const bundleType = defaultBundleType(trackKey);
  const buyer = trackKey === 't1'
    ? 'Kairos governance runtime'
    : trackKey === 't2'
      ? 'Kairos data runtime'
      : 'Kairos compute runtime';
  const seller = source;
  const item = trackKey === 't1'
    ? `${source} governance stage`
    : trackKey === 't2'
      ? `${source} paid API request`
      : `${source} compute task`;
  const trigger = trackKey === 't1'
    ? `governance-${eventName}`
    : trackKey === 't2'
      ? `api-${eventName}`
      : receipt.type === 'reflection'
        ? 'sage-reflection'
        : 'runtime-inference';
  const description = trackKey === 't1'
    ? `${eventName} paid for ${source} governance validation.`
    : trackKey === 't2'
      ? `${eventName} metered API access for ${source}.`
      : `${eventName} metered compute for ${source}.`;
  const deliverySummary = trackKey === 't1'
    ? `${source} governance attestation recorded with ${settlementStatus} settlement evidence.`
    : trackKey === 't2'
      ? `${source} API usage evidence recorded with ${mode} settlement mode.`
      : `${source} ${receipt.type === 'reflection' ? 'reflection' : 'inference'} worklog recorded with ${settlementStatus} settlement evidence.`;

  return ensureCommerceDocumentBundle({
    eventId: buildReceiptDocumentEventId(trackKey, receipt),
    trackKey,
    trackLabel: defaultTrackLabel(trackKey),
    category: defaultCategory(trackKey, bundleType),
    bundleType,
    createdAt: new Date(receipt.confirmedAt || Date.now()).toISOString(),
    buyer,
    seller,
    item,
    trigger,
    description,
    referenceNotionalUsd: receipt.amount,
    referenceCurrency: 'USDC',
    deliverySummary,
    settlement: {
      amountUsdc: receipt.amount,
      status: settlementStatus,
      mode,
      txHash: hasVerifiedTxHash(receipt) ? receipt.txHash : null,
      referenceId: receipt.referenceId || null,
      explorerUrl: receiptExplorerUrl(receipt),
    },
  });
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAmount(value: number | null | undefined, currency: string | null | undefined, decimals = 2): string {
  if (!Number.isFinite(value)) return 'N/A';
  const suffix = currency || 'USDC';
  return `${Number(value).toFixed(decimals)} ${suffix}`;
}

function renderKindSummary(bundle: CommerceDocumentBundle, kind: CommerceDocumentKind): { title: string; subtitle: string; accent: string; kicker: string } {
  if (bundle.bundleType === 'governance') {
    if (kind === 'invoice') {
      return {
        title: 'Kairos Governance Invoice',
        subtitle: 'Issued automatically for a billed governance-stage decision',
        accent: '#6fb7ff',
        kicker: 'Invoice',
      };
    }
    if (kind === 'receipt') {
      return {
        title: 'Kairos Governance Receipt',
        subtitle: 'Settlement evidence for the billed governance-stage action',
        accent: '#35e0a1',
        kicker: 'Receipt',
      };
    }
    return {
      title: 'Kairos Governance Attestation',
      subtitle: 'Human-readable proof for the governed action and its settlement state',
      accent: '#ffcc66',
      kicker: 'Attestation',
    };
  }
  if (bundle.bundleType === 'api-usage') {
    if (kind === 'invoice') {
      return {
        title: 'Kairos API Usage Invoice',
        subtitle: 'Issued automatically for a metered paid API action',
        accent: '#6fb7ff',
        kicker: 'Invoice',
      };
    }
    if (kind === 'receipt') {
      return {
        title: 'Kairos API Usage Receipt',
        subtitle: 'Settlement evidence for the billed API request',
        accent: '#35e0a1',
        kicker: 'Receipt',
      };
    }
    return {
      title: 'Kairos API Evidence',
      subtitle: 'Request-level proof for the billed API event',
      accent: '#ffcc66',
      kicker: 'Evidence',
    };
  }
  if (bundle.bundleType === 'compute') {
    if (kind === 'invoice') {
      return {
        title: 'Kairos Compute Invoice',
        subtitle: 'Issued automatically for a metered inference or reflection action',
        accent: '#6fb7ff',
        kicker: 'Invoice',
      };
    }
    if (kind === 'receipt') {
      return {
        title: 'Kairos Compute Receipt',
        subtitle: 'Settlement evidence for the billed compute event',
        accent: '#35e0a1',
        kicker: 'Receipt',
      };
    }
    return {
      title: 'Kairos Compute Worklog',
      subtitle: 'Execution proof for the inference or reflection event',
      accent: '#ffcc66',
      kicker: 'Worklog',
    };
  }
  if (kind === 'invoice') {
    return {
      title: 'Kairos Native Invoice',
      subtitle: 'Issued automatically for a Kairos-native commerce event',
      accent: '#6fb7ff',
      kicker: 'Invoice',
    };
  }
  if (kind === 'receipt') {
    return {
      title: 'Kairos Native Receipt',
      subtitle: 'Settlement evidence for the generated commerce event',
      accent: '#35e0a1',
      kicker: 'Receipt',
    };
  }
  return {
    title: 'Kairos Delivery Proof',
    subtitle: 'Fulfillment and delivery attestation for the commerce event',
    accent: '#ffcc66',
    kicker: 'Delivery Proof',
  };
}

export function renderCommerceDocumentHtml(bundle: CommerceDocumentBundle, kind: CommerceDocumentKind): string {
  const meta = renderKindSummary(bundle, kind);
  const proofAmount = formatAmount(bundle.settlement.amountUsdc, 'USDC', 3);
  const referenceNotional = bundle.referenceNotionalUsd !== null
    ? formatAmount(bundle.referenceNotionalUsd, bundle.referenceCurrency || 'USDC', 2)
    : 'Not recorded';
  const isMicroCommerce = bundle.bundleType === 'micro-commerce';
  const permanentUrl = kind === 'invoice'
    ? bundle.documents.invoiceUrl
    : kind === 'receipt'
      ? bundle.documents.receiptUrl
      : bundle.documents.deliveryProofUrl;
  const txRef = bundle.settlement.txHash || bundle.settlement.referenceId || 'Pending reference';
  const kindSpecific = kind === 'invoice'
    ? `
      <div class="callout">
        <strong>Billing note</strong><br />
        ${isMicroCommerce
          ? 'This invoice is generated by Kairos for a native digital-service event. The proof receipt amount is intentionally tiny and is separate from the underlying reference notional.'
          : 'This invoice records the metered billed amount for the Kairos runtime event shown below.'}
      </div>
      <div class="grid">
        <div class="panel">
          <div class="label">${isMicroCommerce ? 'Reference service notional' : 'Billed amount'}</div>
          <div class="value">${escapeHtml(referenceNotional)}</div>
        </div>
        <div class="panel">
          <div class="label">${isMicroCommerce ? 'Arc proof amount' : 'Settlement mode'}</div>
          <div class="value">${escapeHtml(isMicroCommerce ? proofAmount : bundle.settlement.mode)}</div>
        </div>
      </div>
    `
    : kind === 'receipt'
      ? `
        <div class="callout">
          <strong>Settlement note</strong><br />
          ${isMicroCommerce
            ? 'This receipt records the proof settlement for the event. It is not a statement that the full reference notional was transferred on Arc.'
            : 'This receipt records the metered settlement evidence for the billed Kairos runtime event.'}
        </div>
        <div class="grid">
          <div class="panel">
            <div class="label">Settlement status</div>
            <div class="value">${escapeHtml(bundle.settlement.status)}</div>
          </div>
          <div class="panel">
            <div class="label">Settlement mode</div>
            <div class="value">${escapeHtml(bundle.settlement.mode)}</div>
          </div>
        </div>
      `
      : `
        <div class="callout">
          <strong>${bundle.bundleType === 'governance' ? 'Attestation note' : bundle.bundleType === 'api-usage' ? 'Evidence note' : bundle.bundleType === 'compute' ? 'Worklog note' : 'Fulfillment note'}</strong><br />
          ${isMicroCommerce
            ? 'This delivery proof attests that Kairos completed the digital commerce step described below and emitted the related settlement evidence.'
            : bundle.bundleType === 'governance'
              ? 'This attestation explains the governed action, its stage context, and the linked settlement evidence.'
              : bundle.bundleType === 'api-usage'
                ? 'This evidence file explains the billed request context and the linked settlement evidence.'
                : 'This worklog explains the billed inference or reflection event and the linked settlement evidence.'}
        </div>
        <div class="panel">
          <div class="label">${bundle.bundleType === 'governance' ? 'Attestation summary' : bundle.bundleType === 'api-usage' ? 'Evidence summary' : bundle.bundleType === 'compute' ? 'Worklog summary' : 'Delivery summary'}</div>
          <div class="value">${escapeHtml(bundle.deliverySummary)}</div>
        </div>
      `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(meta.title)} - ${escapeHtml(bundle.eventId)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      background:
        radial-gradient(circle at 15% 8%, rgba(53,224,161,.16), transparent 32%),
        radial-gradient(circle at 88% 12%, rgba(111,183,255,.14), transparent 28%),
        linear-gradient(135deg, #07100d 0%, #0a120f 45%, #050908 100%);
      color: #edf8f2;
      padding: 40px 18px;
    }
    .sheet {
      max-width: 980px;
      margin: 0 auto;
      border-radius: 24px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.08);
      background: linear-gradient(180deg, rgba(17,31,25,.94), rgba(9,18,15,.94));
      box-shadow: 0 18px 70px rgba(0,0,0,.32);
    }
    .hero {
      padding: 28px 30px;
      border-bottom: 1px solid rgba(255,255,255,.07);
      background: linear-gradient(135deg, rgba(255,255,255,.03), rgba(255,255,255,.015));
    }
    .kicker {
      color: ${meta.accent};
      text-transform: uppercase;
      letter-spacing: .24em;
      font-size: 11px;
      margin-bottom: 10px;
    }
    h1 {
      margin: 0;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 42px;
      letter-spacing: -.04em;
      line-height: .95;
    }
    .subtitle {
      margin-top: 12px;
      color: #8aa698;
      font-size: 13px;
      line-height: 1.8;
      max-width: 760px;
    }
    .body {
      padding: 26px 30px 30px;
      display: grid;
      gap: 18px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .panel, .callout {
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,.07);
      background: rgba(255,255,255,.03);
      padding: 16px;
    }
    .label {
      color: #4f6d61;
      text-transform: uppercase;
      letter-spacing: .14em;
      font-size: 10px;
      margin-bottom: 8px;
    }
    .value {
      color: #edf8f2;
      font-size: 13px;
      line-height: 1.75;
      word-break: break-word;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,.07);
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,.06);
      font-size: 12px;
      vertical-align: top;
    }
    th {
      color: #4f6d61;
      text-transform: uppercase;
      letter-spacing: .14em;
      font-size: 10px;
      background: rgba(255,255,255,.03);
    }
    tr:last-child td { border-bottom: 0; }
    .footer {
      padding: 18px 30px 24px;
      border-top: 1px solid rgba(255,255,255,.07);
      color: #8aa698;
      font-size: 11px;
      line-height: 1.8;
    }
    a { color: #6fb7ff; text-decoration: none; }
    @media (max-width: 800px) {
      .grid { grid-template-columns: 1fr; }
      h1 { font-size: 34px; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <section class="hero">
      <div class="kicker">${escapeHtml(meta.kicker || kind)}</div>
      <h1>${escapeHtml(meta.title)}</h1>
      <div class="subtitle">${escapeHtml(meta.subtitle)}. Event ID: ${escapeHtml(bundle.eventId)}</div>
    </section>
    <section class="body">
      ${kindSpecific}
      <div class="grid">
        <div class="panel">
          <div class="label">Buyer</div>
          <div class="value">${escapeHtml(bundle.buyer)}</div>
        </div>
        <div class="panel">
          <div class="label">Seller</div>
          <div class="value">${escapeHtml(bundle.seller)}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Item</td><td>${escapeHtml(bundle.item)}</td></tr>
          <tr><td>Track</td><td>${escapeHtml(bundle.trackLabel)}</td></tr>
          <tr><td>Category</td><td>${escapeHtml(bundle.category)}</td></tr>
          <tr><td>Trigger</td><td>${escapeHtml(bundle.trigger)}</td></tr>
          <tr><td>Description</td><td>${escapeHtml(bundle.description)}</td></tr>
          <tr><td>Created At</td><td>${escapeHtml(bundle.createdAt)}</td></tr>
          <tr><td>Checkpoint</td><td>${escapeHtml(bundle.checkpointId ?? 'N/A')}</td></tr>
          <tr><td>Reference Notional</td><td>${escapeHtml(referenceNotional)}</td></tr>
          <tr><td>Arc Proof Amount</td><td>${escapeHtml(proofAmount)}</td></tr>
          <tr><td>Settlement Reference</td><td>${escapeHtml(txRef)}</td></tr>
          <tr><td>Settlement Explorer</td><td>${bundle.settlement.explorerUrl ? `<a href="${escapeHtml(bundle.settlement.explorerUrl)}" target="_blank" rel="noopener">Open Arcscan</a>` : 'Pending'}</td></tr>
          <tr><td>Permanent URL</td><td><a href="${escapeHtml(permanentUrl)}">${escapeHtml(permanentUrl)}</a></td></tr>
        </tbody>
      </table>
    </section>
    <section class="footer">
      ${isMicroCommerce
        ? 'Kairos generated this document automatically as part of its native commerce rail. These documents are intended to remove manual upload requirements for first-party Kairos events. External merchant documents can still be uploaded separately for multimodal verification.'
        : 'Kairos generated this document automatically as part of its metered proof layer. It is a human-readable companion to the underlying Arc receipt and is intended to make governance, API, and compute billing easier to inspect during review.'}
    </section>
  </div>
</body>
</html>`;
}
