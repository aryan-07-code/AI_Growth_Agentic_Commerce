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
    console.error('[audit] Failed to log event:', event.eventType, error);
  }
}

export async function getSessionAuditTrail(sessionId: string) {
  return prisma.agentEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getMerchantAuditEvents(merchantId: string, limit = 50) {
  return prisma.agentEvent.findMany({
    where: { merchantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export { EventType };
