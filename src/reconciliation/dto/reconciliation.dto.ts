import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SubmitReconciliationDto {
  @ApiProperty()
  @IsUUID()
  cashierFinancialSessionId: string;

  @ApiProperty({ example: '365.00' })
  @IsNumberString()
  countedCash: string;

  @ApiPropertyOptional({ example: 'Drawer counted with Sara' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ReviewReconciliationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewComment?: string;
}
