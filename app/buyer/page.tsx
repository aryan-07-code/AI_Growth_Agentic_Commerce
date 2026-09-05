'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

// Types
interface IntentChip {
  label: string;
  icon: string;
  type: 'category' | 'budget' | 'requirement' | 'location' | 'deadline';
}

interface ConstraintResult {
  productId: string;
  eligible: boolean;
  checks: Record<string, boolean>;
  failures: string[];
  deliveryEstimate?: {
    eligible: boolean;
    estimatedDelivery: string;
    minDays: number;
    maxDays: number;
  };
}

interface SearchResult {
  totalFound: number;
  eligible: number;
  candidates: Array<{ id: string; title: string; priceInr: number; category: string; merchantName: string }>;
  constraintResults?: ConstraintResult[];
}

interface SelectedProduct {
  id: string;
  title: string;
  priceInr: number;
  merchantName: string;
  warrantyMonths: number | null;
  returnDays: number | null;
  attributes: Record<string, unknown>;
  images: string[];
}

interface Ranking {
  selectedProductId: string;
  confidence: number;
  reasons: string[];
  tradeoffs: string[];
  explanation: string;
}

interface AgentStep {
  state: string;
  agentMessage?: string;
  intent?: Record<string, unknown>;
  searchResult?: SearchResult;
  selectedProduct?: SelectedProduct;
  ranking?: Ranking;
  error?: string;
  constraintResults?: ConstraintResult[];
}

interface AuditEvent {
  id: string;
  eventType: string;
  status: string;
  output?: Record<string, unknown>;
  durationMs?: number;
  createdAt: string;
}

type BuyerPhase =
  | 'idle'
  | 'processing'
  | 'showing_intent'
  | 'showing_search'
  | 'showing_recommendation'
  | 'await_approval'
  | 'creating_order'
  | 'checkout'
  | 'complete'
  | 'error'
  | 'no_match'
  | 'policy_blocked';

const DEMO_QUERIES = [
  'Find me a waterproof backpack under ₹4,000 that reaches Bangalore by Friday.',
  'Find me a waterproof backpack under ₹2,000 that arrives tomorrow.',
  'Buy me the ₹75,000 laptop.',
];

function getProductImage(product?: { images?: string[]; category?: string; title?: string }): string {
  const cat = (product?.category || '').toLowerCase();
  const t = (product?.title || '').toLowerCase();

  // 1. High precision title & hardware checks
  if (t.includes('ssd') || t.includes('storage') || t.includes('drive') || t.includes('samsung t7') || t.includes('sandisk')) {
    return '/products/ssd.jpg';
  }
  if (t.includes('phone') || t.includes('iphone') || t.includes('smartphone') || t.includes('galaxy') || t.includes('pixel')) {
    return '/products/smartphone.jpg';
  }
  if (t.includes('headphone') || t.includes('audio') || t.includes('airpods') || t.includes('sony') || t.includes('earbuds') || t.includes('wh-1000xm5')) {
    return '/products/headphones.jpg';
  }
  if (t.includes('watch') || t.includes('pace') || t.includes('gps') || t.includes('garmin')) {
    return '/products/watch.jpg';
  }
  if (cat.includes('apparel') || t.includes('jacket') || t.includes('hoodie') || t.includes('tee') || t.includes('shirt') || t.includes('pant')) {
    return '/products/apparel.jpg';
  }
  if (cat.includes('footwear') || t.includes('shoe') || t.includes('runner') || t.includes('sneaker') || t.includes('runpro')) {
    return '/products/footwear.jpg';
  }
  if (t.includes('laptop') || t.includes('computer') || t.includes('macbook') || t.includes('dell') || t.includes('ipad') || t.includes('monitor')) {
    return '/products/laptop.jpg';
  }
  if (cat.includes('backpack') || t.includes('backpack') || t.includes('daypack') || t.includes('rainshield') || t.includes('trekmax')) {
    return '/products/backpack.jpg';
  }
  if (cat.includes('bags') || t.includes('duffel') || t.includes('gym') || t.includes('vest') || t.includes('tote') || t.includes('sling')) {
    return '/products/bags.jpg';
  }

  // 2. Explicit product image from database if valid
  if (product?.images && product.images.length > 0 && product.images[0] && product.images[0].startsWith('/products/')) {
    return product.images[0];
  }

  // 3. Category fallbacks
  if (cat.includes('electronics') || t.includes('charger') || t.includes('mouse') || t.includes('keyboard')) {
    return '/products/laptop.jpg';
  }
  return '/products/backpack.jpg';
}

