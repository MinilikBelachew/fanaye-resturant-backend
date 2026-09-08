import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthContextDto, AuthWorkspaceDto } from './dto/auth-context.dto';
import { PLATFORM_ROLE_CODE } from './identity.constants';

@Injectable()
export class IdentityContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getByUserId(userId: string): Promise<AuthContextDto> {
    const user = await this.prisma.appUser.findUnique({
      where: { id: String(userId) },
      include: {
        platformRoles: { where: { status: 'ACTIVE' } },
        staffMemberships: {
          where: { status: 'ACTIVE' },
          include: {
            tenant: true,
            branchAssignments: {
              where: { status: 'ACTIVE', releasedAt: null },
              include: { branch: true },
            },
            roleAssignments: {
              where: { status: 'ACTIVE', revokedAt: null },
              include: {
                role: {
                  include: {
                    permissions: {
                      where: { allowed: true },
                      include: { permission: true },
                    },
                  },
                },
              },
            },
            stationAssignments: {
              where: { status: 'ACTIVE', releasedAt: null },
              include: { station: true },
            },
            shiftSessions: {
              where: { state: 'OPEN', clockOutAt: null },
              orderBy: { clockInAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!user || user.accountStatus !== 'ACTIVE') {
      throw new UnauthorizedException();
    }

    const isPlatformAdmin = user.platformRoles.some(
      (role) => role.roleCode === PLATFORM_ROLE_CODE,
    );
    const membership = user.staffMemberships[0] ?? null;
    const roleAssignment = membership?.roleAssignments[0] ?? null;
    const branchAssignment = membership?.branchAssignments[0] ?? null;
    const stationAssignment = membership?.stationAssignments[0] ?? null;
    const openShift = membership?.shiftSessions[0] ?? null;
    const roleCode = isPlatformAdmin
      ? PLATFORM_ROLE_CODE
      : (roleAssignment?.role.code ?? 'NONE');


    const workspaces: AuthWorkspaceDto[] = [];
    if (isPlatformAdmin) {
      workspaces.push({
        workspace: PLATFORM_ROLE_CODE,
        roleCode: PLATFORM_ROLE_CODE,
        tenantId: null,
        branchId: null,
        staffMembershipId: null,
      });
    }
    for (const entry of user.staffMemberships) {
      const code = entry.roleAssignments[0]?.role.code ?? 'NONE';
      workspaces.push({
        workspace: code,
        roleCode: code,
        tenantId: entry.tenantId,
        branchId: entry.branchAssignments[0]?.branchId ?? null,
        staffMembershipId: entry.id,
      });
    }

    const permissions =
      roleAssignment?.role.permissions.map((item) => item.permission.code) ?? [];

    return {
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      tenantId: membership?.tenantId ?? null,
      branchId: branchAssignment?.branchId ?? null,
      branchName: branchAssignment?.branch.name ?? membership?.tenant.displayName ?? null,
      staffMembershipId: membership?.id ?? null,
      roleCode,
      stationId: stationAssignment?.stationId ?? null,
      stationCode: stationAssignment?.station.code ?? null,
      stationName: stationAssignment?.station.name ?? null,
      shiftSessionId: openShift?.id ?? null,
      permissions,
      workspaces,
    };
  }

  async findEmailByIdentifier(identifier: string): Promise<string | null> {
    const value = identifier.trim();
    if (value.includes('@')) {
      const user = await this.prisma.appUser.findFirst({
        where: { email: { equals: value, mode: 'insensitive' } },
        select: { email: true },
      });
      return user?.email ?? null;
    }

    const compact = value.replace(/[\s-]/g, '');
    const phones = new Set<string>([value, compact]);
    if (compact.startsWith('0') && compact.length === 10) {
      phones.add(`+251${compact.slice(1)}`);
    }
    if (compact.startsWith('251') && !compact.startsWith('+')) {
      phones.add(`+${compact}`);
    }
    if (compact.startsWith('+251')) {
      phones.add(compact);
    }

    const user = await this.prisma.appUser.findFirst({
      where: {
        phone: { in: [...phones] },
      },
      select: { email: true },
    });
    return user?.email ?? null;
  }
}
