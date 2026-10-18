import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateHotelRoomDto {
  @ApiProperty({ example: '305' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  roomNumber: string;

  @ApiPropertyOptional({ example: '3' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  wing?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  defaultWaiterMembershipId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateHotelRoomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  roomNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  floor?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  wing?: string | null;

  @ApiPropertyOptional({ enum: ['AVAILABLE', 'OCCUPIED', 'OOO'] })
  @IsOptional()
  @IsIn(['AVAILABLE', 'OCCUPIED', 'OOO'])
  status?: 'AVAILABLE' | 'OCCUPIED' | 'OOO';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultWaiterMembershipId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CheckInRoomStayDto {
  @ApiProperty()
  @IsUUID()
  hotelRoomId: string;

  @ApiProperty({ example: 'Abebe Kebede' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  guestName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  adults?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  kids?: number;

  @ApiPropertyOptional({ enum: ['NONE', 'BREAKFAST'], default: 'NONE' })
  @IsOptional()
  @IsIn(['NONE', 'BREAKFAST'])
  mealPlan?: 'NONE' | 'BREAKFAST';

  @ApiProperty({
    description: 'ISO date or datetime for planned checkout',
    example: '2026-10-20',
  })
  @IsString()
  plannedCheckOutAt: string;
}

export class OpenRoomSessionDto {
  @ApiProperty()
  @IsUUID()
  roomStayId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount?: number;
}

export class UpsertRoomFloorCoverageDto {
  @ApiProperty({ example: '3' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  floor: string;

  @ApiProperty()
  @IsUUID()
  waiterMembershipId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  shiftDefinitionId?: string | null;
}

export class UpdateRoomServiceSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  roomServiceEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  breakfastEntitlementEnabled?: boolean;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  breakfastValidFromLocal?: string;

  @ApiPropertyOptional({ example: '10:30' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  breakfastValidToLocal?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  breakfastMenuItemId?: string | null;
}

export class RedeemBreakfastDto {
  @ApiProperty()
  @IsUUID()
  roomStayId: string;

  @ApiPropertyOptional({ description: 'Defaults to 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class ForceCloseRoomSessionDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ example: 'Abandoned at daily close' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
