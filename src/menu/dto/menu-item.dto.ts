import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ModifierOptionInputDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: '0.00' })
  @IsOptional()
  @IsNumberString()
  priceDelta?: string;
}

export class ModifierGroupInputDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: ['included', 'extra', 'choice'] })
  @IsOptional()
  @IsIn(['included', 'extra', 'choice'])
  kind?: 'included' | 'extra' | 'choice';

  @ApiProperty({ type: [ModifierOptionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierOptionInputDto)
  options: ModifierOptionInputDto[];
}

export class CreateMenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  menuId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Find or create category by name when categoryId omitted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryName?: string;

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

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @ApiProperty()
  @IsUUID()
  preparationStationId: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPrepMinutes?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  periodIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  modifierGroupIds?: string[];

  @ApiPropertyOptional({ type: [ModifierGroupInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierGroupInputDto)
  modifierGroups?: ModifierGroupInputDto[];

  @ApiPropertyOptional({
    description: 'false = sold out / not active on floor',
  })
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional({
    description: 'Client-only image key (burger, pizza, …)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  imageKey?: string;

  @ApiPropertyOptional({
    description: 'Uploaded file id from POST /files/upload',
  })
  @IsOptional()
  @IsUUID()
  imageFileId?: string;
}

export class UpdateMenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '250.00' })
  @IsOptional()
  @IsNumberString()
  price?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  preparationStationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPrepMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiPropertyOptional({ type: [ModifierGroupInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierGroupInputDto)
  modifierGroups?: ModifierGroupInputDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  modifierGroupIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  imageKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;
}

export class CreateModifierGroupDto extends ModifierGroupInputDto {}
