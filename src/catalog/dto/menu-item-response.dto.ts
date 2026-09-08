import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ModifierOptionResponseDto {
  @ApiProperty({ example: 'modopt-1' })
  id: string;

  @ApiProperty({ example: 'No onion' })
  name: string;

  @ApiPropertyOptional({ example: 'No onion' })
  ticketLabel?: string;

  @ApiProperty({ example: 0 })
  priceDelta: number;
}

export class ModifierGroupResponseDto {
  @ApiProperty({ example: 'modgroup-1' })
  id: string;

  @ApiProperty({ example: 'Hold ingredients' })
  name: string;

  @ApiProperty({ example: 'included' })
  kind: string;

  @ApiProperty({ example: 0 })
  min: number;

  @ApiProperty({ example: 4 })
  max: number;

  @ApiProperty({ type: () => [ModifierOptionResponseDto] })
  options: ModifierOptionResponseDto[];
}

export class MenuItemDto {
  @ApiProperty({ example: 'uuid-item' })
  id: string;

  @ApiProperty({ example: 'Special Kitfo' })
  name: string;

  @ApiProperty({ example: 'Minced lean beef seasoned with spiced butter.' })
  description: string;

  @ApiProperty({ example: 380 })
  price: number;

  @ApiProperty({ example: 'ETB' })
  currencyCode: string;

  @ApiProperty({ example: 'Kitchen' })
  category: string;

  @ApiPropertyOptional({ example: 'uuid-category' })
  categoryId?: string;

  @ApiProperty({ example: 'uuid-station' })
  stationId: string;

  @ApiPropertyOptional({ example: 'Kitchen' })
  stationName?: string;

  @ApiProperty({ example: 12 })
  expectedPreparationMinutes: number;

  @ApiPropertyOptional({ example: '/images/dishes/burger.jpg' })
  image?: string;

  @ApiProperty({ example: true })
  available: boolean;

  @ApiProperty({ type: () => [ModifierGroupResponseDto] })
  modifierGroups: ModifierGroupResponseDto[];
}

export class MenuCategoryDto {
  @ApiProperty({ example: 'uuid-cat' })
  id: string;

  @ApiProperty({ example: 'Kitchen' })
  name: string;

  @ApiProperty({ example: 0 })
  sortOrder: number;
}

export class MenuListResponseDto {
  @ApiProperty({ type: () => [MenuItemDto] })
  items: MenuItemDto[];

  @ApiProperty({ type: () => [MenuCategoryDto] })
  categories: MenuCategoryDto[];
}

export class MenuItemSingleResponseDto {
  @ApiProperty({ type: () => MenuItemDto })
  data: MenuItemDto;
}
