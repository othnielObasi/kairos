// FILE 1: src/services/nanopayments.ts  (NEW)
// ───────────────────────────────────────────────────────────────────────────────
// Circle Nanopayments — uses @circle-fin/nanopayments when available,
// falls back to a no-op stub for build compatibility.

let NanopaymentsClient: any;
try {
  // @ts-ignore — package may not be installed yet
  NanopaymentsClient = (await import('@circle-fin/nanopayments')).NanopaymentsClient;
} catch {
  // Package not available — stub so the build succeeds
  NanopaymentsClient = class { constructor(_: any) {} async sendPayment(_o: any) { return { id: 'stub', status: 'pending' }; } };
}

const nanoClient = new NanopaymentsClient({
  apiKey: process.env.CIRCLE_API_KEY || '',
});

export const NANO_AMOUNT = parseFloat(
  process.env.NANOPAYMENT_AMOUNT_USDC || '0.001'
);

export interface NanopaymentReceipt {
  eventName:   string;
  source?:     string;
  model?:      string;
  type?:       string;  // 'governance' | 'data' | 'inference' | 'reflection'
  mode?:       string;  // 'x402' | 'nanopayment' | 'fallback'
  txHash:      string;
  amount:      number;
  confirmedAt: number;
}

/**
 * Bill a governance or compute event via Circle Nanopayments.
 * NEVER throws — billing failure returns a pending receipt.
 * Governance logic is always unaffected by billing outcomes.
 */
export async function billEvent(
  eventName: string,
  meta: {
    source?: string;
    model?:  string;
    type?:   string;
    mode?:   string;
  } = {}
): Promise<NanopaymentReceipt> {
  try {
    const payment = await nanoClient.createPayment({
      from:     process.env.AGENT_WALLET_ADDRESS!,
      to:       process.env.GOVERNANCE_BILLING_ADDRESS!,
      amount:   NANO_AMOUNT.toString(),
      currency: 'USDC',
      metadata: {
        eventName,
        product:  'Kairos',
        agentId:  process.env.AGENT_ID || 'kairos-1',
        chain:    'Arc Testnet',
        ...meta,
      },
    });

    return {
      eventName,
      ...meta,
      txHash:      payment.txHash,
      amount:      NANO_AMOUNT,
      confirmedAt: Date.now(),
    };

  } catch (err) {
    // Log but never block — return pending receipt
    console.warn(`[Kairos] billEvent failed (${eventName}):`, err);
    return {
      eventName,
      ...meta,
      txHash:      'pending_' + Date.now(),
      amount:      NANO_AMOUNT,
      confirmedAt: Date.now(),
    };
  }
}


// ───────────────────────────────────────────────────────────────────────────────
