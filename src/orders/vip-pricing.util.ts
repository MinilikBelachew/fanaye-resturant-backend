import { Prisma } from '@prisma/client';

export function isEffectiveVip(seating: {
  isVip?: boolean | null;
  location?: { isVip?: boolean | null } | null;
}): boolean {
  return Boolean(seating.isVip || seating.location?.isVip);
}

/** Null item override → use tenant default; 0 → no surcharge for that item. */
export function resolveVipUnitPrice(
  currentPrice: Prisma.Decimal | number | string,
  effectiveVip: boolean,
  itemVipPercent: Prisma.Decimal | number | string | null | undefined,
  defaultVipPercent: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal {
  const base = new Prisma.Decimal(currentPrice);
  if (!effectiveVip) return base;
  const pct =
    itemVipPercent != null && itemVipPercent !== ''
      ? new Prisma.Decimal(itemVipPercent)
      : new Prisma.Decimal(defaultVipPercent ?? 0);
  if (pct.lte(0)) return base;
  return base
    .mul(new Prisma.Decimal(1).plus(pct.div(100)))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function effectiveVipPercentNumber(
  itemVipPercent: Prisma.Decimal | number | string | null | undefined,
  defaultVipPercent: Prisma.Decimal | number | string | null | undefined,
): number {
  if (itemVipPercent != null && itemVipPercent !== '') {
    return Number(itemVipPercent);
  }
  return Number(defaultVipPercent ?? 0);
}
