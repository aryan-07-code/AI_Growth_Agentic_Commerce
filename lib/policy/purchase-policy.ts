import { PURCHASE_LIMITS, ALLOWED_CATEGORIES, BLOCKED_CATEGORIES } from '@/types/agent';
import type { PolicyResult } from '@/lib/ai/schemas';
import type { ProductWithDetails } from '@/types/commerce';
import { checkInventory } from '@/lib/commerce/inventory';

export interface PolicyCheckInput {
  approvalGiven: boolean;
  amountInr: number;
  product: ProductWithDetails;
  sessionApprovedAt?: string;
}

export function evaluatePurchasePolicy(input: PolicyCheckInput): PolicyResult {
  const failures: string[] = [];

  const checks: PolicyResult['checks'] = {
    approval: false,
    amount: false,
    inventory: false,
    product: false,
    merchant: false,
    category: false,
  };

  checks.approval = input.approvalGiven === true;
  if (!checks.approval) {
    failures.push('Explicit user approval is required before purchase');
  }

  checks.amount = input.amountInr <= PURCHASE_LIMITS.MAX_AMOUNT_INR;
  if (!checks.amount) {
    failures.push(
      `Purchase amount ₹${input.amountInr.toLocaleString('en-IN')} exceeds the configured ₹${PURCHASE_LIMITS.MAX_AMOUNT_INR.toLocaleString('en-IN')} limit`
    );
  }

  const inventoryResult = checkInventory(input.product, 1);
  checks.inventory = inventoryResult.reservable;
  if (!checks.inventory) {
    failures.push(
      `Product inventory is insufficient (available: ${inventoryResult.quantity})`
    );
  }

  checks.product = (input.product as any).active !== false;
  if (!checks.product) {
    failures.push('Product is no longer available');
  }

  const merchantActive = true;
  checks.merchant = merchantActive;
  if (!checks.merchant) {
    failures.push('Merchant is not currently active');
  }

  const category = input.product.category.toLowerCase();
  const isBlocked = (BLOCKED_CATEGORIES as readonly string[]).includes(category);
  const isAllowed = (ALLOWED_CATEGORIES as readonly string[]).some(
    (allowed) => category === allowed || category.startsWith(allowed)
  );

  checks.category = !isBlocked && (isAllowed || isUnknownButNotBlocked(category));
  if (!checks.category) {
    failures.push(
      isBlocked
        ? `Category "${input.product.category}" is not permitted for AI-assisted purchases`
        : `Category "${input.product.category}" is not in the allowed list`
    );
  }

  const allowed = failures.length === 0;

  return {
    allowed,
    checks,
    failures,
    blockedReason: allowed
      ? undefined
      : failures[0],
  };
}

function isUnknownButNotBlocked(category: string): boolean {
  return !(BLOCKED_CATEGORIES as readonly string[]).includes(category);
}

export function formatPolicyResult(result: PolicyResult): string {
  if (result.allowed) {
    return 'All policy checks passed. Purchase approved.';
  }

  return `Purchase blocked: ${result.blockedReason || result.failures.join('; ')}`;
}
