import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateQrSlugDto {
  @ApiProperty({ example: 'fanaye-rooftop' })
  @IsString()
  @MinLength(2)
  slug!: string;
}
