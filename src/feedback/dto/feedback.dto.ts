import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitFeedbackDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'The shiro was amazing!' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ example: 'Selam' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({ example: '+251900000000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;
}

export class SubmitTableFeedbackDto extends SubmitFeedbackDto {
  @ApiPropertyOptional({ description: 'Optional active order id to link.' })
  @IsOptional()
  @IsString()
  orderId?: string;
}

export class SubmitFeedbackResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  id: string;

  @ApiProperty()
  message: string;
}

export class PublicFeedbackSummaryDto {
  @ApiProperty({ example: 4.6 })
  averageRating: number;

  @ApiProperty()
  totalCount: number;

  @ApiProperty({
    description: 'Counts keyed by star value ("1".."5").',
    example: { '1': 1, '2': 0, '3': 2, '4': 5, '5': 12 },
  })
  distribution: Record<string, number>;
}

export class FeedbackListQueryDto {
  @ApiPropertyOptional({ enum: ['NEW', 'READ', 'RESOLVED', 'ALL'] })
  @IsOptional()
  @IsIn(['NEW', 'READ', 'RESOLVED', 'ALL'])
  status?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ enum: ['QR_MENU', 'WEBSITE', 'ALL'] })
  @IsOptional()
  @IsIn(['QR_MENU', 'WEBSITE', 'ALL'])
  source?: string;

  @ApiPropertyOptional({ description: 'ISO date — only feedback on/after.' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date — only feedback on/before.' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Restrict to a single branch.' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateFeedbackStatusDto {
  @ApiProperty({ enum: ['NEW', 'READ', 'RESOLVED'] })
  @IsIn(['NEW', 'READ', 'RESOLVED'])
  status: string;
}

export class FeedbackItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  rating: number;

  @ApiPropertyOptional()
  comment?: string | null;

  @ApiPropertyOptional()
  customerName?: string | null;

  @ApiPropertyOptional()
  customerPhone?: string | null;

  @ApiProperty({ enum: ['QR_MENU', 'WEBSITE'] })
  source: string;

  @ApiProperty({ enum: ['NEW', 'READ', 'RESOLVED'] })
  status: string;

  @ApiPropertyOptional()
  branchId?: string | null;

  @ApiPropertyOptional()
  branchName?: string | null;

  @ApiPropertyOptional()
  tableName?: string | null;

  @ApiPropertyOptional()
  orderId?: string | null;

  @ApiProperty()
  createdAt: string;
}

export class FeedbackListMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class FeedbackSummaryDto {
  @ApiProperty({ example: 4.6 })
  averageRating: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  newCount: number;

  @ApiProperty()
  resolvedCount: number;

  @ApiProperty()
  lowRatingCount: number;

  @ApiProperty()
  last30DaysCount: number;

  @ApiProperty()
  distribution: Record<string, number>;

  @ApiProperty({ type: [Object] })
  byBranch: {
    branchId: string;
    branchName: string;
    averageRating: number;
    total: number;
  }[];
}

export class FeedbackListResponseDto {
  @ApiProperty({ type: [FeedbackItemDto] })
  data: FeedbackItemDto[];

  @ApiProperty({ type: FeedbackListMetaDto })
  meta: FeedbackListMetaDto;

  @ApiProperty({ type: FeedbackSummaryDto })
  summary: FeedbackSummaryDto;
}
