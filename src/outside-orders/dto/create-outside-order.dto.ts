import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum DestinationType {
  BUILDING = 'BUILDING',
  CAFE = 'CAFE',
  KIOSK = 'KIOSK',
  CAR = 'CAR',
  OTHER = 'OTHER',
}

export class CreateOutsideOrderDto {
  @ApiProperty({
    enum: DestinationType,
    default: DestinationType.BUILDING,
    description: 'Type of outside location',
  })
  @IsEnum(DestinationType)
  destinationType: DestinationType;

  @ApiProperty({
    example: 'Next Door Tower 3rd Floor, Room 302',
    description: 'Name or description of destination',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  destinationName: string;

  @ApiPropertyOptional({
    example: 'Leave at front reception desk',
    description: 'Special delivery note or instructions',
  })
  @IsOptional()
  @IsString()
  destinationNote?: string;

  @ApiPropertyOptional({
    example: 'Abebe Kebede',
    description: 'Customer contact name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({
    example: '+251911223344',
    description: 'Customer phone number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Whether materials (trays, plates, cutlery) issued must be returned',
  })
  @IsOptional()
  @IsBoolean()
  requiresMaterialReturn?: boolean;
}

export class UpdateOutsideOrderDto {
  @ApiPropertyOptional({ enum: DestinationType })
  @IsOptional()
  @IsEnum(DestinationType)
  destinationType?: DestinationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  destinationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destinationNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}
