import { PrismaClient } from '@prisma/client';
import { BRANCHES, TENANT_ID } from './catalog';
import { id } from './ids';

export const INVENTORY_CATEGORIES = [
  {
    code: 'ETHIOPIAN_SPICES',
    name: 'Ethiopian Staples & Spices',
    amharicName: 'የኢትዮጵያ እህሎች እና ቅመሞች',
    description: 'Traditional grains, spices, butters, and flatbreads (Teff, Injera, Berbere, Shiro, Mitmita, etc.)',
    sortOrder: 1,
  },
  {
    code: 'MEAT_POULTRY',
    name: 'Meat & Poultry',
    amharicName: 'ስጋ እና ዶሮ',
    description: 'Prime beef cuts, butchered poultry, minced meats, and lamb',
    sortOrder: 2,
  },
  {
    code: 'FISH_SEAFOOD',
    name: 'Fish & Seafood',
    amharicName: 'ዓሳ እና የባህር ምግቦች',
    description: 'Fresh tilapia, Lake Tana fish fillets, salmon, and seafood',
    sortOrder: 3,
  },
  {
    code: 'PRODUCE',
    name: 'Fresh Produce & Vegetables',
    amharicName: 'ትኩስ አትክልትና ፍራፍሬ',
    description: 'Fresh vegetables, tubers, aromatics, herbs, and citrus (Onion, Garlic, Tomato, Gomen, etc.)',
    sortOrder: 4,
  },
  {
    code: 'DAIRY_EGGS',
    name: 'Dairy & Eggs',
    amharicName: 'የወተት ተዋጽኦ እና እንቁላል',
    description: 'Pasteurized milk, cream, cheeses, table butter, and fresh eggs',
    sortOrder: 5,
  },
  {
    code: 'DRY_GOODS',
    name: 'Grains, Flours & Dry Goods',
    amharicName: 'እህሎች፣ ዱቄት እና ጥራጥሬ',
    description: 'Flours, white and basmati rice, lentils, dry beans, sugar, salt, and pasta',
    sortOrder: 6,
  },
  {
    code: 'OILS_CONDIMENTS',
    name: 'Oils, Sauces & Condiments',
    amharicName: 'ዘይት፣ ማጣፈጫ እና መረቆች',
    description: 'Vegetable cooking oils, olive oils, tomato pastes, soy sauces, vinegars, and condiments',
    sortOrder: 7,
  },
  {
    code: 'BAKERY',
    name: 'Bakery & Bread',
    amharicName: 'ዳቦ እና ኬክ',
    description: 'Freshly baked sandwich breads, buns, baguettes, and bakery ingredients',
    sortOrder: 8,
  },
  {
    code: 'BEVERAGES',
    name: 'Coffee, Tea & Beverages',
    amharicName: 'ቡና፣ ሻይ እና መጠጦች',
    description: 'Single-origin green and roasted coffee beans, black and herbal teas, and honey',
    sortOrder: 9,
  },
];

export async function seedInventory(prisma: PrismaClient) {
  console.log('Seeding Inventory System for tenant:', TENANT_ID);

  // 1. Central Warehouse Location
  const mainWarehouse = await prisma.inventoryLocation.upsert({
    where: {
      tenantId_code: {
        tenantId: TENANT_ID,
        code: 'MAIN',
      },
    },
    update: {
      name: 'Main Central Warehouse',
      type: 'MAIN_WAREHOUSE',
      status: 'ACTIVE',
      isDefault: true,
    },
    create: {
      id: id('inventory-location:main-warehouse'),
      tenantId: TENANT_ID,
      code: 'MAIN',
      name: 'Main Central Warehouse',
      type: 'MAIN_WAREHOUSE',
      status: 'ACTIVE',
      isDefault: true,
    },
  });
  console.log(`✓ Main Warehouse: ${mainWarehouse.name} (${mainWarehouse.id})`);

  // 2. Branch Store Locations
  for (const branch of BRANCHES) {
    const storeCode = `BRANCH_${branch.displayCode}`.slice(0, 40);
    const store = await prisma.inventoryLocation.upsert({
      where: {
        tenantId_code: {
          tenantId: TENANT_ID,
          code: storeCode,
        },
      },
      update: {
        name: `${branch.name} Store`,
        type: 'BRANCH_STORE',
        branchId: branch.id,
        status: 'ACTIVE',
        isDefault: true,
      },
      create: {
        id: id(`inventory-location:branch-store:${branch.id}`),
        tenantId: TENANT_ID,
        branchId: branch.id,
        code: storeCode,
        name: `${branch.name} Store`,
        type: 'BRANCH_STORE',
        status: 'ACTIVE',
        isDefault: true,
      },
    });
    console.log(`✓ Branch Store: ${store.name} -> ${store.id}`);
  }

  // 3. Seed Inventory Categories
  for (const cat of INVENTORY_CATEGORIES) {
    await prisma.inventoryCategory.upsert({
      where: {
        tenantId_code: {
          tenantId: TENANT_ID,
          code: cat.code,
        },
      },
      update: {
        name: cat.name,
        amharicName: cat.amharicName,
        description: cat.description,
        sortOrder: cat.sortOrder,
        status: 'ACTIVE',
      },
      create: {
        id: id(`inventory-category:${cat.code}`),
        tenantId: TENANT_ID,
        code: cat.code,
        name: cat.name,
        amharicName: cat.amharicName,
        description: cat.description,
        sortOrder: cat.sortOrder,
        status: 'ACTIVE',
      },
    });
  }
  console.log(`✓ Seeded ${INVENTORY_CATEGORIES.length} inventory categories.`);
  console.log('✓ Note: No inventory items are pre-seeded into database. Items are added by users via UI autocomplete presets.');
}
