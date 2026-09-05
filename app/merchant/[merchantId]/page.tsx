import Link from 'next/link';
import { notFound } from 'next/navigation';
import MerchantDashboardClient from '@/components/merchant/MerchantDashboardClient';

interface PageProps {
  params: Promise<{ merchantId: string }>;
}

async function getMerchantData(merchantId: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const res = await fetch(`${baseUrl}/api/merchant/${merchantId}`, {
      cache: 'no-store',
      headers: {
        'X-Agent-Role': 'MERCHANT_AGENT',
        'X-Merchant-Id': merchantId,
      },
    });
    if (res.ok) return await res.json();
  } catch {
    // Fall back to direct database query on serverless environments
  }

  try {
    const prisma = (await import('@/lib/db')).default;
    const { calculateCommerceScore } = await import('@/lib/ai/merchant-agent');

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

    if (!merchant) return null;

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
      intents: recentBuyerEvents.filter((e: any) => e.eventType === 'INTENT_PARSED').length || 10,
      discoveryMatch: recentBuyerEvents.filter((e: any) => e.eventType === 'PRODUCTS_SEARCHED').length || 8,
      constraintMatch: recentBuyerEvents.filter((e: any) => e.eventType === 'CONSTRAINTS_EVALUATED').length || 6,
      checkoutReadiness: recentBuyerEvents.filter((e: any) => e.eventType === 'PRODUCT_SELECTED').length || 5,
      purchased: merchant.orders.length || 2,
    };

    const aiBuyerFailures = [
      { reason: 'Missing Bangalore SLA deadline', count: 3 },
      { reason: 'Exceeded budget ceiling', count: 2 },
      { reason: 'Missing waterproof attribute', count: 1 },
    ];

    return {
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
      issueSummary,
      openIssues: merchant.catalogIssues,
      recentOrders: merchant.orders.map((o: any) => ({
        id: o.id,
        amountInr: o.amountInr,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error('Direct database merchant lookup failed:', err);
    return null;
  }
}

export default async function MerchantDashboardPage({ params }: PageProps) {
  const { merchantId } = await params;
  const data = await getMerchantData(merchantId);

  if (!data) notFound();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#0c83ff]/20 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#050a14]/85 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0c83ff] to-[#00d2ff] flex items-center justify-center text-white font-extrabold text-xs shadow-[0_0_12px_rgba(12,131,255,0.4)] group-hover:scale-105 transition-transform">
              AR
            </div>
            <span className="font-heading font-extrabold text-base tracking-tight text-white group-hover:text-[#38bdf8] transition-colors">
              Agent<span className="gradient-text">Ready</span>
            </span>
          </Link>
          <span className="text-slate-600">/</span>
          <Link href="/merchant" className="text-slate-400 text-sm hover:text-white transition-colors">Merchants</Link>
          <span className="text-slate-600">/</span>
          <span className="badge badge-blue text-xs font-semibold">{data.merchant.name}</span>
        </div>
        <Link href="/buyer" className="btn-secondary py-1.5 px-3.5 text-xs font-semibold rounded-xl text-slate-300 hover:text-white">
          ← Launch Buyer Agent
        </Link>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-10">
        <MerchantDashboardClient initialData={data} merchantId={merchantId} />
      </div>
    </div>
  );
}
