import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class CashPaymentDto {
  @ApiProperty({ example: '280.00' })
  @IsNumberString()
  amount: string;

  @ApiProperty({ example: '300.00' })
  @IsNumberString()
  cashTendered: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedBillVersion: number;
}

export class TransferPaymentDto {
  @ApiProperty({ example: '280.00' })
  @IsNumberString()
  amount: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedBillVersion: number;

  @ApiProperty({ enum: ['TELEBIRR', 'BANK'] })
  @IsIn(['TELEBIRR', 'BANK'])
  transferChannel: 'TELEBIRR' | 'BANK';

  @ApiProperty({
    description: 'Uploaded receipt file id from POST /files/upload',
  })
  @IsUUID()
  fileId: string;
}

export class VerifyTransferDto {
  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED'] })
  @IsIn(['ACCEPTED', 'REJECTED'])
  decision: 'ACCEPTED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[\s\S]{0,500}$/)
  note?: string;
}
