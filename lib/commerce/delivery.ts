import { getMerchantDeliveryRules } from './search';
import type { ProductWithDetails } from '@/types/commerce';

export interface DeliveryCheckResult {
  eligible: boolean;
  estimatedDelivery: string;
  shippingFee: number;
  minDays: number;
  maxDays: number;
  ruleSource: 'merchant_policy' | 'product_override' | 'not_found';
}

export async function checkDelivery(
  product: ProductWithDetails,
  destination: string,
  deadlineIso: string
): Promise<DeliveryCheckResult> {
  const normalizedDest = normalizeDestination(destination);

  const productOverride = getProductDeliveryOverride(product, normalizedDest);
  if (productOverride) {
    return computeDeliveryResult(productOverride, deadlineIso, 'product_override');
  }

  const merchantRules = await getMerchantDeliveryRules(product.merchantId);
  const matchingRule = merchantRules.find((r) => {
    const ruleDest = normalizeDestination(r.destination);
    return ruleDest === normalizedDest || ruleDest.includes(normalizedDest) || normalizedDest.includes(ruleDest);
  });

  if (matchingRule) {
    return computeDeliveryResult(matchingRule, deadlineIso, 'merchant_policy');
  }

  return {
    eligible: false,
    estimatedDelivery: 'unknown',
    shippingFee: 0,
    minDays: 0,
    maxDays: 0,
    ruleSource: 'not_found',
  };
}

function computeDeliveryResult(
  rule: { minDays: number; maxDays: number; shippingFee: number; available: boolean },
  deadlineIso: string,
  source: DeliveryCheckResult['ruleSource']
): DeliveryCheckResult {
  if (!rule.available) {
    return {
      eligible: false,
      estimatedDelivery: 'not_available',
      shippingFee: 0,
      minDays: rule.minDays,
      maxDays: rule.maxDays,
      ruleSource: source,
    };
  }

  const estimatedDate = addBusinessDays(new Date(), rule.maxDays);
  const estimatedIso = formatDate(estimatedDate);
  const deadline = new Date(deadlineIso);

  deadline.setHours(23, 59, 59, 999);

  const eligible = estimatedDate <= deadline;

  return {
    eligible,
    estimatedDelivery: estimatedIso,
    shippingFee: rule.shippingFee,
    minDays: rule.minDays,
    maxDays: rule.maxDays,
    ruleSource: source,
  };
}

function getProductDeliveryOverride(
  product: ProductWithDetails,
  destination: string
): { minDays: number; maxDays: number; shippingFee: number; available: boolean } | null {
  const attrs = product.attributes as Record<string, unknown>;
  const override = attrs?.delivery_override as Record<string, any> | undefined;

  if (!override) return null;

  for (const [dest, rule] of Object.entries(override)) {
    if (normalizeDestination(dest) === destination) {
      return {
        minDays: rule.minDays,
        maxDays: rule.maxDays,
        shippingFee: rule.fee || 0,
        available: rule.available !== false,
      };
    }
  }

  return null;
}

export function addBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }

  return result;
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getNextDayOfWeek(dayName: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = days.indexOf(dayName.toLowerCase());

  if (targetDay === -1) return formatDate(new Date());

  const today = new Date();
  const currentDay = today.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;

  const target = new Date(today);
  target.setDate(today.getDate() + daysUntil);
  return formatDate(target);
}

function normalizeDestination(dest: string): string {
  return dest.toLowerCase().trim()
    .replace(/\s+/g, '')
    .replace('bengaluru', 'bangalore')
    .replace('bengalore', 'bangalore')
    .replace('bombay', 'mumbai')
    .replace('calcutta', 'kolkata')
    .replace('madras', 'chennai')
    .replace('newdelhi', 'delhi')
    .replace('national capital territory', 'delhi');
}
