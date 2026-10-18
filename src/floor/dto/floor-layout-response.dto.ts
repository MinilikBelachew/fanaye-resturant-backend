import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminWaiterOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class AdminDiningTableDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  locationId: string;

  @ApiProperty()
  locationName: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  displayNumber: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  sortOrder: number;

  @ApiPropertyOptional()
  assignedWaiterMembershipId: string | null;

  @ApiPropertyOptional()
  assignedWaiterName: string | null;

  @ApiProperty({ description: 'Table-level VIP flag' })
  isVip: boolean;

  @ApiProperty({
    description: 'True when this table or its place is VIP',
  })
  effectiveVip: boolean;

  @ApiProperty()
  version: number;
}

export class AdminTableLocationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  isVip: boolean;

  @ApiProperty({ type: [AdminDiningTableDto] })
  tables: AdminDiningTableDto[];
}

export class AdminFloorLayoutResponseDto {
  @ApiProperty({ type: [AdminTableLocationDto] })
  data: AdminTableLocationDto[];

  @ApiProperty({ type: [AdminWaiterOptionDto] })
  waiters: AdminWaiterOptionDto[];
}

export class AdminTableLocationResponseDto {
  @ApiProperty({ type: AdminTableLocationDto })
  data: AdminTableLocationDto;
}

export class AdminDiningTableResponseDto {
  @ApiProperty({ type: AdminDiningTableDto })
  data: AdminDiningTableDto;
}
