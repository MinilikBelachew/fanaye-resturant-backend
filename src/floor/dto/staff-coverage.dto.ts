import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateShiftDefinitionDto {
  @ApiProperty({ example: 'Brunch' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '10:00', description: 'HH:mm local time' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startLocalTime: string;

  @ApiProperty({ example: '16:00', description: 'HH:mm local time' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endLocalTime: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceMinutes?: number;
}

export class UpdateShiftDefinitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startLocalTime?: string;

  @ApiPropertyOptional({ example: '16:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endLocalTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceMinutes?: number;
}

export class SetWaiterTableCoverageDto {
  @ApiProperty()
  @IsUUID()
  shiftDefinitionId: string;

  @ApiProperty({ type: [String], description: 'Dining table ids for this shift' })
  @IsArray()
  @IsUUID('4', { each: true })
  tableIds: string[];
}
