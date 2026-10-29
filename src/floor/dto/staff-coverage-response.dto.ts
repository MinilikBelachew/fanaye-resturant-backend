import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminShiftDefinitionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: '07:00' })
  startLocalTime: string;

  @ApiProperty({ example: '15:00' })
  endLocalTime: string;

  @ApiProperty()
  graceMinutes: number;

  @ApiProperty()
  status: string;
}

export class AdminStaffCoverageTableDto {
  @ApiProperty()
  tableId: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  displayNumber: string | null;

  @ApiProperty()
  locationName: string;
}

export class AdminStaffShiftCoverageDto {
  @ApiProperty()
  shiftDefinitionId: string;

  @ApiProperty()
  shiftName: string;

  @ApiPropertyOptional({ example: 'Mon' })
  dayCode?: string;

  @ApiProperty()
  startLocalTime: string;

  @ApiProperty()
  endLocalTime: string;

  @ApiProperty({ type: [AdminStaffCoverageTableDto] })
  tables: AdminStaffCoverageTableDto[];
}

export class AdminStaffDayShiftDto {
  @ApiProperty({ example: 'Mon' })
  dayCode: string;

  @ApiProperty()
  shiftDefinitionId: string;

  @ApiProperty()
  shiftName: string;

  @ApiProperty({ example: '07:00' })
  startLocalTime: string;

  @ApiProperty({ example: '15:00' })
  endLocalTime: string;
}

export class AdminStaffMemberDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  roleCode: string;

  @ApiProperty()
  roleLabel: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty({
    type: [String],
    example: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  })
  workingDays: string[];

  @ApiProperty({
    type: [AdminStaffDayShiftDto],
    description: 'Per-day shift windows for the weekly roster',
  })
  dayShifts: AdminStaffDayShiftDto[];

  @ApiPropertyOptional()
  phone: string | null;

  @ApiPropertyOptional()
  email: string | null;

  @ApiPropertyOptional()
  hasPin?: boolean;

  @ApiPropertyOptional()
  hasPassword?: boolean;

  @ApiPropertyOptional()
  stationId?: string | null;

  @ApiPropertyOptional()
  stationName?: string | null;

  @ApiPropertyOptional()
  branchId?: string | null;

  @ApiPropertyOptional()
  branchName?: string | null;

  @ApiProperty({ type: [AdminStaffShiftCoverageDto] })
  shiftCoverages: AdminStaffShiftCoverageDto[];

  @ApiPropertyOptional()
  joinedAt?: string | null;

  @ApiPropertyOptional()
  createdAt?: string | null;

  @ApiPropertyOptional()
  tablesCoveredCount?: number;

  @ApiPropertyOptional()
  shiftsCoveredCount?: number;

  @ApiPropertyOptional()
  employeeCode?: string | null;

  @ApiPropertyOptional()
  jobTitle?: string | null;

  @ApiPropertyOptional()
  employmentType?: string | null;

  @ApiPropertyOptional()
  payType?: string | null;

  @ApiPropertyOptional()
  basePay?: number | null;

  @ApiPropertyOptional()
  hireDate?: string | null;

  @ApiPropertyOptional()
  probationEndDate?: string | null;

  @ApiPropertyOptional()
  emergencyContactName?: string | null;

  @ApiPropertyOptional()
  emergencyContactPhone?: string | null;

  @ApiPropertyOptional()
  hrNotes?: string | null;

  @ApiPropertyOptional()
  annualLeaveBalanceDays?: number | null;

  @ApiPropertyOptional()
  photoId?: string | null;

  @ApiPropertyOptional()
  photoPath?: string | null;
}

export class AdminStaffDetailResponseDto {
  @ApiProperty({ type: AdminStaffMemberDto })
  data: AdminStaffMemberDto;
}

export class AdminStaffListResponseDto {
  @ApiProperty({ type: [AdminStaffMemberDto] })
  data: AdminStaffMemberDto[];

  @ApiProperty({ type: [AdminShiftDefinitionDto] })
  shifts: AdminShiftDefinitionDto[];
}

export class AdminStaffMemberResponseDto {
  @ApiProperty({ type: AdminStaffMemberDto })
  data: AdminStaffMemberDto;
}

export class AdminShiftDefinitionListResponseDto {
  @ApiProperty({ type: [AdminShiftDefinitionDto] })
  data: AdminShiftDefinitionDto[];
}

export class AdminShiftDefinitionResponseDto {
  @ApiProperty({ type: AdminShiftDefinitionDto })
  data: AdminShiftDefinitionDto;
}

export class AdminWaiterCoverageResponseDto {
  @ApiProperty()
  waiterMembershipId: string;

  @ApiProperty()
  shiftDefinitionId: string;

  @ApiPropertyOptional({ example: 'Mon' })
  dayCode?: string;

  @ApiProperty({ type: [String] })
  tableIds: string[];
}

export class AdminShiftFloorTableDto {
  @ApiProperty()
  tableId: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  displayNumber: string | null;

  @ApiProperty()
  locationId: string;

  @ApiProperty()
  locationName: string;

  @ApiPropertyOptional()
  assignedWaiterMembershipId: string | null;

  @ApiPropertyOptional()
  assignedWaiterName: string | null;
}

export class AdminShiftFloorLocationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: [AdminShiftFloorTableDto] })
  tables: AdminShiftFloorTableDto[];
}

export class AdminShiftFloorResponseDto {
  @ApiProperty()
  shiftDefinitionId: string;

  @ApiProperty()
  shiftName: string;

  @ApiPropertyOptional({ example: 'Mon' })
  dayCode?: string;

  @ApiProperty()
  startLocalTime: string;

  @ApiProperty()
  endLocalTime: string;

  @ApiProperty({ type: [AdminShiftFloorLocationDto] })
  locations: AdminShiftFloorLocationDto[];
}
