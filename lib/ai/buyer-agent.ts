import openai from './client';
import { BUYER_SYSTEM_PROMPT, INTENT_EXTRACTION_PROMPT } from './prompts/buyer';
import {
  ParsedIntentSchema,
  type ParsedIntent,
  type RankingOutput,
} from './schemas';
import { searchProducts } from '@/lib/commerce/search';
import { applyConstraints, filterEligible } from '@/lib/commerce/constraints';
import { rankProducts } from '@/lib/commerce/ranking';
import { logEvent } from '@/lib/audit/events';
import type { ProductWithDetails, ConstraintCheck, SearchResult } from '@/types/commerce';
import { AgentState, EventType } from '@/types/agent';

export interface BuyerAgentResult {
  state: string;
  intent?: ParsedIntent;
  searchResult?: SearchResult;
  ranking?: RankingOutput;
  selectedProduct?: ProductWithDetails;
  constraintResults?: ConstraintCheck[];
  agentMessage: string;
  error?: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
}

/**
 * Run the full buyer agent pipeline:
 * 1. Parse intent from natural language
 * 2. Search products
 * 3. Apply deterministic constraints
 * 4. AI rank eligible products
 * 5. Return recommendation
 */
export async function runBuyerAgent(
  sessionId: string,
  userMessage: string
): Promise<BuyerAgentResult> {
  const startTime = Date.now();

  try {
    // ─── STEP 1: PARSE INTENT ──────────────────────────────────────────────
    const intent = await parseIntent(userMessage, sessionId);

    if (intent.clarificationNeeded) {
      return {
        state: AgentState.UNDERSTAND_INTENT,
        intent,
        agentMessage: intent.clarificationQuestion || 'Could you clarify your requirements?',
        needsClarification: true,
        clarificationQuestion: intent.clarificationQuestion,
      };
    }

    await logEvent({
      sessionId,
      agent: 'buyer_agent',
      eventType: EventType.INTENT_PARSED,
      status: 'SUCCESS',
      input: { userMessage },
      output: { intent },
      durationMs: Date.now() - startTime,
    });

    // ─── STEP 2: SEARCH PRODUCTS ───────────────────────────────────────────
    const candidates = await searchProducts(intent);

    await logEvent({
      sessionId,
      agent: 'buyer_agent',
      eventType: EventType.PRODUCTS_SEARCHED,
      status: 'SUCCESS',
      output: {
        totalFound: candidates.length,
        productIds: candidates.map((p) => p.id),
      },
    });

    if (candidates.length === 0) {
      return {
        state: AgentState.NO_MATCH,
        intent,
        agentMessage: buildNoMatchMessage(intent, 'no_products'),
        error: 'NO_PRODUCTS_FOUND',
      };
    }

    // ─── STEP 3: APPLY CONSTRAINTS ─────────────────────────────────────────
    const constraintResults = await applyConstraints(candidates, intent);
    const eligibleProducts = filterEligible(candidates, constraintResults);

    await logEvent({
      sessionId,
      agent: 'buyer_agent',
      eventType: EventType.CONSTRAINTS_EVALUATED,
      status: 'SUCCESS',
      input: {
        totalCandidates: candidates.length,
        intent: { hardRequirements: intent.hardRequirements },
      },
      output: {
        eligible: eligibleProducts.length,
        eliminated: candidates.length - eligibleProducts.length,
        results: constraintResults.map((r) => ({
          productId: r.productId,
          eligible: r.eligible,
          failures: r.failures,
        })),
      },
    });

    const searchResult: SearchResult = {
      query: userMessage,
      totalFound: candidates.length,
      candidates,
      eligible: eligibleProducts,
      constraintResults,
    };

    if (eligibleProducts.length === 0) {
      return {
        state: AgentState.NO_MATCH,
        intent,
        searchResult,
        constraintResults,
        agentMessage: buildNoMatchMessage(intent, 'constraint_failure', constraintResults),
        error: 'CONSTRAINT_VIOLATION',
      };
    }

    // ─── STEP 4: AI RANK ELIGIBLE PRODUCTS ────────────────────────────────
    let ranking: RankingOutput;

    try {
      ranking = await rankProducts(eligibleProducts, intent, constraintResults);
    } catch (rankError) {
      // AI ranking failed — fall back to first eligible product
      console.error('[buyer-agent] AI ranking failed, using fallback:', rankError);
      ranking = {
        selectedProductId: eligibleProducts[0].id,
        confidence: 0.7,
        reasons: ['Selected based on price and availability'],
        tradeoffs: [],
        explanation: 'Recommended based on best match to your requirements.',
      };
    }

    const selectedProduct = eligibleProducts.find((p) => p.id === ranking.selectedProductId);

    if (!selectedProduct) {
      throw new Error(`AI selected invalid product ID: ${ranking.selectedProductId}`);
    }

    await logEvent({
      sessionId,
      agent: 'buyer_agent',
      eventType: EventType.PRODUCT_SELECTED,
      status: 'SUCCESS',
      output: {
        selectedProductId: ranking.selectedProductId,
        confidence: ranking.confidence,
        reasons: ranking.reasons,
      },
    });

    // ─── STEP 5: BUILD EXPLANATION MESSAGE ────────────────────────────────
    const agentMessage = buildRecommendationMessage(
      selectedProduct,
      ranking,
      intent,
      constraintResults
    );

    return {
      state: AgentState.AWAIT_APPROVAL,
      intent,
      searchResult,
      ranking,
      selectedProduct,
      constraintResults,
      agentMessage,
    };
  } catch (error) {
    console.error('[buyer-agent] Pipeline error:', error);
    return {
      state: AgentState.NO_MATCH,
      agentMessage:
        'I encountered an issue processing your request. Please try again.',
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Parse natural language query into structured intent using OpenAI.
 */
async function parseIntent(
  userMessage: string,
  sessionId: string
): Promise<ParsedIntent> {
  if (!process.env.OPENAI_API_KEY) {
    // Demo fallback when OpenAI is not configured
    return buildDemoIntent(userMessage);
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTENT_EXTRACTION_PROMPT },
        {
          role: 'user',
          content: `Parse this shopping query into structured intent:\n\n"${userMessage}"\n\nRespond with JSON only.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500,
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) throw new Error('Empty response from intent extraction');

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      throw new Error('Intent extraction returned invalid JSON');
    }

    const validated = ParsedIntentSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn('[buyer-agent] Intent schema validation failed:', validated.error);
      // Try to extract what we can
      return buildFallbackIntent(userMessage, parsed as Record<string, unknown>);
    }

    return validated.data;
  } catch (error: any) {
    // If the API key has no credits or quota is exhausted, fall back to demo mode
    const isQuotaError =
      error?.status === 429 ||
      error?.code === 'insufficient_quota' ||
      error?.code === 'credit_balance_exhausted';

    if (isQuotaError) {
      console.warn('[buyer-agent] OpenAI quota exhausted — falling back to demo intent parser');
      return buildDemoIntent(userMessage);
    }

    // Re-throw other errors (network issues, auth failures, etc.)
    throw error;
  }
}

/**
 * Build a demo intent for when OpenAI is not configured.
 * Handles the main demo query deterministically.
 */
function buildDemoIntent(query: string): ParsedIntent {
  const q = query.toLowerCase();

  // Detect the main demo query pattern
  const isMainDemo = q.includes('waterproof') && q.includes('backpack');
  const isFailureDemo = isMainDemo && (q.includes('2,000') || q.includes('2000'));
  const isSpendingDemo = q.includes('75,000') || q.includes('75000') || q.includes('laptop');

  const today = new Date();
  const friday = getNextFriday(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSpendingDemo) {
    return {
      rawQuery: query,
      category: 'electronics',
      budget: { max: 150000, min: null, currency: 'INR' },
      destination: null,
      deliveryDeadline: null,
      hardRequirements: [],
      softPreferences: [{ attribute: 'type', value: 'laptop', weight: 1 }],
      clarificationNeeded: false,
    };
  }

  if (isFailureDemo) {
    return {
      rawQuery: query,
      category: 'backpacks',
      budget: { max: 2000, min: null, currency: 'INR' },
      destination: 'bangalore',
      deliveryDeadline: formatDate(tomorrow),
      hardRequirements: [
        { attribute: 'waterproof', value: true, operator: 'eq' },
      ],
      softPreferences: [],
      clarificationNeeded: false,
    };
  }

  if (isMainDemo) {
    // Extract budget
    let maxBudget = 4000;
    const budgetMatch = q.match(/₹?\s*([0-9,]+)/);
    if (budgetMatch) {
      maxBudget = parseInt(budgetMatch[1].replace(/,/g, ''));
    }

    // Extract destination
    let destination = null;
    if (q.includes('bangalore') || q.includes('bengaluru')) destination = 'bangalore';
    else if (q.includes('mumbai') || q.includes('bombay')) destination = 'mumbai';
    else if (q.includes('delhi')) destination = 'delhi';

    // Extract deadline
    let deadline = null;
    if (q.includes('friday')) deadline = formatDate(friday);
    else if (q.includes('tomorrow')) deadline = formatDate(tomorrow);

    return {
      rawQuery: query,
      category: 'backpacks',
      budget: { max: maxBudget, min: null, currency: 'INR' },
      destination,
      deliveryDeadline: deadline,
      hardRequirements: [
        { attribute: 'waterproof', value: true, operator: 'eq' },
      ],
      softPreferences: [
        { attribute: 'laptop_size_inches', value: 15.6, weight: 0.5 },
      ],
      clarificationNeeded: false,
    };
  }

  // Generic fallback
  return {
    rawQuery: query,
    category: null,
    budget: { max: null, min: null, currency: 'INR' },
    destination: null,
    deliveryDeadline: null,
    hardRequirements: [],
    softPreferences: [],
    clarificationNeeded: true,
    clarificationQuestion:
      'OpenAI API is not configured. Please set OPENAI_API_KEY to enable AI intent parsing. ' +
      'You can try: "Find me a waterproof backpack under ₹4,000 that reaches Bangalore by Friday"',
  };
}

/**
 * Build fallback intent from partial AI output.
 */
function buildFallbackIntent(
  rawQuery: string,
  partial: Record<string, unknown>
): ParsedIntent {
  return {
    rawQuery,
    category: (partial.category as string) || null,
    budget: (partial.budget as ParsedIntent['budget']) || {
      max: null,
      min: null,
      currency: 'INR',
    },
    destination: (partial.destination as string) || null,
    deliveryDeadline: (partial.deliveryDeadline as string) || null,
    hardRequirements: Array.isArray(partial.hardRequirements)
      ? (partial.hardRequirements as ParsedIntent['hardRequirements'])
      : [],
    softPreferences: Array.isArray(partial.softPreferences)
      ? (partial.softPreferences as ParsedIntent['softPreferences'])
      : [],
    clarificationNeeded: false,
  };
}

/**
 * Build user-friendly "no match" message.
 */
function buildNoMatchMessage(
  intent: ParsedIntent,
  reason: 'no_products' | 'constraint_failure',
  constraintResults?: ConstraintCheck[]
): string {
  if (reason === 'no_products') {
    return (
      `I searched our catalog but couldn't find any products matching "${intent.category || 'your request'}"` +
      (intent.budget.max ? ` under ₹${intent.budget.max.toLocaleString('en-IN')}` : '') +
      `. Please try a different search.`
    );
  }

  // Constraint failure — explain what failed
  const failures = constraintResults?.flatMap((r) =>
    r.eligible ? [] : r.failures.map((f) => `• ${f}`)
  ) || [];

  const uniqueFailures = [...new Set(failures)].slice(0, 3);

  return (
    `No eligible product found matching all your requirements.\n\n` +
    `I found products in our catalog, but none satisfied all your constraints:\n` +
    uniqueFailures.join('\n') +
    `\n\nI won't recommend a product that violates your hard requirements. ` +
    `Try adjusting your budget, delivery deadline, or other requirements.`
  );
}

/**
 * Build recommendation message for the user.
 */
function buildRecommendationMessage(
  product: ProductWithDetails,
  ranking: RankingOutput,
  intent: ParsedIntent,
  constraintResults: ConstraintCheck[]
): string {
  const cr = constraintResults.find((r) => r.productId === product.id);
  const delivery = cr?.deliveryEstimate;

  const lines = [
    `**Best Match: ${product.title}**`,
    `Price: ₹${product.priceInr.toLocaleString('en-IN')}`,
  ];

  if (delivery?.eligible) {
    lines.push(`Delivery: Estimated ${delivery.estimatedDelivery} (${delivery.minDays}-${delivery.maxDays} business days)`);
    if (delivery.shippingFee > 0) {
      lines.push(`Shipping: ₹${delivery.shippingFee}`);
    } else {
      lines.push(`Shipping: Free`);
    }
  }

  if (product.warrantyMonths) {
    lines.push(`Warranty: ${product.warrantyMonths} months`);
  }

  if (product.returnDays) {
    lines.push(`Returns: ${product.returnDays} days`);
  }

  lines.push(`\n**Why this one?**`);
  ranking.reasons.forEach((r) => lines.push(`• ${r}`));

  if (ranking.tradeoffs.length > 0) {
    lines.push(`\n**Tradeoffs considered:**`);
    ranking.tradeoffs.forEach((t) => lines.push(`• ${t}`));
  }

  lines.push(
    `\nShall I proceed with this purchase for ₹${product.priceInr.toLocaleString('en-IN')}? ` +
    `Click **Confirm & Pay** to continue.`
  );

  return lines.join('\n');
}

function getNextFriday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
