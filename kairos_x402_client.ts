// FILE 2: src/services/x402-client.ts  (NEW)
// ───────────────────────────────────────────────────────────────────────────────
// Wraps external API calls with x402 payment via Circle facilitator.
// If the provider does not return HTTP 402, falls back to standard API key.
// The billing event is recorded either way.
//
// npm install x402

import { wrapFetch } from 'x402/fetch';
import { circleX402Facilitator } from '@circle-fin/x402';
import { billEvent as _billEvent, NanopaymentReceipt } from './nanopayments';
import { billingStore } from './billing-store';

// Circle x402 facilitator — handles payment verification and Arc settlement
const facilitator = circleX402Facilitator({
  apiKey:          process.env.CIRCLE_API_KEY!,
  walletAddress:   process.env.AGENT_WALLET_ADDRESS!,
  chain:           'ARC-TESTNET',
});

// x402-wrapped fetch — automatically pays 402 responses via Circle facilitator
const x402Fetch = wrapFetch(fetch, facilitator);

export type ApiSourceKey =
  | 'coingecko'
  | 'kraken'
  | 'feargreed'
  | 'alphavantage'
  | 'prism';

/**
 * Make a paid API request.
 * - Attempts x402 via Circle facilitator first
 * - Falls back to standard fetch with API key if provider is not 402-enabled
 * - Records a billing event (Nanopayment on Arc) either way
 */
export async function paidFetch(
  url:       string,
  options:   RequestInit = {},
  sourceKey: ApiSourceKey
): Promise<Response> {

  let mode: 'x402' | 'fallback' = 'x402';
  let response: Response;

  try {
    // Attempt x402 payment via Circle facilitator
    response = await x402Fetch(url, options);
    mode = 'x402';
  } catch (x402Err) {
    // Provider not 402-enabled — fall back to standard fetch
    console.info(`[Kairos] x402 not supported by ${sourceKey} — falling back`);
    response = await fetch(url, options);
    mode = 'fallback';
  }

  // Bill the data pull regardless of x402 or fallback
  // This records the economic event on Arc even if the provider isn't x402-ready
  try {
    const receipt = await _billEvent(`data-${sourceKey}`, {
      source: sourceKey,
      type:   'data',
      mode,
    });
    billingStore.addApiEvent(receipt, sourceKey, mode);
  } catch (billingErr) {
    console.warn(`[Kairos] billing skip for ${sourceKey}:`, billingErr);
  }

  return response;
}


// ───────────────────────────────────────────────────────────────────────────────
