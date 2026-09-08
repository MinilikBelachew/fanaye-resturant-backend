import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  SerializeOptions,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { AuthAppleService } from './auth-apple.service';
import { AuthAppleLoginDto } from './dto/auth-apple-login.dto';
import { LoginResponseDto } from '../auth/dto/login-response.dto';
import { AuthCookiesService } from '../auth/auth-cookies.service';
import { Response } from 'express';

@ApiTags('Auth')
@Controller({
  path: 'auth/apple',
  version: '1',
})
export class AuthAppleController {
  constructor(
    private readonly authService: AuthService,
    private readonly authAppleService: AuthAppleService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @SerializeOptions({
    groups: ['me'],
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: AuthAppleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const socialData = await this.authAppleService.getProfileByToken(loginDto);
    const result = await this.authService.validateSocialLogin(
      'apple',
      socialData,
    );
    this.cookies.setRefreshCookie(res, result.refreshToken, true);
    return {
      token: result.token,
      tokenExpires: result.tokenExpires,
      user: result.user,
      context: result.context,
    };
  }
}
