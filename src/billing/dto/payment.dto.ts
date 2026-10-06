import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
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

  @ApiPropertyOptional({
    description:
      'Optional if the receipt photo is sent. CBE Receipt ID or Telebirr txn number.',
    example: 'DJ58FLU9JE',
  })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  reference?: string;

  @ApiPropertyOptional({
    enum: [
      'cbe',
      'boa',
      'telebirr',
      'mpesa',
      'cbebirr',
      'dashen',
      'awash',
      'siinqee',
      'kaafiebirr',
    ],
    description: 'Bank/wallet for Verify.ET. Defaults from transferChannel.',
  })
  @IsOptional()
  @IsIn([
    'cbe',
    'boa',
    'telebirr',
    'mpesa',
    'cbebirr',
    'dashen',
    'awash',
    'siinqee',
    'kaafiebirr',
  ])
  bankProvider?:
    | 'cbe'
    | 'boa'
    | 'telebirr'
    | 'mpesa'
    | 'cbebirr'
    | 'dashen'
    | 'awash'
    | 'siinqee'
    | 'kaafiebirr';

  @ApiPropertyOptional({
    description: 'Required for Bank of Abyssinia (5 digits) and legacy CBE FT.',
  })
  @IsOptional()
  @Matches(/^\d{5,8}$/)
  accountSuffix?: string;

  @ApiPropertyOptional({
    description: 'Phone for CBE Birr verification (09… or 251…).',
  })
  @IsOptional()
  @Matches(/^(0|251)\d{9}$/)
  phoneNumber?: string;
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
