import openai from './client';
import { MERCHANT_AUDIT_SYSTEM_PROMPT } from './prompts/merchant';
import { MerchantAuditOutputSchema } from './schemas';
import prisma from '@/lib/db';
import { logEvent } from '@/lib/audit/events';
import { EventType } from '@/types/agent';
import type { CommerceScore, CommerceScoreFactors, SimulationResult } from '@/types/commerce';
import { runBuyerAgent } from './buyer-agent';

/**
 * Calculate the AI Commerce Score for a merchant.
 * DETERMINISTIC — calculated in code, not by the LLM.
 * Score: 0-100 based on structured catalog quality factors.
 */
export async function calculateCommerceScore(merchantId: string): Promise<CommerceScore> {
  const products = await prisma.product.findMany({
    where: { merchantId, active: true },
    include: { variants: true },
  });

  const policies = await prisma.merchantPolicy.findMany({
    where: { merchantId, type: 'DELIVERY' },
  });

  if (products.length === 0) {
    return {
      total: 0,
      factors: {
        structuredAttributes: 0,
        deliveryClarity: 0,
        inventoryClarity: 0,
        variantClarity: 0,
        returnPolicyClarity: 0,
        warrantyClarity: 0,
        aiReadableDescription: 0,
        catalogCompleteness: 0,
      },
      grade: 'F',
    };
  }

  // ─── FACTOR 1: Structured Attributes (0-20) ───────────────────────────────
  const attrScore = products.reduce((sum: number, p: any) => {
    const attrs = p.attributes as Record<string, unknown>;
    const keyAttributes = ['waterproof', 'water_resistant', 'capacity_litres', 'laptop_size_inches', 'material', 'use_cases'];
    const present = keyAttributes.filter((k) => attrs[k] !== undefined && attrs[k] !== null).length;
    return sum + (present / keyAttributes.length);
  }, 0) / products.length;
  const structuredAttributes = Math.round(attrScore * 20);

  // ─── FACTOR 2: Delivery Clarity (0-20) ───────────────────────────────────
  const hasDeliveryPolicies = policies.length >= 2;
  const deliveryCoverage = Math.min(policies.length / 4, 1); // Full score at 4+ cities
  const deliveryClarity = Math.round(
    (hasDeliveryPolicies ? 0.5 : 0) * 20 + deliveryCoverage * 10
  );

  // ─── FACTOR 3: Inventory Clarity (0-10) ──────────────────────────────────
  const inventoryDefined = products.filter((p: any) => p.inventory > 0).length / products.length;
  const inventoryClarity = Math.round(inventoryDefined * 10);

  // ─── FACTOR 4: Variant Clarity (0-10) ────────────────────────────────────
  const productsWithVariants = products.filter((p: any) => (p.variants?.length ?? 0) > 0).length;
  const variantRatio = productsWithVariants / products.length;
  const variantClarity = Math.round(variantRatio * 10);

  // ─── FACTOR 5: Return Policy Clarity (0-10) ──────────────────────────────
  const hasReturn = products.filter((p: any) => p.returnDays && p.returnDays > 0).length;
  const returnPolicyClarity = Math.round((hasReturn / products.length) * 10);

  // ─── FACTOR 6: Warranty Clarity (0-10) ───────────────────────────────────
  const hasWarranty = products.filter((p: any) => p.warrantyMonths && p.warrantyMonths > 0).length;
  const warrantyClarity = Math.round((hasWarranty / products.length) * 10);

  // ─── FACTOR 7: AI-Readable Descriptions (0-10) ───────────────────────────
  const hasAiMeta = products.filter((p: any) => {
    const meta = p.aiMetadata as any;
    return meta?.searchTerms?.length >= 3 && meta?.semanticSummary;
  }).length;
  const aiReadableDescription = Math.round((hasAiMeta / products.length) * 10);

  // ─── FACTOR 8: Catalog Completeness (0-10) ───────────────────────────────
  const hasAllFields = products.filter(
    (p: any) => p.title && p.description && p.priceInr > 0 && p.sku && p.category
  ).length;
  const catalogCompleteness = Math.round((hasAllFields / products.length) * 10);

  // ─── TOTAL ────────────────────────────────────────────────────────────────
  const factors: CommerceScoreFactors = {
    structuredAttributes,
    deliveryClarity,
    inventoryClarity,
    variantClarity,
    returnPolicyClarity,
    warrantyClarity,
    aiReadableDescription,
    catalogCompleteness,
  };

  const total = Object.values(factors).reduce((a, b) => a + b, 0);
  const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F';

  return { total, factors, grade };
}

/**
 * Run AI buyer simulations against a merchant's catalog.
 * Runs the same buyer pipeline against synthetic intents.
 */
