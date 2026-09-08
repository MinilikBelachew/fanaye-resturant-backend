import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import ms from 'ms';
import { AllConfigType } from '../config/config.type';

export const REFRESH_COOKIE_NAME = 'fanaye_refresh';

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
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, this.cookieOptions(remember));
  }

  clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions(false));
  }

  private cookieOptions(remember: boolean): CookieOptions {
    const refreshExpires = this.configService.getOrThrow('auth.refreshExpires', {
      infer: true,
    });

    return {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: this.cookiePath(),
      maxAge: remember ? ms(refreshExpires) : undefined,
    };
  }

  private cookiePath() {
    const prefix = this.configService.getOrThrow('app.apiPrefix', {
      infer: true,
    });
    return `/${prefix}/v1/auth`;
  }
}
