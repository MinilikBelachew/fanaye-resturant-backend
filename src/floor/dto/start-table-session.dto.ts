import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class StartTableSessionDto {
  @ApiProperty()
  @IsUUID()
  tableId: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount?: number;

  @ApiPropertyOptional({ enum: ['DINE_IN', 'CALL_PICKUP'] })
  @IsOptional()
  @IsIn(['DINE_IN', 'CALL_PICKUP'])
  sessionKind?: 'DINE_IN' | 'CALL_PICKUP';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;
}
