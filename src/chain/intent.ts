/**
 * EIP-712 TradeIntent builder/signing.
 * Uses the configured RiskRouter domain for the active settlement chain.
 *
 * TradeIntent fields per SHARED_CONTRACTS.md:
 *   agentId, agentWallet, pair, action, amountUsdScaled, maxSlippageBps, nonce, deadline
 */
import { ethers, type TypedDataField } from 'ethers';
import { config } from '../agent/config.js';
import { getSigner, getWalletAddress } from './sdk.js';

export const TRADE_INTENT_TYPES: Record<string, TypedDataField[]> = {
  TradeIntent: [
    { name: 'agentId', type: 'uint256' },
    { name: 'agentWallet', type: 'address' },
    { name: 'pair', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'amountUsdScaled', type: 'uint256' },
    { name: 'maxSlippageBps', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface TradeIntentData {
  agentId: bigint;
  agentWallet: string;
  pair: string;
  action: string;           // "BUY" or "SELL"
  amountUsdScaled: bigint;  // USD amount × 100 (so $500 = 50000)
  maxSlippageBps: bigint;   // basis points (100 = 1%)
  nonce: bigint;
  deadline: bigint;
}

export function getTradeIntentDomain(): ethers.TypedDataDomain {
  return {
    name: 'RiskRouter',
    version: '1',
    chainId: config.chainId,
    verifyingContract: config.riskRouterAddress || ethers.ZeroAddress,
  };
}

export function buildTradeIntent(params: {
  agentId: number;
  pair: string;
  action: 'BUY' | 'SELL';
  amountUsd: number;         // dollar amount (e.g. 500)
  slippageBps: number;       // basis points (e.g. 100 = 1%)
  deadlineSeconds: number;
  nonce: bigint;
}): TradeIntentData {
  return {
    agentId: BigInt(params.agentId),
    agentWallet: getWalletAddress(),
    pair: params.pair,
    action: params.action,
    amountUsdScaled: BigInt(Math.round(params.amountUsd * 100)),
    maxSlippageBps: BigInt(params.slippageBps),
    nonce: params.nonce,
    deadline: BigInt(Math.floor(Date.now() / 1000) + params.deadlineSeconds),
  };
}

export async function signTradeIntent(intent: TradeIntentData): Promise<{
  intent: TradeIntentData;
  signature: string;
  domain: ethers.TypedDataDomain;
  hash: string;
}> {
  const signer = getSigner();
  const domain = getTradeIntentDomain();
  const signature = await signer.signTypedData(domain, TRADE_INTENT_TYPES, intent);
  const hash = hashTradeIntent(intent, domain);
  return { intent, signature, domain, hash };
}

export function verifyTradeIntent(intent: TradeIntentData, signature: string, domain = getTradeIntentDomain()): string {
  return ethers.verifyTypedData(domain, TRADE_INTENT_TYPES, intent, signature);
}

export function hashTradeIntent(intent: TradeIntentData, domain = getTradeIntentDomain()): string {
  return ethers.TypedDataEncoder.hash(domain, TRADE_INTENT_TYPES, intent);
}

export function toRiskRouterPayload(intent: TradeIntentData, signature: string) {
  return {
    intent,
    signature,
    requestHash: hashTradeIntent(intent),
    submittedAt: new Date().toISOString(),
  };
}

export function resetNonce(): void {
  // Nonce is now fetched on-chain via getIntentNonce — no local counter needed
}

/**
 * Verify that a reasoning string matches a given hash.
 */
export function verifyReasoningIntegrity(reasoning: string, reasoningHash: string): boolean {
  if (!reasoning || !reasoningHash || reasoningHash === ethers.ZeroHash) return false;
  return ethers.keccak256(ethers.toUtf8Bytes(reasoning)) === reasoningHash;
}