export async function runBuyerSimulation(
  merchantId: string,
  catalogVersion: 'current' | 'optimized' = 'current'
): Promise<SimulationResult> {
  // Synthetic buyer intents for simulation
  const syntheticIntents = [
    'Find me a waterproof backpack under ₹4,000 that reaches Bangalore by Friday',
    'I need a laptop bag for a 15-inch laptop under ₹3,000',
    'Show me travel bags available in stock under ₹5,000',
    'Find a waterproof bag for trekking under ₹4,500',
    'I want a backpack for college with laptop compartment under ₹3,500',
    'Looking for a durable travel backpack under ₹4,000',
    'Need a bag that ships to Bangalore within 3 days',
    'Find me a bag with warranty and return policy under ₹4,000',
  ];

  const details: SimulationResult['details'] = [];
  let discovered = 0;
  let passedConstraints = 0;
  let selected = 0;

  // Create temporary simulation session
  for (const intentStr of syntheticIntents) {
    const simSessionId = `sim_${merchantId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const result = await runBuyerAgent(simSessionId, intentStr);

      const wasDiscovered = (result.searchResult?.totalFound ?? 0) > 0;
      const eligibleCount = Array.isArray(result.searchResult?.eligible)
        ? result.searchResult!.eligible.length
        : 0;
      const wasEligible = eligibleCount > 0;
      const wasSelected = !!result.selectedProduct;

      if (wasDiscovered) discovered++;
      if (wasEligible) passedConstraints++;
      if (wasSelected) selected++;

      details.push({
        intent: intentStr,
        discovered: wasDiscovered,
        passedConstraints: wasEligible,
        selectedProductId: result.selectedProduct?.id,
        failureReason: result.error,
      });
    } catch (err) {
      details.push({
        intent: intentStr,
        discovered: false,
        passedConstraints: false,
        failureReason: 'Simulation error',
      });
    }
  }

  const total = syntheticIntents.length;

  return {
    merchantId,
    catalogVersion,
    buyerIntentsRun: total,
    discoveryRate: discovered / total,
    constraintMatchRate: passedConstraints / total,
    selectionRate: selected / total,
    checkoutReadiness: (selected / total) * 0.85, // Approx checkout readiness
    estimatedConversion: (selected / total) * 0.12, // Estimated 12% of checkout-ready = conversion
    details,
  };
}

/**
 * Run AI catalog audit using LLM to identify catalog issues.
 */
export async function auditCatalog(merchantId: string): Promise<void> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: {
      products: {
        where: { active: true },
        include: { variants: true },
        take: 20,
      },
      policies: true,
    },
  });

  if (!merchant) throw new Error('Merchant not found');

  if (!process.env.OPENAI_API_KEY) {
    console.log('[merchant-agent] No OpenAI key — skipping AI audit (using seeded issues)');
    return;
  }

  const catalogSummary = {
    merchantName: merchant.name,
    productCount: merchant.products.length,
    policyCount: merchant.policies.length,
    sampleProducts: merchant.products.slice(0, 5).map((p: any) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      priceInr: p.priceInr,
      inventory: p.inventory,
      warrantyMonths: p.warrantyMonths,
      returnDays: p.returnDays,
      hasAttributes: Object.keys(p.attributes as object).length > 0,
      hasAiMetadata: !!p.aiMetadata,
      variantCount: p.variants?.length ?? 0,
    })),
    deliveryPolicies: merchant.policies
      .filter((p: any) => p.type === 'DELIVERY')
      .map((p: any) => ({ key: p.key, value: p.value })),
  };

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: MERCHANT_AUDIT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Audit this merchant catalog for AI-buyer readiness:\n\n${JSON.stringify(catalogSummary, null, 2)}\n\nRespond with JSON matching the MerchantAuditOutput schema.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1000,
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) return;

    const parsed = JSON.parse(rawContent);
    const validated = MerchantAuditOutputSchema.safeParse(parsed);

    if (!validated.success) {
      console.warn('[merchant-agent] Audit output schema validation failed:', validated.error);
      return;
    }

    // Persist new issues (avoiding duplicates by type)
    const existingIssues = await prisma.catalogIssue.findMany({
      where: { merchantId },
      select: { type: true },
    });
    const existingTypes = new Set(existingIssues.map((i: any) => i.type as string));

    for (const issue of validated.data.issues) {
      if (existingTypes.has(issue.type)) continue;

      await prisma.catalogIssue.create({
        data: {
          merchantId,
          severity: issue.severity,
          type: issue.type,
          title: issue.title,
          evidence: issue.evidence,
          problem: issue.problem,
          proposedFix: (issue.proposedFix as any) || null,
          impact: issue.impact || null,
          status: 'OPEN',
        },
      });
    }

    await logEvent({
      merchantId,
      agent: 'merchant_agent',
      eventType: EventType.CATALOG_AUDITED,
      status: 'SUCCESS',
      output: {
        issuesFound: validated.data.issues.length,
        scoreEstimate: validated.data.scoreEstimate,
      },
    });
  } catch (err) {
    console.error('[merchant-agent] AI audit failed:', err);
  }
}
