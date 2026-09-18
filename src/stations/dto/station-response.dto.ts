import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StationManagementResponseDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id: string;

  @ApiProperty({ example: 'Kitchen' })
  name: string;

  @ApiPropertyOptional({ example: 'kitchen' })
  code?: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiPropertyOptional({ example: 10 })
  defaultDelayThresholdMinutes?: number | null;

  @ApiPropertyOptional({ example: 10 })
  avgPrepMin?: number;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ example: 5 })
  ticketCount: number;

  @ApiProperty({ example: 12 })
  menuItemCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
