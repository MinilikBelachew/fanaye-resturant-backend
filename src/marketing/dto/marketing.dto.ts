import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketingCampaignStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListMarketingCampaignsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ enum: MarketingCampaignStatus })
  @IsOptional()
  @IsEnum(MarketingCampaignStatus)
  status?: MarketingCampaignStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ description: 'Super admin filter by tenant' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class CreateMarketingCampaignDto {
  @ApiProperty()
  @IsUUID()
  menuItemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: 'Bole' })
  @IsString()
  @MaxLength(180)
  targetLocation!: string;

  @ApiProperty({ example: 18 })
  @Type(() => Number)
  @IsInt()
  @Min(13)
  @Max(99)
  targetAgeMin!: number;

  @ApiProperty({ example: 35 })
  @Type(() => Number)
  @IsInt()
  @Min(13)
  @Max(99)
  targetAgeMax!: number;

  @ApiProperty({ example: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(10000000)
  targetViews!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SubmitMarketingPaymentDto {
  @ApiProperty({ example: 'TXN-984312' })
  @IsString()
  @MaxLength(180)
  paymentReference!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentNotes?: string;
}

export class UpdateMarketingCampaignStatusDto {
  @ApiProperty({ enum: MarketingCampaignStatus })
  @IsEnum(MarketingCampaignStatus)
  status!: MarketingCampaignStatus;

  @ApiPropertyOptional({ example: 9500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  deliveredViews?: number;

  @ApiPropertyOptional({ example: 1500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountDue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}

