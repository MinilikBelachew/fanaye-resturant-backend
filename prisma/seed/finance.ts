import { PrismaClient } from '@prisma/client';
import { id } from './ids';

export type FinanceCategorySeed = {
  direction: 'INCOME' | 'EXPENSE';
  code: string;
  name: string;
  amharicName: string;
  sortOrder: number;
};

/**
 * System finance categories every tenant starts with. Tenants can add their
 * own on top; these cannot be deleted (`isSystem`).
 */
export const FINANCE_CATEGORIES: FinanceCategorySeed[] = [
  { direction: 'EXPENSE', code: 'RENT', name: 'Rent', amharicName: 'ኪራይ', sortOrder: 10 },
  { direction: 'EXPENSE', code: 'SALARIES', name: 'Salaries', amharicName: 'ደመወዝ', sortOrder: 20 },
  { direction: 'EXPENSE', code: 'UTILITIES', name: 'Utilities', amharicName: 'መገልገያዎች', sortOrder: 30 },
  { direction: 'EXPENSE', code: 'MARKETING', name: 'Marketing', amharicName: 'ማስታወቂያ', sortOrder: 40 },
  { direction: 'EXPENSE', code: 'MAINTENANCE', name: 'Maintenance & repair', amharicName: 'ጥገና', sortOrder: 50 },
  { direction: 'EXPENSE', code: 'SUPPLIES', name: 'Supplies', amharicName: 'ዕቃዎች', sortOrder: 60 },
  { direction: 'EXPENSE', code: 'TRANSPORT', name: 'Transport', amharicName: 'ትራንስፖርት', sortOrder: 70 },
  { direction: 'EXPENSE', code: 'CLEANING', name: 'Cleaning', amharicName: 'ጽዳት', sortOrder: 80 },
  { direction: 'EXPENSE', code: 'OTHER', name: 'Other', amharicName: 'ሌሎች', sortOrder: 90 },
  { direction: 'INCOME', code: 'OTHER_INCOME', name: 'Other income', amharicName: 'ሌላ ገቢ', sortOrder: 110 },
  { direction: 'INCOME', code: 'HALL_RENTAL', name: 'Hall rental', amharicName: 'አዳራሽ ኪራይ', sortOrder: 120 },
  { direction: 'INCOME', code: 'SCRAP_SALE', name: 'Scrap sale', amharicName: 'ቅሬታ ሽያጭ', sortOrder: 130 },
  { direction: 'INCOME', code: 'INTEREST', name: 'Interest', amharicName: 'ወለድ', sortOrder: 140 },
];

export async function seedFinanceCategories(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  for (const category of FINANCE_CATEGORIES) {
    await prisma.financeCategory.upsert({
      where: {
        tenantId_direction_code: {
          tenantId,
          direction: category.direction,
          code: category.code,
        },
      },
      update: {
        name: category.name,
        amharicName: category.amharicName,
        isSystem: true,
        sortOrder: category.sortOrder,
        status: 'ACTIVE',
      },
      create: {
        id: id(`finance-category:${tenantId}:${category.direction}:${category.code}`),
        tenantId,
        direction: category.direction,
        code: category.code,
        name: category.name,
        amharicName: category.amharicName,
        isSystem: true,
        sortOrder: category.sortOrder,
        status: 'ACTIVE',
      },
    });
  }

  console.log(
    `Finance categories seeded (${FINANCE_CATEGORIES.length} for tenant ${tenantId}).`,
  );
}
