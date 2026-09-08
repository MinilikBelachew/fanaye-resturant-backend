import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminModifierOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  priceDelta: string;

  @ApiProperty()
  currencyCode: string;
}

export class AdminModifierGroupDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  kind: 'included' | 'extra' | 'choice';

  @ApiProperty()
  minSelections: number;

  @ApiProperty()
  maxSelections: number;

  @ApiProperty()
  required: boolean;

  @ApiProperty({ type: [AdminModifierOptionDto] })
  options: AdminModifierOptionDto[];
}

export class AdminMenuItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuId: string;

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

  @ApiProperty()
  available: boolean;

  @ApiPropertyOptional()
  categoryId: string | null;

  @ApiProperty()
  categoryName: string;

  @ApiProperty()
  preparationStationId: string;

  @ApiProperty()
  stationName: string;

  @ApiPropertyOptional()
  expectedPrepMinutes: number | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  version: number;

  @ApiPropertyOptional()
  imageKey: string | null;

  @ApiPropertyOptional()
  imageFileId: string | null;

  @ApiPropertyOptional()
  imageUrl: string | null;

  @ApiProperty({ type: [AdminModifierGroupDto] })
  modifierGroups: AdminModifierGroupDto[];
}

export class AdminMenuItemListResponseDto {
  @ApiProperty({ type: [AdminMenuItemDto] })
  data: AdminMenuItemDto[];
}

export class AdminMenuItemResponseDto {
  @ApiProperty({ type: AdminMenuItemDto })
  data: AdminMenuItemDto;
}

export class AdminStationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  code: string | null;

  @ApiProperty()
  status: string;
}

export class AdminCategoryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  sortOrder: number;
}

export class AdminMenuMetaDto {
  @ApiProperty()
  menuId: string;

  @ApiPropertyOptional()
  defaultPeriodId: string | null;

  @ApiProperty({ type: [AdminStationDto] })
  stations: AdminStationDto[];

  @ApiProperty({ type: [AdminCategoryDto] })
  categories: AdminCategoryDto[];
}

export class AdminMenuMetaResponseDto {
  @ApiProperty({ type: AdminMenuMetaDto })
  data: AdminMenuMetaDto;
}

export class AdminModifierGroupListResponseDto {
  @ApiProperty({ type: [AdminModifierGroupDto] })
  data: AdminModifierGroupDto[];
}

export class AdminModifierGroupResponseDto {
  @ApiProperty({ type: AdminModifierGroupDto })
  data: AdminModifierGroupDto;
}
