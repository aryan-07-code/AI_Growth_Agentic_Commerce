import Link from 'next/link';
import prisma from '@/lib/db';

export default async function MerchantListPage() {
  const merchants = await prisma.merchant.findMany({
    where: { active: true },
    select: { id: true, name: true, slug: true, description: true },
  });

  return (
    <div className="min-h-screen bg-[#050a14] relative overflow-hidden text-slate-100 flex flex-col">
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-br from-[#0c83ff]/15 via-[#00d2ff]/10 to-transparent blur-[120px] pointer-events-none -z-0" />
      <div className="absolute top-[400px] left-[-100px] w-[400px] h-[400px] bg-[#0c83ff]/10 blur-[130px] pointer-events-none -z-0" />

      <header className="border-b border-[#0c83ff]/20 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#050a14]/85 backdrop-blur-xl z-20 shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0c83ff] to-[#00d2ff] flex items-center justify-center text-white font-extrabold text-sm shadow-[0_0_15px_rgba(12,131,255,0.45)] group-hover:scale-105 transition-transform">
              AR
            </div>
            <span className="font-heading font-extrabold text-lg tracking-tight text-white group-hover:text-[#38bdf8] transition-colors">
              Agent<span className="gradient-text">Ready</span>
            </span>
          </Link>
          <span className="text-slate-600">/</span>
          <span className="badge badge-cyan text-xs font-medium">Merchant Directory</span>
        </div>
        <Link href="/buyer" className="btn-secondary py-1.5 px-4 text-xs font-semibold rounded-xl text-slate-300 hover:text-white">
          ← Launch Buyer Agent
        </Link>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 relative z-10">
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0c83ff]/15 border border-[#0c83ff]/30 text-[#38bdf8] text-xs font-medium mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00d2ff] animate-pulse" />
            AI Catalog Readiness Diagnostics
          </div>
          <h1 className="font-heading text-4xl font-extrabold text-white mb-2">Merchant Intelligence Portal</h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Real-time AI Commerce Scorecards, machine-readability diagnostics, and catalog compliance monitoring.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {merchants.map((m: { id: string; name: string; description: string | null }) => (
            <Link
              key={m.id}
              href={`/merchant/${m.id}`}
              className="card-interactive p-6 rounded-2xl border border-[#0c83ff]/15 bg-[#0b1528]/80 backdrop-blur-xl hover:border-[#0c83ff]/50 hover:shadow-[0_0_30px_rgba(12,131,255,0.2)] flex items-center justify-between group transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#0c83ff]/15 border border-[#0c83ff]/30 flex items-center justify-center text-xl text-[#38bdf8] group-hover:scale-105 transition-transform">
                  🏪
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-heading font-bold text-lg text-white group-hover:text-[#38bdf8] transition-colors">
                      {m.name}
                    </p>
                    <span className="badge badge-emerald text-[10px]">Active Partner</span>
                  </div>
                  <p className="text-slate-400 text-sm mt-0.5">{m.description || 'Verified merchant on AgentReady protocol'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-block text-xs font-semibold text-[#00d2ff] group-hover:underline">
                  View Diagnostic Report
                </span>
                <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-[#00d2ff] group-hover:bg-[#0c83ff]/20 transition-all font-bold">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
