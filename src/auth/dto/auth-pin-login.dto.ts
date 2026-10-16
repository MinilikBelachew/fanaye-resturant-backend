import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class AuthPinLoginDto {
  @ApiProperty({ example: '1234', description: 'Exactly 4 digit staff PIN' })
  @IsString()
  @IsNotEmpty()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 numeric digits' })
  pin: string;

  @ApiPropertyOptional({
    description: 'Optional user/staff ID if selected on terminal',
  })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional({
    description:
      'Tenant id/slug/name. Required when staffId is not provided (terminal pairing).',
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
