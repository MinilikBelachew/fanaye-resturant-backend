import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateShiftDefinitionDto {
  @ApiProperty({ example: 'Brunch' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '10:00', description: 'HH:mm local time' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startLocalTime: string;

  @ApiProperty({ example: '16:00', description: 'HH:mm local time' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endLocalTime: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceMinutes?: number;
}

export class UpdateShiftDefinitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startLocalTime?: string;

  @ApiPropertyOptional({ example: '16:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endLocalTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceMinutes?: number;
}

export class SetWaiterTableCoverageDto {
  @ApiProperty()
  @IsUUID()
  shiftDefinitionId: string;

  @ApiProperty({ type: [String], description: 'Dining table ids for this shift' })
  @IsArray()
  @IsUUID('4', { each: true })
  tableIds: string[];
}

export class CreateAdminStaffDto {
  @ApiProperty({ example: 'Karim Tesfaye' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiProperty({
    example: 'WAITER',
    description:
      'WAITER | MANAGER | CASHIER | OWNER_ADMIN | STATION_OPERATOR | or UI codes kitchen/barista/cakes/soft_drinks',
  })
  @IsString()
  @MaxLength(40)
  role: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Login password or PIN (defaults to 1234)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(72)
  pin?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Preparation station id when role is a station operator',
  })
  @IsOptional()
  @IsUUID()
  preparationStationId?: string;

  @ApiPropertyOptional({
    description: 'Station code: KITCHEN | BARISTA | CAKES | SOFT_DRINKS',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  stationCode?: string;

  @ApiPropertyOptional({
    description: 'For waiters: shift to attach table coverage',
  })
  @IsOptional()
  @IsUUID()
  shiftDefinitionId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tableIds?: string[];
}

export class UpdateAdminStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(72)
  pin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  preparationStationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  stationCode?: string;
}
