// Product attributes - factual, never AI-modified
export interface ProductAttributes {
  // Physical
  capacity_litres?: number;
  weight_grams?: number;
  dimensions_cm?: { length: number; width: number; height: number };
  material?: string;
  color?: string[];

  // Tech
  waterproof?: boolean;
  water_resistant?: boolean;
  laptop_size_inches?: number;
  battery_mah?: number;
  storage_gb?: number;
  ram_gb?: number;

  // Footwear
  sole_material?: string;
  closure_type?: string;

  // Use cases
  use_cases?: string[];

  // Arbitrary extra
  [key: string]: unknown;
}

// AI-generated metadata — never used to override factual attributes
export interface AIProductMetadata {
  searchTerms: string[];
  semanticSummary: string;
  buyerIntents: string[];
}

// Delivery rule for a merchant product
export interface DeliveryRule {
  destination: string; // city or region name
  minDays: number;
  maxDays: number;
  shippingFee: number; // in INR
  available: boolean;
}

// Full product with computed fields
export interface ProductWithDetails {
  id: string;
  merchantId: string;
  merchantName: string;
  sku: string;
  title: string;
  description: string;
  category: string;
  priceInr: number;
  inventory: number;
  warrantyMonths: number | null;
  returnDays: number | null;
  attributes: ProductAttributes;
  aiMetadata: AIProductMetadata | null;
  deliveryRules: DeliveryRule[];
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Constraint check result for a single product
export interface ConstraintCheck {
  productId: string;
  eligible: boolean;
  checks: {
    price: boolean;
    availability: boolean;
    waterproof?: boolean;
    laptopSize?: boolean;
    delivery?: boolean;
    [key: string]: boolean | undefined;
  };
  failures: string[];
  deliveryEstimate?: {
    eligible: boolean;
    estimatedDelivery: string; // ISO date
    shippingFee: number;
    minDays: number;
    maxDays: number;
  };
}

// Result of search + constraint pipeline
export interface SearchResult {
  query: string;
  totalFound: number;
  candidates: ProductWithDetails[];
  eligible: ProductWithDetails[];
  constraintResults: ConstraintCheck[];
}

// Purchase policy evaluation result
export interface PolicyResult {
  allowed: boolean;
  checks: {
    approval: boolean;
    amount: boolean;
    inventory: boolean;
    product: boolean;
    merchant: boolean;
    category: boolean;
  };
  failures: string[];
  blockedReason?: string;
}

// AI Commerce Score factors
export interface CommerceScoreFactors {
  structuredAttributes: number; // 0-20
  deliveryClarity: number;      // 0-20
  inventoryClarity: number;     // 0-10
  variantClarity: number;       // 0-10
  returnPolicyClarity: number;  // 0-10
  warrantyClarity: number;      // 0-10
  aiReadableDescription: number; // 0-10
  catalogCompleteness: number;  // 0-10
}

export interface CommerceScore {
  total: number; // 0-100
  factors: CommerceScoreFactors;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

// Catalog issue severity
export type IssueSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

// Merchant simulation result
export interface SimulationResult {
  merchantId: string;
  catalogVersion: 'current' | 'optimized';
  buyerIntentsRun: number;
  discoveryRate: number;       // 0-1
  constraintMatchRate: number; // 0-1
  selectionRate: number;       // 0-1
  checkoutReadiness: number;   // 0-1
  estimatedConversion: number; // 0-1
  details: SimulationDetail[];
}

export interface SimulationDetail {
  intent: string;
  discovered: boolean;
  passedConstraints: boolean;
  selectedProductId?: string;
  failureReason?: string;
}
