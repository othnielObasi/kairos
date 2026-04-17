/**
 * Chain SDK — Wallet, Provider, and Contract Setup
 * Initializes ethers.js connection for all on-chain interactions.
 * When Circle Wallets are configured (CIRCLE_API_KEY), uses MPC-based
 * signing via Circle Developer-Controlled Wallets. Falls back to raw
 * ethers.Wallet when PRIVATE_KEY is set without Circle credentials.
 */

import { ethers } from 'ethers';
import { config } from '../agent/config.js';

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let circleSigner: ethers.Signer | null = null;

// Circle Wallets integration — recommended for hackathon
const USE_CIRCLE_WALLETS = !!(process.env.CIRCLE_API_KEY && process.env.CIRCLE_WALLET_ID);

/**
 * Initialize provider and wallet.
 * Prefers Circle Wallets (MPC signer) when configured.
 * Falls back to raw ethers.Wallet with PRIVATE_KEY.
 */
export function initChain(): { provider: ethers.JsonRpcProvider; wallet: ethers.Wallet } {
  if (provider && wallet) return { provider, wallet };

  provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
    batchMaxCount: 1,       // disable batching — free-tier RPCs reject batch requests
  });

  // Try Circle Wallets first (recommended by hackathon)
  if (USE_CIRCLE_WALLETS) {
    import('../services/circle-wallet.js').then(async (m) => {
      try {
        circleSigner = await m.getCircleSigner(provider!);
        console.log(`[CHAIN] Circle Wallets signer active (${process.env.AGENT_WALLET_ADDRESS})`);
      } catch (e) {
        console.warn('[CHAIN] Circle Wallets init failed — using EOA fallback', e);
      }
    }).catch(e => {
      console.warn('[CHAIN] Circle Wallets module unavailable', e);
    });
  }

  // EOA fallback — always initialize for compatibility
  if (!config.privateKey) {
    throw new Error('PRIVATE_KEY not set in .env');
  }

  wallet = new ethers.Wallet(
    config.privateKey.startsWith('0x') ? config.privateKey : `0x${config.privateKey}`,
    provider
  );

  console.log(`[CHAIN] Connected to ${config.rpcUrl} (chainId: ${config.chainId}, batchMaxCount=1)`);
  console.log(`[CHAIN] Wallet: ${wallet.address}${USE_CIRCLE_WALLETS ? ' (Circle Wallets pending)' : ''}`);

  return { provider, wallet };
}

/**
 * Get wallet address — returns Circle Wallets address if configured
 */
export function getWalletAddress(): string {
  if (circleSigner && process.env.AGENT_WALLET_ADDRESS) return process.env.AGENT_WALLET_ADDRESS;
  if (!wallet) throw new Error('Chain not initialized — call initChain() first');
  return wallet.address;
}

/**
 * Get provider
 */
export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) throw new Error('Chain not initialized');
  return provider;
}

/**
 * Get signer — prefers Circle Wallets MPC signer, falls back to EOA
 */
export function getSigner(): ethers.Signer {
  if (circleSigner) return circleSigner;
  if (!wallet) throw new Error('Chain not initialized');
  return wallet;
}

/**
 * Get wallet (signer) — legacy compatibility, prefers Circle Wallets
 */
export function getWallet(): ethers.Wallet {
  if (!wallet) throw new Error('Chain not initialized');
  return wallet;
}

/**
 * Check wallet balance
 */
export async function getBalance(): Promise<string> {
  const { provider, wallet } = initChain();
  const balance = await provider.getBalance(wallet.address);
  return ethers.formatEther(balance);
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTx(tx: ethers.TransactionResponse, confirmations: number = 1): Promise<ethers.TransactionReceipt> {
  console.log(`[CHAIN] Tx submitted: ${tx.hash}`);
  const receipt = await tx.wait(confirmations);
  if (!receipt) throw new Error('Transaction failed — no receipt');
  console.log(`[CHAIN] Tx confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);
  return receipt;
}
