import { getMerchantDeliveryRules } from './search';
import type { ProductWithDetails } from '@/types/commerce';

export interface DeliveryCheckResult {
  eligible: boolean;
  estimatedDelivery: string; // ISO date YYYY-MM-DD
  shippingFee: number;
  minDays: number;
  maxDays: number;
  ruleSource: 'merchant_policy' | 'product_override' | 'not_found';
}

/**
 * Check whether a product can reach a destination before a deadline.
 *
 * Delivery times are fetched from MerchantPolicy records (deterministic DB data).
 * The LLM never calls this function.
 *
 * Business days: Monday-Friday only. Saturday/Sunday do not count.
 */
export async function checkDelivery(
  product: ProductWithDetails,
  destination: string,
  deadlineIso: string
): Promise<DeliveryCheckResult> {
  const normalizedDest = normalizeDestination(destination);

  // 1. Check product-level delivery override (for special SKUs like TravelPro)
  const productOverride = getProductDeliveryOverride(product, normalizedDest);
  if (productOverride) {
    return computeDeliveryResult(productOverride, deadlineIso, 'product_override');
  }

  // 2. Check merchant-level delivery policy
  const merchantRules = await getMerchantDeliveryRules(product.merchantId);
  const matchingRule = merchantRules.find((r) => {
    const ruleDest = normalizeDestination(r.destination);
    return ruleDest === normalizedDest || ruleDest.includes(normalizedDest) || normalizedDest.includes(ruleDest);
  });

  if (matchingRule) {
    return computeDeliveryResult(matchingRule, deadlineIso, 'merchant_policy');
  }

  // 3. No rule found — fail closed
  return {
    eligible: false,
    estimatedDelivery: 'unknown',
    shippingFee: 0,
    minDays: 0,
    maxDays: 0,
    ruleSource: 'not_found',
  };
}

/**
 * Compute delivery result from a rule, checking against deadline.
 */
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

  // Use maxDays as the worst case (most conservative for eligibility)
  const estimatedDate = addBusinessDays(new Date(), rule.maxDays);
  const estimatedIso = formatDate(estimatedDate);
  const deadline = new Date(deadlineIso);

  // Normalize both to midnight UTC for comparison
  deadline.setHours(23, 59, 59, 999); // Deadline is end of that day

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

/**
 * Get delivery override from product attributes.
 * Used for products with non-standard delivery (e.g., TravelPro with economy shipping).
 */
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

/**
 * Add business days (Mon-Fri) to a date.
 */
export function addBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }

  return result;
}

/**
 * Format a Date to YYYY-MM-DD string.
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get the next occurrence of a day name (e.g., "Friday") as an ISO date.
 */
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

/**
 * Normalize destination name for comparison.
 */
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
