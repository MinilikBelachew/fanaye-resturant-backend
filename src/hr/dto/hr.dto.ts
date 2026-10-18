import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const LEAVE_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

export class HrListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @ApiPropertyOptional({ enum: LEAVE_STATUSES })
  @IsOptional()
  @IsIn([...LEAVE_STATUSES])
  status?: (typeof LEAVE_STATUSES)[number];
}

export class CreateLeaveTypeDto {
  @ApiProperty({ example: 'Sick' })
  @IsString()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    example: 4,
    description: 'Days every staff member gets for this type',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultDays?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  tracksBalance?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpdateLeaveTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  tracksBalance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class CreateLeaveRequestDto {
  @ApiProperty({ description: 'Leave type id from /admin/hr/leave-types' })
  @IsUUID()
  leaveTypeId: string;

  @ApiPropertyOptional({
    description:
      'Defaults to session staff when omitted (manager creating for someone)',
  })
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @ApiProperty({ example: '2026-10-20' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-10-22' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class DecideLeaveRequestDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  decisionNote?: string;
}

export class StaffLeaveOverrideItemDto {
  @ApiProperty()
  @IsUUID()
  leaveTypeId: string;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Per-person entitlement override. Omit or null to use the leave type default.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  entitlementDays?: number | null;
}

export class SetStaffLeaveOverridesDto {
  @ApiProperty()
  @IsUUID()
  membershipId: string;

  @ApiProperty({ type: [StaffLeaveOverrideItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffLeaveOverrideItemDto)
  overrides: StaffLeaveOverrideItemDto[];
}
