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
  @ApiProperty({ example: '1234', description: '4 to 6 digit staff PIN' })
  @IsString()
  @IsNotEmpty()
  @Length(4, 6)
  @Matches(/^\d+$/, { message: 'PIN must contain numeric digits only' })
  pin: string;

  @ApiPropertyOptional({
    description: 'Optional user/staff ID if selected on terminal',
  })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional({ description: 'Optional tenant slug or identifier' })
  @IsOptional()
  @IsString()
  tenantSlug?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
