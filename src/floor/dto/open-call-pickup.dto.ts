import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class OpenCallPickupDto {
  @ApiProperty({ example: 'Abebe Kebede' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  customerName: string;

  @ApiPropertyOptional({ example: '+251911000000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;
}
