import Link from 'next/link';
import { notFound } from 'next/navigation';
import MerchantDashboardClient from '@/components/merchant/MerchantDashboardClient';

interface PageProps {
  params: Promise<{ merchantId: string }>;
}

async function getMerchantData(merchantId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/merchant/${merchantId}`,
    { cache: 'no-store' }
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
      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0a0a0a] z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#d4a853] flex items-center justify-center text-black font-bold text-sm">AR</div>
            <span className="font-semibold text-[#e8e0d0]">AgentReady</span>
          </Link>
          <span className="text-[#4a4540]">/</span>
          <Link href="/merchant" className="text-[#8a8278] text-sm hover:text-[#e8e0d0] transition-colors">Merchants</Link>
          <span className="text-[#4a4540]">/</span>
          <span className="text-[#e8e0d0] text-sm font-medium">{data.merchant.name}</span>
        </div>
        <Link href="/buyer" className="btn-ghost text-xs">Try as Buyer →</Link>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-10">
        <MerchantDashboardClient initialData={data} merchantId={merchantId} />
      </div>
    </div>
  );
}
