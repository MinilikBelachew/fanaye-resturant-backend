import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScannedMenuItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(180)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: '250.00' })
  @IsNumberString()
  price: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  preparationStationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  suggestedStationName?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPrepMinutes?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  selected?: boolean;
}

export class MenuScanPreviewResponseDto {
  @ApiProperty({ type: [ScannedMenuItemDto] })
  data: ScannedMenuItemDto[];

  @ApiPropertyOptional()
  rawText?: string | null;

  @ApiProperty()
  itemCount: number;
}

export class ImportScannedMenuDto {
  @ApiProperty({ type: [ScannedMenuItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScannedMenuItemDto)
  items: ScannedMenuItemDto[];
}

export class ImportScannedMenuResponseDto {
  @ApiProperty()
  createdCount: number;

  @ApiProperty({ type: [String] })
  createdIds: string[];

  @ApiPropertyOptional({ type: [String] })
  errors?: string[];
}
