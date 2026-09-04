import crypto from 'crypto';

/**
 * Verify Razorpay payment signature server-side.
 *
 * SECURITY:
 * - Uses timing-safe comparison (timingSafeEqual) to prevent timing attacks
 * - The razorpayOrderId is looked up from OUR database, not trusted from browser
 * - Never fulfill a payment if signature verification fails
 *
 * Razorpay signature formula:
 * HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
 */
export function verifyPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new Error('RAZORPAY_KEY_SECRET is not configured');
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');

  // Timing-safe comparison — prevents timing-based attacks
  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(razorpaySignature, 'hex');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}
