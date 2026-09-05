import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auditCatalog } from '@/lib/ai/merchant-agent';
import { requirePermission, PermissionError } from '@/lib/auth/permissions';

interface RouteParams {
  params: Promise<{ merchantId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { merchantId } = await params;

  try {
    requirePermission(req, 'catalog:audit', merchantId);
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    throw error;
  }

  const issues = await prisma.catalogIssue.findMany({
    where: { merchantId },
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ issues });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { merchantId } = await params;

  try {
    requirePermission(req, 'catalog:audit', merchantId);
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

  await auditCatalog(merchantId);

  const issues = await prisma.catalogIssue.findMany({
    where: { merchantId, status: 'OPEN' },
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({
    message: 'Catalog audit complete',
    issueCount: issues.length,
    issues,
  });
}
