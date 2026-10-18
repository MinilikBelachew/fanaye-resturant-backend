const { PrismaClient } = require("@prisma/client");
const { createHash } = require("crypto");

const prisma = new PrismaClient();

function id(key) {
  return createHash("md5").update(key).digest("hex");
}

const units = [
  { code: "can", name: "Can", category: "pack", sortOrder: 110 },
  { code: "keg", name: "Keg", category: "pack", sortOrder: 120 },
  { code: "crate", name: "Crate", category: "pack", sortOrder: 130 },
];

(async () => {
  for (const unit of units) {
    await prisma.inventoryUnit.upsert({
      where: { code: unit.code },
      update: {
        name: unit.name,
        category: unit.category,
        sortOrder: unit.sortOrder,
        status: "ACTIVE",
      },
      create: {
        id: id(`inventory-unit:${unit.code}`),
        code: unit.code,
        name: unit.name,
        category: unit.category,
        sortOrder: unit.sortOrder,
        status: "ACTIVE",
      },
    });
  }
  console.log("Extra units upserted:", units.map((u) => u.code).join(", "));
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
