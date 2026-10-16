import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthContextDto } from '../identity/dto/auth-context.dto';
import { CaslAbilityFactory } from './casl-ability.factory';
import { AppAction, AppAbility, AppSubject } from './casl-ability.types';

@Injectable()
export class CaslService {
  constructor(private readonly abilityFactory: CaslAbilityFactory) {}

  abilityFor(context: AuthContextDto): AppAbility {
    return this.abilityFactory.createForUser(context);
  }

  can(
    context: AuthContextDto,
    action: AppAction,
    subject: AppSubject,
  ): boolean {
    return this.abilityFor(context).can(action, subject);
  }

  /**
   * Drop-in replacement for role allowlist checks.
   * Throws ForbiddenException with the same style of message as before.
   */
  assertCan(
    context: AuthContextDto,
    action: AppAction,
    subject: AppSubject,
    message?: string,
  ): void {
    if (!this.can(context, action, subject)) {
      throw new ForbiddenException(
        message ?? `Not allowed to ${action} ${subject}.`,
      );
    }
  }

  /** True when user has full manage-all (owner / platform). */
  isElevated(context: AuthContextDto): boolean {
    return this.can(context, 'manage', 'all');
  }
}
