import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class IssueMaterialLineDto {
  @ApiProperty({ description: 'ID of the inventory material to checkout' })
  @IsUUID()
  materialId: string;

  @ApiProperty({ example: 2, description: 'Quantity handed out to waiter' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiPropertyOptional({ description: 'Specific note about this item' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class IssueOrderMaterialsDto {
  @ApiPropertyOptional({ description: 'Order ID the materials attach to' })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Outside order container ID' })
  @IsOptional()
  @IsUUID()
  outsideOrderId?: string;

  @ApiProperty({ type: [IssueMaterialLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IssueMaterialLineDto)
  lines: IssueMaterialLineDto[];

  @ApiPropertyOptional({ example: 'Handed out 2 trays and 4 ceramic plates' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ReturnMaterialLineDto {
  @ApiProperty({ description: 'Issue line ID' })
  @IsUUID()
  lineId: string;

  @ApiProperty({ example: 2, description: 'Quantity actually returned' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  qtyReturned: number;

  @ApiPropertyOptional({
    enum: ['OK', 'DAMAGED', 'MISSING'],
    default: 'OK',
    description: 'Condition of returned items',
  })
  @IsOptional()
  @IsIn(['OK', 'DAMAGED', 'MISSING'])
  condition?: 'OK' | 'DAMAGED' | 'MISSING';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class ReturnOrderMaterialsDto {
  @ApiProperty({ type: [ReturnMaterialLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnMaterialLineDto)
  lines: ReturnMaterialLineDto[];

  @ApiPropertyOptional({ example: 'Returned everything except 1 broken glass' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class AuditMaterialIssueDto {
  @ApiProperty({
    enum: ['APPROVE', 'DISPUTE'],
    example: 'APPROVE',
  })
  @IsIn(['APPROVE', 'DISPUTE'])
  action: 'APPROVE' | 'DISPUTE';

  @ApiPropertyOptional({
    example: '1 plate missing from tray',
    description: 'Reason if action is DISPUTE',
  })
  @IsOptional()
  @IsString()
  disputeReason?: string;
}
