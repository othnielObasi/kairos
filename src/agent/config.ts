import '../env/load.js';

export const ARC_TESTNET_CHAIN_ID = 5042002;
const SUPPORTED_TESTNET_CHAIN_IDS = new Set<number>([ARC_TESTNET_CHAIN_ID, 11155111, 84532]);

export function isSupportedTestnet(chainId: number): boolean {
  return SUPPORTED_TESTNET_CHAIN_IDS.has(chainId);
}

export function getChainLabel(chainId: number): string {
  switch (chainId) {
    case ARC_TESTNET_CHAIN_ID:
      return 'Arc Testnet';
    case 11155111:
      return 'Sepolia';
    case 84532:
      return 'Base Sepolia';
    default:
      return `Chain ${chainId}`;
  }
}

export const config = {
  // Wallet
  privateKey: process.env.PRIVATE_KEY || '',
  
  // Network — defaults to Arc Testnet (Circle's EVM-compatible L1 for USDC settlement)
  rpcUrl: process.env.RPC_URL || 'https://rpc.testnet.arc.network',
  chainId: parseInt(process.env.CHAIN_ID || String(ARC_TESTNET_CHAIN_ID)),
  
  // On-chain routing and identity
  agentRegistryAddress: process.env.AGENT_REGISTRY_ADDRESS || '',
  riskRouterAddress: process.env.RISK_ROUTER_ADDRESS || '',

  // Identity registry defaults to Arc testnet
  identityRegistry: process.env.IDENTITY_REGISTRY || '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  identityRegistryChainId: parseInt(process.env.IDENTITY_REGISTRY_CHAIN_ID || String(ARC_TESTNET_CHAIN_ID)),
  identityRegistryRpcUrl: process.env.IDENTITY_REGISTRY_RPC_URL || 'https://rpc.testnet.arc.network',
  
  // IPFS
  pinataJwt: process.env.PINATA_JWT || '',
  pinataGateway: process.env.PINATA_GATEWAY || 'https://ipfs.io/ipfs',
  
  // Agent
  agentName: process.env.AGENT_NAME || 'Kairos',
  agentDescription: process.env.AGENT_DESCRIPTION || 'Accountable autonomous trading agent',
  agentId: process.env.AGENT_ID ? parseInt(process.env.AGENT_ID) : null,

  // Mandate / Permissions
  allowedAssets: (process.env.ALLOWED_ASSETS || 'WETH/USDC,ETH,USDC').split(',').map(s => s.trim()).filter(Boolean),
  allowedProtocols: (process.env.ALLOWED_PROTOCOLS || 'uniswap,aerodrome').split(',').map(s => s.trim()).filter(Boolean),
  restrictedAssets: (process.env.RESTRICTED_ASSETS || '').split(',').map(s => s.trim()).filter(Boolean),
  restrictedProtocols: (process.env.RESTRICTED_PROTOCOLS || '').split(',').map(s => s.trim()).filter(Boolean),
  requireHumanApprovalAboveUsd: parseFloat(process.env.REQUIRE_HUMAN_APPROVAL_ABOVE_USD || '20000'),

  // Integration endpoints
  dexRouterAddress: process.env.DEX_ROUTER_ADDRESS || '',
  agentImageUrl: process.env.AGENT_IMAGE_URL || '',
  dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3000',
  mcpEndpoint: process.env.MCP_ENDPOINT || 'http://localhost:3001/mcp',
  a2aEndpoint: process.env.A2A_ENDPOINT || 'http://localhost:3000/.well-known/agent-card.json',
  registrationOut: process.env.REGISTRATION_OUT || 'agent-registration.json',
  registrationUri: process.env.REGISTRATION_URI || '',
  
  // Trading
  tradingPair: process.env.TRADING_PAIR || 'WETH/USDC',
  maxPositionPct: parseFloat(process.env.MAX_POSITION_PCT || '10') / 100,
  maxDailyLossPct: parseFloat(process.env.MAX_DAILY_LOSS_PCT || '2') / 100,
  maxDrawdownPct: parseFloat(process.env.MAX_DRAWDOWN_PCT || '8') / 100,
  tradingIntervalMs: parseInt(process.env.TRADING_INTERVAL_MS || '120000'),
  
  // Strategy parameters
  strategy: {
    smaFast: 20,
    smaSlow: 50,
    ewmaSpan: 20,
    atrPeriod: 14,
    basePositionPct: 0.04,  // 4% of capital per trade
    stopLossAtrMultiple: 2.5,
    baselineVolatility: 0.02,  // 2% daily vol baseline aligned with the runtime risk model
  },

  // Kraken CLI
  krakenCliPath: process.env.KRAKEN_CLI_PATH || 'kraken',
  krakenPaperTrading: process.env.KRAKEN_PAPER_TRADING !== 'false',  // default true
  krakenCliTimeoutMs: parseInt(process.env.KRAKEN_CLI_TIMEOUT_MS || '30000'),
} as const;

export type Config = typeof config;
