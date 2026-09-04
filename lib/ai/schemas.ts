import { z } from 'zod';

// ─── INTENT SCHEMA ────────────────────────────────────────────────────────────

export const HardRequirementSchema = z.object({
  attribute: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  operator: z.enum(['eq', 'gte', 'lte', 'contains']).optional().default('eq'),
});

export const SoftPreferenceSchema = z.object({
  attribute: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  weight: z.number().min(0).max(1).optional().default(0.5),
});

export const BudgetSchema = z.object({
  max: z.number().nullable(),
  min: z.number().nullable(),
  currency: z.literal('INR'),
});

export const ParsedIntentSchema = z.object({
  rawQuery: z.string(),
  category: z.string().nullable(),
  budget: BudgetSchema,
  destination: z.string().nullable(),
  deliveryDeadline: z.string().nullable(), // ISO date string
  hardRequirements: z.array(HardRequirementSchema),
  softPreferences: z.array(SoftPreferenceSchema),
  clarificationNeeded: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

// ─── RANKING SCHEMA ────────────────────────────────────────────────────────────

export const RankingOutputSchema = z.object({
  selectedProductId: z.string(),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).min(1).max(10),
  tradeoffs: z.array(z.string()).max(5),
  explanation: z.string().min(10).max(500),
});

export type RankingOutput = z.infer<typeof RankingOutputSchema>;

// ─── MERCHANT AUDIT SCHEMA ────────────────────────────────────────────────────

export const CatalogIssueProposalSchema = z.object({
  type: z.string(),
  title: z.string(),
  evidence: z.string(),
  problem: z.string(),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  proposedFix: z.record(z.unknown()).optional(),
  impact: z.string().optional(),
});

export const MerchantAuditOutputSchema = z.object({
  summary: z.string(),
  issues: z.array(CatalogIssueProposalSchema),
  scoreEstimate: z.number().min(0).max(100),
  topOpportunity: z.string().optional(),
});

export type MerchantAuditOutput = z.infer<typeof MerchantAuditOutputSchema>;

// ─── REQUEST VALIDATION SCHEMAS ───────────────────────────────────────────────

export const CreateSessionRequestSchema = z.object({
  merchantId: z.string().optional(),
  userAgent: z.string().optional(),
});

export const SendMessageRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  approvalGiven: z.boolean().optional(),
});

export const CreateOrderRequestSchema = z.object({
  sessionId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().optional(),
});

export const VerifyPaymentRequestSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  sessionId: z.string().min(1),
});

// ─── POLICY SCHEMA ────────────────────────────────────────────────────────────

export const PolicyResultSchema = z.object({
  allowed: z.boolean(),
  checks: z.object({
    approval: z.boolean(),
    amount: z.boolean(),
    inventory: z.boolean(),
    product: z.boolean(),
    merchant: z.boolean(),
    category: z.boolean(),
  }),
  failures: z.array(z.string()),
  blockedReason: z.string().optional(),
});

export type PolicyResult = z.infer<typeof PolicyResultSchema>;
