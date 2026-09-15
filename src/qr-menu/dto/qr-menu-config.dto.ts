import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class QrMenuConfigDto {
  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4' })
  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;

  @ApiPropertyOptional({ example: 'Welcome to Fanaye Rooftop & Lounge' })
  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @ApiPropertyOptional({ example: 'Craft cocktails, specialty Ethiopian buna, and fire-grilled tibs' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ example: 'Fanaye_Guest' })
  @IsOptional()
  @IsString()
  wifiSsid?: string;

  @ApiPropertyOptional({ example: 'buna2026' })
  @IsOptional()
  @IsString()
  wifiPassword?: string;

  @ApiPropertyOptional({ type: [String], example: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  featuredItemIds?: string[];

  @ApiPropertyOptional({ default: true, example: true })
  @IsOptional()
  @IsBoolean()
  allowGuestOrders?: boolean;

  @ApiPropertyOptional({ default: true, example: true })
  @IsOptional()
  @IsBoolean()
  autoSendToKitchen?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['FASTING', 'VEGETARIAN', 'SPICY', 'CHEF_PICK'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledDietaryTags?: string[];
}

export class UpdateQrMenuConfigDto extends QrMenuConfigDto {}
