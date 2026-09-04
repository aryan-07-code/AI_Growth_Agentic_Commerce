import openai from '@/lib/ai/client';
import { RANKING_SYSTEM_PROMPT } from '@/lib/ai/prompts/buyer';
import { RankingOutputSchema, type RankingOutput } from '@/lib/ai/schemas';
import type { ProductWithDetails, ConstraintCheck } from '@/types/commerce';
import type { ParsedIntent } from '@/lib/ai/schemas';

/**
 * AI ranking module — sends ONLY eligible products to the LLM for ranking.
 *
 * CRITICAL SAFETY INVARIANT:
 * 1. Only eligible products (passed all constraints) are sent to the LLM.
 * 2. The LLM output is schema-validated before use.
 * 3. The selectedProductId is verified to be in the eligible list.
 * 4. If the LLM selects an ineligible product, the result is rejected.
 */
export async function rankProducts(
  eligibleProducts: ProductWithDetails[],
  intent: ParsedIntent,
  constraintResults: ConstraintCheck[]
): Promise<RankingOutput> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (eligibleProducts.length === 0) {
    throw new Error('No eligible products to rank');
  }

  if (eligibleProducts.length === 1) {
    // Only one eligible product — no need for LLM
    return buildSingleProductRanking(eligibleProducts[0], constraintResults);
  }

  // Build ranking context
  const rankingContext = buildRankingContext(eligibleProducts, intent, constraintResults);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: RANKING_SYSTEM_PROMPT },
      { role: 'user', content: rankingContext },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1, // Low temperature for consistent ranking
    max_tokens: 600,
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error('OpenAI returned empty response for ranking');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error('OpenAI ranking response was not valid JSON');
  }

  // Validate schema
  const validated = RankingOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `AI ranking output failed schema validation: ${validated.error.message}`
    );
  }

  const ranking = validated.data;

  // CRITICAL: Verify the selected product is in the eligible list
  const eligibleIds = eligibleProducts.map((p) => p.id);
  if (!eligibleIds.includes(ranking.selectedProductId)) {
    throw new Error(
      `AI selected product "${ranking.selectedProductId}" which is NOT in the eligible list. ` +
      `Eligible IDs: ${eligibleIds.join(', ')}`
    );
  }

  return ranking;
}

/**
 * Build the ranking prompt context with full product details.
 */
function buildRankingContext(
  products: ProductWithDetails[],
  intent: ParsedIntent,
  constraintResults: ConstraintCheck[]
): string {
  const eligibleProductIds = products.map((p) => p.id);

  const productSummaries = products.map((p) => {
    const cr = constraintResults.find((r) => r.productId === p.id);
    return {
      productId: p.id,
      title: p.title,
      merchant: p.merchantName,
      priceInr: p.priceInr,
      category: p.category,
      warrantyMonths: p.warrantyMonths,
      returnDays: p.returnDays,
      inventory: p.inventory,
      attributes: p.attributes,
      deliveryEstimate: cr?.deliveryEstimate,
      description: p.description.substring(0, 200), // truncate for token efficiency
    };
  });

  return JSON.stringify({
    userIntent: {
      rawQuery: intent.rawQuery,
      category: intent.category,
      budget: intent.budget,
      destination: intent.destination,
      deliveryDeadline: intent.deliveryDeadline,
      hardRequirements: intent.hardRequirements,
      softPreferences: intent.softPreferences,
    },
    eligibleProductIds,
    products: productSummaries,
    instruction:
      'Select the BEST product from the eligibleProductIds list. ' +
      'Your selectedProductId MUST be one of: ' +
      eligibleProductIds.join(', ') +
      '. Respond with JSON matching the RankingOutput schema.',
  });
}

/**
 * Build a ranking result for a single eligible product (no LLM needed).
 */
function buildSingleProductRanking(
  product: ProductWithDetails,
  constraintResults: ConstraintCheck[]
): RankingOutput {
  const cr = constraintResults.find((r) => r.productId === product.id);
  const passedChecks = Object.entries(cr?.checks || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  const reasons = [
    `Only eligible product found matching all your requirements`,
    `Priced at ₹${product.priceInr.toLocaleString('en-IN')}`,
  ];

  if (product.warrantyMonths) {
    reasons.push(`Includes ${product.warrantyMonths}-month warranty`);
  }
  if (cr?.deliveryEstimate?.eligible) {
    reasons.push(`Estimated delivery by ${cr.deliveryEstimate.estimatedDelivery}`);
  }

  return {
    selectedProductId: product.id,
    confidence: 0.9,
    reasons,
    tradeoffs: [],
    explanation: `${product.title} is the only product that satisfies all your requirements. It passed ${passedChecks.length} constraint checks.`,
  };
}
