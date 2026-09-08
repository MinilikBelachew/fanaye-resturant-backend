const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const KARIM = "77777777-7777-4777-8777-555555555555";
const DAWIT = "77777777-7777-4777-8777-555555555556";

async function main() {
  const tables = await prisma.diningTable.findMany({
    orderBy: { sortOrder: "asc" },
  });
  for (const table of tables) {
    const n = Number(table.displayNumber || 0);
    await prisma.diningTable.update({
      where: { id: table.id },
      data: {
        assignedWaiterMembershipId: n <= 8 ? KARIM : DAWIT,
      },
    });
  }
  console.log(`Assigned waiters on ${tables.length} tables`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
