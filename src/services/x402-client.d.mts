export interface PayingFetchOptions {
  mnemonic?: string;
  rpcUrl?: string;
  preferredChain?: string;
  walletId?: string;
  walletAddress?: string;
  apiKey?: string;
  entitySecret?: string;
}

export function createPayingFetch(config?: string | PayingFetchOptions): {
  fetch: typeof globalThis.fetch;
  address: string;
  signerKind: 'circle-wallet' | 'mnemonic';
  walletClient: unknown;
  publicClient: unknown;
};
