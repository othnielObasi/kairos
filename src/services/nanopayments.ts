// src/services/nanopayments.ts
// ───────────────────────────────────────────────────────────────────────────────
// Circle Nanopayments — real USDC micro-transfers on Arc via Circle
// Developer-Controlled Wallets.  Every governance stage and compute event
// sends a $0.001 USDC ERC-20 transfer on Arc testnet, producing a genuine
// on-chain transaction hash.
//
// When Circle credentials are not configured, the module falls through to
// a lightweight viem-based EOA signer (OWS_MNEMONIC) so the demo can
// produce real Arc transactions without the full Circle Wallets stack.
//
// NEVER throws — billing is fire-and-forget.  Governance logic is always
// unaffected by billing outcomes.
// ───────────────────────────────────────────────────────────────────────────────

import { createPublicClient, createWalletClient, http, parseUnits, getAddress, type Hash } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

// ── Arc Testnet chain definition ─────────────────────────────────────────────
const ARC_RPC   = process.env.OWS_RPC_URL || 'https://rpc.testnet.arc.network';
const ARC_CHAIN = {
  id:             5042002,
  name:           'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls:        { default: { http: [ARC_RPC] } },
} as const;

// Arc USDC ERC-20 contract (also the native gas token)
const ARC_USDC = '0x3600000000000000000000000000000000000000';

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ── Configuration ────────────────────────────────────────────────────────────

export const NANO_AMOUNT = parseFloat(
  process.env.NANOPAYMENT_AMOUNT_USDC || '0.001'
);

/** Governance billing address — receives nanopayment USDC on each stage */
const BILLING_ADDRESS = getAddress(
  process.env.GOVERNANCE_BILLING_ADDRESS || process.env.AGENT_WALLET_ADDRESS || '0x0000000000000000000000000000000000000001'
);

// ── Receipt type ─────────────────────────────────────────────────────────────

export interface NanopaymentReceipt {
  eventName:   string;
  source?:     string;
  model?:      string;
  type?:       string;  // 'governance' | 'data' | 'inference' | 'reflection'
  mode?:       string;  // 'x402' | 'nanopayment' | 'fallback'
  txHash:      string;
  referenceId?: string;
  verificationState?: 'confirmed' | 'pending' | 'fallback';
  amount:      number;
  confirmedAt: number;
}

interface TransferResult {
  txHash: Hash | null;
  referenceId: string | null;
}

export function hasVerifiedTxHash(receipt: Pick<NanopaymentReceipt, 'txHash'>): boolean {
  return typeof receipt.txHash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(receipt.txHash);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveCircleTransactionHash(transactionId: string): Promise<Hash | null> {
  if (!circleClient) return null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { data } = await circleClient.getTransaction({ id: transactionId } as any);
      const txHash = (data as any)?.transaction?.txHash || (data as any)?.txHash || null;
      if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return txHash as Hash;
      }
    } catch (error) {
      if (attempt === 4) {
        console.warn(`[NANO] Failed to resolve Circle txHash for ${transactionId}:`, (error as Error).message || error);
      }
    }

    await sleep(1500);
  }

  return null;
}

async function hydrateCircleReceipt(receipt: NanopaymentReceipt): Promise<void> {
  if (!receipt.referenceId || hasVerifiedTxHash(receipt)) return;

  const resolved = await resolveCircleTransactionHash(receipt.referenceId);
  if (resolved) {
    receipt.txHash = resolved;
    receipt.verificationState = 'confirmed';
  }
}

// ── Signer initialisation ────────────────────────────────────────────────────
// Prefer Circle Wallets (DCW) → fallback to OWS_MNEMONIC → fallback to PRIVATE_KEY.
// We use viem directly (not ethers) so we get first-class Arc chain support
// without fighting ethers.js provider quirks.

let arcWallet: any = null;
let arcPublic: any = null;
let circleWalletMode = false;

// Circle DCW — imported lazily so the module loads even without the package
let circleClient: any = null;

