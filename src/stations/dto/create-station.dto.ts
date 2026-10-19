import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const STATION_WORKFLOW_MODES = ['FULL_PREP', 'QUICK_SERVE'] as const;
export type StationWorkflowMode = (typeof STATION_WORKFLOW_MODES)[number];

export class CreateStationDto {
  @ApiProperty({ example: 'Chips & Fryer' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'chips-fryer' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @ApiPropertyOptional({
    example: 'FULL_PREP',
    enum: STATION_WORKFLOW_MODES,
    description:
      'FULL_PREP = kitchen flow; QUICK_SERVE = bar/soft drinks ready in one step',
  })
  @IsOptional()
  @IsIn(STATION_WORKFLOW_MODES)
  workflowMode?: StationWorkflowMode;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  defaultDelayThresholdMinutes?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
