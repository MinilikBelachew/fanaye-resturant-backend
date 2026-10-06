import { registerAs } from '@nestjs/config';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { VerifyEtConfig } from './verify-et-config.type';

class EnvironmentVariablesValidator {
  @IsOptional()
  @IsBooleanString()
  VERIFY_ET_ENABLED?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  VERIFY_ET_BASE_URL?: string;

  @IsOptional()
  @IsString()
  VERIFY_ET_API_KEY?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  VERIFY_ET_WAIT_MS?: number;
}

export default registerAs<VerifyEtConfig>('verifyEt', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  const apiKey = (process.env.VERIFY_ET_API_KEY ?? '').trim();
  const enabledFlag = (process.env.VERIFY_ET_ENABLED ?? 'true').toLowerCase();
  const enabled =
    enabledFlag !== 'false' && enabledFlag !== '0' && apiKey.length > 0;

  return {
    enabled,
    baseUrl: (process.env.VERIFY_ET_BASE_URL ?? 'https://verify.et').replace(
      /\/$/,
      '',
    ),
    apiKey,
    waitMs: process.env.VERIFY_ET_WAIT_MS
      ? parseInt(process.env.VERIFY_ET_WAIT_MS, 10)
      : 8000,
  };
});