async function ensureSigner(): Promise<boolean> {
  if (arcWallet) return true;

  // ── Path 1: Circle Developer-Controlled Wallets ─────────────────────────
  if (process.env.CIRCLE_API_KEY && process.env.CIRCLE_WALLET_ID) {
    try {
      const { CircleDeveloperControlledWalletsClient } = await import(
        '@circle-fin/developer-controlled-wallets'
      );
      circleClient = new CircleDeveloperControlledWalletsClient({
        apiKey:       process.env.CIRCLE_API_KEY!,
        entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
      });
      circleWalletMode = true;

      // We still need a viem public client for gas estimation / receipts
      arcPublic = createPublicClient({ chain: ARC_CHAIN as any, transport: http(ARC_RPC) });
      console.log('[NANO] Circle Wallets signer active for Arc nanopayments');
      return true;
    } catch (e) {
      console.warn('[NANO] Circle Wallets init failed — trying mnemonic fallback', e);
    }
  }

  // ── Path 2: BIP-39 Mnemonic (OWS_MNEMONIC) ─────────────────────────────
  const mnemonic = process.env.OWS_MNEMONIC;
  if (mnemonic) {
    try {
      const account = mnemonicToAccount(mnemonic);
      arcWallet = createWalletClient({ account, chain: ARC_CHAIN as any, transport: http(ARC_RPC) });
      arcPublic = createPublicClient({ chain: ARC_CHAIN as any, transport: http(ARC_RPC) });
      console.log(`[NANO] Mnemonic signer active for Arc nanopayments (${account.address})`);
      return true;
    } catch (e) {
      console.warn('[NANO] Mnemonic signer failed', e);
    }
  }

  // ── Path 3: Raw private key ─────────────────────────────────────────────
  const pk = process.env.NANOPAYMENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (pk) {
    try {
      const key = (pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`;
      const account = privateKeyToAccount(key);
      arcWallet = createWalletClient({ account, chain: ARC_CHAIN as any, transport: http(ARC_RPC) });
      arcPublic = createPublicClient({ chain: ARC_CHAIN as any, transport: http(ARC_RPC) });
      console.log(`[NANO] PK signer active for Arc nanopayments (${account.address})`);
      return true;
    } catch (e) {
      console.warn('[NANO] PK signer failed', e);
    }
  }

  console.warn('[NANO] No signer available — nanopayments will be stub-only');
  return false;
}

// ── Core transfer function ───────────────────────────────────────────────────

async function sendUSDCTransfer(to: string, amountUsdc: number): Promise<TransferResult> {
  // USDC on Arc has 6 decimals for ERC-20 transfers
  const amountRaw = parseUnits(amountUsdc.toFixed(6), 6);

  // ── Circle DCW path ─────────────────────────────────────────────────────
  if (circleWalletMode && circleClient) {
    const { data } = await circleClient.createContractExecutionTransaction({
      walletId:             process.env.CIRCLE_WALLET_ID!,
      contractAddress:      ARC_USDC,
      abiFunctionSignature: 'transfer(address,uint256)',
      abiParameters:        [to, amountRaw.toString()],
      fee:                  { type: 'level', config: { feeLevel: 'LOW' } },
      blockchain:           'ARC-TESTNET',
    } as any);
    const txHash = (data as any)?.transaction?.txHash || (data as any)?.txHash || null;
    const referenceId = (data as any)?.transaction?.id
      || (data as any)?.transactionId
      || (data as any)?.id
      || null;
    return {
      txHash: txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash) ? txHash as Hash : null,
      referenceId,
    };
  }

  // ── viem EOA path ───────────────────────────────────────────────────────
  if (!arcWallet) throw new Error('No Arc signer available');
  const hash = await arcWallet.writeContract({
    address: ARC_USDC as `0x${string}`,
    abi:     ERC20_ABI,
    functionName: 'transfer',
    args: [getAddress(to), amountRaw],
    chain: ARC_CHAIN,
  });
  return {
    txHash: hash,
    referenceId: hash,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Bill a governance or compute event via a real USDC micro-transfer on Arc.
 * NEVER throws — billing failure returns a pending receipt.
 * Governance logic is always unaffected by billing outcomes.
 */
export async function billEvent(
  eventName: string,
  meta: {
    source?: string;
    model?:  string;
    type?:   string;
    mode?:   string;
  } = {}
): Promise<NanopaymentReceipt> {
  try {
    const ready = await ensureSigner();
    if (!ready) throw new Error('no signer');

    const transfer = await sendUSDCTransfer(BILLING_ADDRESS, NANO_AMOUNT);
    const receipt: NanopaymentReceipt = {
      eventName,
      ...meta,
      mode:        circleWalletMode ? 'circle-wallets' : 'nanopayment',
      txHash:      transfer.txHash ?? `pending_${transfer.referenceId ?? Date.now()}`,
      referenceId: transfer.referenceId ?? undefined,
      verificationState: transfer.txHash ? 'confirmed' : 'pending',
      amount:      NANO_AMOUNT,
      confirmedAt: Date.now(),
    };

    if (circleWalletMode && transfer.referenceId && !transfer.txHash) {
      void hydrateCircleReceipt(receipt);
    }

    return receipt;
  } catch (err) {
    // Log but never block — return pending receipt
    console.warn(`[NANO] billEvent failed (${eventName}):`, (err as Error).message || err);
    return {
      eventName,
      ...meta,
      mode:        'fallback',
      txHash:      'pending_' + Date.now(),
      verificationState: 'fallback',
      amount:      NANO_AMOUNT,
      confirmedAt: Date.now(),
    };
  }
}

// ── Transaction count helper for demo proof ──────────────────────────────────

/** Return the total number of real (non-pending) nanopayment tx hashes seen. */
export function getRealTxCount(receipts: NanopaymentReceipt[]): number {
  return receipts.filter(hasVerifiedTxHash).length;
}

// ───────────────────────────────────────────────────────────────────────────────
