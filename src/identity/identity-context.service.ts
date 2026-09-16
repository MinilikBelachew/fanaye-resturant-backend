import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AuthContextDto, AuthWorkspaceDto } from './dto/auth-context.dto';
import { PLATFORM_ROLE_CODE } from './identity.constants';

export interface PinTenantMatch {
  userId: string;
  email: string;
  displayName: string;
  tenantId: string;
  tenantName: string;
  role: string;
}

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
      roleAssignment?.role.permissions.map((item) => item.permission.code) ??
      [];

    return {
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      tenantId: membership?.tenantId ?? null,
      branchId: branchAssignment?.branchId ?? null,
      branchName:
        branchAssignment?.branch.name ?? membership?.tenant.displayName ?? null,
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

  async getTerminalStaffList(): Promise<
    { id: string; name: string; role: string; photoUrl: string | null }[]
  > {
    const users = await this.prisma.appUser.findMany({
      where: {
        accountStatus: 'ACTIVE',
        staffMemberships: {
          some: { status: 'ACTIVE' },
        },
      },
      include: {
        photo: true,
        staffMemberships: {
          where: { status: 'ACTIVE' },
          include: {
            roleAssignments: {
              where: { status: 'ACTIVE', revokedAt: null },
              include: { role: true },
            },
          },
        },
      },
      take: 24,
    });

    return users.map((u) => {
      const membership = u.staffMemberships[0];
      const role = membership?.roleAssignments[0]?.role?.code || 'STAFF';
      return {
        id: u.id,
        name: membership?.employeeDisplayName || u.displayName,
        role,
        photoUrl: u.photo?.path || null,
      };
    });
  }

  async findUserByPin(
    pin: string,
    staffId?: string,
    tenantIdentifier?: string,
  ): Promise<string | null> {
    const trimmedPin = pin.trim();
    if (!trimmedPin) return null;

    if (staffId) {
      const user = await this.prisma.appUser.findUnique({
        where: { id: staffId },
        include: { credential: true },
      });
      if (
        !user ||
        user.accountStatus !== 'ACTIVE' ||
        !user.credential?.passwordHash
      ) {
        return null;
      }
      const isMatch = await bcrypt.compare(
        trimmedPin,
        user.credential.passwordHash,
      );
      return isMatch ? (user.email ?? null) : null;
    }

    const isUuid =
      typeof tenantIdentifier === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        tenantIdentifier.trim(),
      );

    const tenantFilter = tenantIdentifier
      ? isUuid
        ? { id: tenantIdentifier.trim() }
        : {
            OR: [
              {
                displayName: {
                  equals: tenantIdentifier.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                legalName: {
                  equals: tenantIdentifier.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
      : undefined;

    const users = await this.prisma.appUser.findMany({
      where: {
        accountStatus: 'ACTIVE',
        staffMemberships: {
          some: {
            status: 'ACTIVE',
            ...(tenantFilter ? { tenant: tenantFilter } : {}),
          },
        },
      },
      include: {
        credential: true,
        staffMemberships: {
          where: {
            status: 'ACTIVE',
            ...(tenantFilter ? { tenant: tenantFilter } : {}),
          },
          include: {
            tenant: true,
            roleAssignments: {
              where: { status: 'ACTIVE' },
              include: { role: true },
            },
          },
        },
      },
    });

    const matches: PinTenantMatch[] = [];

    for (const user of users) {
      const cred = user.credential;
      if (cred?.passwordHash && user.email) {
        const isMatch = await bcrypt.compare(trimmedPin, cred.passwordHash);
        if (isMatch) {
          const membership = user.staffMemberships[0];
          const role = membership?.roleAssignments[0]?.role.code || 'WAITER';
          matches.push({
            userId: user.id,
            email: user.email,
            displayName: membership?.employeeDisplayName || user.displayName,
            tenantId: membership?.tenantId || '',
            tenantName:
              membership?.tenant.displayName ||
              membership?.tenant.legalName ||
              'Restaurant',
            role,
          });
        }
      }
    }

    if (matches.length === 1) {
      return matches[0].email;
    }

    if (matches.length > 1) {
      // Multiple restaurants match this PIN -> Disambiguation needed!
      throw new ConflictException({
        statusCode: 409,
        error: 'MULTIPLE_TENANTS_FOUND',
        message:
          'Multiple restaurants match this PIN. Please select your restaurant.',
        matches,
      });
    }

    return null;
  }
}
