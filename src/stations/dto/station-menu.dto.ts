import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SetStationItemLimitDto {
  @ApiProperty({
    example: 5,
    description: 'How many portions can still be prepared',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  remainingQty: number;

  @ApiPropertyOptional({ example: 'Only 5 portions left today' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class SetStationItemSoldOutDto {
  @ApiPropertyOptional({ example: 'Out of sauce' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class StationMenuItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  price: string;

  @ApiProperty()
  currencyCode: string;

  @ApiProperty()
  soldOut: boolean;

  @ApiPropertyOptional({
    description:
      'Remaining portions when LIMITED; null when fully available or sold out',
    nullable: true,
  })
  remainingQty: number | null;

  @ApiPropertyOptional({ nullable: true })
  availabilityState: string | null;

  @ApiPropertyOptional({ nullable: true })
  availabilityReason: string | null;

  @ApiPropertyOptional()
  imageKey: string | null;

  @ApiPropertyOptional()
  imageUrl: string | null;

  @ApiPropertyOptional()
  categoryName: string | null;
}

export class StationMenuResponseDto {
  @ApiProperty()
  stationId: string;

  @ApiProperty()
  stationName: string;

  @ApiProperty({ type: [StationMenuItemDto] })
  data: StationMenuItemDto[];
}
