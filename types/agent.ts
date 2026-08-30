// Agent state machine states
export const AgentState = {
  NEW: 'NEW',
  UNDERSTAND_INTENT: 'UNDERSTAND_INTENT',
  SEARCH: 'SEARCH',
  FILTER: 'FILTER',
  RANK: 'RANK',
  EXPLAIN: 'EXPLAIN',
  AWAIT_APPROVAL: 'AWAIT_APPROVAL',
  VALIDATE_PURCHASE: 'VALIDATE_PURCHASE',
  CREATE_ORDER: 'CREATE_ORDER',
  CHECKOUT: 'CHECKOUT',
  VERIFY_PAYMENT: 'VERIFY_PAYMENT',
  COMPLETE: 'COMPLETE',
  // Failure states
  NO_MATCH: 'NO_MATCH',
  POLICY_BLOCKED: 'POLICY_BLOCKED',
  ORDER_FAILED: 'ORDER_FAILED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
} as const;

export type AgentStateType = typeof AgentState[keyof typeof AgentState];

// Order states
export const OrderState = {
  PENDING: 'PENDING',
  CREATED: 'CREATED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;

export type OrderStateType = typeof OrderState[keyof typeof OrderState];

// Payment states
export const PaymentState = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;

export type PaymentStateType = typeof PaymentState[keyof typeof PaymentState];

// Audit event types
export const EventType = {
  INTENT_PARSED: 'INTENT_PARSED',
  PRODUCTS_SEARCHED: 'PRODUCTS_SEARCHED',
  CONSTRAINTS_EVALUATED: 'CONSTRAINTS_EVALUATED',
  PRODUCT_SELECTED: 'PRODUCT_SELECTED',
  PURCHASE_APPROVED: 'PURCHASE_APPROVED',
  POLICY_CHECKED: 'POLICY_CHECKED',
  ORDER_CREATED: 'ORDER_CREATED',
  CHECKOUT_OPENED: 'CHECKOUT_OPENED',
  PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
  PAYMENT_CAPTURED: 'PAYMENT_CAPTURED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PURCHASE_COMPLETED: 'PURCHASE_COMPLETED',
  PURCHASE_BLOCKED: 'PURCHASE_BLOCKED',
  SESSION_CREATED: 'SESSION_CREATED',
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
  CATALOG_AUDITED: 'CATALOG_AUDITED',
  FIX_PROPOSED: 'FIX_PROPOSED',
  FIX_APPLIED: 'FIX_APPLIED',
} as const;

export type EventTypeType = typeof EventType[keyof typeof EventType];

// Structured intent from natural language
export interface ParsedIntent {
  rawQuery: string;
  category: string | null;
  budget: {
    max: number | null;
    min: number | null;
    currency: 'INR';
  };
  destination: string | null;
  deliveryDeadline: string | null; // ISO date string
  hardRequirements: Array<{
    attribute: string;
    value: string | number | boolean;
    operator?: 'eq' | 'gte' | 'lte' | 'contains';
  }>;
  softPreferences: Array<{
    attribute: string;
    value: string | number | boolean;
    weight?: number;
  }>;
  clarificationNeeded: boolean;
  clarificationQuestion?: string;
}

// AI ranking output
export interface RankingOutput {
  selectedProductId: string;
  confidence: number; // 0-1
  reasons: string[];
  tradeoffs: string[];
  explanation: string;
}

// Agent message in session
export interface AgentMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Session context stored in DB
export interface SessionContext {
  intent?: ParsedIntent;
  candidates?: string[]; // product IDs
  eligibleProducts?: string[]; // after constraints
  selectedProductId?: string;
  ranking?: RankingOutput;
  approvalGiven?: boolean;
  approvalTimestamp?: string;
  orderId?: string;
  razorpayOrderId?: string;
}

// Constants
export const PURCHASE_LIMITS = {
  MAX_AMOUNT_INR: 5000,
  CURRENCY: 'INR',
} as const;

export const ALLOWED_CATEGORIES = [
  'bags',
  'backpacks',
  'apparel',
  'electronics',
  'accessories',
  'footwear',
  'fitness',
] as const;

export const BLOCKED_CATEGORIES = [
  'regulated',
  'financial',
  'restricted',
  'weapons',
  'tobacco',
  'alcohol',
] as const;
