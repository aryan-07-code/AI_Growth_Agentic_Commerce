import prisma from '@/lib/db';
import type { ParsedIntent } from '@/lib/ai/schemas';
import type { ProductWithDetails } from '@/types/commerce';

export async function searchProducts(intent: ParsedIntent): Promise<ProductWithDetails[]> {
  const { category, budget, hardRequirements } = intent;

  const where: Record<string, unknown> = {
    active: true,
    inventory: { gt: 0 },
  };

  if (category) {
    const normalizedCategory = normalizeCategory(category);
    where.category = normalizedCategory;
  }

  if (budget?.max !== null && budget?.max !== undefined) {
    where.priceInr = { lte: budget.max };
  }

  let products = await prisma.product.findMany({
    where: where as any,
    include: {
      merchant: true,
      variants: { where: { active: true } },
    },
    orderBy: [
      { priceInr: 'asc' },
    ],
    take: 50,
  });

  if (products.length === 0 || !category) {
    const keywordMatches = await keywordFallbackSearch(intent, budget?.max ?? undefined);
    if (keywordMatches.length > 0) {
      products = keywordMatches;
    }
  }

  return products.map(mapProductToDetails);
}

async function keywordFallbackSearch(
  intent: ParsedIntent,
  maxPrice?: number
): Promise<any[]> {
  const searchTerms = buildSearchTerms(intent);

  if (searchTerms.length === 0) {
    return [];
  }

  const orConditions = searchTerms.flatMap((term) => [
    { title: { contains: term, mode: 'insensitive' as const } },
    { description: { contains: term, mode: 'insensitive' as const } },
  ]);

  const where: any = {
    active: true,
    inventory: { gt: 0 },
    OR: orConditions,
  };

  if (maxPrice !== undefined) {
    where.priceInr = { lte: maxPrice };
  }

  return prisma.product.findMany({
    where,
    include: { merchant: true, variants: { where: { active: true } } },
    take: 30,
  });
}

function buildSearchTerms(intent: ParsedIntent): string[] {
  const terms: string[] = [];

  if (intent.category) {
    terms.push(intent.category);
    const synonyms: Record<string, string[]> = {
      backpack: ['backpacks', 'bag', 'pack', 'daypack'],
      backpacks: ['backpack', 'bag', 'pack', 'daypack'],
      bags: ['bag', 'backpack', 'tote', 'duffel', 'sling'],
      bag: ['bags', 'backpack', 'duffel', 'sling'],
      shoe: ['shoes', 'footwear', 'sneaker', 'running', 'runner'],
      shoes: ['shoe', 'footwear', 'sneaker', 'running', 'runner'],
      footwear: ['shoe', 'shoes', 'sneaker', 'running', 'runner'],
      apparel: ['tee', 'shirt', 'tshirt', 'shorts', 'jacket', 'running'],
      clothing: ['tee', 'shirt', 'shorts', 'jacket', 'apparel'],
      electronics: ['phone', 'charger', 'cable', 'powerbank', 'headphones', 'earbuds', 'watch', 'laptop'],
      accessories: ['pillow', 'sleeve', 'cubes', 'accessories'],
      fitness: ['bands', 'roller', 'vest', 'fitness'],
      laptop: ['laptop', 'computer', 'notebook'],
      phone: ['phone', 'smartphone', 'mobile', 'charger'],
    };
    const extra = synonyms[intent.category.toLowerCase()] || [];
    terms.push(...extra);
  }

  if (intent.rawQuery) {
    const stopWords = new Set([
      'find', 'me', 'a', 'an', 'the', 'under', 'below', 'above', 'in', 'at', 'by', 'on', 'for', 'with', 'to', 'from',
      'that', 'reaches', 'delivery', 'deliver', 'buy', 'want', 'need', 'please', 'is', 'it', 'and', 'or', 'of', 'show'
    ]);
    const words = intent.rawQuery
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w) && !/^\d+$/.test(w));
    terms.push(...words);
  }

  for (const req of intent.hardRequirements) {
    if (req.attribute === 'waterproof' && req.value === true) {
      terms.push('waterproof', 'rainproof');
    }
  }

  return [...new Set(terms)];
}

function normalizeCategory(input: string): string {
  const map: Record<string, string> = {
    backpack: 'backpacks',
    'back pack': 'backpacks',
    bags: 'bags',
    bag: 'bags',
    shoe: 'footwear',
    shoes: 'footwear',
    sneaker: 'footwear',
    sneakers: 'footwear',
    running: 'footwear',
    laptop: 'electronics',
    laptops: 'electronics',
    phone: 'electronics',
    phones: 'electronics',
    electronics: 'electronics',
    apparel: 'apparel',
    clothing: 'apparel',
    clothes: 'apparel',
    accessories: 'accessories',
    accessory: 'accessories',
    fitness: 'fitness',
  };

  const normalized = input.toLowerCase().trim();
  return map[normalized] || normalized;
}

export function mapProductToDetails(product: any): ProductWithDetails {
  const deliveryRules = extractDeliveryRulesFromProduct(product);

  return {
    id: product.id,
    merchantId: product.merchantId,
    merchantName: product.merchant?.name || 'Unknown',
    sku: product.sku,
    title: product.title,
    description: product.description,
    category: product.category,
    priceInr: product.priceInr,
    inventory: product.inventory,
    warrantyMonths: product.warrantyMonths,
    returnDays: product.returnDays,
    attributes: product.attributes || {},
    aiMetadata: product.aiMetadata || null,
    deliveryRules,
    images: product.images || [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function extractDeliveryRulesFromProduct(product: any): any[] {
  const rules: any[] = [];
  const attrs = product.attributes as any;

  if (attrs?.delivery_override) {
    for (const [dest, rule] of Object.entries(attrs.delivery_override as Record<string, any>)) {
      rules.push({
        destination: dest,
        minDays: rule.minDays,
        maxDays: rule.maxDays,
        shippingFee: rule.fee || 0,
        available: rule.available !== false,
      });
    }
  }

  return rules;
}

export async function getMerchantDeliveryRules(merchantId: string): Promise<any[]> {
  const policies = await prisma.merchantPolicy.findMany({
    where: { merchantId, type: 'DELIVERY' },
  });

  return policies.map((p: any) => {
    const dest = (p.key as string).replace('_delivery', '');
    const val = p.value as any;
    return {
      destination: dest,
      minDays: val.minDays,
      maxDays: val.maxDays,
      shippingFee: val.fee || 0,
      available: val.available !== false,
    };
  });
}
