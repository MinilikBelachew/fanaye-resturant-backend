import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import ms from 'ms';
import { AllConfigType } from '../config/config.type';

/** Refresh JWT — scoped to auth routes only. */
export const REFRESH_COOKIE_NAME = 'fanaye_refresh';

/**
 * HttpOnly session presence flag for the Next.js app middleware.
 * path=/ so page navigations receive it; JS cannot forge it.
 */
export const SESSION_COOKIE_NAME = 'fanaye_session';

export function readRefreshCookie(req: {
  headers?: { cookie?: string };
}): string | null {
  const header = req.headers?.cookie;
  if (!header) {
    return null;
  }

  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

@Injectable()
export class AuthCookiesService {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  setRefreshCookie(res: Response, refreshToken: string, remember: boolean) {
    res.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken,
      this.refreshCookieOptions(remember),
    );
    this.setSessionCookie(res, remember);
  }

  clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, this.refreshCookieOptions(false));
    this.clearSessionCookie(res);
  }

  setSessionCookie(res: Response, remember: boolean) {
    res.cookie(SESSION_COOKIE_NAME, '1', this.sessionCookieOptions(remember));
  }

  clearSessionCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, this.sessionCookieOptions(false));
  }

  private refreshCookieOptions(remember: boolean): CookieOptions {
    return {
      ...this.baseCookieOptions(remember),
      path: this.refreshCookiePath(),
    };
  }

  private sessionCookieOptions(remember: boolean): CookieOptions {
    return {
      ...this.baseCookieOptions(remember),
      // Must be "/" so Next middleware sees the cookie on app page loads.
      path: '/',
    };
  }

  private baseCookieOptions(remember: boolean): Omit<CookieOptions, 'path'> {
    const refreshExpires = this.configService.getOrThrow(
      'auth.refreshExpires',
      {
        infer: true,
      },
    );
    const isProd =
      this.configService.get('app.nodeEnv', { infer: true }) === 'production';

    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: remember ? ms(refreshExpires) : undefined,
    };
  }

  private refreshCookiePath() {
    const prefix = this.configService.getOrThrow('app.apiPrefix', {
      infer: true,
    });
    return `/${prefix}/v1/auth`;
  }
}
