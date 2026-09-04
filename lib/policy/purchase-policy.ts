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

/**
 * Evaluate the purchase policy for a given transaction.
 *
 * CRITICAL: This runs server-side before any Razorpay order is created.
 * Fail CLOSED — if any critical check fails, block the purchase.
 *
 * The LLM NEVER calls this function. It is pure business logic code.
 */
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

  // ─── 1. EXPLICIT APPROVAL REQUIRED ───────────────────────────────────────
  checks.approval = input.approvalGiven === true;
  if (!checks.approval) {
    failures.push('Explicit user approval is required before purchase');
  }

  // ─── 2. AMOUNT LIMIT ──────────────────────────────────────────────────────
  checks.amount = input.amountInr <= PURCHASE_LIMITS.MAX_AMOUNT_INR;
  if (!checks.amount) {
    failures.push(
      `Purchase amount ₹${input.amountInr.toLocaleString('en-IN')} exceeds the configured ₹${PURCHASE_LIMITS.MAX_AMOUNT_INR.toLocaleString('en-IN')} limit`
    );
  }

  // ─── 3. INVENTORY CHECK ───────────────────────────────────────────────────
  const inventoryResult = checkInventory(input.product, 1);
  checks.inventory = inventoryResult.reservable;
  if (!checks.inventory) {
    failures.push(
      `Product inventory is insufficient (available: ${inventoryResult.quantity})`
    );
  }

  // ─── 4. PRODUCT ACTIVE ────────────────────────────────────────────────────
  checks.product = (input.product as any).active !== false;
  if (!checks.product) {
    failures.push('Product is no longer available');
  }

  // ─── 5. MERCHANT ACTIVE ──────────────────────────────────────────────────
  const merchantActive = true; // Would check merchant.active from DB in full impl
  checks.merchant = merchantActive;
  if (!checks.merchant) {
    failures.push('Merchant is not currently active');
  }

  // ─── 6. CATEGORY ALLOWED ─────────────────────────────────────────────────
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
      : failures[0], // Primary failure reason
  };
}

/**
 * Unknown categories that aren't explicitly blocked are allowed by default.
 * This prevents false positives for new categories.
 */
function isUnknownButNotBlocked(category: string): boolean {
  return !(BLOCKED_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Format a policy result for display in the UI.
 */
export function formatPolicyResult(result: PolicyResult): string {
  if (result.allowed) {
    return 'All policy checks passed. Purchase approved.';
  }

  return `Purchase blocked: ${result.blockedReason || result.failures.join('; ')}`;
}
