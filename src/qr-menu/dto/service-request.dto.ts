import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ServiceRequestType {
  CALL_WAITER = 'CALL_WAITER',
  REQUEST_WATER = 'REQUEST_WATER',
  REQUEST_BILL = 'REQUEST_BILL',
  EXTRA_NAPKINS = 'EXTRA_NAPKINS',
  ASSISTANCE = 'ASSISTANCE',
}

export class ServiceRequestDto {
  @ApiProperty({
    enum: ServiceRequestType,
    default: ServiceRequestType.CALL_WAITER,
  })
  @IsEnum(ServiceRequestType)
  type: ServiceRequestType;

  @ApiPropertyOptional({ example: 'Extra chili / Mitmita please' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ example: 'TELEBIRR' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}

export class ServiceRequestResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Waiter has been notified and is on the way!' })
  message: string;

  @ApiProperty()
  requestedAt: string;
}
