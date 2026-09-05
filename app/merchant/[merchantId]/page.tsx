import Link from 'next/link';
import { notFound } from 'next/navigation';
import MerchantDashboardClient from '@/components/merchant/MerchantDashboardClient';

interface PageProps {
  params: Promise<{ merchantId: string }>;
}

async function getMerchantData(merchantId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/merchant/${merchantId}`,
    {
      cache: 'no-store',
      headers: {
        'X-Agent-Role': 'MERCHANT_AGENT',
        'X-Merchant-Id': merchantId
      }
    }
  );
  if (!res.ok) return null;
  return res.json();
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
