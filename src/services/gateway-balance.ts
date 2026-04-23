import { ethers } from 'ethers';

export interface GatewayBalanceInfo {
  balance: string;
  formatted: string;
  kind: 'circle-wallet-balance' | 'onchain-wallet-balance' | 'unconfigured';
  gatewayDepositVerified: boolean;
  warning?: string;
}

export async function getGatewayBalanceInfo(): Promise<GatewayBalanceInfo> {
  const usdcAddress = (process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000').toLowerCase();

  if (process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID) {
    const { CircleDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
    const circleClient = new CircleDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    });
    const response = await circleClient.getWalletTokenBalance({
      id: process.env.CIRCLE_WALLET_ID,
      includeAll: true,
    } as any);
    const balances = (response as any)?.data?.tokenBalances || [];
    const usdcBalance = balances.find((entry: any) => {
      const tokenAddress = entry?.token?.tokenAddress?.toLowerCase?.() || '';
      const symbol = entry?.token?.symbol || '';
      return tokenAddress === usdcAddress || symbol === 'USDC';
    });
    const formatted = usdcBalance?.amount || '0.00';
    return {
      balance: formatted,
      formatted,
      kind: 'circle-wallet-balance',
      gatewayDepositVerified: false,
      warning: 'wallet USDC; Gateway spend pool is separate',
    };
  }

  const agentAddress = process.env.AGENT_WALLET_ADDRESS;
  if (!agentAddress) {
    return {
      balance: '0',
      formatted: '0.00',
      kind: 'unconfigured',
      gatewayDepositVerified: false,
      warning: 'x402 wallet not configured',
    };
  }

  const rpc = process.env.ARC_RPC_URL || process.env.OWS_RPC_URL || 'https://rpc.testnet.arc.network';
  const provider = new ethers.JsonRpcProvider(rpc);
  const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
  const token = new ethers.Contract(usdcAddress, erc20Abi, provider);
  const bal = await token.balanceOf(agentAddress);
  return {
    balance: bal.toString(),
    formatted: ethers.formatUnits(bal, 6),
    kind: 'onchain-wallet-balance',
    gatewayDepositVerified: false,
    warning: 'wallet USDC; Gateway spend pool is separate',
  };
}
