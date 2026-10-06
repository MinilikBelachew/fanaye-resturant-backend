import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBranchManagerDto {
  @ApiProperty({ example: 'Hana Tadesse' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'hana@restaurant.et' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+251911000000' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}

export class CreateBranchDto {
  @ApiProperty({ example: 'Bole Branch' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ example: 'BOLE-1' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayCode?: string;

  @ApiPropertyOptional({ example: 'Africa/Addis_Ababa' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @ApiPropertyOptional({
    enum: ['RESTAURANT', 'BAKERY'],
    default: 'RESTAURANT',
  })
  @IsOptional()
  @IsIn(['RESTAURANT', 'BAKERY'])
  serviceMode?: string;

  @ApiPropertyOptional({
    description: 'Copy stations and a blank main floor from another branch',
  })
  @IsOptional()
  @IsUUID()
  copyFromBranchId?: string;

  @ApiPropertyOptional({ description: 'Seed this many dining tables (1-60)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  tableCount?: number;

  @ApiProperty({ type: () => CreateBranchManagerDto })
  @ValidateNested()
  @Type(() => CreateBranchManagerDto)
  manager!: CreateBranchManagerDto;

  @ApiPropertyOptional({
    description: 'Required for platform super-admin creating under a tenant',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayCode?: string;

  @ApiPropertyOptional({ enum: ['RESTAURANT', 'BAKERY'] })
  @IsOptional()
  @IsIn(['RESTAURANT', 'BAKERY'])
  serviceMode?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class SwitchBranchDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;
}

export class BranchListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  activeOnly?: boolean;
}
