/**
 * One real end-to-end on-chain demo path.
 *
 * Purpose:
 * - build a real TradeIntent path using the current execution pipeline
 *
 * Run:
 *   npm run demo:onchain
 *
 * Optional env:
 *   RUN_ONCHAIN_DEMO=true -> actually submit the trade intent
 */

import '../src/env/load.js';

import { executeTrade } from '../src/chain/executor.js';
import { buildTradeArtifact } from '../src/trust/artifact-emitter.js';
import { generateSimulatedData } from '../src/data/price-feed.js';
import { runStrategy, resetStrategy } from '../src/strategy/momentum.js';
import { RiskEngine } from '../src/risk/engine.js';

async function main() {
  console.log('\n=== Kairos On-Chain Demo Path ===\n');

  const market = generateSimulatedData(80, 3000, 0.02, 0.0004);
  resetStrategy();
  const capital = 10000;
  const strategyOutput = runStrategy(market, capital);
  const riskEngine = new RiskEngine(capital);
  const riskDecision = riskEngine.evaluate(strategyOutput);
  const artifact = buildTradeArtifact(strategyOutput, riskDecision, Number(process.env.AGENT_ID || 1));

  console.log('Demo path built:', {
    signal: strategyOutput.signal.direction,
    confidence: strategyOutput.signal.confidence,
    approved: riskDecision.approved,
    price: strategyOutput.currentPrice,
    size: riskDecision.finalPositionSize,
  });

  if (process.env.RUN_ONCHAIN_DEMO !== 'true') {
    console.log('\nDry-run only. Set RUN_ONCHAIN_DEMO=true to submit a real TradeIntent through the Risk Router.');
    process.exit(0);
  }

  if (!riskDecision.approved) {
    console.error('Risk engine did not approve the sample trade; aborting live demo path.');
    process.exit(1);
  }

  const result = await executeTrade(strategyOutput, riskDecision, artifact, Number(process.env.AGENT_ID || 1));
  console.log('Execution result:', result);

  if (!result.success) process.exit(1);
}

main().catch((err) => {
  console.error('demo:onchain failed:', err);
  process.exit(1);
});
