/**
 * 1) Deduplicate ingredient names per tenant
 * 2) prisma db push (run separately) OR call after schema applied
 * 3) Create default BRANCH_STORE per branch + backfill balance.locationId
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/migrate-inventory-locations.ts --dedupe
 *   npx prisma db push
 *   npx ts-node --transpile-only scripts/migrate-inventory-locations.ts --backfill
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const mode = process.argv.includes('--backfill')
  ? 'backfill'
  : process.argv.includes('--dedupe')
    ? 'dedupe'
    : 'all';

async function dedupeIngredientNames() {
  const rows = await prisma.inventoryIngredient.findMany({
    orderBy: [{ tenantId: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
    include: { branch: { select: { displayCode: true } } },
  });

  const seen = new Map<string, string>();
  let renamed = 0;
  for (const row of rows) {
    const key = `${row.tenantId}::${row.name.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, row.id);
      continue;
    }
    const suffix =
      row.branch?.displayCode ||
      (row.branchId ? row.branchId.slice(0, 8) : row.id.slice(0, 8));
    const nextName = `${row.name} (${suffix})`.slice(0, 180);
    await prisma.inventoryIngredient.update({
      where: { id: row.id },
      data: { name: nextName },
    });
    renamed += 1;
  }
  console.log(`Deduped ingredient names: renamed ${renamed}`);
}

async function backfillLocations() {
  const branches = await prisma.branch.findMany({
    where: { status: 'ACTIVE', archivedAt: null },
    select: { id: true, tenantId: true, name: true, displayCode: true },
  });

  let createdLocations = 0;
  for (const branch of branches) {
    const code = `BRANCH_${branch.displayCode}`.slice(0, 40);
    const existing = await prisma.inventoryLocation.findFirst({
      where: { tenantId: branch.tenantId, branchId: branch.id },
    });
    if (existing) continue;

    await prisma.inventoryLocation.create({
      data: {
        tenantId: branch.tenantId,
        branchId: branch.id,
        code,
        name: `${branch.name} store`,
        type: 'BRANCH_STORE',
        isDefault: true,
        status: 'ACTIVE',
      },
    });
    createdLocations += 1;
  }
  console.log(`Created ${createdLocations} default branch stores`);

  const balances = await prisma.inventoryStockBalance.findMany({
    where: { locationId: null as unknown as string },
  }).catch(async () => {
    // After push locationId exists; find missing via raw if needed
    return prisma.inventoryStockBalance.findMany();
  });

  let linked = 0;
  for (const balance of balances) {
    if ((balance as { locationId?: string | null }).locationId) continue;
    const branchId = balance.branchId;
    if (!branchId) continue;
    const location = await prisma.inventoryLocation.findFirst({
      where: { branchId, isDefault: true },
    });
    if (!location) continue;
    await prisma.inventoryStockBalance.update({
      where: { id: balance.id },
      data: { locationId: location.id },
    });
    linked += 1;
  }
  console.log(`Backfilled locationId on ${linked} balances`);
}

async function main() {
  if (mode === 'dedupe' || mode === 'all') {
    await dedupeIngredientNames();
  }
  if (mode === 'backfill' || mode === 'all') {
    // only backfill if location model exists
    try {
      await backfillLocations();
    } catch (error) {
      console.error(
        'Backfill failed (run prisma db push first if schema not applied):',
        error,
      );
      throw error;
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
