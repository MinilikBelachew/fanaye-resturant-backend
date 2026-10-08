import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  BRANCHES,
  MENU_DISHES,
  PERMISSIONS,
  PLAN_ENTERPRISE_ID,
  PLAN_PRO_ID,
  PLAN_STARTER_ID,
  ROLE_PERMISSIONS,
  STAFF,
  TENANT_ID,
  TENANT_SLUG,
  type RestaurantRoleCode,
} from './seed/catalog';
import {
  buildBranchRuntime,
  membershipIdForUser,
  seedTwoYearHistory,
  type BranchRuntime,
} from './seed/history';
import { atTime, businessDateOnly, id, startOfDay } from './seed/ids';

const prisma = new PrismaClient();

async function seedRolesAndPlans() {
  const roles: Array<{ id: number; code: RestaurantRoleCode; name: string }> = [
    { id: 1, code: 'OWNER_ADMIN', name: 'Owner' },
    { id: 2, code: 'MANAGER', name: 'Manager' },
    { id: 3, code: 'WAITER', name: 'Waiter' },
    { id: 4, code: 'CASHIER', name: 'Cashier' },
    { id: 5, code: 'STATION_OPERATOR', name: 'Station operator' },
    { id: 6, code: 'DISPATCHER', name: 'Dispatcher' },
  ];

  for (const role of roles) {
    await prisma.restaurantRole.upsert({
      where: { id: role.id },
      update: {},
      create: role,
    });
  }

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: permission,
    });
  }

  const permissionRows = await prisma.permission.findMany();
  const permissionIdByCode = new Map(
    permissionRows.map((row) => [row.code, row.id]),
  );

  for (const role of roles) {
    const granted = ROLE_PERMISSIONS[role.code];
    const codes =
      granted === '*' ? PERMISSIONS.map((entry) => entry.code) : granted;
    for (const code of codes) {
      const permissionId = permissionIdByCode.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        update: {},
        create: { roleId: role.id, permissionId, allowed: true },
      });
    }
  }
  console.log('Restaurant roles and permissions seeded.');

  const plans = [
    {
      id: PLAN_STARTER_ID,
      code: 'STARTER',
      name: 'Starter',
      entitlements: {
        'branch.max_count': 1,
        'station.custom_enabled': false,
        'reporting.advanced_enabled': false,
      },
    },
    {
      id: PLAN_PRO_ID,
      code: 'PRO',
      name: 'Pro',
      entitlements: {
        'branch.max_count': 3,
        'station.custom_enabled': true,
        'reporting.advanced_enabled': true,
      },
    },
    {
      id: PLAN_ENTERPRISE_ID,
      code: 'ENTERPRISE',
      name: 'Enterprise',
      entitlements: {
        'branch.max_count': 20,
        'station.custom_enabled': true,
        'reporting.advanced_enabled': true,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      update: {},
      create: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        status: 'ACTIVE',
        version: 1,
        entitlements: {
          create: Object.entries(plan.entitlements).map(([key, value]) => ({
            entitlementKey: key,
            valueJson: value,
          })),
        },
      },
    });
  }
  console.log('Subscription plans seeded.');

  return roles;
}

async function seedInventoryUnits() {
  const units = [
    { code: 'kg', name: 'Kilogram', category: 'weight', sortOrder: 10 },
    { code: 'g', name: 'Gram', category: 'weight', sortOrder: 20 },
    { code: 'L', name: 'Liter', category: 'volume', sortOrder: 30 },
    { code: 'ml', name: 'Milliliter', category: 'volume', sortOrder: 40 },
    { code: 'pcs', name: 'Piece', category: 'count', sortOrder: 50 },
    { code: 'dozen', name: 'Dozen', category: 'count', sortOrder: 60 },
    { code: 'portion', name: 'Portion', category: 'count', sortOrder: 70 },
    { code: 'pack', name: 'Pack', category: 'pack', sortOrder: 80 },
    { code: 'box', name: 'Box', category: 'pack', sortOrder: 90 },
    { code: 'bottle', name: 'Bottle', category: 'pack', sortOrder: 100 },
  ];

  for (const unit of units) {
    await prisma.inventoryUnit.upsert({
      where: { code: unit.code },
      update: {
        name: unit.name,
        category: unit.category,
        sortOrder: unit.sortOrder,
        status: 'ACTIVE',
      },
      create: {
        id: id(`inventory-unit:${unit.code}`),
        code: unit.code,
        name: unit.name,
        category: unit.category,
        sortOrder: unit.sortOrder,
        status: 'ACTIVE',
      },
    });
  }
  console.log('Inventory units seeded.');
}

