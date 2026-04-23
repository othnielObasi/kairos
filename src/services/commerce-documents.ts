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

export function listAllCommerceDocumentBundles(): CommerceDocumentBundle[] {
  ensureDocDir();
  const files = readdirSync(DOC_DIR)
    .filter((file) => file.endsWith('.json'));

  return files
    .map((file) => loadBundle(file.replace(/\.json$/i, '')))
    .filter((bundle): bundle is CommerceDocumentBundle => Boolean(bundle))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
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

function titleCaseLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Not recorded';
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
}

function formatDocumentTimestamp(value: string): string {
  const stamp = Date.parse(value);
  if (Number.isNaN(stamp)) return value || 'Unknown';
  return `${new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(stamp))} UTC`;
}

function documentUrlForKind(bundle: CommerceDocumentBundle, kind: CommerceDocumentKind): string {
  if (kind === 'invoice') return bundle.documents.invoiceUrl;
  if (kind === 'receipt') return bundle.documents.receiptUrl;
  return bundle.documents.deliveryProofUrl;
}

function documentDownloadUrl(url: string): string {
  return `${url}?download=1`;
}

function toFileSlug(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'document';
}

export function buildCommerceDocumentFilename(bundle: CommerceDocumentBundle, kind: CommerceDocumentKind): string {
  const kindSlug = kind === 'delivery-proof' ? 'proof' : kind;
  return `kairos-${kindSlug}-${toFileSlug(bundle.eventId)}.html`;
}

function renderMetricCards(cards: Array<{ label: string; value: string; detail?: string }>): string {
  return cards.map((card) => `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(card.label)}</div>
      <div class="metric-value">${escapeHtml(card.value)}</div>
      ${card.detail ? `<div class="metric-detail">${escapeHtml(card.detail)}</div>` : ''}
    </div>
  `).join('');
}

function renderSummaryRows(rows: Array<{ label: string; value: string }>): string {
  return rows.map((row) => `
    <div class="summary-row">
      <div class="summary-label">${escapeHtml(row.label)}</div>
      <div class="summary-value">${escapeHtml(row.value)}</div>
    </div>
  `).join('');
}

function renderLinkRows(rows: Array<{ label: string; valueHtml: string }>): string {
  return rows.map((row) => `
    <div class="summary-row">
      <div class="summary-label">${escapeHtml(row.label)}</div>
      <div class="summary-value">${row.valueHtml}</div>
    </div>
  `).join('');
}

function renderDocumentSwitcher(bundle: CommerceDocumentBundle, kind: CommerceDocumentKind): string {
  const items: Array<{ kind: CommerceDocumentKind; label: string; url: string }> = [
    { kind: 'invoice', label: 'Invoice', url: bundle.documents.invoiceUrl },
    { kind: 'receipt', label: 'Receipt', url: bundle.documents.receiptUrl },
    { kind: 'delivery-proof', label: bundle.bundleType === 'micro-commerce' ? 'Proof' : 'Attestation', url: bundle.documents.deliveryProofUrl },
  ];

  return items.map((item) => `
    <a class="doc-tab${item.kind === kind ? ' active' : ''}" href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a>
  `).join('');
}

