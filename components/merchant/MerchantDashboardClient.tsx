'use client';

import { useState } from 'react';

interface CommerceScoreFactors {
  structuredAttributes: number;
  deliveryClarity: number;
  inventoryClarity: number;
  variantClarity: number;
  returnPolicyClarity: number;
  warrantyClarity: number;
  aiReadableDescription: number;
  catalogCompleteness: number;
}

interface CommerceScore {
  total: number;
  factors: CommerceScoreFactors;
  grade: string;
}

interface CatalogIssue {
  id: string;
  severity: string;
  type: string;
  title: string;
  evidence: string;
  problem: string;
  proposedFix?: Record<string, unknown>;
  impact?: string;
  status: string;
}

interface SimulationResult {
  discoveryRate: number;
  constraintMatchRate: number;
  checkoutReadiness: number;
  estimatedConversion: number;
  buyerIntentsRun: number;
}

interface MerchantData {
  merchant: { id: string; name: string; productCount: number };
  aiCommerceScore: CommerceScore;
  realRevenue: number;
  funnel: {
    intents: number;
    discoveryMatch: number;
    constraintMatch: number;
    checkoutReadiness: number;
    purchased: number;
  };
  aiBuyerFailures: Array<{ reason: string; count: number }>;
  issueSummary: { high: number; medium: number; low: number; total: number };
  openIssues: CatalogIssue[];
  recentOrders: Array<{ id: string; amountInr: number; createdAt: string }>;
}

interface Props {
  initialData: MerchantData;
  merchantId: string;
}

const FACTOR_LABELS: Record<keyof CommerceScoreFactors, string> = {
  structuredAttributes: 'Structured Attributes',
  deliveryClarity: 'Delivery Clarity',
  inventoryClarity: 'Inventory',
  variantClarity: 'Variants',
  returnPolicyClarity: 'Return Policy',
  warrantyClarity: 'Warranty',
  aiReadableDescription: 'AI Descriptions',
  catalogCompleteness: 'Completeness',
};

const FACTOR_MAX: Record<keyof CommerceScoreFactors, number> = {
  structuredAttributes: 20,
  deliveryClarity: 20,
  inventoryClarity: 10,
  variantClarity: 10,
  returnPolicyClarity: 10,
  warrantyClarity: 10,
  aiReadableDescription: 10,
  catalogCompleteness: 10,
};

const CATEGORIES = [
  { value: 'backpacks', label: 'Backpacks' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'footwear', label: 'Footwear' },
  { value: 'apparel', label: 'Apparel' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'bags', label: 'Bags' },
];

const DESTINATIONS = ['bangalore', 'mumbai', 'delhi', 'hyderabad', 'chennai', 'pune', 'kolkata'];

interface DeliveryRule {
  destination: string;
  minDays: number;
  maxDays: number;
  fee: number;
}

interface ProductForm {
  title: string;
  sku: string;
  category: string;
  priceInr: string;
  inventory: string;
  description: string;
  warrantyMonths: string;
  returnDays: string;
  waterproof: boolean;
  deliveryRules: DeliveryRule[];
}

const defaultForm: ProductForm = {
  title: '',
  sku: '',
  category: 'backpacks',
  priceInr: '',
  inventory: '',
  description: '',
  warrantyMonths: '',
  returnDays: '',
  waterproof: false,
  deliveryRules: [],
};

