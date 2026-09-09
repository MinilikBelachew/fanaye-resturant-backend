import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../database/prisma.service';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { FilterUserDto, SortUserDto } from '../../../../dto/query-user.dto';
import { User } from '../../../../domain/user';
import { UserRepository } from '../../user.repository';
import {
  APP_USER_INCLUDE,
  UserPrismaMapper,
} from '../mappers/user-prisma.mapper';
import { IPaginationOptions } from '../../../../../utils/types/pagination-options';
import { RoleEnum } from '../../../../../roles/roles.enum';

const SORT_FIELD_MAP: Record<
  string,
  keyof Prisma.AppUserOrderByWithRelationInput
> = {
  firstName: 'displayName',
  lastName: 'displayName',
  email: 'email',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  id: 'id',
};

@Injectable()
export class UsersPrismaRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: User): Promise<User> {
    const authProvider = data.provider ?? 'email';
    const newEntity = await this.prisma.appUser.create({
      data: {
        email: data.email,
        displayName: UserPrismaMapper.displayNameFrom(data),
        accountStatus: UserPrismaMapper.accountStatusFrom(data.status),
        authProvider,
        photoId: data.photo?.id ?? null,
        credential: {
          create: {
            passwordHash: data.password ?? null,
            authProvider,
            socialId: data.socialId ?? null,
          },
        },
        platformRoles: UserPrismaMapper.isPlatformAdmin(data.role)
          ? {
              create: {
                roleCode: 'PLATFORM_SUPER_ADMIN',
                status: 'ACTIVE',
                grantedAt: new Date(),
              },
            }
          : undefined,
      },
      include: APP_USER_INCLUDE,
    });

    return UserPrismaMapper.toDomain(newEntity);
  }

  async findManyWithPagination({
    filterOptions,
    sortOptions,
    paginationOptions,
  }: {
    filterOptions?: FilterUserDto | null;
    sortOptions?: SortUserDto[] | null;
    paginationOptions: IPaginationOptions;
  }): Promise<User[]> {
    const where: Prisma.AppUserWhereInput = {};

    if (filterOptions?.roles?.length) {
      const ids = filterOptions.roles.map((role) => Number(role.id));
      const wantsAdmin = ids.includes(RoleEnum.admin);
      const wantsUser = ids.includes(RoleEnum.user);

      if (wantsAdmin && !wantsUser) {
        where.platformRoles = {
          some: { roleCode: 'PLATFORM_SUPER_ADMIN', status: 'ACTIVE' },
        };
      } else if (wantsUser && !wantsAdmin) {
        where.platformRoles = {
          none: { roleCode: 'PLATFORM_SUPER_ADMIN', status: 'ACTIVE' },
        };
      }
    }

    const orderBy: Prisma.AppUserOrderByWithRelationInput[] = [];
    for (const sort of sortOptions ?? []) {
      const field = SORT_FIELD_MAP[sort.orderBy];
      if (field) {
        orderBy.push({
          [field]: sort.order === 'asc' ? 'asc' : 'desc',
        });
      }
    }

    const entities = await this.prisma.appUser.findMany({
      skip: (paginationOptions.page - 1) * paginationOptions.limit,
      take: paginationOptions.limit,
      where,
      orderBy,
      include: APP_USER_INCLUDE,
    });

    return entities.map((user) => UserPrismaMapper.toDomain(user));
  }

  async findById(id: User['id']): Promise<NullableType<User>> {
    const entity = await this.prisma.appUser.findUnique({
      where: { id: String(id) },
      include: APP_USER_INCLUDE,
    });

    return entity ? UserPrismaMapper.toDomain(entity) : null;
  }

  async findByIds(ids: User['id'][]): Promise<User[]> {
    const entities = await this.prisma.appUser.findMany({
      where: { id: { in: ids.map((id) => String(id)) } },
      include: APP_USER_INCLUDE,
    });

    return entities.map((user) => UserPrismaMapper.toDomain(user));
  }

  async findByEmail(email: User['email']): Promise<NullableType<User>> {
    if (!email) return null;

    const entity = await this.prisma.appUser.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
      },
      include: APP_USER_INCLUDE,
    });

    return entity ? UserPrismaMapper.toDomain(entity) : null;
  }

  async findBySocialIdAndProvider({
    socialId,
    provider,
  }: {
    socialId: User['socialId'];
    provider: User['provider'];
  }): Promise<NullableType<User>> {
    if (!socialId || !provider) return null;

    const entity = await this.prisma.appUser.findFirst({
      where: {
        credential: {
          is: {
            socialId,
            authProvider: provider,
          },
        },
      },
      include: APP_USER_INCLUDE,
    });

    return entity ? UserPrismaMapper.toDomain(entity) : null;
  }

  async update(id: User['id'], payload: Partial<User>): Promise<User> {
    const entity = await this.prisma.appUser.findUnique({
      where: { id: String(id) },
      include: APP_USER_INCLUDE,
    });

    if (!entity) {
      throw new Error('User not found');
    }

    const current = UserPrismaMapper.toDomain(entity);
    const next = { ...current, ...payload };
    const authProvider = next.provider ?? entity.authProvider ?? 'email';

    const updatedEntity = await this.prisma.appUser.update({
      where: { id: String(id) },
      data: {
        email: next.email,
        displayName: UserPrismaMapper.displayNameFrom(next),
        accountStatus: UserPrismaMapper.accountStatusFrom(next.status),
        authProvider,
        photoId: next.photo?.id ?? null,
        credential: {
          upsert: {
            create: {
              passwordHash: next.password ?? null,
              authProvider,
              socialId: next.socialId ?? null,
            },
            update: {
              passwordHash: next.password ?? undefined,
              authProvider,
              socialId: next.socialId ?? null,
            },
          },
        },
      },
      include: APP_USER_INCLUDE,
    });

    await this.syncPlatformAdmin(String(id), next.role);

    const reloaded = await this.prisma.appUser.findUnique({
      where: { id: String(id) },
      include: APP_USER_INCLUDE,
    });

    return UserPrismaMapper.toDomain(reloaded ?? updatedEntity);
  }

  async remove(id: User['id']): Promise<void> {
    await this.prisma.appUser.update({
      where: { id: String(id) },
      data: { accountStatus: 'DISABLED' },
    });
    await this.prisma.authSession.updateMany({
      where: { userId: String(id), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async syncPlatformAdmin(userId: string, role: User['role']) {
    if (role == null) {
      return;
    }

    const existing = await this.prisma.platformUserRole.findUnique({
      where: {
        userId_roleCode: {
          userId,
          roleCode: 'PLATFORM_SUPER_ADMIN',
        },
      },
    });

    if (UserPrismaMapper.isPlatformAdmin(role)) {
      if (existing) {
        await this.prisma.platformUserRole.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE' },
        });
      } else {
        await this.prisma.platformUserRole.create({
          data: {
            userId,
            roleCode: 'PLATFORM_SUPER_ADMIN',
            status: 'ACTIVE',
          },
        });
      }
      return;
    }

    if (existing) {
      await this.prisma.platformUserRole.update({
        where: { id: existing.id },
        data: { status: 'INACTIVE' },
      });
    }
  }
}
