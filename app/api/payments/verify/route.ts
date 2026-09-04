import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { VerifyPaymentRequestSchema } from '@/lib/ai/schemas';
import { verifyPaymentSignature } from '@/lib/razorpay/payments';
import { logEvent } from '@/lib/audit/events';
import { AgentState, OrderState, PaymentState, EventType } from '@/types/agent';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = VerifyPaymentRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, sessionId } = parsed.data;

    // ─── 1. LOAD ORDER FROM DATABASE (not from browser) ──────────────────────
    // SECURITY: We look up the expected Razorpay order ID from OUR database.
    // We NEVER trust the razorpay_order_id from the browser alone.
    const order = await prisma.order.findUnique({
      where: { sessionId },
      include: { payment: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
    }

    if (!order.razorpayOrderId) {
      return NextResponse.json({ error: 'ORDER_NOT_INITIALIZED' }, { status: 409 });
    }

    // Verify the razorpay_order_id from browser matches our DB record
    if (order.razorpayOrderId !== razorpay_order_id) {
      console.error('[verify] Order ID mismatch:', {
        expected: order.razorpayOrderId,
        received: razorpay_order_id,
        sessionId,
      });

      await logEvent({
        sessionId,
        agent: 'buyer_agent',
        eventType: EventType.PAYMENT_VERIFIED,
        status: 'FAILURE',
        input: { razorpay_order_id, razorpay_payment_id },
        errorCode: 'ORDER_ID_MISMATCH',
        errorMsg: 'Received order ID does not match database record',
      });

      return NextResponse.json(
        { error: 'PAYMENT_VERIFICATION_FAILED', message: 'Order ID mismatch.' },
        { status: 403 }
      );
    }

    // Check for duplicate verification
    if (order.payment?.verified) {
      return NextResponse.json({
        success: true,
        message: 'Payment already verified.',
        orderId: order.id,
        status: order.status,
        duplicate: true,
      });
    }

    // ─── 2. VERIFY SIGNATURE ──────────────────────────────────────────────────
    let signatureValid = false;

    if (process.env.RAZORPAY_KEY_SECRET) {
      signatureValid = verifyPaymentSignature(
        order.razorpayOrderId,
        razorpay_payment_id,
        razorpay_signature
      );
    } else {
      // Demo mode: skip signature verification but mark as demo
      console.warn('[verify] RAZORPAY_KEY_SECRET not set — skipping signature verification (demo mode)');
      signatureValid = true; // Demo mode only
    }

    if (!signatureValid) {
      await logEvent({
        sessionId,
        agent: 'buyer_agent',
        eventType: EventType.PAYMENT_VERIFIED,
        status: 'FAILURE',
        input: { razorpay_order_id, razorpay_payment_id },
        errorCode: 'SIGNATURE_INVALID',
        errorMsg: 'Payment signature verification failed',
      });

      // Payment remains unverified — order does NOT become PAID
      await prisma.buyerSession.update({
        where: { id: sessionId },
        data: { state: AgentState.VERIFICATION_FAILED },
      });

      return NextResponse.json(
        {
          error: 'PAYMENT_VERIFICATION_FAILED',
          message: 'Payment signature is invalid. Payment not fulfilled.',
        },
        { status: 403 }
      );
    }

    // ─── 3. UPDATE PAYMENT AND ORDER ─────────────────────────────────────────
    const now = new Date();

    // Update payment record
    if (order.payment) {
      await prisma.payment.update({
        where: { orderId: order.id },
        data: {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          status: PaymentState.AUTHORIZED,
          verified: true,
          verifiedAt: now,
        },
      });
    } else {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: order.razorpayOrderId,
          razorpaySignature: razorpay_signature,
          amountPaise: order.amountPaise,
          status: PaymentState.AUTHORIZED,
          verified: true,
          verifiedAt: now,
        },
      });
    }

    // Update order status to PAID (via client-side verification)
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderState.PAID },
    });

    // Update session to COMPLETE
    await prisma.buyerSession.update({
      where: { id: sessionId },
      data: { state: AgentState.COMPLETE },
    });

    await logEvent({
      sessionId,
      agent: 'buyer_agent',
      eventType: EventType.PAYMENT_VERIFIED,
      status: 'SUCCESS',
      input: { razorpay_order_id, razorpay_payment_id },
      output: {
        verified: true,
        orderId: order.id,
        amountPaise: order.amountPaise,
      },
    });

    await logEvent({
      sessionId,
      agent: 'buyer_agent',
      eventType: EventType.PURCHASE_COMPLETED,
      status: 'SUCCESS',
      output: {
        orderId: order.id,
        productId: order.productId,
        amountInr: order.amountInr,
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      status: OrderState.PAID,
      message: 'Payment verified. Order is complete.',
    });
  } catch (error) {
    console.error('[verify] Unexpected error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
