import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ExpectedVersionDto } from './expected-version.dto';

export class ReportCannotPrepareDto extends ExpectedVersionDto {
  @ApiPropertyOptional({ example: 'INGREDIENT_UNAVAILABLE' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reasonCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reasonDetail?: string;

  @ApiPropertyOptional({
    description:
      'Also mark the menu item sold out so waiters cannot re-order it',
  })
  @IsOptional()
  @IsBoolean()
  markSoldOut?: boolean;
}
