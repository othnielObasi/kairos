/**
 * One-off script: Claim sandbox capital from HackathonVault.
 * Usage: npx tsx scripts/claim-sandbox.ts
 */
import '../src/env/load.js';
import { ethers } from 'ethers';
import { initChain, getWallet, waitForTx } from '../src/chain/sdk.js';
import { config } from '../src/agent/config.js';

const VAULT_ABI = [
  'function claimAllocation(uint256 agentId) external',
  'function hasClaimed(uint256 agentId) external view returns (bool)',
  'function getBalance(uint256 agentId) external view returns (uint256)',
];

async function main() {
  initChain();
  const wallet = getWallet();
  const agentId = config.agentId;

  if (!agentId) throw new Error('AGENT_ID not set in .env.arc or .env');
  if (!config.hackathonVaultAddress) throw new Error('HACKATHON_VAULT_ADDRESS not set');

  const vault = new ethers.Contract(config.hackathonVaultAddress, VAULT_ABI, wallet);

  console.log('=== Claim Sandbox Capital ===');
  console.log(`Agent ID: ${agentId}`);
  console.log(`Vault: ${config.hackathonVaultAddress}`);

  const alreadyClaimed = await vault.hasClaimed(agentId);
  if (alreadyClaimed) {
    const balance = await vault.getBalance(agentId);
    console.log(`\nAlready claimed. Current vault balance: ${ethers.formatEther(balance)} ETH`);
    return;
  }

  console.log(`\nClaiming allocation for agentId ${agentId}...`);
  const tx = await vault.claimAllocation(agentId);
  const receipt = await waitForTx(tx);

  const balance = await vault.getBalance(agentId);
  console.log(`\nClaimed. Vault balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`Tx: ${receipt.hash}`);
}

main().catch((err) => {
  console.error('Claim failed:', err.message || err);
  process.exit(1);
});
