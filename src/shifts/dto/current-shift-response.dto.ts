import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ShiftAssignmentSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  definitionName: string;

  @ApiProperty()
  @Expose()
  scheduledStartAt: Date;

  @ApiProperty()
  @Expose()
  scheduledEndAt: Date;

  @ApiPropertyOptional()
  @Expose()
  roleCode: string | null;
}

export class ShiftSessionDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  state: string;

  @ApiProperty()
  @Expose()
  version: number;

  @ApiProperty()
  @Expose()
  clockInAt: Date;

  @ApiPropertyOptional()
  @Expose()
  clockOutAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  scheduledStartAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  scheduledEndAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  definitionName: string | null;

  @ApiPropertyOptional()
  @Expose()
  roleCode: string | null;

  @ApiProperty()
  @Expose()
  branchId: string;

  @ApiPropertyOptional()
  @Expose()
  assignmentId: string | null;
}

export class ShiftTableSummaryDto {
  @ApiProperty()
  @Expose()
  tableId: string;

  @ApiProperty()
  @Expose()
  displayName: string;

  @ApiPropertyOptional()
  @Expose()
  displayNumber: string | null;

  @ApiProperty()
  @Expose()
  locationName: string;
}

export class WeeklyShiftPlanItemDto {
  @ApiProperty({ description: 'Mon | Tue | Wed | Thu | Fri | Sat | Sun' })
  @Expose()
  dayCode: string;

  @ApiProperty()
  @Expose()
  definitionName: string;

  @ApiProperty({ example: '10:00' })
  @Expose()
  startLocalTime: string;

  @ApiProperty({ example: '18:00' })
  @Expose()
  endLocalTime: string;

  @ApiProperty()
  @Expose()
  shiftDefinitionId: string;

  @ApiPropertyOptional({ type: [ShiftTableSummaryDto] })
  @Expose()
  tables?: ShiftTableSummaryDto[];
}

export class CurrentShiftResponseDto {
  @ApiProperty()
  @Expose()
  clockedIn: boolean;

  @ApiPropertyOptional({ type: () => ShiftSessionDto })
  @Expose()
  shiftSession: ShiftSessionDto | null;

  @ApiPropertyOptional({ type: () => ShiftAssignmentSummaryDto })
  @Expose()
  upcomingAssignment: ShiftAssignmentSummaryDto | null;

  @ApiProperty({ type: [WeeklyShiftPlanItemDto] })
  @Expose()
  weeklyPlan: WeeklyShiftPlanItemDto[];

  @ApiProperty({ type: [ShiftAssignmentSummaryDto] })
  @Expose()
  upcomingAssignments: ShiftAssignmentSummaryDto[];

  @ApiPropertyOptional({ type: [ShiftTableSummaryDto] })
  @Expose()
  assignedTables?: ShiftTableSummaryDto[];
}
