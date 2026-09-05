import openai from '@/lib/ai/client';
import { RANKING_SYSTEM_PROMPT } from '@/lib/ai/prompts/buyer';
import { RankingOutputSchema, type RankingOutput } from '@/lib/ai/schemas';
import type { ProductWithDetails, ConstraintCheck } from '@/types/commerce';
import type { ParsedIntent } from '@/lib/ai/schemas';

export async function rankProducts(
  eligibleProducts: ProductWithDetails[],
  intent: ParsedIntent,
  constraintResults: ConstraintCheck[]
): Promise<RankingOutput> {
  if (eligibleProducts.length === 0) {
    throw new Error('No eligible products to rank');
  }

  if (eligibleProducts.length === 1) {
    return buildSingleProductRanking(eligibleProducts[0], constraintResults);
  }

  if (!process.env.OPENAI_API_KEY) {
    return buildSmartFallbackRanking(eligibleProducts, intent, constraintResults);
  }

  try {
    const rankingContext = buildRankingContext(eligibleProducts, intent, constraintResults);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RANKING_SYSTEM_PROMPT },
        { role: 'user', content: rankingContext },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
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

    const validated = RankingOutputSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(
        `AI ranking output failed schema validation: ${validated.error.message}`
      );
    }

    const ranking = validated.data;

    const eligibleIds = eligibleProducts.map((p) => p.id);
    if (!eligibleIds.includes(ranking.selectedProductId)) {
      throw new Error(
        `AI selected product "${ranking.selectedProductId}" which is NOT in the eligible list.`
      );
    }

    return ranking;
  } catch (error: any) {
    console.warn('[ranking] LLM ranking failed, using smart deterministic ranking:', error?.message);
    return buildSmartFallbackRanking(eligibleProducts, intent, constraintResults);
  }
}

function buildSmartFallbackRanking(
  eligibleProducts: ProductWithDetails[],
  intent: ParsedIntent,
  constraintResults: ConstraintCheck[]
): RankingOutput {
  const queryLower = (intent.rawQuery || '').toLowerCase();

  const scored = eligibleProducts.map((p) => {
    let score = 0;
    const titleLower = p.title.toLowerCase();
    const descLower = p.description.toLowerCase();

    const terms = queryLower.split(/\s+/).filter((t) => t.length > 2);
    for (const term of terms) {
      if (titleLower.includes(term)) score += 5;
      else if (descLower.includes(term)) score += 2;
    }

    if (p.warrantyMonths) score += p.warrantyMonths / 12;

    const cr = constraintResults.find((r) => r.productId === p.id);
    if (cr?.deliveryEstimate?.eligible) score += 3;

    return { product: p, score, cr };
  });

  scored.sort((a, b) => b.score - a.score || a.product.priceInr - b.product.priceInr);
  const best = scored[0].product;
  const bestCr = scored[0].cr;

  const passedChecks = Object.entries(bestCr?.checks || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  const reasons = [
    `Best match among ${eligibleProducts.length} eligible product${eligibleProducts.length > 1 ? 's' : ''}`,
    `Priced at ₹${best.priceInr.toLocaleString('en-IN')}`,
  ];

  if (best.warrantyMonths) {
    reasons.push(`Includes ${best.warrantyMonths}-month warranty`);
  }
  if (bestCr?.deliveryEstimate?.eligible) {
    reasons.push(`Estimated delivery by ${bestCr.deliveryEstimate.estimatedDelivery}`);
  }

  return {
    selectedProductId: best.id,
    confidence: 0.88,
    reasons,
    tradeoffs: eligibleProducts.length > 1 ? [`Evaluated ${eligibleProducts.length} items to find the best fit`] : [],
    explanation: `${best.title} is our top recommendation for "${intent.rawQuery}". It meets all requirements and passed ${passedChecks.length} constraint checks.`,
  };
}

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
      description: p.description.substring(0, 200),
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
