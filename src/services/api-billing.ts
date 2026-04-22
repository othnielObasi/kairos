import { createLogger } from '../agent/logger.js';
import { billingStore } from './billing-store.js';
import { billEvent } from './nanopayments.js';

const log = createLogger('API-BILLING');

interface Track2BillingOptions {
  source?: string;
  type?: string;
}

export async function recordTrack2Billing(
  sourceKey: string,
  eventName: string,
  mode: 'x402' | 'fallback',
  options: Track2BillingOptions = {},
): Promise<void> {
  try {
    const receipt = await billEvent(eventName, {
      source: options.source || sourceKey,
      type: options.type || 'data',
    });
    billingStore.addApiEvent(receipt, sourceKey, mode);
  } catch (error) {
    log.warn('Track 2 billing failed', {
      sourceKey,
      eventName,
      mode,
      error: String(error),
    });
  }
}
