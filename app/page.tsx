import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#d4a853] flex items-center justify-center text-black font-bold text-sm">
            AR
          </div>
          <span className="font-semibold text-[#e8e0d0] tracking-tight">AgentReady</span>
          <span className="badge badge-gold text-[11px]">TEST MODE</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/buyer" className="btn-ghost">
            Buyer Agent
          </Link>
          <Link href="/merchant" className="btn-ghost">
            Merchant
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="badge badge-gold mb-8">
          Razorpay AI Growth &amp; Agentic Commerce Track
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-[#e8e0d0] mb-6 max-w-3xl leading-tight">
          AI Commerce
          <br />
          <span className="text-[#d4a853]">Infrastructure Layer</span>
        </h1>

        <p className="text-[#8a8278] text-lg max-w-xl mb-12 leading-relaxed">
          Natural language product discovery with deterministic constraint enforcement.
          AI reasons. Code controls money.
        </p>

        {/* Two CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <Link href="/buyer" className="btn-primary text-base px-8 py-3">
            <span>→</span>
            Try AI Buyer Agent
          </Link>
          <Link href="/merchant" className="btn-secondary text-base px-8 py-3">
            Merchant Dashboard
          </Link>
        </div>

        {/* Demo query example */}
        <div className="card max-w-lg w-full text-left">
          <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-3 font-medium">Demo Query</p>
          <p className="text-[#e8e0d0] text-sm leading-relaxed font-mono">
            "Find me a waterproof backpack under ₹4,000 that reaches Bangalore by Friday."
          </p>
        </div>

        {/* Architecture pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16 max-w-3xl w-full">
          {[
            {
              icon: '🧠',
              title: 'AI Reasons',
              desc: 'Understands intent, ranks eligible products, explains recommendations',
            },
            {
              icon: '⚙️',
              title: 'Code Constrains',
              desc: 'Deterministic engine enforces price, inventory, delivery, and policy rules',
            },
            {
              icon: '🔐',
              title: 'Razorpay Controls Money',
              desc: 'Server-side orders, signature verification, idempotent webhooks',
            },
          ].map((p) => (
            <div key={p.title} className="card text-left">
              <div className="text-2xl mb-3">{p.icon}</div>
              <h3 className="font-semibold text-[#e8e0d0] mb-2">{p.title}</h3>
              <p className="text-[#8a8278] text-sm leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1a1a1a] px-6 py-4 text-center">
        <p className="text-[#4a4540] text-xs">
          AgentReady · Razorpay AI Commerce Hackathon · Test Mode Active
        </p>
      </footer>
    </main>
  );
}
