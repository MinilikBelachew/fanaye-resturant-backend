import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Unit conversion engine.
 *
 * Base units per family: kg (mass), L (volume), pcs (count).
 * Lookup order for fromUnit -> baseUnit:
 *   1. tenant custom conversion pairs (InventoryUnitConversion)
 *   2. built-in fixed factors (same family only)
 *   3. reject — cross-family conversion without a custom pair is invalid.
 */
export interface UnitFamilyEntry {
  family: 'mass' | 'volume' | 'count';
  toBase: number;
}

export const BUILT_IN_UNIT_FACTORS: Record<string, UnitFamilyEntry> = {
  kg: { family: 'mass', toBase: 1 },
  g: { family: 'mass', toBase: 0.001 },
  L: { family: 'volume', toBase: 1 },
  ml: { family: 'volume', toBase: 0.001 },
  pcs: { family: 'count', toBase: 1 },
  dozen: { family: 'count', toBase: 12 },
};

export function builtInFactor(fromUnit: string, toUnit: string): number | null {
  const a = BUILT_IN_UNIT_FACTORS[fromUnit];
  const b = BUILT_IN_UNIT_FACTORS[toUnit];
  if (!a || !b || a.family !== b.family) return null;
  return a.toBase / b.toBase;
}

export interface UnitConversionPairRow {
  fromUnit: string;
  toUnit: string;
  factor: unknown;
}

export interface UnitConversionLookupDb {
  inventoryUnitConversion: {
    findFirst(
      args: Prisma.InventoryUnitConversionFindFirstArgs,
    ): Promise<UnitConversionPairRow | null>;
    findMany(
      args: Prisma.InventoryUnitConversionFindManyArgs,
    ): Promise<UnitConversionPairRow[]>;
  };
}

/**
 * Converts qty from fromUnit into baseUnit.
 * Omitted/empty fromUnit means the value is already in baseUnit.
 */
export async function toBaseQty(
  db: UnitConversionLookupDb,
  tenantId: string,
  qty: number,
  fromUnit: string | null | undefined,
  baseUnit: string,
  contextLabel?: string,
): Promise<number> {
  if (fromUnit == null || fromUnit === '') return qty;
  if (fromUnit === baseUnit) return qty;

  const direct = await db.inventoryUnitConversion.findFirst({
    where: { tenantId, fromUnit, toUnit: baseUnit, status: 'ACTIVE' },
  });
  if (direct) return qty / Number(direct.factor);

  const reverse = await db.inventoryUnitConversion.findFirst({
    where: { tenantId, fromUnit: baseUnit, toUnit: fromUnit, status: 'ACTIVE' },
  });
  if (reverse) return qty * Number(reverse.factor);

  const builtIn = builtInFactor(fromUnit, baseUnit);
  if (builtIn != null) return qty * builtIn;

  throw new BadRequestException(
    `Cannot convert ${fromUnit} to ${baseUnit}${
      contextLabel ? ` (${contextLabel})` : ''
    }. Units must be in the same family or have a custom conversion configured.`,
  );
}

/**
 * Unit codes that can be converted to baseUnit:
 * built-in same-family units plus any tenant custom pairs touching baseUnit.
 */
export async function compatibleUnitCodes(
  db: UnitConversionLookupDb,
  tenantId: string,
  baseUnit: string,
): Promise<string[]> {
  const codes = new Set<string>([baseUnit]);
  const base = BUILT_IN_UNIT_FACTORS[baseUnit];
  if (base) {
    for (const [code, entry] of Object.entries(BUILT_IN_UNIT_FACTORS)) {
      if (entry.family === base.family) codes.add(code);
    }
  }
  const pairs = await db.inventoryUnitConversion.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      OR: [{ fromUnit: baseUnit }, { toUnit: baseUnit }],
    },
  });
  for (const pair of pairs) {
    codes.add(pair.fromUnit);
    codes.add(pair.toUnit);
  }
  return [...codes];
}

/** Rounds a converted qty to 4 decimals (balance precision). */
export function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000;
}
