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
import { hasVerifiedTxHash } from '../services/nanopayments.js';
import { getCliStatus, checkCliHealth } from '../data/kraken-cli.js';
import { getKrakenAccountSnapshot, krakenPreflight } from '../data/kraken-bridge.js';
import { generateAttestationSummary } from '../security/tee-attestation.js';
import { ALL_TOOLS } from '../mcp/tools.js';
import { ALL_RESOURCES } from '../mcp/resources.js';
import { ALL_PROMPTS } from '../mcp/prompts.js';
import { getNormalisationStatus } from '../services/normalisation.js';
import { ethers } from 'ethers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_PORT = parseInt(process.env.PORT || '3000', 10);

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
  if (lower.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  if (lower.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
  if (lower.includes('gpt-4o-mini')) return 'OpenAI GPT-4o mini';
  return model;
}

function joinFlow(labels: string[]): string {
  return labels.filter(Boolean).join(' → ');
}

function countByVisibility(items: Array<{ visibility: string }>) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.visibility] = (acc[item.visibility] || 0) + 1;
    return acc;
  }, {});
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
      ? 'Agent pays AIsa x402 endpoints per query · Circle Gateway settlement · USDC on Arc · 79 endpoints across financial, Twitter, and Perplexity'
      : 'Agent queries live fallback feeds with Arc billing receipts · AIsa x402 standby · Kraken / CoinGecko / PRISM / Alpha Vantage',
    subtitle: normalisation.mode === 'x402'
      ? 'Agent pays AIsa x402 for Twitter, news, and PRISM reasoning · Circle Gateway settlement · USDC on Arc · live spot price stays on Kraken/CoinGecko'
      : 'Agent queries live fallback feeds with Arc billing receipts · AIsa x402 standby · Kraken / CoinGecko / PRISM / Alpha Vantage',
    endpoint: normalisation.endpoint,
    mode: normalisation.mode,
    reason: normalisation.reason,
    realTxns: billing.t2RealTxns,
    pendingTxns: billing.t2PendingTxns,
    totalEvents: billing.t2Events.length,
    sourceLabels: normalisation.mode === 'x402'
      ? {
          coingecko: 'CoinGecko / DeFiLlama',
          kraken: 'Kraken Direct',
          feargreed: 'AIsa Twitter',
          alphavantage: 'AIsa Fin. News',
          prism: 'AIsa Perplexity',
        }
      : {
          coingecko: 'CoinGecko / DeFiLlama',
          kraken: 'Kraken Direct',
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
      note = `${latestEvent.model || latestEvent.eventName || 'Compute'} used a fallback billing receipt because no verified Arc settlement hash is available yet.`;
      fallbackReason = 'Fallback billing receipt active because the Arc settlement hash was not produced by the current signer path.';
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
    apiKeysConfigured: configuredCount > 0,
    runtimeModels,
    reflectionModels,
    lastComputeAt: latestEvent ? new Date(latestEvent.confirmedAt).toISOString() : null,
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

  const counts = {
    arcSettled: 0,
    krakenLive: 0,
    krakenPaper: 0,
    localOnly: 0,
    skipped: 0,
  };
  let settledVolumeUsd = 0;

  for (const action of actions) {
    switch (action.execution.executionMode) {
      case 'arc_settled':
        counts.arcSettled += 1;
        settledVolumeUsd += action.notionalUsd;
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
  let state = 'idle';
  let label = 'IDLE';
  let note = 'Awaiting approved actions to settle.';

  if (counts.arcSettled > 0) {
    state = 'arc_settled';
    label = 'ARC SETTLED';
    note = `${counts.arcSettled} approved action(s) settled on Arc with USDC.`;
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
  }

  return {
    state,
    label,
    note,
    counts,
    actionsRecorded: actions.length,
    settledVolumeUsd,
    lastSettlementAt: latestAction?.execution.settledAt ?? null,
    latestMode: latestAction?.execution.executionMode ?? null,
    routerReady: Boolean((process.env.MODE || 'simulation') === 'live' && agentState.agentId && config.riskRouterAddress),
    kraken: {
      cliInstalled: cliStatus.installed,
      apiKeyConfigured: cliStatus.apiKeyConfigured,
      paperTrading: cliStatus.paperTrading,
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
  app.use(express.json({ limit: '1mb' }));
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
  app.get('/trades', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trades.html'));
  });

  // Economic proof walkthrough
  app.get('/judge', (_req, res) => {
    res.redirect('/kairos');
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
  app.get('/api/trades', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    res.json({ trades: getRecentTrades(limit) });
  });

  /** Trade history as CSV download */
  app.get('/api/trades/csv', (_req, res) => {
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
    res.setHeader('Content-Disposition', 'attachment; filename="kairos-trades.csv"');
    res.send(csv);
  });

  /** Trade statistics */
  app.get('/api/trades/stats', (_req, res) => {
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
      res.json(billingStore.toJSON());
    } catch (e) {
      res.status(500).json({ error: 'Failed to get billing data' });
    }
  });

  /** x402 wallet balance — uses Circle Wallets balance or the configured Arc address */
  app.get('/api/gateway-balance', async (_req, res) => {
    try {
      const usdcAddress = (process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000').toLowerCase();

      if (process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID) {
        const { CircleDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
        const circleClient = new CircleDeveloperControlledWalletsClient({
          apiKey: process.env.CIRCLE_API_KEY,
          entitySecret: process.env.CIRCLE_ENTITY_SECRET,
        });
        const response = await circleClient.getWalletTokenBalance({
          id: process.env.CIRCLE_WALLET_ID,
          includeAll: true,
        } as any);
        const balances = (response as any)?.data?.tokenBalances || [];
        const usdcBalance = balances.find((entry: any) => {
          const tokenAddress = entry?.token?.tokenAddress?.toLowerCase?.() || '';
          const symbol = entry?.token?.symbol || '';
          return tokenAddress === usdcAddress || symbol === 'USDC';
        });
        const formatted = usdcBalance?.amount || '0.00';
        res.json({
          balance: formatted,
          formatted,
          kind: 'circle-wallet-balance',
          warning: null,
        });
        return;
      }

      const agentAddress = process.env.AGENT_WALLET_ADDRESS;
      if (!agentAddress) {
        res.json({ balance: '0', formatted: '0.00', kind: 'unconfigured', warning: 'x402 wallet not configured' });
        return;
      }

      const rpc = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
      const provider = new ethers.JsonRpcProvider(rpc);
      const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
      const token = new ethers.Contract(usdcAddress, erc20Abi, provider);
      const bal = await token.balanceOf(agentAddress);
      res.json({
        balance: bal.toString(),
        formatted: ethers.formatUnits(bal, 6),
        kind: 'onchain-wallet-balance',
        warning: null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message?.slice(0, 200) || 'x402 wallet balance check failed' });
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

