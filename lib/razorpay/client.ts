import Razorpay from 'razorpay';

const globalForRazorpay = global as unknown as { razorpay: Razorpay };

function createRazorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      'Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export function getRazorpayClient(): Razorpay {
  if (!globalForRazorpay.razorpay) {
    globalForRazorpay.razorpay = createRazorpayClient();
  }
  return globalForRazorpay.razorpay;
}

export function isRazorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export default getRazorpayClient;
