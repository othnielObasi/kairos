#!/usr/bin/env node
/**
 * One-time setup: approve + deposit USDC into Circle Gateway for x402 data payments.
 * Supports either the existing Circle Wallets configuration or a mnemonic fallback.
 *
 * Usage:
 *   node src/services/setup-gateway.mjs
 *
 * Optional env:
 *   GATEWAY_DEPOSIT_AMOUNT_USDC=5
 */

import fs from 'fs';
import path from 'path';
import { CircleDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

for (const file of ['.env.arc', '.env']) {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

const MNEMONIC = process.env.OWS_MNEMONIC;
const RPC_URL = process.env.OWS_RPC_URL || 'https://rpc.testnet.arc.network';
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const GATEWAY_ADDRESS = '0x0077777d7eba4688bdef3e311b846f25870a19b9';
const CHAIN_ID = 5042002;
const BLOCKCHAIN = 'ARC-TESTNET';
const DEPOSIT_USDC = process.env.GATEWAY_DEPOSIT_AMOUNT_USDC || '5';
const USE_CIRCLE = Boolean(
  process.env.CIRCLE_API_KEY &&
  process.env.CIRCLE_ENTITY_SECRET &&
  process.env.CIRCLE_WALLET_ID,
);

const arcTestnet = {
  id: CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });
const amountRaw = parseUnits(DEPOSIT_USDC, 6);
const erc20Abi = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];
const gatewayAbi = [
  {
    name: 'deposit',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
];

async function waitForCircleTxHash(circleClient, transactionId, label) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await circleClient.getTransaction({ id: transactionId });
    const tx = result?.data?.transaction || result?.data || {};
    const state = tx?.state || 'UNKNOWN';
    const txHash = tx?.txHash || null;

    if (txHash && /^(0x)?[a-fA-F0-9]{64}$/.test(txHash)) {
      console.log(`${label} tx:`, txHash);
      return txHash;
    }

    if (state === 'FAILED' || state === 'DENIED' || state === 'CANCELLED') {
      throw new Error(`${label} failed with Circle state ${state}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`${label} did not produce a tx hash before timeout`);
}

async function runCirclePath() {
  const circleClient = new CircleDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
  const walletId = process.env.CIRCLE_WALLET_ID;
  const walletAddress = process.env.AGENT_WALLET_ADDRESS;

  if (!walletId || !walletAddress) {
    throw new Error('CIRCLE_WALLET_ID and AGENT_WALLET_ADDRESS are required for Circle Gateway setup');
  }

  console.log('Signer: Circle Wallets');
  console.log('x402 wallet address:', walletAddress);

  const usdcBalance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  });
  console.log('USDC balance:', formatUnits(usdcBalance, 6));

  if (usdcBalance < amountRaw) {
    throw new Error(`Insufficient USDC in Circle wallet for a ${DEPOSIT_USDC} USDC Gateway deposit`);
  }

  console.log(`Approving Gateway for ${DEPOSIT_USDC} USDC...`);
  const approve = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress: USDC_ADDRESS,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [GATEWAY_ADDRESS, amountRaw.toString()],
    fee: { type: 'level', config: { feeLevel: 'LOW' } },
    blockchain: BLOCKCHAIN,
  });
  const approveId =
    approve?.data?.id ||
    approve?.data?.transaction?.id ||
    approve?.data?.transactionId;
  if (!approveId) {
    throw new Error('Circle did not return an approval transaction id');
  }
  await waitForCircleTxHash(circleClient, approveId, 'USDC approve');

  console.log(`Depositing ${DEPOSIT_USDC} USDC into Gateway...`);
  const deposit = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress: GATEWAY_ADDRESS,
    abiFunctionSignature: 'deposit(address,uint256)',
    abiParameters: [USDC_ADDRESS, amountRaw.toString()],
    fee: { type: 'level', config: { feeLevel: 'LOW' } },
    blockchain: BLOCKCHAIN,
  });
  const depositId =
    deposit?.data?.id ||
    deposit?.data?.transaction?.id ||
    deposit?.data?.transactionId;
  if (!depositId) {
    throw new Error('Circle did not return a deposit transaction id');
  }
  await waitForCircleTxHash(circleClient, depositId, 'Gateway deposit');

  console.log(`Gateway funded with ${DEPOSIT_USDC} USDC via Circle Wallets`);
}

async function runMnemonicPath() {
  if (!MNEMONIC) {
    throw new Error('OWS_MNEMONIC not set in environment, .env.arc, or .env file');
  }

  const account = mnemonicToAccount(MNEMONIC);
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(RPC_URL) });

  console.log('Signer: Mnemonic');
  console.log('x402 wallet address:', account.address);

  const usdcBalance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  });
  console.log('USDC balance:', formatUnits(usdcBalance, 6));

  if (usdcBalance < amountRaw) {
    throw new Error(`Insufficient USDC in mnemonic wallet for a ${DEPOSIT_USDC} USDC Gateway deposit`);
  }

  console.log(`Approving Gateway for ${DEPOSIT_USDC} USDC...`);
  const approveTx = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'approve',
    args: [GATEWAY_ADDRESS, amountRaw],
  });
  console.log('Approve tx:', approveTx);
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  console.log(`Depositing ${DEPOSIT_USDC} USDC into Gateway...`);
  const depositTx = await walletClient.writeContract({
    address: GATEWAY_ADDRESS,
    abi: gatewayAbi,
    functionName: 'deposit',
    args: [USDC_ADDRESS, amountRaw],
  });
  console.log('Deposit tx:', depositTx);
  await publicClient.waitForTransactionReceipt({ hash: depositTx });

  console.log(`Gateway funded with ${DEPOSIT_USDC} USDC via mnemonic wallet`);
}

if (USE_CIRCLE) {
  await runCirclePath();
} else {
  await runMnemonicPath();
}

console.log('Kairos x402 data payments ready.');
