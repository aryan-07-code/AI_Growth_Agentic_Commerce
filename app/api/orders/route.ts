import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { CreateOrderRequestSchema } from '@/lib/ai/schemas';
import { evaluatePurchasePolicy } from '@/lib/policy/purchase-policy';
import { createRazorpayOrder } from '@/lib/razorpay/orders';
import { isRazorpayConfigured } from '@/lib/razorpay/client';
import { logEvent } from '@/lib/audit/events';
import { mapProductToDetails } from '@/lib/commerce/search';
import { checkDelivery } from '@/lib/commerce/delivery';
import { AgentState, OrderState, PaymentState, EventType } from '@/types/agent';
import { inrToPaise } from '@/types/razorpay';
import { nanoid } from 'nanoid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateOrderRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionId, productId, variantId } = parsed.data;

    // ─── 1. LOAD AND VALIDATE SESSION ────────────────────────────────────────
    const session = await prisma.buyerSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });
    }

    // Verify explicit approval was given
    const context = session.context as any;
    if (!context?.approvalGiven) {
      await logEvent({
        sessionId,
        agent: 'buyer_agent',
        eventType: EventType.PURCHASE_BLOCKED,
        status: 'BLOCKED',
        input: { reason: 'No explicit approval' },
      });
      return NextResponse.json(
        {
          error: 'PURCHASE_NOT_APPROVED',
          message: 'Explicit user approval is required before creating an order.',
        },
        { status: 403 }
      );
    }

    // Check session state
    if (session.state !== AgentState.AWAIT_APPROVAL && session.state !== AgentState.VALIDATE_PURCHASE) {
      return NextResponse.json(
        {
          error: 'INVALID_SESSION_STATE',
          state: session.state,
          message: 'Session is not in a state ready for order creation.',
        },
        { status: 409 }
      );
    }

    // Prevent duplicate orders
    const existingOrder = await prisma.order.findUnique({
      where: { sessionId },
    });
    if (existingOrder) {
      return NextResponse.json(
        { error: 'ORDER_ALREADY_EXISTS', orderId: existingOrder.id },
        { status: 409 }
      );
    }

    // ─── 2. LOAD AND RE-VERIFY PRODUCT ────────────────────────────────────────
    const dbProduct = await prisma.product.findUnique({
      where: { id: productId },
      include: { merchant: true, variants: { where: { active: true } } },
    });

    if (!dbProduct || !dbProduct.active) {
      return NextResponse.json({ error: 'PRODUCT_UNAVAILABLE' }, { status: 404 });
    }

    const product = mapProductToDetails(dbProduct);

    // Re-check current inventory (not cached — fresh DB read)
    if (dbProduct.inventory <= 0) {
      return NextResponse.json(
        { error: 'PRODUCT_UNAVAILABLE', message: 'Product is now out of stock.' },
        { status: 409 }
      );
    }

    // Re-check current price (fresh from DB, not from session)
    const currentPriceInr = dbProduct.priceInr;

    // Re-check delivery if intent had a deadline
    if (context?.intent?.destination && context?.intent?.deliveryDeadline) {
      const deliveryCheck = await checkDelivery(
        product,
        context.intent.destination,
        context.intent.deliveryDeadline
      );
      if (!deliveryCheck.eligible) {
        return NextResponse.json(
          {
            error: 'DELIVERY_UNAVAILABLE',
            message: 'Delivery is no longer available within your deadline.',
          },
          { status: 409 }
        );
      }
    }

    // ─── 3. RUN PURCHASE POLICY ───────────────────────────────────────────────
    await prisma.buyerSession.update({
      where: { id: sessionId },
      data: { state: AgentState.VALIDATE_PURCHASE },
    });

    const policyResult = evaluatePurchasePolicy({
      approvalGiven: true,
      amountInr: currentPriceInr,
      product,
    });

    await logEvent({
      sessionId,
      agent: 'buyer_agent',
      eventType: EventType.POLICY_CHECKED,
      status: policyResult.allowed ? 'SUCCESS' : 'BLOCKED',
      input: { productId, amountInr: currentPriceInr },
      decision: { policyResult },
      output: { allowed: policyResult.allowed },
    });

    if (!policyResult.allowed) {
      await prisma.buyerSession.update({
        where: { id: sessionId },
        data: { state: AgentState.POLICY_BLOCKED },
      });

      return NextResponse.json(
        {
          error: 'POLICY_BLOCKED',
          message: policyResult.blockedReason || 'Purchase policy check failed.',
          failures: policyResult.failures,
        },
        { status: 403 }
      );
    }

    // ─── 4. CREATE LOCAL ORDER ────────────────────────────────────────────────
    const receipt = `order_${nanoid(12)}`;
    const amountPaise = inrToPaise(currentPriceInr);

    const order = await prisma.order.create({
      data: {
        sessionId,
        merchantId: dbProduct.merchantId,
        productId,
        variantId: variantId || null,
        amountInr: currentPriceInr,
        amountPaise,
        status: OrderState.PENDING,
        receipt,
        policyChecked: true,
        policyResult: policyResult as any,
        approvedAt: new Date(),
      },
    });

    // ─── 5. CREATE RAZORPAY ORDER ──────────────────────────────────────────────
    await prisma.buyerSession.update({
      where: { id: sessionId },
      data: { state: AgentState.CREATE_ORDER },
    });

    let razorpayOrderId: string;
    let checkoutConfig: Record<string, unknown>;

    if (isRazorpayConfigured()) {
      try {
        const razorpayOrder = await createRazorpayOrder(
          currentPriceInr,
          receipt,
          {
            sessionId,
            productId,
            orderId: order.id,
          }
        );

        razorpayOrderId = razorpayOrder.id;

        // Update local order with Razorpay order ID
        await prisma.order.update({
          where: { id: order.id },
          data: {
            razorpayOrderId,
            status: OrderState.CREATED,
          },
        });

        // Create payment record
        await prisma.payment.create({
          data: {
            orderId: order.id,
            razorpayOrderId,
            amountPaise,
            status: PaymentState.PENDING,
          },
        });

        await logEvent({
          sessionId,
          agent: 'buyer_agent',
          eventType: EventType.ORDER_CREATED,
          status: 'SUCCESS',
          output: {
            orderId: order.id,
            razorpayOrderId,
            amountInr: currentPriceInr,
            amountPaise,
          },
        });

        checkoutConfig = {
          razorpayOrderId,
          amount: amountPaise,
          currency: 'INR',
          keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          name: 'AgentReady',
          description: dbProduct.title,
          prefill: {},
          theme: { color: '#d4a853' },
          localOrderId: order.id,
        };
      } catch (razorpayError: any) {
        console.error('[orders] Razorpay order creation failed:', razorpayError);

        await prisma.order.update({
          where: { id: order.id },
          data: { status: OrderState.FAILED },
        });
        await prisma.buyerSession.update({
          where: { id: sessionId },
          data: { state: AgentState.ORDER_FAILED },
        });

        return NextResponse.json(
          {
            error: 'RAZORPAY_ORDER_FAILED',
            message: 'Failed to create Razorpay order. Please try again.',
          },
          { status: 500 }
        );
      }
    } else {
      // Demo mode: Razorpay not configured
      razorpayOrderId = `demo_order_${nanoid(8)}`;

      await prisma.order.update({
        where: { id: order.id },
        data: {
          razorpayOrderId,
          status: OrderState.CREATED,
        },
      });

      checkoutConfig = {
        razorpayOrderId,
        amount: amountPaise,
        currency: 'INR',
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_demo',
        name: 'AgentReady',
        description: dbProduct.title,
        prefill: {},
        theme: { color: '#d4a853' },
        localOrderId: order.id,
        demoMode: true,
        demoMessage: 'Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      };
    }

    // Update session state to CHECKOUT
    await prisma.buyerSession.update({
      where: { id: sessionId },
      data: {
        state: AgentState.CHECKOUT,
        context: {
          ...context,
          orderId: order.id,
          razorpayOrderId,
        } as any,
      },
    });

    await logEvent({
      sessionId,
      agent: 'buyer_agent',
      eventType: EventType.CHECKOUT_OPENED,
      status: 'SUCCESS',
      output: { orderId: order.id, razorpayOrderId },
    });

    return NextResponse.json({
      orderId: order.id,
      checkout: checkoutConfig,
    });
  } catch (error) {
    console.error('[orders] Unexpected error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
