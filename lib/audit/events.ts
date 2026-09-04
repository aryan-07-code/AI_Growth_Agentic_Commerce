import prisma from '@/lib/db';
import { EventType } from '@/types/agent';

interface AuditEventInput {
  sessionId?: string;
  merchantId?: string;
  agent: 'buyer_agent' | 'merchant_agent';
  eventType: string;
  status: 'SUCCESS' | 'FAILURE' | 'BLOCKED' | 'SKIPPED';
  input?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMsg?: string;
  durationMs?: number;
}

/**
 * Log a structured audit event to the database.
 * Every consequential action in the system should call this.
 */
export async function logEvent(event: AuditEventInput): Promise<void> {
  try {
    await prisma.agentEvent.create({
      data: {
        sessionId: event.sessionId,
        merchantId: event.merchantId,
        agent: event.agent,
        eventType: event.eventType,
        status: event.status,
        input: event.input as any,
        decision: event.decision as any,
        output: event.output as any,
        errorCode: event.errorCode,
        errorMsg: event.errorMsg,
        durationMs: event.durationMs,
      },
    });
  } catch (error) {
    // Never let audit logging failures break the main flow
    console.error('[audit] Failed to log event:', event.eventType, error);
  }
}

/**
 * Get the audit trail for a session, ordered by time.
 */
export async function getSessionAuditTrail(sessionId: string) {
  return prisma.agentEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Get merchant audit events.
 */
export async function getMerchantAuditEvents(merchantId: string, limit = 50) {
  return prisma.agentEvent.findMany({
    where: { merchantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export { EventType };
