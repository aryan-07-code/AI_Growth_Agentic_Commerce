import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { SendMessageRequestSchema } from '@/lib/ai/schemas';
import { runBuyerAgent } from '@/lib/ai/buyer-agent';
import { AgentState } from '@/types/agent';
import { requirePermission, PermissionError } from '@/lib/auth/permissions';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params;

  try {
    requirePermission(req, 'product:read');
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    throw error;
  }

  try {
    // Load session
    const session = await prisma.buyerSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });
    }

    // Prevent messages on completed/failed sessions
    const terminalStates = [AgentState.COMPLETE, AgentState.PAYMENT_FAILED];
    if (terminalStates.includes(session.state as any)) {
      return NextResponse.json(
        { error: 'SESSION_TERMINAL', state: session.state },
        { status: 409 }
      );
    }

    // Validate request body
    const body = await req.json();
    const parsed = SendMessageRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { message, approvalGiven } = parsed.data;

    // Handle approval flow immediately before running pipeline
    if (approvalGiven) {
      const context = (session.context as any) || {};
      await prisma.buyerSession.update({
        where: { id: sessionId },
        data: {
          state: AgentState.VALIDATE_PURCHASE,
          context: {
            ...context,
            approvalGiven: true,
            approvalTimestamp: new Date().toISOString(),
          },
        },
      });

      return NextResponse.json({
        state: AgentState.VALIDATE_PURCHASE,
        message: 'Approval received. Creating order...',
        approvalGranted: true,
      });
    }

    // Update session state
    await prisma.buyerSession.update({
      where: { id: sessionId },
      data: { state: AgentState.UNDERSTAND_INTENT },
    });

    // Run the buyer agent pipeline
    const result = await runBuyerAgent(sessionId, message);

    // Persist messages and context
    const messages = (session.messages as any[]) || [];
    messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    messages.push({
      role: 'agent',
      content: result.agentMessage,
      timestamp: new Date().toISOString(),
      metadata: {
        state: result.state,
        selectedProductId: result.selectedProduct?.id,
        ranking: result.ranking,
      },
    });

    const contextUpdate: Record<string, unknown> = {
      ...(session.context as Record<string, unknown>),
    };

    if (result.intent) contextUpdate.intent = result.intent;
    if (result.ranking) contextUpdate.ranking = result.ranking;
    if (result.selectedProduct) contextUpdate.selectedProductId = result.selectedProduct.id;

    await prisma.buyerSession.update({
      where: { id: sessionId },
      data: {
        state: result.state,
        messages: messages as any,
        context: contextUpdate as any,
      },
    });

    return NextResponse.json({
      state: result.state,
      agentMessage: result.agentMessage,
      intent: result.intent,
      searchResult: result.searchResult
        ? {
            totalFound: result.searchResult.totalFound,
            eligible: result.searchResult.eligible.length,
            candidates: result.searchResult.candidates.map((p) => ({
              id: p.id,
              title: p.title,
              priceInr: p.priceInr,
              category: p.category,
              merchantName: p.merchantName,
            })),
            constraintResults: result.constraintResults,
          }
        : undefined,
      selectedProduct: result.selectedProduct
        ? {
            id: result.selectedProduct.id,
            title: result.selectedProduct.title,
            priceInr: result.selectedProduct.priceInr,
            merchantName: result.selectedProduct.merchantName,
            category: result.selectedProduct.category,
            warrantyMonths: result.selectedProduct.warrantyMonths,
            returnDays: result.selectedProduct.returnDays,
            attributes: result.selectedProduct.attributes,
            images: result.selectedProduct.images,
          }
        : undefined,
      ranking: result.ranking,
      error: result.error,
      needsClarification: result.needsClarification,
    });
  } catch (error) {
    console.error('[session-message] Error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// GET session state + audit trail
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params;

  try {
    requirePermission(req, 'product:read');
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    throw error;
  }

  const session = await prisma.buyerSession.findUnique({
    where: { id: sessionId },
    include: {
      order: {
        include: { payment: true },
      },
      agentEvents: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({
    id: session.id,
    state: session.state,
    messages: session.messages,
    context: session.context,
    order: session.order,
    auditTrail: session.agentEvents,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
}
