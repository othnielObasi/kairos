// src/services/circle-wallet.ts  (NEW)
// npm install @circle-fin/developer-controlled-wallets

import { CircleDeveloperControlledWalletsClient as CircleWalletClient } from '@circle-fin/developer-controlled-wallets';
import { ethers } from 'ethers';

export const circleClient = new CircleWalletClient({
  apiKey:       process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

// Run ONCE to create the Kairos agent wallet on Arc testnet
// Then store the address in .env.arc as AGENT_WALLET_ADDRESS
export async function createAgentWallet() {
  const { data } = await circleClient.createWallets({
    blockchains: ['ARC-TESTNET'],
    count: 1,
    walletSetId: process.env.CIRCLE_WALLET_SET_ID!,
  } as any);
  const wallet = (data as any).wallets[0];
  console.log('✓ Kairos agent wallet created on Arc testnet');
  console.log('Add to .env.arc:');
  console.log('AGENT_WALLET_ADDRESS=' + wallet.address);
  return wallet;
}

// Get a signer compatible with the existing ethers.js setup in sdk.ts
// Circle Wallets uses EIP-1271 — compatible with src/chain/eip1271.ts
export async function getCircleSigner(provider: ethers.Provider) {
  const walletId = process.env.CIRCLE_WALLET_ID!;
  // Returns a signer that delegates signing to Circle Wallets API
  return new CircleWalletSigner(
    process.env.AGENT_WALLET_ADDRESS!,
    walletId,
    provider
  );
}

// Minimal signer wrapper — delegates to Circle Wallets API
class CircleWalletSigner extends ethers.AbstractSigner {
  constructor(
    private address: string,
    private walletId: string,
    provider: ethers.Provider
  ) {
    super(provider);
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
    const { data } = await circleClient.createTransaction({
      walletId:    this.walletId,
      contractAddress: tx.to as string,
      abiFunctionSignature: '',
      abiParameters: [],
      feeLevel:    'MEDIUM',
    } as any);
    return (data as any).transaction.txHash;
  }

  async signMessage(message: string): Promise<string> {
    const { data } = await circleClient.signMessage({
      walletId: this.walletId,
      message,
    } as any);
    return (data as any).signature;
  }

  connect(provider: ethers.Provider): CircleWalletSigner {
    return new CircleWalletSigner(this.address, this.walletId, provider);
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    const { data } = await circleClient.signTypedData({
      walletId: this.walletId,
      domain,
      types,
      primaryType: Object.keys(types)[0],
      message: value,
    } as any);
    return (data as any).signature;
  }
}
