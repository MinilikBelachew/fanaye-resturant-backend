import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ConfirmOrderItemDto {
  @ApiProperty()
  @IsUUID()
  menuItemId: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  modifierOptionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  specialInstruction?: string;
}

/** Exactly one of tableSessionId | roomSessionId is required (XOR). */
export class ConfirmOrderDto {
  @ApiPropertyOptional({
    description:
      'Dine-in / call pickup. Mutually exclusive with roomSessionId.',
  })
  @ValidateIf((o: ConfirmOrderDto) => !o.roomSessionId && !o.outsideOrderId)
  @IsUUID()
  tableSessionId?: string;

  @ApiPropertyOptional({
    description: 'Room service. Mutually exclusive with tableSessionId.',
  })
  @ValidateIf((o: ConfirmOrderDto) => !o.tableSessionId && !o.outsideOrderId)
  @IsUUID()
  roomSessionId?: string;

  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((o: ConfirmOrderDto) => Boolean(o.tableSessionId))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedTableSessionVersion?: number;

  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((o: ConfirmOrderDto) => Boolean(o.roomSessionId))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRoomSessionVersion?: number;

  @ApiPropertyOptional({
    description:
      'Outside order container. Mutually exclusive with tableSessionId and roomSessionId.',
  })
  @ValidateIf((o: ConfirmOrderDto) => !o.tableSessionId && !o.roomSessionId)
  @IsUUID()
  outsideOrderId?: string;

  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((o: ConfirmOrderDto) => Boolean(o.outsideOrderId))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedOutsideOrderVersion?: number;

  @ApiProperty({ type: () => [ConfirmOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmOrderItemDto)
  items: ConfirmOrderItemDto[];
}