export default function MerchantDashboardClient({ initialData, merchantId }: Props) {
  const [data, setData] = useState<MerchantData>(initialData);
  const [simulation, setSimulation] = useState<{
    current: SimulationResult;
    optimized: SimulationResult;
    improvement: Record<string, number>;
    isSimulated: boolean;
  } | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [applyingFix, setApplyingFix] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [form, setForm] = useState<ProductForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { aiCommerceScore, issueSummary, openIssues, realRevenue, funnel, aiBuyerFailures } = data;
  const score = aiCommerceScore.total;
  const grade = aiCommerceScore.grade;

  async function runSimulation() {
    setSimulating(true);
    try {
      const res = await fetch(`/api/merchant/${merchantId}/simulate`, {
        method: 'POST',
        headers: { 'X-Agent-Role': 'MERCHANT_AGENT', 'X-Merchant-Id': merchantId }
      });
      const simData = await res.json();
      setSimulation(simData);
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setSimulating(false);
    }
  }

  async function runAudit() {
    setAuditing(true);
    try {
      const res = await fetch(`/api/merchant/${merchantId}/audit`, {
        method: 'POST',
        headers: { 'X-Agent-Role': 'MERCHANT_AGENT', 'X-Merchant-Id': merchantId }
      });
      const auditData = await res.json();
      const merchantRes = await fetch(`/api/merchant/${merchantId}`, {
        headers: { 'X-Agent-Role': 'MERCHANT_AGENT', 'X-Merchant-Id': merchantId }
      });
      const newData = await merchantRes.json();
      setData(newData);
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setAuditing(false);
    }
  }

  async function applyFix(issueId: string) {
    if (!confirm('Apply this catalog fix? This requires your explicit approval.')) return;
    setApplyingFix(issueId);
    try {
      const res = await fetch(`/api/merchant/${merchantId}/issues/${issueId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Role': 'MERCHANT_AGENT', 'X-Merchant-Id': merchantId },
        body: JSON.stringify({ confirmed: true }),
      });
      if (res.ok) {
        const merchantRes = await fetch(`/api/merchant/${merchantId}`, {
          headers: { 'X-Agent-Role': 'MERCHANT_AGENT', 'X-Merchant-Id': merchantId }
        });
        const newData = await merchantRes.json();
        setData(newData);
      }
    } catch (err) {
      console.error('Fix application failed:', err);
    } finally {
      setApplyingFix(null);
    }
  }

  function openAddProduct() {
    setForm(defaultForm);
    setFormError(null);
    setSuccessMsg(null);
    setShowAddProduct(true);
  }

  function addDeliveryRule() {
    setForm((f) => ({
      ...f,
      deliveryRules: [
        ...f.deliveryRules,
        { destination: 'bangalore', minDays: 3, maxDays: 5, fee: 0 },
      ],
    }));
  }

  function removeDeliveryRule(idx: number) {
    setForm((f) => ({
      ...f,
      deliveryRules: f.deliveryRules.filter((_, i) => i !== idx),
    }));
  }

  function updateDeliveryRule(idx: number, field: keyof DeliveryRule, value: string | number) {
    setForm((f) => {
      const rules = [...f.deliveryRules];
      rules[idx] = { ...rules[idx], [field]: value };
      return { ...f, deliveryRules: rules };
    });
  }

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.title.trim()) return setFormError('Product title is required.');
    if (!form.sku.trim()) return setFormError('SKU is required.');
    if (!form.description.trim()) return setFormError('Description is required.');
    const price = parseFloat(form.priceInr);
    if (isNaN(price) || price <= 0) return setFormError('Price must be a positive number.');
    const inv = parseInt(form.inventory);
    if (isNaN(inv) || inv < 0) return setFormError('Inventory must be 0 or more.');

    const attributes: Record<string, unknown> = {};
    if (form.waterproof) attributes.waterproof = true;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/merchant/${merchantId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Role': 'MERCHANT_AGENT', 'X-Merchant-Id': merchantId },
        body: JSON.stringify({
          title: form.title.trim(),
          sku: form.sku.trim(),
          category: form.category,
          priceInr: Math.round(price),
          inventory: inv,
          description: form.description.trim(),
          warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths) : null,
          returnDays: form.returnDays ? parseInt(form.returnDays) : null,
          attributes,
          deliveryRules: form.deliveryRules,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFormError(json.message || json.error || 'Failed to add product.');
        return;
      }

      const merchantRes = await fetch(`/api/merchant/${merchantId}`, {
        headers: { 'X-Agent-Role': 'MERCHANT_AGENT', 'X-Merchant-Id': merchantId }
      });
      const newData = await merchantRes.json();
      setData(newData);

      setSuccessMsg(`"${form.title.trim()}" added to your catalog successfully!`);
      setForm(defaultForm);
    } catch (err) {
      setFormError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-end">
        <button
          onClick={openAddProduct}
          className="btn-primary text-sm py-2 px-5 flex items-center gap-2"
        >
          <span style={{ fontSize: '1.1em' }}>+</span> Add Product
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        <div className="card md:col-span-1">
          <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-4 font-medium">AI Commerce Score</p>
          <div className="flex items-end gap-3 mb-1">
            <span className="text-5xl font-bold text-[#d4a853]">{score}</span>
            <span className="text-[#8a8278] text-xl mb-1">/100</span>
            <span className={`badge mb-2 ${grade === 'A' ? 'badge-success' : grade === 'B' ? 'badge-info' : grade === 'C' ? 'badge-warning' : 'badge-error'}`}>
              Grade {grade}
            </span>
          </div>

          <div className="space-y-2 mt-4">
            {Object.entries(aiCommerceScore.factors).map(([key, val]) => {
              const label = FACTOR_LABELS[key as keyof CommerceScoreFactors];
              const max = FACTOR_MAX[key as keyof CommerceScoreFactors];
              const pct = Math.round((val / max) * 100);
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs text-[#8a8278] mb-1">
                    <span>{label}</span>
                    <span className="text-[#e8e0d0]">{val}/{max}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#4a4540] text-xs uppercase tracking-widest font-medium">Catalog Issues</p>
              <button
                onClick={runAudit}
                disabled={auditing}
                className="btn-ghost text-xs"
              >
                {auditing ? 'Auditing…' : 'Run AI Audit →'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'High', count: issueSummary.high, color: 'text-[#f56565]', bg: 'bg-[rgba(229,62,62,0.08)]' },
                { label: 'Medium', count: issueSummary.medium, color: 'text-[#f5a623]', bg: 'bg-[rgba(245,166,35,0.08)]' },
                { label: 'Low', count: issueSummary.low, color: 'text-[#63b3ed]', bg: 'bg-[rgba(66,153,225,0.08)]' },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-lg p-3 text-center`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-[#8a8278] text-xs mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-3 font-medium">
              Revenue from AI-Assisted Purchases
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#e8e0d0]">
                ₹{realRevenue.toLocaleString('en-IN')}
              </span>
              <span className="badge badge-success text-xs">REAL</span>
            </div>
            <p className="text-[#4a4540] text-xs mt-2">
              From verified Razorpay payments only. Not simulated.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-4 font-medium">AI Buyer Funnel</p>
          <div className="space-y-4">
            {[
              { label: 'Total AI Buyer Intents', value: funnel.intents, color: '#e8e0d0' },
              { label: 'Found Products (Discovery)', value: funnel.discoveryMatch, color: '#63b3ed' },
              { label: 'Passed Constraints (Eligible)', value: funnel.constraintMatch, color: '#f5a623' },
              { label: 'Reached Checkout', value: funnel.checkoutReadiness, color: '#f56565' },
              { label: 'Purchased', value: funnel.purchased, color: '#34a853' },
            ].map((step) => {
              const pct = funnel.intents > 0 ? Math.round((step.value / funnel.intents) * 100) : 0;
              return (
                <div key={step.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#8a8278]">{step.label}</span>
                    <span style={{ color: step.color }} className="font-bold">{step.value} <span className="text-[#4a4540] font-normal">({pct}%)</span></span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: step.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card flex flex-col">
          <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-4 font-medium">Why didn&apos;t the AI buy?</p>
          {aiBuyerFailures.length === 0 ? (
            <p className="text-[#8a8278] text-sm italic m-auto">No failure data available yet. Run a simulation or wait for buyers.</p>
          ) : (
            <div className="space-y-3">
              {aiBuyerFailures.slice(0, 5).map((f, idx) => (
                <div key={idx} className="bg-[rgba(229,62,62,0.05)] border border-[rgba(229,62,62,0.1)] rounded-lg p-3 flex justify-between items-start gap-3">
                  <div className="flex items-start gap-2">
                    <span className="text-[#f56565] mt-0.5 text-xs">🛑</span>
                    <span className="text-[#e8e0d0] text-sm leading-tight">{f.reason}</span>
                  </div>
                  <span className="badge badge-error flex-shrink-0">{f.count}</span>
                </div>
              ))}
              {aiBuyerFailures.length > 5 && (
                <p className="text-[#4a4540] text-xs mt-2 italic">+ {aiBuyerFailures.length - 5} more reasons</p>
              )}
            </div>
          )}
        </div>
      </div>

      {openIssues.length > 0 && (
        <div className="card">
          <p className="text-[#4a4540] text-xs uppercase tracking-widest mb-4 font-medium">Agent Diagnosis & Proposed Fixes</p>
          <div className="space-y-3">
            {openIssues.map((issue) => (
              <div
                key={issue.id}
                className={`border rounded-lg overflow-hidden transition-colors ${
                  issue.severity === 'HIGH'
                    ? 'border-[rgba(229,62,62,0.2)]'
                    : issue.severity === 'MEDIUM'
                    ? 'border-[rgba(245,166,35,0.2)]'
                    : 'border-[#1e1e1e]'
                }`}
              >
                <button
                  className="w-full text-left p-4 flex items-start justify-between gap-3"
                  onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`badge text-[10px] ${
                        issue.severity === 'HIGH' ? 'badge-error' :
                        issue.severity === 'MEDIUM' ? 'badge-warning' : 'badge-info'
                      }`}>
                        {issue.severity}
                      </span>
                      <span className="text-[#4a4540] text-xs font-mono">{issue.type}</span>
                    </div>
                    <p className="font-medium text-[#e8e0d0] text-sm">{issue.title}</p>
                    <p className="text-[#8a8278] text-xs mt-0.5 truncate">{issue.evidence}</p>
                  </div>
                  <span className="text-[#4a4540] flex-shrink-0">{expandedIssue === issue.id ? '▲' : '▼'}</span>
                </button>

                {expandedIssue === issue.id && (
                  <div className="border-t border-[#1a1a1a] p-4 space-y-3 bg-[#0d0d0d]">
                    <div>
                      <p className="text-[#4a4540] text-xs mb-1 font-medium">Problem</p>
                      <p className="text-[#8a8278] text-sm leading-relaxed">{issue.problem}</p>
                    </div>
                    {issue.impact && (
                      <div>
                        <p className="text-[#4a4540] text-xs mb-1 font-medium">Expected Impact</p>
                        <p className="text-[#34a853] text-sm">{issue.impact}</p>
                      </div>
                    )}
                    {issue.proposedFix && (
                      <div>
                        <p className="text-[#4a4540] text-xs mb-1 font-medium">Proposed Fix</p>
                        <pre className="bg-[#111] p-3 rounded text-xs text-[#8a8278] overflow-auto max-h-32 font-mono">
                          {JSON.stringify(issue.proposedFix, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => applyFix(issue.id)}
                        disabled={applyingFix === issue.id}
                        className="btn-primary text-xs py-2 px-4"
                      >
                        {applyingFix === issue.id ? 'Applying…' : 'Apply Fix'}
                      </button>
                      <button className="btn-ghost text-xs">Dismiss</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[#4a4540] text-xs uppercase tracking-widest font-medium">AI Buyer Simulation</p>
            <p className="text-[#8a8278] text-xs mt-1">
              Runs real buyer agent against synthetic intents. Clearly labeled as simulation.
            </p>
          </div>
          <button
            onClick={runSimulation}
            disabled={simulating}
            className="btn-primary text-sm py-2 px-4"
          >
            {simulating ? <><span className="spinner w-4 h-4" /> Running…</> : 'Run Simulation'}
          </button>
        </div>

        {simulation && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <span className="badge badge-warning text-xs">SIMULATED</span>
              <span className="text-[#4a4540] text-xs">{simulation.current.buyerIntentsRun} synthetic intents tested</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#111] rounded-xl p-4">
                <p className="text-[#8a8278] text-xs uppercase tracking-widest mb-3 font-medium">Before</p>
                {[
                  { label: 'Discovery Rate', value: simulation.current.discoveryRate },
                  { label: 'Constraint Match', value: simulation.current.constraintMatchRate },
                  { label: 'Checkout Readiness', value: simulation.current.checkoutReadiness },
                  { label: 'Est. Conversion', value: simulation.current.estimatedConversion },
                ].map((m) => (
                  <div key={m.label} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#8a8278]">{m.label}</span>
                      <span className="text-[#e8e0d0]">{Math.round(m.value * 100)}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${Math.round(m.value * 100)}%`, background: '#555' }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-[#111] rounded-xl p-4 border border-[rgba(212,168,83,0.15)]">
                <p className="text-[#d4a853] text-xs uppercase tracking-widest mb-3 font-medium">After Fixes</p>
                {[
                  { label: 'Discovery Rate', value: simulation.optimized.discoveryRate, delta: simulation.improvement.discoveryRate },
                  { label: 'Constraint Match', value: simulation.optimized.constraintMatchRate, delta: simulation.improvement.constraintMatchRate },
                  { label: 'Checkout Readiness', value: simulation.optimized.checkoutReadiness, delta: simulation.improvement.checkoutReadiness },
                  { label: 'Est. Conversion', value: simulation.optimized.estimatedConversion, delta: simulation.improvement.estimatedConversion },
                ].map((m) => (
                  <div key={m.label} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#8a8278]">{m.label}</span>
                      <span className="flex gap-1 items-center">
                        <span className="text-[#e8e0d0]">{Math.round(m.value * 100)}%</span>
                        <span className="text-[#34a853] text-[10px]">+{Math.round(m.delta * 100)}pp</span>
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${Math.round(m.value * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[#4a4540] text-xs mt-3 text-center">
              Optimized projections are estimated. Real improvement requires applying fixes and re-running simulation.
            </p>
          </div>
        )}
      </div>

      {showAddProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddProduct(false); }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
            style={{ background: '#161616', border: '1px solid #2a2a2a', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#1e1e1e]">
              <div>
                <h2 className="text-[#e8e0d0] font-semibold text-lg">Add Product to Catalog</h2>
                <p className="text-[#4a4540] text-xs mt-0.5">New products are immediately discoverable by AI buyers</p>
              </div>
              <button
                onClick={() => setShowAddProduct(false)}
                className="text-[#4a4540] hover:text-[#8a8278] text-2xl leading-none transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {successMsg && (
              <div className="mx-6 mt-4 p-3 rounded-lg text-sm text-[#34a853] bg-[rgba(52,168,83,0.08)] border border-[rgba(52,168,83,0.2)]">
                ✓ {successMsg}
              </div>
            )}

            <form onSubmit={submitProduct} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#8a8278] text-xs mb-1.5 font-medium uppercase tracking-wide">
                    Product Title <span className="text-[#f56565]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. TrailBlaze Pro 40L Backpack"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-[#e8e0d0] placeholder-[#3a3a3a] outline-none transition-colors"
                    style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[#8a8278] text-xs mb-1.5 font-medium uppercase tracking-wide">
                    SKU <span className="text-[#f56565]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="e.g. TBP-40L-BLK"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-[#e8e0d0] placeholder-[#3a3a3a] outline-none transition-colors font-mono"
                    style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[#8a8278] text-xs mb-1.5 font-medium uppercase tracking-wide">
                    Category <span className="text-[#f56565]">*</span>
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-[#e8e0d0] outline-none"
                    style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#8a8278] text-xs mb-1.5 font-medium uppercase tracking-wide">
                    Price (₹) <span className="text-[#f56565]">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.priceInr}
                    onChange={(e) => setForm((f) => ({ ...f, priceInr: e.target.value }))}
                    placeholder="3499"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-[#e8e0d0] placeholder-[#3a3a3a] outline-none"
                    style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[#8a8278] text-xs mb-1.5 font-medium uppercase tracking-wide">
                    Inventory <span className="text-[#f56565]">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.inventory}
                    onChange={(e) => setForm((f) => ({ ...f, inventory: e.target.value }))}
                    placeholder="50"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-[#e8e0d0] placeholder-[#3a3a3a] outline-none"
                    style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#8a8278] text-xs mb-1.5 font-medium uppercase tracking-wide">
                  Description <span className="text-[#f56565]">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Describe your product clearly — AI buyers use this to understand what you sell."
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-[#e8e0d0] placeholder-[#3a3a3a] outline-none resize-none"
                  style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#8a8278] text-xs mb-1.5 font-medium uppercase tracking-wide">
                    Warranty (months)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.warrantyMonths}
                    onChange={(e) => setForm((f) => ({ ...f, warrantyMonths: e.target.value }))}
                    placeholder="12"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-[#e8e0d0] placeholder-[#3a3a3a] outline-none"
                    style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}
                  />
                </div>
                <div>
                  <label className="block text-[#8a8278] text-xs mb-1.5 font-medium uppercase tracking-wide">
                    Return Window (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.returnDays}
                    onChange={(e) => setForm((f) => ({ ...f, returnDays: e.target.value }))}
                    placeholder="7"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-[#e8e0d0] placeholder-[#3a3a3a] outline-none"
                    style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#8a8278] text-xs mb-2 font-medium uppercase tracking-wide">
                  Product Attributes
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={form.waterproof}
                    onChange={(e) => setForm((f) => ({ ...f, waterproof: e.target.checked }))}
                    className="w-4 h-4 rounded accent-[#d4a853]"
                  />
                  <span className="text-[#8a8278] text-sm">Waterproof</span>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[#8a8278] text-xs font-medium uppercase tracking-wide">
                    Delivery Rules
                  </label>
                  <button
                    type="button"
                    onClick={addDeliveryRule}
                    className="text-[#d4a853] text-xs hover:text-[#e8e0d0] transition-colors"
                  >
                    + Add Destination
                  </button>
                </div>
                {form.deliveryRules.length === 0 && (
                  <p className="text-[#3a3a3a] text-xs italic">
                    No delivery rules yet. AI buyers need delivery info to match your product to time-sensitive queries.
                  </p>
                )}
                <div className="space-y-2">
                  {form.deliveryRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-5 gap-2 items-center p-3 rounded-lg"
                      style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}
                    >
                      <select
                        value={rule.destination}
                        onChange={(e) => updateDeliveryRule(idx, 'destination', e.target.value)}
                        className="col-span-2 px-2 py-1.5 rounded text-xs text-[#e8e0d0] outline-none"
                        style={{ background: '#161616', border: '1px solid #2a2a2a' }}
                      >
                        {DESTINATIONS.map((d) => (
                          <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          value={rule.minDays}
                          onChange={(e) => updateDeliveryRule(idx, 'minDays', parseInt(e.target.value) || 1)}
                          className="w-full px-2 py-1.5 rounded text-xs text-[#e8e0d0] outline-none text-center"
                          style={{ background: '#161616', border: '1px solid #2a2a2a' }}
                          title="Min days"
                        />
                        <span className="text-[#3a3a3a] text-xs">–</span>
                        <input
                          type="number"
                          min="1"
                          value={rule.maxDays}
                          onChange={(e) => updateDeliveryRule(idx, 'maxDays', parseInt(e.target.value) || 1)}
                          className="w-full px-2 py-1.5 rounded text-xs text-[#e8e0d0] outline-none text-center"
                          style={{ background: '#161616', border: '1px solid #2a2a2a' }}
                          title="Max days"
                        />
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={rule.fee}
                        onChange={(e) => updateDeliveryRule(idx, 'fee', parseInt(e.target.value) || 0)}
                        className="px-2 py-1.5 rounded text-xs text-[#e8e0d0] outline-none text-center"
                        style={{ background: '#161616', border: '1px solid #2a2a2a' }}
                        placeholder="₹fee"
                        title="Shipping fee (₹)"
                      />
                      <button
                        type="button"
                        onClick={() => removeDeliveryRule(idx)}
                        className="text-[#4a4540] hover:text-[#f56565] text-sm transition-colors text-center"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                {form.deliveryRules.length > 0 && (
                  <p className="text-[#3a3a3a] text-xs mt-1">Destination · Min–Max days · Shipping fee (₹)</p>
                )}
              </div>

              {formError && (
                <div className="p-3 rounded-lg text-sm text-[#f56565] bg-[rgba(229,62,62,0.08)] border border-[rgba(229,62,62,0.2)]">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex-1 py-2.5 text-sm"
                >
                  {submitting ? 'Adding Product…' : 'Add to Catalog'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="btn-ghost py-2.5 px-5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
