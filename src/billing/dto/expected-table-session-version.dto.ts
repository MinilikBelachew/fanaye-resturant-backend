import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min, ValidateIf } from 'class-validator';

/** Table-session bill request / generate body. */
export class ExpectedTableSessionVersionDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedTableSessionVersion: number;
}

/** Room-session bill request body. */
export class ExpectedRoomSessionVersionDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRoomSessionVersion: number;
}

/**
 * Cashier generate-bill body: exactly one of the expected versions
 * (matches the session type on the BillRequest).
 */
export class ExpectedSessionVersionDto {
  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((o: ExpectedSessionVersionDto) => !o.expectedRoomSessionVersion)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedTableSessionVersion?: number;

  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((o: ExpectedSessionVersionDto) => !o.expectedTableSessionVersion)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRoomSessionVersion?: number;
}
