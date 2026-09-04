import type { ProductWithDetails } from '@/types/commerce';

export interface InventoryCheckResult {
  available: boolean;
  quantity: number;
  reservable: boolean;
}

/**
 * Check inventory for a product.
 * This is a deterministic check — the LLM never calls this.
 */
export function checkInventory(
  product: ProductWithDetails,
  requestedQuantity = 1
): InventoryCheckResult {
  const available = product.inventory > 0;
  const reservable = product.inventory >= requestedQuantity;

  return {
    available,
    quantity: product.inventory,
    reservable,
  };
}

/**
 * Check inventory for a specific variant.
 */
export function checkVariantInventory(
  product: ProductWithDetails,
  variantId: string,
  requestedQuantity = 1
): InventoryCheckResult {
  // If no variants, use product-level inventory
  const variant = (product as any).variants?.find((v: any) => v.id === variantId);

  if (!variant) {
    return checkInventory(product, requestedQuantity);
  }

  const available = variant.inventory > 0;
  const reservable = variant.inventory >= requestedQuantity;

  return {
    available,
    quantity: variant.inventory,
    reservable,
  };
}
