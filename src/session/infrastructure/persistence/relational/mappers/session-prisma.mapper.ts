import { AuthSession as PrismaAuthSession } from '@prisma/client';
import { Session } from '../../../../domain/session';
import {
  AppUserWithRelations,
  UserPrismaMapper,
} from '../../../../../users/infrastructure/persistence/relational/mappers/user-prisma.mapper';

type SessionWithRelations = PrismaAuthSession & {
  user: AppUserWithRelations;
};

export class SessionPrismaMapper {
  static toDomain(raw: SessionWithRelations): Session {
    const domainEntity = new Session();
    domainEntity.id = raw.id;
    domainEntity.hash = raw.hash;
    domainEntity.createdAt = raw.createdAt;
    domainEntity.updatedAt = raw.updatedAt;
    domainEntity.deletedAt = raw.revokedAt as any;
    domainEntity.user = UserPrismaMapper.toDomain(raw.user);
    return domainEntity;
  }

  static toPersistence(domainEntity: Session) {
    return {
      userId: String(domainEntity.user.id),
      hash: domainEntity.hash,
    };
  }
}
