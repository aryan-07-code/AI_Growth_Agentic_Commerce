import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyWebhookSignature, parseWebhookEvent } from '@/lib/razorpay/webhooks';
import { logEvent } from '@/lib/audit/events';
import { OrderState, PaymentState, AgentState, EventType } from '@/types/agent';

// IMPORTANT: Disable Next.js body parsing to get raw body for signature verification
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  // ─── 1. VERIFY WEBHOOK SIGNATURE ─────────────────────────────────────────
  const signature = request.headers.get('x-razorpay-signature') || '';

  if (process.env.RAZORPAY_WEBHOOK_SECRET) {
    try {
      const valid = verifyWebhookSignature(rawBody, signature);
      if (!valid) {
        console.error('[webhook] Invalid signature');
        await logEvent({
          agent: 'buyer_agent',
          eventType: EventType.WEBHOOK_RECEIVED,
          status: 'FAILURE',
          errorCode: 'WEBHOOK_SIGNATURE_INVALID',
          errorMsg: 'Webhook signature verification failed',
        });
        return NextResponse.json(
          { error: 'WEBHOOK_SIGNATURE_INVALID' },
          { status: 403 }
        );
      }
    } catch (signatureError: any) {
      console.error('[webhook] Signature verification error:', signatureError.message);
      return NextResponse.json({ error: 'WEBHOOK_ERROR' }, { status: 500 });
    }
  } else {
    // Demo mode: no webhook secret configured
    console.warn('[webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping signature verification (demo mode)');
  }

  // ─── 2. PARSE EVENT ───────────────────────────────────────────────────────
  let event: ReturnType<typeof parseWebhookEvent>;
  try {
    event = parseWebhookEvent(rawBody);
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const eventType = event.event;
  const paymentEntity = event.payload?.payment?.entity;

  console.log(`[webhook] Received: ${eventType}`);

  await logEvent({
    agent: 'buyer_agent',
    eventType: EventType.WEBHOOK_RECEIVED,
    status: 'SUCCESS',
    input: { eventType, paymentId: paymentEntity?.id },
  });

  // ─── 3. ROUTE BY EVENT TYPE ───────────────────────────────────────────────
  switch (eventType) {
    case 'payment.captured':
      await handlePaymentCaptured(paymentEntity);
      break;

    case 'payment.failed':
      await handlePaymentFailed(paymentEntity);
      break;

    default:
      console.log(`[webhook] Unhandled event type: ${eventType}`);
  }

  // Always return 200 quickly — webhook processing should not be slow
  return NextResponse.json({ received: true });
}

/**
 * Handle payment.captured event.
 * This is the authoritative confirmation that payment succeeded.
 */
async function handlePaymentCaptured(paymentEntity: any) {
  if (!paymentEntity?.id || !paymentEntity?.order_id) {
    console.error('[webhook] payment.captured missing payment entity');
    return;
  }

  const razorpayPaymentId = paymentEntity.id;
  const razorpayOrderId = paymentEntity.order_id;

  // Find local order by Razorpay order ID
  const order = await prisma.order.findFirst({
    where: { razorpayOrderId },
    include: { payment: true, session: true },
  });

  if (!order) {
    console.error(`[webhook] No order found for Razorpay order: ${razorpayOrderId}`);
    return;
  }

  // ─── IDEMPOTENCY CHECK ────────────────────────────────────────────────────
  // Check if we already processed this event
  const existingProcessed = order.payment?.webhookProcessedAt;
  if (existingProcessed && order.payment?.status === PaymentState.CAPTURED) {
    console.log(`[webhook] Already processed payment.captured for order: ${order.id}`);
    return;
  }

  const now = new Date();

  // Update payment record
  if (order.payment) {
    await prisma.payment.update({
      where: { orderId: order.id },
      data: {
        razorpayPaymentId,
        status: PaymentState.CAPTURED,
        verified: true,
        capturedAt: now,
        webhookEventId: paymentEntity.id,
        webhookProcessedAt: now,
        method: paymentEntity.method || null,
        fee: paymentEntity.fee,
        tax: paymentEntity.tax,
      },
    });
  }

  // Update order status
  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderState.PAID },
  });

  // Update session state
  if (order.sessionId) {
    await prisma.buyerSession.update({
      where: { id: order.sessionId },
      data: { state: AgentState.COMPLETE },
    });
  }

  await logEvent({
    sessionId: order.sessionId || undefined,
    agent: 'buyer_agent',
    eventType: EventType.PAYMENT_CAPTURED,
    status: 'SUCCESS',
    input: { razorpayPaymentId, razorpayOrderId },
    output: {
      orderId: order.id,
      amountPaise: order.amountPaise,
      method: paymentEntity.method,
    },
  });

  console.log(`[webhook] Payment captured for order ${order.id}: ₹${order.amountInr}`);
}

/**
 * Handle payment.failed event.
 */
async function handlePaymentFailed(paymentEntity: any) {
  if (!paymentEntity?.order_id) {
    console.error('[webhook] payment.failed missing order_id');
    return;
  }

  const razorpayOrderId = paymentEntity.order_id;

  const order = await prisma.order.findFirst({
    where: { razorpayOrderId },
    include: { payment: true },
  });

  if (!order) {
    console.error(`[webhook] No order for failed payment: ${razorpayOrderId}`);
    return;
  }

  // Idempotency
  if (order.payment?.webhookProcessedAt && order.payment?.status === PaymentState.FAILED) {
    return;
  }

  const now = new Date();

  if (order.payment) {
    await prisma.payment.update({
      where: { orderId: order.id },
      data: {
        status: PaymentState.FAILED,
        webhookEventId: paymentEntity.id,
        webhookProcessedAt: now,
        errorCode: paymentEntity.error_code || null,
        errorDescription: paymentEntity.error_description || null,
      },
    });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderState.FAILED },
  });

  if (order.sessionId) {
    await prisma.buyerSession.update({
      where: { id: order.sessionId },
      data: { state: AgentState.PAYMENT_FAILED },
    });
  }

  await logEvent({
    sessionId: order.sessionId || undefined,
    agent: 'buyer_agent',
    eventType: EventType.PAYMENT_FAILED,
    status: 'FAILURE',
    input: { razorpayOrderId, paymentId: paymentEntity.id },
    errorCode: paymentEntity.error_code,
    errorMsg: paymentEntity.error_description,
  });

  console.log(`[webhook] Payment failed for order ${order.id}: ${paymentEntity.error_description}`);
}