export function renderCommerceDocumentHtml(bundle: CommerceDocumentBundle, kind: CommerceDocumentKind): string {
  const meta = renderKindSummary(bundle, kind);
  const proofAmount = formatAmount(bundle.settlement.amountUsdc, 'USDC', 3);
  const referenceNotional = bundle.referenceNotionalUsd !== null
    ? formatAmount(bundle.referenceNotionalUsd, bundle.referenceCurrency || 'USDC', 2)
    : 'Not recorded';
  const isMicroCommerce = bundle.bundleType === 'micro-commerce';
  const permanentUrl = documentUrlForKind(bundle, kind);
  const downloadUrl = documentDownloadUrl(permanentUrl);
  const downloadFileName = buildCommerceDocumentFilename(bundle, kind);
  const settlementStatus = titleCaseLabel(bundle.settlement.status || 'pending');
  const settlementMode = titleCaseLabel(bundle.settlement.mode || 'nanopayment');
  const txRef = bundle.settlement.txHash || bundle.settlement.referenceId || 'Pending reference';
  const issuedAt = formatDocumentTimestamp(bundle.createdAt);
  const explorerHtml = bundle.settlement.explorerUrl
    ? `<a href="${escapeHtml(bundle.settlement.explorerUrl)}" target="_blank" rel="noopener">Open Arcscan receipt</a>`
    : 'Pending final receipt';
  const fulfillmentLabel = bundle.bundleType === 'governance'
    ? 'Attestation'
    : bundle.bundleType === 'api-usage'
      ? 'Evidence File'
      : bundle.bundleType === 'compute'
        ? 'Worklog'
        : 'Delivery Proof';

  let question = '';
  let purpose = '';
  let metricCards = '';
  let primarySection = '';
  let secondarySection = '';

  if (kind === 'invoice') {
    question = 'What was billed?';
    purpose = isMicroCommerce
      ? 'This invoice keeps the full commercial context of the Kairos-native event visible. The small Arc proof settlement belongs on the receipt and should not be confused with the larger reference notional shown here.'
      : 'This invoice is the billing-facing view of the Kairos event. It tells a reviewer what was charged, who it was for, and why the runtime considered it billable.';
    metricCards = renderMetricCards([
      {
        label: isMicroCommerce ? 'Reference Notional' : 'Billed Amount',
        value: referenceNotional,
        detail: isMicroCommerce ? 'Full commercial amount for the service event' : 'Metered amount recorded by Kairos',
      },
      {
        label: isMicroCommerce ? 'Proof Amount' : 'Settlement Mode',
        value: isMicroCommerce ? proofAmount : settlementMode,
        detail: isMicroCommerce ? 'Small proof settlement kept separate from invoice value' : 'How settlement evidence is being tracked',
      },
      {
        label: 'Issued At',
        value: issuedAt,
        detail: bundle.trackLabel,
      },
      {
        label: 'Seller',
        value: bundle.seller,
        detail: bundle.item,
      },
    ]);
    primarySection = `
      <article class="section">
        <div class="section-kicker">Billing Context</div>
        <h2>Commercial Summary</h2>
        <p class="section-copy">${escapeHtml(isMicroCommerce
          ? 'Use this view to understand the service context, counterparties, and reference value behind the proof event.'
          : 'Use this view to understand the billed runtime action and the commercial framing Kairos attached to it.')}</p>
        <div class="summary-list">
          ${renderSummaryRows([
            { label: 'Item / Service', value: bundle.item },
            { label: 'Buyer', value: bundle.buyer },
            { label: 'Seller', value: bundle.seller },
            { label: 'Description', value: bundle.description },
          ])}
        </div>
      </article>
    `;
    secondarySection = `
      <article class="section accent-section">
        <div class="section-kicker">Read It Correctly</div>
        <h2>Billing Breakdown</h2>
        <p class="section-copy">${escapeHtml(isMicroCommerce
          ? 'For native commerce, the invoice amount is the business context. The receipt captures the much smaller proof transfer used to verify the action.'
          : 'For metered events, the invoice is the cleanest human-readable explanation of the amount, trigger, and category tied to the event.')}</p>
        <div class="summary-list">
          ${renderSummaryRows([
            { label: 'Track', value: bundle.trackLabel },
            { label: 'Category', value: bundle.category },
            { label: 'Trigger', value: bundle.trigger },
            { label: isMicroCommerce ? 'Arc Proof Amount' : 'Settlement Mode', value: isMicroCommerce ? proofAmount : settlementMode },
          ])}
        </div>
      </article>
    `;
  } else if (kind === 'receipt') {
    question = 'What settlement happened?';
    purpose = isMicroCommerce
      ? 'This receipt is the proof-facing view of the event. It records the small Arc settlement Kairos emitted to evidence the action, rather than the full commercial notional.'
      : 'This receipt is the settlement-facing view of the Kairos event. It tells a reviewer what payment evidence exists, what state it is in, and how to verify it.';
    metricCards = renderMetricCards([
      {
        label: 'Settlement Status',
        value: settlementStatus,
        detail: 'Current proof state for the event',
      },
      {
        label: 'Proof Amount',
        value: proofAmount,
        detail: 'Amount represented by the settlement evidence',
      },
      {
        label: 'Settlement Mode',
        value: settlementMode,
        detail: 'How Kairos attempted or recorded settlement',
      },
      {
        label: 'Reference',
        value: txRef,
        detail: bundle.settlement.explorerUrl ? 'Explorer link available' : 'Awaiting final explorer link',
      },
    ]);
    primarySection = `
      <article class="section">
        <div class="section-kicker">Settlement Record</div>
        <h2>Receipt Evidence</h2>
        <p class="section-copy">${escapeHtml(isMicroCommerce
          ? 'This is the strongest settlement-focused view for a native commerce event. Reviewers should read it as proof evidence, not as a statement that the full reference notional moved on-chain.'
          : 'This view is designed for payment verification. It surfaces the proof state, reference, and settlement channel first.')}</p>
        <div class="summary-list">
          ${renderLinkRows([
            { label: 'Settlement Status', valueHtml: escapeHtml(settlementStatus) },
            { label: 'Settlement Mode', valueHtml: escapeHtml(settlementMode) },
            { label: 'Settlement Reference', valueHtml: escapeHtml(txRef) },
            { label: 'Arc Explorer', valueHtml: explorerHtml },
          ])}
        </div>
      </article>
    `;
    secondarySection = `
      <article class="section accent-section">
        <div class="section-kicker">Linked Context</div>
        <h2>Commercial Reference</h2>
        <p class="section-copy">${escapeHtml('The receipt stays focused on proof, but it still anchors back to the event context so the settlement evidence can be understood without leaving the document.')}</p>
        <div class="summary-list">
          ${renderSummaryRows([
            { label: 'Item / Service', value: bundle.item },
            { label: 'Reference Notional', value: referenceNotional },
            { label: 'Buyer to Seller', value: `${bundle.buyer} -> ${bundle.seller}` },
            { label: 'Issued At', value: issuedAt },
          ])}
        </div>
      </article>
    `;
  } else {
    question = 'What was delivered or attested?';
    purpose = isMicroCommerce
      ? 'This proof page is the fulfillment-facing view of the event. It explains what Kairos says it completed, why it counted as delivery, and what settlement evidence was attached to that completion.'
      : `This ${fulfillmentLabel.toLowerCase()} is the operational view of the event. It explains the action or work that Kairos wants a reviewer to understand alongside the linked settlement evidence.`;
    metricCards = renderMetricCards([
      {
        label: 'Proof Type',
        value: fulfillmentLabel,
        detail: bundle.category,
      },
      {
        label: 'Trigger',
        value: bundle.trigger,
        detail: bundle.trackLabel,
      },
      {
        label: 'Settlement Status',
        value: settlementStatus,
        detail: 'Linked evidence state',
      },
      {
        label: 'Checkpoint',
        value: bundle.checkpointId !== null ? String(bundle.checkpointId) : 'N/A',
        detail: 'Execution anchor when available',
      },
    ]);
    primarySection = `
      <article class="section">
        <div class="section-kicker">Fulfillment Context</div>
        <h2>${escapeHtml(fulfillmentLabel)} Summary</h2>
        <p class="section-copy">${escapeHtml(isMicroCommerce
          ? 'This section explains the native commerce step Kairos says it fulfilled for the event.'
          : 'This section explains the governed action, request evidence, or compute work Kairos wants reviewers to inspect.')}</p>
        <div class="summary-list">
          ${renderSummaryRows([
            { label: 'Summary', value: bundle.deliverySummary },
            { label: 'Description', value: bundle.description },
            { label: 'Item / Service', value: bundle.item },
            { label: 'Buyer to Seller', value: `${bundle.buyer} -> ${bundle.seller}` },
          ])}
        </div>
      </article>
    `;
    secondarySection = `
      <article class="section accent-section">
        <div class="section-kicker">Linked Evidence</div>
        <h2>Settlement Attachment</h2>
        <p class="section-copy">${escapeHtml('The proof document explains fulfillment first, but it still carries the settlement state so the attestation and the payment evidence stay connected.')}</p>
        <div class="summary-list">
          ${renderLinkRows([
            { label: 'Proof Amount', valueHtml: escapeHtml(proofAmount) },
            { label: 'Reference Notional', valueHtml: escapeHtml(referenceNotional) },
            { label: 'Settlement Reference', valueHtml: escapeHtml(txRef) },
            { label: 'Arc Explorer', valueHtml: explorerHtml },
          ])}
        </div>
      </article>
    `;
  }

  const appendix = renderLinkRows([
    { label: 'Event ID', valueHtml: escapeHtml(bundle.eventId) },
    { label: 'Track', valueHtml: escapeHtml(bundle.trackLabel) },
    { label: 'Category', valueHtml: escapeHtml(bundle.category) },
    { label: 'Created At', valueHtml: escapeHtml(issuedAt) },
    { label: 'Permanent URL', valueHtml: `<a href="${escapeHtml(permanentUrl)}">${escapeHtml(permanentUrl)}</a>` },
    { label: 'Download File Name', valueHtml: escapeHtml(downloadFileName) },
  ]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(meta.title)} - ${escapeHtml(bundle.eventId)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --accent: ${meta.accent};
      --paper: #fcfcf7;
      --paper-2: #ffffff;
      --ink: #17211d;
      --muted: #5f6f68;
      --line: #d8e2db;
      --line-strong: #bccbc2;
      --shadow: 0 20px 80px rgba(0, 0, 0, .18);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      background:
        radial-gradient(circle at 14% 10%, rgba(53,224,161,.16), transparent 28%),
        radial-gradient(circle at 88% 12%, rgba(111,183,255,.16), transparent 26%),
        linear-gradient(135deg, #0a110f 0%, #101916 44%, #070b0a 100%);
      color: var(--ink);
      padding: 40px 18px;
    }
    a { color: #1e63c9; text-decoration: none; }
    button { font: inherit; }
    .sheet {
      max-width: 1120px;
      margin: 0 auto;
      border-radius: 28px;
      overflow: hidden;
      background: var(--paper);
      box-shadow: var(--shadow);
      border: 1px solid rgba(255,255,255,.08);
    }
    .hero {
      padding: 30px;
      background:
        linear-gradient(135deg, rgba(255,255,255,.86), rgba(255,255,255,.68)),
        linear-gradient(120deg, color-mix(in srgb, var(--accent) 16%, white), rgba(255,255,255,.88));
      border-bottom: 1px solid var(--line);
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
    }
    .eyebrow {
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .22em;
      font-size: 10px;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: clamp(34px, 5vw, 54px);
      line-height: .95;
      letter-spacing: -.05em;
      color: var(--ink);
    }
    .subtitle {
      margin-top: 14px;
      max-width: 760px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.8;
    }
    .action-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .action-btn {
      border-radius: 999px;
      border: 1px solid var(--line-strong);
      background: rgba(255,255,255,.78);
      color: var(--ink);
      padding: 10px 14px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .12em;
      cursor: pointer;
    }
    .action-btn.primary {
      background: var(--ink);
      border-color: var(--ink);
      color: #fff;
    }
    .badge-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 18px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 7px 11px;
      border-radius: 999px;
      border: 1px solid var(--line-strong);
      background: rgba(255,255,255,.72);
      font-size: 10px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .12em;
    }
    .badge.accent {
      color: var(--accent);
      border-color: color-mix(in srgb, var(--accent) 28%, white);
      background: color-mix(in srgb, var(--accent) 10%, white);
    }
    .doc-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 18px;
    }
    .doc-tab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 118px;
      padding: 10px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.75);
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
    }
    .doc-tab.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr);
      gap: 18px;
      margin-top: 20px;
    }
    .narrative {
      border-radius: 22px;
      padding: 22px;
      background: linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,.72));
      border: 1px solid var(--line);
      display: grid;
      gap: 12px;
    }
    .narrative h2 {
      margin: 0;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 26px;
      letter-spacing: -.03em;
    }
    .narrative p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.9;
    }
    .narrative-note {
      padding: 12px 14px;
      border-radius: 16px;
      background: color-mix(in srgb, var(--accent) 10%, white);
      border: 1px solid color-mix(in srgb, var(--accent) 20%, white);
      color: var(--ink);
      font-size: 11px;
      line-height: 1.8;
      word-break: break-word;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .metric-card {
      border-radius: 20px;
      padding: 18px;
      background: rgba(255,255,255,.82);
      border: 1px solid var(--line);
      min-height: 142px;
      display: grid;
      align-content: start;
      gap: 8px;
    }
    .metric-label,
    .section-kicker,
    .summary-label,
    .appendix-kicker {
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .16em;
      font-size: 10px;
    }
    .metric-value {
      color: var(--ink);
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 24px;
      line-height: 1.1;
      letter-spacing: -.04em;
      word-break: break-word;
    }
    .metric-detail {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.7;
    }
    .body {
      padding: 26px 30px 30px;
      display: grid;
      gap: 20px;
      background: var(--paper);
    }
    .section-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .section,
    .appendix,
    .footer {
      border-radius: 22px;
      border: 1px solid var(--line);
      background: var(--paper-2);
      padding: 22px;
    }
    .accent-section {
      background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, white), white);
    }
    .section h2,
    .appendix h2 {
      margin: 10px 0 0;
      font-family: "Space Grotesk", system-ui, sans-serif;
      font-size: 24px;
      line-height: 1.1;
      letter-spacing: -.03em;
      color: var(--ink);
    }
    .section-copy {
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.9;
    }
    .summary-list {
      display: grid;
      gap: 14px;
      margin-top: 16px;
    }
    .summary-row {
      display: grid;
      gap: 6px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
    }
    .summary-row:first-child {
      padding-top: 0;
      border-top: 0;
    }
    .summary-value {
      color: var(--ink);
      font-size: 13px;
      line-height: 1.85;
      word-break: break-word;
    }
    .appendix-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      margin-top: 14px;
    }
    .footer {
      display: grid;
      gap: 12px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.9;
    }
    .footer strong {
      color: var(--ink);
    }
    @media (max-width: 960px) {
      .hero-top,
      .hero-grid,
      .section-grid,
      .appendix-grid {
        grid-template-columns: 1fr;
        display: grid;
      }
      .action-row { justify-content: flex-start; }
      .metric-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      body { padding: 20px 10px; }
      .hero, .body { padding: 20px; }
      .sheet { border-radius: 20px; }
      .doc-tab { min-width: 0; flex: 1 1 140px; }
    }
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    @media print {
      html {
        font-size: 90%;
      }
      body {
        background: #fff;
        padding: 0;
        color: #111;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        box-shadow: none;
        border: 0;
        max-width: none;
        border-radius: 0;
      }
      .hero {
        background: #fff;
        padding: 14px 16px 12px;
      }
      .body {
        padding: 12px 16px 14px;
        gap: 12px;
      }
      .hero-grid,
      .section-grid,
      .appendix-grid,
      .metric-grid {
        gap: 10px;
      }
      .badge-row {
        margin-top: 10px;
      }
      .badge {
        padding: 5px 8px;
        font-size: 9px;
      }
      h1 {
        font-size: 28px;
      }
      .subtitle,
      .section-copy,
      .summary-value,
      .narrative p,
      .footer,
      .metric-detail {
        font-size: 10px;
        line-height: 1.55;
      }
      .narrative h2,
      .section h2,
      .appendix h2 {
        font-size: 18px;
      }
      .metric-value {
        font-size: 16px;
      }
      .narrative,
      .section,
      .appendix,
      .footer,
      .metric-card {
        padding: 12px;
        border-radius: 14px;
      }
      .narrative-note,
      .summary-row {
        padding-top: 8px;
      }
      .metric-card {
        min-height: 0;
      }
      .screen-only {
        display: none !important;
      }
      .section,
      .appendix,
      .footer,
      .metric-card,
      .narrative {
        break-inside: avoid;
        box-shadow: none;
      }
      a {
        color: inherit;
        text-decoration: none;
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">Kairos Document Suite</div>
          <h1>${escapeHtml(meta.title)}</h1>
          <div class="subtitle">${escapeHtml(meta.subtitle)}</div>
        </div>
        <div class="action-row screen-only">
          <a class="action-btn primary" href="${escapeHtml(downloadUrl)}" download="${escapeHtml(downloadFileName)}">Download HTML</a>
          <button class="action-btn" type="button" id="print-action">Print / Save PDF</button>
        </div>
      </div>
      <div class="badge-row">
        <span class="badge accent">${escapeHtml(meta.kicker)}</span>
        <span class="badge">${escapeHtml(bundle.trackLabel)}</span>
        <span class="badge">${escapeHtml(titleCaseLabel(bundle.bundleType))}</span>
      </div>
      <div class="doc-tabs screen-only">
        ${renderDocumentSwitcher(bundle, kind)}
      </div>
      <div class="hero-grid">
        <article class="narrative">
          <div class="section-kicker">Primary Question</div>
          <h2>${escapeHtml(question)}</h2>
          <p>${escapeHtml(purpose)}</p>
          <div class="narrative-note">
            <strong>Event ID:</strong> ${escapeHtml(bundle.eventId)}<br />
            <strong>Canonical URL:</strong> ${escapeHtml(permanentUrl)}
          </div>
        </article>
        <div class="metric-grid">
          ${metricCards}
        </div>
      </div>
    </section>
    <section class="body">
      <div class="section-grid">
        ${primarySection}
        ${secondarySection}
      </div>
      <section class="appendix">
        <div class="appendix-kicker">Shared Appendix</div>
        <h2>Event Details</h2>
        <div class="appendix-grid">
          <div class="summary-list">
            ${appendix}
          </div>
          <div class="summary-list">
            ${renderSummaryRows([
              { label: 'Trigger', value: bundle.trigger },
              { label: 'Reference Notional', value: referenceNotional },
              { label: 'Arc Proof Amount', value: proofAmount },
              { label: 'Settlement Reference', value: txRef },
            ])}
          </div>
        </div>
      </section>
      <section class="footer">
        <div>
          <strong>Document behavior:</strong>
          ${isMicroCommerce
            ? 'Kairos generated this document automatically for a native commerce event. The invoice preserves full commercial context, the receipt preserves proof settlement context, and the proof page preserves fulfillment context.'
            : 'Kairos generated this document automatically for a metered proof event. Each document focuses on a different review question so billing, settlement, and operational evidence do not collapse into one repeated view.'}
        </div>
        <div>
          <strong>Download note:</strong> use the Download HTML action for a saved copy, or Print / Save PDF for a paper-style export.
        </div>
      </section>
    </section>
  </div>
  <script>
    const printButton = document.getElementById('print-action');
    if (printButton) {
      printButton.addEventListener('click', function() {
        window.print();
      });
    }
  </script>
</body>
</html>`;
}
