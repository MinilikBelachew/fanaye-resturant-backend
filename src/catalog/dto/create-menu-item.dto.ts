import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateModifierOptionDto {
  @ApiProperty({ example: 'No onion' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'No onion' })
  @IsString()
  @IsOptional()
  ticketLabel?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  priceDelta?: number;
}

export class CreateModifierGroupDto {
  @ApiProperty({ example: 'Hold ingredients' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'included' })
  @IsString()
  @IsOptional()
  kind?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  min?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsNumber()
  @IsOptional()
  max?: number;

  @ApiProperty({ type: () => [CreateModifierOptionDto] })
  @IsArray()
  options: CreateModifierOptionDto[];
}

export class CreateMenuItemDto {
  @ApiProperty({ example: 'Special Kitfo' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'Minced lean beef seasoned with spiced butter.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 380 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsString()
  @IsOptional()
  currencyCode?: string;

  @ApiProperty({ example: 'UUID-of-station' })
  @IsString()
  stationId: string;

  @ApiPropertyOptional({ example: 'Kitchen' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'UUID-of-category' })
  @IsUUID()
  @IsOptional()
  menuCategoryId?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsNumber()
  @IsOptional()
  expectedPreparationMinutes?: number;

  @ApiPropertyOptional({ example: '/images/dishes/burger.jpg' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  available?: boolean;

  @ApiPropertyOptional({ type: () => [CreateModifierGroupDto] })
  @IsArray()
  @IsOptional()
  modifierGroups?: CreateModifierGroupDto[];
}
