import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service';
import { AllConfigType } from '../config/config.type';
import { PrismaService } from '../database/prisma.service';
import { IdentityContextService } from '../identity/identity-context.service';

const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function localTimeToMinutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function isTimeInShiftWindow(
  nowMinutes: number,
  startLocalTime: Date,
  endLocalTime: Date,
): boolean {
  const start = localTimeToMinutes(startLocalTime);
  const end = localTimeToMinutes(endLocalTime);
  if (start <= end) {
    return nowMinutes >= start && nowMinutes <= end;
  }
  return nowMinutes >= start || nowMinutes <= end;
}

@Injectable()
export class FloorKioskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly identity: IdentityContextService,
    private readonly authService: AuthService,
  ) {}

  private async resolveKioskToken(authHeader?: string): Promise<{
    tenantId: string;
    branchId: string;
  }> {
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('Floor kiosk token required.');
    }

    const secret = this.configService.getOrThrow('auth.secret', {
      infer: true,
    });

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, { secret });
    } catch {
      throw new UnauthorizedException('Invalid or expired floor kiosk token.');
    }

    if (payload?.isFloorKiosk && payload?.tenantId && payload?.branchId) {
      return {
        tenantId: String(payload.tenantId),
        branchId: String(payload.branchId),
      };
    }

    if (payload?.id) {
      const ctx = await this.identity.getByUserId(String(payload.id));
      if (!ctx.tenantId || !ctx.branchId) {
        throw new ForbiddenException('Branch context required.');
      }
      return {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
      };
    }

    throw new UnauthorizedException('Invalid floor kiosk token.');
  }

  async unlockKiosk(input: {
    tenantIdentifier?: string;
    branchId?: string;
    pin: string;
  }) {
    const pin = String(input.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      throw new BadRequestException('Global Floor PIN must be 4 digits.');
    }

    const identifier = input.tenantIdentifier?.trim();
    const tenant = identifier
      ? await this.prisma.tenant.findFirst({
          where: {
            OR: [
              ...(identifier.match(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
              )
                ? [{ id: identifier }]
                : []),
              { displayName: { equals: identifier, mode: 'insensitive' } },
              { legalName: { equals: identifier, mode: 'insensitive' } },
              {
                sites: {
                  some: { slug: { equals: identifier, mode: 'insensitive' } },
                },
              },
            ],
          },
          select: {
            id: true,
            displayName: true,
            sites: { take: 1, select: { slug: true } },
          },
        })
      : await this.prisma.tenant.findFirst({
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            displayName: true,
            sites: { take: 1, select: { slug: true } },
          },
        });

    if (!tenant) {
      throw new NotFoundException('Restaurant workspace not found.');
    }

    const branch = input.branchId
      ? await this.prisma.branch.findFirst({
          where: { id: input.branchId, tenantId: tenant.id, status: 'ACTIVE' },
          select: { id: true, name: true },
        })
      : await this.prisma.branch.findFirst({
          where: { tenantId: tenant.id, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true },
        });

    if (!branch) {
      throw new NotFoundException('Active branch not found.');
    }

    const settings = await this.prisma.branchSettings.findUnique({
      where: { branchId: branch.id },
      select: { floorKioskPin: true, readyOverdueMinutes: true },
    });

    if (settings?.floorKioskPin) {
      if (settings.floorKioskPin !== pin) {
        throw new UnauthorizedException('Invalid Global Floor PIN.');
      }
    } else {
      let loginResult: Awaited<ReturnType<AuthService['validatePinLogin']>>;
      try {
        loginResult = await this.authService.validatePinLogin({
          pin,
          tenantSlug: tenant.id,
          remember: false,
        });
      } catch {
        throw new UnauthorizedException(
          'Invalid Global Floor PIN. Set a Floor Kiosk PIN in Manager/Owner settings or enter a Manager PIN.',
        );
      }
      const staffCtx = await this.identity.getByUserId(
        String(loginResult.user.id),
      );
      if (
        staffCtx.roleCode !== 'OWNER_ADMIN' &&
        staffCtx.roleCode !== 'MANAGER'
      ) {
        throw new ForbiddenException(
          'Global Floor PIN is not set yet. A Manager or Owner PIN is required to unlock the shared tablet.',
        );
      }
    }

    const secret = this.configService.getOrThrow('auth.secret', {
      infer: true,
    });
    const kioskToken = await this.jwtService.signAsync(
      {
        isFloorKiosk: true,
        tenantId: tenant.id,
        branchId: branch.id,
      },
      {
        secret,
        expiresIn: '24h',
      },
    );

    return {
      kioskToken,
      tenantId: tenant.id,
      tenantName: tenant.displayName,
      tenantSlug: tenant.sites[0]?.slug ?? tenant.id,
      branchId: branch.id,
      branchName: branch.name,
      readyOverdueMinutes: settings?.readyOverdueMinutes ?? 3,
    };
  }

  private async getCurrentShiftCoverageMap(branchId: string) {
    const now = new Date();
    const dayCode = DAY_CODES[now.getDay()];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const shiftDefs = await this.prisma.shiftDefinition.findMany({
      where: { branchId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        startLocalTime: true,
        endLocalTime: true,
      },
    });

    const activeShiftIds = shiftDefs
      .filter((sd) =>
        isTimeInShiftWindow(nowMinutes, sd.startLocalTime, sd.endLocalTime),
      )
      .map((sd) => sd.id);

    const coverages =
      activeShiftIds.length > 0
        ? await this.prisma.diningTableShiftCoverage.findMany({
            where: {
              branchId,
              dayCode,
              shiftDefinitionId: { in: activeShiftIds },
            },
            include: {
              waiter: { select: { id: true, employeeDisplayName: true } },
            },
          })
        : [];

    const map = new Map<
      string,
      { waiterMembershipId: string; waiterName: string }
    >();
    for (const c of coverages) {
      if (!map.has(c.diningTableId)) {
        map.set(c.diningTableId, {
          waiterMembershipId: c.waiterMembershipId,
          waiterName: c.waiter.employeeDisplayName,
        });
      }
    }
    return map;
  }

  async getKioskBoard(authHeader?: string) {
    const { tenantId, branchId } = await this.resolveKioskToken(authHeader);

    const [branch, settings, coverageMap, tables] = await Promise.all([
      this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, name: true },
      }),
      this.prisma.branchSettings.findUnique({
        where: { branchId },
        select: { readyOverdueMinutes: true },
      }),
      this.getCurrentShiftCoverageMap(branchId),
      this.prisma.diningTable.findMany({
        where: {
          tenantId,
          branchId,
          archivedAt: null,
          location: { NOT: { code: 'CALL_PICKUP' } },
        },
        orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
        include: {
          location: { select: { id: true, name: true } },
          assignedWaiter: {
            select: { id: true, employeeDisplayName: true },
          },
          sessions: {
            where: { closedAt: null, status: { not: 'CLOSED' } },
            orderBy: { openedAt: 'desc' },
            take: 1,
            include: {
              primaryWaiter: {
                select: { id: true, employeeDisplayName: true },
              },
              orderItems: {
                where: { state: 'READY' },
                orderBy: { readyAt: 'asc' },
                select: {
                  id: true,
                  itemNameSnapshot: true,
                  quantity: true,
                  stationNameSnapshot: true,
                  readyAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      branchId,
      branchName: branch?.name ?? 'Main Floor',
      readyOverdueMinutes: settings?.readyOverdueMinutes ?? 3,
      serverTime: new Date().toISOString(),
      tables: tables.map((table) => {
        const activeSession = table.sessions[0] ?? null;
        const shiftCoverage = coverageMap.get(table.id) ?? null;

        const assignedWaiterId =
          activeSession?.primaryWaiterMembershipId ??
          shiftCoverage?.waiterMembershipId ??
          table.assignedWaiterMembershipId ??
          null;
        const assignedWaiterName =
          activeSession?.primaryWaiter?.employeeDisplayName ??
          shiftCoverage?.waiterName ??
          table.assignedWaiter?.employeeDisplayName ??
          null;

        const readyItems = (activeSession?.orderItems ?? []).map((oi) => ({
          id: oi.id,
          name: oi.itemNameSnapshot,
          quantity: oi.quantity,
          stationName: oi.stationNameSnapshot,
          readyAt: oi.readyAt?.toISOString() ?? null,
        }));

        const oldestReadyAt =
          readyItems.find((ri) => ri.readyAt)?.readyAt ?? null;

        return {
          id: table.id,
          displayName: table.displayName,
          displayNumber: table.displayNumber,
          locationName: table.location?.name ?? 'Floor',
          status: activeSession
            ? activeSession.status === 'BILL_REQUESTED'
              ? 'BILL_REQUESTED'
              : 'OCCUPIED'
            : table.status,
          isVip: table.isVip,
          assignedWaiterId,
          assignedWaiterName,
          activeSession: activeSession
            ? {
                id: activeSession.id,
                status: activeSession.status,
                openedAt: activeSession.openedAt.toISOString(),
                billRequestedAt:
                  activeSession.billRequestedAt?.toISOString() ?? null,
              }
            : null,
          readyItems,
          oldestReadyAt,
        };
      }),
    };
  }

  async verifyTableAccess(
    authHeader: string | undefined,
    dto: { tableId: string; pin: string },
  ) {
    const { tenantId, branchId } = await this.resolveKioskToken(authHeader);
    const pin = String(dto.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      throw new BadRequestException('Waiter PIN must be exactly 4 digits.');
    }

    let loginResult: Awaited<ReturnType<AuthService['validatePinLogin']>>;
    try {
      loginResult = await this.authService.validatePinLogin({
        pin,
        tenantSlug: tenantId,
        remember: false,
      });
    } catch {
      throw new UnauthorizedException('Invalid 4-digit PIN.');
    }

    const staffCtx = await this.identity.getByUserId(
      String(loginResult.user.id),
    );
    if (staffCtx.tenantId !== tenantId || !staffCtx.staffMembershipId) {
      throw new ForbiddenException(
        'Staff member does not belong to this branch.',
      );
    }

    const table = await this.prisma.diningTable.findFirst({
      where: {
        id: dto.tableId,
        tenantId,
        branchId,
        archivedAt: null,
        location: { NOT: { code: 'CALL_PICKUP' } },
      },
      include: {
        assignedWaiter: {
          select: { id: true, employeeDisplayName: true },
        },
        sessions: {
          where: { closedAt: null, status: { not: 'CLOSED' } },
          orderBy: { openedAt: 'desc' },
          take: 1,
          include: {
            primaryWaiter: {
              select: { id: true, employeeDisplayName: true },
            },
            assignments: {
              where: { releasedAt: null },
              select: { waiterMembershipId: true },
            },
          },
        },
      },
    });

    if (!table) {
      throw new NotFoundException('Table not found.');
    }

    const isManagerOrOwner =
      staffCtx.roleCode === 'OWNER_ADMIN' || staffCtx.roleCode === 'MANAGER';

    const activeSession = table.sessions[0] ?? null;

    if (!isManagerOrOwner) {
      if (activeSession) {
        const ownsSession =
          activeSession.primaryWaiterMembershipId ===
            staffCtx.staffMembershipId ||
          activeSession.assignments.some(
            (a) => a.waiterMembershipId === staffCtx.staffMembershipId,
          );
        if (!ownsSession) {
          throw new ForbiddenException(
            `${table.displayName} is currently served by ${activeSession.primaryWaiter?.employeeDisplayName ?? 'another waiter'}.`,
          );
        }
      } else {
        const coverageMap = await this.getCurrentShiftCoverageMap(branchId);
        const shiftCoverage = coverageMap.get(table.id);
        const expectedWaiterId =
          shiftCoverage?.waiterMembershipId ??
          table.assignedWaiterMembershipId ??
          null;
        const expectedWaiterName =
          shiftCoverage?.waiterName ??
          table.assignedWaiter?.employeeDisplayName ??
          null;

        if (
          expectedWaiterId &&
          expectedWaiterId !== staffCtx.staffMembershipId
        ) {
          throw new ForbiddenException(
            `${table.displayName} is assigned to ${expectedWaiterName ?? 'another waiter'} for this shift.`,
          );
        }
      }
    }

    return {
      login: loginResult,
      tableId: table.id,
      tableName: table.displayName,
      sessionId: activeSession?.id ?? null,
    };
  }

  async pairDevice(userId: string, branchId?: string) {
    const ctx = await this.identity.getByUserId(userId);
    if (
      !ctx.tenantId ||
      (ctx.roleCode !== 'OWNER_ADMIN' && ctx.roleCode !== 'MANAGER')
    ) {
      throw new ForbiddenException('Manager or Owner access required.');
    }
    const targetBranchId = branchId || ctx.branchId;
    if (!targetBranchId) {
      throw new BadRequestException('Branch is required.');
    }

    const [tenant, branch, settings] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: {
          id: true,
          displayName: true,
          sites: { take: 1, select: { slug: true } },
        },
      }),
      this.prisma.branch.findFirst({
        where: { id: targetBranchId, tenantId: ctx.tenantId, status: 'ACTIVE' },
        select: { id: true, name: true },
      }),
      this.prisma.branchSettings.findUnique({
        where: { branchId: targetBranchId },
        select: { readyOverdueMinutes: true },
      }),
    ]);

    if (!tenant || !branch) {
      throw new NotFoundException('Active restaurant branch not found.');
    }

    const secret = this.configService.getOrThrow('auth.secret', {
      infer: true,
    });
    const kioskToken = await this.jwtService.signAsync(
      {
        isFloorKiosk: true,
        tenantId: tenant.id,
        branchId: branch.id,
      },
      {
        secret,
        expiresIn: '365d',
      },
    );

    return {
      kioskToken,
      tenantId: tenant.id,
      tenantName: tenant.displayName,
      tenantSlug: tenant.sites[0]?.slug ?? tenant.id,
      branchId: branch.id,
      branchName: branch.name,
      readyOverdueMinutes: settings?.readyOverdueMinutes ?? 3,
    };
  }

  async getKioskSettings(userId: string, branchId?: string) {
    const ctx = await this.identity.getByUserId(userId);
    if (
      !ctx.tenantId ||
      (ctx.roleCode !== 'OWNER_ADMIN' && ctx.roleCode !== 'MANAGER')
    ) {
      throw new ForbiddenException('Manager or Owner access required.');
    }
    const targetBranchId = branchId || ctx.branchId;
    if (!targetBranchId) {
      throw new BadRequestException('Branch is required.');
    }

    const settings = await this.prisma.branchSettings.findUnique({
      where: { branchId: targetBranchId },
      select: { floorKioskPin: true, readyOverdueMinutes: true },
    });

    return {
      branchId: targetBranchId,
      floorKioskPin: settings?.floorKioskPin ?? null,
      readyOverdueMinutes: settings?.readyOverdueMinutes ?? 3,
    };
  }

  async updateKioskSettings(
    userId: string,
    dto: {
      branchId?: string;
      floorKioskPin?: string | null;
      readyOverdueMinutes?: number;
    },
  ) {
    const ctx = await this.identity.getByUserId(userId);
    if (
      !ctx.tenantId ||
      (ctx.roleCode !== 'OWNER_ADMIN' && ctx.roleCode !== 'MANAGER')
    ) {
      throw new ForbiddenException('Manager or Owner access required.');
    }
    const targetBranchId = dto.branchId || ctx.branchId;
    if (!targetBranchId) {
      throw new BadRequestException('Branch is required.');
    }

    const pinClean =
      dto.floorKioskPin === null || dto.floorKioskPin === ''
        ? null
        : dto.floorKioskPin?.trim();
    if (
      pinClean !== null &&
      pinClean !== undefined &&
      !/^\d{4}$/.test(pinClean)
    ) {
      throw new BadRequestException('Global Floor PIN must be 4 digits.');
    }

    const overdue =
      dto.readyOverdueMinutes !== undefined
        ? Math.min(Math.max(Number(dto.readyOverdueMinutes) || 3, 1), 60)
        : undefined;

    const updated = await this.prisma.branchSettings.upsert({
      where: { branchId: targetBranchId },
      create: {
        branchId: targetBranchId,
        tenantId: ctx.tenantId,
        floorKioskPin: pinClean ?? null,
        readyOverdueMinutes: overdue ?? 3,
      },
      update: {
        ...(dto.floorKioskPin !== undefined
          ? { floorKioskPin: pinClean }
          : {}),
        ...(overdue !== undefined ? { readyOverdueMinutes: overdue } : {}),
      },
      select: { floorKioskPin: true, readyOverdueMinutes: true },
    });

    return {
      branchId: targetBranchId,
      floorKioskPin: updated.floorKioskPin,
      readyOverdueMinutes: updated.readyOverdueMinutes,
    };
  }
}
