/**
 * Social Sharing Module — Trade Summary Generator
 *
 * Auto-generates shareable trade summaries formatted for X/Twitter.
 * Used by the dashboard's share feature and the economic-proof page.
 */

import { config } from '../agent/config.js';

export interface ShareableTradePost {
  text: string;
  hashtags: string[];
  mentions: string[];
  url: string | null;
}

/**
 * Generate a shareable post for a single trade decision.
 */
export function generateTradePost(params: {
  signal: string;
  confidence: number;
  price: number;
  approved: boolean;
  explanation: string;
  trustScore: number;
  artifactCid?: string;
  pnl?: number;
}): ShareableTradePost {
  const emoji = params.signal === 'LONG' ? '📈' : params.signal === 'SHORT' ? '📉' : '⏸️';
  const decision = params.approved ? '✅ APPROVED' : '🚫 BLOCKED';
  const pnlLine = params.pnl != null ? `\n💰 PnL: $${params.pnl.toFixed(2)}` : '';
  const artifactLine = params.artifactCid
    ? `\n🔗 Proof: ipfs://${params.artifactCid}`
    : '';

  const text = `${emoji} ${config.agentName} — ${params.signal} @ $${params.price.toFixed(2)}

${decision} | Confidence: ${(params.confidence * 100).toFixed(0)}%
🛡️ Trust Score: ${params.trustScore.toFixed(0)} | 8-stage governance gate${pnlLine}${artifactLine}

Every trade is auditable on IPFS. Zero trust assumptions.

Arc-native execution. Circle-powered micropayments.

#Kairos #Arc #Circle #USDC`;

  return {
    text,
    hashtags: ['Kairos', 'Arc', 'Circle', 'USDC'],
    mentions: [],
    url: params.artifactCid ? `${config.pinataGateway}/${params.artifactCid}` : null,
  };
}

/**
 * Generate a daily performance summary post.
 */
export function generateDailySummaryPost(params: {
  trades: number;
  pnl: number;
  capital: number;
  trustScore: number;
  winRate: number;
  artifactCount: number;
}): ShareableTradePost {
  const pnlEmoji = params.pnl >= 0 ? '🟢' : '🔴';
  const pnlPct = params.capital > 0 ? ((params.pnl / params.capital) * 100).toFixed(2) : '0.00';

  const text = `📊 ${config.agentName} — Daily Summary

${pnlEmoji} PnL: $${params.pnl.toFixed(2)} (${pnlPct}%)
📈 Trades: ${params.trades} | Win Rate: ${params.winRate.toFixed(0)}%
🛡️ Trust Score: ${params.trustScore.toFixed(0)}
🔗 ${params.artifactCount} IPFS artifacts generated

Fully governed. Every decision auditable.

Arc-native execution. Circle-powered micropayments.

#Kairos #Arc #Circle`;

  return {
    text,
    hashtags: ['Kairos', 'Arc', 'Circle'],
    mentions: [],
    url: null,
  };
}

/**
 * Generate a Twitter/X intent URL that pre-fills the tweet.
 */
export function buildTwitterIntentUrl(post: ShareableTradePost): string {
  const encoded = encodeURIComponent(post.text);
  return `https://twitter.com/intent/tweet?text=${encoded}`;
}
