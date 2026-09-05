import type { ProductWithDetails, ConstraintCheck } from '@/types/commerce';
import type { ParsedIntent } from '@/lib/ai/schemas';
import { checkDelivery } from './delivery';

export async function applyConstraints(
  products: ProductWithDetails[],
  intent: ParsedIntent
): Promise<ConstraintCheck[]> {
  const results: ConstraintCheck[] = [];

  for (const product of products) {
    const result = await evaluateProduct(product, intent);
    results.push(result);
  }

  return results;
}

async function evaluateProduct(
  product: ProductWithDetails,
  intent: ParsedIntent
): Promise<ConstraintCheck> {
  const checks: ConstraintCheck['checks'] = {
    price: true,
    availability: true,
  };
  const failures: string[] = [];

  if (intent.budget.max !== null && intent.budget.max !== undefined) {
    const pricePass = product.priceInr <= intent.budget.max;
    checks.price = pricePass;
    if (!pricePass) {
      failures.push(
        `Price ₹${product.priceInr.toLocaleString('en-IN')} exceeds budget ₹${intent.budget.max.toLocaleString('en-IN')}`
      );
    }
  }

  const inStock = product.inventory > 0;
  checks.availability = inStock;
  if (!inStock) {
    failures.push('Product is out of stock');
  }

  for (const req of intent.hardRequirements) {
    const { attribute, value, operator = 'eq' } = req;
    const attrValue = (product.attributes as Record<string, unknown>)[attribute];

    let pass = false;

    if (attrValue === undefined || attrValue === null) {
      pass = false;
      checks[attribute] = false;
      failures.push(
        `Attribute "${attribute}" is missing from product data (required: ${String(value)})`
      );
      continue;
    }

    switch (operator) {
      case 'eq':
        pass = attrValue === value;
        break;
      case 'gte':
        pass = Number(attrValue) >= Number(value);
        break;
      case 'lte':
        pass = Number(attrValue) <= Number(value);
        break;
      case 'contains':
        pass = Array.isArray(attrValue)
          ? (attrValue as unknown[]).includes(value)
          : String(attrValue).toLowerCase().includes(String(value).toLowerCase());
        break;
      default:
        pass = attrValue === value;
    }

    checks[attribute] = pass;
    if (!pass) {
      failures.push(
        `Requirement "${attribute} = ${String(value)}" not met (actual: ${String(attrValue)})`
      );
    }
  }

  let deliveryEstimate: ConstraintCheck['deliveryEstimate'];

  if (intent.destination && intent.deliveryDeadline) {
    const deliveryResult = await checkDelivery(
      product,
      intent.destination,
      intent.deliveryDeadline
    );

    deliveryEstimate = {
      eligible: deliveryResult.eligible,
      estimatedDelivery: deliveryResult.estimatedDelivery,
      shippingFee: deliveryResult.shippingFee,
      minDays: deliveryResult.minDays,
      maxDays: deliveryResult.maxDays,
    };

    checks.delivery = deliveryResult.eligible;
    if (!deliveryResult.eligible) {
      failures.push(
        `Delivery to ${intent.destination} takes ${deliveryResult.minDays}-${deliveryResult.maxDays} business days, ` +
        `but deadline is ${intent.deliveryDeadline} (estimated: ${deliveryResult.estimatedDelivery})`
      );
    }
  }

  const eligible = failures.length === 0;

  return {
    productId: product.id,
    eligible,
    checks,
    failures,
    deliveryEstimate,
  };
}

export function filterEligible(
  products: ProductWithDetails[],
  constraintResults: ConstraintCheck[]
): ProductWithDetails[] {
  const eligibleIds = new Set(
    constraintResults.filter((r) => r.eligible).map((r) => r.productId)
  );
  return products.filter((p) => eligibleIds.has(p.id));
}

export function getConstraintResult(
  productId: string,
  constraintResults: ConstraintCheck[]
): ConstraintCheck | undefined {
  return constraintResults.find((r) => r.productId === productId);
}
