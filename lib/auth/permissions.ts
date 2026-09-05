import { NextRequest } from 'next/server';

export type AgentRole = 'BUYER_AGENT' | 'MERCHANT_AGENT';

export type PermissionScope =
  | 'product:read'
  | 'inventory:read'
  | 'pricing:read'
  | 'delivery:read'
  | 'policy:read'
  | 'checkout:create'
  | 'payment:initiate'
  | 'merchant:read'
  | 'catalog:read'
  | 'catalog:audit'
  | 'catalog:propose_changes'
  | 'catalog:apply_changes'
  | 'analytics:read'
  | 'simulation:run'
  | 'revenue:read';

const BUYER_AGENT_SCOPES: Set<PermissionScope> = new Set([
  'product:read',
  'inventory:read',
  'pricing:read',
  'delivery:read',
  'policy:read',
  'checkout:create',
  'payment:initiate',
]);

const MERCHANT_AGENT_SCOPES: Set<PermissionScope> = new Set([
  'merchant:read',
  'catalog:read',
  'catalog:audit',
  'catalog:propose_changes',
  'catalog:apply_changes',
  'analytics:read',
  'simulation:run',
  'revenue:read',
]);

export interface AuthContext {
  role: AgentRole;
  merchantId?: string;
}

export function getAuthContext(req: NextRequest): AuthContext | null {
  const roleHeader = req.headers.get('X-Agent-Role');
  const merchantIdHeader = req.headers.get('X-Merchant-Id');

  if (roleHeader === 'BUYER_AGENT') {
    return { role: 'BUYER_AGENT' };
  }

  if (roleHeader === 'MERCHANT_AGENT') {
    return {
      role: 'MERCHANT_AGENT',
      merchantId: merchantIdHeader || undefined
    };
  }

  return null;
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export function requirePermission(req: NextRequest, requiredScope: PermissionScope, targetMerchantId?: string): void {
  const context = getAuthContext(req);

  if (!context) {
    throw new PermissionError('Authentication required. Missing or invalid X-Agent-Role header.');
  }

  const hasScope = context.role === 'BUYER_AGENT'
    ? BUYER_AGENT_SCOPES.has(requiredScope)
    : MERCHANT_AGENT_SCOPES.has(requiredScope);

  if (!hasScope) {
    throw new PermissionError(`Role ${context.role} does not have the required scope: ${requiredScope}`);
  }

  if (context.role === 'MERCHANT_AGENT' && targetMerchantId) {
    if (context.merchantId !== targetMerchantId) {
      throw new PermissionError(`Merchant Agent is not authorized to access data for merchant: ${targetMerchantId}`);
    }
  }
}
