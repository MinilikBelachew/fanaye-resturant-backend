import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTestimonialDto {
  @ApiProperty({ example: 'Selamawit Bekele' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  authorName: string;

  @ApiProperty({ example: 'Owner & General Manager' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  authorRole: string;

  @ApiProperty({ example: 'Yod Abyssinia Cultural Kitchen' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  restaurantName: string;

  @ApiProperty({
    example:
      'Restorch cut our kitchen ticket wait times in half and gave us clean Telebirr and cash Z-Reports every night.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(800)
  quote: string;

  @ApiPropertyOptional({ example: '/images/testimonials/owner-1.jpg' })
  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateTestimonialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  authorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  authorRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  restaurantName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(800)
  quote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

