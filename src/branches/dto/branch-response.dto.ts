import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class BranchManagerSummaryDto {
  @ApiPropertyOptional()
  @Expose()
  membershipId: string | null;

  @ApiPropertyOptional()
  @Expose()
  name: string | null;

  @ApiPropertyOptional()
  @Expose()
  email: string | null;

  @ApiPropertyOptional()
  @Expose()
  phone: string | null;
}

export class BranchDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  tenantId: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional()
  @Expose()
  displayCode: string | null;

  @ApiProperty()
  @Expose()
  timezone: string;

  @ApiProperty()
  @Expose()
  serviceMode: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  createdAt: string;

  @ApiPropertyOptional({ type: () => BranchManagerSummaryDto })
  @Expose()
  @Type(() => BranchManagerSummaryDto)
  manager: BranchManagerSummaryDto | null;

  @ApiProperty()
  @Expose()
  tableCount: number;

  @ApiProperty()
  @Expose()
  stationCount: number;

  @ApiProperty()
  @Expose()
  staffCount: number;
}

export class BranchListResponseDto {
  @ApiProperty({ type: () => [BranchDto] })
  @Expose()
  @Type(() => BranchDto)
  data: BranchDto[];

  @ApiProperty()
  @Expose()
  maxBranches: number;

  @ApiProperty()
  @Expose()
  activeCount: number;
}

export class BranchResponseDto {
  @ApiProperty({ type: () => BranchDto })
  @Expose()
  @Type(() => BranchDto)
  data: BranchDto;
}
