import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsInt, Min } from 'class-validator';

export class ClockInDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shiftAssignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  roleId?: number;
}
