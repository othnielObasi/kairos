
/**
 * MCP Resources
 * Read-only structured snapshots for auditors, dashboards, and other agents.
 */

import { getAgentState } from '../agent/index.js';
import { getCheckpoints, getLastCheckpoint } from '../trust/checkpoint.js';
import { getLastTrustScore, getTrustHistory } from '../trust/trust-policy-scorecard.js';
import { getDefaultMandate } from '../chain/agent-mandate.js';
import { getOperatorActionReceipts, getOperatorControlState } from '../agent/operator-control.js';
import { computeRiskAdjustedMetrics } from '../analytics/performance-metrics.js';
import { config } from '../agent/config.js';
import { getKrakenFeedStatus } from '../data/kraken-feed.js';

export type McpVisibility = 'public' | 'restricted' | 'operator';

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  visibility: McpVisibility;
  mimeType: string;
  handler: (params?: Record<string, unknown>) => Promise<unknown> | unknown;
}

function state() {
  return getAgentState();
}

const trustResource: McpResource = {
  uri: 'kairos://state/trust',
  name: 'Trust State',
  description: 'Current trust score, trust timeline, and capital-rights state',
  visibility: 'public',
  mimeType: 'application/json',
  handler: () => {
    const agentState = state();
    const score = getLastTrustScore(agentState?.agentId ?? null);
    return {
      trustScore: score,
      trustHistory: getTrustHistory(agentState?.agentId ?? null, 20),
      recoveryModeHint: score !== null && score < 78,
      latestCheckpointId: getLastCheckpoint()?.id ?? null,
    };
  },
};

const marketResource: McpResource = {
  uri: 'kairos://state/market',
  name: 'Market State',
  description: 'Current market indicators and pricing state',
  visibility: 'public',
  mimeType: 'application/json',
  handler: () => {
    const market = state()?.market;
    return {
      tradingPair: config.tradingPair,
      market,
      mcpEndpoint: config.mcpEndpoint,
    };
  },
};

const mandateResource: McpResource = {
  uri: 'kairos://state/mandate',
  name: 'Mandate State',
  description: 'Current capital mandate, allowlists, and governance limits',
  visibility: 'public',
  mimeType: 'application/json',
  handler: () => ({
    mandate: getDefaultMandate(),
    operator: getOperatorControlState(),
    allowedAssets: config.allowedAssets,
    allowedProtocols: config.allowedProtocols,
  }),
};

const positionsResource: McpResource = {
  uri: 'kairos://state/positions',
  name: 'Open Positions',
  description: 'Open positions and exposure snapshot',
  visibility: 'public',
  mimeType: 'application/json',
  handler: () => {
    const risk = state()?.risk;
    return {
      capital: risk?.capital ?? null,
      openPositions: risk?.openPositions ?? [],
      totalTrades: risk?.totalTrades ?? 0,
      recentPnl: risk?.recentPnl ?? [],
    };
  },
};

const operatorResource: McpResource = {
  uri: 'kairos://state/operator',
  name: 'Operator State',
  description: 'Current operator mode and recent operator receipts',
  visibility: 'operator',
  mimeType: 'application/json',
  handler: () => ({
    operatorControl: getOperatorControlState(),
    receipts: getOperatorActionReceipts(10),
  }),
};

const performanceResource: McpResource = {
  uri: 'kairos://state/performance',
  name: 'Performance Metrics',
  description: 'Current runtime-derived risk-adjusted metrics',
  visibility: 'public',
  mimeType: 'application/json',
  handler: () => {
    const risk = state()?.risk;
    const recentPnl = Array.isArray(risk?.recentPnl) ? risk.recentPnl : [];
    let rolling = Number(risk?.capital ?? 0) - recentPnl.reduce((acc: number, row: any) => acc + (Number(row?.pnl) || 0), 0);
    const equityPoints = [{ timestamp: new Date(Date.now() - 60_000 * (recentPnl.length + 1)).toISOString(), equity: Math.max(rolling, 1) }];
    const trades = [];
    for (const row of recentPnl) {
      const pnl = Number(row?.pnl) || 0;
      rolling += pnl;
      equityPoints.push({ timestamp: row?.timestamp || new Date().toISOString(), equity: Math.max(rolling, 1) });
      trades.push({ pnl });
    }
    return {
      metrics: computeRiskAdjustedMetrics(equityPoints, trades, 0),
      points: equityPoints,
      tradeCount: trades.length,
    };
  },
};

const integrationResource: McpResource = {
  uri: 'kairos://state/integration',
  name: 'Integration State',
  description: 'Current routing, identity, and external interface readiness',
  visibility: 'public',
  mimeType: 'application/json',
  handler: () => ({
    identityRegistry: config.identityRegistry,
    riskRouterAddress: config.riskRouterAddress,
    mcpEndpoint: config.mcpEndpoint,
    a2aEndpoint: config.a2aEndpoint,
    registrationUri: config.registrationUri,
    readiness: {
      identity: Boolean(config.identityRegistry),
      router: Boolean(config.riskRouterAddress),
    },
  }),
};

const artifactsResource: McpResource = {
  uri: 'kairos://state/artifacts',
  name: 'Recent Artifacts',
  description: 'Recent decision artifacts and receipts',
  visibility: 'public',
  mimeType: 'application/json',
  handler: (params) => {
    const limit = typeof params?.limit === 'number' ? params.limit : 10;
    return {
      artifacts: getCheckpoints(limit).map(cp => ({
        id: cp.id,
        approved: cp.riskDecision.approved,
        explanation: cp.riskDecision.explanation,
        receipt: cp.ipfs?.uri || null,
        txHash: cp.onChainTxHash || null,
        checks: cp.riskDecision.checks,
      })),
    };
  },
};

const tradeHistoryResource: McpResource = {
  uri: 'kairos://state/trade-history',
  name: 'Trade History',
  description: 'Persistent closed trade log with per-trade PnL and aggregate stats',
  visibility: 'public',
  mimeType: 'application/json',
  handler: (params) => {
    const { getRecentTrades, getTradeStats } = require('../agent/trade-log.js') as typeof import('../agent/trade-log.js');
    const limit = typeof params?.limit === 'number' ? params.limit : 20;
    return { stats: getTradeStats(), trades: getRecentTrades(limit) };
  },
};

const feedsResource: McpResource = {
  uri: 'kairos://state/feeds',
  name: 'Data Feeds',
  description: 'Health status of all external data feeds (Kraken, CoinGecko, DeFiLlama)',
  visibility: 'public',
  mimeType: 'application/json',
  handler: () => ({
    kraken: getKrakenFeedStatus(),
    sources: ['coingecko', 'defillama', 'kraken'],
    note: 'Price feed uses CoinGecko → DeFiLlama → Kraken failover chain',
  }),
};

export const ALL_RESOURCES: McpResource[] = [
  trustResource,
  marketResource,
  mandateResource,
  positionsResource,
  operatorResource,
  performanceResource,
  integrationResource,
  artifactsResource,
  tradeHistoryResource,
  feedsResource,
];