async function main() {
  console.log("Seeding Mama's Kitchen demo...");

  const roles = await seedRolesAndPlans();
  await seedInventoryUnits();
  const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));

  const userMap = new Map<string, string>();

  for (const person of STAFF) {
    const passwordPlain = person.platformAdmin ? 'demo123' : person.pin;
    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    let dbUser = await prisma.appUser.findFirst({
      where: {
        OR: [{ id: person.id }, { email: person.email }],
      },
    });

    if (dbUser) {
      dbUser = await prisma.appUser.update({
        where: { id: dbUser.id },
        data: {
          email: person.email,
          phone: person.phone,
          displayName: person.displayName,
          accountStatus: 'ACTIVE',
          credential: {
            upsert: {
              create: { passwordHash, authProvider: 'email' },
              update: { passwordHash, authProvider: 'email' },
            },
          },
        },
      });
    } else {
      dbUser = await prisma.appUser.create({
        data: {
          id: person.id,
          email: person.email,
          phone: person.phone,
          displayName: person.displayName,
          accountStatus: 'ACTIVE',
          authProvider: 'email',
          credential: {
            create: { passwordHash, authProvider: 'email' },
          },
          platformRoles: person.platformAdmin
            ? {
                create: {
                  roleCode: 'PLATFORM_SUPER_ADMIN',
                  status: 'ACTIVE',
                },
              }
            : undefined,
        },
      });
    }

    userMap.set(person.id, dbUser.id);
  }
  console.log('Users seeded.');

  for (const person of STAFF.filter((entry) => entry.platformAdmin)) {
    const dbUserId = userMap.get(person.id)!;
    await prisma.platformUserRole.upsert({
      where: {
        userId_roleCode: {
          userId: dbUserId,
          roleCode: 'PLATFORM_SUPER_ADMIN',
        },
      },
      update: { status: 'ACTIVE' },
      create: {
        userId: dbUserId,
        roleCode: 'PLATFORM_SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });
  }
  console.log('Platform super-admin role granted (selam@fanaye.et / demo123).');

  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {
      displayName: "Mama's Kitchen",
      legalName: "Mama's Kitchen PLC",
      status: 'ACTIVE',
      suspendedAt: null,
      activatedAt: new Date(),
    },
    create: {
      id: TENANT_ID,
      displayName: "Mama's Kitchen",
      legalName: "Mama's Kitchen PLC",
      status: 'ACTIVE',
      defaultTimezone: 'Africa/Addis_Ababa',
      currencyCode: 'ETB',
      settingsVersion: 1,
      activatedAt: new Date(),
      settings: {
        create: {
          defaultShiftGraceMinutes: 15,
          waiterMayClosePaidTable: true,
          cashierMayCollectCustomerPayment: false,
          protectedCancellationPolicy: 'MANAGER_APPROVAL',
          unresolvedProductionBillPolicy: 'BLOCK',
          settingsVersion: 1,
        },
      },
      subscriptions: {
        create: {
          planId: PLAN_PRO_ID,
          subscriptionStatus: 'ACTIVE',
          effectiveFrom: new Date(),
        },
      },
    },
  });

  await prisma.tenantSite.upsert({
    where: { tenantId: TENANT_ID },
    update: {
      slug: TENANT_SLUG,
      status: 'PUBLISHED',
      themeJson: { primary: '#C45C26' },
      draftDataJson: { name: "Mama's Kitchen" },
      publishedDataJson: { name: "Mama's Kitchen" },
      publishedAt: new Date(),
    },
    create: {
      id: id('tenant-site:mamas'),
      tenantId: TENANT_ID,
      slug: TENANT_SLUG,
      status: 'PUBLISHED',
      themeJson: { primary: '#C45C26' },
      draftDataJson: { name: "Mama's Kitchen" },
      publishedDataJson: { name: "Mama's Kitchen" },
      publishedAt: new Date(),
    },
  });
  console.log("Mama's Kitchen tenant + site seeded (slug: mamas-kitchen).");

  // Branches first (needed for staff branch assignments)
  const branchMap = new Map<string, string>();
  const shiftDefMap = new Map<
    string,
    { morningId: string; eveningId: string }
  >();

  for (const branch of BRANCHES) {
    let dbBranch = await prisma.branch.findFirst({
      where: {
        OR: [
          { id: branch.id },
          { tenantId: TENANT_ID, displayCode: branch.displayCode },
        ],
      },
    });

    if (dbBranch) {
      dbBranch = await prisma.branch.update({
        where: { id: dbBranch.id },
        data: {
          tenantId: TENANT_ID,
          name: branch.name,
          displayCode: branch.displayCode,
          status: 'ACTIVE',
        },
      });
    } else {
      dbBranch = await prisma.branch.create({
        data: {
          id: branch.id,
          tenantId: TENANT_ID,
          name: branch.name,
          displayCode: branch.displayCode,
          timezone: 'Africa/Addis_Ababa',
          status: 'ACTIVE',
          openingTime: new Date('1970-01-01T07:00:00.000Z'),
          closingTime: new Date('1970-01-01T23:00:00.000Z'),
          businessDayCutoff: new Date('1970-01-01T03:00:00.000Z'),
          settings: {
            create: {
              tenantId: TENANT_ID,
              shiftEndWarningMinutes: 15,
              settingsVersion: 1,
            },
          },
        },
      });
    }

    branchMap.set(branch.key, dbBranch.id);

    const morningShiftId = id(`shift-def:${branch.key}:morning`);
    const eveningShiftId = id(`shift-def:${branch.key}:evening`);

    let dbMorningShift = await prisma.shiftDefinition.findFirst({
      where: {
        OR: [
          { id: morningShiftId },
          { branchId: dbBranch.id, name: 'Morning' },
        ],
      },
    });
    if (dbMorningShift) {
      dbMorningShift = await prisma.shiftDefinition.update({
        where: { id: dbMorningShift.id },
        data: {
          branchId: dbBranch.id,
          name: 'Morning',
          startLocalTime: new Date('1970-01-01T07:00:00.000Z'),
          endLocalTime: new Date('1970-01-01T15:00:00.000Z'),
          graceMinutes: 15,
          status: 'ACTIVE',
        },
      });
    } else {
      dbMorningShift = await prisma.shiftDefinition.create({
        data: {
          id: morningShiftId,
          tenantId: TENANT_ID,
          branchId: dbBranch.id,
          name: 'Morning',
          startLocalTime: new Date('1970-01-01T07:00:00.000Z'),
          endLocalTime: new Date('1970-01-01T15:00:00.000Z'),
          graceMinutes: 15,
          status: 'ACTIVE',
        },
      });
    }

    let dbEveningShift = await prisma.shiftDefinition.findFirst({
      where: {
        OR: [
          { id: eveningShiftId },
          { branchId: dbBranch.id, name: 'Evening' },
        ],
      },
    });
    if (dbEveningShift) {
      dbEveningShift = await prisma.shiftDefinition.update({
        where: { id: dbEveningShift.id },
        data: {
          branchId: dbBranch.id,
          name: 'Evening',
          startLocalTime: new Date('1970-01-01T15:00:00.000Z'),
          endLocalTime: new Date('1970-01-01T23:00:00.000Z'),
          graceMinutes: 15,
          status: 'ACTIVE',
        },
      });
    } else {
      dbEveningShift = await prisma.shiftDefinition.create({
        data: {
          id: eveningShiftId,
          tenantId: TENANT_ID,
          branchId: dbBranch.id,
          name: 'Evening',
          startLocalTime: new Date('1970-01-01T15:00:00.000Z'),
          endLocalTime: new Date('1970-01-01T23:00:00.000Z'),
          graceMinutes: 15,
          status: 'ACTIVE',
        },
      });
    }

    shiftDefMap.set(branch.key, {
      morningId: dbMorningShift.id,
      eveningId: dbEveningShift.id,
    });
  }
  console.log('Branches and shift definitions seeded.');

  // Staff memberships before tables / station assignments (FK)
  const membershipMap = new Map<string, string>();

  for (const person of STAFF) {
    if (!person.restaurantRole) continue;
    const dbUserId = userMap.get(person.id) || person.id;
    const membershipId = membershipIdForUser(person.id);

    let dbMembership = await prisma.tenantStaffMembership.findFirst({
      where: {
        OR: [
          { id: membershipId },
          { tenantId: TENANT_ID, userId: dbUserId },
        ],
      },
    });

    if (dbMembership) {
      dbMembership = await prisma.tenantStaffMembership.update({
        where: { id: dbMembership.id },
        data: {
          employeeDisplayName: person.displayName,
          status: 'ACTIVE',
        },
      });
    } else {
      dbMembership = await prisma.tenantStaffMembership.create({
        data: {
          id: membershipId,
          tenantId: TENANT_ID,
          userId: dbUserId,
          employeeDisplayName: person.displayName,
          status: 'ACTIVE',
          joinedAt: new Date(),
          workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        },
      });
    }

    membershipMap.set(person.id, dbMembership.id);

    const roleId = roleIdByCode.get(person.restaurantRole)!;
    const branchScopeId =
      person.branchKey && person.branchKey !== 'ALL'
        ? branchMap.get(person.branchKey)!
        : null;

    if (branchScopeId) {
      let bsa = await prisma.branchStaffAssignment.findFirst({
        where: {
          OR: [
            { id: id(`bsa:${person.id}`) },
            { branchId: branchScopeId, staffMembershipId: dbMembership.id },
          ],
        },
      });

      if (bsa) {
        await prisma.branchStaffAssignment.update({
          where: { id: bsa.id },
          data: {
            branchId: branchScopeId,
            staffMembershipId: dbMembership.id,
            status: 'ACTIVE',
          },
        });
      } else {
        await prisma.branchStaffAssignment.create({
          data: {
            id: id(`bsa:${person.id}`),
            tenantId: TENANT_ID,
            branchId: branchScopeId,
            staffMembershipId: dbMembership.id,
            status: 'ACTIVE',
          },
        });
      }
    }

    let sra = await prisma.staffRoleAssignment.findFirst({
      where: {
        OR: [
          { id: id(`sra:${person.id}`) },
          {
            staffMembershipId: dbMembership.id,
            roleId,
            branchId: branchScopeId,
          },
        ],
      },
    });

    if (sra) {
      await prisma.staffRoleAssignment.update({
        where: { id: sra.id },
        data: {
          staffMembershipId: dbMembership.id,
          roleId,
          branchId: branchScopeId,
          status: 'ACTIVE',
        },
      });
    } else {
      await prisma.staffRoleAssignment.create({
        data: {
          id: id(`sra:${person.id}`),
          tenantId: TENANT_ID,
          staffMembershipId: dbMembership.id,
          roleId,
          branchId: branchScopeId,
          status: 'ACTIVE',
        },
      });
    }
  }
  console.log("Mama's Kitchen staff memberships seeded.");

  const branchRuntimes: BranchRuntime[] = [];

  for (const branch of BRANCHES) {
    const branchDbId = branchMap.get(branch.key)!;

    const locId = id(`loc:${branch.key}:main`);
    let mainLoc = await prisma.tableLocation.findFirst({
      where: {
        OR: [
          { id: locId },
          { branchId: branchDbId, name: 'Main Floor' },
        ],
      },
    });

    if (mainLoc) {
      mainLoc = await prisma.tableLocation.update({
        where: { id: mainLoc.id },
        data: { branchId: branchDbId, name: 'Main Floor', code: 'MAIN', status: 'ACTIVE' },
      });
    } else {
      mainLoc = await prisma.tableLocation.create({
        data: {
          id: locId,
          tenantId: TENANT_ID,
          branchId: branchDbId,
          name: 'Main Floor',
          code: 'MAIN',
          sortOrder: 0,
          status: 'ACTIVE',
        },
      });
    }

    const tableIds: string[] = [];
    const waiters = STAFF.filter(
      (s) => s.branchKey === branch.key && s.restaurantRole === 'WAITER',
    );
    for (let n = 1; n <= 12; n++) {
      const tableId = id(`table:${branch.key}:${n}`);
      const assignedWaiterMembershipId =
        membershipMap.get(waiters[n <= 6 ? 0 : 1].id) ||
        membershipIdForUser(waiters[n <= 6 ? 0 : 1].id);
      const displayName = `Table ${n}`;

      let dbTable = await prisma.diningTable.findFirst({
        where: {
          OR: [
            { id: tableId },
            { branchId: branchDbId, displayName },
          ],
        },
      });

      if (dbTable) {
        dbTable = await prisma.diningTable.update({
          where: { id: dbTable.id },
          data: {
            assignedWaiterMembershipId,
            status: 'AVAILABLE',
            branchId: branchDbId,
            locationId: mainLoc.id,
            displayName,
            displayNumber: String(n),
          },
        });
      } else {
        dbTable = await prisma.diningTable.create({
          data: {
            id: tableId,
            tenantId: TENANT_ID,
            branchId: branchDbId,
            locationId: mainLoc.id,
            displayName,
            displayNumber: String(n),
            status: 'AVAILABLE',
            sortOrder: n - 1,
            assignedWaiterMembershipId,
          },
        });
      }
      tableIds.push(dbTable.id);
    }

    const callLocId = id(`loc:${branch.key}:call-pickup`);
    let callLoc = await prisma.tableLocation.findFirst({
      where: {
        OR: [
          { id: callLocId },
          { branchId: branchDbId, name: 'Call pickup' },
        ],
      },
    });

    if (callLoc) {
      callLoc = await prisma.tableLocation.update({
        where: { id: callLoc.id },
        data: { status: 'ACTIVE', name: 'Call pickup', code: 'CALL_PICKUP', branchId: branchDbId },
      });
    } else {
      callLoc = await prisma.tableLocation.create({
        data: {
          id: callLocId,
          tenantId: TENANT_ID,
          branchId: branchDbId,
          name: 'Call pickup',
          code: 'CALL_PICKUP',
          sortOrder: 99,
          status: 'ACTIVE',
        },
      });
    }

    for (let n = 1; n <= 8; n++) {
      const callTableId = id(`table:${branch.key}:call:${n}`);
      const displayName = `Call ${n}`;

      let dbCallTable = await prisma.diningTable.findFirst({
        where: {
          OR: [
            { id: callTableId },
            { branchId: branchDbId, displayName },
          ],
        },
      });

      if (dbCallTable) {
        await prisma.diningTable.update({
          where: { id: dbCallTable.id },
          data: {
            status: 'AVAILABLE',
            locationId: callLoc.id,
            branchId: branchDbId,
            displayName,
            displayNumber: `C${n}`,
          },
        });
      } else {
        await prisma.diningTable.create({
          data: {
            id: callTableId,
            tenantId: TENANT_ID,
            branchId: branchDbId,
            locationId: callLoc.id,
            displayName,
            displayNumber: `C${n}`,
            status: 'AVAILABLE',
            sortOrder: n - 1,
            assignedWaiterMembershipId: null,
          },
        });
      }
    }

    const stationDefs = [
      { code: 'KITCHEN', name: 'Kitchen', delay: 12, sort: 0 },
      { code: 'BARISTA', name: 'Barista', delay: 4, sort: 1 },
      { code: 'CAKES', name: 'Cakes', delay: 3, sort: 2 },
      { code: 'SOFT_DRINKS', name: 'Soft Drinks', delay: 2, sort: 3 },
    ];
    const stationIdByCode = new Map<string, string>();
    for (const station of stationDefs) {
      const stationId = id(`station:${branch.key}:${station.code}`);
      let dbStation = await prisma.preparationStation.findFirst({
        where: {
          OR: [
            { id: stationId },
            { branchId: branchDbId, code: station.code },
          ],
        },
      });

      if (dbStation) {
        dbStation = await prisma.preparationStation.update({
          where: { id: dbStation.id },
          data: {
            branchId: branchDbId,
            name: station.name,
            code: station.code,
            status: 'ACTIVE',
            defaultDelayThresholdMinutes: station.delay,
            sortOrder: station.sort,
          },
        });
      } else {
        dbStation = await prisma.preparationStation.create({
          data: {
            id: stationId,
            tenantId: TENANT_ID,
            branchId: branchDbId,
            name: station.name,
            code: station.code,
            status: 'ACTIVE',
            defaultDelayThresholdMinutes: station.delay,
            sortOrder: station.sort,
          },
        });
      }
      stationIdByCode.set(station.code, dbStation.id);
    }

    const operators = STAFF.filter(
      (s) =>
        s.branchKey === branch.key && s.restaurantRole === 'STATION_OPERATOR',
    );
    const stationCodes = ['KITCHEN', 'BARISTA'];
    for (let i = 0; i < operators.length; i++) {
      const op = operators[i];
      const opMembershipId =
        membershipMap.get(op.id) || membershipIdForUser(op.id);
      const stationCode = stationCodes[i % stationCodes.length];
      const stId = stationIdByCode.get(stationCode)!;

      let ssa = await prisma.stationStaffAssignment.findFirst({
        where: {
          OR: [
            { id: id(`station-assign:${op.id}`) },
            { stationId: stId, staffMembershipId: opMembershipId },
          ],
        },
      });

      if (ssa) {
        await prisma.stationStaffAssignment.update({
          where: { id: ssa.id },
          data: {
            branchId: branchDbId,
            stationId: stId,
            staffMembershipId: opMembershipId,
            status: 'ACTIVE',
          },
        });
      } else {
        await prisma.stationStaffAssignment.create({
          data: {
            id: id(`station-assign:${op.id}`),
            tenantId: TENANT_ID,
            branchId: branchDbId,
            stationId: stId,
            staffMembershipId: opMembershipId,
            status: 'ACTIVE',
          },
        });
      }
    }

    const menuId = id(`menu:${branch.key}`);
    const periodId = id(`period:${branch.key}:all`);

    let dbMenu = await prisma.menu.findFirst({
      where: {
        OR: [
          { id: menuId },
          { branchId: branchDbId, name: 'All day' },
        ],
      },
    });

    if (dbMenu) {
      dbMenu = await prisma.menu.update({
        where: { id: dbMenu.id },
        data: { branchId: branchDbId, name: 'All day', status: 'ACTIVE' },
      });
    } else {
      dbMenu = await prisma.menu.create({
        data: {
          id: menuId,
          tenantId: TENANT_ID,
          branchId: branchDbId,
          name: 'All day',
          status: 'ACTIVE',
        },
      });
    }

    let dbPeriod = await prisma.menuPeriod.findFirst({
      where: {
        OR: [
          { id: periodId },
          { menuId: dbMenu.id, name: 'All day' },
        ],
      },
    });

    if (dbPeriod) {
      dbPeriod = await prisma.menuPeriod.update({
        where: { id: dbPeriod.id },
        data: {
          name: 'All day',
          startLocalTime: new Date('1970-01-01T07:00:00.000Z'),
          endLocalTime: new Date('1970-01-01T23:00:00.000Z'),
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          status: 'ACTIVE',
          sortOrder: 0,
        },
      });
    } else {
      dbPeriod = await prisma.menuPeriod.create({
        data: {
          id: periodId,
          tenantId: TENANT_ID,
          menuId: dbMenu.id,
          name: 'All day',
          startLocalTime: new Date('1970-01-01T07:00:00.000Z'),
          endLocalTime: new Date('1970-01-01T23:00:00.000Z'),
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          status: 'ACTIVE',
          sortOrder: 0,
        },
      });
    }

    const categories = [
      'Kitchen',
      'Barista',
      'Cakes',
      'Soft Drinks',
    ] as const;
    const categoryIdByName = new Map<string, string>();
    for (const [index, name] of categories.entries()) {
      const catId = id(`cat:${branch.key}:${name}`);
      let dbCat = await prisma.menuCategory.findFirst({
        where: {
          OR: [
            { id: catId },
            { menuId: dbMenu.id, name },
          ],
        },
      });

      if (dbCat) {
        dbCat = await prisma.menuCategory.update({
          where: { id: dbCat.id },
          data: { name, status: 'ACTIVE', sortOrder: index },
        });
      } else {
        dbCat = await prisma.menuCategory.create({
          data: {
            id: catId,
            tenantId: TENANT_ID,
            menuId: dbMenu.id,
            name,
            status: 'ACTIVE',
            sortOrder: index,
          },
        });
      }
      categoryIdByName.set(name, dbCat.id);
    }

    const menuItems: BranchRuntime['menuItems'] = [];
    for (const [index, dish] of MENU_DISHES.entries()) {
      const menuItemId = id(`item:${branch.key}:${dish.key}`);
      const stationId = stationIdByCode.get(dish.station)!;
      const catId = categoryIdByName.get(dish.category)!;

      let dbMenuItem = await prisma.menuItem.findFirst({
        where: {
          OR: [
            { id: menuItemId },
            { menuId: dbMenu.id, name: dish.name },
          ],
        },
      });

      if (dbMenuItem) {
        dbMenuItem = await prisma.menuItem.update({
          where: { id: dbMenuItem.id },
          data: {
            menuCategoryId: catId,
            name: dish.name,
            currentPrice: dish.price,
            preparationStationId: stationId,
            expectedPrepMinutes: dish.prep,
            status: 'ACTIVE',
            sortOrder: index,
          },
        });
      } else {
        dbMenuItem = await prisma.menuItem.create({
          data: {
            id: menuItemId,
            tenantId: TENANT_ID,
            menuId: dbMenu.id,
            menuCategoryId: catId,
            name: dish.name,
            currentPrice: dish.price,
            currencyCode: 'ETB',
            preparationStationId: stationId,
            expectedPrepMinutes: dish.prep,
            status: 'ACTIVE',
            sortOrder: index,
          },
        });
      }

      const existingPeriodAssign =
        await prisma.menuItemPeriodAssignment.findUnique({
          where: {
            menuItemId_menuPeriodId: {
              menuItemId: dbMenuItem.id,
              menuPeriodId: dbPeriod.id,
            },
          },
        });

      if (!existingPeriodAssign) {
        await prisma.menuItemPeriodAssignment.create({
          data: {
            menuItemId: dbMenuItem.id,
            menuPeriodId: dbPeriod.id,
          },
        });
      }

      menuItems.push({
        id: dbMenuItem.id,
        name: dish.name,
        price: dish.price,
        stationId,
        stationName: dish.station.replace('_', ' '),
        prep: dish.prep,
      });
    }

    const shiftDefs = shiftDefMap.get(branch.key)!;
    branchRuntimes.push(
      buildBranchRuntime(
        branch.key,
        branchDbId,
        tableIds,
        menuItems,
        shiftDefs.morningId,
        shiftDefs.eveningId,
        membershipMap,
      ),
    );
  }
  console.log('Tables, stations, and menus seeded.');

  const today = startOfDay(new Date());
  const biz = businessDateOnly(today);
  for (const runtime of branchRuntimes) {
    for (const [
      index,
      waiterMembershipId,
    ] of runtime.waiterMembershipIds.entries()) {
      const shiftId = id(`today-shift:${runtime.key}:${waiterMembershipId}`);
      let dbShift = await prisma.shiftSession.findFirst({
        where: {
          OR: [
            { id: shiftId },
            {
              tenantId: TENANT_ID,
              branchId: runtime.branchId,
              staffMembershipId: waiterMembershipId,
              state: 'OPEN',
            },
          ],
        },
      });

      if (dbShift) {
        await prisma.shiftSession.update({
          where: { id: dbShift.id },
          data: { state: 'OPEN', clockOutAt: null },
        });
      } else {
        await prisma.shiftSession.create({
          data: {
            id: shiftId,
            tenantId: TENANT_ID,
            branchId: runtime.branchId,
            staffMembershipId: waiterMembershipId,
            roleId: 3,
            clockInAt: atTime(today, index === 0 ? 7 : 15, 0),
            state: 'OPEN',
            businessDate: biz,
            lateByMinutes: 0,
            graceMinutesSnapshot: 15,
          },
        });
      }
    }
    const cashierShiftId = id(
      `today-shift:${runtime.key}:${runtime.cashierMembershipId}`,
    );
    let dbCashierShift = await prisma.shiftSession.findFirst({
      where: {
        OR: [
          { id: cashierShiftId },
          {
            tenantId: TENANT_ID,
            branchId: runtime.branchId,
            staffMembershipId: runtime.cashierMembershipId,
            state: 'OPEN',
          },
        ],
      },
    });

    if (dbCashierShift) {
      await prisma.shiftSession.update({
        where: { id: dbCashierShift.id },
        data: { state: 'OPEN', clockOutAt: null },
      });
    } else {
      await prisma.shiftSession.create({
        data: {
          id: cashierShiftId,
          tenantId: TENANT_ID,
          branchId: runtime.branchId,
          staffMembershipId: runtime.cashierMembershipId,
          roleId: 4,
          clockInAt: atTime(today, 8, 0),
          state: 'OPEN',
          businessDate: biz,
          lateByMinutes: 0,
          graceMinutesSnapshot: 15,
        },
      });
    }
  }
  console.log('Today open shift sessions seeded.');

  await seedTwoYearHistory(prisma, branchRuntimes);

  console.log("Seeding finished — Mama's Kitchen ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
