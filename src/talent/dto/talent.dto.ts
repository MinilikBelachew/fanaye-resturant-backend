import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TalentAvailability,
  TalentProfileStatus,
  TalentRequestStatus,
  TalentRoleCategory,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListTalentProfilesQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 12;

  @ApiPropertyOptional({ enum: TalentRoleCategory })
  @IsOptional()
  @IsEnum(TalentRoleCategory)
  roleCategory?: TalentRoleCategory;

  @ApiPropertyOptional({ enum: TalentAvailability })
  @IsOptional()
  @IsEnum(TalentAvailability)
  availability?: TalentAvailability;

  @ApiPropertyOptional({ enum: TalentProfileStatus })
  @IsOptional()
  @IsEnum(TalentProfileStatus)
  status?: TalentProfileStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateTalentProfileDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  fullName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiProperty({ enum: TalentRoleCategory })
  @IsEnum(TalentRoleCategory)
  roleCategory!: TalentRoleCategory;

  @ApiProperty({ example: 'Senior Ethiopian Grill Chef' })
  @IsString()
  @MaxLength(120)
  roleTitle!: string;

  @ApiProperty({ example: 'Bole' })
  @IsString()
  @MaxLength(180)
  location!: string;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  yearsExperience!: number;

  @ApiPropertyOptional({ enum: TalentAvailability, default: 'FULL_TIME' })
  @IsOptional()
  @IsEnum(TalentAvailability)
  availability?: TalentAvailability;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}

export class UpdateTalentProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ enum: TalentRoleCategory })
  @IsOptional()
  @IsEnum(TalentRoleCategory)
  roleCategory?: TalentRoleCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  yearsExperience?: number;

  @ApiPropertyOptional({ enum: TalentAvailability })
  @IsOptional()
  @IsEnum(TalentAvailability)
  availability?: TalentAvailability;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ enum: TalentProfileStatus })
  @IsOptional()
  @IsEnum(TalentProfileStatus)
  status?: TalentProfileStatus;
}

export class ListTalentRequestsQueryDto {
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

  @ApiPropertyOptional({ enum: TalentRequestStatus })
  @IsOptional()
  @IsEnum(TalentRequestStatus)
  status?: TalentRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateTalentContactRequestDto {
  @ApiProperty()
  @IsUUID()
  talentProfileId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class HireTalentToStaffDto {
  @ApiProperty()
  @IsUUID()
  talentProfileId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ example: 'WAITER' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  roleCode?: string;

  @ApiPropertyOptional({ example: '1234' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateTalentRequestStatusDto {
  @ApiProperty({ enum: TalentRequestStatus })
  @IsEnum(TalentRequestStatus)
  status!: TalentRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}

