import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum CashHandlingOption {
  DROP_TO_SAFE = 'DROP_TO_SAFE',
  FLAG_AS_SHORTAGE = 'FLAG_AS_SHORTAGE',
  NONE = 'NONE',
}

export class ManagerForceClockOutDto {
  @ApiProperty({
    description: 'The open shift session ID to force clock out',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  shiftSessionId: string;

  @ApiProperty({
    description: 'Reason for the forced clock-out (for audit and compliance)',
    example: 'Staff left without clocking out; shift window passed',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({
    description:
      'Target staff membership ID to reassign any open tables to (must be an active staff in the same branch)',
  })
  @IsOptional()
  @IsUUID()
  reassignTablesToMembershipId?: string;

  @ApiPropertyOptional({
    description:
      'Whether to close open tables if no reassign target is selected',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  closeOpenTables?: boolean;

  @ApiPropertyOptional({
    enum: CashHandlingOption,
    default: CashHandlingOption.NONE,
    description:
      'How to handle any undropped cash on the shift (DROP_TO_SAFE, FLAG_AS_SHORTAGE, or NONE)',
  })
  @IsOptional()
  @IsEnum(CashHandlingOption)
  cashHandling?: CashHandlingOption;

  @ApiPropertyOptional({
    description: 'Optional manager note regarding cash settlement',
  })
  @IsOptional()
  @IsString()
  cashNotes?: string;
}

export class ManagerForceClockOutResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty()
  shiftSessionId: string;

  @ApiProperty()
  staffName: string;

  @ApiProperty()
  clockOutAt: Date;

  @ApiProperty()
  tablesTransferredCount: number;

  @ApiProperty()
  tablesClosedCount: number;

  @ApiProperty()
  cashHandledAmount: string;

  @ApiProperty()
  cashHandling: string;
}

export class ActiveShiftSummaryDto {
  @ApiProperty()
  shiftSessionId: string;

  @ApiProperty()
  staffMembershipId: string;

  @ApiProperty()
  staffName: string;

  @ApiPropertyOptional()
  roleCode?: string;

  @ApiPropertyOptional()
  roleName?: string;

  @ApiProperty()
  clockInAt: Date;

  @ApiPropertyOptional()
  scheduledStartAt?: Date | null;

  @ApiPropertyOptional()
  scheduledEndAt?: Date | null;

  @ApiProperty()
  isExpired: boolean;

  @ApiProperty()
  lateByMinutes: number;

  @ApiProperty()
  openTablesCount: number;

  @ApiProperty({ type: [Object] })
  openTables: Array<{
    sessionTableId: string;
    tableId: string;
    tableName: string;
    locationName?: string;
    guestCount?: number | null;
    openedAt: Date;
  }>;

  @ApiProperty()
  undroppedCash: string;
}
