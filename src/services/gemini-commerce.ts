import { createLogger } from '../agent/logger.js';
import { billingStore } from './billing-store.js';
import { billEvent, settleCommerceEventAmount } from './nanopayments.js';
import { recordMicroCommerceEvent } from './micro-commerce-store.js';

const log = createLogger('GEMINI-COMMERCE');

const DEFAULT_FUNCTION_MODELS = 'gemini-3-flash-preview';
const DEFAULT_MULTIMODAL_MODELS = 'gemini-3-pro-preview,gemini-3-flash-preview';
const MAX_TOOL_STEPS = 4;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const OPENAI_CHAT_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini';
const DEFAULT_PROOF_SETTLEMENT_USDC = parseFloat(
  process.env.COMMERCE_PROOF_SETTLEMENT_AMOUNT_USDC
  || process.env.TRACK4_SETTLEMENT_AMOUNT_USDC
  || '0.009',
);
const MAX_PROOF_SETTLEMENT_USDC = parseFloat(
  process.env.COMMERCE_PROOF_SETTLEMENT_MAX_USDC || '0.01',
);

interface GeminiGeneratePart {
  text?: string;
  functionCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  };
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiGeneratePart[];
    };
  }>;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface GeminiCommerceTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface GeminiCommerceToolCall {
  name: string;
  args: Record<string, unknown>;
  response: unknown;
}

export interface GeminiCommerceAssistantResult {
  model: string;
  text: string;
  toolCalls: GeminiCommerceToolCall[];
}

export interface CommerceDocumentAnalysis {
  documentType: 'invoice' | 'receipt' | 'delivery_proof' | 'unknown';
  merchantName: string | null;
  invoiceNumber: string | null;
  documentDate: string | null;
  currency: string | null;
  totalAmount: number | null;
  subtotalAmount: number | null;
  taxAmount: number | null;
  lineItems: Array<{
    description: string;
    quantity: number | null;
    amount: number | null;
  }>;
  confidence: number;
  settlementIntent: 'approve' | 'review' | 'reject';
  needsHumanReview: boolean;
  issues: string[];
  summary: string;
  settlementRationale: string;
  proofSettlementAmountUsdc: number;
}

export interface CommerceDocumentPayload {
  imageDataUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  imageUrl?: string;
  prompt?: string;
  expectedMerchant?: string;
  expectedAmount?: number | null;
}

