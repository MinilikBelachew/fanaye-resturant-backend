import {
  AppUser as PrismaAppUser,
  File as PrismaFile,
  PlatformUserRole as PrismaPlatformUserRole,
  UserCredential as PrismaUserCredential,
} from '@prisma/client';
import { User } from '../../../../domain/user';
import { FilePrismaMapper } from '../../../../../files/infrastructure/persistence/relational/mappers/file-prisma.mapper';
import { Role } from '../../../../../roles/domain/role';
import { Status } from '../../../../../statuses/domain/status';
import { RoleEnum } from '../../../../../roles/roles.enum';
import { StatusEnum } from '../../../../../statuses/statuses.enum';

export type AppUserWithRelations = PrismaAppUser & {
  photo?: PrismaFile | null;
  credential?: PrismaUserCredential | null;
  platformRoles?: PrismaPlatformUserRole[];
};

export const APP_USER_INCLUDE = {
  photo: true,
  credential: true,
  platformRoles: {
    where: { status: 'ACTIVE' },
  },
} as const;

export class UserPrismaMapper {
  static toDomain(raw: AppUserWithRelations): User {
    const domainEntity = new User();
    const names = splitDisplayName(raw.displayName);

    domainEntity.id = raw.id;
    domainEntity.email = raw.email;
    domainEntity.password = raw.credential?.passwordHash ?? undefined;
    domainEntity.provider =
      raw.credential?.authProvider ?? raw.authProvider ?? 'email';
    domainEntity.socialId = raw.credential?.socialId ?? null;
    domainEntity.firstName = names.firstName;
    domainEntity.lastName = names.lastName;
    domainEntity.role = roleFromPlatform(raw.platformRoles ?? []);
    domainEntity.status = statusFromAccount(raw.accountStatus);

    if (raw.photo) {
      domainEntity.photo = FilePrismaMapper.toDomain(raw.photo);
    }

    domainEntity.createdAt = raw.createdAt;
    domainEntity.updatedAt = raw.updatedAt;
    domainEntity.deletedAt =
      raw.accountStatus === 'DISABLED' ? raw.updatedAt : (null as any);

    return domainEntity;
  }

  static displayNameFrom(user: Partial<User>): string {
    return (
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.email ||
      'User'
    );
  }

  static accountStatusFrom(status?: Status | null): string {
    if (!status?.id) {
      return 'ACTIVE';
    }
    return Number(status.id) === StatusEnum.active ? 'ACTIVE' : 'DISABLED';
  }

  static isPlatformAdmin(role?: Role | null): boolean {
    return Number(role?.id) === RoleEnum.admin;
  }
}

function splitDisplayName(displayName: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: null, lastName: null };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function roleFromPlatform(roles: PrismaPlatformUserRole[]): Role {
  const role = new Role();
  const isAdmin = roles.some(
    (entry) =>
      entry.roleCode === 'PLATFORM_SUPER_ADMIN' && entry.status === 'ACTIVE',
  );
  role.id = isAdmin ? RoleEnum.admin : RoleEnum.user;
  role.name = isAdmin ? 'Admin' : 'User';
  return role;
}

function statusFromAccount(accountStatus: string): Status {
  const status = new Status();
  const active = accountStatus === 'ACTIVE';
  status.id = active ? StatusEnum.active : StatusEnum.inactive;
  status.name = active ? 'Active' : 'Inactive';
  return status;
}
