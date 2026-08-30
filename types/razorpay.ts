// Razorpay order creation request
export interface CreateRazorpayOrderRequest {
  amount: number;      // in paise
  currency: 'INR';
  receipt: string;
  notes?: Record<string, string>;
}

// Razorpay order response
export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;      // in paise
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  created_at: number;
}

// Payment verification request (from browser)
export interface PaymentVerifyRequest {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  sessionId: string;
}

// Checkout configuration returned to browser
export interface CheckoutConfig {
  razorpayOrderId: string;
  amount: number;       // in paise
  currency: 'INR';
  keyId: string;        // NEXT_PUBLIC_RAZORPAY_KEY_ID
  name: string;
  description: string;
  prefill: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme: {
    color: string;
  };
  localOrderId: string; // Our DB order ID
}

// Razorpay webhook event structure
export interface RazorpayWebhookEvent {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    order?: {
      entity: RazorpayOrder;
    };
  };
  created_at: number;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  method: string;
  captured: boolean;
  description?: string;
  email?: string;
  contact?: string;
  fee?: number;
  tax?: number;
  error_code?: string;
  error_description?: string;
  created_at: number;
}

// Webhook events we handle
export type RazorpayWebhookEventType =
  | 'payment.captured'
  | 'payment.failed'
  | 'order.paid';

// Conversion helpers
export const inrToPaise = (inr: number): number => Math.round(inr * 100);
export const paiseToInr = (paise: number): number => paise / 100;
export const formatInr = (inr: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(inr);
