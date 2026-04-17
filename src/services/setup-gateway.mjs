#!/usr/bin/env node
/**
 * One-time setup: Approve + deposit USDC into Circle Gateway for x402 data payments.
 * Run before first use:  node src/services/setup-gateway.mjs
 */

import fs from 'fs';
import path from 'path';
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
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

const MNEMONIC        = process.env.OWS_MNEMONIC;
const RPC_URL         = process.env.OWS_RPC_URL || 'https://rpc.testnet.arc.network';
const USDC_ADDRESS    = '0x3600000000000000000000000000000000000000';
const GATEWAY_ADDRESS = '0x0077777d7eba4688bdef3e311b846f25870a19b9';
const CHAIN_ID        = 5042002;

if (!MNEMONIC) {
  console.error('Error: OWS_MNEMONIC not set in environment or .env file');
  process.exit(1);
}

const arcTestnet = {
  id: CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const account      = mnemonicToAccount(MNEMONIC);
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });

console.log('x402 wallet address:', account.address);

const erc20Abi = [
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
];

const gatewayAbi = [
  { name: 'deposit', type: 'function', inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'asset', type: 'address' }, { name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
];

// Check USDC balance
const usdcBalance = await publicClient.readContract({
  address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [account.address],
});
console.log('USDC balance:', formatUnits(usdcBalance, 6));

if (usdcBalance === 0n) {
  console.error('No USDC balance. Fund from https://faucet.circle.com (select Arc Testnet)');
  process.exit(1);
}

// Step 1: Approve Gateway to spend USDC (ERC-20, 6 decimals)
console.log('Approving Gateway...');
const approveTx = await walletClient.writeContract({
  address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve',
  args: [GATEWAY_ADDRESS, parseUnits('100', 6)],
});
console.log('Approve tx:', approveTx);

// Step 2: Deposit 5 USDC into Gateway
const depositAmount = parseUnits('5', 6);
console.log('Depositing 5 USDC into Gateway...');
const depositTx = await walletClient.writeContract({
  address: GATEWAY_ADDRESS, abi: gatewayAbi, functionName: 'deposit',
  args: [USDC_ADDRESS, depositAmount],
});
console.log('Deposit tx:', depositTx);

// Verify
const gwBalance = await publicClient.readContract({
  address: GATEWAY_ADDRESS, abi: gatewayAbi, functionName: 'balanceOf',
  args: [USDC_ADDRESS, account.address],
});
console.log('Gateway deposit balance:', formatUnits(gwBalance, 6), 'USDC');
console.log('✓ Gateway funded — Kairos x402 data payments ready.');
