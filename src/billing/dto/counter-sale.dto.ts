import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CounterSaleLineDto {
  @ApiProperty()
  @IsUUID()
  menuItemId: string;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CounterSaleDto {
  @ApiProperty({ type: [CounterSaleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CounterSaleLineDto)
  items: CounterSaleLineDto[];
}
