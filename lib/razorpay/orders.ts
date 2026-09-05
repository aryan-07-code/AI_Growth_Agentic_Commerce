import { getRazorpayClient } from './client';
import type { RazorpayOrder, CreateRazorpayOrderRequest } from '@/types/razorpay';
import { inrToPaise } from '@/types/razorpay';

export async function createRazorpayOrder(
  amountInr: number,
  receipt: string,
  notes?: Record<string, string>
): Promise<RazorpayOrder> {
  const razorpay = getRazorpayClient();

  const amountPaise = inrToPaise(amountInr);

  const request: CreateRazorpayOrderRequest = {
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes,
  };

  try {
    const order = await razorpay.orders.create(request as any) as unknown as RazorpayOrder;
    console.log(`[razorpay] Order created: ${order.id}, amount: ${amountPaise} paise`);
    return order;
  } catch (error: any) {
    console.error('[razorpay] Order creation failed:', {
      error: error?.message,
      code: error?.error?.code,
    });
    throw new Error(
      `Razorpay order creation failed: ${error?.error?.description || error?.message || 'Unknown error'}`
    );
  }
}

export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder> {
  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.fetch(orderId) as unknown as RazorpayOrder;
  return order;
}
