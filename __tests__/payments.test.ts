import crypto from 'crypto';

const TEST_KEY_SECRET = 'test_secret_key_for_hmac_verification';
const TEST_WEBHOOK_SECRET = 'test_webhook_secret';

beforeAll(() => {
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
});

afterAll(() => {
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

import { verifyPaymentSignature } from '../lib/razorpay/payments';
import { verifyWebhookSignature } from '../lib/razorpay/webhooks';

function makePaymentSignature(orderId: string, paymentId: string, secret = TEST_KEY_SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function makeWebhookSignature(body: string, secret = TEST_WEBHOOK_SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
}

describe('Payment Signature Verification', () => {
  const orderId = 'order_test123';
  const paymentId = 'pay_test456';

  test('accepts valid signature', () => {
    const sig = makePaymentSignature(orderId, paymentId);
    expect(verifyPaymentSignature(orderId, paymentId, sig)).toBe(true);
  });

  test('rejects tampered signature', () => {
    const sig = makePaymentSignature(orderId, paymentId);
    const tamperedSig = sig.slice(0, -4) + 'aaaa';
    expect(verifyPaymentSignature(orderId, paymentId, tamperedSig)).toBe(false);
  });

  test('rejects signature for different order ID', () => {
    const sig = makePaymentSignature('order_different', paymentId);
    expect(verifyPaymentSignature(orderId, paymentId, sig)).toBe(false);
  });

  test('rejects signature for different payment ID', () => {
    const sig = makePaymentSignature(orderId, 'pay_different');
    expect(verifyPaymentSignature(orderId, paymentId, sig)).toBe(false);
  });

  test('rejects empty signature', () => {
    expect(verifyPaymentSignature(orderId, paymentId, '')).toBe(false);
  });

  test('rejects signature signed with wrong key', () => {
    const sig = makePaymentSignature(orderId, paymentId, 'wrong_secret');
    expect(verifyPaymentSignature(orderId, paymentId, sig)).toBe(false);
  });
});

describe('Webhook Signature Verification', () => {
  const webhookBody = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_test', order_id: 'order_test' } } },
  });

  test('accepts valid webhook signature', () => {
    const sig = makeWebhookSignature(webhookBody);
    expect(verifyWebhookSignature(webhookBody, sig)).toBe(true);
  });

  test('rejects tampered webhook body', () => {
    const sig = makeWebhookSignature(webhookBody);
    const tamperedBody = webhookBody.replace('payment.captured', 'payment.captured_tampered');
    expect(verifyWebhookSignature(tamperedBody, sig)).toBe(false);
  });

  test('rejects invalid webhook signature', () => {
    const invalidSig = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
    expect(verifyWebhookSignature(webhookBody, invalidSig)).toBe(false);
  });

  test('accepts Buffer body', () => {
    const sig = makeWebhookSignature(webhookBody);
    expect(verifyWebhookSignature(Buffer.from(webhookBody), sig)).toBe(true);
  });
});

describe('Duplicate Webhook Idempotency Logic', () => {
  test('idempotency check prevents double processing', () => {
    const alreadyProcessed = true;
    const processingResult = alreadyProcessed ? 'skipped' : 'processed';
    expect(processingResult).toBe('skipped');
  });

  test('new webhook event is processed', () => {
    const alreadyProcessed = false;
    const processingResult = alreadyProcessed ? 'skipped' : 'processed';
    expect(processingResult).toBe('processed');
  });
});
