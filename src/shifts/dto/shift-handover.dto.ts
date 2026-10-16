import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class ShiftHandoverDto {
  @ApiProperty({ description: 'Expected version of the current shift session' })
  @IsInt()
  @Type(() => Number)
  expectedVersion: number;

  @ApiProperty({
    example: 15200.0,
    description: 'Total physical cash counted in the drawer',
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  countedAmount: number;

  @ApiProperty({
    example: 2000.0,
    description:
      'Amount to leave in the drawer as opening float for the incoming cashier',
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  floatForNextCashier: number;

  @ApiProperty({ description: 'Staff membership ID of the incoming cashier' })
  @IsUUID()
  incomingCashierMembershipId: string;

  @ApiProperty({
    example: '1234',
    description: 'Exactly 4 numeric digit PIN of the incoming cashier',
  })
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'Incoming cashier PIN must be exactly 4 numeric digits.',
  })
  incomingCashierPin: string;

  @ApiPropertyOptional({
    description: 'Optional handover comments or handover note',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class HandoverCandidateDto {
  @ApiProperty()
  @Expose()
  membershipId: string;

  @ApiProperty()
  @Expose()
  displayName: string;

  @ApiProperty()
  @Expose()
  roleCode: string;

  @ApiPropertyOptional()
  @Expose()
  photoUrl?: string | null;
}

export class ShiftHandoverResponseDto {
  @ApiProperty()
  @Expose()
  outgoingCashierName: string;

  @ApiProperty()
  @Expose()
  incomingCashierName: string;

  @ApiProperty()
  @Expose()
  countedAmountFormatted: string;

  @ApiProperty()
  @Expose()
  expectedAmountFormatted: string;

  @ApiProperty()
  @Expose()
  varianceAmountFormatted: string;

  @ApiProperty()
  @Expose()
  floatTransferredFormatted: string;

  @ApiProperty()
  @Expose()
  safeDropAmountFormatted: string;

  @ApiProperty()
  @Expose()
  handedOverAt: Date;

  @ApiProperty()
  @Expose()
  status: string;
}

export class WaiterShiftHandoverDto {
  @ApiProperty({ description: 'Expected version of the current shift session' })
  @IsInt()
  @Type(() => Number)
  expectedVersion: number;

  @ApiProperty({
    example: 500.0,
    description: 'Physical cash amount handed over to incoming waiter',
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  transferredCashAmount: number;

  @ApiProperty({ description: 'Staff membership ID of the incoming waiter' })
  @IsUUID()
  incomingWaiterMembershipId: string;

  @ApiProperty({
    example: '1234',
    description: 'Exactly 4 numeric digit PIN of incoming waiter',
  })
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'Incoming waiter PIN must be exactly 4 numeric digits.',
  })
  incomingWaiterPin: string;

  @ApiPropertyOptional({
    description: 'Optional handover comments or handover note',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class WaiterShiftHandoverResponseDto {
  @ApiProperty()
  @Expose()
  outgoingWaiterName: string;

  @ApiProperty()
  @Expose()
  incomingWaiterName: string;

  @ApiProperty()
  @Expose()
  tablesTransferredCount: number;

  @ApiProperty({ type: [String] })
  @Expose()
  tablesTransferredNames: string[];

  @ApiProperty()
  @Expose()
  cashTransferredFormatted: string;

  @ApiProperty()
  @Expose()
  handedOverAt: Date;

  @ApiProperty()
  @Expose()
  status: string;
}
