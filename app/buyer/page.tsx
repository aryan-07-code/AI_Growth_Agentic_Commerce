'use client';

import { useState, useRef } from 'react';
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query }),
      });

      const msgData = await msgRes.json();
      setAgentStep(msgData);

      // Route based on state
      if (msgData.state === 'NO_MATCH') {
        setPhase('no_match');
      } else if (msgData.state === 'AWAIT_APPROVAL') {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'confirm', approvalGiven: true }),
      });

      // Create order
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`/api/buyer/sessions/${sessionId}/message`);
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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0a0a0a] z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#d4a853] flex items-center justify-center text-black font-bold text-sm">AR</div>
            <span className="font-semibold text-[#e8e0d0]">AgentReady</span>
          </Link>
          <span className="text-[#4a4540]">/</span>
          <span className="text-[#8a8278] text-sm">AI Buyer</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge badge-warning text-[11px]">RAZORPAY TEST MODE</span>
          <Link href="/merchant" className="btn-ghost text-xs">Merchant →</Link>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">

        {/* ─── IDLE / INPUT STATE ─────────────────────────────────────────── */}
        {(phase === 'idle' || phase === 'processing') && (
          <div className="animate-fade-in">
            <div className="mb-10 text-center">
              <h1 className="text-3xl font-bold text-[#e8e0d0] mb-3">What are you looking for?</h1>
              <p className="text-[#8a8278] text-sm">Describe exactly what you need. AI finds it, constraints confirm it.</p>
            </div>

            <form onSubmit={handleSubmit} className="mb-6">
              <div className="card p-4">
                <textarea
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Find me a waterproof backpack under ₹4,000 that reaches Bangalore by Friday.'
                  rows={3}
                  className="input-field resize-none border-0 bg-transparent p-0 text-base focus:ring-0 mb-4"
                  disabled={phase === 'processing'}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any); } }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[#4a4540] text-xs">{query.length}/2000</span>
                  <button
                    type="submit"
                    disabled={!query.trim() || phase === 'processing'}
                    className="btn-primary py-2 px-5 text-sm"
                  >
                    {phase === 'processing' ? <><span className="spinner w-4 h-4" />Processing…</> : 'Search →'}
                  </button>
                </div>
              </div>
            </form>

            {/* Demo queries */}
            <div>
              <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-3">Try these demos</p>
              <div className="flex flex-col gap-2">
                {DEMO_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuery(q)}
                    className="text-left p-3 rounded-lg border border-[#1a1a1a] hover:border-[#2a2a2a] text-[#8a8278] text-sm transition-colors hover:text-[#e8e0d0] hover:bg-[#111]"
                  >
                    <span className="text-[#4a4540] mr-2">"</span>{q}<span className="text-[#4a4540]">"</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── RESULTS STATES ─────────────────────────────────────────────── */}
        {agentStep && phase !== 'idle' && phase !== 'processing' && (
          <div className="animate-fade-in space-y-5">

            {/* Back / New search */}
            <button onClick={handleReset} className="btn-ghost text-xs flex items-center gap-1 mb-2">
              ← New Search
            </button>

            {/* Intent Chips */}
            {agentStep.intent && (
              <div className="card">
                <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-3 font-medium">I understood your request</p>
                <div className="flex flex-wrap gap-2">
                  {buildChips(agentStep.intent as any).map((chip) => (
                    <span key={chip.label} className="chip">
                      <span>{chip.icon}</span>
                      <span className="capitalize">{chip.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Search Results */}
            {agentStep.searchResult && (
              <div className="card">
                <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-3 font-medium">Product Discovery</p>
                <div className="flex items-center gap-6 mb-4">
                  <div>
                    <p className="text-2xl font-bold text-[#e8e0d0]">{agentStep.searchResult.totalFound}</p>
                    <p className="text-[#8a8278] text-xs mt-0.5">found</p>
                  </div>
                  <div className="text-[#333] text-xl">→</div>
                  <div>
                    <p className="text-2xl font-bold text-[#d4a853]">{agentStep.searchResult.eligible}</p>
                    <p className="text-[#8a8278] text-xs mt-0.5">passed constraints</p>
                  </div>
                </div>

                {/* Constraint filter breakdown */}
                {agentStep.searchResult.constraintResults && agentStep.searchResult.constraintResults.length > 0 && (
                  <div className="space-y-2">
                    {agentStep.searchResult.constraintResults.map((cr) => {
                      const product = agentStep.searchResult!.candidates.find((c) => c.id === cr.productId);
                      return (
                        <div
                          key={cr.productId}
                          className={`flex items-start justify-between p-3 rounded-lg border text-sm ${
                            cr.eligible
                              ? 'border-[rgba(52,168,83,0.2)] bg-[rgba(52,168,83,0.05)]'
                              : 'border-[rgba(229,62,62,0.15)] bg-[rgba(229,62,62,0.04)]'
                          }`}
                        >
                          <div>
                            <p className="font-medium text-[#e8e0d0]">{product?.title || cr.productId}</p>
                            {cr.eligible ? (
                              <p className="text-[#34a853] text-xs mt-0.5">✓ All constraints passed</p>
                            ) : (
                              <div className="text-[#f56565] text-xs mt-0.5 space-y-0.5">
                                {cr.failures.map((f, i) => <p key={i}>✗ {f}</p>)}
                              </div>
                            )}
                          </div>
                          <span className={`badge text-xs ${cr.eligible ? 'badge-success' : 'badge-error'}`}>
                            {cr.eligible ? 'PASS' : 'FAIL'}
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
              <div className="card border-[rgba(229,62,62,0.2)]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-[rgba(229,62,62,0.15)] flex items-center justify-center text-lg">
                    ✗
                  </div>
                  <div>
                    <p className="font-semibold text-[#e8e0d0]">No eligible product found</p>
                    <p className="text-[#8a8278] text-xs">All candidates failed constraint validation</p>
                  </div>
                </div>
                <div className="bg-[#111] rounded-lg p-4 text-sm text-[#8a8278] leading-relaxed whitespace-pre-wrap">
                  {agentStep.agentMessage}
                </div>
                <button onClick={handleReset} className="btn-secondary mt-4 text-sm">
                  Try Different Requirements
                </button>
              </div>
            )}

            {/* POLICY BLOCKED */}
            {phase === 'policy_blocked' && (
              <div className="card border-[rgba(229,62,62,0.2)]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-[rgba(229,62,62,0.15)] flex items-center justify-center text-xl">
                    🛡️
                  </div>
                  <div>
                    <p className="font-semibold text-[#e8e0d0]">Purchase Blocked</p>
                    <p className="text-[#8a8278] text-xs">Purchase policy check failed</p>
                  </div>
                </div>
                <p className="text-[#f56565] text-sm mb-2">{agentStep.error}</p>
                <p className="text-[#8a8278] text-xs">
                  This demonstrates bounded autonomy — the AI cannot override spending limits or purchase policies.
                </p>
                <button onClick={handleReset} className="btn-secondary mt-4 text-sm">
                  New Search
                </button>
              </div>
            )}

            {/* RECOMMENDATION */}
            {agentStep.selectedProduct && (phase === 'await_approval' || phase === 'creating_order' || phase === 'checkout') && (
              <div className="card border-[rgba(212,168,83,0.2)]">
                <div className="flex items-center gap-2 mb-4">
                  <span className="badge badge-gold">BEST MATCH</span>
                  <span className="text-[#8a8278] text-xs">AI selected · {Math.round((agentStep.ranking?.confidence || 0) * 100)}% confidence</span>
                </div>

                <div className="flex gap-4 mb-4">
                  {/* Product image placeholder */}
                  <div className="w-20 h-20 rounded-lg bg-[#161616] flex items-center justify-center text-3xl flex-shrink-0">
                    🎒
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-[#e8e0d0] text-lg leading-tight mb-1">
                      {agentStep.selectedProduct.title}
                    </h2>
                    <p className="text-[#8a8278] text-sm mb-2">{agentStep.selectedProduct.merchantName}</p>
                    <p className="text-[#d4a853] text-2xl font-bold">
                      ₹{agentStep.selectedProduct.priceInr.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>

                {/* Product attributes */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {agentStep.selectedProduct.warrantyMonths && (
                    <span className="badge badge-neutral">{agentStep.selectedProduct.warrantyMonths}M warranty</span>
                  )}
                  {agentStep.selectedProduct.returnDays && (
                    <span className="badge badge-neutral">{agentStep.selectedProduct.returnDays}d returns</span>
                  )}
                  {(agentStep.selectedProduct.attributes as any)?.waterproof && (
                    <span className="badge badge-info">Waterproof</span>
                  )}
                  {(agentStep.selectedProduct.attributes as any)?.laptop_size_inches && (
                    <span className="badge badge-neutral">
                      {(agentStep.selectedProduct.attributes as any).laptop_size_inches}" laptop
                    </span>
                  )}
                  {(agentStep.selectedProduct.attributes as any)?.capacity_litres && (
                    <span className="badge badge-neutral">
                      {(agentStep.selectedProduct.attributes as any).capacity_litres}L
                    </span>
                  )}
                </div>

                {/* Delivery estimate from constraint result */}
                {agentStep.constraintResults && (() => {
                  const cr = agentStep.constraintResults?.find(
                    (r) => r.productId === agentStep.selectedProduct!.id
                  );
                  const delivery = cr?.deliveryEstimate;
                  if (!delivery?.eligible) return null;
                  return (
                    <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-[rgba(52,168,83,0.08)] border border-[rgba(52,168,83,0.15)]">
                      <span className="text-[#34a853]">📦</span>
                      <span className="text-[#34a853] text-sm font-medium">
                        Estimated delivery {delivery.estimatedDelivery} ({delivery.minDays}–{delivery.maxDays} business days)
                      </span>
                    </div>
                  );
                })()}

                {/* Why this one */}
                {agentStep.ranking && (
                  <div className="mb-5">
                    <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-2 font-medium">Why this one?</p>
                    <ul className="space-y-1.5">
                      {agentStep.ranking.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[#e8e0d0]">
                          <span className="text-[#d4a853] mt-0.5 flex-shrink-0">•</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                    {agentStep.ranking.tradeoffs.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-2 font-medium">Tradeoffs considered</p>
                        {agentStep.ranking.tradeoffs.map((t, i) => (
                          <p key={i} className="text-[#8a8278] text-xs mb-1">• {t}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 pt-4 border-t border-[#1a1a1a]">
                  <button
                    id="confirm-pay-btn"
                    onClick={handleConfirmPurchase}
                    disabled={phase === 'creating_order'}
                    className="btn-primary flex-1 text-base justify-center"
                  >
                    {phase === 'creating_order' ? (
                      <><span className="spinner w-4 h-4" /> Creating order…</>
                    ) : (
                      `Confirm & Pay ₹${agentStep.selectedProduct.priceInr.toLocaleString('en-IN')}`
                    )}
                  </button>
                  <button onClick={handleReset} className="btn-secondary px-4">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* CHECKOUT / DEMO MODE */}
            {phase === 'checkout' && checkoutConfig && (
              <div className="card">
                <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-3 font-medium">Checkout</p>
                {(checkoutConfig as any).demoMode ? (
                  <div className="bg-[#111] p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="badge badge-warning">DEMO MODE</span>
                    </div>
                    <p className="text-[#8a8278] text-sm mb-2">{(checkoutConfig as any).demoMessage}</p>
                    <p className="text-[#4a4540] text-xs">Order created: {orderId}</p>
                    <p className="text-[#4a4540] text-xs">Razorpay Order: {(checkoutConfig as any).razorpayOrderId}</p>
                    <p className="text-[#4a4540] text-xs mt-2">
                      Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local to enable real checkout.
                    </p>
                    <button
                      onClick={async () => {
                        // Simulate completed payment for demo
                        const res = await fetch('/api/payments/verify', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            razorpay_payment_id: `pay_demo_${Date.now()}`,
                            razorpay_order_id: (checkoutConfig as any).razorpayOrderId,
                            razorpay_signature: 'demo_signature',
                            sessionId,
                          }),
                        });
                        if (res.ok) {
                          setPhase('complete');
                          await loadAuditTrail();
                        }
                      }}
                      className="btn-primary mt-4 text-sm"
                    >
                      Simulate Payment Success (Demo)
                    </button>
                  </div>
                ) : (
                  <p className="text-[#8a8278] text-sm">Razorpay checkout is open. Complete your payment.</p>
                )}
              </div>
            )}

            {/* COMPLETE / AUDIT TRAIL */}
            {phase === 'complete' && (
              <div className="animate-fade-in">
                <div className="card border-[rgba(52,168,83,0.2)] mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[rgba(52,168,83,0.15)] flex items-center justify-center text-xl">
                      ✓
                    </div>
                    <div>
                      <p className="font-semibold text-[#34a853]">Order Complete</p>
                      <p className="text-[#8a8278] text-xs">Payment verified · Order {orderId?.slice(0, 12)}…</p>
                    </div>
                  </div>
                </div>

                {/* Audit Trail */}
                {auditTrail.length > 0 && (
                  <div className="card">
                    <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-4 font-medium">Audit Trail</p>
                    <div className="space-y-1">
                      {auditTrail.map((event) => (
                        <div key={event.id} className="timeline-item">
                          <div className={`timeline-dot ${event.status === 'SUCCESS' ? 'timeline-dot-success' : 'timeline-dot-error'}`}>
                            {event.status === 'SUCCESS' ? '✓' : '✗'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <button
                              className="text-left w-full group"
                              onClick={() => setExpandedAudit(expandedAudit === event.id ? null : event.id)}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-[#e8e0d0] font-medium capitalize">
                                  {event.eventType.toLowerCase().replace(/_/g, ' ')}
                                </p>
                                <span className="text-[#4a4540] text-xs">
                                  {new Date(event.createdAt).toLocaleTimeString()}
                                </span>
                              </div>
                            </button>
                            {expandedAudit === event.id && event.output && (
                              <div className="mt-2 p-2 rounded bg-[#111] text-xs font-mono text-[#8a8278] overflow-auto max-h-32">
                                {JSON.stringify(event.output, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={handleReset} className="btn-secondary w-full mt-4 justify-center">
                  New Search
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
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      const rzp = new (window as any).Razorpay({
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
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...response,
                sessionId,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setPhase('complete');
              // Load audit trail
              const sessionRes = await fetch(`/api/buyer/sessions/${sessionId}/message`);
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
            setPhase('await_approval');
            resolve();
          },
        },
      });
      rzp.open();
    };
    document.head.appendChild(script);
  });
}
