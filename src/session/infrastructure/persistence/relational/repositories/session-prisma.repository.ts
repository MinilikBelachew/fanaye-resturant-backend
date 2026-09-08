import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { SessionRepository } from '../../session.repository';
import { Session } from '../../../../domain/session';
import { SessionPrismaMapper } from '../mappers/session-prisma.mapper';
import { User } from '../../../../../users/domain/user';
import { APP_USER_INCLUDE } from '../../../../../users/infrastructure/persistence/relational/mappers/user-prisma.mapper';

const SESSION_INCLUDE = {
  user: {
    include: APP_USER_INCLUDE,
  },
} as const;

@Injectable()
export class SessionPrismaRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: Session['id']): Promise<NullableType<Session>> {
    const entity = await this.prisma.authSession.findFirst({
      where: {
        id: String(id),
        revokedAt: null,
      },
      include: SESSION_INCLUDE,
    });

    return entity ? SessionPrismaMapper.toDomain(entity) : null;
  }

  async create(data: Session): Promise<Session> {
    const persistenceModel = SessionPrismaMapper.toPersistence(data);

    const newEntity = await this.prisma.authSession.create({
      data: persistenceModel,
      include: SESSION_INCLUDE,
    });

    return SessionPrismaMapper.toDomain(newEntity);
  }

  async update(
    id: Session['id'],
    payload: Partial<
      Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
    >,
  ): Promise<Session | null> {
    const entity = await this.prisma.authSession.findFirst({
      where: {
        id: String(id),
        revokedAt: null,
      },
      include: SESSION_INCLUDE,
    });

    if (!entity) {
      throw new Error('Session not found');
    }

    const updatedEntity = await this.prisma.authSession.update({
      where: { id: String(id) },
      data: {
        hash: payload.hash ?? entity.hash,
      },
      include: SESSION_INCLUDE,
    });

    return SessionPrismaMapper.toDomain(updatedEntity);
  }

  async updateByHash(
    conditions: { id: Session['id']; hash: Session['hash'] },
    payload: Partial<
      Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
    >,
  ): Promise<Session | null> {
    const entity = await this.prisma.authSession.findFirst({
      where: {
        id: String(conditions.id),
        hash: conditions.hash,
        revokedAt: null,
      },
      include: SESSION_INCLUDE,
    });

    if (!entity) {
      throw new Error('Session not found');
    }

    const updatedEntity = await this.prisma.authSession.update({
      where: { id: String(conditions.id) },
      data: {
        hash: payload.hash ?? entity.hash,
      },
      include: SESSION_INCLUDE,
    });

    return SessionPrismaMapper.toDomain(updatedEntity);
  }

  async deleteById(id: Session['id']): Promise<void> {
    await this.prisma.authSession.update({
      where: { id: String(id) },
      data: { revokedAt: new Date() },
    });
  }

  async deleteByUserId(conditions: { userId: User['id'] }): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        userId: String(conditions.userId),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async deleteByUserIdWithExclude(conditions: {
    userId: User['id'];
    excludeSessionId: Session['id'];
  }): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        userId: String(conditions.userId),
        id: { not: String(conditions.excludeSessionId) },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }
}
