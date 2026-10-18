import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CloseTableSessionDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ForceCloseSessionDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ example: 'Abandoned at daily close' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
