import { evaluatePurchasePolicy } from '../lib/policy/purchase-policy';
import type { ProductWithDetails } from '../types/commerce';

function makeProduct(overrides: Partial<ProductWithDetails>): ProductWithDetails {
  return {
    id: 'test-product',
    merchantId: 'merchant-1',
    merchantName: 'Test Merchant',
    sku: 'TEST-001',
    title: 'Test Product',
    description: 'A test product',
    category: 'backpacks',
    priceInr: 3499,
    inventory: 10,
    warrantyMonths: 24,
    returnDays: 30,
    attributes: { waterproof: true },
    aiMetadata: null,
    deliveryRules: [],
    images: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Purchase Policy', () => {
  test('allows valid purchase under ₹5,000', () => {
    const result = evaluatePurchasePolicy({
      approvalGiven: true,
      amountInr: 3499,
      product: makeProduct({ priceInr: 3499 }),
    });
    expect(result.allowed).toBe(true);
    expect(result.checks.approval).toBe(true);
    expect(result.checks.amount).toBe(true);
    expect(result.checks.inventory).toBe(true);
  });

  test('blocks purchase without explicit approval', () => {
    const result = evaluatePurchasePolicy({
      approvalGiven: false,
      amountInr: 3499,
      product: makeProduct({ priceInr: 3499 }),
    });
    expect(result.allowed).toBe(false);
    expect(result.checks.approval).toBe(false);
    expect(result.failures.some((f) => f.includes('approval'))).toBe(true);
  });

  test('blocks ₹75,000 purchase (exceeds ₹5,000 limit)', () => {
    const result = evaluatePurchasePolicy({
      approvalGiven: true,
      amountInr: 75000,
      product: makeProduct({ priceInr: 75000, category: 'electronics' }),
    });
    expect(result.allowed).toBe(false);
    expect(result.checks.amount).toBe(false);
    expect(result.failures.some((f) => f.includes('₹5,000'))).toBe(true);
  });

  test('blocks ₹5,001 purchase (exactly over limit)', () => {
    const result = evaluatePurchasePolicy({
      approvalGiven: true,
      amountInr: 5001,
      product: makeProduct({ priceInr: 5001 }),
    });
    expect(result.allowed).toBe(false);
    expect(result.checks.amount).toBe(false);
  });

  test('allows purchase at exactly ₹5,000', () => {
    const result = evaluatePurchasePolicy({
      approvalGiven: true,
      amountInr: 5000,
      product: makeProduct({ priceInr: 5000 }),
    });
    expect(result.checks.amount).toBe(true);
  });

  test('blocks out-of-stock product', () => {
    const result = evaluatePurchasePolicy({
      approvalGiven: true,
      amountInr: 3499,
      product: makeProduct({ inventory: 0 }),
    });
    expect(result.allowed).toBe(false);
    expect(result.checks.inventory).toBe(false);
  });

  test('returns structured checks object', () => {
    const result = evaluatePurchasePolicy({
      approvalGiven: true,
      amountInr: 3499,
      product: makeProduct({}),
    });
    expect(result.checks).toHaveProperty('approval');
    expect(result.checks).toHaveProperty('amount');
    expect(result.checks).toHaveProperty('inventory');
    expect(result.checks).toHaveProperty('product');
    expect(result.checks).toHaveProperty('merchant');
    expect(result.checks).toHaveProperty('category');
  });

  test('returns blockedReason for failed purchase', () => {
    const result = evaluatePurchasePolicy({
      approvalGiven: true,
      amountInr: 75000,
      product: makeProduct({ priceInr: 75000, category: 'electronics' }),
    });
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toBeTruthy();
  });
});
