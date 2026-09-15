import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class GuestOrderItemModifierDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  modifierOptionId: string;
}

export class GuestOrderItemDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  menuItemId: string;

  @ApiProperty({ default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ type: [GuestOrderItemModifierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuestOrderItemModifierDto)
  modifiers?: GuestOrderItemModifierDto[];
}

export class GuestOrderDto {
  @ApiProperty({ type: [GuestOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GuestOrderItemDto)
  items: GuestOrderItemDto[];

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  customerCount?: number;

  @ApiPropertyOptional({ example: 'Please bring food together' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class GuestOrderResponseDto {
  @ApiProperty()
  orderId: string;

  @ApiProperty()
  tableSessionId: string;

  @ApiProperty({ example: 'CONFIRMED' })
  status: string;

  @ApiProperty()
  itemCount: number;

  @ApiProperty({ example: 15 })
  estimatedWaitMinutes: number;

  @ApiProperty({ example: 'Your order has been sent to the kitchen!' })
  message: string;
}
