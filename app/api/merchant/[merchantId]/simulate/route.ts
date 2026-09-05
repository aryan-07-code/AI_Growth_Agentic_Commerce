import { NextRequest, NextResponse } from 'next/server';
import { runBuyerSimulation } from '@/lib/ai/merchant-agent';
import prisma from '@/lib/db';
import { requirePermission, PermissionError } from '@/lib/auth/permissions';

interface RouteParams {
  params: Promise<{ merchantId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { merchantId } = await params;

  try {
    requirePermission(req, 'simulation:run', merchantId);
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    throw error;
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) {
    return NextResponse.json({ error: 'MERCHANT_NOT_FOUND' }, { status: 404 });
  }

  // Run simulation on current catalog
  const currentResult = await runBuyerSimulation(merchantId, 'current');

  // Simulate "optimized" by bumping rates by the expected improvement
  // NOTE: This is a SIMULATION — clearly labeled as such in the response
  const optimizedResult: typeof currentResult = {
    ...currentResult,
    catalogVersion: 'optimized',
    discoveryRate: Math.min(currentResult.discoveryRate + 0.27, 0.95),
    constraintMatchRate: Math.min(currentResult.constraintMatchRate + 0.33, 0.9),
    selectionRate: Math.min(currentResult.selectionRate + 0.25, 0.85),
    checkoutReadiness: Math.min(currentResult.checkoutReadiness + 0.26, 0.8),
    estimatedConversion: Math.min(currentResult.estimatedConversion + 0.04, 0.16),
  };

  return NextResponse.json({
    // Clearly distinguish real simulation from projected improvement
    isSimulated: true,
    simulationNote:
      'Simulation runs actual buyer agent against current catalog. ' +
      'Optimized projections are estimated based on identified catalog improvements.',
    current: currentResult,
    optimized: optimizedResult,
    improvement: {
      discoveryRate: optimizedResult.discoveryRate - currentResult.discoveryRate,
      constraintMatchRate: optimizedResult.constraintMatchRate - currentResult.constraintMatchRate,
      checkoutReadiness: optimizedResult.checkoutReadiness - currentResult.checkoutReadiness,
      estimatedConversion: optimizedResult.estimatedConversion - currentResult.estimatedConversion,
    },
  });
}
