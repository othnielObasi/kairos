#!/usr/bin/env tsx

import '../src/env/load.js';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from '@circle-fin/developer-controlled-wallets';

const ENV_PATH = path.resolve(process.cwd(), '.env');
const RECOVERY_DIR = path.resolve(process.cwd(), '.circle-recovery-file');
const METADATA_PATH = path.join(RECOVERY_DIR, 'circle-wallet-bootstrap.json');
const WALLET_SET_NAME = `Kairos Arc Wallet Set ${new Date().toISOString().slice(0, 10)}`;
const TARGET_BLOCKCHAIN = 'ARC-TESTNET' as const;

function readEnvFile(): string {
  return fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertEnvValue(content: string, key: string, value: string): string {
  const normalized = value.trim();
  const line = `${key}=${normalized}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm');

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const suffix = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  return `${content}${suffix}${line}\n`;
}

function saveBootstrapMetadata(payload: Record<string, unknown>): void {
  fs.mkdirSync(RECOVERY_DIR, { recursive: true });
  fs.writeFileSync(METADATA_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

async function main(): Promise<void> {
  const apiKey = process.env.CIRCLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('CIRCLE_API_KEY is required in .env before bootstrapping Circle Wallets.');
  }

  console.log('');
  console.log('Kairos Circle Wallet Bootstrap');
  console.log(`  Env file:      ${ENV_PATH}`);
  console.log(`  Recovery dir:  ${RECOVERY_DIR}`);
  console.log('');

  let envContent = readEnvFile();

  fs.mkdirSync(RECOVERY_DIR, { recursive: true });

  let entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();
  if (!entitySecret) {
    console.log('1. Generating and registering a new Circle entity secret...');
    entitySecret = crypto.randomBytes(32).toString('hex');
    await registerEntitySecretCiphertext({
      apiKey,
      entitySecret,
      recoveryFileDownloadPath: RECOVERY_DIR,
    });
    envContent = upsertEnvValue(envContent, 'CIRCLE_ENTITY_SECRET', entitySecret);
    console.log('   Entity secret registered and persisted to .env');
  } else {
    console.log('1. Reusing existing entity secret from environment');
  }

  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  });

  let walletSetId = process.env.CIRCLE_WALLET_SET_ID?.trim();
  if (!walletSetId) {
    console.log('2. Creating Circle wallet set on your developer account...');
    const walletSet = (await client.createWalletSet({ name: WALLET_SET_NAME })).data?.walletSet;
    if (!walletSet?.id) {
      throw new Error('Circle did not return a wallet set id.');
    }
    walletSetId = walletSet.id;
    envContent = upsertEnvValue(envContent, 'CIRCLE_WALLET_SET_ID', walletSetId);
    console.log(`   Wallet set created: ${walletSetId}`);
  } else {
    console.log(`2. Reusing existing wallet set: ${walletSetId}`);
  }

  let walletId = process.env.CIRCLE_WALLET_ID?.trim();
  let walletAddress = process.env.AGENT_WALLET_ADDRESS?.trim();
  let walletBlockchain = process.env.CIRCLE_WALLET_BLOCKCHAIN?.trim();

  if (walletId && walletBlockchain && walletBlockchain !== TARGET_BLOCKCHAIN) {
    console.log(`3. Deriving ${TARGET_BLOCKCHAIN} wallet from existing ${walletBlockchain} wallet...`);
    const wallet = (await client.deriveWallet({
      id: walletId,
      blockchain: TARGET_BLOCKCHAIN,
    })).data?.wallet;

    if (!wallet?.id || !wallet.address) {
      throw new Error(`Circle did not return a derived ${TARGET_BLOCKCHAIN} wallet.`);
    }

    walletId = wallet.id;
    walletAddress = wallet.address;
    walletBlockchain = wallet.blockchain;

    envContent = upsertEnvValue(envContent, 'CIRCLE_WALLET_ID', walletId);
    envContent = upsertEnvValue(envContent, 'AGENT_WALLET_ADDRESS', walletAddress);
    envContent = upsertEnvValue(envContent, 'CIRCLE_WALLET_BLOCKCHAIN', walletBlockchain);
    if (!process.env.GOVERNANCE_BILLING_ADDRESS?.trim()) {
      envContent = upsertEnvValue(envContent, 'GOVERNANCE_BILLING_ADDRESS', walletAddress);
    }

    console.log(`   Derived wallet: ${walletId}`);
    console.log(`   Address:        ${walletAddress}`);
  } else if (!walletId || !walletAddress) {
    console.log(`3. Creating ${TARGET_BLOCKCHAIN} developer-controlled wallet...`);
    const wallet = (await client.createWallets({
      walletSetId,
      blockchains: [TARGET_BLOCKCHAIN],
      count: 1,
      accountType: 'EOA',
    })).data?.wallets?.[0];

    if (!wallet?.id || !wallet.address) {
      throw new Error('Circle did not return a wallet id/address.');
    }

    walletId = wallet.id;
    walletAddress = wallet.address;
    walletBlockchain = wallet.blockchain;

    envContent = upsertEnvValue(envContent, 'CIRCLE_WALLET_ID', walletId);
    envContent = upsertEnvValue(envContent, 'AGENT_WALLET_ADDRESS', walletAddress);
    if (walletBlockchain) {
      envContent = upsertEnvValue(envContent, 'CIRCLE_WALLET_BLOCKCHAIN', walletBlockchain);
    }
    if (!process.env.GOVERNANCE_BILLING_ADDRESS?.trim()) {
      envContent = upsertEnvValue(envContent, 'GOVERNANCE_BILLING_ADDRESS', walletAddress);
    }

    console.log(`   Wallet created: ${walletId}`);
    console.log(`   Address:        ${walletAddress}`);
  } else {
    console.log(`3. Reusing existing Circle wallet: ${walletId}`);
    console.log(`   Address:        ${walletAddress}`);
  }

  fs.writeFileSync(ENV_PATH, envContent, 'utf8');

  saveBootstrapMetadata({
    bootstrappedAt: new Date().toISOString(),
    walletSetId,
    walletId,
    walletAddress,
    walletBlockchain,
    envPath: ENV_PATH,
    recoveryDir: RECOVERY_DIR,
  });

  console.log('');
  console.log('Bootstrap complete');
  console.log(`  CIRCLE_WALLET_SET_ID=${walletSetId}`);
  console.log(`  CIRCLE_WALLET_ID=${walletId}`);
  console.log(`  AGENT_WALLET_ADDRESS=${walletAddress}`);
  console.log(`  CIRCLE_WALLET_BLOCKCHAIN=${walletBlockchain}`);
  console.log(`  Metadata: ${METADATA_PATH}`);
  console.log('');
  console.log('Next: fund the wallet on https://faucet.circle.com using Arc Testnet USDC.');
}

main().catch((error) => {
  console.error('Circle bootstrap failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
