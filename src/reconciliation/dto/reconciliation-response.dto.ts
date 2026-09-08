import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReconciliationPreviewDto {
  @ApiProperty()
  cashierFinancialSessionId: string;

  @ApiProperty()
  openingFloat: string;

  @ApiProperty()
  cashDropsReceived: string;

  @ApiProperty()
  otherInflows: string;

  @ApiProperty()
  otherOutflows: string;

  @ApiProperty()
  expectedCash: string;

  @ApiProperty()
  currencyCode: string;

  @ApiPropertyOptional()
  existingReconciliationId?: string | null;

  @ApiPropertyOptional()
  existingStatus?: string | null;

  @ApiPropertyOptional()
  existingCountedCash?: string | null;

  @ApiPropertyOptional()
  existingVariance?: string | null;
}

export class ReconciliationPreviewResponseDto {
  @ApiProperty({ type: ReconciliationPreviewDto })
  data: ReconciliationPreviewDto;
}

export class ReconciliationReviewDto {
  @ApiPropertyOptional()
  reviewedAt: Date | null;

  @ApiPropertyOptional()
  reviewComment: string | null;

  @ApiPropertyOptional()
  reviewedByMembershipId: string | null;
}

export class ReconciliationDto {
  @ApiProperty()
  reconciliationId: string;

  @ApiProperty()
  cashierFinancialSessionId: string;

  @ApiProperty()
  expectedCash: string;

  @ApiProperty()
  countedCash: string;

  @ApiProperty()
  variance: string;

  @ApiProperty()
  currencyCode: string;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  cashierComment: string | null;

  @ApiProperty()
  submittedAt: Date;

  @ApiPropertyOptional({ type: ReconciliationReviewDto })
  review: ReconciliationReviewDto | null;

  @ApiProperty()
  version: number;

  @ApiPropertyOptional()
  cashierName?: string;

  @ApiPropertyOptional()
  businessDate?: string;
}

export class ReconciliationSubmitResponseDto {
  @ApiProperty({ type: ReconciliationDto })
  data: ReconciliationDto;
}

export class ReconciliationListResponseDto {
  @ApiProperty({ type: [ReconciliationDto] })
  data: ReconciliationDto[];
}
