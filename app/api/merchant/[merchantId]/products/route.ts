import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import prisma from '@/lib/db';
import { requirePermission, PermissionError } from '@/lib/auth/permissions';

interface RouteParams {
  params: Promise<{ merchantId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { merchantId } = await params;

  try {
    requirePermission(req, 'catalog:propose_changes', merchantId);
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const { title, sku, category, priceInr, inventory, description, warrantyMonths, returnDays, attributes, deliveryRules } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'MISSING_TITLE' }, { status: 400 });
  }
  if (!sku || typeof sku !== 'string' || sku.trim().length === 0) {
    return NextResponse.json({ error: 'MISSING_SKU' }, { status: 400 });
  }
  if (!category || typeof category !== 'string') {
    return NextResponse.json({ error: 'MISSING_CATEGORY' }, { status: 400 });
  }
  if (typeof priceInr !== 'number' || priceInr <= 0) {
    return NextResponse.json({ error: 'INVALID_PRICE' }, { status: 400 });
  }
  if (typeof inventory !== 'number' || inventory < 0) {
    return NextResponse.json({ error: 'INVALID_INVENTORY' }, { status: 400 });
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return NextResponse.json({ error: 'MISSING_DESCRIPTION' }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({
    where: { merchantId_sku: { merchantId, sku: sku.trim() } },
  });
  if (existing) {
    return NextResponse.json({ error: 'SKU_ALREADY_EXISTS', message: `SKU "${sku}" already exists for this merchant.` }, { status: 409 });
  }

  const productAttributes: Record<string, unknown> = {
    ...(typeof attributes === 'object' && attributes !== null ? attributes : {}),
  };

  if (Array.isArray(deliveryRules) && deliveryRules.length > 0) {
    const deliveryOverride: Record<string, unknown> = {};
    for (const rule of deliveryRules) {
      if (rule.destination && typeof rule.minDays === 'number' && typeof rule.maxDays === 'number') {
        deliveryOverride[rule.destination.toLowerCase()] = {
          minDays: rule.minDays,
          maxDays: rule.maxDays,
          fee: rule.fee ?? 0,
          available: true,
        };
      }
    }
    if (Object.keys(deliveryOverride).length > 0) {
      productAttributes.delivery_override = deliveryOverride;
    }
  }

  try {
    const product = await prisma.product.create({
      data: {
        merchantId,
        sku: sku.trim(),
        title: title.trim(),
        description: description.trim(),
        category: category.toLowerCase().trim(),
        priceInr: Math.round(priceInr),
        inventory: Math.round(inventory),
        warrantyMonths: warrantyMonths ? Math.round(warrantyMonths) : null,
        returnDays: returnDays ? Math.round(returnDays) : null,
        attributes: productAttributes,
        active: true,
      },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error: any) {
    console.error('[products/route] Create product error:', error);
    return NextResponse.json({ error: 'CREATE_FAILED', message: error.message }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { merchantId } = await params;

  const products = await prisma.product.findMany({
    where: { merchantId, active: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      sku: true,
      title: true,
      category: true,
      priceInr: true,
      inventory: true,
      warrantyMonths: true,
      returnDays: true,
      attributes: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ products });
}
