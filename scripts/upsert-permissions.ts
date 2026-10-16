import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../prisma/seed/catalog';

const prisma = new PrismaClient();

async function main() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { domain: permission.domain },
      create: permission,
    });
  }

  const roles = await prisma.restaurantRole.findMany();
  const permissionRows = await prisma.permission.findMany();
  const idByCode = new Map(permissionRows.map((row) => [row.code, row.id]));

  let linked = 0;
  for (const role of roles) {
    const granted = ROLE_PERMISSIONS[role.code as keyof typeof ROLE_PERMISSIONS];
    if (!granted) continue;
    const codes =
      granted === '*' ? PERMISSIONS.map((entry) => entry.code) : granted;
    for (const code of codes) {
      const permissionId = idByCode.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        update: { allowed: true },
        create: { roleId: role.id, permissionId, allowed: true },
      });
      linked += 1;
    }
  }

  console.log(
    `Upserted ${PERMISSIONS.length} permissions; ${linked} role_permission links.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
