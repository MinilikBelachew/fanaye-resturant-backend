import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CancelOrderItemDto {
  @ApiProperty({ example: 'Customer changed mind' })
  @IsString()
  @MaxLength(1000)
  reason: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RequestedChangeDto {
  @ApiPropertyOptional({
    description: 'Swap to a different menu item (e.g. pizza → burger)',
  })
  @IsOptional()
  @IsUUID()
  menuItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specialInstruction?: string | null;
}

export class CreateChangeRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiProperty({ type: RequestedChangeDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RequestedChangeDto)
  requestedChange: RequestedChangeDto;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class DecideCancellationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionReason?: string;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedOrderItemVersion: number;
}

export class DecideChangeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionReason?: string;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedOrderItemVersion: number;
}
