import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col bg-[#050a14] relative overflow-hidden text-slate-100">
      {/* Dynamic ambient background glow */}
      <div className="absolute top-[-140px] left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-[#0c83ff]/20 via-[#00d2ff]/10 to-transparent blur-[140px] pointer-events-none -z-0" />
      <div className="absolute top-[35%] right-[-120px] w-[500px] h-[500px] bg-[#0c83ff]/10 blur-[150px] pointer-events-none -z-0" />
      <div className="absolute bottom-[-100px] left-[-100px] w-[600px] h-[450px] bg-[#0284c7]/15 blur-[160px] pointer-events-none -z-0" />

      {/* Header */}
      <header className="border-b border-[rgba(12,131,255,0.18)] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#050a14]/85 backdrop-blur-xl z-20 shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0066ff] via-[#0c83ff] to-[#00d2ff] flex items-center justify-center text-white font-extrabold text-sm shadow-[0_0_20px_rgba(12,131,255,0.5)] group-hover:scale-105 transition-transform">
              AR
            </div>
            <span className="font-heading font-extrabold text-lg tracking-tight text-white group-hover:text-cyan-300 transition-colors">
              Agent<span className="text-[#0c83ff]">Ready</span>
            </span>
          </Link>
          <span className="badge badge-blue text-[11px] font-semibold py-0.5 px-2.5 shadow-[0_0_10px_rgba(12,131,255,0.2)]">
            RAZORPAY AP2
          </span>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            href="/buyer"
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-all"
          >
            AI Buyer Agent
          </Link>
          <Link
            href="/merchant"
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-all"
          >
            Merchant Analytics
          </Link>
          <div className="h-4 w-[1px] bg-white/10 mx-1 hidden sm:block" />
          <span className="badge badge-amber text-[11px] font-semibold hidden sm:flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            RAZORPAY TEST MODE
          </span>
        </nav>
      </header>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 sm:py-28 text-center relative z-10 max-w-5xl mx-auto w-full">
        {/* Top Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0b1b36] border border-[#0c83ff]/35 text-[#38bdf8] text-xs sm:text-sm font-medium mb-8 shadow-[0_0_20px_rgba(12,131,255,0.25)] animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-[#00d2ff] animate-ping" />
          <span>Razorpay AI Growth &amp; Agentic Commerce Track</span>
        </div>

        {/* Big Headline */}
        <h1 className="font-heading text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-white mb-6 max-w-4xl leading-[1.1]">
          Autonomous Commerce
          <br />
          <span className="gradient-text">Infrastructure Layer</span>
        </h1>

        {/* Subtitle */}
        <p className="text-slate-400 text-base sm:text-xl max-w-2xl mb-10 leading-relaxed font-body">
          Natural language discovery powered by deep intent reasoning and deterministic constraint enforcement.
          <span className="text-white font-medium block mt-1">AI reasons. Code constrains. Razorpay controls money.</span>
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 mb-14 w-full sm:w-auto">
          <Link
            href="/buyer"
            className="btn-primary text-base font-bold px-8 py-3.5 rounded-xl shadow-[0_0_30px_rgba(12,131,255,0.45)] flex items-center justify-center gap-2 cursor-pointer group"
          >
            <span>Launch AI Buyer Agent</span>
            <span className="text-cyan-200 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/merchant"
            className="btn-secondary text-base font-semibold px-8 py-3.5 rounded-xl text-slate-200 hover:text-white flex items-center justify-center gap-2 cursor-pointer border-[#0c83ff]/25 hover:border-[#0c83ff]/60"
          >
            <span>Explore Merchant Scorecard</span>
          </Link>
        </div>

        {/* Live Query Demo Card */}
        <div className="card-interactive max-w-xl w-full text-left p-5 sm:p-6 rounded-2xl border border-[#0c83ff]/25 bg-[#0b1528]/85 backdrop-blur-2xl shadow-[0_0_35px_rgba(12,131,255,0.18)] mb-16">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider font-bold text-[#38bdf8] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0c83ff]" />
              Example Conversational Intent
            </span>
            <span className="badge badge-cyan text-[10px]">Deterministic Constraints</span>
          </div>
          <p className="text-slate-200 text-sm sm:text-base leading-relaxed font-mono bg-black/40 p-3.5 rounded-xl border border-white/5">
            "Find me a waterproof backpack under ₹4,000 that reaches Bangalore by Friday."
          </p>
          <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
            <span>Enforces: Price Ceiling · Geo Pincode · SLA Deadline · Warranty</span>
            <Link href="/buyer" className="text-[#00d2ff] hover:text-white font-semibold flex items-center gap-1">
              Run Demo →
            </Link>
          </div>
        </div>

        {/* 3 Architecture Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl w-full text-left">
          {[
            {
              icon: '🧠',
              title: 'AI Reasons',
              desc: 'Extracts deep multi-dimensional intent, evaluates soft tradeoffs, and ranks products with transparent reasoning.',
              badge: 'Intent Intelligence',
              border: 'border-[#0c83ff]/25 hover:border-[#0c83ff]/60',
              glow: 'hover:shadow-[0_0_30px_rgba(12,131,255,0.25)]',
            },
            {
              icon: '⚙️',
              title: 'Code Constrains',
              desc: 'Deterministic rules check price thresholds, pin-code delivery SLA, return policies, and bounded autonomy budgets.',
              badge: 'Zero Hallucinations',
              border: 'border-[#00d2ff]/25 hover:border-[#00d2ff]/60',
              glow: 'hover:shadow-[0_0_30px_rgba(0,210,255,0.25)]',
            },
            {
              icon: '🔐',
              title: 'Razorpay Controls Money',
              desc: 'Cryptographic signature verification, server-side orders, idempotent payments, and auditable transaction trails.',
              badge: 'Financial Security',
              border: 'border-[#00c288]/25 hover:border-[#00c288]/60',
              glow: 'hover:shadow-[0_0_30px_rgba(0,194,136,0.25)]',
            },
          ].map((p) => (
            <div
              key={p.title}
              className={`card p-6 rounded-2xl bg-[#0b1528]/85 backdrop-blur-xl border ${p.border} ${p.glow} transition-all duration-300 flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl">{p.icon}</span>
                  <span className="badge badge-neutral text-[10px]">{p.badge}</span>
                </div>
                <h3 className="font-heading font-bold text-white text-lg mb-2">{p.title}</h3>
                <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Live Telemetry / Catalog Strip */}
        <div className="mt-14 pt-8 border-t border-white/5 max-w-3xl w-full grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="font-heading text-2xl font-extrabold text-white">51+</p>
            <p className="text-xs text-slate-400 mt-0.5">Verified Catalog Items</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-extrabold text-[#38bdf8]">7</p>
            <p className="text-xs text-slate-400 mt-0.5">Commerce Categories</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-extrabold text-[#00d2ff]">&lt;65ms</p>
            <p className="text-xs text-slate-400 mt-0.5">Constraint Filter SLA</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-extrabold text-[#00c288]">100%</p>
            <p className="text-xs text-slate-400 mt-0.5">Bounded Autonomy</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[rgba(12,131,255,0.18)] px-6 py-6 text-center bg-[#050a14]/90 backdrop-blur-md relative z-10">
        <p className="text-slate-500 text-xs">
          AgentReady · Razorpay AI Commerce Infrastructure · Autonomous Agentic Engine
        </p>
      </footer>
    </main>
  );
}
