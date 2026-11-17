import { PrismaClient } from '@prisma/client';

export async function seedMarketPrices(prisma: PrismaClient) {
  // 1. Default Platform Role Permissions for MARKET_REPORTER
  const reporterPerms = [
    { permissionCode: 'market.prices.update', enabled: true },
    { permissionCode: 'market.items.manage', enabled: false },
    { permissionCode: 'market.locations.manage', enabled: false },
  ];
  for (const perm of reporterPerms) {
    await prisma.platformRolePermission.upsert({
      where: {
        roleCode_permissionCode: {
          roleCode: 'MARKET_REPORTER',
          permissionCode: perm.permissionCode,
        },
      },
      update: {},
      create: {
        roleCode: 'MARKET_REPORTER',
        permissionCode: perm.permissionCode,
        enabled: perm.enabled,
      },
    });
  }

  // 2. Market Categories
  const categories = [
    { name: 'Vegetables & Produce', slug: 'vegetables-produce', sortOrder: 1 },
    { name: 'Grains & Flours', slug: 'grains-flours', sortOrder: 2 },
    { name: 'Meat, Poultry & Eggs', slug: 'meat-poultry-eggs', sortOrder: 3 },
    { name: 'Oils & Dairy', slug: 'oils-dairy', sortOrder: 4 },
    { name: 'Spices & Condiments', slug: 'spices-condiments', sortOrder: 5 },
    { name: 'Beverages & Café', slug: 'beverages-cafe', sortOrder: 6 },
    { name: 'Packaging & Supplies', slug: 'packaging-supplies', sortOrder: 7 },
  ];
  const categoryBySlug = new Map<string, string>();
  for (const cat of categories) {
    const row = await prisma.marketCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: cat.sortOrder },
      create: cat,
    });
    categoryBySlug.set(cat.slug, row.id);
  }

  // 3. Market Units
  const units = [
    { code: 'kg', label: 'Kilogram (kg)', sortOrder: 1 },
    { code: 'quintal', label: 'Quintal (100 kg)', sortOrder: 2 },
    { code: 'g', label: 'Gram (g)', sortOrder: 3 },
    { code: 'liter', label: 'Liter (L)', sortOrder: 4 },
    { code: '5L jerrycan', label: '5L Jerrycan', sortOrder: 5 },
    { code: '20L jerrycan', label: '20L Jerrycan', sortOrder: 6 },
    { code: 'crate', label: 'Crate', sortOrder: 7 },
    { code: 'piece', label: 'Piece', sortOrder: 8 },
    { code: 'dozen', label: 'Dozen', sortOrder: 9 },
    { code: 'sack', label: 'Sack / Bag', sortOrder: 10 },
    { code: 'pack', label: 'Pack', sortOrder: 11 },
    { code: 'carton', label: 'Carton', sortOrder: 12 },
  ];
  const unitByCode = new Map<string, string>();
  for (const unit of units) {
    const row = await prisma.marketUnit.upsert({
      where: { code: unit.code },
      update: { label: unit.label, sortOrder: unit.sortOrder },
      create: unit,
    });
    unitByCode.set(unit.code, row.id);
  }

  // 4. Marketplaces (Gebeya)
  const marketplaces = [
    { name: 'Atikilt Tera', slug: 'atikilt-tera', city: 'Addis Ababa', area: 'Piassa' },
    { name: 'Merkato', slug: 'merkato', city: 'Addis Ababa', area: 'Addis Ketema' },
    { name: 'Shola', slug: 'shola', city: 'Addis Ababa', area: 'Yeka' },
    { name: 'Piassa', slug: 'piassa', city: 'Addis Ababa', area: 'Arada' },
  ];
  const marketBySlug = new Map<string, string>();
  for (const mp of marketplaces) {
    const row = await prisma.marketplace.upsert({
      where: { slug: mp.slug },
      update: {},
      create: mp,
    });
    marketBySlug.set(mp.slug, row.id);
  }

  // 5. Initial sample Market Items + Prices + History (only if none exist yet)
  const existingItemCount = await prisma.marketItem.count();
  if (existingItemCount === 0) {
    const sampleItems = [
      {
        name: 'Red Onion',
        slug: 'red-onion',
        categorySlug: 'vegetables-produce',
        unitCode: 'kg',
        description: 'Fresh local red onions for daily kitchen prep.',
        isFeaturedOnLanding: true,
        prices: [
          { marketSlug: 'atikilt-tera', price: 40, prev: 44 },
          { marketSlug: 'shola', price: 50, prev: 48 },
          { marketSlug: 'merkato', price: 42, prev: 45 },
        ],
      },
      {
        name: 'Fresh Tomato',
        slug: 'fresh-tomato',
        categorySlug: 'vegetables-produce',
        unitCode: 'kg',
        description: 'Ripe cooking tomatoes for stews, salads, and sauces.',
        isFeaturedOnLanding: true,
        prices: [
          { marketSlug: 'atikilt-tera', price: 55, prev: 50 },
          { marketSlug: 'shola', price: 65, prev: 60 },
          { marketSlug: 'piassa', price: 60, prev: 58 },
        ],
      },
      {
        name: 'Cooking Oil',
        slug: 'cooking-oil',
        categorySlug: 'oils-dairy',
        unitCode: '5L jerrycan',
        description: 'Refined vegetable cooking oil for frying and sautéing.',
        isFeaturedOnLanding: true,
        prices: [
          { marketSlug: 'merkato', price: 920, prev: 950 },
          { marketSlug: 'shola', price: 960, prev: 960 },
        ],
      },
      {
        name: 'White Teff',
        slug: 'white-teff',
        categorySlug: 'grains-flours',
        unitCode: 'quintal',
        description: 'First-grade white teff for injera production.',
        isFeaturedOnLanding: true,
        prices: [
          { marketSlug: 'merkato', price: 11200, prev: 11000 },
          { marketSlug: 'shola', price: 11800, prev: 11500 },
        ],
      },
      {
        name: 'Garlic',
        slug: 'garlic',
        categorySlug: 'vegetables-produce',
        unitCode: 'kg',
        description: 'Whole local garlic bulbs.',
        isFeaturedOnLanding: true,
        prices: [
          { marketSlug: 'atikilt-tera', price: 140, prev: 135 },
          { marketSlug: 'shola', price: 155, prev: 150 },
        ],
      },
    ];

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    for (const s of sampleItems) {
      const categoryId = categoryBySlug.get(s.categorySlug);
      const unitId = unitByCode.get(s.unitCode);
      if (!categoryId || !unitId) continue;

      const item = await prisma.marketItem.create({
        data: {
          name: s.name,
          slug: s.slug,
          categoryId,
          unitId,
          description: s.description,
          isFeaturedOnLanding: s.isFeaturedOnLanding,
          isActive: true,
        },
      });

      for (const p of s.prices) {
        const marketplaceId = marketBySlug.get(p.marketSlug);
        if (!marketplaceId) continue;

        await prisma.marketItemPrice.create({
          data: {
            itemId: item.id,
            marketplaceId,
            price: p.price,
            previousPrice: p.prev,
            updatedByName: 'System Seed',
          },
        });

        await prisma.marketPriceHistory.createMany({
          data: [
            {
              itemId: item.id,
              marketplaceId,
              price: p.prev,
              recordedByName: 'System Seed',
              recordedAt: twoDaysAgo,
            },
            {
              itemId: item.id,
              marketplaceId,
              price: p.prev,
              recordedByName: 'System Seed',
              recordedAt: yesterday,
            },
            {
              itemId: item.id,
              marketplaceId,
              price: p.price,
              recordedByName: 'System Seed',
              recordedAt: now,
            },
          ],
        });
      }
    }
  }

  console.log('Market prices catalog, units, marketplaces, and reporter permissions seeded.');
}

