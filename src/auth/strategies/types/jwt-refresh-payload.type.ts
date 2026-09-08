import { Session } from '../../../session/domain/session';

export type JwtRefreshPayloadType = {
  sessionId: Session['id'];
  hash: Session['hash'];
  remember?: boolean;
  iat: number;
  exp: number;
};
