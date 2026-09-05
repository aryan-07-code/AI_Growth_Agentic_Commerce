import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { calculateCommerceScore } from '@/lib/ai/merchant-agent';
import { requirePermission, PermissionError } from '@/lib/auth/permissions';

interface RouteParams {
  params: Promise<{ merchantId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { merchantId } = await params;

  try {
    requirePermission(req, 'merchant:read', merchantId);
    requirePermission(req, 'analytics:read', merchantId);
    requirePermission(req, 'revenue:read', merchantId);
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    throw error;
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: {
      products: { where: { active: true }, select: { id: true, title: true, category: true, priceInr: true, inventory: true } },
      policies: true,
      orders: {
        where: { status: 'PAID' },
        select: { id: true, amountInr: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      catalogIssues: {
        where: { status: 'OPEN' },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      },
      agentEvents: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!merchant) {
    return NextResponse.json({ error: 'MERCHANT_NOT_FOUND' }, { status: 404 });
  }

  const score = await calculateCommerceScore(merchantId);

  const realRevenue = merchant.orders.reduce((sum: number, o: any) => sum + o.amountInr, 0);

  const issueSummary = {
    high: merchant.catalogIssues.filter((i: any) => i.severity === 'HIGH').length,
    medium: merchant.catalogIssues.filter((i: any) => i.severity === 'MEDIUM').length,
    low: merchant.catalogIssues.filter((i: any) => i.severity === 'LOW').length,
    total: merchant.catalogIssues.length,
  };

  const recentBuyerEvents = await prisma.agentEvent.findMany({
    where: { agent: 'buyer_agent' },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  const funnel = {
    intents: 0,
    discoveryMatch: 0,
    constraintMatch: 0,
    checkoutReadiness: 0,
    purchased: 0,
  };

  const failureReasons: Record<string, number> = {};
  const merchantProductIds = new Set(merchant.products.map((p: { id: string }) => p.id));
  const seenSessions = new Set<string>();
  const sessionsWithDiscovery = new Set<string>();
  const sessionsWithConstraints = new Set<string>();
  const sessionsWithCheckout = new Set<string>();
  const sessionsWithPurchase = new Set<string>();

  for (const event of recentBuyerEvents) {
    if (!event.sessionId) continue;

    if (event.eventType === 'INTENT_PARSED') {
      seenSessions.add(event.sessionId);
    }

    if (event.eventType === 'PRODUCTS_SEARCHED') {
      const output = event.output as any;
      if (output?.productIds && output.productIds.some((id: string) => merchantProductIds.has(id))) {
        sessionsWithDiscovery.add(event.sessionId);
      }
    }

    if (event.eventType === 'CONSTRAINTS_EVALUATED') {
      const output = event.output as any;
      if (output?.results) {
        let hasEligibleMerchantProduct = false;

        for (const res of output.results) {
          if (merchantProductIds.has(res.productId)) {
            if (res.eligible) {
              hasEligibleMerchantProduct = true;
            } else if (res.failures && Array.isArray(res.failures)) {
              for (const failure of res.failures) {
                failureReasons[failure] = (failureReasons[failure] || 0) + 1;
              }
            }
          }
        }

        if (hasEligibleMerchantProduct) {
          sessionsWithConstraints.add(event.sessionId);
        }
      }
    }

    if (event.eventType === 'POLICY_CHECKED' && event.status === 'BLOCKED') {
       const input = event.input as any;
       if (input?.productId && merchantProductIds.has(input.productId)) {
         const reason = (event.decision as any)?.policyResult?.blockedReason || 'Policy Blocked';
         failureReasons[reason] = (failureReasons[reason] || 0) + 1;
       }
    }

    if (event.eventType === 'CHECKOUT_OPENED' || event.eventType === 'ORDER_CREATED') {
      const output = event.output as any;
      if (output?.orderId) {
        if (sessionsWithConstraints.has(event.sessionId)) {
          sessionsWithCheckout.add(event.sessionId);
        }
      }
    }

    if (event.eventType === 'PAYMENT_VERIFIED' || event.eventType === 'PURCHASE_COMPLETED') {
       if (sessionsWithCheckout.has(event.sessionId)) {
         sessionsWithPurchase.add(event.sessionId);
       }
    }
  }

  funnel.intents = seenSessions.size;
  funnel.discoveryMatch = sessionsWithDiscovery.size;
  funnel.constraintMatch = sessionsWithConstraints.size;
  funnel.checkoutReadiness = sessionsWithCheckout.size;
  funnel.purchased = sessionsWithPurchase.size;

  const aiBuyerFailures = Object.entries(failureReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    merchant: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      description: merchant.description,
      productCount: merchant.products.length,
    },
    aiCommerceScore: score,
    realRevenue,
    funnel,
    aiBuyerFailures,
    recentOrders: merchant.orders,
    issueSummary,
    openIssues: merchant.catalogIssues,
    recentActivity: merchant.agentEvents,
  });
}
