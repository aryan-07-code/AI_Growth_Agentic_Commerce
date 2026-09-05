import crypto from 'crypto';
import type { RazorpayWebhookEvent } from '@/types/razorpay';

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string
): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
  }

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(signature, 'hex');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

export function parseWebhookEvent(body: string): RazorpayWebhookEvent {
  try {
    return JSON.parse(body) as RazorpayWebhookEvent;
  } catch {
    throw new Error('Invalid webhook payload — could not parse JSON');
  }
}

export function getWebhookEventType(event: RazorpayWebhookEvent): string {
  return event.event;
}
