import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePayrollRunDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsDateString()
  periodEnd: string;

  @ApiPropertyOptional({ example: 'October 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({
    description: 'Owner may scope to a branch; managers use their branch',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpdatePayrollLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  regularHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otRate?: number;

  @ApiPropertyOptional({
    description: 'Manual OT ETB override; if omitted, otHours × otRate',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tipAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deductions?: number;

  @ApiPropertyOptional({ enum: ['CASH', 'BANK'] })
  @IsOptional()
  @IsIn(['CASH', 'BANK'])
  payMethod?: 'CASH' | 'BANK';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class MarkPayrollPaidDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Line ids to mark paid; omit to mark all unpaid lines',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  lineIds?: string[];

  @ApiPropertyOptional({ enum: ['CASH', 'BANK'], default: 'CASH' })
  @IsOptional()
  @IsIn(['CASH', 'BANK'])
  payMethod?: 'CASH' | 'BANK';
}
