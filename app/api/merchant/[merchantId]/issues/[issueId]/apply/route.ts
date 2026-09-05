import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { logEvent } from '@/lib/audit/events';
import { EventType } from '@/types/agent';
import { requirePermission, PermissionError } from '@/lib/auth/permissions';

interface RouteParams {
  params: Promise<{ merchantId: string; issueId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { merchantId, issueId } = await params;

  try {
    requirePermission(req, 'catalog:apply_changes', merchantId);
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    throw error;
  }

  const body = await req.json().catch(() => ({}));
  const { confirmed } = body;

  if (!confirmed) {
    return NextResponse.json(
      { error: 'MERCHANT_APPROVAL_REQUIRED', message: 'Merchant must explicitly confirm the fix application.' },
      { status: 403 }
    );
  }

  const issue = await prisma.catalogIssue.findUnique({ where: { id: issueId } });

  if (!issue || issue.merchantId !== merchantId) {
    return NextResponse.json({ error: 'ISSUE_NOT_FOUND' }, { status: 404 });
  }

  if (issue.status !== 'OPEN') {
    return NextResponse.json({ error: 'ISSUE_ALREADY_RESOLVED', status: issue.status }, { status: 409 });
  }

  await prisma.catalogIssue.update({
    where: { id: issueId },
    data: { status: 'APPLIED', appliedAt: new Date() },
  });

  await logEvent({
    merchantId,
    agent: 'merchant_agent',
    eventType: EventType.FIX_APPLIED,
    status: 'SUCCESS',
    input: { issueId, type: issue.type },
    output: { appliedAt: new Date().toISOString() },
  });

  return NextResponse.json({
    success: true,
    message: `Fix applied: ${issue.title}`,
    issueId,
    status: 'APPLIED',
  });
}
