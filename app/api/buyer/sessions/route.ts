import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { CreateSessionRequestSchema } from '@/lib/ai/schemas';
import { AgentState, EventType } from '@/types/agent';
import { logEvent } from '@/lib/audit/events';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateSessionRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { merchantId, userAgent } = parsed.data;

    // Validate merchantId if provided
    if (merchantId) {
      const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
      if (!merchant || !merchant.active) {
        return NextResponse.json({ error: 'MERCHANT_NOT_FOUND' }, { status: 404 });
      }
    }

    // Create session
    const session = await prisma.buyerSession.create({
      data: {
        merchantId: merchantId || null,
        state: AgentState.NEW,
        messages: [],
        context: {},
        userAgent: userAgent || request.headers.get('user-agent') || null,
      },
    });

    await logEvent({
      sessionId: session.id,
      merchantId: merchantId || undefined,
      agent: 'buyer_agent',
      eventType: EventType.SESSION_CREATED,
      status: 'SUCCESS',
      output: { sessionId: session.id },
    });

    return NextResponse.json({
      sessionId: session.id,
      state: session.state,
      createdAt: session.createdAt,
    });
  } catch (error) {
    console.error('[sessions] Failed to create session:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
