/**
 * Dashboard Server
 * Serves the Kairos web dashboard + API endpoints
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import { getAgentState, getHealthCheck, getLogs, getErrors } from '../agent/index.js';
import { getRecentTrades, getTradeStats, loadClosedTrades } from '../agent/trade-log.js';
import { computeRiskAdjustedMetrics, type EquityPoint } from '../analytics/performance-metrics.js';
import { getCheckpoints, getTradeCheckpoints, getCheckpointExecution } from '../trust/checkpoint.js';
import { config } from '../agent/config.js';
import { getReputationTimeline, getLastTrustScore } from '../trust/trust-policy-scorecard.js';
import { resolveTrustTier } from '../trust/reputation-evolution.js';
import { getOperatorControlState, getOperatorActionReceipts, pauseTrading, resumeTrading, emergencyStop } from '../agent/operator-control.js';
import { buildRegistrationJson } from '../chain/identity.js';
import { generateTradePost, generateDailySummaryPost, buildTwitterIntentUrl } from '../social/share.js';
import { getSAGEStatus, getActivePlaybookRules } from '../strategy/sage-engine.js';
import { getKrakenFeedStatus, fetchKrakenTicker, fetchKrakenBalance, fetchKrakenOpenOrders, fetchKrakenTradeHistory } from '../data/kraken-feed.js';
import { fetchPrismData } from '../data/prism-feed.js';
import { billingStore } from '../services/billing-store.js';
import { hasVerifiedTxHash, type NanopaymentReceipt } from '../services/nanopayments.js';
import { getMicroCommerceEvents, type MicroCommerceEvent } from '../services/micro-commerce-store.js';
import { getCliStatus, checkCliHealth } from '../data/kraken-cli.js';
import { getKrakenAccountSnapshot, krakenPreflight } from '../data/kraken-bridge.js';
import { generateAttestationSummary } from '../security/tee-attestation.js';
import { ALL_TOOLS } from '../mcp/tools.js';
import { ALL_RESOURCES } from '../mcp/resources.js';
import { ALL_PROMPTS } from '../mcp/prompts.js';
import { getNormalisationStatus } from '../services/normalisation.js';
import {
  analyzeCommerceDocument,
  buildCommerceSettlementPreview,
  runGeminiCommerceAssistant,
  type GeminiCommerceTool,
  settleCommerceProofReceipt,
} from '../services/gemini-commerce.js';
import { getGatewayBalanceInfo } from '../services/gateway-balance.js';
import {
  buildReceiptDocumentEventId,
  ensureReceiptDocumentBundle,
  buildCommerceDocumentFilename,
  getCommerceDocumentBundle,
  getCommerceDocumentLinks,
  listAllCommerceDocumentBundles,
  listCommerceDocumentBundles,
  renderCommerceDocumentHtml,
  type CommerceDocumentBundle,
  type CommerceDocumentKind,
  type CommerceDocumentLinks,
  type DocumentTrackKey,
} from '../services/commerce-documents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_PORT = parseInt(process.env.PORT || '3000', 10);
const TRACK1_STAGE_NAMES = [
  'Mandate',
  'Oracle',
  'Simulator',
  'Supervisory',
  'Risk Router',
  'LLM Reasoning',
  'SAGE',
];

function getRuntimeConfig() {
  return {
    mode: process.env.MODE || 'simulation',
    dataSource: process.env.DATA_SOURCE || 'live',
  };
}

function formatBillingMode(mode: string | undefined | null): string {
  if (mode === 'circle-wallets') return 'Circle Wallets';
  if (mode === 'nanopayment') return 'Nanopayment';
  if (mode === 'fallback') return 'Fallback receipt';
  if (mode === 'x402') return 'x402';
  return 'Unknown';
}

function parseModelList(raw: string | undefined, fallback: string): string[] {
  const seen = new Set<string>();
  return (raw || fallback)
    .split(',')
    .map((model) => model.trim())
    .filter((model) => {
      if (!model || seen.has(model)) return false;
      seen.add(model);
      return true;
    });
}

function humanizeModelName(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('gemini-3-flash')) return 'Gemini 3 Flash';
  if (lower.includes('gemini-3-pro')) return 'Gemini 3 Pro';
  if (lower.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
  if (lower.includes('gpt-4o-mini')) return 'OpenAI GPT-4o mini';
  return model;
}

function joinFlow(labels: string[]): string {
  return labels.filter(Boolean).join(' → ');
}

function readProviderErrorHints(): string[] {
  return [
    process.env.GEMINI_LAST_ERROR,
    process.env.GEMINI_STATUS_NOTE,
    process.env.OPENAI_LAST_ERROR,
    process.env.ANTHROPIC_LAST_ERROR,
  ]
    .map((value) => value?.trim() || '')
    .filter(Boolean)
    .slice(0, 3);
}

function countByVisibility(items: Array<{ visibility: string }>) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.visibility] = (acc[item.visibility] || 0) + 1;
    return acc;
  }, {});
}

function buildTrack1Status() {
  const billing = billingStore.toJSON();
  const latestEvent = billingStore.t1Events[0] ?? null;
  const stageCounts = (billing.stageCounts || []).slice(0, TRACK1_STAGE_NAMES.length);
  const stageRealCounts = (billing.stageRealCounts || []).slice(0, TRACK1_STAGE_NAMES.length);
  const stagePendingCounts = (billing.stagePendingCounts || []).slice(0, TRACK1_STAGE_NAMES.length);
  const stageSpend = (billing.stageSpend || []).slice(0, TRACK1_STAGE_NAMES.length);
  const activeStageCount = TRACK1_STAGE_NAMES.filter((_, index) => (
    Number(stageCounts[index] || 0) > 0
    || Number(stageRealCounts[index] || 0) > 0
    || Number(stagePendingCounts[index] || 0) > 0
  )).length;

  let state = 'idle';
  let label = 'IDLE';
  let note = 'Awaiting governance-stage receipts.';

  if (latestEvent) {
    if (hasVerifiedTxHash(latestEvent)) {
      state = 'live';
      label = 'LIVE';
      note = 'Governance stages are producing verifiable Arc receipts.';
    } else if (latestEvent.referenceId) {
      state = 'verifying';
      label = 'VERIFYING';
      note = 'A governance receipt was submitted and is waiting for its Arc hash.';
    } else {
      state = 'fallback';
      label = 'FALLBACK';
      note = 'Governance stayed safe, but the latest billing proof is fallback-only.';
    }
  }

  return {
    state,
    label,
    note,
    subtitle: 'Mandate, oracle, simulation, supervision, risk routing, reasoning, and SAGE billed per action.',
    realTxns: billing.t1RealTxns,
    pendingTxns: billing.t1PendingTxns,
    totalEvents: billing.t1Events.length,
    activeStageCount,
    spend: billing.t1Spend,
    stages: TRACK1_STAGE_NAMES.map((name, index) => ({
      name,
      count: Number(stageCounts[index] || 0),
      realTxns: Number(stageRealCounts[index] || 0),
      pendingTxns: Number(stagePendingCounts[index] || 0),
      spend: Number(stageSpend[index] || 0),
    })),
    latestEvent: latestEvent ? {
      source: latestEvent.source || latestEvent.eventName || 'Governance',
      eventName: latestEvent.eventName,
      amount: latestEvent.amount,
      mode: latestEvent.mode || 'nanopayment',
      txHash: hasVerifiedTxHash(latestEvent) ? latestEvent.txHash : null,
      referenceId: latestEvent.referenceId || null,
      confirmedAt: latestEvent.confirmedAt,
    } : null,
  };
}

function buildTrack2Status() {
  const billing = billingStore.toJSON();
  const latestEvent = billingStore.t2Events[0] ?? null;
  const normalisation = getNormalisationStatus();
  const signerLabel = normalisation.signerKind === 'circle-wallet'
    ? 'Circle Wallets'
    : normalisation.signerKind === 'mnemonic'
      ? 'Mnemonic signer'
      : 'No signer';

  let state = 'idle';
  let label = 'IDLE';
  let note = 'Awaiting paid data fetches.';

  if (normalisation.mode === 'x402') {
    if (latestEvent) {
      if (hasVerifiedTxHash(latestEvent)) {
        state = 'live_api';
        label = 'X402 LIVE';
        note = `AIsa x402 endpoints are being paid per query via Circle Gateway on Arc using ${signerLabel}.`;
      } else if (latestEvent.referenceId) {
        state = 'verifying';
        label = 'VERIFYING';
        note = `AIsa x402 payment was submitted through ${signerLabel}, but the Arc settlement hash is still resolving.`;
      } else {
        state = 'fallback';
        label = 'FALLBACK';
        note = 'AIsa responded, but billing used a fallback receipt because no verified Arc settlement hash is available yet.';
      }
    } else {
      state = 'verifying';
      label = 'ARMED';
      note = `AIsa x402 is configured through ${signerLabel} and ready for the next paid data request.`;
    }
  } else if (normalisation.mode === 'fallback') {
    state = 'fallback';
    label = latestEvent ? 'FALLBACK' : 'SIGNER MISSING';
    note = latestEvent
      ? `AIsa is configured but ${normalisation.reason} Legacy feeds are live, and Kairos is recording fallback API billing receipts.`
      : `AIsa is configured but ${normalisation.reason} Legacy feeds are live, so Track 2 will use fallback billing until the signer is added.`;
  } else {
    state = 'disabled';
    label = 'DISABLED';
    note = 'AIsa x402 is not configured, so Track 2 is running on legacy data feeds only.';
  }

  const track2 = {
    state,
    label,
    note,
    legacySubtitle: normalisation.mode === 'x402'
      ? 'Agent pays AIsa x402 endpoints per query · Circle Gateway settlement · USDC on Arc · financial, Twitter, news, and Perplexity'
      : 'Agent queries live fallback feeds with Arc billing receipts · AIsa x402 standby · market, social, news, and PRISM data',
    subtitle: normalisation.mode === 'x402'
      ? 'Agent pays AIsa x402 for price snapshots, Twitter, news, and PRISM reasoning · Circle Gateway settlement · USDC on Arc'
      : 'Agent queries live fallback feeds with Arc billing receipts · AIsa x402 standby · market, social, news, and PRISM data',
    endpoint: normalisation.endpoint,
    mode: normalisation.mode,
    reason: normalisation.reason,
    realTxns: billing.t2RealTxns,
    pendingTxns: billing.t2PendingTxns,
    totalEvents: billing.t2Events.length,
    sourceLabels: normalisation.mode === 'x402'
      ? {
          coingecko: 'AIsa x402 Spot A',
          kraken: 'AIsa x402 Spot B',
          feargreed: 'AIsa Twitter',
          alphavantage: 'AIsa Fin. News',
          prism: 'AIsa Perplexity',
        }
      : {
          coingecko: 'AIsa Spot A / Safety Feed',
          kraken: 'AIsa Spot B / Safety Feed',
          feargreed: 'Fear & Greed',
          alphavantage: 'Alpha Vantage / PRISM News',
          prism: 'Strykr PRISM',
        },
  };
  delete (track2 as { legacySubtitle?: string }).legacySubtitle;
  return track2;
}

function buildMcpSummary() {
  return {
    endpoint: config.mcpEndpoint,
    tools: ALL_TOOLS.length,
    resources: ALL_RESOURCES.length,
    prompts: ALL_PROMPTS.length,
    links: {
      root: '/mcp',
      info: '/mcp/info',
      agentCard: '/.well-known/agent-card.json',
    },
    toolVisibility: countByVisibility(ALL_TOOLS),
    resourceVisibility: countByVisibility(ALL_RESOURCES),
    promptVisibility: countByVisibility(ALL_PROMPTS),
    note: 'Governed surface for agents, operators, and audit clients.',
  };
}

function buildTrack3Status() {
  const billing = billingStore.toJSON();
  const latestEvent = billingStore.t3Events[0] ?? null;
  const sage = getSAGEStatus();
  const providers = [
    { id: 'anthropic', label: 'Claude', configured: Boolean(process.env.ANTHROPIC_API_KEY) },
    { id: 'gemini', label: 'Gemini', configured: Boolean(process.env.GEMINI_API_KEY_PRIMARY || process.env.GEMINI_API_KEY_SECONDARY || process.env.GEMINI_API_KEY) },
    { id: 'openai', label: 'OpenAI', configured: Boolean(process.env.OPENAI_API_KEY) },
  ];
  const configuredCount = providers.filter((provider) => provider.configured).length;
  const geminiConfigured = providers.find((provider) => provider.id === 'gemini')?.configured ?? false;
  const openaiConfigured = providers.find((provider) => provider.id === 'openai')?.configured ?? false;
  const anthropicConfigured = providers.find((provider) => provider.id === 'anthropic')?.configured ?? false;
  const runtimeModels = parseModelList(
    process.env.GEMINI_RUNTIME_MODELS,
    process.env.GEMINI_RUNTIME_MODEL || 'gemini-3-flash-preview',
  );
  const reflectionModels = parseModelList(
    process.env.GEMINI_REFLECTION_MODELS,
    process.env.GEMINI_REFLECTION_MODEL || process.env.GEMINI_RUNTIME_MODEL || 'gemini-3-pro-preview',
  );
  const primaryRuntime = geminiConfigured
    ? humanizeModelName(runtimeModels[0] || 'gemini-3-flash-preview')
    : openaiConfigured
      ? humanizeModelName('gpt-4o-mini')
      : anthropicConfigured
        ? humanizeModelName('claude-sonnet-4-20250514')
        : 'Deterministic fallback';
  const primaryReflection = geminiConfigured
    ? humanizeModelName(reflectionModels[0] || 'gemini-3-pro-preview')
    : 'SAGE standby';
  const runtimeFailover: string[] = [];
  const latestModel = latestEvent?.model || '';
  const latestLowerModel = latestModel.toLowerCase();
  const openAiFailoverActive = Boolean(
    latestEvent &&
    geminiConfigured &&
    openaiConfigured &&
    latestLowerModel.includes('gpt-4o-mini'),
  );
  const providerErrorHints = readProviderErrorHints();

  if (geminiConfigured) {
    if (openaiConfigured) runtimeFailover.push('OpenAI');
    if (anthropicConfigured) runtimeFailover.push('Claude');
  } else if (openaiConfigured && anthropicConfigured) {
    runtimeFailover.push('Claude');
  }

  let state = 'idle';
  let label = 'IDLE';
  let note = 'LLM providers are configured, but no billed inference or reflection has run yet.';
  let fallbackReason: string | null = null;

  if (latestEvent) {
    if (hasVerifiedTxHash(latestEvent)) {
      state = 'live_api';
      label = 'LIVE API';
      note = `${latestEvent.model || latestEvent.eventName || 'Compute'} billed as ${latestEvent.type || 'inference'} via ${formatBillingMode(latestEvent.mode)}.`;
    } else if (latestEvent.referenceId) {
      state = 'verifying';
      label = 'VERIFYING';
      note = `${latestEvent.model || latestEvent.eventName || 'Compute'} has a Circle transaction reference, but its on-chain Arc hash is still being resolved.`;
    } else {
      state = 'fallback';
      label = 'FALLBACK';
      note = openAiFailoverActive
        ? 'Gemini 3 was attempted first, but the current Gemini keys are not completing requests; OpenAI GPT-4o mini is serving as the configured failover.'
        : `${latestEvent.model || latestEvent.eventName || 'Compute'} used a fallback billing receipt because no verified Arc settlement hash is available yet.`;
      fallbackReason = openAiFailoverActive
        ? 'OpenAI failover active after Gemini 3 attempts did not complete. Check Gemini quota/model access if judges need live Gemini output visible.'
        : 'Fallback billing receipt active because the Arc settlement hash was not produced by the current signer path.';
    }
  } else if (configuredCount === 0) {
    state = 'no_keys';
    label = 'NO KEYS';
    note = 'No Anthropic, Gemini, or OpenAI API keys configured. Kairos is using deterministic fallback reasoning.';
    fallbackReason = 'Deterministic reasoning fallback active because no LLM API keys are configured.';
  }

  return {
    state,
    label,
    note,
    subtitle: `Agent pays per LLM inference and SAGE reflection · Circle Nanopayments · ${primaryRuntime} runtime · ${geminiConfigured ? `${primaryReflection} SAGE reflection` : primaryReflection}${runtimeFailover.length ? ` · ${joinFlow(runtimeFailover)} failover` : ''}`,
    providers,
    providerErrorHints,
    apiKeysConfigured: configuredCount > 0,
    runtimeModels,
    reflectionModels,
    lastComputeAt: safeIsoDate(latestEvent?.confirmedAt),
    lastComputeModel: latestEvent?.model ?? null,
    lastComputeType: latestEvent?.type ?? null,
    lastSettlementMode: latestEvent?.mode ?? null,
    realTxns: billing.t3RealTxns,
    pendingTxns: billing.t3PendingTxns,
    totalEvents: billing.t3Events.length,
    fallbackReason,
    sage: {
      enabled: sage.enabled,
      lastReflection: sage.lastReflection,
      pendingOutcomes: sage.pendingOutcomes,
      reflectionCount: sage.reflectionCount,
    },
  };
}

function buildTrack4Status(agentState: ReturnType<typeof getAgentState>) {
  const cliStatus = getCliStatus();
  const actions = getTradeCheckpoints(50)
    .map((checkpoint) => {
      const execution = getCheckpointExecution(checkpoint);
      return {
        id: checkpoint.id,
        timestamp: checkpoint.timestamp,
        direction: checkpoint.strategyOutput.signal.direction,
        notionalUsd: execution.notionalUsd,
        execution,
      };
    })
    .filter((entry) => entry.execution.requested && entry.direction !== 'NEUTRAL');

  const settlementRefs = new Set(
    actions
      .map((action) => action.execution.settlementTxHash || action.execution.microSettlement.referenceId || null)
      .filter((value): value is string => Boolean(value)),
  );
  const recentEvents = getMicroCommerceEvents(50)
    .filter((event) => {
      const ref = event.txHash || event.referenceId || '';
      return ref ? !settlementRefs.has(ref) : true;
    });
  const microStats = {
    total: recentEvents.length,
    confirmed: recentEvents.filter((event) => event.status === 'confirmed').length,
    pending: recentEvents.filter((event) => event.status === 'pending').length,
    fallback: recentEvents.filter((event) => event.status === 'fallback').length,
    totalVolumeUsdc: recentEvents.reduce((sum, event) => sum + event.amountUsdc, 0),
    confirmedVolumeUsdc: recentEvents
      .filter((event) => event.status === 'confirmed')
      .reduce((sum, event) => sum + event.amountUsdc, 0),
    latest: recentEvents[0] ?? null,
  };

  const counts = {
    arcSettled: 0,
    krakenLive: 0,
    krakenPaper: 0,
    localOnly: 0,
    skipped: 0,
  };
  let settledVolumeUsd = 0;
  let arcMicroCommerceCount = 0;

  for (const action of actions) {
    switch (action.execution.executionMode) {
      case 'arc_settled':
        counts.arcSettled += 1;
        settledVolumeUsd += action.notionalUsd;
        if (action.execution.microSettlement?.attempted) {
          arcMicroCommerceCount += 1;
        }
        break;
      case 'kraken_live':
        counts.krakenLive += 1;
        break;
      case 'kraken_paper':
        counts.krakenPaper += 1;
        break;
      case 'local_only':
        counts.localOnly += 1;
        break;
      default:
        counts.skipped += 1;
        break;
    }
  }

  const latestAction = actions.length > 0 ? actions[actions.length - 1] : null;
  const latestCommerce = microStats.latest;
  const latestActionTime = latestAction?.execution.settledAt || latestAction?.timestamp || null;
  const latestCommerceTime = latestCommerce?.timestamp || null;
  const commerceIsLatest = Boolean(
    latestCommerceTime &&
    (!latestActionTime || Date.parse(latestCommerceTime) >= Date.parse(latestActionTime)),
  );
  counts.arcSettled += microStats.confirmed;
  counts.localOnly += microStats.fallback;
  counts.skipped += microStats.pending;
  settledVolumeUsd += microStats.confirmedVolumeUsdc;

  let state = 'idle';
  let label = 'IDLE';
  let note = 'Awaiting approved actions to settle.';

  if (microStats.confirmed > 0) {
    state = 'arc_settled';
    label = 'ARC SETTLED';
    note = `${microStats.confirmed} real micro-commerce checkout(s) settled on Arc in USDC.`;
  } else if (counts.arcSettled > 0) {
    state = 'arc_settled';
    label = 'ARC SETTLED';
    note = arcMicroCommerceCount > 0
      ? `${counts.arcSettled} approved action(s) settled on Arc with USDC via Circle Wallet micro-commerce receipts.`
      : `${counts.arcSettled} approved action(s) settled on Arc with USDC.`;
  } else if (counts.krakenLive > 0) {
    state = 'kraken_live';
    label = 'KRAKEN LIVE';
    note = 'Approved actions reached live Kraken execution, but not Arc settlement.';
  } else if (counts.krakenPaper > 0) {
    state = 'kraken_paper';
    label = 'PAPER EXECUTION';
    note = 'Approved actions executed in Kraken paper mode; they are not on-chain settlements.';
  } else if (counts.localOnly > 0) {
    state = 'local_only';
    label = 'LOCAL ONLY';
    note = 'Approved actions were recorded locally without confirmed external settlement.';
  } else if (microStats.pending > 0) {
    state = 'verifying';
    label = 'VERIFYING';
    note = 'A Track 4 micro-commerce checkout was submitted and is waiting for an Arc hash.';
  }

  return {
    state,
    label,
    note,
    counts,
    actionsRecorded: actions.length + microStats.total,
    settledVolumeUsd,
    lastSettlementAt: commerceIsLatest ? latestCommerceTime : (latestAction?.execution.settledAt ?? null),
    latestMode: commerceIsLatest ? latestCommerce?.settlementMode ?? null : latestAction?.execution.executionMode ?? null,
    recentEvents: recentEvents.slice(0, 8),
    microCommerce: microStats,
    routerReady: Boolean((process.env.MODE || 'simulation') === 'live' && agentState.agentId && config.riskRouterAddress),
    kraken: {
      cliInstalled: cliStatus.installed,
      apiKeyConfigured: cliStatus.apiKeyConfigured,
      paperTrading: cliStatus.paperTrading,
    },
  };
}

type LedgerStatus = 'confirmed' | 'pending' | 'fallback' | 'local' | 'paper' | 'audit';

interface LedgerTransaction {
  id: string;
  timestamp: string;
  trackKey: 't1' | 't2' | 't3' | 't4' | 'ops';
  track: string;
  category: string;
  source: string;
  eventName: string;
  amountUsdc: number;
  mode: string;
  status: LedgerStatus;
  txHash: string | null;
  referenceId: string | null;
  explorerUrl: string | null;
  description: string;
  documentLinks?: CommerceDocumentLinks | null;
}

function verifiedHash(txHash: string | null | undefined): string | null {
  if (!txHash) return null;
  return hasVerifiedTxHash({ txHash }) ? txHash : null;
}

function receiptStatus(receipt: NanopaymentReceipt): LedgerStatus {
  if (hasVerifiedTxHash(receipt)) return 'confirmed';
  if (receipt.verificationState === 'fallback' || receipt.mode === 'fallback') return 'fallback';
  if (receipt.referenceId) return 'pending';
  return 'pending';
}

function receiptTimestamp(receipt: NanopaymentReceipt): string {
  const timestamp = receipt.confirmedAt || Date.now();
  return new Date(timestamp).toISOString();
}

function explorerUrl(txHash: string | null): string | null {
  return txHash ? `https://testnet.arcscan.app/tx/${txHash}` : null;
}

function safeIsoDate(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function backfillBillingDocumentBundles(): void {
  for (const receipt of billingStore.t1Events) ensureReceiptDocumentBundle('t1', receipt);
  for (const receipt of billingStore.t2Events) ensureReceiptDocumentBundle('t2', receipt);
  for (const receipt of billingStore.t3Events) ensureReceiptDocumentBundle('t3', receipt);
  getMicroCommerceEvents(200);
}

function buildDocumentVault(limit: number) {
  backfillBillingDocumentBundles();
  const cappedLimit = Math.min(Math.max(limit, 1), 500);
  const allBundles = listAllCommerceDocumentBundles();
  const bundles = allBundles.slice(0, cappedLimit);
  const summary = allBundles.reduce<{
    total: number;
    byTrack: Record<DocumentTrackKey, number>;
    byStatus: Record<string, number>;
  }>(
    (acc, bundle) => {
      acc.total += 1;
      acc.byTrack[bundle.trackKey] = (acc.byTrack[bundle.trackKey] || 0) + 1;
      acc.byStatus[bundle.settlement.status] = (acc.byStatus[bundle.settlement.status] || 0) + 1;
      return acc;
    },
    {
      total: 0,
      byTrack: {} as Record<DocumentTrackKey, number>,
      byStatus: {} as Record<string, number>,
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    count: allBundles.length,
    visibleCount: bundles.length,
    summary,
    bundles,
  };
}

function receiptLedgerEntry(
  receipt: NanopaymentReceipt,
  index: number,
  trackKey: 't1' | 't2' | 't3',
  track: string,
  category: string,
): LedgerTransaction {
  const txHash = verifiedHash(receipt.txHash);
  const source = receipt.source || receipt.model || receipt.type || 'Kairos';
  const eventName = receipt.eventName || category;
  const bundle = ensureReceiptDocumentBundle(trackKey, receipt);
  return {
    id: `${trackKey}-${receipt.confirmedAt || Date.now()}-${index}`,
    timestamp: receiptTimestamp(receipt),
    trackKey,
    track,
    category,
    source,
    eventName,
    amountUsdc: receipt.amount || 0,
    mode: receipt.mode || 'nanopayment',
    status: receiptStatus(receipt),
    txHash,
    referenceId: receipt.referenceId || null,
    explorerUrl: explorerUrl(txHash),
    description: `${eventName} paid for ${source}`,
    documentLinks: bundle.documents || getCommerceDocumentLinks({
      eventId: buildReceiptDocumentEventId(trackKey, receipt),
      txHash,
      referenceId: receipt.referenceId || null,
    }),
  };
}

function eventNameFromBundle(bundle: CommerceDocumentBundle): string {
  if (bundle.trigger.startsWith('governance-')) return bundle.trigger.slice('governance-'.length);
  if (bundle.trigger.startsWith('api-')) return bundle.trigger.slice('api-'.length);
  if (bundle.trigger === 'sage-reflection') return 'compute-sage';
  if (bundle.trigger === 'runtime-inference') return 'compute-llm';
  return bundle.item || bundle.category;
}

function persistedReceiptLedgerEntries(): LedgerTransaction[] {
  return listAllCommerceDocumentBundles()
    .filter((bundle) => bundle.trackKey === 't1' || bundle.trackKey === 't2' || bundle.trackKey === 't3')
    .map((bundle, index) => {
      const txHash = verifiedHash(bundle.settlement.txHash);
      const trackKey = bundle.trackKey as 't1' | 't2' | 't3';

      return {
        id: `doc-${bundle.eventId}-${index}`,
        timestamp: bundle.createdAt,
        trackKey,
        track: bundle.trackLabel,
        category: bundle.category,
        source: bundle.seller || 'Kairos',
        eventName: eventNameFromBundle(bundle),
        amountUsdc: bundle.settlement.amountUsdc || 0,
        mode: bundle.settlement.mode || 'nanopayment',
        status: bundle.settlement.status as LedgerStatus,
        txHash,
        referenceId: bundle.settlement.referenceId || null,
        explorerUrl: bundle.settlement.explorerUrl || explorerUrl(txHash),
        description: bundle.description,
        documentLinks: bundle.documents || null,
      };
    });
}

function checkpointLedgerEntries(limit: number): LedgerTransaction[] {
  return getCheckpoints(limit)
    .filter((checkpoint) => {
      const execution = getCheckpointExecution(checkpoint);
      return execution.requested || Boolean(checkpoint.onChainTxHash);
    })
    .map((checkpoint, index) => {
      const execution = getCheckpointExecution(checkpoint);
      const txHash = verifiedHash(execution.settlementTxHash || checkpoint.onChainTxHash || null);
      const direction = checkpoint.strategyOutput.signal.direction;
      const pair = config.tradingPair || 'WETH/USDC';
      const mode = execution.executionMode || 'local_only';
      const amountUsdc = execution.microSettlement.amountUsdc ?? 0;
      const status: LedgerStatus = txHash
        ? 'confirmed'
        : execution.settlementStatus === 'paper'
          ? 'paper'
          : execution.settlementStatus === 'local_only'
            ? 'local'
            : 'pending';

      return {
        id: `t4-${checkpoint.id}-${index}`,
        timestamp: execution.settledAt || checkpoint.timestamp,
        trackKey: 't4' as const,
        track: 'Track 04',
        category: 'Real-time micro-commerce',
        source: execution.settlementVenue || mode,
        eventName: direction === 'NEUTRAL' ? 'approved-action' : `${direction.toLowerCase()}-action`,
        amountUsdc,
        mode,
        status,
        txHash,
        referenceId: execution.microSettlement.referenceId || execution.kraken.orderId || null,
        explorerUrl: explorerUrl(txHash),
        description: `${direction} ${pair} action for ${execution.notionalUsd.toFixed(2)} USDC notional via ${mode}`,
        documentLinks: getCommerceDocumentLinks({
          checkpointId: checkpoint.id,
          txHash,
          referenceId: execution.microSettlement.referenceId || execution.kraken.orderId || null,
        }),
      };
    });
}

function microCommerceLedgerEntries(limit: number): LedgerTransaction[] {
  return getMicroCommerceEvents(limit).map((event: MicroCommerceEvent, index) => ({
    id: `t4-mc-${event.id}-${index}`,
    timestamp: event.timestamp,
    trackKey: 't4' as const,
    track: 'Track 04',
    category: 'Real-time micro-commerce',
    source: event.seller,
    eventName: event.item,
    amountUsdc: event.amountUsdc,
    mode: event.settlementMode,
    status: event.status,
    txHash: event.txHash,
    referenceId: event.referenceId,
    explorerUrl: event.explorerUrl,
    description: event.description,
    documentLinks: getCommerceDocumentLinks({
      eventId: event.id,
      checkpointId: event.checkpointId,
      txHash: event.txHash,
      referenceId: event.referenceId,
    }),
  }));
}

function operatorLedgerEntries(limit: number): LedgerTransaction[] {
  return getOperatorActionReceipts(limit).map((receipt, index) => ({
    id: `ops-${receipt.id}-${index}`,
    timestamp: receipt.timestamp,
    trackKey: 'ops' as const,
    track: 'Operator',
    category: 'Human oversight',
    source: receipt.actor,
    eventName: receipt.action,
    amountUsdc: 0,
    mode: receipt.signatureVerification ? 'eip-1271' : 'local-operator',
    status: receipt.signatureVerification?.valid === false ? 'fallback' : 'audit',
    txHash: null,
    referenceId: receipt.id,
    explorerUrl: null,
    description: `${receipt.action} -> ${receipt.modeAfter}: ${receipt.reason}`,
    documentLinks: null,
  }));
}

function buildTransactionLedger(limit: number) {
  const cappedLimit = Math.min(Math.max(limit, 1), 1000);
  const checkpointEntries = checkpointLedgerEntries(cappedLimit);
  const settlementRefs = new Set(
    checkpointEntries
      .map((entry) => entry.txHash || entry.referenceId || null)
      .filter((value): value is string => Boolean(value)),
  );
  const microEntries = microCommerceLedgerEntries(cappedLimit)
    .filter((entry) => {
      const ref = entry.txHash || entry.referenceId || '';
      return ref ? !settlementRefs.has(ref) : true;
    });
  const receiptEntries = persistedReceiptLedgerEntries();
  const records: LedgerTransaction[] = [
    ...receiptEntries,
    ...microEntries,
    ...checkpointEntries,
    ...operatorLedgerEntries(Math.min(cappedLimit, 200)),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const visible = records.slice(0, cappedLimit);
  const summary = records.reduce(
    (acc, item) => {
      acc.total += 1;
      acc.totalSpendUsdc += item.amountUsdc;
      acc.byStatus[item.status] = (acc.byStatus[item.status] || 0) + 1;
      acc.byTrack[item.trackKey] = (acc.byTrack[item.trackKey] || 0) + 1;
      if (item.status === 'confirmed') acc.confirmed += 1;
      if (item.status === 'pending') acc.pending += 1;
      if (item.status === 'fallback') acc.fallback += 1;
      return acc;
    },
    {
      total: 0,
      confirmed: 0,
      pending: 0,
      fallback: 0,
      totalSpendUsdc: 0,
      byStatus: {} as Record<string, number>,
      byTrack: {} as Record<string, number>,
    },
  );

  summary.totalSpendUsdc = Math.round(summary.totalSpendUsdc * 1_000_000) / 1_000_000;

  return {
    generatedAt: new Date().toISOString(),
    limit: cappedLimit,
    visibleCount: visible.length,
    summary,
    transactions: visible,
  };
}

function roundUsdc(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function buildTrack4ProofLedger(limit: number) {
  const cappedLimit = Math.min(Math.max(limit, 1), 1000);
  const checkpointEntries = checkpointLedgerEntries(cappedLimit);
  const settlementRefs = new Set(
    checkpointEntries
      .map((entry) => entry.txHash || entry.referenceId || null)
      .filter((value): value is string => Boolean(value)),
  );

  const microEntries = microCommerceLedgerEntries(cappedLimit)
    .filter((entry) => {
      const ref = entry.txHash || entry.referenceId || '';
      return ref ? !settlementRefs.has(ref) : true;
    });

  return [...microEntries, ...checkpointEntries]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function buildUnifiedArcProofSummary(limit = 1000) {
  const billing = billingStore.toJSON();
  const track4Entries = buildTrack4ProofLedger(limit);
  const track4Summary = track4Entries.reduce(
    (acc, entry) => {
      acc.total += 1;
      acc.totalSpendUsdc += entry.amountUsdc || 0;
      if (entry.status === 'confirmed') acc.confirmed += 1;
      if (entry.status === 'pending') acc.pending += 1;
      if (entry.status === 'fallback') acc.fallback += 1;
      return acc;
    },
    {
      total: 0,
      confirmed: 0,
      pending: 0,
      fallback: 0,
      totalSpendUsdc: 0,
    },
  );

  const realTxns = billing.realTxns + track4Summary.confirmed;
  const pendingTxns = billing.pendingTxns + track4Summary.pending;
  const totalEvents = billing.totalEvents + track4Summary.total;
  const totalSpend = roundUsdc(billing.totalSpend + track4Summary.totalSpendUsdc);

  return {
    ...billing,
    t4Events: track4Entries.slice(0, 20),
    t4RealTxns: track4Summary.confirmed,
    t4PendingTxns: track4Summary.pending,
    t4FallbackTxns: track4Summary.fallback,
    t4Spend: roundUsdc(track4Summary.totalSpendUsdc),
    totalTxns: realTxns,
    realTxns,
    pendingTxns,
    totalEvents,
    totalSpend,
    meetsTxnRequirement: realTxns >= (billing.txnRequirementTarget || 50),
  };
}

function buildExperienceSummary() {
  const safeSection = <T>(label: string, builder: () => T, fallback: T): T => {
    try {
      return builder();
    } catch (error) {
      console.warn(`[DASHBOARD] Failed to build ${label}:`, error);
      return fallback;
    }
  };

  const state = safeSection<any>('agent state', () => getAgentState(), {
    running: false,
    cycleCount: 0,
    risk: {
      capital: 0,
      openPositions: [] as any[],
    },
    agentId: 0,
  });

  const unifiedProof = safeSection<any>('unified proof summary', () => buildUnifiedArcProofSummary(), {
    realTxns: 0,
    pendingTxns: 0,
    totalSpend: 0,
    totalEvents: 0,
    meetsTxnRequirement: false,
  });

  const riskState = state.risk || {};
  const runtimeStatus = {
    mode: getRuntimeConfig(),
    running: Boolean(state.running),
    pair: config.tradingPair,
    totalCycles: Number(state.cycleCount || 0),
    trustScore: getLastTrustScore(state.agentId) ?? 95,
    capital: Number(riskState.capital || 0),
    openPositions: Array.isArray(riskState.openPositions) ? riskState.openPositions.length : 0,
    mcp: safeSection<any>('MCP summary', () => buildMcpSummary(), {
      endpoint: config.mcpEndpoint,
      tools: 0,
      resources: 0,
      prompts: 0,
      links: {
        root: '/mcp',
        info: '/mcp/info',
        agentCard: '/.well-known/agent-card.json',
      },
      toolVisibility: {},
      resourceVisibility: {},
      promptVisibility: {},
      note: 'Governed surface for agents, operators, and audit clients.',
    }),
  };

  const track1 = safeSection<any>('Track 1 summary', () => buildTrack1Status(), {
    state: 'idle',
    label: 'IDLE',
    note: 'Track 1 summary unavailable.',
    subtitle: '',
    realTxns: 0,
    pendingTxns: 0,
    totalEvents: 0,
    activeStageCount: 0,
    spend: 0,
    stages: [] as Array<{ name: string; count: number; realTxns: number; pendingTxns: number; spend: number }>,
    latestEvent: null as any,
  });

  const track2 = safeSection<any>('Track 2 summary', () => buildTrack2Status(), {
    state: 'idle',
    label: 'IDLE',
    note: 'Track 2 summary unavailable.',
    subtitle: '',
    endpoint: null as string | null,
    mode: 'unknown',
    reason: null as string | null,
    realTxns: 0,
    pendingTxns: 0,
    totalEvents: 0,
    sourceLabels: {} as Record<string, string>,
  });

  const track3 = safeSection<any>('Track 3 summary', () => buildTrack3Status(), {
    state: 'idle',
    label: 'IDLE',
    note: 'Track 3 summary unavailable.',
    subtitle: '',
    providers: [] as Array<{ id: string; label: string; configured: boolean }>,
    providerErrorHints: [] as string[],
    apiKeysConfigured: false,
    runtimeModels: [] as string[],
    reflectionModels: [] as string[],
    lastComputeAt: null as string | null,
    lastComputeModel: null as string | null,
    lastComputeType: null as string | null,
    lastSettlementMode: null as string | null,
    realTxns: 0,
    pendingTxns: 0,
    totalEvents: 0,
    fallbackReason: null as string | null,
    sage: {
      enabled: false,
      lastReflection: null as string | null,
      pendingOutcomes: 0,
      reflectionCount: 0,
    },
  });

  const track4 = safeSection<any>('Track 4 summary', () => buildTrack4Status(state), {
    state: 'idle',
    label: 'IDLE',
    note: 'Track 4 summary unavailable.',
    counts: {
      arcSettled: 0,
      krakenLive: 0,
      krakenPaper: 0,
      localOnly: 0,
      skipped: 0,
    },
    actionsRecorded: 0,
    settledVolumeUsd: 0,
    lastSettlementAt: null as string | null,
    latestMode: null as string | null,
    recentEvents: [] as MicroCommerceEvent[],
    microCommerce: {
      total: 0,
      confirmed: 0,
      pending: 0,
      fallback: 0,
      totalVolumeUsdc: 0,
      confirmedVolumeUsdc: 0,
      latest: null as MicroCommerceEvent | null,
    },
    routerReady: false,
    kraken: {
      cliInstalled: false,
      apiKeyConfigured: false,
      paperTrading: true,
    },
  });

  const transactions = safeSection<any>('transaction ledger', () => {
    const ledger = buildTransactionLedger(1000);
    const recentConfirmedProofs = ledger.transactions
      .filter((entry) => entry.status === 'confirmed' && Boolean(entry.txHash))
      .slice(0, 8);
    const recentPendingProofs = ledger.transactions
      .filter((entry) => entry.status === 'pending')
      .slice(0, 6);
    return {
      summary: ledger.summary,
      total: ledger.summary.total,
      visibleCount: ledger.visibleCount,
      recentConfirmedProofs,
      recentPendingProofs,
    };
  }, {
    summary: {
      total: 0,
      confirmed: 0,
      pending: 0,
      fallback: 0,
      totalSpendUsdc: 0,
      byStatus: {} as Record<string, number>,
      byTrack: {} as Record<string, number>,
    },
    total: 0,
    visibleCount: 0,
    recentConfirmedProofs: [] as LedgerTransaction[],
    recentPendingProofs: [] as LedgerTransaction[],
  });

  const documents = safeSection<any>('document vault', () => {
    const vault = buildDocumentVault(500);
    return {
      summary: vault.summary,
      total: vault.count,
      visibleCount: vault.visibleCount,
      recent: vault.bundles.slice(0, 8),
    };
  }, {
    summary: {
      total: 0,
      byTrack: {} as Record<DocumentTrackKey, number>,
      byStatus: {} as Record<string, number>,
    },
    total: 0,
    visibleCount: 0,
    recent: [] as CommerceDocumentBundle[],
  });

  const executionStats = safeSection<any>('execution stats', () => getTradeStats(), {
    totalTrades: 0,
    totalPnl: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    bestTrade: 0,
    worstTrade: 0,
    avgDurationMs: 0,
  });

  const recentExecutions = safeSection<any>('recent executions', () => (
    getRecentTrades(6).map((trade) => ({
      ...trade,
      commerceDocuments: getCommerceDocumentLinks({
        txHash: trade.txHash || null,
      }),
    }))
  ), [] as any[]);

  const trackCoverage = [
    track1.totalEvents > 0 || track1.realTxns > 0 || track1.pendingTxns > 0,
    track2.totalEvents > 0 || track2.realTxns > 0 || track2.pendingTxns > 0,
    track3.totalEvents > 0 || track3.realTxns > 0 || track3.pendingTxns > 0,
    track4.actionsRecorded > 0 || track4.counts.arcSettled > 0,
  ].filter(Boolean).length;
  const latestConfirmedProof = transactions.recentConfirmedProofs[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    runtime: runtimeStatus,
    northStar: {
      realTxns: unifiedProof.realTxns,
      pendingTxns: unifiedProof.pendingTxns,
      totalSpend: unifiedProof.totalSpend,
      totalEvents: unifiedProof.totalEvents,
      latestConfirmedTxHash: latestConfirmedProof?.txHash || null,
      latestConfirmedAt: latestConfirmedProof?.timestamp || null,
      trackCoverage,
      trackCoverageLabel: `${trackCoverage}/4 tracks represented`,
      meetsTxnRequirement: unifiedProof.meetsTxnRequirement,
    },
    tracks: {
      track1,
      track2,
      track3,
      track4,
    },
    transactions,
    documents,
    executions: {
      stats: executionStats,
      recent: recentExecutions,
    },
    attention: {
      pending: unifiedProof.pendingTxns,
      fallback: Number(transactions.summary.fallback || 0),
      localOnly: Number(transactions.summary.byStatus.local || 0),
      paper: Number(transactions.summary.byStatus.paper || 0),
      audit: Number(transactions.summary.byStatus.audit || 0),
    },
  };
}

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 600;

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > RATE_MAX_REQUESTS) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }
  next();
}

// Periodic cleanup of stale rate-limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, RATE_WINDOW_MS);

let httpServer: Server | null = null;

export function stopDashboard(): Promise<void> {
  return new Promise((resolve) => {
    if (httpServer) {
      httpServer.close(() => resolve());
    } else {
      resolve();
    }
  });
}

export function startDashboard(port: number = DASHBOARD_PORT): void {
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use(rateLimit);

  // Security headers
  app.use((_req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Default route → final production dashboard
  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kairos.html'));
  });

  // Trade history page — separate tab
  app.get(['/trades', '/execution'], (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trades.html'));
  });

  // Consolidated transaction ledger — all hackathon proof tracks in one view
  app.get(['/transactions', '/history'], (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'transactions.html'));
  });

  // Economic proof walkthrough
  app.get('/judge', (_req, res) => {
    res.redirect('/kairos');
  });

  // Reviewable preview routes - additive only, existing UIs stay in place
  app.get(['/review-ui', '/preview-ui'], (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'review-ui.html'));
  });

  app.get('/judge-preview', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'judge-preview.html'));
  });

  app.get('/console-preview', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'console-preview.html'));
  });

  // Gemini commerce studio
  app.get('/commerce', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'commerce.html'));
  });

  // Unified document vault
  app.get('/documents', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'documents.html'));
  });

  app.get(['/documents/:eventId/:kind', '/commerce/docs/:eventId/:kind'], (req, res) => {
    const eventId = decodeURIComponent(req.params.eventId || '');
    const kind = req.params.kind as CommerceDocumentKind;
    if (!['invoice', 'receipt', 'delivery-proof'].includes(kind)) {
      res.status(404).send('Unknown document type');
      return;
    }

    const bundle = getCommerceDocumentBundle(eventId);
    if (!bundle) {
      res.status(404).send('Document bundle not found');
      return;
    }

    const wantsDownload = ['1', 'true', 'yes'].includes(String(req.query.download || '').toLowerCase());
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (wantsDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${buildCommerceDocumentFilename(bundle, kind)}"`);
    }
    res.send(renderCommerceDocumentHtml(bundle, kind));
  });

  // Serve static files
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/versions', express.static(path.join(__dirname, 'versions')));

  // CORS — allow localhost and production domains
  app.use((_req, res, next) => {
    const origin = _req.headers.origin;
    const allowed = origin && (
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https:\/\/kairos\.nov-tia\.com$/.test(origin)
    );
    if (allowed) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // ── A2A Agent Discovery ──
  // Surface MCP on the main hostname so deployment can use the root domain only.
  app.use('/mcp', async (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    try {
      const upstream = await fetch(`http://127.0.0.1:3001${req.originalUrl}`, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers['x-kairos-role'] ? { 'X-Kairos-Role': String(req.headers['x-kairos-role']) } : {}),
        },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });

      const contentType = upstream.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      res.status(upstream.status).send(await upstream.text());
    } catch (error) {
      next(error);
    }
  });

  app.get('/.well-known/agent-card.json', (_req, res) => {
    const registration = buildRegistrationJson({
      agentId: config.agentId ?? undefined,
      dashboardUrl: config.dashboardUrl,
      mcpEndpoint: config.mcpEndpoint,
      a2aEndpoint: config.a2aEndpoint,
      imageUrl: config.agentImageUrl,
    });
    res.json(registration);
  });

  // ── API Routes ──

  /** Agent overview */
  app.get('/api/status', (_req, res) => {
    const state = getAgentState();
    const schedulerState = state.scheduler;
    const recentTrades = getRecentTrades(1);
    const lastClosedAt = recentTrades.length > 0 ? recentTrades[0].closedAt : null;
    const openPositions = state.risk.openPositions;
    const lastOpenedAt = openPositions.length > 0
      ? openPositions.reduce((latest: string | null, p: any) => {
          if (!p.openedAt) return latest;
          return !latest || p.openedAt > latest ? p.openedAt : latest;
        }, null as string | null)
      : null;
    const lastTradeAt = [lastClosedAt, lastOpenedAt]
      .filter(Boolean)
      .sort()
      .pop() ?? null;
    const effectiveTrustScore = getLastTrustScore(state.agentId) ?? 95;
    const trustTier = resolveTrustTier(effectiveTrustScore).tier;
    const track2 = buildTrack2Status();
    const track3 = buildTrack3Status();
    const track4 = buildTrack4Status(state);
    const mcp = buildMcpSummary();

    res.json({
      agent: {
        name: config.agentName,
        pair: config.tradingPair,
        running: state.running,
        cycleCount: state.cycleCount,
      },
      agentId: state.agentId ?? config.agentId ?? null,
      totalCycles: state.cycleCount,
      trustScore: effectiveTrustScore,
      capitalTier: trustTier,
      runtime: getRuntimeConfig(),
      heartbeat: {
        running: state.running,
        lastCycleAt: schedulerState?.lastCycleAt ?? null,
        lastTradeAt,
        uptime: schedulerState?.uptime ?? 0,
        consecutiveErrors: schedulerState?.consecutiveErrors ?? 0,
        lastError: schedulerState?.lastError ?? null,
        lastErrorAt: schedulerState?.lastErrorAt ?? null,
      },
      capital: state.risk.capital,
      market: state.market,
      risk: {
        volatility: state.risk.volatility,
        circuitBreaker: state.risk.circuitBreaker,
        openPositions: state.risk.openPositions.length,
        totalTrades: state.risk.totalTrades,
      },
      sentiment: state.sentiment ?? null,
      mcp,
      tracks: {
        track2,
        track3,
        track4,
      },
    });
  });

  app.get('/api/experience/summary', (_req, res) => {
    try {
      res.json(buildExperienceSummary());
    } catch (error) {
      console.error('[DASHBOARD] Experience summary failed:', error);
      res.status(500).json({ error: 'Failed to build experience summary' });
    }
  });

  /** Recent checkpoints */
  app.get('/api/checkpoints', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 20;
    const approvedOnly = req.query.approved === 'true';
    const source = approvedOnly ? getTradeCheckpoints(limit) : getCheckpoints(limit);
    const checkpoints = source.slice().reverse();

    res.json({
      count: checkpoints.length,
      checkpoints: checkpoints.map(cp => {
        const execution = getCheckpointExecution(cp);
        return {
          id: cp.id,
          timestamp: cp.timestamp,
          signal: cp.strategyOutput.signal.direction,
          direction: cp.strategyOutput.signal.direction,
          pair: config.tradingPair,
          confidence: cp.strategyOutput.signal.confidence,
          price: cp.strategyOutput.currentPrice,
          approved: cp.riskDecision.approved,
          explanation: cp.riskDecision.explanation,
          positionSize: cp.riskDecision.finalPositionSize,
          positionSizeUsd: execution.notionalUsd,
          artifactIpfs: cp.ipfs?.uri || null,
          ipfsCid: cp.ipfs?.cid || null,
          txHash: execution.settlementTxHash || cp.onChainTxHash || null,
          onChainTxHash: cp.onChainTxHash || null,
          commerceDocuments: getCommerceDocumentLinks({
            checkpointId: cp.id,
            txHash: execution.settlementTxHash || cp.onChainTxHash || null,
            referenceId: execution.microSettlement.referenceId || execution.kraken.orderId || null,
          }),
          execution,
        };
      }),
    });
  });

  /** Last artifact (full JSON) */
  app.get('/api/artifact/latest', (_req, res) => {
    const checkpoints = getCheckpoints(1);
    if (checkpoints.length === 0) {
      res.json({ error: 'No artifacts yet' });
      return;
    }
    res.json(checkpoints[0].artifact);
  });

  /** Full artifact by checkpoint index (1-based from most recent) */
  app.get('/api/artifact/:idx', (req, res) => {
    const idx = parseInt(req.params.idx);
    if (isNaN(idx) || idx < 1) { res.json({ error: 'Invalid index' }); return; }
    const checkpoints = getCheckpoints(idx);
    const cp = checkpoints[idx - 1];
    if (!cp) { res.json({ error: 'Checkpoint not found' }); return; }
    res.json(cp.artifact || { error: 'No artifact for this checkpoint' });
  });

  /** List on-disk artifacts with IPFS CIDs */
  app.get('/api/artifacts', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    try {
      const dir = path.join(process.cwd(), 'artifacts');
      if (!fs.existsSync(dir)) { res.json({ count: 0, artifacts: [] }); return; }
      const allFiles = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'));
      const files = allFiles.sort().reverse().slice(0, limit);
      const artifacts = files.map((f: string) => {
        const match = f.match(/^(.+Z)-(.+)\.json$/);
        return {
          file: f,
          timestamp: match ? match[1].replace(/-/g, ':').replace(/T(\d+):(\d+):(\d+):(\d+)/, 'T$1:$2:$3.$4') : f,
          cid: match ? match[2] : null,
          ipfsUrl: match ? `${config.pinataGateway.replace(/\/+$/, '')}/${match[2]}` : null,
        };
      }).filter(a => a.cid && !a.cid.startsWith('QmMock'));
      res.json({ count: artifacts.length, total: allFiles.length, artifacts });
    } catch (e) {
      res.json({ count: 0, artifacts: [], error: String(e) });
    }
  });

  app.get(['/api/artifacts/:cid', '/artifacts/:cid'], (req, res) => {
    const cid = decodeURIComponent(req.params.cid || '').trim();
    if (!cid) {
      res.status(400).json({ error: 'Artifact CID is required' });
      return;
    }

    try {
      const dir = path.join(process.cwd(), 'artifacts');
      if (!fs.existsSync(dir)) {
        res.status(404).json({ error: 'Artifact backup directory not found' });
        return;
      }

      const file = fs.readdirSync(dir).find((entry: string) => entry.endsWith(`-${cid}.json`));
      if (!file) {
        res.status(404).json({ error: 'Artifact backup not found' });
        return;
      }

      const wantsDownload = ['1', 'true', 'yes'].includes(String(req.query.download || '').toLowerCase());
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (wantsDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
      }
      res.send(content);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** Positions */
  app.get('/api/positions', (_req, res) => {
    const state = getAgentState();
    res.json({ positions: state.risk.openPositions });
  });

  /** Governance policy */
  app.get('/api/governance', (_req, res) => {
    res.json({
      strategy: config.strategy,
      riskLimits: {
        maxPositionPct: config.maxPositionPct,
        maxDailyLossPct: config.maxDailyLossPct,
        maxDrawdownPct: config.maxDrawdownPct,
      },
    });
  });

  /** Reputation evolution */
  app.get('/api/reputation/history', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({ history: getReputationTimeline(getAgentState().agentId, limit) });
  });

  /** Operator control state */
  app.get('/api/operator/state', (_req, res) => {
    res.json(getOperatorControlState());
  });

  app.get('/api/operator/actions', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 20;
    res.json({ actions: getOperatorActionReceipts(limit) });
  });

  app.post('/api/operator/pause', (req, res) => {
    const receipt = pauseTrading(req.body?.reason || 'manual pause from dashboard', req.body?.actor || 'dashboard');
    res.json({ ok: true, receipt, state: getOperatorControlState() });
  });

  app.post('/api/operator/resume', (req, res) => {
    const receipt = resumeTrading(req.body?.reason || 'manual resume from dashboard', req.body?.actor || 'dashboard');
    res.json({ ok: true, receipt, state: getOperatorControlState() });
  });

  app.post('/api/operator/emergency-stop', (req, res) => {
    const receipt = emergencyStop(req.body?.reason || 'emergency stop from dashboard', req.body?.actor || 'dashboard');
    res.json({ ok: true, receipt, state: getOperatorControlState() });
  });

  /** Closed trade history (persistent — survives restarts) */
  app.get(['/api/trades', '/api/executions'], (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    res.json({
      trades: getRecentTrades(limit).map((trade) => ({
        ...trade,
        commerceDocuments: getCommerceDocumentLinks({
          txHash: trade.txHash || null,
        }),
      })),
    });
  });

  /** Trade history as CSV download */
  app.get(['/api/trades/csv', '/api/executions/csv'], (_req, res) => {
    const trades = loadClosedTrades();
    const header = 'ID,Asset,Side,Size,Entry Price,Exit Price,PnL ($),PnL (%),Reason,Opened At,Closed At,Duration (min),IPFS CID,Tx Hash';
    const rows = trades.map(t => [
      t.id,
      t.asset,
      t.side,
      t.size.toFixed(6),
      t.entryPrice.toFixed(2),
      t.exitPrice.toFixed(2),
      t.pnl.toFixed(2),
      t.pnlPct.toFixed(2),
      t.reason,
      t.openedAt,
      t.closedAt,
      Math.round(t.durationMs / 60000),
      t.ipfsCid || '',
      t.txHash || '',
    ].join(','));
    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="kairos-executions.csv"');
    res.send(csv);
  });

  /** Trade statistics */
  app.get(['/api/trades/stats', '/api/executions/stats'], (_req, res) => {
    const stats = getTradeStats();
    // Use actual capital for PnL instead of summing trades (trade log may be incomplete)
    const state = getAgentState();
    const capital = state.risk?.capital ?? 10_000;
    stats.totalPnl = Math.round((capital - 10_000) * 100) / 100;
    res.json(stats);
  });

  /** Risk-adjusted performance metrics (Sharpe, Sortino, Calmar, Max DD) */
  app.get('/api/performance', (_req, res) => {
    const trades = loadClosedTrades();
    const stats = getTradeStats();

    // Use actual capital for authoritative PnL
    const state = getAgentState();
    const currentCapital = state.risk?.capital ?? 10_000;
    stats.totalPnl = Math.round((currentCapital - 10_000) * 100) / 100;

    // Build equity curve from closed trades, then scale final point to match real capital
    const initialCapital = 10_000;
    let equity = initialCapital;
    const equityPoints: EquityPoint[] = [{ timestamp: trades[0]?.closedAt || new Date().toISOString(), equity: initialCapital }];
    for (const t of trades) {
      equity += t.pnl;
      equityPoints.push({ timestamp: t.closedAt, equity });
    }
    // Correct final equity to match actual capital
    if (equityPoints.length > 0) {
      equityPoints[equityPoints.length - 1].equity = currentCapital;
    }

    const metrics = computeRiskAdjustedMetrics(
      equityPoints,
      trades.map(t => ({ pnl: t.pnl })),
    );

    res.json({
      ...stats,
      sharpeRatio: Math.round(metrics.sharpeRatio * 1000) / 1000,
      sortinoRatio: Math.round(metrics.sortinoRatio * 1000) / 1000,
      maxDrawdownPct: Math.round(metrics.maxDrawdown * 10000) / 100,
      calmarRatio: Math.round(metrics.calmarRatio * 1000) / 1000,
      profitFactor: Math.round(metrics.profitFactor * 100) / 100,
      totalReturnPct: Math.round((currentCapital - 10_000) / 10_000 * 10000) / 100,
      volatility: Math.round(metrics.volatility * 10000) / 100,
      currentEquity: Math.round(currentCapital * 100) / 100,
      equityPoints: equityPoints.length,
    });
  });

  /** Health check — for monitoring / uptime checks */
  app.get('/api/health', (_req, res) => {
    const health = getHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  /** PRISM external market intelligence */
  app.get('/api/prism', async (_req, res) => {
    try {
      const data = await fetchPrismData('ETH');
      res.json(data);
    } catch (err: any) {
      res.json({ signal: null, risk: null, sources: [], error: err.message });
    }
  });

  /** Recent logs */
  app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({ logs: getLogs(limit) });
  });

  /** Error logs */
  app.get('/api/errors', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 20;
    res.json({ errors: getErrors(limit) });
  });

  /** Kraken feed status + live ticker */
  app.get('/api/feeds/kraken', async (_req, res) => {
    const status = getKrakenFeedStatus();
    const ticker = await fetchKrakenTicker();
    res.json({ status, ticker });
  });

  /** Kraken account balance (authenticated) */
  app.get('/api/kraken/balance', async (_req, res) => {
    const balance = await fetchKrakenBalance();
    if (!balance) { res.json({ error: 'Kraken API keys not configured or request failed' }); return; }
    res.json({ balance });
  });

  /** Kraken open orders (authenticated) */
  app.get('/api/kraken/orders', async (_req, res) => {
    const orders = await fetchKrakenOpenOrders();
    if (!orders) { res.json({ error: 'Kraken API keys not configured or request failed' }); return; }
    res.json({ count: orders.length, orders });
  });

  /** Kraken trade history (authenticated) */
  app.get('/api/kraken/trades', async (_req, res) => {
    const trades = await fetchKrakenTradeHistory();
    if (!trades) { res.json({ error: 'Kraken API keys not configured or request failed' }); return; }
    res.json({ count: trades.length, trades });
  });

  /** Data feeds overview */
  app.get('/api/feeds/status', (_req, res) => {
    res.json({
      kraken: getKrakenFeedStatus(),
      krakenCli: getCliStatus(),
    });
  });

  /** Kraken CLI status + health */
  app.get('/api/kraken/cli', async (_req, res) => {
    const status = await checkCliHealth();
    res.json(status);
  });

  /** Kraken account snapshot (balance + orders + trades + CLI status) */
  app.get('/api/kraken/snapshot', async (_req, res) => {
    const snapshot = await getKrakenAccountSnapshot();
    res.json(snapshot);
  });

  /** Kraken preflight check */
  app.get('/api/kraken/preflight', async (_req, res) => {
    const result = await krakenPreflight();
    res.json(result);
  });

  /** Generate shareable trade post */
  app.get('/api/share/trade', (req, res) => {
    const checkpoints = getCheckpoints(1);
    if (checkpoints.length === 0) {
      res.json({ error: 'No checkpoints yet' });
      return;
    }
    const cp = checkpoints[0];
    const state = getAgentState();
    const post = generateTradePost({
      signal: cp.strategyOutput.signal.direction,
      confidence: cp.strategyOutput.signal.confidence,
      price: cp.strategyOutput.currentPrice,
      approved: cp.riskDecision.approved,
      explanation: cp.riskDecision.explanation,
      trustScore: getLastTrustScore(state.agentId) ?? (state.risk as any)?.trustScore ?? 95,
      artifactCid: cp.ipfs?.cid,
    });
    res.json({ post, twitterUrl: buildTwitterIntentUrl(post) });
  });

  /** Generate shareable daily summary */
  app.get('/api/share/daily', (_req, res) => {
    const state = getAgentState();
    const stats = getTradeStats();
    const currentCapital = state.risk?.capital ?? 10_000;
    const realPnl = Math.round((currentCapital - 10_000) * 100) / 100;
    const post = generateDailySummaryPost({
      trades: stats.totalTrades ?? 0,
      pnl: realPnl,
      capital: currentCapital,
      trustScore: getLastTrustScore(state.agentId) ?? (state.risk as any)?.trustScore ?? 95,
      winRate: stats.winRate ?? 0,
      artifactCount: stats.totalTrades ?? 0,
    });
    res.json({ post, twitterUrl: buildTwitterIntentUrl(post) });
  });

  /** Security status: TEE attestation + EIP-1271 capability */
  app.get('/api/security', async (_req, res) => {
    try {
      const tee = await generateAttestationSummary();
      res.json({
        teeAttestation: tee,
        eip1271: {
          enabled: true,
          verificationMethod: 'auto-detect',
          supportedTypes: ['eoa', 'eip1271-contract'],
          note: 'Every TradeIntent is EIP-1271 verified before Risk Router submission',
        },
      });
    } catch (e) {
      res.json({
        teeAttestation: null,
        eip1271: {
          enabled: true,
          verificationMethod: 'auto-detect',
          supportedTypes: ['eoa', 'eip1271-contract'],
          note: 'Every TradeIntent is EIP-1271 verified before Risk Router submission',
        },
        error: String(e),
      });
    }
  });

  /** SAGE (Self-Adapting Generative Engine) status */
  app.get('/api/sage/status', (_req, res) => {
    try {
      res.json(getSAGEStatus());
    } catch (e) {
      res.status(500).json({ error: 'Failed to get SAGE status' });
    }
  });

  /** SAGE playbook rules */
  app.get('/api/sage/playbook', (_req, res) => {
    try {
      const rules = getActivePlaybookRules();
      const status = getSAGEStatus();
      res.json({
        rules,
        totalRules: rules.length,
        maxRules: status.maxRules,
        reflectionCount: status.reflectionCount,
        lastReflection: status.lastReflection,
        weights: status.weights,
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to get SAGE playbook' });
    }
  });

  // ─── Kairos x402 / billing routes ─────────────────────────────────────────

  /** Kairos dashboard */
  app.get('/kairos', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kairos.html'));
  });

  /** Billing summary (all 4 tracks) */
  app.get('/api/billing', (_req, res) => {
    try {
      res.json(buildUnifiedArcProofSummary());
    } catch (e) {
      res.status(500).json({ error: 'Failed to get billing data' });
    }
  });

  app.get('/api/commerce/status', async (_req, res) => {
    try {
      const billing = buildUnifiedArcProofSummary();
      const state = getAgentState();
      const track4 = buildTrack4Status(state);
      const geminiConfigured = Boolean(
        process.env.GEMINI_API_KEY_PRIMARY
        || process.env.GEMINI_API_KEY_SECONDARY
        || process.env.GEMINI_API_KEY,
      );
      const gatewayBalance = await getGatewayBalanceInfo().catch((error: Error) => ({
        balance: '0',
        formatted: '0.00',
        kind: 'unconfigured' as const,
        gatewayDepositVerified: false,
        warning: error.message || 'Gateway balance unavailable',
      }));
      const documentVault = buildDocumentVault(500);
      const documentBundles = documentVault.bundles.slice(0, 6);

      res.json({
        runtime: getRuntimeConfig(),
        gemini: {
          configured: geminiConfigured,
          functionModels: parseModelList(process.env.GEMINI_FUNCTION_MODELS, 'gemini-3-flash-preview'),
          multimodalModels: parseModelList(process.env.GEMINI_MULTIMODAL_MODELS, 'gemini-3-pro-preview,gemini-3-flash-preview'),
          fallbackProvider: process.env.OPENAI_API_KEY ? 'OpenAI GPT-4o mini' : null,
        },
        settlement: {
          defaultProofUsdc: parseFloat(
            process.env.COMMERCE_PROOF_SETTLEMENT_AMOUNT_USDC
            || process.env.TRACK4_SETTLEMENT_AMOUNT_USDC
            || '0.009',
          ),
          proofCapUsdc: parseFloat(process.env.COMMERCE_PROOF_SETTLEMENT_MAX_USDC || '0.01'),
          gatewayBalance,
        },
        txProof: {
          realTxns: billing.realTxns,
          pendingTxns: billing.pendingTxns,
          totalSpend: billing.totalSpend,
          meetsTxnRequirement: billing.meetsTxnRequirement,
        },
        documents: {
          total: documentVault.count,
          recent: documentBundles,
        },
        track4,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message?.slice(0, 240) || 'Commerce status unavailable' });
    }
  });

  app.get(['/api/documents', '/api/commerce/documents'], (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 500);
      res.json(buildDocumentVault(limit));
    } catch (error: any) {
      res.status(500).json({ error: error.message?.slice(0, 240) || 'Document vault unavailable' });
    }
  });

  app.get(['/api/documents/:eventId', '/api/commerce/documents/:eventId'], (req, res) => {
    const bundle = getCommerceDocumentBundle(decodeURIComponent(req.params.eventId || ''));
    if (!bundle) {
      res.status(404).json({ error: 'Document bundle not found' });
      return;
    }
    res.json(bundle);
  });

  /** x402 wallet balance — uses Circle Wallets balance or the configured Arc address */
  app.get('/api/gateway-balance', async (_req, res) => {
    try {
      if (process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID) {
        const info = await getGatewayBalanceInfo();
        res.json(info);
        return;
      }

      const agentAddress = process.env.AGENT_WALLET_ADDRESS;
      if (!agentAddress) {
        res.json({ balance: '0', formatted: '0.00', kind: 'unconfigured', warning: 'x402 wallet not configured' });
        return;
      }

      const info = await getGatewayBalanceInfo();
      res.json(info);
    } catch (e: any) {
      res.status(500).json({ error: e.message?.slice(0, 200) || 'x402 wallet balance check failed' });
    }
  });

  app.post('/api/gemini/commerce-assistant', async (req, res) => {
    try {
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      if (!prompt) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }

      const allowSettlementActions = req.body?.allowSettlementActions === true;
      const state = getAgentState();
      const billing = buildUnifiedArcProofSummary();
      const track4 = buildTrack4Status(state);

      const tools: GeminiCommerceTool[] = [
        {
          name: 'get_gateway_balance',
          description: 'Return the current Circle wallet or Arc wallet USDC balance used for x402 and commerce readiness.',
          parameters: {
            type: 'object',
            properties: {},
          },
          handler: async () => await getGatewayBalanceInfo(),
        },
        {
          name: 'get_arc_receipt_summary',
          description: 'Return the current Arc receipt counts and spend totals for Kairos.',
          parameters: {
            type: 'object',
            properties: {},
          },
          handler: async () => {
            const latestConfirmed = [
              ...(billing.t1Events || []).map((receipt) => ({
                txHash: receipt.txHash,
                timestamp: receipt.confirmedAt || 0,
              })),
              ...(billing.t2Events || []).map((receipt) => ({
                txHash: receipt.txHash,
                timestamp: receipt.confirmedAt || 0,
              })),
              ...(billing.t3Events || []).map((receipt) => ({
                txHash: receipt.txHash,
                timestamp: receipt.confirmedAt || 0,
              })),
              ...(billing.t4Events || []).map((event: any) => ({
                txHash: event.txHash,
                timestamp: Date.parse(event.timestamp || '') || 0,
              })),
            ]
              .filter((receipt) => receipt.txHash && /^0x[a-fA-F0-9]{64}$/.test(receipt.txHash))
              .sort((a, b) => b.timestamp - a.timestamp)[0] || null;

            return {
              realTxns: billing.realTxns,
              pendingTxns: billing.pendingTxns,
              totalSpend: billing.totalSpend,
              meetsTxnRequirement: billing.meetsTxnRequirement,
              latestConfirmedTxHash: latestConfirmed?.txHash || null,
            };
          },
        },
        {
          name: 'get_track4_micro_commerce_status',
          description: 'Return Track 4 micro-commerce settlement status, recent events, and Arc settlement proof state.',
          parameters: {
            type: 'object',
            properties: {},
          },
          handler: async () => ({
            state: track4.state,
            label: track4.label,
            note: track4.note,
            actionsRecorded: track4.actionsRecorded,
            settledVolumeUsd: track4.settledVolumeUsd,
            recentEvents: getMicroCommerceEvents(5).map((event) => ({
              ...event,
              documentLinks: getCommerceDocumentLinks({
                eventId: event.id,
                checkpointId: event.checkpointId,
                txHash: event.txHash,
                referenceId: event.referenceId,
              }),
            })),
          }),
        },
        {
          name: 'preview_commerce_proof_settlement',
          description: 'Preview a small Arc USDC proof settlement for a commerce event without sending a transaction.',
          parameters: {
            type: 'object',
            properties: {
              merchantName: { type: 'string', description: 'Merchant or counterparty name' },
              documentType: { type: 'string', description: 'Document type such as invoice, receipt, or delivery_proof' },
              totalAmount: { type: 'number', description: 'Reference amount from the source document' },
              currency: { type: 'string', description: 'Reference currency from the source document' },
              requestedAmountUsdc: { type: 'number', description: 'Optional proof settlement amount in USDC, capped for safety' },
              needsHumanReview: { type: 'boolean', description: 'Whether the document still needs review' },
            },
          },
          handler: async (args) => buildCommerceSettlementPreview({
            merchantName: typeof args.merchantName === 'string' ? args.merchantName : null,
            documentType: typeof args.documentType === 'string' ? args.documentType : null,
            totalAmount: typeof args.totalAmount === 'number' ? args.totalAmount : null,
            currency: typeof args.currency === 'string' ? args.currency : null,
            requestedAmountUsdc: typeof args.requestedAmountUsdc === 'number' ? args.requestedAmountUsdc : null,
            needsHumanReview: args.needsHumanReview === true,
          }),
        },
      ];

      if (allowSettlementActions) {
        tools.push({
          name: 'settle_commerce_proof_receipt',
          description: 'Create a small Arc USDC proof receipt for a reviewed commerce event. Use only when the operator explicitly allows settlement actions.',
          parameters: {
            type: 'object',
            properties: {
              merchantName: { type: 'string', description: 'Merchant or counterparty name' },
              documentType: { type: 'string', description: 'Document type such as invoice, receipt, or delivery_proof' },
              summary: { type: 'string', description: 'Short settlement summary for the proof record' },
              requestedAmountUsdc: { type: 'number', description: 'Optional proof settlement amount in USDC, capped for safety' },
              settlementIntent: { type: 'string', description: 'approve, review, or reject' },
              needsHumanReview: { type: 'boolean', description: 'Whether the document still needs human review' },
              invoiceNumber: { type: 'string', description: 'Optional invoice or receipt number' },
            },
            required: ['merchantName', 'documentType'],
          },
          handler: async (args) => await settleCommerceProofReceipt({
            merchantName: typeof args.merchantName === 'string' ? args.merchantName : null,
            documentType: typeof args.documentType === 'string' ? args.documentType : null,
            summary: typeof args.summary === 'string' ? args.summary : null,
            requestedAmountUsdc: typeof args.requestedAmountUsdc === 'number' ? args.requestedAmountUsdc : null,
            settlementIntent: typeof args.settlementIntent === 'string' ? args.settlementIntent : null,
            needsHumanReview: args.needsHumanReview === true,
            invoiceNumber: typeof args.invoiceNumber === 'string' ? args.invoiceNumber : null,
          }),
        });
      }

      const result = await runGeminiCommerceAssistant({
        prompt,
        runtimeContext: [
          `Kairos runtime mode: ${(process.env.MODE || 'simulation')}`,
          `Real Arc txns: ${billing.realTxns}`,
          `Pending txns: ${billing.pendingTxns}`,
          `Track 4 status: ${track4.label}`,
          `Gateway signer configured: ${Boolean((process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID) || process.env.OWS_MNEMONIC || process.env.PRIVATE_KEY)}`,
          'Use preview and settlement tools carefully and distinguish proof receipts from underlying invoice or order notional.',
        ].join('\n'),
        tools,
      });

      res.json({
        ...result,
        allowSettlementActions,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message?.slice(0, 240) || 'Gemini commerce assistant failed' });
    }
  });

  app.post('/api/commerce/analyze', async (req, res) => {
    try {
      const result = await analyzeCommerceDocument({
        imageDataUrl: typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : undefined,
        imageBase64: typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : undefined,
        mimeType: typeof req.body?.mimeType === 'string' ? req.body.mimeType : undefined,
        imageUrl: typeof req.body?.imageUrl === 'string' ? req.body.imageUrl : undefined,
        prompt: typeof req.body?.prompt === 'string' ? req.body.prompt : undefined,
        expectedMerchant: typeof req.body?.expectedMerchant === 'string' ? req.body.expectedMerchant : undefined,
        expectedAmount: typeof req.body?.expectedAmount === 'number' ? req.body.expectedAmount : undefined,
      });

      res.json({
        ...result,
        settlementPreview: buildCommerceSettlementPreview({
          merchantName: result.analysis.merchantName,
          documentType: result.analysis.documentType,
          totalAmount: result.analysis.totalAmount,
          currency: result.analysis.currency,
          requestedAmountUsdc: result.analysis.proofSettlementAmountUsdc,
          needsHumanReview: result.analysis.needsHumanReview,
        }),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message?.slice(0, 240) || 'Commerce document analysis failed' });
    }
  });

  app.post('/api/commerce/settle', async (req, res) => {
    try {
      const result = await settleCommerceProofReceipt({
        merchantName: typeof req.body?.merchantName === 'string' ? req.body.merchantName : null,
        documentType: typeof req.body?.documentType === 'string' ? req.body.documentType : null,
        summary: typeof req.body?.summary === 'string' ? req.body.summary : null,
        requestedAmountUsdc: typeof req.body?.requestedAmountUsdc === 'number' ? req.body.requestedAmountUsdc : null,
        settlementIntent: typeof req.body?.settlementIntent === 'string' ? req.body.settlementIntent : null,
        needsHumanReview: req.body?.needsHumanReview === true,
        invoiceNumber: typeof req.body?.invoiceNumber === 'string' ? req.body.invoiceNumber : null,
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message?.slice(0, 240) || 'Commerce settlement failed' });
    }
  });

  /** Consolidated transaction ledger for judge/audit review */
  app.get('/api/transactions', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 300;
      res.json(buildTransactionLedger(limit));
    } catch (e) {
      res.status(500).json({ error: 'Failed to get transaction ledger' });
    }
  });

  httpServer = app.listen(port, () => {
    console.log(`[DASHBOARD] Running on http://localhost:${port}`);
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[DASHBOARD] Port ${port} in use, retrying in 3s...`);
      setTimeout(() => {
        httpServer?.close();
        httpServer = app.listen(port, () => {
          console.log(`[DASHBOARD] Running on http://localhost:${port}`);
        });
      }, 3000);
    }
  });
}

