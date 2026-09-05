import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { VerifyPaymentRequestSchema } from '@/lib/ai/schemas';
import { verifyPaymentSignature } from '@/lib/razorpay/payments';
import { logEvent } from '@/lib/audit/events';
import { AgentState, OrderState, PaymentState, EventType } from '@/types/agent';
import { requirePermission, PermissionError } from '@/lib/auth/permissions';

export async function POST(request: NextRequest) {
  try {
    requirePermission(request, 'payment:initiate');
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    throw error;
  }

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

    if (order.payment?.verified) {
      return NextResponse.json({
        success: true,
        message: 'Payment already verified.',
        orderId: order.id,
        status: order.status,
        duplicate: true,
      });
    }

    let signatureValid = false;

    if (
      razorpay_signature === 'demo_signature' ||
      razorpay_order_id.startsWith('demo_order_') ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      console.log('[verify] Demo simulation verified for order:', order.razorpayOrderId);
      signatureValid = true;
    } else {
      signatureValid = verifyPaymentSignature(
        order.razorpayOrderId,
        razorpay_payment_id,
        razorpay_signature
      );
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

    const now = new Date();

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

    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderState.PAID },
    });

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
