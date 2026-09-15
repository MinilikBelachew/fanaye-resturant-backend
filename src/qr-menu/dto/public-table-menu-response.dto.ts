import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QrMenuConfigDto } from './qr-menu-config.dto';

export class PublicTableInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  displayNumber?: string | null;

  @ApiPropertyOptional()
  locationName?: string | null;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  currentSessionId?: string | null;
}

export class PublicTenantInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  logoUrl?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiPropertyOptional()
  city?: string | null;

  @ApiPropertyOptional()
  address?: string | null;

  @ApiProperty({ default: 'ETB' })
  currencyCode: string;
}

export class PublicModifierOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: '25.00' })
  priceDelta: string;

  @ApiProperty({ default: 'ETB' })
  currencyCode: string;
}

export class PublicModifierGroupDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  required: boolean;

  @ApiProperty()
  minSelections: number;

  @ApiProperty()
  maxSelections: number;

  @ApiProperty({ type: [PublicModifierOptionDto] })
  options: PublicModifierOptionDto[];
}

export class PublicMenuItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty({ example: '350.00' })
  price: string;

  @ApiProperty({ default: 'ETB' })
  currencyCode: string;

  @ApiPropertyOptional({ example: 'CHEF_PICK' })
  badge?: string | null;

  @ApiPropertyOptional()
  categoryId?: string | null;

  @ApiPropertyOptional()
  categoryName?: string | null;

  @ApiPropertyOptional()
  stationName?: string | null;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiProperty({ type: [PublicModifierGroupDto] })
  modifierGroups: PublicModifierGroupDto[];
}

export class PublicMenuCategoryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ example: 6 })
  itemsCount: number;
}

export class PublicActiveOrderItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ example: 'IN_PREPARATION' })
  state: string;

  @ApiProperty({ example: '120.00' })
  price: string;

  @ApiPropertyOptional()
  comment?: string | null;

  @ApiProperty()
  createdAt: string;
}

export class PublicActiveSessionDto {
  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  customerCount?: number;

  @ApiProperty()
  openedAt: string;

  @ApiProperty({ type: [PublicActiveOrderItemDto] })
  items: PublicActiveOrderItemDto[];

  @ApiProperty({ example: '470.00' })
  totalAmount: string;
}

export class PublicTableMenuResponseDto {
  @ApiProperty({ type: PublicTenantInfoDto })
  tenant: PublicTenantInfoDto;

  @ApiProperty({ type: PublicTableInfoDto })
  table: PublicTableInfoDto;

  @ApiProperty({ type: QrMenuConfigDto })
  config: QrMenuConfigDto;

  @ApiProperty({ type: [PublicMenuCategoryDto] })
  categories: PublicMenuCategoryDto[];

  @ApiProperty({ type: [PublicMenuItemDto] })
  featuredItems: PublicMenuItemDto[];

  @ApiProperty({ type: [PublicMenuItemDto] })
  items: PublicMenuItemDto[];

  @ApiPropertyOptional({ type: PublicActiveSessionDto })
  activeSession?: PublicActiveSessionDto | null;
}