export default function BuyerPage() {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<BuyerPhase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentStep, setAgentStep] = useState<AgentStep | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditEvent[]>([]);
  const [checkoutConfig, setCheckoutConfig] = useState<Record<string, unknown> | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isSearching = phase === 'processing' || phase === 'showing_intent' || phase === 'showing_search';
  const [loadingStage, setLoadingStage] = useState(0);
  const [searchElapsed, setSearchElapsed] = useState(0);

  useEffect(() => {
    if (!isSearching) {
      setLoadingStage(0);
      setSearchElapsed(0);
      return;
    }
    const timer1 = setTimeout(() => setLoadingStage(1), 600);
    const timer2 = setTimeout(() => setLoadingStage(2), 1500);
    const timer3 = setTimeout(() => setLoadingStage(3), 2400);

    const start = Date.now();
    const interval = setInterval(() => {
      setSearchElapsed(Math.floor((Date.now() - start) / 100) / 10);
    }, 100);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearInterval(interval);
    };
  }, [isSearching]);

  // ─── SUBMIT QUERY ──────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || phase === 'processing') return;

    setPhase('processing');
    setAgentStep(null);
    setAuditTrail([]);
    setCheckoutConfig(null);
    setOrderId(null);

    try {
      // Create session
      const sessionRes = await fetch('/api/buyer/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Role': 'BUYER_AGENT' },
        body: JSON.stringify({}),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error);

      const newSessionId = sessionData.sessionId;
      setSessionId(newSessionId);

      // Send message
      setPhase('showing_intent');
      const msgRes = await fetch(`/api/buyer/sessions/${newSessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Role': 'BUYER_AGENT' },
        body: JSON.stringify({ message: query }),
      });

      const msgData = await msgRes.json();
      setAgentStep(msgData);

      // Route based on state
      if (msgData.state === 'NO_MATCH') {
        setPhase('no_match');
      } else if (msgData.state === 'AWAIT_APPROVAL' || msgData.selectedProduct) {
        setPhase('await_approval');
      } else if (msgData.error) {
        setPhase('error');
      } else {
        setPhase('showing_recommendation');
      }
    } catch (err: any) {
      setAgentStep({ state: 'error', error: err.message });
      setPhase('error');
    }
  }

  // ─── CONFIRM PURCHASE ──────────────────────────────────────────────────────
  async function handleConfirmPurchase() {
    if (!sessionId || !agentStep?.selectedProduct) return;
    setPhase('creating_order');

    try {
      // Set approval on session
      await fetch(`/api/buyer/sessions/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Role': 'BUYER_AGENT' },
        body: JSON.stringify({ message: 'confirm', approvalGiven: true }),
      });

      // Create order
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Role': 'BUYER_AGENT' },
        body: JSON.stringify({
          sessionId,
          productId: agentStep.selectedProduct.id,
        }),
      });
      const orderData = await orderRes.json();

      if (!orderRes.ok) {
        if (orderData.error === 'POLICY_BLOCKED') {
          setAgentStep((prev) => ({ ...prev!, error: orderData.message, state: 'POLICY_BLOCKED' }));
          setPhase('policy_blocked');
          return;
        }
        throw new Error(orderData.message || orderData.error);
      }

      setOrderId(orderData.orderId);
      setCheckoutConfig(orderData.checkout);
      setPhase('checkout');

      // Load Razorpay checkout
      if (!orderData.checkout?.demoMode) {
        await openRazorpayCheckout(orderData.checkout, sessionId, setPhase, setAuditTrail);
      }
    } catch (err: any) {
      setAgentStep((prev) => ({ ...prev!, error: err.message, state: 'ORDER_FAILED' }));
      setPhase('error');
    }
  }

  // ─── LOAD AUDIT TRAIL ─────────────────────────────────────────────────────
  async function loadAuditTrail() {
    if (!sessionId) return;
    const res = await fetch(`/api/buyer/sessions/${sessionId}/message`, {
      headers: { 'X-Agent-Role': 'BUYER_AGENT' }
    });
    const data = await res.json();
    setAuditTrail(data.auditTrail || []);
  }

  // ─── RESET ────────────────────────────────────────────────────────────────
  function handleReset() {
    setQuery('');
    setPhase('idle');
    setSessionId(null);
    setAgentStep(null);
    setAuditTrail([]);
    setCheckoutConfig(null);
    setOrderId(null);
    inputRef.current?.focus();
  }

  // ─── BUILD INTENT CHIPS ────────────────────────────────────────────────────
  function buildChips(intent: Record<string, unknown>): IntentChip[] {
    const chips: IntentChip[] = [];
    const budget = intent.budget as any;
    const reqs = intent.hardRequirements as any[];

    if (intent.category) chips.push({ label: String(intent.category), icon: '🏷️', type: 'category' });
    if (budget?.max) chips.push({ label: `Under ₹${Number(budget.max).toLocaleString('en-IN')}`, icon: '💰', type: 'budget' });
    if (intent.destination) chips.push({ label: String(intent.destination), icon: '📍', type: 'location' });
    if (intent.deliveryDeadline) chips.push({ label: `By ${intent.deliveryDeadline}`, icon: '📅', type: 'deadline' });
    reqs?.forEach((r) => {
      if (r.value === true) chips.push({ label: r.attribute, icon: '✓', type: 'requirement' });
    });

    return chips;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#050a14] relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-br from-[#0c83ff]/15 via-[#00d2ff]/10 to-transparent blur-[120px] pointer-events-none -z-0" />
      <div className="absolute top-[400px] right-[-100px] w-[400px] h-[400px] bg-[#00d2ff]/10 blur-[130px] pointer-events-none -z-0" />
      <div className="absolute bottom-[-50px] left-[-100px] w-[500px] h-[350px] bg-[#0c83ff]/10 blur-[140px] pointer-events-none -z-0" />

      {/* Header */}
      <header className="border-b border-[#0c83ff]/20 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#050a14]/85 backdrop-blur-xl z-20 shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
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
          <span className="badge badge-blue text-xs font-semibold">AI Buyer Agent</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge badge-amber text-[11px] font-semibold flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            RAZORPAY TEST MODE
          </span>
          <Link href="/merchant" className="btn-ghost text-xs font-medium text-slate-300 hover:text-white">
            Merchant Portal →
          </Link>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-10 relative z-10">

        {/* ─── IDLE / INPUT STATE ─────────────────────────────────────────── */}
        {/* ─── IDLE / SEARCHING STATE ─────────────────────────────────────────── */}
        {(phase === 'idle' || isSearching) && (
          <div className="animate-fade-in">
            {phase === 'idle' ? (
              <div className="mb-10 text-center">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0c83ff]/10 border border-[#0c83ff]/30 text-[#38bdf8] text-xs font-medium mb-4 shadow-[0_0_15px_rgba(12,131,255,0.2)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00d2ff] animate-ping" />
                  Next-Gen Agentic Commerce Engine
                </div>
                <h1 className="font-heading text-4xl sm:text-5xl font-extrabold text-white mb-3 tracking-tight">
                  What are you <span className="gradient-text">looking for?</span>
                </h1>
                <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
                  Describe your exact needs. AI reasons on deep intent, deterministic constraints guarantee delivery &amp; price accuracy.
                </p>
              </div>
            ) : (
              <div className="mb-4 flex items-center justify-between">
                <button
                  onClick={handleReset}
                  className="btn-secondary py-1.5 px-3.5 text-xs font-semibold flex items-center gap-1.5 rounded-xl text-slate-300 hover:text-white border-white/10 hover:border-[#0c83ff]/40"
                >
                  <span>←</span>
                  <span>Cancel Search</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00d2ff] animate-ping shadow-[0_0_8px_#00d2ff]" />
                  <span className="text-xs font-mono text-[#38bdf8] font-semibold tracking-wider">AI REASONING PIPELINE</span>
                </div>
              </div>
            )}

            {/* Search Input Card */}
            <form onSubmit={handleSubmit} className="mb-8">
              <div className={`card relative overflow-hidden border ${isSearching ? 'border-[#0c83ff]/60 shadow-[0_0_35px_rgba(12,131,255,0.25)]' : 'border-[#0c83ff]/20 focus-within:border-[#0c83ff]/60 focus-within:shadow-[0_0_35px_rgba(12,131,255,0.25)]'} transition-all duration-300 p-5 rounded-2xl bg-[#0b1528]/85 backdrop-blur-2xl`}>
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#0c83ff] via-[#00d2ff] to-[#0c83ff] opacity-70" />
                <textarea
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Find me a waterproof backpack under ₹4,000 that reaches Bangalore by Friday."
                  rows={3}
                  className="w-full resize-none border-0 bg-transparent p-0 text-base sm:text-lg text-white placeholder-slate-500 focus:outline-none focus:ring-0 mb-4 leading-relaxed"
                  disabled={isSearching}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e as any);
                    }
                  }}
                />
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-slate-500 font-mono text-xs">{query.length}/2000</span>
                  <button
                    type="submit"
                    disabled={!query.trim() || isSearching}
                    className="btn-primary py-2.5 px-6 text-sm font-semibold rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSearching ? (
                      <>
                        <span className="spinner w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Reasoning…</span>
                      </>
                    ) : (
                      <>
                        <span>Ask Agent</span>
                        <span className="text-cyan-200">→</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* ─── LIVE AI SEARCHING & REASONING ANIMATION CARD ─── */}
            {isSearching && (
              <div className="card-hero p-6 sm:p-8 rounded-2xl border border-[#0c83ff]/40 bg-gradient-to-b from-[#0b1528] to-[#050a14] relative overflow-hidden shadow-[0_0_50px_rgba(12,131,255,0.25)] animate-fade-in mb-8">
                {/* Shimmering top scanline */}
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#0c83ff] via-[#00d2ff] to-[#00c288] overflow-hidden">
                  <div className="w-1/2 h-full bg-white/60 blur-[2px] animate-shimmer-scan" />
                </div>

                {/* Ambient radial glow */}
                <div className="absolute -top-24 -left-24 w-72 h-72 bg-[#0c83ff]/20 rounded-full blur-[90px] pointer-events-none animate-glow-pulse" />
                <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-[#00d2ff]/20 rounded-full blur-[90px] pointer-events-none animate-glow-pulse" />

                {/* Header bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-6 border-b border-white/10 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="relative flex items-center justify-center w-8 h-8">
                      <span className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" />
                      <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_12px_#06b6d4]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading font-extrabold text-white text-base tracking-tight">
                          AI Commerce Reasoning Engine
                        </h3>
                        <span className="badge badge-cyan text-[10px] font-bold tracking-wider px-2 py-0.5">
                          SEARCHING CATALOG
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Autonomous Reasoning Engine · Deterministic Policy Evaluator · Real-Time Catalog
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black/40 border border-white/10 font-mono text-xs text-[#38bdf8]">
                      <span className="text-slate-500">Elapsed:</span>
                      <span className="text-[#00d2ff] font-bold">{searchElapsed.toFixed(1)}s</span>
                    </div>
                  </div>
                </div>

                {/* Active Target Intent Query Display */}
                <div className="relative z-10 mb-6 p-4 rounded-xl bg-black/50 border border-[#0c83ff]/30 shadow-inner">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0c83ff]" />
                      Evaluating Natural Language Intent
                    </span>
                    {/* Equalizer Wave Bars */}
                    <div className="flex items-center gap-1 h-3.5">
                      <span className="w-1 h-full bg-[#00d2ff] rounded-full animate-wave-1 origin-bottom" />
                      <span className="w-1 h-full bg-[#0c83ff] rounded-full animate-wave-2 origin-bottom" />
                      <span className="w-1 h-full bg-[#00c288] rounded-full animate-wave-3 origin-bottom" />
                      <span className="w-1 h-full bg-[#00d2ff] rounded-full animate-wave-4 origin-bottom" />
                      <span className="w-1 h-full bg-[#0c83ff] rounded-full animate-wave-5 origin-bottom" />
                    </div>
                  </div>
                  <p className="text-slate-100 text-sm font-mono leading-relaxed flex items-center gap-2">
                    <span>"{query}"</span>
                    <span className="inline-block w-2 h-4 bg-[#00d2ff] animate-pulse ml-0.5" />
                  </p>
                </div>

                {/* Centerpiece: Concentric Radar Scanner + 4-Stage Progressive Pipeline */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center relative z-10">
                  {/* Radar Scanner Visual (4 cols) */}
                  <div className="md:col-span-4 flex flex-col items-center justify-center p-4">
                    <div className="relative w-44 h-44 flex items-center justify-center">
                      {/* Concentric rings */}
                      <div className="absolute inset-0 rounded-full border border-[#0c83ff]/20" />
                      <div className="absolute inset-4 rounded-full border border-[#00d2ff]/25" />
                      <div className="absolute inset-8 rounded-full border border-[#0c83ff]/30" />
                      <div className="absolute inset-12 rounded-full border border-[#00d2ff]/40" />

                      {/* Animated ripple expansion */}
                      <div className="absolute inset-6 rounded-full border-2 border-[#00d2ff]/40 animate-ripple pointer-events-none" />

                      {/* Rotating Radar Sweep Beam */}
                      <div className="absolute inset-0 rounded-full overflow-hidden animate-radar-sweep pointer-events-none">
                        <div className="w-1/2 h-1/2 origin-bottom-right bg-gradient-to-tl from-[#00d2ff]/30 via-[#0c83ff]/15 to-transparent" />
                      </div>

                      {/* Central AI Bot Assistant */}
                      <div className="relative z-10 w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-[#0c83ff] via-[#00d2ff] to-[#0c83ff] shadow-[0_0_35px_rgba(12,131,255,0.6)] animate-glow-pulse group">
                        <div className="w-full h-full rounded-full overflow-hidden border border-white/30 bg-[#050a14] relative shadow-inner">
                          <img
                            src="/ai-bot.jpg"
                            alt="AI Bot Assistant"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                          {/* Subtle holographic cyan sheen */}
                          <div className="absolute inset-0 bg-gradient-to-b from-[#00d2ff]/15 via-transparent to-[#0c83ff]/20 pointer-events-none" />
                        </div>
                        {/* Live active status ping */}
                        <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#00c288] border-2 border-[#050a14] shadow-[0_0_10px_#00c288] flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        </span>
                      </div>

                      {/* Orbiting blips */}
                      <span className="absolute top-4 right-8 w-2 h-2 rounded-full bg-[#00d2ff] shadow-[0_0_10px_#00d2ff] animate-ping" />
                      <span className="absolute bottom-6 left-6 w-1.5 h-1.5 rounded-full bg-[#0c83ff] shadow-[0_0_8px_#0c83ff]" />
                      <span className="absolute top-12 left-5 w-2 h-2 rounded-full bg-[#00c288] shadow-[0_0_8px_#00c288]" />
                    </div>
                    <span className="text-xs font-mono text-[#00d2ff] font-semibold mt-3 tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00d2ff] animate-pulse" />
                      AI COMMERCE REASONING ACTIVE
                    </span>
                  </div>

                  {/* 4 Progressive Pipeline Telemetry Steps (8 cols) */}
                  <div className="md:col-span-8 space-y-3">
                    {[
                      {
                        step: 0,
                        title: 'Deconstructing Semantic Intent',
                        desc: 'Extracting budget ceiling, delivery SLA deadline, geo pincode, and technical specs',
                        tag: 'INTENT INTELLIGENCE',
                      },
                      {
                        step: 1,
                        title: 'Querying Catalog & Inventory',
                        desc: 'Retrieving candidates across UrbanTrail, RunPro, and TechNest merchant stores',
                        tag: 'CATALOG VECTOR SEARCH',
                      },
                      {
                        step: 2,
                        title: 'Executing Deterministic Policy Auditing',
                        desc: 'Hard rules verify waterproof rating, transit days to Bangalore, and return policies',
                        tag: 'ZERO HALLUCINATIONS',
                      },
                      {
                        step: 3,
                        title: 'Synthesizing Best Match & Confidence Ranking',
                        desc: 'Evaluating trade-offs, calculating match percentage, and preparing purchase payload',
                        tag: 'RAZORPAY CONFIDENCE',
                      },
                    ].map((s) => {
                      const isDone = loadingStage > s.step;
                      const isActive = loadingStage === s.step;
                      return (
                        <div
                          key={s.step}
                          className={`p-3 sm:p-3.5 rounded-xl border transition-all duration-300 flex items-start gap-3 ${
                            isDone
                              ? 'border-emerald-500/30 bg-emerald-950/15 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
                              : isActive
                              ? 'border-cyan-500/40 bg-cyan-950/20 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/30'
                              : 'border-white/5 bg-black/20 opacity-40'
                          }`}
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            {isDone ? (
                              <div className="w-5 h-5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-bold">
                                ✓
                              </div>
                            ) : isActive ? (
                              <div className="w-5 h-5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                                <span className="w-2.5 h-2.5 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 text-[10px] font-mono">
                                {s.step + 1}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={`font-heading text-xs sm:text-sm font-semibold ${
                                  isDone
                                    ? 'text-emerald-300'
                                    : isActive
                                    ? 'text-cyan-200'
                                    : 'text-slate-400'
                                }`}
                              >
                                {s.title}
                              </p>
                              <span
                                className={`badge text-[9px] font-mono px-1.5 py-0.5 ${
                                  isDone
                                    ? 'badge-emerald'
                                    : isActive
                                    ? 'badge-cyan'
                                    : 'badge-neutral'
                                }`}
                              >
                                {s.tag}
                              </span>
                            </div>
                            <p className="text-slate-400 text-[11px] leading-relaxed mt-0.5">
                              {s.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Demo queries (only show when idle) */}
            {phase === 'idle' && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-[#00d2ff] shadow-[0_0_8px_#00d2ff]" />
                  <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold">Try Live Catalog Demos</p>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {DEMO_QUERIES.map((q, idx) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuery(q)}
                      className="text-left p-3.5 rounded-xl border border-white/10 bg-white/[0.03] hover:border-[#0c83ff]/40 hover:bg-[#0c83ff]/10 text-slate-300 text-sm transition-all duration-200 hover:text-white flex items-center justify-between group shadow-sm hover:shadow-[0_0_20px_rgba(12,131,255,0.15)] cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-[#0c83ff]/20 border border-[#0c83ff]/30 flex items-center justify-center text-xs font-mono text-[#38bdf8]">
                          {idx + 1}
                        </span>
                        <span>"{q}"</span>
                      </div>
                      <span className="text-slate-500 group-hover:text-[#00d2ff] group-hover:translate-x-1 transition-all text-sm font-bold">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── RESULTS STATES ─────────────────────────────────────────────── */}
        {agentStep && !isSearching && (
          <div className="animate-fade-in space-y-6">

            {/* Back / New search */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleReset}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold flex items-center gap-2 rounded-xl text-slate-300 hover:text-white border-white/10 hover:border-[#0c83ff]/50 cursor-pointer"
              >
                <span>←</span>
                <span>New Search</span>
              </button>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00c288] animate-pulse shadow-[0_0_8px_#00c288]" />
                <span className="text-xs font-mono text-[#00c288] font-medium">AGENT SESSION ACTIVE</span>
              </div>
            </div>

            {/* Intent Chips */}
            {agentStep.intent && (
              <div className="card p-5 rounded-2xl border border-[#0c83ff]/25 bg-[#0b1528]/85 backdrop-blur-xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00d2ff]" />
                  <p className="text-[#38bdf8] text-xs uppercase tracking-wider font-semibold">Understood Intent &amp; Constraints</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {buildChips(agentStep.intent as any).map((chip) => (
                    <span
                      key={chip.label}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#0c83ff]/15 text-[#e0f2fe] border border-[#0c83ff]/30 shadow-[0_0_10px_rgba(12,131,255,0.15)]"
                    >
                      <span className="text-[#00d2ff]">{chip.icon}</span>
                      <span className="capitalize">{chip.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Search Results */}
            {agentStep.searchResult && (
              <div className="card p-5 rounded-2xl border border-[#00d2ff]/25 bg-[#0b1528]/85 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00d2ff]" />
                    <p className="text-[#38bdf8] text-xs uppercase tracking-wider font-semibold">Catalog Discovery &amp; Policy Filtering</p>
                  </div>
                  <span className="text-xs font-mono text-slate-400">Semantic Vector + Deterministic Constraints</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="font-heading text-2xl sm:text-3xl font-extrabold text-white">
                      {agentStep.searchResult.totalFound}
                    </p>
                    <p className="text-slate-400 text-xs mt-1">Candidates Discovered</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                    <p className="font-heading text-2xl sm:text-3xl font-extrabold text-emerald-400">
                      {agentStep.searchResult.eligible}
                    </p>
                    <p className="text-emerald-300/80 text-xs mt-1">Passed All Checks</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-rose-950/15 border border-rose-500/20">
                    <p className="font-heading text-2xl sm:text-3xl font-extrabold text-rose-400">
                      {agentStep.searchResult.totalFound - agentStep.searchResult.eligible}
                    </p>
                    <p className="text-rose-300/80 text-xs mt-1">Pruned by Rules</p>
                  </div>
                </div>

                {/* Constraint filter breakdown */}
                {agentStep.searchResult.constraintResults && agentStep.searchResult.constraintResults.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-slate-400 text-xs uppercase tracking-wider font-medium mb-1">Detailed Constraint Auditing</p>
                    {agentStep.searchResult.constraintResults.map((cr) => {
                      const product = agentStep.searchResult!.candidates.find((c) => c.id === cr.productId);
                      return (
                        <div
                          key={cr.productId}
                          className={`flex items-start justify-between p-3 rounded-xl border text-sm transition-all ${
                            cr.eligible
                              ? 'border-emerald-500/30 bg-emerald-950/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]'
                              : 'border-rose-500/20 bg-rose-950/10'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-lg overflow-hidden border border-white/10 bg-[#0d0c18] flex-shrink-0 shadow-sm">
                              <img
                                src={getProductImage(product)}
                                alt={product?.title || ''}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <p className="font-medium text-white">{product?.title || cr.productId}</p>
                              {cr.eligible ? (
                                <p className="text-emerald-400 text-xs mt-0.5 flex items-center gap-1 font-medium">
                                  <span>✓</span> All strict constraints satisfied
                                </p>
                              ) : (
                                <div className="text-rose-400 text-xs mt-0.5 space-y-0.5">
                                  {cr.failures.map((f, i) => (
                                    <p key={i} className="flex items-center gap-1">
                                      <span>✗</span> {f}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className={`badge text-xs font-semibold ${cr.eligible ? 'badge-emerald' : 'badge-rose'}`}>
                            {cr.eligible ? 'ELIGIBLE' : 'FILTERED'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* NO MATCH */}
            {phase === 'no_match' && (
              <div className="card p-6 rounded-2xl border border-rose-500/30 bg-rose-950/15 shadow-[0_0_30px_rgba(244,63,94,0.15)]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-lg text-rose-400">
                    ✗
                  </div>
                  <div>
                    <p className="font-heading font-bold text-white text-lg">No Eligible Product Found</p>
                    <p className="text-slate-400 text-xs">All candidates failed one or more strict constraints</p>
                  </div>
                </div>
                <div className="bg-black/40 border border-white/5 rounded-xl p-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {agentStep.agentMessage}
                </div>
                <button onClick={handleReset} className="btn-secondary mt-4 text-sm font-semibold rounded-xl">
                  Try Different Requirements
                </button>
              </div>
            )}

            {/* POLICY BLOCKED */}
            {phase === 'policy_blocked' && (
              <div className="card p-6 rounded-2xl border border-rose-500/30 bg-rose-950/15 shadow-[0_0_30px_rgba(244,63,94,0.15)]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-xl text-rose-400">
                    🛡️
                  </div>
                  <div>
                    <p className="font-heading font-bold text-white text-lg">Purchase Blocked by Policy</p>
                    <p className="text-slate-400 text-xs">Autonomous transaction ceiling exceeded</p>
                  </div>
                </div>
                <p className="text-rose-400 text-sm mb-2">{agentStep.error}</p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Bounded autonomy safeguards in effect: AgentReady will never commit capital past configured spending boundaries without explicit multi-party clearance.
                </p>
                <button onClick={handleReset} className="btn-secondary mt-4 text-sm font-semibold rounded-xl">
                  New Search
                </button>
              </div>
            )}

            {/* ERROR */}
            {phase === 'error' && (
              <div className="card p-6 rounded-2xl border border-rose-500/30 bg-rose-950/15">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-xl text-rose-400">
                    ⚠
                  </div>
                  <div>
                    <p className="font-heading font-bold text-white text-lg">Something went wrong</p>
                    <p className="text-slate-400 text-xs">{agentStep?.error || 'Unable to process your request.'}</p>
                  </div>
                </div>
                <button onClick={handleReset} className="btn-secondary mt-4 text-sm font-semibold rounded-xl">
                  Try Again
                </button>
              </div>
            )}

            {/* CLARIFICATION / AGENT MESSAGE */}
            {!agentStep.selectedProduct && agentStep.agentMessage && phase !== 'no_match' && phase !== 'policy_blocked' && phase !== 'error' && (
              <div className="card p-6 rounded-2xl border border-amber-500/30 bg-amber-950/15 shadow-[0_0_25px_rgba(245,158,11,0.15)]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl text-amber-400">
                    🤖
                  </div>
                  <div>
                    <p className="font-heading font-bold text-white text-lg">Agent Needs Clarification</p>
                    <p className="text-slate-400 text-xs">Missing specific criteria</p>
                  </div>
                </div>
                <div className="bg-black/40 border border-white/5 rounded-xl p-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap mb-4">
                  {agentStep.agentMessage}
                </div>
                <button onClick={handleReset} className="btn-secondary text-sm font-semibold rounded-xl">
                  Refine Search
                </button>
              </div>
            )}

            {/* RECOMMENDATION HERO */}
            {agentStep.selectedProduct && (phase === 'await_approval' || phase === 'showing_recommendation' || phase === 'creating_order' || phase === 'checkout') && (
              <div className="card-hero p-6 sm:p-7 rounded-2xl border border-[#0c83ff]/40 bg-gradient-to-b from-[#0b1528] to-[#071022] relative overflow-hidden shadow-[0_0_40px_rgba(12,131,255,0.25)]">
                {/* Radiant top aura */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0c83ff] via-[#00d2ff] to-[#0c83ff]" />
                
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-blue text-xs font-bold tracking-wider py-1 px-3 shadow-[0_0_12px_rgba(12,131,255,0.3)]">
                      ✨ BEST MATCH
                    </span>
                    <span className="badge badge-cyan text-xs font-semibold">
                      {Math.round((agentStep.ranking?.confidence || 0.94) * 100)}% Match Confidence
                    </span>
                  </div>
                  <span className="text-slate-400 text-xs font-mono">ID: {agentStep.selectedProduct.id.slice(0, 8)}</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-6 mb-6 items-start">
                  {/* Real Commercial Studio Product Photograph */}
                  <div className="relative w-full sm:w-48 h-52 sm:h-48 rounded-2xl overflow-hidden border border-white/15 bg-[#071022] flex-shrink-0 shadow-[0_0_35px_rgba(0,0,0,0.7)] group">
                    <img
                      src={getProductImage(agentStep.selectedProduct)}
                      alt={agentStep.selectedProduct.title}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050a14]/85 via-transparent to-transparent pointer-events-none" />
                    <span className="absolute bottom-2.5 left-2.5 px-2.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-white/20 text-[10px] font-mono text-[#00d2ff] font-bold tracking-wider">
                      VERIFIED ITEM
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h2 className="font-heading font-extrabold text-white text-xl sm:text-2xl leading-snug mb-1.5">
                      {agentStep.selectedProduct.title}
                    </h2>
                    <p className="text-slate-400 text-sm mb-3 flex items-center gap-1.5">
                      <span className="text-[#38bdf8] font-medium">Sold by {agentStep.selectedProduct.merchantName}</span>
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <span>✓</span> Verified Merchant
                      </span>
                    </p>
                    <div className="flex items-baseline gap-2 mb-3">
                      <p className="gradient-text-gold font-heading text-3xl sm:text-4xl font-black tracking-tight">
                        ₹{agentStep.selectedProduct.priceInr.toLocaleString('en-IN')}
                      </p>
                      <span className="text-slate-400 text-xs font-medium">Inclusive of all taxes</span>
                    </div>

                    {/* Product attributes badges */}
                    <div className="flex flex-wrap gap-2">
                      {agentStep.selectedProduct.warrantyMonths && (
                        <span className="badge badge-emerald text-xs">
                          🛡️ {agentStep.selectedProduct.warrantyMonths}M Warranty
                        </span>
                      )}
                      {agentStep.selectedProduct.returnDays && (
                        <span className="badge badge-cyan text-xs">
                          ↺ {agentStep.selectedProduct.returnDays}d Return Policy
                        </span>
                      )}
                      {(agentStep.selectedProduct.attributes as any)?.waterproof && (
                        <span className="badge badge-blue text-xs">
                          💧 Waterproof Rated
                        </span>
                      )}
                      {(agentStep.selectedProduct.attributes as any)?.laptop_size_inches && (
                        <span className="badge badge-neutral text-xs">
                          💻 {(agentStep.selectedProduct.attributes as any).laptop_size_inches}" Laptop Sleeve
                        </span>
                      )}
                      {(agentStep.selectedProduct.attributes as any)?.capacity_litres && (
                        <span className="badge badge-neutral text-xs">
                          🎒 {(agentStep.selectedProduct.attributes as any).capacity_litres}L Capacity
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delivery estimate */}
                {agentStep.constraintResults && (() => {
                  const cr = agentStep.constraintResults?.find(
                    (r) => r.productId === agentStep.selectedProduct!.id
                  );
                  const delivery = cr?.deliveryEstimate;
                  if (!delivery?.eligible) return null;
                  return (
                    <div className="flex items-center gap-2.5 mb-5 p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/25 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                      <span className="text-xl">🚚</span>
                      <div className="text-xs sm:text-sm">
                        <span className="text-emerald-300 font-semibold">Guaranteed Delivery: </span>
                        <span className="text-emerald-200">{delivery.estimatedDelivery} ({delivery.minDays}–{delivery.maxDays} business days)</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Why this one? Reasoning */}
                {agentStep.ranking && (
                  <div className="mb-6 p-4 rounded-xl bg-black/30 border border-white/5">
                    <p className="text-[#38bdf8] text-xs uppercase tracking-wider mb-2.5 font-bold">
                      Agent Recommendation Reasoning
                    </p>
                    <ul className="space-y-2">
                      {agentStep.ranking.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-200">
                          <span className="text-[#00d2ff] font-bold mt-0.5">✓</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                    {agentStep.ranking.tradeoffs.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <p className="text-slate-400 text-xs uppercase tracking-wider mb-1.5 font-semibold">
                          Tradeoffs Evaluated
                        </p>
                        {agentStep.ranking.tradeoffs.map((t, i) => (
                          <p key={i} className="text-slate-400 text-xs flex items-center gap-2">
                            <span className="text-amber-400">•</span> {t}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-5 border-t border-white/10">
                  <button
                    id="confirm-pay-btn"
                    onClick={handleConfirmPurchase}
                    disabled={phase === 'creating_order'}
                    className="btn-primary flex-1 py-3.5 px-6 text-base font-bold rounded-xl justify-center shadow-[0_0_25px_rgba(12,131,255,0.35)] cursor-pointer disabled:opacity-50"
                  >
                    {phase === 'creating_order' ? (
                      <span className="flex items-center gap-2">
                        <span className="spinner w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating Razorpay Secure Order…
                      </span>
                    ) : (
                      `🔒 Confirm & Pay ₹${agentStep.selectedProduct.priceInr.toLocaleString('en-IN')}`
                    )}
                  </button>
                  <button
                    onClick={handleReset}
                    className="btn-secondary py-3.5 px-6 text-sm font-semibold rounded-xl text-slate-300 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* CHECKOUT / GATEWAY DISPATCH */}
            {phase === 'checkout' && checkoutConfig && (
              <div className="card p-6 rounded-2xl border border-[#00d2ff]/30 bg-[#0b1528]/90 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[#00d2ff] text-xs uppercase tracking-widest font-bold">Secure Gateway Dispatch</p>
                  <span className="badge badge-amber text-[11px] font-semibold">TEST TRANSACTION</span>
                </div>
                <div className="bg-black/50 p-5 rounded-xl border border-white/10 space-y-4">
                  <div className="p-3.5 rounded-lg bg-black/60 font-mono text-xs text-slate-300 space-y-1.5 border border-white/5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Order ID:</span>
                      <span className="text-white font-semibold">{orderId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Razorpay Order:</span>
                      <span className="text-[#00d2ff] font-semibold">{(checkoutConfig as any).razorpayOrderId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Amount:</span>
                      <span className="text-emerald-400 font-semibold">
                        ₹{(((checkoutConfig as any).amount || 0) / 100).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                    Razorpay gateway modal is active. You can authorize via the Razorpay test modal or click the simulation button below.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => openRazorpayCheckout(checkoutConfig, sessionId!, setPhase, setAuditTrail)}
                      className="btn-primary py-2.5 px-5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(12,131,255,0.3)]"
                    >
                      <span>💳 Launch Razorpay Modal</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/payments/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-Agent-Role': 'BUYER_AGENT' },
                            body: JSON.stringify({
                              razorpay_payment_id: `pay_demo_${Date.now()}`,
                              razorpay_order_id: (checkoutConfig as any).razorpayOrderId,
                              razorpay_signature: 'demo_signature',
                              sessionId,
                            }),
                          });
                          const verifyData = await res.json();
                          if (res.ok && verifyData.success) {
                            setPhase('complete');
                            await loadAuditTrail();
                          } else {
                            alert(verifyData.message || 'Payment simulation failed.');
                          }
                        } catch (err: any) {
                          alert(err.message || 'Payment simulation failed.');
                        }
                      }}
                      className="btn-secondary py-2.5 px-5 text-xs font-semibold rounded-xl text-emerald-400 hover:text-emerald-300 border-emerald-500/30 hover:bg-emerald-950/20 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>✓ Authorize (Simulated Test Mode)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* COMPLETE / AUDIT TRAIL */}
            {phase === 'complete' && (
              <div className="animate-fade-in space-y-6">
                <div className="card p-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 shadow-[0_0_35px_rgba(16,185,129,0.2)]">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-2xl text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                      ✓
                    </div>
                    <div>
                      <p className="font-heading font-extrabold text-2xl text-white">Order Successfully Placed!</p>
                      <p className="text-emerald-300 text-xs mt-0.5">
                        Cryptographic signature verified · Order ID: <span className="font-mono">{orderId}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Audit Trail */}
                {auditTrail.length > 0 && (
                  <div className="card p-6 rounded-2xl border border-[#0c83ff]/20 bg-[#0b1528]/85 backdrop-blur-xl">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[#38bdf8] text-xs uppercase tracking-widest font-bold">
                        Deterministic Agentic Audit Log
                      </p>
                      <span className="badge badge-blue text-[11px]">Tamper-Proof Telemetry</span>
                    </div>
                    <div className="space-y-2">
                      {auditTrail.map((event) => (
                        <div key={event.id} className="timeline-item">
                          <div
                            className={`timeline-dot ${
                              event.status === 'SUCCESS' ? 'timeline-dot-success' : 'timeline-dot-error'
                            }`}
                          >
                            {event.status === 'SUCCESS' ? '✓' : '✗'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <button
                              className="text-left w-full group cursor-pointer"
                              onClick={() => setExpandedAudit(expandedAudit === event.id ? null : event.id)}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-white font-medium capitalize group-hover:text-[#38bdf8] transition-colors">
                                  {event.eventType.toLowerCase().replace(/_/g, ' ')}
                                </p>
                                <span className="text-slate-500 font-mono text-xs">
                                  {new Date(event.createdAt).toLocaleTimeString()}
                                </span>
                              </div>
                            </button>
                            {expandedAudit === event.id && event.output && (
                              <div className="mt-2 p-3 rounded-xl bg-black/60 border border-white/5 text-xs font-mono text-slate-300 overflow-auto max-h-40">
                                {JSON.stringify(event.output, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleReset}
                  className="btn-primary w-full py-3.5 text-base font-bold rounded-xl justify-center cursor-pointer shadow-[0_0_25px_rgba(12,131,255,0.3)]"
                >
                  Start New AI Query
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RAZORPAY CHECKOUT ────────────────────────────────────────────────────────

async function openRazorpayCheckout(
  config: Record<string, unknown>,
  sessionId: string,
  setPhase: (p: BuyerPhase) => void,
  setAuditTrail: (events: AuditEvent[]) => void
) {
  return new Promise<void>((resolve) => {
    const launchModal = () => {
      try {
        const RazorpayClass = (window as any).Razorpay;
        if (!RazorpayClass) {
          console.warn('Razorpay SDK not found on window, fallback to checkout view.');
          resolve();
          return;
        }

        const rzp = new RazorpayClass({
          key: config.keyId,
          order_id: config.razorpayOrderId,
          amount: config.amount,
          currency: config.currency,
          name: config.name,
          description: config.description,
          theme: config.theme,
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const verifyRes = await fetch('/api/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Agent-Role': 'BUYER_AGENT' },
                body: JSON.stringify({
                  ...response,
                  sessionId,
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyRes.ok && verifyData.success) {
                setPhase('complete');
                const sessionRes = await fetch(`/api/buyer/sessions/${sessionId}/message`, {
                  headers: { 'X-Agent-Role': 'BUYER_AGENT' },
                });
                const sessionData = await sessionRes.json();
                setAuditTrail(sessionData.auditTrail || []);
              } else {
                setPhase('error');
              }
            } catch {
              setPhase('error');
            }
            resolve();
          },
          modal: {
            ondismiss: () => {
              // Stay on checkout screen if dismissed so user can retry or simulate
              resolve();
            },
          },
        });
        rzp.open();
      } catch (err) {
        console.error('Failed to open Razorpay modal:', err);
        resolve();
      }
    };

    if ((window as any).Razorpay) {
      launchModal();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      launchModal();
    };
    script.onerror = () => {
      console.warn('Razorpay SDK script failed to load');
      resolve();
    };
    document.head.appendChild(script);
  });
}
