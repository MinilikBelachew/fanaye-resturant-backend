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

  @ApiProperty()
  startLocalTime: string;

  @ApiProperty()
  endLocalTime: string;

  @ApiProperty({ type: [AdminStaffCoverageTableDto] })
  tables: AdminStaffCoverageTableDto[];
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

  @ApiPropertyOptional()
  phone: string | null;

  @ApiPropertyOptional()
  email: string | null;

  @ApiProperty({ type: [AdminStaffShiftCoverageDto] })
  shiftCoverages: AdminStaffShiftCoverageDto[];
}

export class AdminStaffListResponseDto {
  @ApiProperty({ type: [AdminStaffMemberDto] })
  data: AdminStaffMemberDto[];

  @ApiProperty({ type: [AdminShiftDefinitionDto] })
  shifts: AdminShiftDefinitionDto[];
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

  @ApiProperty()
  startLocalTime: string;

  @ApiProperty()
  endLocalTime: string;

  @ApiProperty({ type: [AdminShiftFloorLocationDto] })
  locations: AdminShiftFloorLocationDto[];
}
