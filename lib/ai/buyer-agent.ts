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

export async function runBuyerAgent(
  sessionId: string,
  userMessage: string
): Promise<BuyerAgentResult> {
  const startTime = Date.now();

  try {
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

    let ranking: RankingOutput;

    try {
      ranking = await rankProducts(eligibleProducts, intent, constraintResults);
    } catch (rankError) {
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

async function parseIntent(
  userMessage: string,
  sessionId: string
): Promise<ParsedIntent> {
  if (!process.env.OPENAI_API_KEY) {
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
      return buildFallbackIntent(userMessage, parsed as Record<string, unknown>);
    }

    return validated.data;
  } catch (error: any) {
    console.warn('[buyer-agent] OpenAI unavailable, falling back to local intent parser:', error?.message);
    return buildDemoIntent(userMessage);
  }
}

function buildDemoIntent(query: string): ParsedIntent {
  const q = query.toLowerCase().trim();

  if (!q) {
    return {
      rawQuery: query,
      category: null,
      budget: { max: null, min: null, currency: 'INR' },
      destination: null,
      deliveryDeadline: null,
      hardRequirements: [],
      softPreferences: [],
      clarificationNeeded: true,
      clarificationQuestion: 'What product are you looking to buy today?',
    };
  }

  let category: string | null = null;
  if (/\b(backpack|backpacks|daypack|rucksack|pack)\b/.test(q)) {
    category = 'backpacks';
  } else if (/\b(duffel|duffle|gym bag|tote|sling)\b/.test(q)) {
    category = 'bags';
  } else if (/\b(bag|bags)\b/.test(q)) {
    category = q.includes('travel') || q.includes('pack') ? 'backpacks' : 'bags';
  } else if (/\b(shoe|shoes|sneaker|sneakers|footwear|runner|running|boots?)\b/.test(q)) {
    category = 'footwear';
  } else if (/\b(shirt|tshirt|t-shirt|tee|jacket|shorts?|apparel|clothing|clothes|tights)\b/.test(q)) {
    category = 'apparel';
  } else if (/\b(fitness|yoga|bands?|roller|hydration|workout)\b/.test(q)) {
    category = 'fitness';
  } else if (/\b(electronic|electronics|phone|mobile|charger|powerbank|power\s*bank|cable|headphone|headphones|earbuds|watch|smartwatch|laptop)\b/.test(q)) {
    category = 'electronics';
  } else if (/\b(accessory|accessories|pillow|sleeve|cubes?)\b/.test(q)) {
    category = 'accessories';
  }

  let maxBudget: number | null = null;
  const budgetMatch =
    q.match(/(?:under|below|less\s*than|within|<=?|₹|\binr)\s*([0-9,]+)/i) ||
    q.match(/([0-9,]+)\s*(?:inr|rs|rupees)/i) ||
    q.match(/₹\s*([0-9,]+)/);
  if (budgetMatch) {
    maxBudget = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
  }

  const isSpendingDemo = q.includes('75,000') || q.includes('75000') || (q.includes('laptop') && !maxBudget);
  if (isSpendingDemo) {
    category = 'electronics';
    maxBudget = 150000;
  }

  let destination: string | null = null;
  if (q.includes('bangalore') || q.includes('bengaluru')) destination = 'bangalore';
  else if (q.includes('mumbai') || q.includes('bombay')) destination = 'mumbai';
  else if (q.includes('delhi')) destination = 'delhi';
  else if (q.includes('hyderabad')) destination = 'hyderabad';
  else if (q.includes('chennai') || q.includes('madras')) destination = 'chennai';
  else if (q.includes('kolkata') || q.includes('calcutta')) destination = 'kolkata';

  let deadline: string | null = null;
  const today = new Date();
  if (q.includes('friday')) {
    deadline = formatDate(getNextFriday(today));
  } else if (q.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    deadline = formatDate(tomorrow);
  }

  const hardRequirements: ParsedIntent['hardRequirements'] = [];
  if (q.includes('waterproof') || q.includes('water-proof') || q.includes('rainproof')) {
    hardRequirements.push({ attribute: 'waterproof', value: true, operator: 'eq' });
  }
  if (q.includes('wireless')) {
    hardRequirements.push({ attribute: 'wireless', value: true, operator: 'eq' });
  }

  const softPreferences: ParsedIntent['softPreferences'] = [];
  if (category === 'backpacks' && (q.includes('laptop') || q.includes('15.6') || q.includes('15 inch'))) {
    softPreferences.push({ attribute: 'laptop_size_inches', value: 15.6, weight: 0.5 });
  }
  if (isSpendingDemo) {
    softPreferences.push({ attribute: 'type', value: 'laptop', weight: 1 });
  }

  return {
    rawQuery: query,
    category,
    budget: { max: maxBudget, min: null, currency: 'INR' },
    destination,
    deliveryDeadline: deadline,
    hardRequirements,
    softPreferences,
    clarificationNeeded: false,
  };
}

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
