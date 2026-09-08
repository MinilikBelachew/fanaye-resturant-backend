import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class InitiateCashDropDto {
  @ApiProperty({ example: '365.00' })
  @IsNumberString()
  amount: string;
}

export class ReceiveCashDropDto {
  @ApiProperty({ example: '365.00' })
  @IsNumberString()
  countedAmount: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ResolveCashDropDisputeDto {
  @ApiProperty({
    enum: ['ACCEPT_COUNTED', 'ACCEPT_DECLARED', 'OTHER_APPROVED_AMOUNT'],
  })
  @IsIn(['ACCEPT_COUNTED', 'ACCEPT_DECLARED', 'OTHER_APPROVED_AMOUNT'])
  resolution: 'ACCEPT_COUNTED' | 'ACCEPT_DECLARED' | 'OTHER_APPROVED_AMOUNT';

  @ApiPropertyOptional({ example: '1450.00' })
  @IsOptional()
  @IsNumberString()
  resolutionAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolutionNote?: string;
}
