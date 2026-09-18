import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

export class SiteThemeDto {
  @ApiProperty({ example: '#e85d04' })
  @IsString()
  primaryColor: string;

  @ApiProperty({ example: '#0f172a' })
  @IsString()
  accentColor: string;

  @ApiProperty({ example: '#fffaf5' })
  @IsString()
  backgroundColor: string;

  @ApiProperty({ example: '#0f172a' })
  @IsString()
  textColor: string;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: 'Fraunces' })
  @IsOptional()
  @IsString()
  fontDisplay?: string;

  @ApiPropertyOptional({ example: 'DM Sans' })
  @IsOptional()
  @IsString()
  fontBody?: string;

  @ApiPropertyOptional({
    example: 'solid',
    enum: ['solid', 'gradient', 'image'],
  })
  @IsOptional()
  @IsString()
  backgroundType?: string | null;

  @ApiPropertyOptional({
    example: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
  })
  @IsOptional()
  @IsString()
  backgroundGradient?: string | null;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  backgroundImageUrl?: string | null;

  @ApiPropertyOptional({ example: 0.85 })
  @IsOptional()
  backgroundOverlayOpacity?: number | null;

  @ApiPropertyOptional({ example: 'md', enum: ['none', 'md', 'xl', 'full'] })
  @IsOptional()
  @IsString()
  borderRadius?: string | null;
}

export class UpdateSiteThemeDto {
  @ApiPropertyOptional({ example: '#e85d04' })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#0f172a' })
  @IsOptional()
  @IsString()
  accentColor?: string;

  @ApiPropertyOptional({ example: '#fffaf5' })
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional({ example: '#0f172a' })
  @IsOptional()
  @IsString()
  textColor?: string;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: 'Fraunces' })
  @IsOptional()
  @IsString()
  fontDisplay?: string;

  @ApiPropertyOptional({ example: 'DM Sans' })
  @IsOptional()
  @IsString()
  fontBody?: string;

  @ApiPropertyOptional({
    example: 'solid',
    enum: ['solid', 'gradient', 'image'],
  })
  @IsOptional()
  @IsString()
  backgroundType?: string | null;

  @ApiPropertyOptional({
    example: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
  })
  @IsOptional()
  @IsString()
  backgroundGradient?: string | null;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  backgroundImageUrl?: string | null;

  @ApiPropertyOptional({ example: 0.85 })
  @IsOptional()
  backgroundOverlayOpacity?: number | null;

  @ApiPropertyOptional({ example: 'md', enum: ['none', 'md', 'xl', 'full'] })
  @IsOptional()
  @IsString()
  borderRadius?: string | null;
}

export class UpdateSiteDto {
  @ApiPropertyOptional({ example: 'Abyssinia Grill' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  tenantName?: string;

  @ApiPropertyOptional({ example: 'abyssinia-grill' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase letters, numbers, and hyphens.',
  })
  slug?: string;

  @ApiPropertyOptional({ type: () => UpdateSiteThemeDto })
  @IsOptional()
  @Type(() => UpdateSiteThemeDto)
  theme?: UpdateSiteThemeDto;

  @ApiPropertyOptional({ description: 'Puck editor draft data JSON' })
  @IsOptional()
  @IsObject()
  draftData?: Record<string, unknown>;
}

export class SiteResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  tenantName: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ example: 'DRAFT' })
  status: string;

  @ApiProperty({ type: () => SiteThemeDto })
  theme: SiteThemeDto;

  @ApiProperty()
  draftData: Record<string, unknown>;

  @ApiPropertyOptional()
  publishedData?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  publishedAt?: string | null;

  @ApiProperty({ example: '/r/abyssinia-grill' })
  publicPath: string;
}

export class SiteSingleResponseDto {
  @ApiProperty({ type: () => SiteResponseDto })
  data: SiteResponseDto;
}

export class PublicMenuItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  currencyCode: string;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiProperty()
  categoryId: string;

  @ApiProperty()
  categoryName: string;

  @ApiProperty()
  soldOut: boolean;
}

export class PublicSiteResponseDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  tenantName: string;

  @ApiProperty({ type: () => SiteThemeDto })
  theme: SiteThemeDto;

  @ApiProperty()
  data: Record<string, unknown>;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  city?: string | null;

  @ApiPropertyOptional()
  address?: string | null;

  @ApiPropertyOptional()
  hours?: string | null;

  @ApiProperty({ type: () => [PublicMenuItemDto] })
  menuItems: PublicMenuItemDto[];
}

export class PublicSiteSingleResponseDto {
  @ApiProperty({ type: () => PublicSiteResponseDto })
  data: PublicSiteResponseDto;
}