function getGeminiKeys(): string[] {
  const seen = new Set<string>();
  return [
    process.env.GEMINI_API_KEY_PRIMARY,
    process.env.GEMINI_API_KEY_SECONDARY,
    process.env.GEMINI_API_KEY,
  ]
    .map((key) => key?.trim() || '')
    .filter((key) => {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseModelList(raw: string | undefined, fallback: string): string[] {
  const seen = new Set<string>();
  return (raw || fallback)
    .split(',')
    .map((model) => model.trim())
    .filter((model) => {
      if (!model || seen.has(model)) return false;
      seen.add(model);
      return true;
    });
}

function buildGeminiApiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

async function postGeminiGenerate(
  apiKey: string,
  model: string,
  payload: Record<string, unknown>,
): Promise<GeminiGenerateResponse> {
  const response = await fetch(`${buildGeminiApiUrl(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini API returned ${response.status}: ${body.slice(0, 220)}`);
  }

  return await response.json() as GeminiGenerateResponse;
}

async function postOpenAIChat(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<OpenAIChatResponse> {
  const response = await fetch(OPENAI_CHAT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI API returned ${response.status}: ${body.slice(0, 220)}`);
  }

  return await response.json() as OpenAIChatResponse;
}

function extractText(parts: GeminiGeneratePart[]): string {
  return parts
    .map((part) => part.text || '')
    .join('')
    .trim();
}

function extractJsonBlock<T>(text: string): T {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1].trim()) as T;

  const direct = text.match(/(\{[\s\S]*\})/);
  if (direct?.[1]) return JSON.parse(direct[1]) as T;

  return JSON.parse(text) as T;
}

function clampProofAmount(value: number | null | undefined): number {
  const amount = Number.isFinite(value) ? Number(value) : DEFAULT_PROOF_SETTLEMENT_USDC;
  return Math.max(0.001, Math.min(MAX_PROOF_SETTLEMENT_USDC, amount));
}

function buildAssistantSystemPrompt(runtimeContext: string | undefined): string {
  return [
    'You are the Gemini commerce assistant for Kairos, an Arc-native agentic payments runtime.',
    'Use tools whenever the user asks about live Circle, Arc, gateway, or Track 4 state.',
    'Be concise, operator-focused, and explicit about whether something is a settlement proof, a payment receipt, or only a preview.',
    'Never imply a settlement happened unless the tool output says it is confirmed or pending.',
    runtimeContext ? `Runtime context:\n${runtimeContext}` : '',
  ].filter(Boolean).join('\n\n');
}

async function runOpenAIAssistantFallback(input: {
  prompt: string;
  runtimeContext?: string;
  tools: GeminiCommerceTool[];
}): Promise<GeminiCommerceAssistantResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('No OpenAI API key configured for commerce assistant fallback');

  const toolCalls: GeminiCommerceToolCall[] = [];
  for (const tool of input.tools.filter((candidate) => !/^settle_/i.test(candidate.name))) {
    try {
      const response = await tool.handler({});
      toolCalls.push({ name: tool.name, args: {}, response });
    } catch (error) {
      toolCalls.push({
        name: tool.name,
        args: {},
        response: { error: (error as Error).message || String(error) },
      });
    }
  }

  const fallbackPrompt = [
    buildAssistantSystemPrompt(input.runtimeContext),
    'Gemini function calling is currently unavailable, so Kairos is using an OpenAI fallback with live backend snapshots.',
    'Do not say that you executed tool calls directly. Explain that the response is based on fresh backend snapshots.',
    'Never claim a settlement happened unless a snapshot explicitly shows a confirmed or pending receipt.',
    `Operator request:\n${input.prompt}`,
    `Live snapshots:\n${JSON.stringify(toolCalls, null, 2)}`,
  ].join('\n\n');

  const response = await postOpenAIChat(apiKey, {
    model: OPENAI_FALLBACK_MODEL,
    max_tokens: 900,
    temperature: 0.2,
    messages: [{ role: 'user', content: fallbackPrompt }],
  });

  const text = response.choices?.[0]?.message?.content?.trim() || 'No assistant response was generated.';
  try {
    billingStore.addComputeEvent(await billEvent('compute-function-call', { model: OPENAI_FALLBACK_MODEL, type: 'inference' }));
  } catch (_) {}
  return {
    model: OPENAI_FALLBACK_MODEL,
    text,
    toolCalls,
  };
}

export async function runGeminiCommerceAssistant(input: {
  prompt: string;
  runtimeContext?: string;
  tools: GeminiCommerceTool[];
}): Promise<GeminiCommerceAssistantResult> {
  const keys = getGeminiKeys();
  const models = parseModelList(process.env.GEMINI_FUNCTION_MODELS, DEFAULT_FUNCTION_MODELS);
  if (keys.length === 0) throw new Error('No Gemini API key configured for commerce assistant');

  const toolMap = new Map(input.tools.map((tool) => [tool.name, tool]));
  const declarations = input.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  let lastError: Error | null = null;

  for (const model of models) {
    for (const apiKey of keys) {
      const toolCalls: GeminiCommerceToolCall[] = [];
      const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
        {
          role: 'user',
          parts: [{ text: `${buildAssistantSystemPrompt(input.runtimeContext)}\n\nOperator request:\n${input.prompt}` }],
        },
      ];

      try {
        for (let step = 0; step < MAX_TOOL_STEPS; step++) {
          const response = await postGeminiGenerate(apiKey, model, {
            contents,
            tools: [{ functionDeclarations: declarations }],
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          });

          const parts = response.candidates?.[0]?.content?.parts || [];
          const functionCalls = parts.filter((part) => part.functionCall?.name);
          const text = extractText(parts);

          if (functionCalls.length === 0) {
            try {
              billingStore.addComputeEvent(await billEvent('compute-function-call', { model, type: 'inference' }));
            } catch (_) {}
            return {
              model,
              text: text || 'No assistant response was generated.',
              toolCalls,
            };
          }

          contents.push({
            role: 'model',
            parts: parts.map((part) => part.functionCall
              ? { functionCall: part.functionCall }
              : { text: part.text || '' }),
          });

          const responseParts: Array<Record<string, unknown>> = [];
          for (const part of functionCalls) {
            const name = part.functionCall?.name || '';
            const args = (part.functionCall?.args || {}) as Record<string, unknown>;
            const id = part.functionCall?.id;
            const tool = toolMap.get(name);
            if (!tool) {
              responseParts.push({
                functionResponse: {
                  ...(id ? { id } : {}),
                  name,
                  response: {
                    error: `Unknown tool: ${name}`,
                  },
                },
              });
              continue;
            }

            const result = await tool.handler(args);
            toolCalls.push({ name, args, response: result });
            responseParts.push({
              functionResponse: {
                ...(id ? { id } : {}),
                name,
                response: {
                  result,
                },
              },
            });
          }

          contents.push({
            role: 'user',
            parts: responseParts,
          });
        }

        throw new Error('Gemini function-calling workflow exceeded max tool steps');
      } catch (error) {
        lastError = error as Error;
        log.warn(`Gemini commerce assistant failed for ${model}`, { error: String(error) });
      }
    }
  }

  if (process.env.OPENAI_API_KEY) {
    log.warn('Gemini commerce assistant exhausted; switching to OpenAI fallback');
    return await runOpenAIAssistantFallback(input);
  }

  throw lastError || new Error('Gemini commerce assistant failed');
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('imageDataUrl must be a valid data URL');
  }
  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function inferMimeTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

async function resolveImagePayload(payload: CommerceDocumentPayload): Promise<{ mimeType: string; base64: string }> {
  if (payload.imageDataUrl) {
    return parseDataUrl(payload.imageDataUrl);
  }

  if (payload.imageBase64) {
    if (!payload.mimeType) throw new Error('mimeType is required when using imageBase64');
    return { mimeType: payload.mimeType, base64: payload.imageBase64 };
  }

  if (payload.imageUrl) {
    const response = await fetch(payload.imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image URL: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Image is too large for multimodal analysis');
    }
    return {
      mimeType: (response.headers.get('content-type') || inferMimeTypeFromUrl(payload.imageUrl)).split(';')[0].trim(),
      base64: bytes.toString('base64'),
    };
  }

  throw new Error('Provide imageDataUrl, imageBase64, or imageUrl');
}

export async function analyzeCommerceDocument(
  payload: CommerceDocumentPayload,
): Promise<{ model: string; analysis: CommerceDocumentAnalysis }> {
  const keys = getGeminiKeys();
  const models = parseModelList(process.env.GEMINI_MULTIMODAL_MODELS, DEFAULT_MULTIMODAL_MODELS);
  if (keys.length === 0) throw new Error('No Gemini API key configured for multimodal analysis');

  const image = await resolveImagePayload(payload);
  const decodedBytes = Buffer.from(image.base64, 'base64');
  if (decodedBytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the maximum supported size for multimodal analysis');
  }

  const prompt = [
    'Analyze this commerce document for Kairos, an Arc-native agentic payments runtime.',
    'Return ONLY valid JSON.',
    'Determine whether the image is an invoice, receipt, delivery proof, or unknown.',
    'Extract merchant, invoice or receipt number, date, total, subtotal, tax, line items, and obvious issues.',
    'Recommend one of: approve, review, reject.',
    'Set needsHumanReview to true whenever the image is blurry, incomplete, totals conflict, or confidence is low.',
    'proofSettlementAmountUsdc must be a safe proof amount at or below 0.01 USDC.',
    payload.expectedMerchant ? `Expected merchant: ${payload.expectedMerchant}` : '',
    Number.isFinite(payload.expectedAmount) ? `Expected total amount: ${payload.expectedAmount}` : '',
    payload.prompt ? `Operator note: ${payload.prompt}` : '',
    'JSON schema:',
    '{"documentType":"invoice|receipt|delivery_proof|unknown","merchantName":"string|null","invoiceNumber":"string|null","documentDate":"ISO-8601 string|null","currency":"string|null","totalAmount":0,"subtotalAmount":0,"taxAmount":0,"lineItems":[{"description":"string","quantity":0,"amount":0}],"confidence":0.0,"settlementIntent":"approve|review|reject","needsHumanReview":true,"issues":["string"],"summary":"string","settlementRationale":"string","proofSettlementAmountUsdc":0.009}',
  ].filter(Boolean).join('\n');

  let lastError: Error | null = null;

  for (const model of models) {
    for (const apiKey of keys) {
      try {
        const response = await postGeminiGenerate(apiKey, model, {
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: image.mimeType,
                  data: image.base64,
                },
              },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        });

        const text = extractText(response.candidates?.[0]?.content?.parts || []);
        const analysis = extractJsonBlock<CommerceDocumentAnalysis>(text);
        analysis.proofSettlementAmountUsdc = clampProofAmount(analysis.proofSettlementAmountUsdc);
        analysis.issues = Array.isArray(analysis.issues) ? analysis.issues : [];
        analysis.lineItems = Array.isArray(analysis.lineItems) ? analysis.lineItems : [];
        analysis.confidence = Number.isFinite(analysis.confidence) ? analysis.confidence : 0;

        try {
          billingStore.addComputeEvent(await billEvent('compute-multimodal', { model, type: 'inference' }));
        } catch (_) {}

        return { model, analysis };
      } catch (error) {
        lastError = error as Error;
        log.warn(`Gemini multimodal analysis failed for ${model}`, { error: String(error) });
      }
    }
  }

  if (process.env.OPENAI_API_KEY) {
    const dataUrl = `data:${image.mimeType};base64,${image.base64}`;
    const response = await postOpenAIChat(process.env.OPENAI_API_KEY, {
      model: OPENAI_FALLBACK_MODEL,
      max_tokens: 1600,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
            },
          },
        ],
      }],
    });

    const text = response.choices?.[0]?.message?.content || '';
    const analysis = extractJsonBlock<CommerceDocumentAnalysis>(text);
    analysis.proofSettlementAmountUsdc = clampProofAmount(analysis.proofSettlementAmountUsdc);
    analysis.issues = Array.isArray(analysis.issues) ? analysis.issues : [];
    analysis.lineItems = Array.isArray(analysis.lineItems) ? analysis.lineItems : [];
    analysis.confidence = Number.isFinite(analysis.confidence) ? analysis.confidence : 0;

    try {
      billingStore.addComputeEvent(await billEvent('compute-multimodal', { model: OPENAI_FALLBACK_MODEL, type: 'inference' }));
    } catch (_) {}

    return { model: OPENAI_FALLBACK_MODEL, analysis };
  }

  throw lastError || new Error('Gemini multimodal analysis failed');
}

export function buildCommerceSettlementPreview(input: {
  merchantName?: string | null;
  documentType?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
  requestedAmountUsdc?: number | null;
  needsHumanReview?: boolean;
}) {
  const proofAmountUsdc = clampProofAmount(input.requestedAmountUsdc);
  const settlementAddress = process.env.MICRO_COMMERCE_SETTLEMENT_ADDRESS
    || process.env.GOVERNANCE_BILLING_ADDRESS
    || process.env.AGENT_WALLET_ADDRESS
    || null;
  const signerReady = Boolean(
    (process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID)
    || process.env.OWS_MNEMONIC
    || process.env.PRIVATE_KEY
    || process.env.NANOPAYMENT_PRIVATE_KEY,
  );

  return {
    merchantName: input.merchantName || 'Unknown merchant',
    documentType: input.documentType || 'unknown',
    referenceAmount: Number.isFinite(input.totalAmount) ? input.totalAmount : null,
    referenceCurrency: input.currency || null,
    proofSettlementAmountUsdc: proofAmountUsdc,
    settlementAddress,
    signerReady,
    ready: Boolean(settlementAddress && signerReady && !input.needsHumanReview),
    reason: input.needsHumanReview
      ? 'Document requires human review before any settlement proof should be created.'
      : signerReady
        ? 'Kairos can create a small Arc USDC proof receipt for this commerce event.'
        : 'No Arc settlement signer is configured for proof settlement.',
  };
}

export async function settleCommerceProofReceipt(input: {
  merchantName?: string | null;
  documentType?: string | null;
  summary?: string | null;
  requestedAmountUsdc?: number | null;
  settlementIntent?: string | null;
  needsHumanReview?: boolean;
  invoiceNumber?: string | null;
}) {
  if (input.needsHumanReview) {
    throw new Error('Document still requires human review; refusing proof settlement');
  }
  if (input.settlementIntent === 'reject') {
    throw new Error('Rejected document cannot be settled');
  }

  const proofAmountUsdc = clampProofAmount(input.requestedAmountUsdc);
  const merchant = input.merchantName || 'Unknown merchant';
  const documentType = input.documentType || 'receipt';
  const invoice = input.invoiceNumber ? ` ${input.invoiceNumber}` : '';
  const item = `${merchant} ${documentType}${invoice}`.trim();
  const summary = input.summary || `Gemini verified a ${documentType} for ${merchant}.`;
  const receipt = await settleCommerceEventAmount('track4-gemini-commerce-proof', proofAmountUsdc, {
    source: 'gemini-commerce-proof',
    model: 'gemini-multimodal',
    type: 'micro-commerce',
  });

  const event = recordMicroCommerceEvent(receipt, {
    item,
    buyer: 'Kairos agent',
    seller: 'Kairos commerce proof rail',
    trigger: 'gemini-multimodal-commerce',
    description: `${summary} Settled ${proofAmountUsdc.toFixed(3)} USDC proof receipt on Arc.`,
    checkpointId: null,
  });

  return {
    proofAmountUsdc,
    receipt,
    event,
  };
}
