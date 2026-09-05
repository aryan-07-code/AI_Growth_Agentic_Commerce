import { NextRequest } from 'next/server';

export type AgentRole = 'BUYER_AGENT' | 'MERCHANT_AGENT';

export type PermissionScope = 
  // Buyer Scopes
  | 'product:read'
  | 'inventory:read'
  | 'pricing:read'
  | 'delivery:read'
  | 'policy:read'
  | 'checkout:create'
  | 'payment:initiate'
  // Merchant Scopes
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
  merchantId?: string; // Only present/valid for MERCHANT_AGENT
}

/**
 * Parses the authentication context from the request headers.
 * In a real application, this would verify a JWT or session token.
 * For this demo, we simulate it via headers to demonstrate the boundary.
 */
export function getAuthContext(req: NextRequest): AuthContext | null {
  const roleHeader = req.headers.get('X-Agent-Role');
  const merchantIdHeader = req.headers.get('X-Merchant-Id');

  if (roleHeader === 'BUYER_AGENT') {
    return { role: 'BUYER_AGENT' }; // Buyers don't have a merchantId context
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

/**
 * Enforces server-side permissions for the given request.
 * Throws a PermissionError if access is denied.
 * 
 * @param req The incoming NextRequest
 * @param requiredScope The specific permission scope required
 * @param targetMerchantId (Optional) If enforcing a merchant scope, ensure the actor has access to THIS merchant.
 */
export function requirePermission(req: NextRequest, requiredScope: PermissionScope, targetMerchantId?: string): void {
  const context = getAuthContext(req);

  if (!context) {
    throw new PermissionError('Authentication required. Missing or invalid X-Agent-Role header.');
  }

  // 1. Check if the actor's role has the required scope
  const hasScope = context.role === 'BUYER_AGENT' 
    ? BUYER_AGENT_SCOPES.has(requiredScope)
    : MERCHANT_AGENT_SCOPES.has(requiredScope);

  if (!hasScope) {
    throw new PermissionError(`Role ${context.role} does not have the required scope: ${requiredScope}`);
  }

  // 2. Cross-merchant boundary check
  // If the actor is a Merchant Agent and they are trying to access a specific merchant's data,
  // we must ensure they are authenticated AS that merchant.
  if (context.role === 'MERCHANT_AGENT' && targetMerchantId) {
    if (context.merchantId !== targetMerchantId) {
      throw new PermissionError(`Merchant Agent is not authorized to access data for merchant: ${targetMerchantId}`);
    }
  }
}
