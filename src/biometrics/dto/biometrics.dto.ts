import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CustomerVipTier } from '@prisma/client';

export class UpdateCustomerBiometricDto {
  @ApiPropertyOptional({ example: 'Mr. Minilik' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: '+251911223344' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'minilik@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'Prefers corner table, likes spicy dishes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: CustomerVipTier, default: CustomerVipTier.REGULAR })
  @IsOptional()
  @IsEnum(CustomerVipTier)
  vipTier?: CustomerVipTier;
}

export class CreateCustomerBiometricDto {
  @ApiPropertyOptional({ example: 'Mr. Minilik' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: '+251911223344' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Prefers quiet booth' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: CustomerVipTier, default: CustomerVipTier.REGULAR })
  @IsOptional()
  @IsEnum(CustomerVipTier)
  vipTier?: CustomerVipTier;
}

export class CustomerBiometricQueryDto {
  @ApiPropertyOptional({ example: 'Minilik' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CustomerVipTier })
  @IsOptional()
  @IsEnum(CustomerVipTier)
  vipTier?: CustomerVipTier;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: "Filter by branch or ALL" })
  @IsOptional()
  @IsString()
  branchId?: string;
}

