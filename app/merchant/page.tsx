import Link from 'next/link';
import prisma from '@/lib/db';

export default async function MerchantListPage() {
  const merchants = await prisma.merchant.findMany({
    where: { active: true },
    select: { id: true, name: true, slug: true, description: true },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#d4a853] flex items-center justify-center text-black font-bold text-sm">AR</div>
            <span className="font-semibold text-[#e8e0d0]">AgentReady</span>
          </Link>
          <span className="text-[#4a4540]">/</span>
          <span className="text-[#8a8278] text-sm">Merchants</span>
        </div>
        <Link href="/buyer" className="btn-ghost text-xs">← Buyer Agent</Link>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-[#e8e0d0] mb-2">Merchant Dashboard</h1>
          <p className="text-[#8a8278]">AI Commerce Score, catalog health, and growth insights.</p>
        </div>

        <div className="space-y-3">
          {merchants.map((m: { id: string; name: string; description: string | null }) => (
            <Link
              key={m.id}
              href={`/merchant/${m.id}`}
              className="card flex items-center justify-between hover:border-[#2a2a2a] transition-colors group"
            >
              <div>
                <p className="font-semibold text-[#e8e0d0] group-hover:text-[#d4a853] transition-colors">{m.name}</p>
                <p className="text-[#8a8278] text-sm mt-0.5">{m.description}</p>
              </div>
              <span className="text-[#4a4540] group-hover:text-[#d4a853] transition-colors">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
