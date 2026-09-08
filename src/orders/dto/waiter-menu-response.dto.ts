import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class MenuPeriodSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;
}

export class MenuCategorySummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  sortOrder: number;
}

export class MenuStationSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;
}

export class WaiterModifierOptionDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  priceDelta: string;

  @ApiProperty()
  @Expose()
  currencyCode: string;
}

export class WaiterModifierGroupDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  required: boolean;

  @ApiProperty()
  @Expose()
  minSelections: number;

  @ApiProperty()
  @Expose()
  maxSelections: number;

  @ApiProperty({ type: () => [WaiterModifierOptionDto] })
  @Expose()
  @Type(() => WaiterModifierOptionDto)
  options: WaiterModifierOptionDto[];
}

export class WaiterMenuItemDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional()
  @Expose()
  description: string | null;

  @ApiProperty()
  @Expose()
  price: string;

  @ApiProperty()
  @Expose()
  currencyCode: string;

  @ApiProperty()
  @Expose()
  soldOut: boolean;

  @ApiPropertyOptional()
  @Expose()
  categoryId: string | null;

  @ApiProperty()
  @Expose()
  categoryName: string;

  @ApiProperty({ type: () => MenuStationSummaryDto })
  @Expose()
  @Type(() => MenuStationSummaryDto)
  station: MenuStationSummaryDto;

  @ApiPropertyOptional()
  @Expose()
  expectedPrepMinutes: number | null;

  @ApiProperty({ type: () => [WaiterModifierGroupDto] })
  @Expose()
  @Type(() => WaiterModifierGroupDto)
  modifierGroups: WaiterModifierGroupDto[];
}

export class WaiterMenuResponseDto {
  @ApiProperty()
  @Expose()
  menuId: string;

  @ApiPropertyOptional({ type: () => MenuPeriodSummaryDto })
  @Expose()
  @Type(() => MenuPeriodSummaryDto)
  activePeriod: MenuPeriodSummaryDto | null;

  @ApiProperty({ type: () => [MenuCategorySummaryDto] })
  @Expose()
  @Type(() => MenuCategorySummaryDto)
  categories: MenuCategorySummaryDto[];

  @ApiProperty({ type: () => [WaiterMenuItemDto] })
  @Expose()
  @Type(() => WaiterMenuItemDto)
  items: WaiterMenuItemDto[];
}
